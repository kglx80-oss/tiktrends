/**
 * Spatial · LES chiffres clés Meta d'une marque · UNE règle pour tous les
 * écrans qui les montrent (Accueil · Reporting Meta, vue Analytics, Jarvis ·
 * « Chiffres clés », Radar créatif).
 *
 * Pourquoi (planche finale, défaut D2) · sur la même marque, l'Accueil montrait
 * 503 € de dépense et un ROAS de 1,53, Analytics disait « les KPI du compte
 * n'ont pas encore été relevés », Jarvis « aucune source branchée · n.c. » et le
 * Radar « aucune créa Meta relevée ». #939 avait unifié l'ÉTAT de la connexion
 * (`etatConnexionMeta`), pas les CHIFFRES · chaque écran lisait encore SA source :
 *  · l'Accueil · la mesure par annonce (`metrics_daily` des annonces rattachées
 *    aux tests, synchro Adsmap), sur la période choisie (14 j par défaut) ;
 *  · Analytics et le Radar · les KPI du compte (`brands.ads_insights_json`,
 *    30 j, `meta_synced_at`) ;
 *  · Jarvis · rien (`encartKpiJarvis(null)`, vide en dur).
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Quatre chiffres · Dépense, CPA, ROAS, Valeur d'achat (les cartes de la
 * maquette Jarvis), plus le nombre de créas mesurées. Une seule fenêtre ·
 * 30 jours, comparés aux 30 jours précédents (la seule que les KPI du compte
 * portent · `fenetresMeta`, intégrations). Une seule source, par priorité :
 *
 *  1. `compte` · les KPI du compte publicitaire, s'ils sont stockés · ils
 *     couvrent TOUTES les annonces du compte. Datés de leur relevé.
 *  2. `annonces` · sinon, l'agrégat de la mesure par annonce (les annonces
 *     suivies, rattachées aux tests), sur les 30 jours qui finissent hier, s'il
 *     y a au moins une journée mesurée dans la fenêtre. Dit comme tel · « d'après
 *     tes annonces suivies ».
 *  3. `aucune` · sinon. Les quatre valeurs valent « n.c. », partout pareil.
 *
 * Une connexion à brancher ou dont le compte pub reste à choisir n'a pas de
 * chiffres · une ancienne mesure ne fait pas une connexion (même règle que
 * `etatConnexionMeta`).
 *
 * Rien n'est inventé · un ratio sans dénominateur vaut « n.c. », une variation
 * sans période précédente est absente. Pur · le jour de Paris est passé.
 */
import { VALEUR_ABSENTE } from '../ponctuation-ecran';
import { encartKpiJarvis, type EncartKpiJarvis } from '../jarvis-accueil';
import type { EtatConnexionMeta } from './connexion-meta';
import { periodeReporting, variationKpi, type PeriodeReporting, type TonVariation } from './accueil/reporting';
import { jourCourt, jourIso, jourParis } from './accueil/temps';

export const JOURS_CHIFFRES_META = 30;

/** Les quatre chiffres, dans l'ordre de la maquette Jarvis · les mêmes libellés partout. */
export const CHIFFRES_CLES_META = [
  { cle: 'depense', libelle: 'Dépense' },
  { cle: 'cpa', libelle: 'CPA' },
  { cle: 'roas', libelle: 'ROAS' },
  { cle: 'valeur', libelle: 'Valeur d’achat' },
] as const;

export type CleChiffreMeta = (typeof CHIFFRES_CLES_META)[number]['cle'];
export type SourceChiffresMeta = 'compte' | 'annonces' | 'aucune';

/** Les totaux d'une fenêtre des KPI du compte (`ads_insights_json.window` / `.previous`). */
export interface TotauxCompteMeta {
  spend: number;
  revenue: number;
  purchases?: number | null;
  /** Le CPA calculé par la synchro · lu seulement si le nombre d'achats manque (anciennes lignes). */
  cpa?: number | null;
}

/** Une journée d'UNE annonce suivie (`metrics_daily` × `ad_instances`, plateforme Meta). */
export interface JourneeAnnonceMeta {
  /** L'identifiant de l'instance d'annonce. */
  annonce: string;
  /** Le nom à afficher (nom de la pub de Résultats, sinon de l'ensemble). */
  nom: string;
  date: string;
  depense: number;
  impressions: number;
  clics: number;
  achats: number;
  revenu: number;
  vues3s: number;
  vues75: number;
}

/** Une annonce suivie, agrégée sur la fenêtre · la forme `MetaAdPerf` du Radar (taux en %). */
export interface PerfAnnonceSuivie {
  adId: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  roas: number;
  purchases: number;
  cpa: number;
  hookRate: number;
  holdRate: number;
}

export interface EntreeChiffresMeta {
  connexion: EtatConnexionMeta;
  /** Les KPI du compte stockés, ou `null`. */
  compte: { window: TotauxCompteMeta; previous?: TotauxCompteMeta | null; releveLe: Date | string | null; creas: number | null } | null;
  /** Les journées des annonces suivies sur la fenêtre ET la précédente, ou `null` (non lues). */
  annonces: readonly JourneeAnnonceMeta[] | null;
  /** Le jour de Paris (`YYYY-MM-DD`). */
  aujourdhui: string;
}

export interface ChiffreCleMeta {
  cle: CleChiffreMeta;
  libelle: string;
  valeur: string;
  /** « ▲ +17,6 % » · `null` sans période précédente. */
  variation: string | null;
  ton: TonVariation;
}

export interface ChiffresClesMeta {
  source: SourceChiffresMeta;
  titre: 'Chiffres clés';
  /** LA phrase de source · la même sur chaque écran (d'où, quelle fenêtre, combien de créas). */
  mention: string;
  kpis: ChiffreCleMeta[];
  /** Les créas mesurées sur la fenêtre · `null` quand on ne les connaît pas. */
  creas: number | null;
  /** Source `annonces` · les annonces agrégées (le Radar les note) · vide sinon. */
  perfs: PerfAnnonceSuivie[];
}

/** La fenêtre des chiffres clés côté annonces suivies · 30 jours finissant hier, et les 30 précédents. */
export function fenetreChiffresMeta(aujourdhui: string): PeriodeReporting {
  return periodeReporting({ periode: String(JOURS_CHIFFRES_META), aujourdhui });
}

const dec = (n: number, k = 2) => n.toFixed(k).replace('.', ',');
const eur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const FORMAT: Readonly<Record<CleChiffreMeta, (n: number) => string>> = {
  depense: eur, cpa: (n) => `${dec(n)} €`, roas: (n) => dec(n), valeur: eur,
};
/** Le sens d'une hausse · une dépense n'est ni bonne ni mauvaise (comme le Reporting). */
const SENS: Readonly<Record<CleChiffreMeta, -1 | 0 | 1>> = { depense: 0, cpa: -1, roas: 1, valeur: 1 };

type Valeurs = Record<CleChiffreMeta, number | null>;
const fini = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function valeursCompte(t: TotauxCompteMeta | null | undefined): Valeurs | null {
  if (!t || !fini(t.spend)) return null;
  const spend = t.spend, revenue = fini(t.revenue) ? t.revenue : 0;
  const cpa = fini(t.purchases) && t.purchases > 0 ? spend / t.purchases : fini(t.cpa) && t.cpa > 0 ? t.cpa : null;
  return { depense: spend, cpa, roas: spend > 0 ? revenue / spend : null, valeur: revenue };
}

function valeursAnnonces(js: readonly JourneeAnnonceMeta[]): Valeurs | null {
  if (!js.length) return null;
  const s = js.reduce((t, j) => t + j.depense, 0), r = js.reduce((t, j) => t + j.revenu, 0), a = js.reduce((t, j) => t + j.achats, 0);
  return { depense: s, cpa: a > 0 ? s / a : null, roas: s > 0 ? r / s : null, valeur: r };
}

function chiffres(cur: Valeurs | null, prec: Valeurs | null): ChiffreCleMeta[] {
  return CHIFFRES_CLES_META.map(({ cle, libelle }) => {
    const v = cur?.[cle] ?? null;
    const va = v === null ? null : variationKpi(v, prec?.[cle] ?? null, SENS[cle], '%');
    return {
      cle, libelle, valeur: v === null ? VALEUR_ABSENTE : FORMAT[cle](v),
      variation: va && va.texte !== 'sans période précédente' ? va.texte : null,
      ton: va?.ton ?? 'neutre',
    };
  });
}

const nCreas = (n: number | null) => (n === null ? '' : ` · ${n} créa${n > 1 ? 's' : ''} mesurée${n > 1 ? 's' : ''}`);
const nombre = (n: unknown) => (fini(n) ? n : 0);

/** Les annonces suivies agrégées sur `[debut, fin]` · seules celles qui ont dépensé comptent. */
export function perfAnnoncesSuivies(js: readonly JourneeAnnonceMeta[], debut: string, fin: string): PerfAnnonceSuivie[] {
  const par = new Map<string, { nom: string; s: number; i: number; c: number; a: number; r: number; v3: number; v75: number }>();
  for (const j of js) {
    const d = jourIso(j.date);
    if (!d || d < debut || d > fin) continue;
    const p = par.get(j.annonce) ?? { nom: j.nom, s: 0, i: 0, c: 0, a: 0, r: 0, v3: 0, v75: 0 };
    p.s += nombre(j.depense); p.i += nombre(j.impressions); p.c += nombre(j.clics); p.a += nombre(j.achats);
    p.r += nombre(j.revenu); p.v3 += nombre(j.vues3s); p.v75 += nombre(j.vues75);
    par.set(j.annonce, p);
  }
  const arr = (n: number) => Math.round(n * 100) / 100;
  return [...par.entries()].filter(([, p]) => p.s > 0).map(([adId, p]) => ({
    adId, name: p.nom, spend: arr(p.s), impressions: p.i, clicks: p.c,
    ctr: p.i > 0 ? arr((p.c / p.i) * 100) : 0,
    roas: arr(p.r / p.s), purchases: p.a, cpa: p.a > 0 ? arr(p.s / p.a) : 0,
    hookRate: p.i > 0 ? arr((p.v3 / p.i) * 100) : 0,
    holdRate: p.v3 > 0 ? arr((p.v75 / p.v3) * 100) : 0,
  })).sort((a, b) => b.spend - a.spend);
}

export function chiffresClesMeta(e: EntreeChiffresMeta): ChiffresClesMeta {
  const base = { titre: 'Chiffres clés' as const };
  const aucune = (): ChiffresClesMeta => ({
    ...base, source: 'aucune', mention: `Aucun chiffre Meta sur les ${JOURS_CHIFFRES_META} derniers jours`,
    kpis: chiffres(null, null), creas: null, perfs: [],
  });
  const branche = e.connexion.phase === 'synchronise' || e.connexion.phase === 'jamais_synchronise';
  if (!branche) return aucune();

  // 1 · Les KPI du compte, s'ils existent · tout le compte, datés de leur relevé.
  const compte = e.compte ? valeursCompte(e.compte.window) : null;
  if (e.compte && compte) {
    const le = e.compte.releveLe ? new Date(e.compte.releveLe) : null;
    const au = le && Number.isFinite(le.getTime()) ? ` au ${jourCourt(jourParis(le))}` : '';
    const creas = fini(e.compte.creas) ? e.compte.creas : null;
    return {
      ...base, source: 'compte',
      mention: `D’après ton compte publicitaire Meta · ${JOURS_CHIFFRES_META} jours${au}${nCreas(creas)}`,
      kpis: chiffres(compte, valeursCompte(e.compte.previous)), creas, perfs: [],
    };
  }

  // 2 · Sinon, la mesure des annonces suivies, s'il y a au moins une journée dans la fenêtre.
  const f = fenetreChiffresMeta(e.aujourdhui);
  const dans = (a: string, b: string) => (e.annonces ?? []).filter((j) => { const d = jourIso(j.date); return !!d && d >= a && d <= b; });
  const cur = dans(f.debut, f.fin);
  if (!cur.length) return aucune();
  const perfs = perfAnnoncesSuivies(cur, f.debut, f.fin);
  return {
    ...base, source: 'annonces',
    mention: `D’après tes annonces suivies · ${JOURS_CHIFFRES_META} jours au ${jourCourt(f.fin)}${nCreas(perfs.length)} · le compte entier n’est pas encore relevé`,
    kpis: chiffres(valeursAnnonces(cur), valeursAnnonces(dans(f.precDebut, f.precFin))), creas: perfs.length, perfs,
  };
}

/**
 * Jarvis · « Chiffres clés » · LES chiffres de la règle, dans l'encart de la
 * maquette. Sans chiffre, les cartes restent à « n.c. » et le geste est celui
 * de la connexion (`action`), jamais « brancher une source » à un compte branché.
 */
export function encartKpiJarvisMeta(c: ChiffresClesMeta, action: string): EncartKpiJarvis {
  const periode = `${JOURS_CHIFFRES_META} derniers jours`;
  if (c.source === 'aucune') {
    return {
      ...(encartKpiJarvis(null) as Extract<EncartKpiJarvis, { etat: 'vide' }>),
      periode, entete: c.mention, lienLibelle: action,
      raison: 'Ni les KPI du compte ni la mesure de tes annonces suivies n’ont de chiffre sur la fenêtre.',
    };
  }
  return {
    etat: 'source', titre: c.titre, plateforme: 'Meta Ads', periode, entete: c.mention,
    kpis: c.kpis.map((k) => ({ cle: k.cle, libelle: k.libelle, valeur: k.valeur, variation: k.variation })),
  };
}
