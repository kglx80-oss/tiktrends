/**
 * Lot 18B · revenir à SA recherche de Veille, avec critères et position.
 *
 * Mesuré en local (`98fd2d64`, source simulée en boucle locale, 1440 · 1280 ·
 * 390 × 720) :
 *
 * | Parcours                                    | Avant                                                                 |
 * | ------------------------------------------- | --------------------------------------------------------------------- |
 * | Carte › voir les annonces du même annonceur | aucun lien interne · seulement la bibliothèque externe et le site     |
 * | Carte › Studio › retour                     | aucun lien de retour dans le Studio · seul le Retour du navigateur ramène (URL et défilement restitués) |
 *
 * Même convention que le passage Adsmap → Studio (`depuis=<origine>`, lot I1) ·
 * l'origine est une valeur ÉNUMÉRÉE (`veille`) et la cible est TOUJOURS `/veille`.
 * Le contexte (`rv`) ne porte que des critères de la Veille, relus un par un
 * contre leurs valeurs admises · jamais un chemin, jamais une URL · une valeur
 * forgée ne peut donc rediriger nulle part ailleurs.
 *
 * Pur · ni navigateur ni réseau.
 */

export const PARAM_RETOUR_VEILLE = 'rv';
export const DEPUIS_VEILLE = 'veille';

const MAX_TERME = 200;
const MAX_PAGE = 417;

const ADMIS: Record<string, (v: string) => boolean> = {
  q: (v) => v.trim().length > 0 && v.length <= MAX_TERME,
  p: (v) => v === 'meta' || v === 'tiktok' || v === 'google',
  searchIn: (v) => v === 'ad_copy' || v === 'brand' || v === 'domain',
  media: (v) => v === 'video' || v === 'image',
  sort: (v) => ['newest', 'longestRunning', 'reachDelta7d', 'reach', 'mostDuplicates'].includes(v),
  status: (v) => v === 'all' || v === 'active',
  country: (v) => /^[A-Z]{2}$/.test(v),
  page: (v) => /^\d{1,3}$/.test(v) && +v >= 1 && +v <= MAX_PAGE,
};
/** L'ordre d'écriture · stable, pour des URL comparables. */
const ORDRE = ['q', 'p', 'searchIn', 'media', 'sort', 'status', 'country', 'page'] as const;

const ANCRE = /^ad-[a-z]{2,10}-[A-Za-z0-9_-]{1,80}$/;

/** Une ancre de carte de Veille bien formée · rien d'autre ne déclenche de défilement. */
export function estAncreCarteVeille(h: string | null | undefined): boolean {
  return typeof h === 'string' && ANCRE.test(h);
}

/** L'identifiant d'ancre d'une carte de Veille · stable, sans caractère hors liste. */
export function ancreCarteVeille(ad: { platform?: string | null; id?: string | null }): string | null {
  const plateforme = (ad.platform ?? 'meta').toLowerCase().replace(/[^a-z]/g, '').slice(0, 10) || 'meta';
  const id = (ad.id ?? '').toString().trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  if (!id) return null;
  const a = `ad-${plateforme.length >= 2 ? plateforme : 'meta'}-${id}`;
  return ANCRE.test(a) ? a : null;
}

/**
 * Les critères de la Veille en cours, NETTOYÉS · seulement les clés connues aux
 * valeurs admises (les autres, dont `refresh` et un `rv` imbriqué, tombent) ·
 * plus l'ancre de la carte d'où l'on part. C'est la valeur de `rv`.
 */
export function contexteVeille(criteres: Record<string, string | string[] | undefined | null>, ancre?: string | null): string {
  const p = new URLSearchParams();
  for (const k of ORDRE) {
    const brut = criteres[k];
    const v = Array.isArray(brut) ? brut[0] : brut;
    const admis = ADMIS[k];
    if (typeof v === 'string' && admis && admis(v)) p.set(k, k === 'q' ? v.trim() : v);
  }
  const qs = p.toString();
  return ancre && ANCRE.test(ancre) ? `${qs}#${ancre}` : qs;
}

/**
 * Le lien de RETOUR vers la Veille, depuis la valeur de `rv` · `null` quand elle
 * est absente. Toujours `/veille` · les critères inconnus ou invalides sont
 * ignorés un par un, l'ancre n'est gardée que si elle a la forme d'une carte.
 */
export function lienRetourVeille(rv: string | string[] | null | undefined): string | null {
  const brut = Array.isArray(rv) ? rv[0] : rv;
  if (typeof brut !== 'string') return null;
  const i = brut.indexOf('#');
  const qs = i === -1 ? brut : brut.slice(0, i);
  const ancre = i === -1 ? '' : brut.slice(i + 1);
  const lus: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs)) if (!(k in lus)) lus[k] = v;
  const propre = contexteVeille(lus, ancre);
  const [s, a] = propre.split('#');
  return `/veille${s ? `?${s}` : ''}${a ? `#${a}` : ''}`;
}

/** Le terme de la recherche à laquelle on revient · pour le dire à l'écran. */
export function termeRetourVeille(rv: string | string[] | null | undefined): string | null {
  const lien = lienRetourVeille(rv);
  if (!lien) return null;
  const q = new URLSearchParams(lien.split('?')[1]?.split('#')[0] ?? '').get('q');
  return q && q.trim() ? q.trim() : null;
}

/**
 * La recherche INTERNE des annonces du même annonceur · `null` quand la source
 * ne sait pas chercher par annonceur sur cette plateforme. Meta · recherche par
 * marque (`searchIn=brand`) · TikTok · par domaine d'atterrissage quand on le
 * connaît (la Veille bascule seule en recherche par domaine) · Google · aucune
 * recherche par annonceur fiable, pas de lien. Le contexte de départ suit (`rv`).
 * C'est une RECHERCHE par nom · pas un suivi, pas une fiche concurrent.
 */
export function lienAnnonceurVeille(
  ad: { platform?: string | null; advertiserName?: string | null; landingDomain?: string | null },
  contexte: string,
): string | null {
  const p = (ad.platform ?? 'meta').toLowerCase();
  const params = new URLSearchParams();
  if (p === 'meta') {
    const nom = (ad.advertiserName ?? '').trim();
    if (!nom || nom.length > MAX_TERME) return null;
    params.set('q', nom); params.set('p', 'meta'); params.set('searchIn', 'brand');
  } else if (p === 'tiktok') {
    const dom = (ad.landingDomain ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!dom || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(dom)) return null;
    params.set('q', dom); params.set('p', 'tiktok');
  } else {
    return null;
  }
  if (contexte) params.set(PARAM_RETOUR_VEILLE, contexte);
  return `/veille?${params.toString()}`;
}

export const LIBELLE_ANNONCEUR_VEILLE = 'Ses annonces dans la Veille';
export const TITRE_ANNONCEUR_VEILLE = 'Recherche par nom d’annonceur dans la Veille · pas un suivi';
