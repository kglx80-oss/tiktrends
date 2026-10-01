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
 * mot-clé (annonceur, texte, domaine · ou le seul champ choisi par « Dans : »),
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

function champs(a: AnnonceEchantillon, searchIn?: string): string[] {
  if (searchIn === 'brand') return [a.advertiserName ?? ''];
  if (searchIn === 'domain') return [a.landingDomain ?? ''];
  if (searchIn === 'ad_copy') return [a.body ?? ''];
  return [a.advertiserName ?? '', a.body ?? '', a.landingDomain ?? ''];
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

/** La copie de l'état vide en démonstration · dit que la recherche porte sur l'échantillon. */
export function videEchantillonVeille(q: string | null | undefined): { titre: string; pourquoi: string } {
  const terme = (q ?? '').trim();
  return {
    titre: terme ? `Aucune annonce de l’échantillon pour « ${terme} ».` : 'Aucune annonce de l’échantillon ne correspond à ces filtres.',
    pourquoi: 'En démonstration, la recherche et les filtres portent sur l’échantillon affiché · élargis le terme, ou réinitialise les filtres.',
  };
}
