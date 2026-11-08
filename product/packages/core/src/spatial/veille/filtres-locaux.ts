/**
 * Spatial · Veille · les filtres LOCAUX, la vue liste et la navigation du
 * détail (lot 7 V5 · VB V19, V21, V26, V28, F16, SC05, FO07). Pur, testé.
 *
 * Un filtre local ne relance AUCUNE requête · il trie ce que l'écran a déjà
 * lu (la page de la source, la liste de « Ce qui scale », les exemples d'un
 * style). Règle R14 de l'inventaire · il ne s'ouvre que s'il filtre vraiment
 * ce qui est chargé, et il le dit (« sur les N pubs chargées ») · la source
 * pagine, une autre page n'est jamais filtrée en douce. Un filtre qui
 * n'aurait aucun effet reste visible, FERMÉ, avec sa raison écrite.
 *
 * Hors de portée, faute de donnée dans la source (`InspoAd`) · ratio, durée de
 * vidéo, variantes par créative, dates de première et dernière vue, accroche
 * distincte, langue. Aucun de ces filtres n'est proposé.
 */

/** Ce qu'un filtre local regarde d'une pub déjà lue · un champ absent ne correspond qu'à « tous ». */
export interface PubLocale {
  cta?: string | null;
  sauvee?: boolean;
  plateforme?: string | null;
  pays?: string | null;
  jours?: number | null;
  suivie?: boolean;
}

export interface FiltresLocaux {
  /** L'appel à l'action exact · `SANS_CTA` pour les pubs qui n'en ont pas. */
  cta: string | null;
  masquerSauvees: boolean;
  plateforme: string | null;
  pays: string | null;
  /** Diffusion minimale en jours (`PALIERS_DIFFUSION`). */
  diffusionMin: number | null;
  suiviesSeulement: boolean;
}

export const FILTRES_LOCAUX_VIDES: Readonly<FiltresLocaux> = Object.freeze({
  cta: null, masquerSauvees: false, plateforme: null, pays: null, diffusionMin: null, suiviesSeulement: false,
});

/** La valeur du filtre « sans appel à l'action » · jamais un libellé réel (la source écrit en capitales ou en mots). */
export const SANS_CTA = '__sans__';
/** Les paliers de diffusion de la V5 (« ≥ 7, 14, 30, 60 j »). */
export const PALIERS_DIFFUSION = [7, 14, 30, 60] as const;
const PLATEFORMES: Record<string, string> = { meta: 'Meta', tiktok: 'TikTok', google: 'Google' };
const LONGUEUR_CTA = 60;

const ctaDe = (p: PubLocale) => (p.cta ?? '').trim() || SANS_CTA;

/** Une pub passe-t-elle CES filtres ? · chaque filtre posé doit être tenu. */
export function passeFiltresLocaux(p: PubLocale, f: FiltresLocaux): boolean {
  if (f.cta !== null && ctaDe(p) !== f.cta) return false;
  if (f.masquerSauvees && p.sauvee) return false;
  if (f.plateforme !== null && p.plateforme !== f.plateforme) return false;
  if (f.pays !== null && (p.pays ?? '').toUpperCase() !== f.pays) return false;
  if (f.diffusionMin !== null && !((p.jours ?? -1) >= f.diffusionMin)) return false;
  if (f.suiviesSeulement && !p.suivie) return false;
  return true;
}

/** Les pubs chargées qui passent les filtres · MÊME ordre que la liste lue (le tri de la source ou de l'écran est gardé). */
export function filtrerLocal<T>(items: readonly T[], f: FiltresLocaux, lire: (t: T) => PubLocale): T[] {
  return items.filter((t) => passeFiltresLocaux(lire(t), f));
}

export interface OptionLocale { valeur: string; libelle: string; n: number }
export interface ControleLocal { ouvert: boolean; raison: string | null; options: OptionLocale[] }
export interface ControlesLocaux {
  cta: ControleLocal;
  sauvees: ControleLocal;
  plateforme: ControleLocal;
  pays: ControleLocal;
  diffusion: ControleLocal;
  suivies: ControleLocal;
}

function groupes(lues: readonly PubLocale[], cle: (p: PubLocale) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of lues) { const k = cle(p); if (k !== null) m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

/** Un filtre à choix ne s'ouvre que s'il sépare la liste en deux groupes au moins. */
function choix(lues: readonly PubLocale[], cle: (p: PubLocale) => string | null, libelle: (k: string) => string, raisons: { aucun: string; un: (l: string) => string; partiel?: (l: string) => string }): ControleLocal {
  const g = groupes(lues, cle);
  const connus = [...g.values()].reduce((a, n) => a + n, 0);
  const options = [...g.entries()].map(([valeur, n]) => ({ valeur, libelle: libelle(valeur), n }))
    .sort((a, b) => b.n - a.n || a.libelle.localeCompare(b.libelle, 'fr'));
  const reels = options.filter((o) => o.valeur !== SANS_CTA);
  if (reels.length === 0) return { ouvert: false, raison: raisons.aucun, options: [] };
  if (options.length < 2) return { ouvert: false, raison: connus < lues.length && raisons.partiel ? raisons.partiel(options[0]!.libelle) : raisons.un(options[0]!.libelle), options };
  return { ouvert: true, raison: null, options };
}

/**
 * Ce que chaque filtre local peut faire sur CES pubs chargées · ouvert avec
 * ses options (et leur effectif), ou fermé avec sa raison écrite.
 */
export function controlesLocaux(lues: readonly PubLocale[]): ControlesLocaux {
  const total = lues.length;
  const sauvees = lues.filter((p) => p.sauvee).length;
  const suivies = lues.filter((p) => p.suivie).length;
  const avecJours = lues.filter((p) => typeof p.jours === 'number');
  const paliers = PALIERS_DIFFUSION.map((j) => ({ valeur: String(j), libelle: `${j} j et plus`, n: avecJours.filter((p) => p.jours! >= j).length }));
  const utiles = paliers.filter((o) => o.n > 0 && o.n < total);
  return {
    cta: choix(lues, (p) => ctaDe(p), (k) => (k === SANS_CTA ? 'Sans appel à l’action' : k), {
      aucun: 'La source ne donne aucun appel à l’action pour ces pubs',
      un: (l) => `Toutes ces pubs ont le même appel à l’action · « ${l} »`,
    }),
    sauvees: sauvees > 0
      ? { ouvert: true, raison: null, options: [{ valeur: '1', libelle: 'Masquer déjà sauvegardées', n: sauvees }] }
      : { ouvert: false, raison: 'Aucune de ces pubs n’est dans tes sauvegardes', options: [] },
    plateforme: choix(lues, (p) => p.plateforme ?? null, (k) => PLATEFORMES[k] ?? k, {
      aucun: 'La plateforme de ces pubs n’est pas connue',
      un: (l) => `Toutes ces pubs viennent de ${l}`,
      partiel: (l) => `Une seule plateforme connue parmi ces pubs · ${l}`,
    }),
    pays: choix(lues, (p) => (p.pays ? p.pays.toUpperCase() : null), (k) => k, {
      aucun: 'La source ne donne pas le pays de ces pubs',
      un: (l) => `Toutes ces pubs ont le même pays · ${l}`,
      partiel: (l) => `Un seul pays connu parmi ces pubs · ${l}`,
    }),
    diffusion: avecJours.length === 0
      ? { ouvert: false, raison: 'La source ne donne pas la durée de diffusion de ces pubs', options: [] }
      : utiles.length === 0
        ? { ouvert: false, raison: 'Aucun palier ne sépare ces pubs · même durée de diffusion pour toutes', options: [] }
        : { ouvert: true, raison: null, options: utiles },
    suivies: suivies === 0
      ? { ouvert: false, raison: 'Aucune de ces pubs ne vient d’une marque suivie', options: [] }
      : suivies === total
        ? { ouvert: false, raison: 'Toutes ces pubs viennent de marques suivies', options: [] }
        : { ouvert: true, raison: null, options: [{ valeur: '1', libelle: 'Marques suivies seulement', n: suivies }] },
  };
}

/** Les filtres posés, une puce par filtre (retirable) · l'état visible de la barre. */
export function pucesLocales(f: FiltresLocaux): Array<{ cle: keyof FiltresLocaux; libelle: string }> {
  const out: Array<{ cle: keyof FiltresLocaux; libelle: string }> = [];
  if (f.cta !== null) out.push({ cle: 'cta', libelle: f.cta === SANS_CTA ? 'Sans appel à l’action' : `Appel à l’action · ${f.cta}` });
  if (f.masquerSauvees) out.push({ cle: 'masquerSauvees', libelle: 'Sans les pubs déjà sauvegardées' });
  if (f.plateforme !== null) out.push({ cle: 'plateforme', libelle: PLATEFORMES[f.plateforme] ?? f.plateforme });
  if (f.pays !== null) out.push({ cle: 'pays', libelle: `Pays · ${f.pays}` });
  if (f.diffusionMin !== null) out.push({ cle: 'diffusionMin', libelle: `Diffusées ${f.diffusionMin} j et plus` });
  if (f.suiviesSeulement) out.push({ cle: 'suiviesSeulement', libelle: 'Marques suivies seulement' });
  return out;
}

/** Retirer UN filtre · les autres restent. */
export function retirerFiltreLocal(f: FiltresLocaux, cle: keyof FiltresLocaux): FiltresLocaux {
  return { ...f, [cle]: FILTRES_LOCAUX_VIDES[cle] };
}

/** Le compteur · juste, et il dit sur quoi il compte (la page chargée, pas la source entière). */
export function compteLocal(visibles: number, chargees: number, actifs: number): string {
  const pubs = (n: number) => `${n} pub${n > 1 ? 's' : ''}`;
  return actifs > 0 ? `${visibles} sur ${pubs(chargees)} chargée${chargees > 1 ? 's' : ''}` : `${pubs(chargees)} chargée${chargees > 1 ? 's' : ''}`;
}

/* ───────────────────────── l'adresse ───────────────────────── */

/** Les clés d'adresse des filtres locaux · aucune ne recoupe un critère envoyé à la source (`lienVeille`). */
export const CLES_ADRESSE_LOCALES = ['cta', 'masquer', 'plateforme', 'pays', 'diffusion', 'suivies'] as const;

/** Les filtres locaux lus dans l'adresse · une valeur inconnue est ignorée. */
export function lireFiltresLocaux(sp: Record<string, string | string[] | undefined>): FiltresLocaux {
  const v = (k: string) => { const x = sp[k]; return typeof x === 'string' ? x : Array.isArray(x) ? x[0] : undefined; };
  const f: FiltresLocaux = { ...FILTRES_LOCAUX_VIDES };
  const cta = v('cta')?.trim(); if (cta && cta.length <= LONGUEUR_CTA) f.cta = cta;
  if (v('masquer') === 'sauvees') f.masquerSauvees = true;
  const pl = v('plateforme'); if (pl && pl in PLATEFORMES) f.plateforme = pl;
  const pa = v('pays')?.toUpperCase(); if (pa && /^[A-Z]{2}$/.test(pa)) f.pays = pa;
  const di = Number(v('diffusion')); if ((PALIERS_DIFFUSION as readonly number[]).includes(di)) f.diffusionMin = di;
  if (v('suivies') === '1') f.suiviesSeulement = true;
  return f;
}

/** La chaîne de recherche de l'adresse avec CES filtres · les autres paramètres sont gardés tels quels. */
export function ecrireFiltresLocaux(search: string, f: FiltresLocaux): string {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const k of CLES_ADRESSE_LOCALES) p.delete(k);
  if (f.cta !== null) p.set('cta', f.cta);
  if (f.masquerSauvees) p.set('masquer', 'sauvees');
  if (f.plateforme !== null) p.set('plateforme', f.plateforme);
  if (f.pays !== null) p.set('pays', f.pays);
  if (f.diffusionMin !== null) p.set('diffusion', String(f.diffusionMin));
  if (f.suiviesSeulement) p.set('suivies', '1');
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

/* ───────────────────────── vue liste ───────────────────────── */

export type AffichageVeille = 'grille' | 'liste';
/** Cookie d'ergonomie de l'appareil (comme le rail et le thème) · lu au rendu serveur, aucun saut d'affichage. */
export const AFFICHAGE_VEILLE_COOKIE = 'tt_veille_affichage';
/** Seule « liste » vaut liste · absent, vide ou inconnu · la grille de la maquette. */
export function affichageDepuisCookie(brut: string | null | undefined): AffichageVeille {
  return brut === 'liste' ? 'liste' : 'grille';
}
export function affichageCookieString(a: AffichageVeille): string {
  return `${AFFICHAGE_VEILLE_COOKIE}=${a}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * La largeur minimale du tableau de la vue liste · en dessous, il défile dans
 * son cadre (`styleTableDefilante`) au lieu d'écraser ses colonnes ou de faire
 * défiler la page.
 *
 * Mesuré le 08/11 (Chrome sans tête, fenêtre de 500 px, feuille Spatial, six
 * lignes semées · nom long « Maison Berthe & Fils Cosmétiques », appels à
 * l'action « ACHETER MAINTENANT », « En savoir plus », durées de 3 à 365 j) ·
 * cellules rognées hors nom et texte (qui s'arrêtent sur « … » à dessein) :
 *
 * | largeur min | sans | 640 | 720 | 760 | 820 | 860 | 900 | 980 |
 * | ----------- | ---- | --- | --- | --- | --- | --- | --- | --- |
 * | rognées     |  24  |  12 |  2  |  1  |  1  |  0  |  0  |  0  |
 * | sur 2 lignes|   9  |   9 |  8  |  4  |  2  |  1  |  1  |  1  |
 *
 * La seule ligne double qui reste est « ACHETER MAINTENANT », lisible sur deux
 * lignes. Retenu · 880, 20 px de marge au-dessus du seuil mesuré (860), et
 * sous la zone utile d'un écran de 1280 (≈ 926 px dans la carte, zoom 0,9 de
 * la Veille) · pas de défilement sur ordinateur. La page ne défile jamais en
 * largeur (mesuré · `scrollWidth` = largeur de l'écran à 500 px).
 */
export const LARGEUR_MIN_LISTE_VEILLE = 880;

/** Les colonnes de la vue liste · ce que la source donne, rien d'autre (ni variantes, ni date de vue). */
export const COLONNES_LISTE_VEILLE = ['Créative', 'Plateforme', 'Format', 'Diffusion', 'Appel à l’action', 'Texte de l’annonce', ''] as const;

/** Une ligne de la vue liste · lue sur l'annonce elle-même (plateforme, média, jours, statut). */
export function ligneListeVeille(ad: { platform: string; mediaType?: string | null; daysRunning?: number | null; status?: string | null }): { plateforme: string; format: string; diffusion: string } {
  const m = (ad.mediaType ?? '').toLowerCase();
  const format = m.includes('vid') ? 'Vidéo' : m.includes('carous') ? 'Carrousel' : m ? 'Image' : 'Non précisé';
  const j = typeof ad.daysRunning === 'number' && ad.daysRunning >= 0 ? `${ad.daysRunning} j` : 'Durée inconnue';
  const statut = /active|actif/i.test(ad.status ?? '') ? 'active' : ad.status ? 'arrêtée' : null;
  return { plateforme: PLATEFORMES[ad.platform] ?? ad.platform, format, diffusion: statut ? `${j} · ${statut}` : j };
}

/* ───────────────────────── précédente / suivante ───────────────────────── */

export interface VoisinsDetail {
  /** 1 à `total` · 0 quand la pub n'est plus dans la liste. */
  position: number;
  total: number;
  precedente: string | null;
  suivante: string | null;
  /** Pourquoi « Précédente » est fermée · `null` quand elle est ouverte. */
  raisonPrecedente: string | null;
  raisonSuivante: string | null;
  libelle: string;
}

/**
 * Les voisines d'une pub dans la liste COURANTE (filtrée, dans l'ordre
 * affiché) · on s'arrête aux bornes, sans boucler, et on dit pourquoi.
 */
export function voisinsDetail(cles: readonly string[], cle: string): VoisinsDetail {
  const i = cles.indexOf(cle);
  const total = cles.length;
  if (i < 0) {
    const r = 'Cette pub n’est plus dans la liste filtrée';
    return { position: 0, total, precedente: null, suivante: null, raisonPrecedente: r, raisonSuivante: r, libelle: r };
  }
  const seule = total === 1;
  return {
    position: i + 1, total,
    precedente: i > 0 ? cles[i - 1]! : null,
    suivante: i < total - 1 ? cles[i + 1]! : null,
    raisonPrecedente: i > 0 ? null : seule ? 'Seule pub de la liste' : 'Première pub de la liste',
    raisonSuivante: i < total - 1 ? null : seule ? 'Seule pub de la liste' : 'Dernière pub de la liste',
    libelle: `Pub ${i + 1} sur ${total}`,
  };
}

/** Les éléments où une flèche appartient à la saisie (ou au lecteur vidéo) · la navigation ne la vole jamais. */
const SAISIE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'AUDIO']);

/**
 * Quelle navigation une touche demande dans le détail · ← précédente, →
 * suivante · `null` dans un champ de saisie, un élément éditable, le lecteur
 * vidéo, ou avec une touche de modification (raccourcis du navigateur).
 */
export function toucheNavigationDetail(e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; cible?: { tagName?: string; isContentEditable?: boolean } | null }): 'precedente' | 'suivante' | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const c = e.cible;
  if (c && (SAISIE.has((c.tagName ?? '').toUpperCase()) || c.isContentEditable)) return null;
  if (e.key === 'ArrowLeft') return 'precedente';
  if (e.key === 'ArrowRight') return 'suivante';
  return null;
}
