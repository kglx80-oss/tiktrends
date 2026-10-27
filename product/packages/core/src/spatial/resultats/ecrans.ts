import type { VerdictValue } from '../../adsmap/types';
import { median } from '../../adsmap/stats';
import { libelleTauxFraction, tauxReussite } from '../../adsmap/verdict-libelle';
import { listeManques } from '../../adsmap/reprise-adsmap';
import {
  categorieVariable, verdictAffiche, lienLotSpatial, barresCpa,
  type EtatLotSpatial, type FaitsAdSpatial, type FaitsVerdictSpatial, type NiveauPreuve,
} from './lots';

/**
 * Spatial · Résultats · les règles des écrans (vue d'ensemble, hypothèses,
 * apprentissages, protocole, boucle). Pur · ni base, ni réseau, ni horloge.
 * Chaque valeur montrée vient d'un fait passé en entrée · une absence se dit
 * (« – », « Non calculable »), jamais un zéro qui se lirait comme une mesure.
 */

const fr = (n: number, d = 0) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Le signe de la maquette · « + » et le vrai moins (U+2212). */
const signe = (n: number, txt: string) => (n > 0 ? `+${txt}` : n < 0 ? `−${txt.replace(/^-/, '')}` : txt);

/* ───────────────────────── sous-navigation ───────────────────────── */

/**
 * Les sous-sections de Résultats, ordre de la maquette. « Lots de test » et
 * « Importer » restent réservés aux administrateurs (mêmes gardes que les pages
 * V5 `lots` et `import`) · un membre ne voit pas une porte qui le renverrait.
 */
export function sousNavResultats(o: { admin: boolean }): Array<{ href: string; libelle: string }> {
  return [
    { href: '/adsmap', libelle: 'Vue d’ensemble' },
    { href: '/adsmap/boucle', libelle: 'Boucle d’itération' },
    { href: '/adsmap/hypotheses', libelle: 'Hypothèses' },
    ...(o.admin ? [{ href: '/adsmap/lots', libelle: 'Lots de test' }] : []),
    { href: '/adsmap/protocole', libelle: 'Protocole' },
    ...(o.admin ? [{ href: '/adsmap/import', libelle: 'Importer' }] : []),
    { href: '/adsmap/apprentissages', libelle: 'Apprentissages' },
  ];
}

/* ───────────────────────── indicateurs de la vue d'ensemble ───────────────────────── */

/** Les journées mesurées d'une période, sommées (`metrics_daily` des annonces rattachées à la marque). */
export interface AgregatMesures { depense: number; impressions: number; vues3s: number; achats: number; ventes: number }

export interface KpiResultats { libelle: string; valeur: string; delta: string; classe: '' | 'up'; note: string }

/**
 * Les quatre indicateurs de la maquette sur la période, comparés à la période
 * précédente de même durée. Un ratio sans dénominateur s'affiche « – » ; un écart
 * n'est donné que si la période précédente a, elle aussi, de quoi le calculer.
 * `up` ne marque qu'une amélioration (accroche ou ROAS en hausse, coût en baisse) ·
 * la dépense n'est ni bonne ni mauvaise, elle n'est jamais colorée.
 */
export function kpisResultats(cur: AgregatMesures, prec: AgregatMesures | null): KpiResultats[] {
  const accroche = (a: AgregatMesures) => (a.impressions > 0 ? a.vues3s / a.impressions : null);
  const cpa = (a: AgregatMesures) => (a.achats > 0 ? a.depense / a.achats : null);
  const roas = (a: AgregatMesures) => (a.depense > 0 ? a.ventes / a.depense : null);

  const h = accroche(cur), hp = prec ? accroche(prec) : null;
  const c = cpa(cur), cp = prec ? cpa(prec) : null;
  const r = roas(cur), rp = prec ? roas(prec) : null;
  const dp = prec && prec.depense > 0 ? (cur.depense - prec.depense) / prec.depense : null;

  const dh = h !== null && hp !== null ? Math.round((h - hp) * 100) : null;
  const dc = c !== null && cp !== null ? Math.round((c - cp) * 100) / 100 : null;
  const dr = r !== null && rp !== null ? Math.round((r - rp) * 100) / 100 : null;

  return [
    {
      libelle: 'S’arrêtent sur la pub', valeur: h === null ? '–' : `${fr(Math.round(h * 100))} %`,
      delta: dh === null ? '' : signe(dh, `${fr(Math.abs(dh))} pts`), classe: dh !== null && dh > 0 ? 'up' : '',
      note: h === null ? 'Aucune impression mesurée' : `${fr(cur.vues3s)} vues de 3 s sur ${fr(cur.impressions)} impressions`,
    },
    {
      libelle: 'Coût par achat', valeur: c === null ? '–' : `${fr(c, 2)} €`,
      delta: dc === null ? '' : signe(dc, `${fr(Math.abs(dc), 2)} €`), classe: dc !== null && dc < 0 ? 'up' : '',
      note: cur.achats > 0 ? `Sur ${fr(cur.achats)} achat${cur.achats > 1 ? 's' : ''}` : 'Aucun achat mesuré',
    },
    {
      libelle: 'ROAS', valeur: r === null ? '–' : fr(r, 2),
      delta: dr === null ? '' : signe(dr, fr(Math.abs(dr), 2)), classe: dr !== null && dr > 0 ? 'up' : '',
      note: r === null ? 'Aucune dépense mesurée' : `${fr(r, 2)} € de ventes pour 1 € de pub`,
    },
    {
      libelle: 'Dépense', valeur: `${fr(Math.round(cur.depense))} €`,
      delta: dp === null ? '' : signe(dp, `${fr(Math.abs(dp) * 100, 1)} %`), classe: '',
      note: 'Annonces rattachées à Adsmap · Meta',
    },
  ];
}

/* ───────────────────────── hypothèses ───────────────────────── */

export type ColonneHypothese = 'formuler' | 'prete' | 'test' | 'conclue';
export const COLONNES_HYPOTHESES: ReadonlyArray<{ cle: ColonneHypothese; titre: string }> = [
  { cle: 'formuler', titre: 'À formuler' }, { cle: 'prete', titre: 'Prête à tester' },
  { cle: 'test', titre: 'En test' }, { cle: 'conclue', titre: 'Conclue' },
];

export interface FaitsHypotheseAd {
  ad: FaitsAdSpatial;
  concept: string;
  lot: { id: string; numero: number; etat: EtatLotSpatial; jour: number | null } | null;
  /** Bande du pré-score du concept (`prelaunchScore.band`) · `null` s'il n'a pas été calculé. */
  bande: 'low' | 'med' | 'high' | null;
}

/** Une suite proposée par le moteur d'itération (`iterationPlanAction`). */
export interface FaitsSuite { adId: string; libelle: string; variable: string; etape: string | null; raison: string; priorite: number }

export interface CarteHypothese {
  cle: string;
  colonne: ColonneHypothese;
  categorie: string;
  /** 0 à 3 barres · 0 = à évaluer. */
  priorite: 0 | 1 | 2 | 3;
  texte: string;
  meta: string;
  action: { libelle: string; href: string } | null;
  conclusion: { libelle: string; classe: '' | 'g'; icone: 'check' | 'x' | 'q' } | null;
}

export const LIBELLE_PRIORITE = ['à évaluer', 'faible', 'moyenne', 'forte'] as const;

/** Ce qu'un verdict arbitré fait de l'hypothèse · confirmée seulement au protocole. */
function conclusionHypothese(v: FaitsVerdictSpatial | null): CarteHypothese['conclusion'] {
  const eff = verdictAffiche(v);
  if (eff === 'winner' || eff === 'baby_winner') return { libelle: 'Confirmée', classe: 'g', icone: 'check' };
  if (eff === 'loser') return { libelle: 'Infirmée', classe: '', icone: 'x' };
  if (eff === 'relative_winner') return { libelle: 'Prometteuse · relatif', classe: '', icone: 'q' };
  return { libelle: 'Non tranchée', classe: '', icone: 'q' };
}

const LANCE: ReadonlySet<EtatLotSpatial> = new Set<EtatLotSpatial>(['diffusion', 'a_importer', 'a_conclure', 'non_concluant']);
const BANDE: Record<string, 1 | 2 | 3> = { low: 1, med: 2, high: 3 };

/**
 * Le tableau des hypothèses · une hypothèse est, dans l'outil, le texte porté par
 * une ad (avec sa variable testée) · aucune hypothèse n'est inventée. « À formuler »
 * reçoit aussi les SUITES du moteur d'itération (des hypothèses à écrire à partir
 * d'un test arbitré). La priorité vient du pré-score du concept ou du rang de la
 * suite · jamais d'une saisie qui n'existe pas.
 */
export function cartesHypotheses(ads: readonly FaitsHypotheseAd[], suites: readonly FaitsSuite[]): CarteHypothese[] {
  const out: CarteHypothese[] = [];
  for (const s of suites) {
    out.push({
      cle: `suite-${s.adId}-${s.variable}`, colonne: 'formuler', categorie: categorieVariable(s.variable),
      priorite: s.priorite <= 0 ? 3 : s.priorite === 1 ? 2 : 1,
      texte: s.raison, meta: `${s.etape ? `Étape ${s.etape}` : 'Toutes étapes'} · Suite de ${s.libelle}`,
      action: { libelle: 'Formuler la suite', href: '/adsmap/suites' }, conclusion: null,
    });
  }
  for (const x of ads) {
    const a = x.ad;
    const base = { cle: a.id, categorie: categorieVariable(a.variable), priorite: (x.bande ? BANDE[x.bande] : 0) as CarteHypothese['priorite'] };
    const meta = `Coût par achat · ${x.concept}`;
    const texte = a.hypothese?.trim() || `${x.concept} · ${a.variante} · hypothèse à écrire`;
    if (a.verdict?.statut === 'validated') {
      out.push({ ...base, colonne: 'conclue', texte, meta, action: null, conclusion: conclusionHypothese(a.verdict) });
    } else if (a.statut === 'live' || a.statut === 'paused' || (x.lot && LANCE.has(x.lot.etat))) {
      const quand = x.lot?.jour ? `J${x.lot.jour}` : x.lot?.etat === 'a_importer' ? 'à importer' : x.lot?.etat === 'a_conclure' ? 'à conclure' : 'en test';
      out.push({ ...base, colonne: 'test', texte, meta, action: x.lot ? { libelle: `Lot #${x.lot.numero} · ${quand}`, href: lienLotSpatial(x.lot.id) } : null, conclusion: null });
    } else if (a.manques.length === 0) {
      out.push({
        ...base, colonne: 'prete', texte, meta,
        action: x.lot ? { libelle: `Lot #${x.lot.numero} · ${x.lot.etat === 'pret' ? 'prêt' : 'en préparation'}`, href: lienLotSpatial(x.lot.id) } : { libelle: 'Ranger dans un lot', href: '/adsmap/lots' },
        conclusion: null,
      });
    } else {
      // Ces champs ne se saisissent sur une ad existante par aucun écran
      // (`COMPLETUDE_HORS_OUTIL`) · pas de bouton qui mènerait nulle part.
      out.push({ ...base, colonne: 'formuler', texte, meta: `Il manque ${listeManques(a.manques)}`, action: null, conclusion: null });
    }
  }
  return out;
}

/** Les puces de catégorie · « Toutes » puis chaque catégorie présente, la plus fréquente d'abord. */
export function categoriesHypotheses(cartes: readonly CarteHypothese[]): Array<{ cle: string; libelle: string; n: number }> {
  const n = new Map<string, number>();
  for (const c of cartes) n.set(c.categorie, (n.get(c.categorie) ?? 0) + 1);
  const cats = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
  return [{ cle: 'tous', libelle: 'Toutes', n: cartes.length }, ...cats.map(([cle, k]) => ({ cle, libelle: cle, n: k }))];
}

/* ───────────────────────── apprentissages ───────────────────────── */

export interface FaitsApprentissage {
  id: string;
  enonce: string;
  statut: string;
  refute: boolean;
  /** `evidence.source` · « arbitrage » (verdict validé dans l'outil), « import Sheet »… */
  source: string | null;
  creeLe: string;
  ad: (FaitsAdSpatial & { lot: { id: string; numero: number } | null }) | null;
}

const EVALUABLES: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner', 'loser']);

/**
 * Le niveau de preuve d'un apprentissage (maquette · mesuré, observé, à vérifier) ·
 *  3 · arbitré dans l'outil sur un verdict comparable ET tranché (gagnante, naissante, perdante) ;
 *  2 · rattaché à un verdict, mais sans comparaison au protocole (relatif, importé, non concluant) ;
 *  1 · sans verdict derrière (saisi à la main, repris du tableau sans chiffre).
 */
export function niveauPreuveApprentissage(f: FaitsApprentissage): NiveauPreuve {
  const v = f.ad?.verdict ?? null;
  const retenu = v?.retenu ?? v?.calcule ?? null;
  if (f.source === 'arbitrage' && v?.comparable && retenu && EVALUABLES.has(retenu)) return 3;
  if (v && retenu) return 2;
  return 1;
}

export type EtatApprentissage = 'valide' | 'retester' | 'valider';
export function etatApprentissage(f: FaitsApprentissage): EtatApprentissage {
  if (f.refute) return 'retester';
  return f.statut === 'validated' ? 'valide' : 'valider';
}

const ICONE_VARIABLE: Record<string, string> = {
  hook: 'q', body: 'text', cta: 'text', offer: 'text', length: 'text',
  opening_visual: 'img', avatar_on_screen: 'img', proof: 'img', format: 'phone',
};
export const iconeApprentissage = (variable: string | null | undefined) => (variable && ICONE_VARIABLE[variable]) || 'bulb';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function moisCourt(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? MOIS[d.getUTCMonth()]! : '';
}

/** Le pied de carte · d'où vient la preuve, en faits (lot, volume, mois). */
export function piedApprentissage(f: FaitsApprentissage): string {
  const mois = moisCourt(f.creeLe);
  const lot = f.ad?.lot;
  const imp = f.ad?.verdict?.impressions;
  if (lot) return [`Lot #${lot.numero}`, imp ? `${fr(imp)} imp.` : null, mois].filter(Boolean).join(' · ');
  if (f.source === 'import Sheet') return `Repris du tableau · ${mois}`;
  return f.source === 'arbitrage' ? `Arbitrage hors lot · ${mois}` : mois;
}

/**
 * La preuve chiffrée d'un apprentissage · la variante qui l'a porté face à la
 * meilleure autre variante de son lot, sur le coût par achat. Rendue seulement
 * quand les DEUX ont un CPA · la plus chère à gauche, la moins chère à droite,
 * marquée gagnante si le moteur l'a déclarée gagnante au protocole.
 */
export function preuveApprentissage(adId: string, lot: readonly FaitsAdSpatial[]): Array<{ ad: FaitsAdSpatial; libelle: string; part: number; gagne: boolean }> | null {
  const moi = lot.find((a) => a.id === adId);
  const autres = lot.filter((a) => a.id !== adId && (a.verdict?.cpa ?? 0) > 0).sort((a, b) => a.verdict!.cpa! - b.verdict!.cpa!);
  if (!moi || !((moi.verdict?.cpa ?? 0) > 0) || !autres[0]) return null;
  const paire = [moi, autres[0]].sort((a, b) => b.verdict!.cpa! - a.verdict!.cpa!);
  const barres = barresCpa(paire);
  return paire.map((ad, i) => {
    const eff = verdictAffiche(ad.verdict);
    return { ad, libelle: barres[i]!.libelle, part: barres[i]!.part, gagne: i === 1 && (eff === 'winner' || eff === 'baby_winner') };
  });
}

/* ───────────────────────── protocole ───────────────────────── */

export interface ReglesProtocoleLues {
  structure: 'abo_one_adset_per_ad' | 'abo_single_adset' | 'cbo_tolerated';
  cibleCpa: number;
  multiplePerdante: number;
}

/**
 * Les garanties de comparaison · ce que l'OUTIL fait respecter, pas une case à
 * cocher décorative. Coché = la règle est appliquée par une action ou le moteur :
 *  · même budget, même audience · seulement en ABO (en CBO, Meta répartit · relatif) ;
 *  · même jour · `launchBatchAction` date toutes les variantes d'un lot au même instant ;
 *  · rien d'ajouté en cours · `setBatchAdAction` refuse d'ajouter à un lot lancé ;
 *  · arrêt suggéré · règle K4 (`evaluateKillRules`) sur la cible de la marque.
 */
export function garantiesProtocole(r: ReglesProtocoleLues): Array<{ ok: boolean; texte: string }> {
  const abo = r.structure !== 'cbo_tolerated';
  return [
    { ok: abo, texte: abo ? 'Même audience et même budget pour toutes les variantes (ABO)' : 'Budget réparti par Meta (CBO) · les verdicts ne seront que relatifs' },
    { ok: true, texte: 'Lancées le même jour · le lancement du lot date toutes ses variantes' },
    { ok: true, texte: 'Aucune variante ajoutée pendant la période · un lot lancé est fermé' },
    { ok: true, texte: `Arrêt suggéré si, même au mieux, le coût par achat dépasse ${fr(r.multiplePerdante, 1).replace(/,0$/, '')}× la cible (${fr(Math.round(r.multiplePerdante * r.cibleCpa))} €)` },
  ];
}

/** Les périodes proposées · 7, 14, 21 jours, plus la valeur enregistrée si elle est autre. */
export function optionsPeriode(actuelle: number): number[] {
  return [...new Set([7, 14, 21, actuelle])].filter((n) => n >= 1 && n <= 30).sort((a, b) => a - b);
}

/** « 15 000 impressions » → 15000 · `null` si aucun nombre entier positif lisible. */
export function lireVolume(s: string): number | null {
  const chiffres = s.replace(/[^\d]/g, '');
  if (!chiffres) return null;
  const n = Number.parseInt(chiffres, 10);
  return Number.isFinite(n) && n > 0 && n <= 100_000_000 ? n : null;
}

/* ───────────────────────── boucle ───────────────────────── */

export interface KpiBoucle { libelle: string; valeur: string; note: string }

/**
 * Les quatre chiffres de la boucle · tests mesurés, taux de victoire HONNÊTE
 * (`tauxReussite` · au protocole, « Non calculable » sans évaluable), durée
 * médiane d'un cycle (lancement du lot → apprentissage écrit), apprentissages.
 */
export function kpisBoucle(e: {
  verdicts: ReadonlyArray<FaitsVerdictSpatial>;
  premierLancement: string | null;
  cyclesJours: readonly number[];
  apprentissages: { total: number; mesures: number };
}): KpiBoucle[] {
  const t = tauxReussite(e.verdicts.map((v) => ({ value: v.retenu ?? v.calcule, comparable: v.comparable })));
  const m = median([...e.cyclesJours]);
  const depuis = e.premierLancement ? new Date(e.premierLancement) : null;
  const n = e.verdicts.length;
  return [
    { libelle: 'Tests menés', valeur: fr(n), note: depuis && Number.isFinite(depuis.getTime()) ? `variantes mesurées depuis ${MOIS_LONG[depuis.getUTCMonth()]}` : 'aucune variante mesurée' },
    { libelle: 'Taux de victoire', valeur: libelleTauxFraction(t.taux), note: t.evaluables ? `${t.succes} gagnante${t.succes > 1 ? 's' : ''} sur ${t.evaluables} évaluée${t.evaluables > 1 ? 's' : ''}` : 'aucun verdict évalué au protocole' },
    { libelle: 'Durée d’un cycle', valeur: m === null ? '–' : `${fr(Math.round(m))} j`, note: m === null ? 'aucun cycle bouclé' : 'du lancement à l’apprentissage' },
    { libelle: 'Apprentissages validés', valeur: fr(e.apprentissages.total), note: `dont ${e.apprentissages.mesures} mesuré${e.apprentissages.mesures > 1 ? 's' : ''}` },
  ];
}
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* ───────────────────────── import ───────────────────────── */

/** « il y a 2 h », « hier », « 11 oct. » · la date d'une remontée, comme la maquette. */
export function quandCourt(iso: string, maintenant: Date): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((maintenant.getTime() - t) / 60_000));
  if (min < 60) return min <= 1 ? 'à l’instant' : `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  if (h < 48) return 'hier';
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export interface Remontee { source: 'meta' | 'tableau'; texte: string; le: string }

/**
 * Les dernières remontées de mesures · la dernière synchro Meta (date réelle de
 * la marque) et chaque lot repris du tableau, les plus récentes d'abord. Aucun
 * journal n'existe en base au-delà de ces deux faits · on n'en invente pas.
 */
export function remontees(e: { mesureLe: string | null; variantesMesurees: number; lotsImportes: ReadonlyArray<{ numero: number; variantes: number; le: string }> }, max = 4): Remontee[] {
  const out: Remontee[] = [];
  if (e.mesureLe) out.push({ source: 'meta', le: e.mesureLe, texte: `Mesure Meta · ${e.variantesMesurees} variante${e.variantesMesurees > 1 ? 's' : ''} avec un verdict calculé` });
  for (const l of e.lotsImportes) out.push({ source: 'tableau', le: l.le, texte: `Tableau · Lot #${l.numero} · ${l.variantes} variante${l.variantes > 1 ? 's' : ''}` });
  return out.sort((a, b) => Date.parse(b.le) - Date.parse(a.le)).slice(0, max);
}
