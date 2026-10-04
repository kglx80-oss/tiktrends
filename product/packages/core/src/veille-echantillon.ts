import { perimetreVeille } from './veille-perimetre';
// Le périmètre de recherche s'exporte avec l'échantillon · pas de ligne de
// plus dans l'index (recette #106b).
export * from './veille-perimetre';
/**
 * La Veille en mode démonstration · la recherche et les filtres s'appliquent
 * VRAIMENT à l'échantillon local (recette #106, constat Codex).
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * Sans source branchée, la Veille montrait toujours les mêmes annonces
 * d'échantillon, quel que soit le mot-clé ou le filtre · `/veille?q=zzzzzzzz`
 * affichait encore deux cartes. Le champ acceptait un mot-clé qu'il ignorait,
 * contre la règle R14 de l'écran (« on ne propose pas un filtre qui serait
 * silencieusement ignoré »), et l'état « aucun résultat » était inatteignable.
 *
 * Ici, chaque critère que l'écran propose filtre l'échantillon, sans réseau ·
 * mot-clé (dans le champ choisi par « Dans : », texte de l'annonce par défaut),
 * plateforme, média, statut, pays. Un échantillon vidé par les critères est un
 * résultat honnête · l'écran dit « aucune annonce » au lieu de mentir.
 *
 * Pur · ni base, ni réseau. La recherche en direct ne passe jamais par ici.
 */

/** Ce qu'une annonce d'échantillon doit exposer pour être filtrée. */
export interface AnnonceEchantillon {
  platform: string;
  status: string;
  mediaType?: string;
  advertiserName?: string;
  body?: string;
  landingDomain?: string;
  mainCountry?: string;
}

/** Les critères de l'écran Veille, tels que lus dans l'URL. */
export interface CriteresEchantillon {
  /** Mot-clé (déjà normalisé en domaine si l'utilisateur a collé une URL). */
  q?: string;
  /** Plateforme effective (`meta` par défaut). */
  p?: string;
  /** « Dans : » · `ad_copy` (texte), `brand` (annonceur), `domain` (domaine). */
  searchIn?: string;
  media?: string;
  status?: string;
  country?: string;
}

/** Minuscule, sans accents, espaces resserrés · « Beauté » trouve « beaute ». */
export function normaliserRecherche(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Le champ cherché · le MÊME périmètre que la source réelle · absent →
// texte de l'annonce (défaut du connecteur), jamais « partout » · un lien sans
// `searchIn` et le formulaire au défaut ont le même sens (recette #106b ·
// `perimetreVeille`).
function champs(a: AnnonceEchantillon, searchIn?: string): string[] {
  const p = perimetreVeille(searchIn);
  if (p === 'brand') return [a.advertiserName ?? ''];
  if (p === 'domain') return [a.landingDomain ?? ''];
  return [a.body ?? ''];
}

/**
 * L'échantillon restreint par les critères de l'écran. Un critère vide ne
 * filtre pas ; un critère posé filtre toujours (jamais ignoré en silence).
 */
export function filtrerEchantillonVeille<T extends AnnonceEchantillon>(ads: readonly T[], c: CriteresEchantillon): T[] {
  const q = normaliserRecherche(c.q);
  const pays = (c.country ?? '').trim().toUpperCase();
  return ads.filter((a) => {
    if (c.p && a.platform !== c.p) return false;
    if ((c.media === 'video' || c.media === 'image') && a.mediaType !== c.media) return false;
    if (c.status === 'active' && a.status !== 'active') return false;
    if (pays && (a.mainCountry ?? '').toUpperCase() !== pays) return false;
    if (q && !champs(a, c.searchIn).some((f) => normaliserRecherche(f).includes(q))) return false;
    return true;
  });
}
