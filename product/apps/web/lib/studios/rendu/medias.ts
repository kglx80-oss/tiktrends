import 'server-only';
import { createHash } from 'node:crypto';
import { storageFromEnv, publicUrlFor } from '@tiktrends/integrations';
import { erreurStudio, inspecterMedia, type DocumentStudio, type ErreurStudio } from '@tiktrends/core';
import type { schema } from '@tiktrends/db';
import type { ContexteStudio } from '../garde';
import { lireAsset } from '../depot';

/**
 * Studios · L5-A · lecture sûre des médias studio (`studio_assets`).
 *
 * ── Portée, toujours relue ───────────────────────────────────────────────────
 *
 * Un média n'est lu qu'à travers `lireAsset` (dépôt L1 : espace de la session ET
 * marques visibles en SQL, revérification pure de chaque ligne). Pour un rendu,
 * il doit en plus appartenir à la MARQUE DU PROJET : pas d'usage inter-marques
 * par défaut (cahier 01 §12), même entre deux marques que la personne voit.
 * Hors portée, inconnu ou mal formé : la même réponse neutre.
 *
 * ── Aucune URL comme identité ────────────────────────────────────────────────
 *
 * L'identité d'un média est son identifiant opaque. La clé de stockage et
 * l'adresse du bucket ne sortent jamais du serveur ; elles ne sont ni stockées
 * ni renvoyées par ce module. Les octets lus sont vérifiés : empreinte sha256
 * égale à celle de la ligne, en-tête décodable (type MIME RÉEL relu dans les
 * octets, jamais la déclaration).
 */

export type LigneMedia = typeof schema.studioAssets.$inferSelect;

export interface LecteurMedias {
  /** Octets stockés sous `storageKey` · `null` si absents. */
  lire(m: Pick<LigneMedia, 'storageKey' | 'bytes'>): Promise<Uint8Array | null>;
}

/** Plafond de lecture · 64 Mo (les images studio sont bien en dessous ; une vidéo se lira par plages, plus tard). */
export const OCTETS_MAX_MEDIA = 64 * 1024 * 1024;

/**
 * Lecteur du stockage objet de production (S3 compatible, `S3_*`). Lit l'objet
 * côté serveur ; rien n'est redirigé vers le navigateur. Les clés `simule/`
 * (fournisseur simulé des tests) n'existent pas dans le vrai stockage.
 */
export function lecteurStockage(): LecteurMedias {
  return {
    async lire(m) {
      const cfg = storageFromEnv();
      if (!cfg || m.storageKey.startsWith('simule/')) return null;
      if (m.bytes > OCTETS_MAX_MEDIA) return null;
      try {
        const r = await fetch(publicUrlFor(cfg, m.storageKey), { redirect: 'error', signal: AbortSignal.timeout(15_000) });
        if (!r.ok) return null;
        const longueur = Number(r.headers.get('content-length') ?? '0');
        if (longueur > OCTETS_MAX_MEDIA) return null;
        const b = new Uint8Array(await r.arrayBuffer());
        return b.length > OCTETS_MAX_MEDIA ? null : b;
      } catch {
        return null;
      }
    },
  };
}

let lecteurInjecte: LecteurMedias | null = null;
/** Pour les tests seulement · refusé en production. */
export function injecterLecteurMedias(l: LecteurMedias | null): void {
  if (process.env.NODE_ENV === 'production') throw new Error('lecteur de médias injecté refusé en production');
  lecteurInjecte = l;
}
export function lecteurMedias(): LecteurMedias {
  return lecteurInjecte ?? lecteurStockage();
}

export type MediaLu = { ok: true; asset: LigneMedia; octets: Uint8Array; mime: string };

/** Types servis · images et vidéo MP4. Jamais de SVG ni de HTML (exécutables dans le navigateur). */
export const MIMES_SERVIS: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'];

/**
 * Lit UN média dans la portée de la session : ligne, état stocké, octets,
 * empreinte, type réel. Tout échec répond `NOT_FOUND` neutre (le motif est
 * tracé côté serveur avec l'identifiant de trace, jamais renvoyé).
 */
export async function lireMediaDansPortee(ctx: ContexteStudio, id: unknown, lecteur: LecteurMedias = lecteurMedias()): Promise<MediaLu | ErreurStudio> {
  const a = await lireAsset(ctx, id);
  if (!a.ok) return a;
  const neutre = (motif: string) => {
    console.warn(`[studios] ${ctx.traceId} média non servi · ${motif}`);
    return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  };
  if (a.asset.storageState !== 'stored') return neutre('état de stockage');
  const octets = await lecteur.lire(a.asset);
  if (!octets) return neutre('octets absents');
  if (octets.length !== a.asset.bytes) return neutre('taille différente de la ligne');
  if (createHash('sha256').update(octets).digest('hex') !== a.asset.sha256) return neutre('empreinte différente de la ligne');
  const entete = inspecterMedia(octets);
  if (!entete || !MIMES_SERVIS.includes(entete.mime)) return neutre('type réel non servi');
  return { ok: true, asset: a.asset, octets, mime: entete.mime };
}

/**
 * Médias d'un document, pour un rendu : chacun lu dans la portée ET dans la
 * marque du projet. Un seul manquant ⇒ `MISSING_REFERENCE` (sans dire lequel
 * appartient à qui), jamais un rendu troué.
 */
export async function chargerMediasDocument(
  ctx: ContexteStudio,
  projet: { brandId: string },
  doc: DocumentStudio,
  lecteur: LecteurMedias = lecteurMedias(),
): Promise<{ ok: true; medias: Map<string, Uint8Array> } | ErreurStudio> {
  const ids = [...new Set(Object.values(doc.layers).filter((l) => l.visible && (l.kind === 'image' || l.kind === 'logo')).map((l) => (l as { assetId: string }).assetId))].sort();
  const medias = new Map<string, Uint8Array>();
  for (const id of ids) {
    const m = await lireMediaDansPortee(ctx, id, lecteur);
    if (!m.ok || m.asset.brandId !== projet.brandId || !m.mime.startsWith('image/')) {
      return erreurStudio('MISSING_REFERENCE', {
        traceId: ctx.traceId,
        message: 'Un média du document est introuvable ou n’appartient pas à la marque du projet · remplace-le puis réessaie.',
      });
    }
    medias.set(id, m.octets);
  }
  return { ok: true, medias };
}
