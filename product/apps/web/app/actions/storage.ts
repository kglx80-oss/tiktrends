'use server';

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, putBucketPublicRead, putBucketCors, storageSelfTest, putObject, newAssetKey } from '@tiktrends/integrations';
import { logAndTranslate } from '../../lib/error-log';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { GUARD } from '../../lib/guard-error';

function appOrigins(): string[] {
  const out = new Set<string>();
  const app = process.env.APP_URL?.replace(/\/+$/, '');
  if (app) out.add(app);
  out.add('https://app.tiktrends.co');
  return [...out];
}

/** Applique lecture publique + CORS sur le bucket (une fois les clés posées). Admin+. */
export async function configureBucketAction(): Promise<{ ok?: true; steps?: Array<{ label: string; ok: boolean; detail: string }>; error?: string }> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'admin')) return { error: GUARD.role({ needRole: 'admin' }) };
  const cfg = storageFromEnv();
  if (!cfg) return { error: 'Clés S3 absentes du serveur (.env.deploy).' };

  const origins = appOrigins();
  const steps: Array<{ label: string; ok: boolean; detail: string }> = [];
  try {
    const pol = await putBucketPublicRead(cfg);
    steps.push({ label: 'Lecture publique (bucket policy)', ok: pol.ok, detail: pol.ok ? 'OK' : `HTTP ${pol.status} · ${pol.detail}` });
    const cors = await putBucketCors(cfg, origins);
    steps.push({ label: `CORS (${origins.join(', ')})`, ok: cors.ok, detail: cors.ok ? 'OK' : `HTTP ${cors.status} · ${cors.detail}` });
    return { ok: true, steps };
  } catch (e) {
    return { error: (e as Error).message, steps };
  }
}

/** Test bout en bout du stockage (upload -> lecture publique -> suppression). Admin+. */
export async function testStorageAction(): Promise<{ put?: boolean; publicRead?: boolean; deleted?: boolean; error?: string }> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'admin')) return { error: GUARD.role({ needRole: 'admin' }) };
  const cfg = storageFromEnv();
  if (!cfg) return { error: 'Clés S3 absentes du serveur (.env.deploy).' };
  const r = await storageSelfTest(cfg);
  return { put: r.put, publicRead: r.publicRead, deleted: r.deleted, error: r.error };
}

/* -------------------------------------------------------------------------- */
/*  Sortir les images de la base                                              */
/* -------------------------------------------------------------------------- */

export interface MigrationEtat {
  /** Images dont les octets dorment encore dans la colonne `url`. */
  restantes: number;
  /** Poids approximatif de ce qui reste, en mégaoctets. */
  poidsMo: number;
}

/**
 * Combien d'images vivent encore dans la base.
 *
 * Le proxy `/api/asset/[id]` a réglé le symptôme · la page ne transporte plus
 * les octets. Il n'a rien réglé de la cause : ils sont toujours dans Postgres,
 * ce qui alourdit la base, chaque sauvegarde, et chaque requête qui touche la
 * table même quand elle ne demande pas la colonne.
 *
 * Le compte est fait en SQL, avec `length()` · lire les lignes pour peser leur
 * contenu serait reproduire exactement le défaut qu'on cherche à sortir.
 */
export async function embeddedImagesStatusAction(): Promise<{ etat?: MigrationEtat; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'admin')) return { error: GUARD.role({ needRole: 'admin' }) };

  try {
    const [r] = await db.select({
      n: sql<number>`count(*)`,
      octets: sql<number>`coalesce(sum(length(${schema.assets.url})), 0)`,
    })
      .from(schema.assets)
      .where(and(
        eq(schema.assets.workspaceId, s.workspaceId),
        sql`${schema.assets.url} like 'data:%'`,
      ));

    return {
      etat: {
        restantes: Number(r?.n ?? 0),
        // Base64 pèse un tiers de plus que les octets qu'il transporte.
        poidsMo: Math.round((Number(r?.octets ?? 0) * 0.75) / 1_048_576 * 10) / 10,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('storage:embedded-status', e, { subject: 'le décompte des images', workspaceId: s.workspaceId }) };
  }
}

/** Assez pour avancer vite, assez peu pour qu'un échec ne coûte pas une minute. */
const PAR_LOT = 25;

/**
 * Déplace un lot d'images de la base vers le bucket.
 *
 * ── Par lots, et déclenché à la main ─────────────────────────────────────────
 *
 * Une bibliothèque entière peut peser plusieurs gigaoctets. Faire ça en tâche de
 * fond au premier chargement de page transformerait une visite anodine en
 * transfert de plusieurs minutes, et personne n'aurait rien demandé.
 *
 * ── Idempotent et reprenable ─────────────────────────────────────────────────
 *
 * Chaque image est traitée seule : téléversée, puis sa ligne mise à jour. Une
 * coupure au milieu laisse un objet orphelin dans le bucket — quelques
 * kilo-octets — jamais une image perdue. L'ordre inverse (écrire la ligne, puis
 * téléverser) aurait donné exactement le contraire, et c'est l'inverse qu'il
 * faut : mieux vaut un fichier en trop qu'une image qui n'existe plus.
 */
export async function migrateEmbeddedImagesAction(): Promise<{ migrees?: number; restantes?: number; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'admin')) return { error: GUARD.role({ needRole: 'admin' }) };

  const cfg = storageFromEnv();
  if (!cfg) return { error: 'Clés S3 absentes du serveur · rien à faire tant que le bucket n’existe pas.' };

  try {
    const lot = await db.select({ id: schema.assets.id, name: schema.assets.name, url: schema.assets.url })
      .from(schema.assets)
      .where(and(
        eq(schema.assets.workspaceId, s.workspaceId),
        sql`${schema.assets.url} like 'data:%'`,
      ))
      .limit(PAR_LOT);

    let migrees = 0;
    for (const a of lot) {
      const virgule = a.url.indexOf(',');
      const entete = virgule > 0 ? a.url.slice(5, virgule) : '';
      if (!entete.endsWith(';base64')) continue;   // forme inattendue · on la laisse

      const mime = entete.replace(';base64', '') || 'image/jpeg';
      const octets = Buffer.from(a.url.slice(virgule + 1), 'base64');
      if (!octets.length) continue;

      try {
        const url = await putObject(cfg, newAssetKey(s.workspaceId, a.name || 'image'), octets, mime);
        // La ligne n'est réécrite qu'une fois le fichier en place · une coupure
        // laisse au pire un objet orphelin, jamais une image introuvable.
        await db.update(schema.assets)
          .set({ url, source: 'upload', mimeType: mime, sizeBytes: octets.length })
          .where(eq(schema.assets.id, a.id));
        migrees++;
      } catch {
        // Une image qui résiste ne doit pas arrêter le lot · elle repassera.
      }
    }

    const apres = await embeddedImagesStatusAction();
    return { migrees, restantes: apres.etat?.restantes ?? 0 };
  } catch (e) {
    return { error: logAndTranslate('storage:embedded-migrate', e, { subject: 'le déplacement des images', workspaceId: s.workspaceId }) };
  }
}
