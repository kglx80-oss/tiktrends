/**
 * Veille · OÙ l'on cherche, dit et appliqué pareil partout (recette #106b).
 *
 * ── Audit de la source (lecture du code, aucun appel) ────────────────────────
 *
 * `packages/integrations/src/trendtrack.ts`, `ttSearchAds` (Meta) · le
 * connecteur accepte `searchIn` ∈ { ad_copy, brand, domain }, traduit en
 * `searchType` adCopy / brand / domain. Paramètre ABSENT → le connecteur envoie
 * `adCopy` (texte de l'annonce). Aucune valeur « partout » n'existe dans ce
 * connecteur Meta. (Le connecteur TikTok, lui, envoie `searchArea: 'all'` ·
 * une notion de périmètre global existe donc chez le fournisseur pour TikTok ;
 * pour Meta, rien dans le dépôt ne l'atteste · non vérifiable sans appel.)
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 *  · Le périmètre était caché dans « Filtres » et, choisi par défaut par le
 *    formulaire (`searchIn=ad_copy`, `sort=newest`), comptait « Filtres · 2
 *    actifs » avec deux puces que l'utilisateur n'avait pas posées.
 *  · Un lien direct `?q=neutrogena` (sans `searchIn`) et le formulaire ne
 *    voulaient pas dire la même chose en démonstration (partout contre texte).
 *  · « neutrogena » ne trouvait rien (texte en allemand) sans dire où l'on
 *    avait cherché · une marque introuvable ressemblait à une panne.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 *  · Le périmètre par défaut est CELUI DE LA SOURCE (texte de l'annonce) · un
 *    lien sans `searchIn` et le formulaire au défaut ont le même sens, en
 *    démonstration comme en direct.
 *  · Seul ce qui s'écarte du défaut compte comme filtre actif · le tri n'est
 *    pas un filtre (il s'affiche à part).
 *  · L'état vide nomme le périmètre et propose de chercher dans « Marque ».
 *
 * Pur · ni base ni réseau. Le moteur et le connecteur ne changent pas.
 */

export type PerimetreVeille = 'ad_copy' | 'brand' | 'domain';

/** Le défaut appliqué par le connecteur quand le paramètre est absent. */
export const PERIMETRE_VEILLE_DEFAUT: PerimetreVeille = 'ad_copy';

export const PERIMETRES_VEILLE: ReadonlyArray<{ v: PerimetreVeille; libelle: string; exemple: string; dans: string }> = [
  { v: 'ad_copy', libelle: 'Texte de l’annonce', exemple: 'Ex : routine du soir, livraison offerte, peau sensible…', dans: 'le texte de l’annonce' },
  { v: 'brand', libelle: 'Marque', exemple: 'Ex : Neutrogena, Old Spice, Grüns…', dans: 'le nom de la marque' },
  { v: 'domain', libelle: 'Domaine', exemple: 'Ex : gruns.co, amazon.de…', dans: 'le domaine du site' },
];

/** Le périmètre demandé par l'URL · absent ou inconnu → celui de la source. */
export function perimetreVeille(v: string | null | undefined): PerimetreVeille {
  return v === 'brand' || v === 'domain' || v === 'ad_copy' ? v : PERIMETRE_VEILLE_DEFAUT;
}

export function infoPerimetre(p: PerimetreVeille) {
  return PERIMETRES_VEILLE.find((x) => x.v === p)!;
}

/**
 * Les critères ACTIFS · seulement ce qui s'écarte du défaut. Le périmètre ne
 * compte que s'il n'est pas celui de la source et que la plateforme l'honore
 * (Meta) ; le tri ne compte jamais (il réordonne, il ne restreint pas).
 */
export function filtresActifsVeille(sp: { searchIn?: string; media?: string; status?: string; country?: string }, plateforme: string): Array<{ cle: 'searchIn' | 'media' | 'status' | 'country'; texte: string }> {
  const out: Array<{ cle: 'searchIn' | 'media' | 'status' | 'country'; texte: string }> = [];
  const p = perimetreVeille(sp.searchIn);
  if (plateforme === 'meta' && p !== PERIMETRE_VEILLE_DEFAUT) out.push({ cle: 'searchIn', texte: `Dans : ${infoPerimetre(p).libelle}` });
  if (sp.media === 'video') out.push({ cle: 'media', texte: 'Vidéo' });
  if (sp.media === 'image') out.push({ cle: 'media', texte: 'Image' });
  if (sp.status === 'active') out.push({ cle: 'status', texte: 'Actives' });
  if (sp.country) out.push({ cle: 'country', texte: `Pays : ${sp.country}` });
  return out;
}

/** L'état vide · nomme le périmètre et propose « Marque » quand ce n'est pas déjà lui. */
export function videRechercheVeille(q: string, p: PerimetreVeille, demo: boolean): { titre: string; pourquoi: string; essayerMarque: boolean } {
  const terme = q.trim();
  const dans = infoPerimetre(p).dans;
  return {
    titre: terme ? `Aucune annonce dont ${dans} contient « ${terme} ».` : 'Aucune annonce ne correspond à ces filtres.',
    pourquoi: `${demo ? 'En démonstration, on cherche dans l’échantillon affiché. ' : ''}La recherche porte sur ${dans}${p === 'brand' ? '' : ' · un nom de marque s’y trouve rarement, cherche-le plutôt dans « Marque »'}.`,
    essayerMarque: p !== 'brand' && terme.length > 0,
  };
}
