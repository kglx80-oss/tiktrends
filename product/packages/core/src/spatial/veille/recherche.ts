/**
 * Spatial · Veille · la recherche « Jarvis s’occupe des filtres » et l'adresse
 * de l'écran (pur).
 *
 * La maquette (`aiParse`, bundle Spatial) lit la phrase tapée et en tire des
 * filtres. On garde le geste, mais SEULEMENT vers les critères que la source
 * honore vraiment (`/veille` V5 · plateforme, pays, média, statut, tri,
 * périmètre) · un ratio 9:16, une tranche d'âge ou un bouton d'appel à l'action
 * ne sont pas filtrables chez le fournisseur, ils ne deviennent donc jamais un
 * filtre affiché. Aucun appel IA · une règle déterministe, gratuite, testée.
 */

export type PlateformeVeille = 'meta' | 'tiktok' | 'google';
export type TriVeille = 'newest' | 'longestRunning' | 'reachDelta7d' | 'reach' | 'mostDuplicates';
export type VueVeille = 'tout' | 'tendance' | 'suivies';

export interface CriteresVeille {
  q?: string;
  p?: PlateformeVeille;
  searchIn?: 'ad_copy' | 'brand' | 'domain';
  media?: 'video' | 'image';
  sort?: TriVeille;
  status?: 'active' | 'all';
  country?: string;
  page?: number;
  cpm?: number;
  vue?: VueVeille;
  /** La phrase d'origine, quand la recherche vient de Jarvis · affichée, jamais renvoyée au fournisseur. */
  j?: string;
}

/** Le tri Meta (POST /v1/ads/query) · mêmes clés et mêmes libellés que la Veille V5. */
export const TRIS_VEILLE: ReadonlyArray<[TriVeille, string]> = [
  ['newest', 'Récentes'],
  ['longestRunning', 'Plus anciennes'],
  ['reachDelta7d', 'Scaling 7 j (UE)'],
  ['reach', 'Portée (UE)'],
  ['mostDuplicates', 'Plus dupliquées'],
];
export const PAYS_VEILLE_SPATIALE: ReadonlyArray<[string, string]> = [
  ['FR', 'France'], ['BE', 'Belgique'], ['CH', 'Suisse'], ['LU', 'Luxembourg'], ['CA', 'Canada'], ['DE', 'Allemagne'],
  ['ES', 'Espagne'], ['IT', 'Italie'], ['GB', 'Royaume-Uni'], ['NL', 'Pays-Bas'], ['PT', 'Portugal'], ['US', 'États-Unis'],
];
export const PLATEFORMES_VEILLE: ReadonlyArray<[PlateformeVeille, string]> = [['meta', 'Meta'], ['tiktok', 'TikTok'], ['google', 'Google']];

/** Les groupes du panneau « Filtres » · seulement des critères envoyés à la source. */
export interface FiltreVeille { cle: 'status' | 'country' | 'media' | 'p' | 'searchIn'; libelle: string; options: ReadonlyArray<[string, string]>; metaSeulement?: boolean }
export const FILTRES_VEILLE: ReadonlyArray<{ groupe: string; filtres: ReadonlyArray<FiltreVeille> }> = [
  { groupe: 'Diffusion', filtres: [
    { cle: 'status', libelle: 'Statut', options: [['active', 'Actives']] },
    { cle: 'country', libelle: 'Pays', options: PAYS_VEILLE_SPATIALE },
  ] },
  { groupe: 'Créa', filtres: [
    { cle: 'media', libelle: 'Média', options: [['video', 'Vidéo'], ['image', 'Image']] },
    { cle: 'p', libelle: 'Plateforme', options: PLATEFORMES_VEILLE },
  ] },
  { groupe: 'Recherche', filtres: [
    { cle: 'searchIn', libelle: 'Chercher dans', options: [['brand', 'Nom de la marque'], ['domain', 'Domaine du site']], metaSeulement: true },
  ] },
];

const TRI_ADMIS = new Set<string>(TRIS_VEILLE.map(([k]) => k));
const PAYS_ADMIS = /^[A-Z]{2}$/;

/** Les critères lus dans l'adresse · valeur inconnue → absente. */
export function lireCriteresVeille(sp: Record<string, string | string[] | undefined>): CriteresVeille {
  const v = (k: string) => { const x = sp[k]; return typeof x === 'string' ? x : Array.isArray(x) ? x[0] : undefined; };
  const c: CriteresVeille = {};
  const q = v('q')?.trim(); if (q) c.q = q.slice(0, 200);
  const p = v('p'); if (p === 'meta' || p === 'tiktok' || p === 'google') c.p = p;
  const si = v('searchIn'); if (si === 'ad_copy' || si === 'brand' || si === 'domain') c.searchIn = si;
  const m = v('media'); if (m === 'video' || m === 'image') c.media = m;
  const so = v('sort'); if (so && TRI_ADMIS.has(so)) c.sort = so as TriVeille;
  const st = v('status'); if (st === 'active' || st === 'all') c.status = st;
  const co = v('country')?.toUpperCase(); if (co && PAYS_ADMIS.test(co)) c.country = co;
  const pg = Number(v('page')); if (Number.isInteger(pg) && pg > 1 && pg <= 417) c.page = pg;
  const cpm = Number(v('cpm')); if ([6, 9, 12, 15].includes(cpm)) c.cpm = cpm;
  const vue = v('vue'); if (vue === 'tendance' || vue === 'suivies') c.vue = vue;
  const j = v('j')?.trim(); if (j) c.j = j.slice(0, 200);
  return c;
}

const ORDRE: ReadonlyArray<keyof CriteresVeille> = ['j', 'q', 'p', 'searchIn', 'media', 'sort', 'status', 'country', 'vue', 'cpm', 'page'];

/**
 * L'adresse de la Veille pour ces critères (`over` remplace · `undefined` ou
 * chaîne vide retire). Changer un critère renvoie toujours à la page 1, sauf
 * si `over` pose la page.
 */
export function lienVeille(c: CriteresVeille, over: Partial<Record<keyof CriteresVeille, string | number | undefined>> = {}): string {
  const fusion: Record<string, unknown> = { ...c, ...over };
  if (!('page' in over)) delete fusion.page;
  const p = new URLSearchParams();
  for (const k of ORDRE) {
    const x = fusion[k];
    if (x === undefined || x === null || x === '') continue;
    if (k === 'page' && Number(x) <= 1) continue;
    if (k === 'cpm' && Number(x) === 9) continue;
    if (k === 'vue' && x === 'tout') continue;
    p.set(k, String(x));
  }
  const qs = p.toString();
  return qs ? `/veille?${qs}` : '/veille';
}

/** Les critères ACTIFS (tri, CPM, vue et phrase exclus) · une puce par critère, retirable. */
export function pucesVeille(c: CriteresVeille): Array<{ cle: keyof CriteresVeille; libelle: string }> {
  const out: Array<{ cle: keyof CriteresVeille; libelle: string }> = [];
  if (c.p) out.push({ cle: 'p', libelle: PLATEFORMES_VEILLE.find(([k]) => k === c.p)![1] });
  if (c.country) out.push({ cle: 'country', libelle: PAYS_VEILLE_SPATIALE.find(([k]) => k === c.country)?.[1] ?? c.country });
  if (c.media) out.push({ cle: 'media', libelle: c.media === 'video' ? 'Vidéo' : 'Image' });
  if (c.status === 'active') out.push({ cle: 'status', libelle: 'Actives' });
  if (c.searchIn === 'brand') out.push({ cle: 'searchIn', libelle: 'Dans le nom de la marque' });
  if (c.searchIn === 'domain') out.push({ cle: 'searchIn', libelle: 'Dans le domaine' });
  return out;
}

export function nombreFiltresVeille(c: CriteresVeille): number {
  return pucesVeille(c).length;
}

const STOP = new Set(('de des du la le les un une en et pour sur avec qui que dans au aux par ou je veux cherche cherches trouve trouver montre moi '
  + 'pubs pub publicité publicités publicites créas créa crea creas statiques statique annonces annonce formats format').split(' '));

type Regle = { re: RegExp; poser: (c: CriteresVeille) => void };
const REGLES: Regle[] = [
  { re: /\btik ?tok\b/, poser: (c) => { c.p = 'tiktok'; } },
  { re: /\b(google|youtube)\b/, poser: (c) => { c.p = 'google'; } },
  { re: /\b(meta|facebook|instagram|insta)\b/, poser: (c) => { c.p = 'meta'; } },
  { re: /\b(suisse)\b/, poser: (c) => { c.country = 'CH'; } },
  { re: /\bbelg\w*/, poser: (c) => { c.country = 'BE'; } },
  { re: /\bluxemb\w*/, poser: (c) => { c.country = 'LU'; } },
  { re: /\b(canad\w*|québec|quebec)\b/, poser: (c) => { c.country = 'CA'; } },
  { re: /\ballemagne\b/, poser: (c) => { c.country = 'DE'; } },
  { re: /\bespagne\b/, poser: (c) => { c.country = 'ES'; } },
  { re: /\bitalie\b/, poser: (c) => { c.country = 'IT'; } },
  { re: /\b(royaume[- ]uni|angleterre|uk)\b/, poser: (c) => { c.country = 'GB'; } },
  { re: /\bfrance\b/, poser: (c) => { c.country = 'FR'; } },
  { re: /\b(vidéos?|videos?|reels?|stories|story|9:16)\b/, poser: (c) => { c.media = 'video'; } },
  { re: /\b(images?|photos?|visuels?)\b/, poser: (c) => { c.media = 'image'; } },
  { re: /\b(actives?|en ligne|en cours)\b/, poser: (c) => { c.status = 'active'; } },
  { re: /(\+ ?\d+ ?j(ours)?|depuis longtemps|qui durent|qui tournent depuis|les plus anciennes|anciennes)/, poser: (c) => { c.sort = 'longestRunning'; } },
  { re: /\b(en hausse|qui montent|qui scalent|scaling|tendances?)\b/, poser: (c) => { c.sort = 'reachDelta7d'; } },
  { re: /\b(récentes?|recentes?|nouvelles?|cette semaine|lancées?)\b/, poser: (c) => { c.sort = 'newest'; } },
  { re: /\b(plus grande portée|portée|reach)\b/, poser: (c) => { c.sort = 'reach'; } },
  { re: /\b(dupliquées?|déclinées?|variantes)\b/, poser: (c) => { c.sort = 'mostDuplicates'; } },
];

/**
 * La phrase tapée → des critères RÉELS. « Pubs de X » / « marque X » cherche
 * dans le nom de la marque (Meta). Le reste des mots devient le texte cherché ·
 * sans mot restant, la Veille montre sa sélection par défaut filtrée.
 */
export function analyserRechercheVeille(phrase: string): CriteresVeille {
  const brut = phrase.trim().slice(0, 200);
  const c: CriteresVeille = { j: brut };
  let reste = ` ${brut.toLowerCase().replace(/[«»"“”]/g, ' ')} `;
  const marque = /\b(?:pubs? de|publicités? de|annonces? de|créas? de|la marque|marque)\s+(.+?)(?:\s+(?:sur|en|qui|avec|depuis|actives?)\b|$)/.exec(reste.trim());
  for (const r of REGLES) {
    const avant = reste;
    reste = reste.replace(r.re, ' ');
    if (avant !== reste) r.poser(c);
  }
  if (marque && marque[1]) {
    const nom = brut.slice(brut.toLowerCase().indexOf(marque[1].trim()), brut.toLowerCase().indexOf(marque[1].trim()) + marque[1].trim().length).trim();
    if (nom) { c.q = nom; c.searchIn = 'brand'; if (!c.p) c.p = 'meta'; return c; }
  }
  const mots = reste.split(/[^a-zà-ÿ0-9’'.-]+/i).filter((w) => w && w.length > 2 && !STOP.has(w));
  if (mots.length) c.q = mots.join(' ');
  return c;
}

/** Les exemples sous la barre · une marque SUIVIE quand il y en a une, jamais un nom inventé. */
export function suggestionsVeille(marqueSuivie?: string | null): string[] {
  const s = ['Avis client sur Meta', 'Pubs qui tournent depuis +30 jours'];
  const nom = marqueSuivie?.trim();
  if (nom && nom.length <= 60) s.push(`Pubs de ${nom}`);
  s.push('Pubs en hausse', 'Vidéos sur TikTok', 'Pubs avec une offre');
  return s;
}
