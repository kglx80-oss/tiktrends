/**
 * ADSMAP · LES journées RETENUES d'une marque · la connexion Meta d'abord,
 * l'export Ads Manager (CSV) ensuite · une seule vérité pour tout ce qui compte.
 *
 * Deux sources écrivent des mesures · la synchro Meta (`metrics_daily`, une
 * ligne par instance d'annonce et par jour) et l'import d'un export
 * (`adsmap_mesures_csv`, une ligne par ad et par période). Avant ce module,
 * chaque lecture choisissait la sienne · la synchro calculait ses verdicts sur
 * ses seules journées Meta (une ad mesurée par fichier puis synchronisée perdait
 * ses journées CSV), les indicateurs de Résultats et le Reporting de l'Accueil
 * ignoraient le fichier. Ici, UNE règle, appliquée par TOUTES les lectures ·
 *
 *  · une journée Meta compte toujours ;
 *  · une entrée CSV compte si `retenirMesures` la retient (la connexion
 *    l'emporte le même jour · entre deux entrées CSV, la journée l'emporte sur
 *    la période) · aucun jour n'est compté deux fois ;
 *  · le protocole d'une ad (campagne, ensemble, budget, CBO) vient de la
 *    connexion quand elle la connaît, sinon de la ligne de fichier la plus
 *    récente · même priorité que les journées (`PRIORITE_MESURES`).
 *
 * ── Une période dans une fenêtre ────────────────────────────────────────────
 *
 * Une entrée exportée d'un bloc (« du 1er au 7 ») ne se découpe pas (on ne sait
 * pas comment sa dépense s'est répartie). Pour une SOMME sur une fenêtre
 * (indicateurs, Reporting), elle est placée sur son PREMIER jour · c'est la date
 * que l'agrégation du moteur lui donne déjà (`rollupDaily`), et deux fenêtres
 * qui se suivent (la période et la précédente) la comptent une fois, jamais
 * deux. L'import conseille l'export « par jour » pour cette raison.
 *
 * Pur · ni base, ni réseau, ni horloge.
 */

import { retenirMesures, type EntreeMesure, type MesuresLigne, type ProtocoleLigne } from './mesures-csv';
import type { AdAMesurer } from './mesures-verdicts';

export type SourceMesure = 'meta' | 'csv';

/** Une journée de la connexion · `adId` = l'ad de la marque qui l'épingle, `null` si aucune n'est connue. */
export interface JourneeMetaLue extends EntreeMesure { adId: string | null }

/** Une entrée d'export déjà en base · son protocole et sa date d'import (la plus récente donne le protocole). */
export interface EntreeCsvRetenable extends EntreeMesure { protocole: ProtocoleLigne; nomAnnonce: string | null; importeLe: string }

/** Une entrée qui COMPTE · d'où elle vient, et l'ad qu'elle mesure (`null` · journée d'une annonce suivie sans ad connue). */
export interface EntreeRetenue extends EntreeMesure { adId: string | null; source: SourceMesure }

export interface JourneesRetenues {
  /** Toutes les entrées qui comptent, triées par date. */
  entrees: EntreeRetenue[];
  /** Les mêmes, par ad (les journées sans ad connue n'y sont pas). */
  parAd: Map<string, EntreeRetenue[]>;
  /** Entrées CSV écartées (déjà mesurées par Meta, ou recouvertes par une entrée plus courte). */
  ecartees: number;
}

const parDate = (a: EntreeMesure, b: EntreeMesure) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : a.fin < b.fin ? -1 : a.fin > b.fin ? 1 : 0);

/**
 * Applique la priorité à toutes les mesures lues.
 *
 * `joursMetaEnPlus` · les jours que la connexion a mesurés pour une ad HORS de
 * la lecture (une lecture bornée à une fenêtre) · ils écartent une entrée CSV
 * sans compter eux-mêmes · sans eux, une période CSV qui chevauche un jour Meta
 * hors fenêtre serait comptée à tort.
 */
export function retenirJournees(
  meta: readonly JourneeMetaLue[],
  csv: ReadonlyMap<string, readonly EntreeMesure[]>,
  joursMetaEnPlus: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): JourneesRetenues {
  const joursMeta = new Map<string, Set<string>>();
  for (const j of meta) if (j.adId) joursMeta.set(j.adId, (joursMeta.get(j.adId) ?? new Set()).add(j.debut));
  for (const [adId, js] of joursMetaEnPlus) for (const d of js) joursMeta.set(adId, (joursMeta.get(adId) ?? new Set()).add(d));

  const entrees: EntreeRetenue[] = meta.map((j) => ({ debut: j.debut, fin: j.fin, mesures: j.mesures, adId: j.adId, source: 'meta' }));
  let ecartees = 0;
  for (const [adId, es] of csv) {
    const r = retenirMesures(joursMeta.get(adId) ?? new Set<string>(), es);
    ecartees += r.ecartees.length;
    for (const e of r.retenues) entrees.push({ debut: e.debut, fin: e.fin, mesures: e.mesures, adId, source: 'csv' });
  }
  entrees.sort(parDate);
  const parAd = new Map<string, EntreeRetenue[]>();
  for (const e of entrees) {
    if (!e.adId) continue;
    let l = parAd.get(e.adId);
    if (!l) parAd.set(e.adId, (l = []));
    l.push(e);
  }
  return { entrees, parAd, ecartees };
}

/* ───────────────────────── protocole ───────────────────────── */

export type ProtocoleAd = ProtocoleLigne & { nomAnnonce: string | null };

export const PROTOCOLE_INCONNU: ProtocoleAd = { nomAnnonce: null, campagne: null, campagneId: null, ensemble: null, ensembleId: null, budgetJour: null, cbo: false };

/**
 * Le protocole d'une ad · la connexion d'abord (elle suit l'ensemble tel qu'il
 * tourne), sinon la ligne de fichier importée la plus récente · `source` le dit.
 */
export function protocoleRetenu(meta: ProtocoleAd | null | undefined, csv: readonly EntreeCsvRetenable[] = []): { protocole: ProtocoleAd; source: SourceMesure | null } {
  if (meta) return { protocole: meta, source: 'meta' };
  const dernier = [...csv].sort((x, y) => (x.importeLe < y.importeLe ? 1 : x.importeLe > y.importeLe ? -1 : 0))[0];
  return dernier ? { protocole: { ...dernier.protocole, nomAnnonce: dernier.nomAnnonce }, source: 'csv' } : { protocole: PROTOCOLE_INCONNU, source: null };
}

/** Une ad à mesurer, telle que la décrivent ses lectures · la forme que `verdictsDesMesures` attend. */
export function adAMesurer(
  ad: { id: string; lotId: string | null; lot: number | null; lanceLe: string | null },
  retenues: JourneesRetenues,
  protocole: ProtocoleAd,
): AdAMesurer {
  return { id: ad.id, lotId: ad.lotId, lotNumero: ad.lot, lanceLe: ad.lanceLe, entrees: retenues.parAd.get(ad.id) ?? [], protocole };
}

/** D'où viennent les entrées retenues d'une ad · ce que le verdict garde dans `metrics_agg.source`. */
export function sourceDesEntrees(es: readonly EntreeRetenue[]): 'meta' | 'csv' | 'meta+csv' | null {
  const m = es.some((e) => e.source === 'meta'), c = es.some((e) => e.source === 'csv');
  return m && c ? 'meta+csv' : c ? 'csv' : m ? 'meta' : null;
}

/* ───────────────────────── fenêtres · indicateurs et Reporting ───────────────────────── */

/** L'entrée tombe-t-elle dans `[du, au]` (bornes incluses, AAAA-MM-JJ) · une période se place sur son premier jour. */
export const dansFenetre = (e: EntreeMesure, du: string, au: string) => e.debut >= du && e.debut <= au;

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** La somme des entrées retenues sur `[du, au]` · la forme des indicateurs de Résultats, plus ce qui vient d'un export. */
export function sommeRetenues(entrees: readonly EntreeRetenue[], du: string, au: string): { depense: number; impressions: number; vues3s: number; achats: number; ventes: number; importees: number } {
  const t = { depense: 0, impressions: 0, vues3s: 0, achats: 0, ventes: 0, importees: 0 };
  for (const e of entrees) {
    if (!dansFenetre(e, du, au)) continue;
    const m: MesuresLigne = e.mesures;
    t.depense += n(m.spend); t.impressions += n(m.impressions); t.vues3s += n(m.video3s);
    t.achats += n(m.purchases); t.ventes += n(m.purchaseValue);
    if (e.source === 'csv') t.importees++;
  }
  return t;
}

/** Les entrées retenues sur `[du, au]`, une ligne par entrée datée de son premier jour · la forme du Reporting de l'Accueil (il somme par jour). */
export function journeesReporting(entrees: readonly EntreeRetenue[], du: string, au: string): Array<{ date: string; depense: number; impressions: number; clics: number; achats: number; revenu: number; vues3s: number }> {
  return entrees.filter((e) => dansFenetre(e, du, au)).map((e) => ({
    date: e.debut, depense: n(e.mesures.spend), impressions: n(e.mesures.impressions), clics: n(e.mesures.clicks),
    achats: n(e.mesures.purchases), revenu: n(e.mesures.purchaseValue), vues3s: n(e.mesures.video3s),
  }));
}

/** Combien d'entrées d'export sur `[du, au]` · l'écran dit que des mesures viennent d'un fichier. */
export const importeesDans = (entrees: readonly EntreeRetenue[], du: string, au: string) => entrees.filter((e) => e.source === 'csv' && dansFenetre(e, du, au)).length;

/** La mention d'un écran de mesures quand un export y compte · `null` sinon (rien n'est ajouté). */
export function mentionImportees(n: number): string | null {
  return n > 0 ? `dont ${n} entrée${n > 1 ? 's' : ''} d’un export Ads Manager (la connexion Meta l’emporte le même jour)` : null;
}
