import { wilsonInterval } from '../../adsmap/stats';
import { MIN_N_WINDOW } from '../../adsmap/trend';
import { COMPOSITION_LABEL, HOOK_LABEL, type Composition, type HookType } from '../../adsmap/asset-taxonomy';
import { estCleStyle, styleCrea } from './catalogue';

/**
 * Les tendances de l'écran « Tendances » (maquette Spatial). Pur · ni base, ni
 * horloge (le `maintenant` est fourni).
 *
 * ── Ce qu'on mesure, sur quoi ────────────────────────────────────────────────
 *
 * Aucun « capteur » ne parcourt les bibliothèques publicitaires · on lit ce qui
 * est DÉJÀ en base, et on le dit :
 *  · « Format » · les sauvegardes CLASSÉES de l'espace, datées du jour de la
 *    sauvegarde, rangées par style (le style d'un format normatif) ;
 *  · « Accroche » et « Visuel » · les créas concurrentes décrites (radar et
 *    marques suivies), datées du jour où elles sont entrées, par type
 *    d'accroche et par composition.
 *
 * ── La règle · une PART qui bouge, comparée à la référence ───────────────────
 *
 * Pour un type, trois fenêtres de 30 jours qui se touchent (C la plus récente,
 * B avant, A avant B). La part d'un groupe dans une fenêtre = ses entrées /
 * toutes les entrées de ce type dans la fenêtre. On ne compare jamais à zéro ·
 * on compare la part récente à la part d'avant, et seulement quand les deux
 * intervalles de Wilson NE se touchent PAS.
 *
 *  · En croissance · borne basse de C > borne haute de B ;
 *  · Émergente · en croissance, et absente de B comme de A ;
 *  · En déclin · borne haute de C < borne basse de B ;
 *  · Au pic · C et B ne se départagent pas, mais B dépassait nettement A.
 *
 * Tout le reste est du SILENCE · la conclusion la plus fréquente, et valable.
 *
 * ── Les seuils ne sont pas posés ici ─────────────────────────────────────────
 *
 * Effectif minimal par fenêtre et niveau des intervalles sont ceux de la
 * comparaison de fenêtres déjà en place (`adsmap/trend.ts` · `MIN_N_WINDOW`,
 * Wilson unilatéral à 0,8). Aucune valeur écrite de tête · un seul étalon dans
 * le dépôt pour « deux fenêtres se départagent ».
 */

export type TypeTendance = 'format' | 'accroche' | 'visuel';
export const TYPES_TENDANCE: readonly TypeTendance[] = ['format', 'accroche', 'visuel'];
export const LIBELLE_TYPE_TENDANCE: Record<TypeTendance, string> = { format: 'Format', accroche: 'Accroche', visuel: 'Visuel' };

export type EtapeTendance = 'emergente' | 'croissance' | 'pic' | 'declin';
export const ETAPES_TENDANCE: readonly EtapeTendance[] = ['emergente', 'croissance', 'pic', 'declin'];
export const LIBELLE_ETAPE_TENDANCE: Record<EtapeTendance, string> = { emergente: 'Émergente', croissance: 'En croissance', pic: 'Au pic', declin: 'En déclin' };
/** Couleur d'étape · celles de la maquette (bleu, vert, jaune, rouge). */
export const COULEUR_ETAPE_TENDANCE: Record<EtapeTendance, string> = { emergente: '#7cc6dd', croissance: '#7ef0b0', pic: '#ffd76a', declin: '#ff8a8a' };

export const FENETRE_TENDANCE_JOURS = 30;
export const EFFECTIF_MIN_FENETRE_TENDANCE = MIN_N_WINDOW;
export const NIVEAU_TENDANCE = 0.8;
export const SEMAINES_COURBE_TENDANCE = 10;

const JOUR = 86_400_000;

export interface ObservationTendance {
  type: TypeTendance;
  /** Le groupe (clé de style, type d'accroche, composition) · `null` = compte dans le total du type, sans groupe. */
  groupe: string | null;
  /** Date d'entrée (ms). */
  date: number;
  annonceur: string | null;
  /** La marque est suivie par l'espace. */
  concurrent: boolean;
  jours: number | null;
  vignette?: string | null;
}

export interface Tendance {
  cle: string;
  type: TypeTendance;
  groupe: string;
  etape: EtapeTendance;
  /** Entrées du groupe / total, fenêtre récente (C) et précédente (B). */
  recent: { k: number; n: number; part: number };
  avant: { k: number; n: number; part: number };
  /** Écart de part en points (C − B), arrondi. */
  ecartPoints: number;
  /** Annonceurs distincts du groupe sur la fenêtre récente, et combien sont suivis. */
  marques: number;
  concurrents: number;
  /** Diffusion moyenne (jours) des entrées récentes · `null` sans durée connue. */
  joursMoyens: number | null;
  /** Entrées du groupe par semaine, la plus ancienne d'abord (10 semaines). */
  semaines: number[];
  vignettes: string[];
}

export interface FenetresType { recent: number; avant: number; ancien: number; /** Les deux fenêtres comparées ont l'effectif requis. */ parle: boolean }

export interface ResultatTendances {
  tendances: Tendance[];
  fenetres: Record<TypeTendance, FenetresType>;
  /** Observations lues sur les 90 jours. */
  observations: number;
}

interface Compte { k: number; n: number }
const part = (c: Compte) => (c.n > 0 ? c.k / c.n : 0);
const ic = (c: Compte) => wilsonInterval(c.k, c.n, NIVEAU_TENDANCE);
const monte = (apres: Compte, avant: Compte) => ic(apres).lo > ic(avant).hi;
const baisse = (apres: Compte, avant: Compte) => ic(apres).hi < ic(avant).lo;

export function detecterTendances(obs: readonly ObservationTendance[], maintenant: number): ResultatTendances {
  const W = FENETRE_TENDANCE_JOURS * JOUR;
  const fen = (t: number): 0 | 1 | 2 | null => {
    const age = maintenant - t;
    if (!(age >= 0) || age >= 3 * W) return null;
    return age < W ? 0 : age < 2 * W ? 1 : 2;
  };
  const tendances: Tendance[] = [];
  const fenetres = {} as Record<TypeTendance, FenetresType>;
  let observations = 0;

  for (const type of TYPES_TENDANCE) {
    const totaux = [0, 0, 0];
    const groupes = new Map<string, { k: [number, number, number]; recents: ObservationTendance[] }>();
    for (const o of obs) {
      if (o.type !== type) continue;
      const f = fen(o.date);
      if (f === null) continue;
      observations++;
      totaux[f]!++;
      if (!o.groupe) continue;
      const g = groupes.get(o.groupe) ?? { k: [0, 0, 0], recents: [] };
      g.k[f]++;
      if (f === 0) g.recents.push(o);
      groupes.set(o.groupe, g);
    }
    const [nC, nB, nA] = totaux as [number, number, number];
    const parle = nC >= EFFECTIF_MIN_FENETRE_TENDANCE && nB >= EFFECTIF_MIN_FENETRE_TENDANCE;
    fenetres[type] = { recent: nC, avant: nB, ancien: nA, parle };
    if (!parle) continue;

    for (const [groupe, g] of groupes) {
      const C = { k: g.k[0], n: nC }, B = { k: g.k[1], n: nB }, A = { k: g.k[2], n: nA };
      let etape: EtapeTendance | null = null;
      if (monte(C, B)) etape = g.k[1] === 0 && g.k[2] === 0 ? 'emergente' : 'croissance';
      else if (baisse(C, B)) etape = 'declin';
      else if (nA >= EFFECTIF_MIN_FENETRE_TENDANCE && monte(B, A)) etape = 'pic';
      if (!etape) continue;
      tendances.push(construire(type, groupe, etape, C, B, g.recents, obs, maintenant));
    }
  }

  const ordre = new Map(ETAPES_TENDANCE.map((e, i) => [e, i]));
  tendances.sort((a, b) => ordre.get(a.etape)! - ordre.get(b.etape)! || Math.abs(b.ecartPoints) - Math.abs(a.ecartPoints) || a.cle.localeCompare(b.cle));
  return { tendances, fenetres, observations };
}

function construire(type: TypeTendance, groupe: string, etape: EtapeTendance, C: Compte, B: Compte, recents: ObservationTendance[], obs: readonly ObservationTendance[], maintenant: number): Tendance {
  const annonceurs = new Map<string, boolean>();
  for (const o of recents) if (o.annonceur) annonceurs.set(o.annonceur, (annonceurs.get(o.annonceur) ?? false) || o.concurrent);
  const jours = recents.map((o) => o.jours).filter((j): j is number => typeof j === 'number' && Number.isFinite(j) && j >= 0);
  const semaines = new Array<number>(SEMAINES_COURBE_TENDANCE).fill(0);
  for (const o of obs) {
    if (o.type !== type || o.groupe !== groupe) continue;
    const i = SEMAINES_COURBE_TENDANCE - 1 - Math.floor((maintenant - o.date) / (7 * JOUR));
    if (i >= 0 && i < SEMAINES_COURBE_TENDANCE && maintenant - o.date >= 0) semaines[i]!++;
  }
  return {
    cle: `${type}:${groupe}`, type, groupe, etape,
    recent: { ...C, part: part(C) }, avant: { ...B, part: part(B) },
    ecartPoints: Math.round((part(C) - part(B)) * 100),
    marques: annonceurs.size, concurrents: [...annonceurs.values()].filter(Boolean).length,
    joursMoyens: jours.length ? Math.round(jours.reduce((a, b) => a + b, 0) / jours.length) : null,
    semaines,
    vignettes: recents.map((o) => o.vignette).filter((v): v is string => !!v).slice(0, 3),
  };
}

/* ── Libellés ─────────────────────────────────────────────────────────────── */

/** Le nom et la ligne d'explication d'une tendance. */
export function libelleTendance(t: Pick<Tendance, 'type' | 'groupe'>): { nom: string; sous: string } {
  if (t.type === 'format' && estCleStyle(t.groupe)) {
    const s = styleCrea(t.groupe);
    return { nom: s.nom, sous: s.definition };
  }
  if (t.type === 'accroche') return { nom: HOOK_LABEL[t.groupe as HookType] ?? t.groupe, sous: 'Type d’accroche lu dans les créas concurrentes décrites' };
  if (t.type === 'visuel') return { nom: COMPOSITION_LABEL[t.groupe as Composition] ?? t.groupe, sous: 'Composition lue dans les créas concurrentes décrites' };
  return { nom: t.groupe, sous: '' };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** La phrase « pourquoi » · uniquement des faits mesurés. */
export function explicationTendance(t: Tendance): string {
  const src = t.type === 'format' ? 'sauvegardes classées' : 'créas concurrentes repérées';
  const r = `${pl(t.recent.k, t.type === 'format' ? 'sauvegarde' : 'créa', t.type === 'format' ? 'sauvegardes' : 'créas')} sur ${t.recent.n}`;
  let phrase: string;
  switch (t.etape) {
    case 'emergente': phrase = `Absente le mois d’avant, ${r} ces 30 derniers jours (${pct(t.recent.part)}).`; break;
    case 'croissance': phrase = `${r} ces 30 derniers jours (${pct(t.recent.part)}), contre ${t.avant.k} sur ${t.avant.n} le mois d’avant (${pct(t.avant.part)}).`; break;
    case 'pic': phrase = `Après une hausse nette, la part ne bouge plus (${pct(t.recent.part)} ces 30 derniers jours) · la tendance plafonne.`; break;
    case 'declin': phrase = `${pct(t.recent.part)} des ${src} ces 30 derniers jours, contre ${pct(t.avant.part)} le mois d’avant.`; break;
  }
  if (t.marques > 0) phrase += ` ${pl(t.marques, 'marque', 'marques')}${t.concurrents > 0 ? `, dont ${t.concurrents} que tu suis` : ''}.`;
  return phrase;
}

/** L'écart affiché · « +12 pts », « −8 pts » (signe moins typographique). */
export function ecartTendance(points: number): string {
  if (points > 0) return `+${points} pts`;
  if (points < 0) return `−${Math.abs(points)} pts`;
  return '0 pt';
}

/* ── Géométrie des graphiques (calculée ici, dessinée par la vue) ─────────── */

const LARGEUR = 1000;
/** Les zones d'étape de la courbe (maquette) · [début, fin] en unités du viewBox. */
export const ZONES_COURBE_TENDANCE: ReadonlyArray<readonly [number, number, EtapeTendance]> = [[0, 300, 'emergente'], [300, 500, 'croissance'], [500, 690, 'pic'], [690, 1000, 'declin']];
const yCourbe = (x: number) => 176 - 132 * Math.exp(-(((x - 560) / 210) ** 2));

/** Le tracé de la courbe de cycle de vie (`d` d'un path) · fixe. */
export function traceCourbeTendances(): string {
  let d = '';
  for (let x = 0; x <= LARGEUR; x += 10) d += (x ? 'L' : 'M') + x + ',' + yCourbe(x).toFixed(1);
  return d;
}

/** La position de chaque tendance sur la courbe · répartie dans la zone de son étape, dans l'ordre reçu. */
export function pointsCourbeTendances(etapes: readonly EtapeTendance[]): Array<{ x: number; y: number }> {
  const parZone = new Map<EtapeTendance, number[]>();
  etapes.forEach((e, i) => parZone.set(e, [...(parZone.get(e) ?? []), i]));
  const out = new Array<{ x: number; y: number }>(etapes.length);
  for (const [a, b, e] of ZONES_COURBE_TENDANCE) {
    const idx = parZone.get(e) ?? [];
    idx.forEach((i, j) => {
      const x = Math.round(a + ((b - a) * (j + 1)) / (idx.length + 1));
      out[i] = { x, y: Math.round(yCourbe(x) * 10) / 10 };
    });
  }
  return out;
}

/** Les points d'une mini-courbe (viewBox 120 × 32) · aplatie à la base quand tout vaut 0. */
export function pointsSparklineTendance(valeurs: readonly number[]): string {
  const m = Math.max(0, ...valeurs);
  const n = Math.max(1, valeurs.length - 1);
  return valeurs.map((v, i) => `${((i / n) * 116 + 2).toFixed(1)},${(30 - (m > 0 ? (v / m) * 26 : 0)).toFixed(1)}`).join(' ');
}

/* ── Ce que l'écran propose pour une tendance ─────────────────────────────── */

/** La pastille de tendance sur la page d'un style · rien quand la tendance n'est pas mesurée. */
export function pastilleTendanceStyle(t: Tendance | null | undefined): { classe: 'g' | 'w' | ''; texte: string } | null {
  if (!t) return null;
  if (t.etape === 'declin') return { classe: 'w', texte: `${ecartTendance(t.ecartPoints)} ce mois` };
  if (t.etape === 'pic') return { classe: '', texte: 'Au pic ce mois' };
  return { classe: 'g', texte: `${ecartTendance(t.ecartPoints)} ce mois` };
}

export interface CtaTendance {
  /** Le geste principal · `null` en déclin (on n'y pousse pas). */
  primaire: { libelle: string; href: string } | null;
  /** En déclin · l'avertissement à la place du geste. */
  alerte: string | null;
  /** Où voir les annonces derrière la tendance · `null` quand l'écran n'est pas ouvert à la personne. */
  voir: { libelle: string; href: string } | null;
}

/**
 * Les gestes d'une carte · vers des destinations RÉELLES · la préparation d'un
 * projet (consigne passée en `angle`), la page du style, le radar concurrents.
 * `lienProjet` est fourni (constructeur d'URL du noyau, `lienNouveauProjet`).
 */
export function ctaTendance(t: Tendance, o: { lienProjet: (consigne: string) => string; radarOuvert: boolean }): CtaTendance {
  const { nom } = libelleTendance(t);
  const consigne = t.type === 'format' && estCleStyle(t.groupe)
    ? `Format « ${nom} » · ${styleCrea(t.groupe).definition}`
    : t.type === 'accroche' ? `Accroche de type « ${nom} », repérée en hausse chez les concurrents` : `Composition « ${nom} », repérée en hausse chez les concurrents`;
  const primaire = t.etape === 'declin' ? null : { libelle: t.type === 'accroche' ? 'Créer avec cette accroche' : t.type === 'format' ? 'Créer avec ce format' : 'Créer avec ce visuel', href: o.lienProjet(consigne) };
  const voir = t.type === 'format'
    ? { libelle: 'Voir le format', href: `/veille/formats/${t.groupe}` }
    : o.radarOuvert ? { libelle: 'Voir le radar concurrents', href: '/adsmap/radar' } : null;
  return { primaire, alerte: t.etape === 'declin' ? 'En recul · à éviter pour l’instant' : null, voir };
}

/* ── Ce que l'écran affiche, préparé ici (jamais dans le JSX) ─────────────── */

export interface CarteTendance {
  cle: string;
  /** Le libellé du type (« Format », « Accroche », « Visuel »). */
  type: string;
  etape: EtapeTendance;
  nom: string;
  sous: string;
  /** Part récente, 0 à 100. */
  part: number;
  ecart: string;
  hausse: boolean;
  marques: number;
  concurrents: number;
  jours: string;
  semaines: number[];
  vignettes: string[];
  pourquoi: string;
  cta: CtaTendance;
}

export function carteTendance(t: Tendance, o: { lienProjet: (consigne: string) => string; radarOuvert: boolean }): CarteTendance {
  const { nom, sous } = libelleTendance(t);
  return {
    cle: t.cle, type: LIBELLE_TYPE_TENDANCE[t.type], etape: t.etape, nom, sous,
    part: Math.round(t.recent.part * 100), ecart: ecartTendance(t.ecartPoints), hausse: t.ecartPoints >= 0,
    marques: t.marques, concurrents: t.concurrents, jours: t.joursMoyens === null ? 'n/c' : `${t.joursMoyens} j`,
    semaines: t.semaines, vignettes: t.vignettes, pourquoi: explicationTendance(t), cta: ctaTendance(t, o),
  };
}

/** Les quatre chiffres de l'en-tête · tous mesurés. */
export function kpisTendances(r: ResultatTendances): Array<[string, string]> {
  const n = (x: number) => x.toLocaleString('fr-FR');
  return [
    [n(r.observations), 'annonces lues sur 90 jours'],
    [n(r.tendances.length), r.tendances.length > 1 ? 'tendances mesurées' : 'tendance mesurée'],
    [n(r.tendances.filter((t) => t.etape === 'emergente').length), 'émergentes ce mois'],
    [n(r.tendances.filter((t) => t.concurrents > 0).length), 'chez des marques que tu suis'],
  ];
}

/** Le silence, dit avec ses effectifs · pourquoi aucune tendance n'apparaît. */
export function silenceTendances(r: ResultatTendances): string {
  const minces = TYPES_TENDANCE.filter((t) => !r.fenetres[t].parle);
  if (r.observations === 0) return 'Aucune annonce à lire pour l’instant · classe tes sauvegardes et suis des concurrents, les tendances se calculent sur ce qui est déjà en base.';
  if (minces.length === TYPES_TENDANCE.length) {
    const d = TYPES_TENDANCE.map((t) => `${LIBELLE_TYPE_TENDANCE[t].toLowerCase()} ${r.fenetres[t].recent} ce mois / ${r.fenetres[t].avant} le mois d’avant`).join(' · ');
    return `Pas encore assez d’annonces pour comparer deux mois (il en faut ${EFFECTIF_MIN_FENETRE_TENDANCE} par mois) · ${d}.`;
  }
  return 'Rien ne se départage nettement ce mois-ci · aucune part ne s’écarte du mois d’avant au-delà de l’incertitude. C’est une conclusion, pas une panne.';
}

/** L'état RÉEL du radar concurrents (armé, dernier passage). */
export function etatRadarTendances(r: { armed: boolean; lastRunAt: string | null } | null): string {
  if (!r) return 'Aucune marque active · choisis une marque pour lire son radar concurrents.';
  const d = r.lastRunAt ? new Date(r.lastRunAt) : null;
  const quand = d && !Number.isNaN(d.getTime()) ? `dernier passage le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}` : 'aucun passage encore';
  return r.armed ? `Armé · ${quand}` : `Éteint · ${quand} · les tendances se calculent sur ce qui est déjà en base`;
}

const SOURCES: ReadonlyArray<[cle: string, lettre: string, couleur: string, nom: string]> = [
  ['meta', 'M', '#0467df', 'Meta Ad Library'], ['tiktok', 'T', '#111', 'TikTok Creative Center'], ['google', 'G', '#34a853', 'Google Ads Transparency'],
];

/** Les sources lues, avec leur volume réel sur 90 jours · `off` quand rien n'en vient. */
export function sourcesTendances(parPlateforme: Readonly<Record<string, number>>): Array<{ lettre: string; couleur: string; nom: string; detail: string; actif: boolean }> {
  return SOURCES.map(([cle, lettre, couleur, nom]) => {
    const n = parPlateforme[cle] ?? 0;
    return { lettre, couleur, nom, detail: n > 0 ? `${n.toLocaleString('fr-FR')} annonce${n > 1 ? 's' : ''} lue${n > 1 ? 's' : ''} · 90 j` : 'Aucune annonce lue', actif: n > 0 };
  });
}

/* ── Les observations, depuis les lignes réelles ──────────────────────────── */

export interface SauvegardePourTendance {
  sauvegardeLe: string;
  /** Le style du format classé · `null` = classée dans un format sans style (compte dans le total). */
  style: string | null;
  classee: boolean;
  annonceur: string | null;
  plateforme: string;
  jours: number | null;
  vignette: string | null;
}

/** Les sauvegardes CLASSÉES deviennent des observations « format » · les non classées ne comptent pas. */
export function observationsSauvegardes(rows: readonly SauvegardePourTendance[], suivis: ReadonlySet<string>): ObservationTendance[] {
  return rows.filter((r) => r.classee).map((r) => ({
    type: 'format' as const, groupe: r.style, date: Date.parse(r.sauvegardeLe), annonceur: r.annonceur,
    concurrent: !!r.annonceur && suivis.has(`${r.plateforme}:${r.annonceur}`), jours: r.jours, vignette: r.vignette,
  })).filter((o) => Number.isFinite(o.date));
}

export interface CreaMarchePourTendance {
  creeLe: string;
  hookType: string | null;
  composition: string | null;
  annonceur: string | null;
  provenance: string | null;
  jours: number | null;
}

/** Une créa concurrente décrite donne une observation « accroche » et une « visuel » · chacune seulement si la valeur est lue. */
export function observationsMarche(rows: readonly CreaMarchePourTendance[]): ObservationTendance[] {
  const out: ObservationTendance[] = [];
  for (const r of rows) {
    const date = Date.parse(r.creeLe);
    if (!Number.isFinite(date)) continue;
    const base = { date, annonceur: r.annonceur, concurrent: r.provenance === 'followed', jours: r.jours };
    // Une valeur absente ou hors liste n'est pas une observation · elle ne
    // gonfle pas le total d'un type qu'on n'a pas lu.
    if (r.hookType && Object.prototype.hasOwnProperty.call(HOOK_LABEL, r.hookType)) out.push({ ...base, type: 'accroche', groupe: r.hookType });
    if (r.composition && Object.prototype.hasOwnProperty.call(COMPOSITION_LABEL, r.composition)) out.push({ ...base, type: 'visuel', groupe: r.composition });
  }
  return out;
}
