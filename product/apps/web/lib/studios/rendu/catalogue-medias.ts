import 'server-only';
import { storageFromEnv, privateObjectUrl } from '@tiktrends/integrations';
import { inspecterMedia, erreurStudio, type ErreurStudio } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { fichierAServirPour } from '../produit/vue';
import { octetsDataUri } from '../produit/catalogue';

/**
 * Raccord d'intégration L5 · la photo produit épinglée (L5-C) dans l'éditeur
 * (L5-B) et dans le rendu (L5-A).
 *
 * L5-C n'importe aucune photo dans `studio_assets` (« ne pas créer une seconde
 * bibliothèque ») : une photo du catalogue est désignée par une identité
 * dérivée de son contenu (`pph_…`, logo `logo_…`). Ce module en relit les
 * octets par le MÊME chemin que la route d'aperçu de L5-C
 * (`fichierAServirPour` : garde, projet dans la portée, fichier du catalogue de
 * la marque DU projet), donc sans élargir aucune portée.
 *
 * Une photo déposée (data URI ou bucket privé de l'espace) est relue après
 * contrôle du catalogue. Les adresses externes arbitraires ne sont pas téléchargées.
 */

const ID_CATALOGUE = /^(pph|logo)_[0-9a-f]{24}$/;

export function estFichierCatalogue(id: unknown): id is string {
  return typeof id === 'string' && ID_CATALOGUE.test(id);
}

/** Adresse d'aperçu d'un fichier du catalogue · la route de L5-C, jamais la data URI. */
export function urlApercuCatalogue(projectId: string, id: string): string {
  return `/studio/projets/${encodeURIComponent(projectId)}/produit/fichier/${encodeURIComponent(id)}`;
}

export type FichierCatalogueLu = { ok: true; octets: Uint8Array; mime: string; largeur: number; hauteur: number };

export async function lireFichierCatalogue(ctx: ContexteStudio, projectId: string, id: string): Promise<FichierCatalogueLu | ErreurStudio> {
  const introuvable = () => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  if (!estFichierCatalogue(id)) return introuvable();
  const f = await fichierAServirPour(ctx, projectId, id, { veilleOuverte: false, maintenant: new Date() });
  if (!f.ok) return f;
  const d = octetsDataUri(f.url);
  let octets: Uint8Array;
  if (d) octets = new Uint8Array(d.octets);
  else {
    const cfg = storageFromEnv();
    const url = cfg && privateObjectUrl(cfg, f.url, ctx.workspaceId);
    if (!url) return introuvable();
    try {
      const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!r.ok || Number(r.headers.get("content-length") ?? 0) > 64 * 1024 * 1024) return introuvable();
      octets = new Uint8Array(await r.arrayBuffer());
      if (octets.length > 64 * 1024 * 1024) return introuvable();
    } catch { return introuvable(); }
  }
  // Type et dimensions relus dans les octets (fichier complet exigé), jamais dans la data URI.
  const e = inspecterMedia(octets);
  if (!e || !e.mime.startsWith('image/') || !e.largeur || !e.hauteur) return introuvable();
  return { ok: true, octets, mime: e.mime, largeur: e.largeur, hauteur: e.hauteur };
}
