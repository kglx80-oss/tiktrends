'use server';

import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { storageFromEnv, putBucketPublicRead, putBucketCors, storageSelfTest, putObject, newAssetKey } from '@tiktrends/integrations';
import { typeMediaReel, typeMediaDebutBase64, DEBUT_BASE64_SIGNATURE } from '@tiktrends/core';
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
    // Même filtre que la migration (`candidatsMigration`) · une image que la
    // migration ne copiera jamais (SVG, forme inattendue) n'est pas « restante ».
    let restantes = 0;
    let octets = 0;
    let apres: string | null = null;
    for (;;) {
      const page = await candidatsMigration(s.workspaceId, apres);
      for (const c of page.migrables) { restantes++; octets += c.longueur; }
      if (!page.suite) break;
      apres = page.suite;
    }

    return {
      etat: {
        restantes,
        // Base64 pèse un tiers de plus que les octets qu'il transporte.
        poidsMo: Math.round((octets * 0.75) / 1_048_576 * 10) / 10,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('storage:embedded-status', e, { subject: 'le décompte des images', workspaceId: s.workspaceId }) };
  }
}

/** Assez pour avancer vite, assez peu pour qu'un échec ne coûte pas une minute. */
const PAR_LOT = 25;
/** Lignes lues par page de tri (début base64 seulement, jamais le contenu). */
const PAR_PAGE = 200;

/**
 * Une page d'images embarquées de l'espace, triées par `id` après `apres`
 * (pagination `id > dernier`) · seules sont retenues celles que la migration
 * copiera VRAIMENT : `data:` en base64 dont le début se lit comme un type servi
 * (`typeMediaDebutBase64`, même règle que `typeMediaReel`). On ne lit que les
 * `DEBUT_BASE64_SIGNATURE` premiers caractères et la longueur · un SVG déguisé
 * en tête de table ne bloque plus le lot, et le décompte dit la même chose.
 */
async function candidatsMigration(workspaceId: string, apres: string | null): Promise<{ migrables: Array<{ id: string; longueur: number }>; suite: string | null }> {
  const conds = [
    eq(schema.assets.workspaceId, workspaceId),
    sql`${schema.assets.url} like 'data:%'`,
    sql`substr(${schema.assets.url}, 1, position(',' in ${schema.assets.url})) ilike '%;base64,'`,
  ];
  if (apres) conds.push(gt(schema.assets.id, apres));
  const page = await db!.select({
    id: schema.assets.id,
    debut: sql<string>`substr(${schema.assets.url}, position(',' in ${schema.assets.url}) + 1, ${DEBUT_BASE64_SIGNATURE})`,
    longueur: sql<number>`length(${schema.assets.url})`,
  })
    .from(schema.assets).where(and(...conds))
    .orderBy(asc(schema.assets.id)).limit(PAR_PAGE);
  return {
    migrables: page.filter((p) => typeMediaDebutBase64(p.debut)).map((p) => ({ id: p.id, longueur: Number(p.longueur) })),
    suite: page.length === PAR_PAGE ? page[page.length - 1]!.id : null,
  };
}

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
    // Les PAR_LOT premières images MIGRABLES, page après page (`id > dernier`).
    const ids: string[] = [];
    let apres: string | null = null;
    while (ids.length < PAR_LOT) {
      const page = await candidatsMigration(s.workspaceId, apres);
      ids.push(...page.migrables.slice(0, PAR_LOT - ids.length).map((c) => c.id));
      if (!page.suite) break;
      apres = page.suite;
    }

    let migrees = 0;
    for (const id of ids) {
      const [a] = await db.select({ id: schema.assets.id, name: schema.assets.name, url: schema.assets.url })
        .from(schema.assets).where(and(eq(schema.assets.id, id), eq(schema.assets.workspaceId, s.workspaceId))).limit(1);
      if (!a) continue;
      const virgule = a.url.indexOf(',');
      const entete = virgule > 0 ? a.url.slice(5, virgule) : '';
      if (!entete.endsWith(';base64')) continue;   // forme inattendue · on la laisse

      const octets = Buffer.from(a.url.slice(virgule + 1), 'base64');
      if (!octets.length) continue;
      // Le type posé sur l'objet se relit dans les OCTETS · un SVG ancien
      // (préfixe `data:image/svg+xml`) n'est pas copié vers le bucket, il reste
      // en base, non servi, comme toute forme inattendue.
      const mime = typeMediaReel(octets);
      if (!mime) continue;

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

    const bilan = await embeddedImagesStatusAction();
    return { migrees, restantes: bilan.etat?.restantes ?? 0 };
  } catch (e) {
    return { error: logAndTranslate('storage:embedded-migrate', e, { subject: 'le déplacement des images', workspaceId: s.workspaceId }) };
  }
}
