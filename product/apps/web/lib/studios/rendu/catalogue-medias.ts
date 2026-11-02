import 'server-only';
import { storageFromEnv, privateObjectUrl, lireObjetEspaceConforme } from '@tiktrends/integrations';
import { inspecterMedia, erreurStudio, decisionLogoServi, verificationDeLecture, POIDS_MAX_LOGO, type DecisionLogoServi, type ErreurStudio } from '@tiktrends/core';
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

/** Refus de lecture · `logo` quand c'est l'EMPREINTE d'un logo de la charte qui refuse (`decisionLogoServi`). */
export type RefusCatalogue = ErreurStudio & { logo?: Extract<DecisionLogoServi, { servir: false }> };

/** Lecteur d'une opération · un fichier du catalogue n'y est lu (donc vérifié) qu'une fois. */
export type LecteurCatalogue = (id: string) => Promise<FichierCatalogueLu | RefusCatalogue>;

/**
 * Un lecteur qui ne lit chaque fichier qu'UNE fois pendant une opération
 * (export · préflight puis rendu ; téléchargement · droits puis re-rendu) ·
 * un logo à empreinte n'y est vérifié qu'une fois, et les octets rendus sont
 * ceux que le préflight a jugés.
 */
export function lecteurCatalogueUnique(ctx: ContexteStudio, projectId: string): LecteurCatalogue {
  const vus = new Map<string, Promise<FichierCatalogueLu | RefusCatalogue>>();
  return (id) => {
    let p = vus.get(id);
    if (!p) { p = lireFichierCatalogue(ctx, projectId, id); vus.set(id, p); }
    return p;
  };
}

/**
 * ── Logo de la charte AVEC empreinte (importé) ───────────────────────────────
 *
 * Ses octets ne sont lus que si le stockage confirme que l'objet est toujours
 * celui de l'import · `GET` signé avec `If-Match` (`lireObjetEspaceConforme`,
 * même lecture que la route média de la marque), jugé par le noyau
 * (`decisionLogoServi`). Une seule requête, aucune fenêtre entre la
 * vérification et la lecture · remplacé, disparu ou non vérifiable ⇒ refus
 * (`logo`), rien n'est lu ni rendu. Un logo SANS empreinte (ancien, externe)
 * et une photo produit sont lus comme avant.
 */
export async function lireFichierCatalogue(ctx: ContexteStudio, projectId: string, id: string): Promise<FichierCatalogueLu | RefusCatalogue> {
  const introuvable = () => erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  if (!estFichierCatalogue(id)) return introuvable();
  const f = await fichierAServirPour(ctx, projectId, id, { veilleOuverte: false, maintenant: new Date() });
  if (!f.ok) return f;
  const d = octetsDataUri(f.url);
  let octets: Uint8Array;
  if (d) octets = new Uint8Array(d.octets);
  else if (f.empreinte) {
    const cfg = storageFromEnv();
    const lu = cfg ? await lireObjetEspaceConforme(cfg, f.url, ctx.workspaceId, f.empreinte, POIDS_MAX_LOGO, 15_000) : null;
    const decision = decisionLogoServi({ empreinte: f.empreinte, verification: verificationDeLecture(lu) });
    if (!decision.servir) return { ...introuvable(), logo: decision };
    if (!lu?.ok) return introuvable();
    octets = lu.octets;
  } else {
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
