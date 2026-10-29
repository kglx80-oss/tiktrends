/**
 * Spatial · Accueil · « Reporting Meta » (`section#reporting` de la maquette).
 * Pur · ni base, ni réseau · l'horloge (le jour de Paris) est passée.
 *
 * ── D'où viennent les chiffres ───────────────────────────────────────────────
 *
 * Des journées RÉELLES de `metrics_daily` (synchro Adsmap · `adsmap-sync`),
 * plateforme Meta, des créas de la marque active. Ce sont les annonces
 * rattachées aux tests de Résultats, pas le compte publicitaire entier · le
 * sous-titre le dit. Rien n'est extrapolé · une journée sans ligne vaut zéro
 * dépense, un ratio sans dénominateur vaut « n.c. », une variation sans
 * période précédente ne s'invente pas.
 *
 * ── La période ───────────────────────────────────────────────────────────────
 *
 * Comme la maquette · 7, 14 (défaut), 30, 90 jours, « Ce mois-ci », ou une
 * période personnalisée de 2 à 90 jours. Elle se termine HIER (la journée en
 * cours n'est pas close chez Meta) et se compare à la période précédente de
 * même durée.
 */

import { VALEUR_ABSENTE } from '../../ponctuation-ecran';
import { decalerJour, jourCourt, jourIso, joursEntre } from './temps';

export type ClePeriode = '7' | '14' | '30' | '90' | 'mois' | 'perso';

export const PERIODES_REPORTING: ReadonlyArray<{ cle: Exclude<ClePeriode, 'perso'>; libelle: string }> = [
  { cle: '7', libelle: '7 j' }, { cle: '14', libelle: '14 j' }, { cle: '30', libelle: '30 j' },
  { cle: '90', libelle: '90 j' }, { cle: 'mois', libelle: 'Ce mois-ci' },
];
export const PERIODE_DEFAUT: ClePeriode = '14';
export const JOURS_MAX_PERSO = 90;
export const JOURS_MIN_PERSO = 2;

export interface PeriodeReporting {
  cle: ClePeriode;
  jours: number;
  debut: string;
  fin: string;
  precDebut: string;
  precFin: string;
  /** « 8 oct. → 21 oct. · 14 jours · comparé aux 14 jours précédents ». */
  libelle: string;
  /** Le libellé du bouton « Personnalisé » (la plage choisie, sinon « Personnalisé »). */
  libellePerso: string;
  /** Bornes proposées au sélecteur de dates · la plus ancienne et la plus récente. */
  min: string;
  max: string;
}

/**
 * La période demandée par les paramètres de la page (`periode`, `du`, `au`).
 * Une valeur inconnue retombe sur le défaut · jamais d'erreur à l'écran.
 */
export function periodeReporting(p: { periode?: unknown; du?: unknown; au?: unknown; aujourdhui: string }): PeriodeReporting {
  const fin0 = decalerJour(p.aujourdhui, -1);
  const min = decalerJour(fin0, -(2 * JOURS_MAX_PERSO) + 1);
  let cle: ClePeriode = PERIODE_DEFAUT;
  let debut: string, fin = fin0;

  const du = jourIso(p.du), au = jourIso(p.au);
  if (p.periode === 'perso' && du && au) {
    let a = du <= au ? du : au, b = du <= au ? au : du;
    if (b > fin0) b = fin0;
    if (a > b) a = b;
    if (joursEntre(a, b) > JOURS_MAX_PERSO) a = decalerJour(b, -(JOURS_MAX_PERSO - 1));
    if (joursEntre(a, b) >= JOURS_MIN_PERSO) { cle = 'perso'; debut = a; fin = b; }
    else debut = decalerJour(fin0, -13);
  } else if (p.periode === 'mois') {
    cle = 'mois';
    debut = `${fin0.slice(0, 7)}-01`;
  } else if (p.periode === '7' || p.periode === '30' || p.periode === '90' || p.periode === '14') {
    cle = p.periode;
    debut = decalerJour(fin0, -(Number(p.periode) - 1));
  } else {
    debut = decalerJour(fin0, -13);
  }
  if (cle !== 'perso') fin = fin0;
  const jours = joursEntre(debut!, fin);
  const precFin = decalerJour(debut!, -1);
  const precDebut = decalerJour(precFin, -(jours - 1));
  const pl = jours > 1 ? 's' : '';
  return {
    cle, jours, debut: debut!, fin, precDebut, precFin,
    libelle: `${jourCourt(debut!)} → ${jourCourt(fin)} · ${jours} jour${pl} · comparé aux ${jours} jours précédents`,
    libellePerso: cle === 'perso' ? `${jourCourt(debut!)} → ${jourCourt(fin)}` : 'Personnalisé',
    min, max: fin0,
  };
}

/** L'adresse d'une période · les paramètres de la page Accueil. */
export function lienPeriodeReporting(cle: Exclude<ClePeriode, 'perso'> | { du: string; au: string }): string {
  if (typeof cle === 'string') return cle === PERIODE_DEFAUT ? '/dashboard#reporting' : `/dashboard?periode=${cle}#reporting`;
  return `/dashboard?${new URLSearchParams({ periode: 'perso', du: cle.du, au: cle.au })}#reporting`;
}

/** Une journée lue en base, toutes annonces Meta de la marque confondues. */
export interface JourneeMesuree {
  date: string;
  depense: number;
  impressions: number;
  clics: number;
  achats: number;
  revenu: number;
  /** Vues de 3 secondes · le numérateur du taux d'accroche. */
  vues3s: number;
}

export type TonVariation = 'neutre' | 'bon' | 'mauvais';

export interface KpiReporting {
  libelle: string;
  valeur: string;
  /** « ▲ +17,6 % », « ▼ −1,6 % », « ▲ +3,0 pts », ou « sans période précédente ». */
  variation: string;
  ton: TonVariation;
  /** Les points de la courbe (`polyline`, viewBox 120 × 34) · vide sans deux valeurs. */
  courbe: string;
}

export interface BarreGraphique { x: string; y: string; largeur: string; hauteur: string; titre: string }
export interface GraduationGraphique { y: number; texte: string }

export interface GraphiqueReporting {
  libelle: string;
  grille: number[];
  gauche: GraduationGraphique[];
  droite: GraduationGraphique[];
  barres: BarreGraphique[];
  ligne: string;
  dernier: { cx: string; cy: string } | null;
  bas: Array<{ x: string; texte: string }>;
}

export interface SyntheseReporting {
  kpis: KpiReporting[];
  graphique: GraphiqueReporting;
}

const somme = (xs: readonly JourneeMesuree[], k: keyof Omit<JourneeMesuree, 'date'>) => xs.reduce((t, x) => t + (Number.isFinite(x[k]) ? x[k] : 0), 0);
const dec = (n: number, k = 2) => n.toFixed(k).replace('.', ',');
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Le dessin d'une petite courbe · la formule de la maquette (`spk`). */
export function courbeKpi(valeurs: ReadonlyArray<number | null>): string {
  const pts = valeurs.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null && Number.isFinite(p.v));
  if (pts.length < 2 || valeurs.length < 2) return '';
  const W = 120, H = 34;
  const mn = Math.min(...pts.map((p) => p.v)), mx = Math.max(...pts.map((p) => p.v));
  return pts.map((p) => `${(p.i * W / (valeurs.length - 1)).toFixed(1)},${(H - 3 - (p.v - mn) / ((mx - mn) || 1) * (H - 6)).toFixed(1)}`).join(' ');
}

/** La variation d'un KPI contre la période précédente · partagée avec les chiffres clés (`chiffresClesMeta`). */
export function variationKpi(c: number | null, p: number | null, sens: -1 | 0 | 1, unite: '%' | 'pts'): { texte: string; ton: TonVariation } {
  if (c === null || p === null || (unite === '%' && p === 0)) return { texte: 'sans période précédente', ton: 'neutre' };
  const d = unite === 'pts' ? c - p : (c / p - 1) * 100;
  const fleche = d > 0 ? '▲' : d < 0 ? '▼' : '=';
  const signe = d > 0 ? '+' : d < 0 ? '−' : '';
  const ton: TonVariation = sens === 0 || d === 0 ? 'neutre' : d * sens > 0 ? 'bon' : 'mauvais';
  return { texte: `${fleche} ${signe}${dec(Math.abs(d), 1)}${unite === 'pts' ? ' pts' : ' %'}`, ton };
}

/**
 * Les six KPI et le graphique de la période · `null` quand AUCUNE journée n'est
 * mesurée sur la période ni sur la précédente (l'écran dit alors qu'il n'y a
 * pas de mesure, plutôt que d'afficher des zéros).
 */
export function syntheseReporting(lignes: readonly JourneeMesuree[], periode: PeriodeReporting): SyntheseReporting | null {
  const parJour = new Map<string, JourneeMesuree>();
  for (const l of lignes) {
    const d = jourIso(l.date);
    if (!d) continue;
    const prec = parJour.get(d);
    parJour.set(d, prec ? {
      date: d, depense: prec.depense + l.depense, impressions: prec.impressions + l.impressions, clics: prec.clics + l.clics,
      achats: prec.achats + l.achats, revenu: prec.revenu + l.revenu, vues3s: prec.vues3s + l.vues3s,
    } : { ...l, date: d });
  }
  const vide = (date: string): JourneeMesuree => ({ date, depense: 0, impressions: 0, clics: 0, achats: 0, revenu: 0, vues3s: 0 });
  const serie = (a: string, n: number) => Array.from({ length: n }, (_, i) => { const d = decalerJour(a, i); return parJour.get(d) ?? vide(d); });
  const cur = serie(periode.debut, periode.jours);
  const prev = serie(periode.precDebut, periode.jours);
  const mesure = (xs: JourneeMesuree[]) => xs.some((x) => parJour.has(x.date));
  if (!mesure(cur) && !mesure(prev)) return null;

  const agg = (xs: JourneeMesuree[]) => {
    const s = somme(xs, 'depense'), rev = somme(xs, 'revenu'), buy = somme(xs, 'achats'), imp = somme(xs, 'impressions');
    const clics = somme(xs, 'clics'), v3 = somme(xs, 'vues3s');
    return {
      s: mesure(xs) ? s : null, roas: ratio(rev, s), cpa: buy > 0 ? s / buy : null, buy: mesure(xs) ? buy : null,
      ctr: imp > 0 ? (clics / imp) * 100 : null, hook: imp > 0 && v3 > 0 ? (v3 / imp) * 100 : null,
    };
  };
  const c = agg(cur), p = agg(prev);
  const parJourVal = (f: (x: JourneeMesuree) => number | null) => cur.map(f);

  const def: Array<{ libelle: string; v: number | null; pv: number | null; fmt: (n: number) => string; sens: -1 | 0 | 1; unite: '%' | 'pts'; serie: Array<number | null> }> = [
    { libelle: 'Dépense', v: c.s, pv: p.s, fmt: eur, sens: 0, unite: '%', serie: parJourVal((x) => x.depense) },
    { libelle: 'ROAS', v: c.roas, pv: p.roas, fmt: (n) => dec(n), sens: 1, unite: '%', serie: parJourVal((x) => ratio(x.revenu, x.depense)) },
    { libelle: 'Coût par achat', v: c.cpa, pv: p.cpa, fmt: (n) => `${dec(n)} €`, sens: -1, unite: '%', serie: parJourVal((x) => (x.achats > 0 ? x.depense / x.achats : null)) },
    { libelle: 'Achats', v: c.buy, pv: p.buy, fmt: (n) => Math.round(n).toLocaleString('fr-FR'), sens: 1, unite: '%', serie: parJourVal((x) => x.achats) },
    { libelle: 'CTR', v: c.ctr, pv: p.ctr, fmt: (n) => `${dec(n)} %`, sens: 1, unite: '%', serie: parJourVal((x) => (x.impressions > 0 ? (x.clics / x.impressions) * 100 : null)) },
    { libelle: 'Taux d’accroche', v: c.hook, pv: p.hook, fmt: (n) => `${dec(n, 1)} %`, sens: 1, unite: 'pts', serie: parJourVal((x) => (x.impressions > 0 && x.vues3s > 0 ? (x.vues3s / x.impressions) * 100 : null)) },
  ];
  const kpis: KpiReporting[] = def.map((k) => {
    const va = variationKpi(k.v, k.pv, k.sens, k.unite);
    return { libelle: k.libelle, valeur: k.v === null ? VALEUR_ABSENTE : k.fmt(k.v), variation: va.texte, ton: va.ton, courbe: courbeKpi(k.serie) };
  });

  return { kpis, graphique: graphiqueReporting(cur, periode.jours) };
}

/** Le graphique « Dépense par jour et ROAS » · la géométrie de la maquette (viewBox 1200 × 300). */
export function graphiqueReporting(cur: readonly JourneeMesuree[], n: number): GraphiqueReporting {
  const W = 1200, H = 300, L = 64, R = 52, T = 18, B = 34, iw = W - L - R, ih = H - T - B;
  const smax = Math.max(400, Math.ceil(Math.max(0, ...cur.map((x) => x.depense)) / 400) * 400);
  const roas = cur.map((x) => ratio(x.revenu, x.depense));
  const rmax = Math.max(3, Math.ceil(Math.max(0, ...roas.filter((r): r is number => r !== null))));
  const bw = iw / Math.max(1, n);
  const X = (i: number) => L + i * bw;
  const Ys = (v: number) => T + ih - (v / smax) * ih;
  const Yr = (v: number) => T + ih - (v / rmax) * ih;
  const step = n <= 7 ? 1 : n <= 14 ? 2 : n <= 31 ? 5 : n <= 62 ? 10 : 15;
  const k4 = [0, 1, 2, 3];
  const points = cur.map((x, i) => ({ i, r: roas[i] ?? null })).filter((p): p is { i: number; r: number } => p.r !== null);
  const der = points[points.length - 1];
  return {
    libelle: `Dépense quotidienne et ROAS sur ${n} jours`,
    grille: k4.map((k) => Ys(smax * k / 3)),
    gauche: k4.map((k) => ({ y: Ys(smax * k / 3) + 4, texte: `${Math.round(smax * k / 3)} €` })),
    droite: k4.map((k) => ({ y: Yr(rmax * k / 3) + 4, texte: dec(rmax * k / 3, 1) })),
    barres: cur.map((x, i) => ({
      x: (X(i) + bw * 0.18).toFixed(1), y: Ys(x.depense).toFixed(1), largeur: (bw * 0.64).toFixed(1), hauteur: (T + ih - Ys(x.depense)).toFixed(1),
      titre: `${jourCourt(x.date)} · ${eur(x.depense)} · ROAS ${roas[i] === null ? VALEUR_ABSENTE : dec(roas[i]!)}`,
    })),
    ligne: points.map((p) => `${(X(p.i) + bw / 2).toFixed(1)},${Yr(p.r).toFixed(1)}`).join(' '),
    dernier: der ? { cx: (X(der.i) + bw / 2).toFixed(1), cy: Yr(der.r).toFixed(1) } : null,
    bas: cur.flatMap((x, i) => ((n - 1 - i) % step === 0 ? [{ x: (X(i) + bw / 2).toFixed(1), texte: jourCourt(x.date) }] : [])),
  };
}

/**
 * Le sous-titre · la marque et l'état de la connexion Meta dit par LE libellé
 * partagé (`etatConnexionMeta`) · le même mot que la vue Analytics et le Radar.
 * Ce que couvrent les chiffres est dit par la phrase de source des chiffres
 * clés (`chiffresClesMeta`) et par l'en-tête du détail des annonces suivies ·
 * le sous-titre ne parle plus pour eux (D2).
 */
export function sousTitreReporting(p: { marque: string; connexion: string }): string {
  return [p.marque, p.connexion].join(' · ');
}

/**
 * Les choix rapides du sélecteur « Personnalisé » (`dpop` de la maquette),
 * calculés sur le calendrier réel · la semaine (lundi → dimanche) et le mois
 * précédents, puis les 60 et 90 derniers jours (jusqu'à hier).
 */
export function choixRapidesPeriode(aujourdhui: string): Array<{ libelle: string; du: string; au: string }> {
  const hier = decalerJour(aujourdhui, -1);
  const jourSemaine = (new Date(`${aujourdhui}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = lundi
  const lundiCourant = decalerJour(aujourdhui, -jourSemaine);
  const finMoisPrec = decalerJour(`${aujourdhui.slice(0, 7)}-01`, -1);
  return [
    { libelle: 'Semaine dernière', du: decalerJour(lundiCourant, -7), au: decalerJour(lundiCourant, -1) },
    { libelle: 'Mois dernier', du: `${finMoisPrec.slice(0, 7)}-01`, au: finMoisPrec },
    { libelle: '60 derniers jours', du: decalerJour(hier, -59), au: hier },
    { libelle: '90 derniers jours', du: decalerJour(hier, -89), au: hier },
  ];
}
