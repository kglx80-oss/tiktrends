import { createHash } from 'node:crypto';
import {
  schema, eq, and, or, isNull, reserverDepense, annulerDepense, type BaseDepense,
} from '@tiktrends/db';
import {
  decisionFournisseurStudio, requeteFalImage, lireParametresImage, lireSnapshotJob, operationsDuSnapshot, operationsMediaDuJob,
  estParametresClip, lireParametresClip, requeteFalAnimation,
  photosDuProduit, empreinteAdresse, idLogoMarque, estEmpreinte, estParametresRetouche, lireParametresRetouche, requeteFalRetouche,
  type DecisionFournisseur, type DemandeFournisseur, type EmpreinteFichier, type FournisseurStudio, type MediaResolu, type RequeteFal, type StockageStudio,
} from '@tiktrends/core';
import {
  FournisseurFal, BarriereDepenseStudio, storageFromEnv, putObject, publicUrlFor,
  type PortDepense, type PreparationFal, type StorageConfig,
} from '@tiktrends/integrations';
import { demarrerBoucleStudio } from './boucle';
import { relireMasque } from './retouche';
import type { BaseStudio } from './types';

/**
 * Studios · F-A · branchement du fournisseur RÉEL au moteur L3.
 *
 * Choix (règle pure `decisionFournisseurStudio`) : fal réel seulement avec une
 * vraie `FAL_KEY`, en production ou sur autorisation explicite
 * (`STUDIO_FOURNISSEUR_REEL=autorise`), et avec le stockage objet configuré.
 * Sinon : aucun worker studio, jobs laissés en file, rien facturé. Ce module
 * n'importe JAMAIS le fournisseur simulé (`studios-simule.ts`) · une garde de
 * test le vérifie.
 *
 * Ici vit ce qui touche la base : relire l'instantané du job, résoudre les
 * médias AUTORISÉS au moment de soumettre (révocation, remplacement), tracer
 * l'empreinte du corps expurgé, et réaliser le port de la barrière de dépense
 * sur `ai_spend`. Les décisions restent dans le noyau.
 */

/* ───────────────────────── Barrière sur `ai_spend` ────────────────────────── */

export function portDepenseBase(base: BaseStudio): PortDepense {
  const b = base as unknown as BaseDepense;
  return {
    reserver: (ligne, o) => reserverDepense(b, ligne, o),
    annuler: (id) => annulerDepense(b, id),
  };
}

/* ───────────────────────── Médias autorisés ──────────────────────────────── */

const DATA_URI = /^data:([a-z0-9.+/-]+);base64,/i;
/** Même empreinte que le catalogue L5 (`hacherImage`) : octets d'une data URI, sinon adresse. */
export function hacherImage(url: string): EmpreinteFichier {
  const m = DATA_URI.exec(url);
  if (m) return { sha256: createHash('sha256').update(Buffer.from(url.slice(m[0].length), 'base64')).digest('hex'), nature: 'contenu' };
  return empreinteAdresse(url);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Relit chaque référence dans le catalogue de la MARQUE DU JOB, maintenant ·
 * un fichier retiré, d'une autre marque, ou non stocké est `absent` ; une
 * source concurrente n'a pas de média transmissible (`sans_media`). La règle
 * pure compare ensuite l'empreinte à celle du devis.
 */
export async function resoudreMedias(
  base: BaseStudio,
  job: { workspaceId: string; brandId: string },
  ids: readonly string[],
  stockage: StorageConfig | null,
): Promise<MediaResolu[]> {
  const out: MediaResolu[] = [];
  const absent = (assetId: string): MediaResolu => ({ assetId, etat: 'absent', motif: 'retirée du catalogue de la marque, hors portée ou non stockée' });
  let photos: Map<string, { url: string; sha256: string }> | null = null;
  let logos: Map<string, { url: string; sha256: string }> | null = null;

  for (const id of ids) {
    if (id.startsWith('pph_')) {
      if (!photos) {
        photos = new Map();
        const P = schema.products;
        const lignes = await base.select({ id: P.id, name: P.name, imageUrl: P.imageUrl, imageUrls: P.imageUrls })
          .from(P).innerJoin(schema.brands, eq(schema.brands.id, P.brandId))
          .where(and(eq(P.brandId, job.brandId), eq(schema.brands.workspaceId, job.workspaceId)));
        for (const l of lignes) for (const ph of photosDuProduit(l, hacherImage)) photos.set(ph.assetId, { url: ph.url, sha256: ph.sha256 });
      }
      const p = photos.get(id);
      out.push(p ? { assetId: id, etat: 'autorise', url: p.url, sha256: p.sha256 } : absent(id));
    } else if (id.startsWith('logo_')) {
      if (!logos) {
        logos = new Map();
        const [m] = await base.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos }).from(schema.brands)
          .where(and(eq(schema.brands.id, job.brandId), eq(schema.brands.workspaceId, job.workspaceId))).limit(1);
        for (const url of [m?.logoUrl, ...(m?.logos ?? [])]) {
          if (typeof url !== 'string' || !url) continue;
          const e = hacherImage(url);
          logos.set(idLogoMarque(job.brandId, e.sha256), { url, sha256: e.sha256 });
        }
      }
      const l = logos.get(id);
      out.push(l ? { assetId: id, etat: 'autorise', url: l.url, sha256: l.sha256 } : absent(id));
    } else if (id.startsWith('sta_') && UUID.test(id.slice(4))) {
      const S = schema.studioAssets;
      const [m] = await base.select({ storageKey: S.storageKey, sha256: S.sha256, mime: S.mime }).from(S)
        .where(and(eq(S.id, id.slice(4)), eq(S.workspaceId, job.workspaceId), eq(S.brandId, job.brandId), eq(S.storageState, 'stored'))).limit(1);
      if (!m || !m.mime.startsWith('image/') || !estEmpreinte(m.sha256) || m.storageKey.startsWith('simule/')) out.push(absent(id));
      else if (!stockage) out.push({ assetId: id, etat: 'sans_media', motif: 'stockage objet non configuré' });
      else out.push({ assetId: id, etat: 'autorise', url: publicUrlFor(stockage, m.storageKey), sha256: m.sha256 });
    } else if (id.startsWith('bib_') && UUID.test(id.slice(4))) {
      const A = schema.assets;
      const [b] = await base.select({ url: A.url }).from(A)
        .where(and(eq(A.id, id.slice(4)), eq(A.workspaceId, job.workspaceId), eq(A.kind, 'image'), or(isNull(A.brandId), eq(A.brandId, job.brandId)))).limit(1);
      out.push(b ? { assetId: id, etat: 'autorise', url: b.url, sha256: hacherImage(b.url).sha256 } : absent(id));
    } else {
      out.push({ assetId: id, etat: 'sans_media', motif: 'source sans média transmissible (annonce concurrente ou identifiant inconnu)' });
    }
  }
  return out;
}

/* ───────────────────────── Préparation d'une soumission ──────────────────── */

/**
 * Lecture des octets d'un média stocké, pour la préparation d'une retouche
 * (source et masque relus AVANT la soumission) · `null` = stockage non
 * configuré : la retouche est alors bloquée, rien ne part.
 */
export type LecteurOctets = (cle: string) => Promise<Uint8Array | null>;

export function preparateurFal(base: BaseStudio, o: { modeles: { generation: string; edition: string; animation: string }; stockage: StorageConfig | null; lire?: LecteurOctets | null }) {
  return async (d: DemandeFournisseur, jobId: string): Promise<PreparationFal> => {
    const J = schema.studioJobs;
    const [job] = await base.select().from(J).where(eq(J.id, jobId)).limit(1);
    if (!job) return { ok: false, motif: 'job introuvable' };
    const snap = lireSnapshotJob(job.snapshot);
    if (!snap) return { ok: false, motif: 'instantané illisible' };
    let r: Pick<RequeteFal & { ok: true }, 'ok' | 'modele' | 'corps' | 'operations' | 'empreinte' | 'limites'> | Extract<RequeteFal, { ok: false }>;
    let ids: string[];
    if (estParametresClip(snap.parametres)) {
      // Animation d'un plan : l'image clé de départ relue MAINTENANT (révocation, remplacement).
      const lc = lireParametresClip(snap.parametres);
      ids = lc.ok ? [lc.parametres.source.assetId] : [];
      const [source] = lc.ok ? await resoudreMedias(base, job, ids, o.stockage) : [];
      r = requeteFalAnimation({ operations: operationsDuSnapshot(snap), parametres: snap.parametres, source: source ?? null, modele: o.modeles.animation });
    } else if (estParametresRetouche(snap.parametres)) {
      // Retouche masquée (G-B) : source ET masque relus maintenant, octet pour octet.
      const lr = lireParametresRetouche(snap.parametres);
      ids = lr.ok ? [lr.parametres.source.assetId, lr.parametres.masque.assetId] : [];
      const [source] = lr.ok ? await resoudreMedias(base, job, [lr.parametres.source.assetId], o.stockage) : [];
      const relu = lr.ok && o.lire
        ? await relireMasque({ ex: base, job, parametres: lr.parametres, lire: o.lire })
        : { masque: null, dimensionsSource: null };
      r = lr.ok && !o.lire
        ? { ok: false, code: 'MISSING_REFERENCE', motif: 'stockage objet non configuré · source et masque illisibles, rien n’est envoyé', cibles: ids }
        : requeteFalRetouche({ operations: operationsDuSnapshot(snap), parametres: snap.parametres, source: source ?? null, dimensionsSource: relu.dimensionsSource, masque: relu.masque, modeles: o.modeles });
    } else {
      const lu = lireParametresImage(snap.parametres);
      ids = lu.ok ? lu.parametres.references.map((x) => x.assetId) : [];
      const medias = await resoudreMedias(base, job, ids, o.stockage);
      r = requeteFalImage({ operations: operationsDuSnapshot(snap), parametres: snap.parametres, medias, modeles: o.modeles });
    }
    await base.insert(schema.studioAuditEvents).values({
      actorId: null, effectiveRole: 'systeme:worker', workspaceId: job.workspaceId, brandId: job.brandId,
      action: r.ok ? 'job.provider.payload' : 'job.provider.blocked', targetType: 'studio_job', targetId: job.id,
      versionBefore: null, versionAfter: null,
      reason: (r.ok ? `corps fal préparé · ${r.modele}` : `${r.code} · ${r.motif}`).slice(0, 500),
      traceId: `fal:${d.cleIdempotence}`,
      details: r.ok
        ? { empreinte: r.empreinte, modele: r.modele, operations: r.operations, references: ids, limites: r.limites }
        : { code: r.code, cibles: r.cibles },
    });
    if (!r.ok) return { ok: false, motif: `${r.code} · ${r.motif}` };
    return { ok: true, workspaceId: job.workspaceId, modele: r.modele, corps: r.corps };
  };
}

export function operationsDuJobBase(base: BaseStudio) {
  return async (jobId: string): Promise<string[]> => {
    const [job] = await base.select({ snapshot: schema.studioJobs.snapshot }).from(schema.studioJobs).where(eq(schema.studioJobs.id, jobId)).limit(1);
    const snap = job ? lireSnapshotJob(job.snapshot) : null;
    return snap ? operationsMediaDuJob(operationsDuSnapshot(snap)) : [];
  };
}

/* ───────────────────────── Stockage objet (S3) ───────────────────────────── */

/** Plafond de relecture · celui de la sortie fal (64 Mio). */
const OCTETS_MAX_RELECTURE = 64 * 1024 * 1024;

/**
 * Le stockage S3 existant (`storage.ts`) vu par le moteur : dépôt signé, puis
 * RELECTURE par l'adresse publique du bucket (sans redirection, bornée). Le
 * moteur compare l'empreinte relue à celle du dépôt avant `completed`.
 */
export function stockageS3(cfg: StorageConfig, f: typeof fetch = fetch): StockageStudio {
  return {
    async deposer(cle, octets, mime) {
      await putObject(cfg, cle, Buffer.from(octets), mime);
    },
    async relire(cle) {
      const r = await f(publicUrlFor(cfg, cle), { redirect: 'error', signal: AbortSignal.timeout(20_000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`relecture refusée (HTTP ${r.status})`);
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length > OCTETS_MAX_RELECTURE) throw new Error('relecture trop volumineuse');
      return b;
    },
  };
}

/* ───────────────────────── Assemblage et démarrage ───────────────────────── */

export function construireFournisseurFal(o: {
  base: BaseStudio;
  decision: Extract<DecisionFournisseur, { ok: true }>;
  fetch: typeof fetch;
  env?: Readonly<Record<string, string | undefined>>;
  stockage: StorageConfig | null;
  /** Lecture des octets stockés (retouche) · défaut : la relecture S3 du worker si le stockage est configuré. */
  lire?: LecteurOctets | null;
  horloge?: () => Date;
  verifierAdresse?: (u: URL) => Promise<boolean>;
}): FournisseurStudio {
  const barriere = new BarriereDepenseStudio({ port: portDepenseBase(o.base), env: o.env, horloge: o.horloge });
  const lire = o.lire !== undefined ? o.lire : o.stockage ? stockageS3(o.stockage, o.fetch).relire : null;
  return new FournisseurFal({
    apiKey: o.decision.apiKey, queueUrl: o.decision.queueUrl, fetch: o.fetch, barriere,
    preparer: preparateurFal(o.base, { modeles: o.decision.modeles, stockage: o.stockage, lire }),
    operationsDuJob: operationsDuJobBase(o.base),
    horloge: o.horloge, verifierAdresse: o.verifierAdresse,
  });
}

export const MESSAGE_SANS_FOURNISSEUR = 'worker studio non démarré, jobs laissés en file, rien facturé.';

/**
 * Démarre la boucle du worker studio avec le fournisseur réel, ou ne démarre
 * rien et le dit. Rend `null` quand rien ne tourne.
 */
export function demarrerWorkerStudio(o: {
  env: Readonly<Record<string, string | undefined>>;
  base: BaseStudio | null | undefined;
  fetch: typeof fetch;
  log?: (m: string) => void;
}): ReturnType<typeof demarrerBoucleStudio> | null {
  const log = o.log ?? ((m: string) => console.log(m));
  const d = decisionFournisseurStudio(o.env);
  if (!d.ok) { log(`[studios] ${d.raison} · ${MESSAGE_SANS_FOURNISSEUR}`); return null; }
  if (!o.base) { log(`[studios] base indisponible (DATABASE_URL) · ${MESSAGE_SANS_FOURNISSEUR}`); return null; }
  const cfg = storageFromEnv();
  if (!cfg) { log(`[studios] stockage objet illisible · ${MESSAGE_SANS_FOURNISSEUR}`); return null; }
  const fournisseur = construireFournisseurFal({ base: o.base, decision: d, fetch: o.fetch, env: o.env, stockage: cfg });
  log(`[studios] worker studio démarré · fournisseur fal (${d.modeles.generation}, ${d.modeles.edition}, animation ${d.modeles.animation}), sondage avec recul, plafond de dépense appliqué.`);
  return demarrerBoucleStudio({ base: o.base, fournisseur, stockage: stockageS3(cfg, o.fetch) });
}
