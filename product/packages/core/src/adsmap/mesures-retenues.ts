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
 * ── La marque « retenue », écrite (0073) ─────────────────────────────────────
 *
 * Décider la priorité entrée par entrée à chaque lecture coûte cher sur une
 * longue fenêtre (90 jours · 6 000 entrées d'export relues une à une). La même
 * décision est donc ÉCRITE sur chaque entrée (`adsmap_mesures_csv.retenue`),
 * à chaque écriture qui peut la changer (import, synchro, recalcul) ·
 * `marquesRetenues` rejoue `retenirMesures`, ad par ad, exactement comme
 * `retenirJournees` (`deciderParAd`, partagé) · la règle reste ici, unique, la
 * marque n'en est qu'une conséquence écrite. Une fenêtre se lit alors en
 * sommes SQL des entrées marquées · une entrée sans marque (`NULL` · ligne
 * d'avant 0073, ou invalidée par une écriture pas encore suivie de son
 * recalcul) fait relire son ad entrée par entrée, par cette même règle.
 *
 * Pur · ni base, ni réseau, ni horloge.
 */

import { memeCampagne, normNom, retenirMesures, type EntreeMesure, type MesuresLigne, type ProtocoleLigne } from './mesures-csv';
import type { AdAMesurer } from './mesures-verdicts';

export type SourceMesure = 'meta' | 'csv';

/** Une journée de la connexion · `adId` = l'ad de la marque qui l'épingle, `null` si aucune n'est connue. */
export interface JourneeMetaLue extends EntreeMesure { adId: string | null }

/** Une entrée d'export déjà en base · son protocole et sa date d'import (la plus récente donne le protocole). */
export interface EntreeCsvRetenable extends EntreeMesure {
  protocole: ProtocoleLigne; nomAnnonce: string | null; importeLe: string;
  /** L'identifiant Meta de l'annonce lu dans la ligne (« Ad ID ») · une ligne rattachée par lui est celle de l'annonce, donc de sa campagne. */
  metaAdId?: string | null;
}

/**
 * Une entrée qui COMPTE · d'où elle vient, et l'ad qu'elle mesure (`null` ·
 * journée d'une annonce suivie sans ad connue, ou somme d'un jour). `nombre` ·
 * combien d'entrées d'export cette ligne additionne (une somme SQL d'un jour,
 * lecture marquée) · 1 quand il est absent.
 */
export interface EntreeRetenue extends EntreeMesure { adId: string | null; source: SourceMesure; nombre?: number }

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
  deciderParAd(csv, joursMeta, (adId, retenues, n) => {
    ecartees += n;
    for (const e of retenues) entrees.push({ debut: e.debut, fin: e.fin, mesures: e.mesures, adId, source: 'csv' });
  });
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

/**
 * LA décision par ad · `retenirMesures` sur TOUTES les entrées d'export de l'ad
 * et TOUS ses jours Meta · partagée par la lecture (`retenirJournees`) et par
 * la marque écrite (`marquesRetenues`) · un seul endroit où la priorité se
 * décide, donc une seule façon de se tromper.
 */
function deciderParAd<E extends { debut: string; fin: string }>(
  csv: ReadonlyMap<string, readonly E[]>,
  joursMeta: ReadonlyMap<string, ReadonlySet<string>>,
  f: (adId: string, retenues: readonly E[], ecartees: number) => void,
): void {
  for (const [adId, es] of csv) {
    const r = retenirMesures(joursMeta.get(adId) ?? new Set<string>(), es);
    f(adId, r.retenues, r.ecartees.length);
  }
}

/**
 * La marque « retenue » de chaque entrée d'export · `true` si elle compte,
 * `false` si la connexion ou une entrée plus courte l'écarte · la décision de
 * `retenirJournees` (`deciderParAd`), écrite par entrée.
 *
 * `csv` · par ad, TOUTES ses entrées (la priorité se décide sur l'ensemble,
 * jamais sur une tranche) · `joursMeta` · par ad, TOUS les jours que la
 * connexion a écrits pour elle. Rend une marque pour chaque entrée reçue,
 * indexée par l'entrée elle-même (même objet).
 */
export function marquesRetenues<E extends { debut: string; fin: string }>(
  csv: ReadonlyMap<string, readonly E[]>,
  joursMeta: ReadonlyMap<string, ReadonlySet<string>>,
): Map<E, boolean> {
  const out = new Map<E, boolean>();
  for (const es of csv.values()) for (const e of es) out.set(e, false);
  deciderParAd(csv, joursMeta, (_adId, retenues) => { for (const e of retenues) out.set(e, true); });
  return out;
}

/* ───────────────────────── protocole ───────────────────────── */

/**
 * Le protocole d'une ad · `cbo` à TROIS états · `true` / `false` lus (chez Meta ou
 * dans un export), `null` · INCONNU (aucun ensemble lu, ni sur l'instance ni au
 * relais du lot) · un CBO inconnu retire sa comparabilité au lot (`checkProtocol`).
 */
export type ProtocoleAd = Omit<ProtocoleLigne, 'cbo'> & { nomAnnonce: string | null; cbo: boolean | null };

export const PROTOCOLE_INCONNU: ProtocoleAd = { nomAnnonce: null, campagne: null, campagneId: null, ensemble: null, ensembleId: null, budgetJour: null, cbo: null };

/**
 * Le CBO qu'une ligne d'export ÉTABLIT · « Utilisation du budget de la
 * campagne » (`cbo`) ⇒ oui · un budget d'ensemble lu ⇒ non · rien (ligne sans
 * colonne de budget) ⇒ inconnu · une ligne muette ne prouve pas l'ABO.
 */
export const cboEtabliParExport = (p: { cbo: boolean; budgetJour: number | null }): boolean | null => (p.cbo ? true : p.budgetJour !== null ? false : null);

/**
 * Deux lignes d'export sont-elles de la même campagne · le même identifiant
 * Meta d'annonce (une annonce ne change pas de campagne), sinon `memeCampagne`
 * (des identifiants de campagne différents tranchent « non ») · rien à comparer
 * (NULL et NULL) ⇒ non.
 */
function memeCampagneLignes(a: { metaAdId?: string | null; protocole: ProtocoleLigne }, b: { metaAdId?: string | null; protocole: ProtocoleLigne }): boolean {
  return (!!a.metaAdId && a.metaAdId === b.metaAdId) || memeCampagne(a.protocole, b.protocole);
}

/**
 * Deux lignes d'export sont-elles du même ENSEMBLE · le même identifiant Meta
 * d'annonce (une annonce ne change pas d'ensemble), sinon identifiants
 * d'ensemble égaux quand les deux en ont un (différents ⇒ non, même nom),
 * sinon noms d'ensemble égaux une fois normalisés · rien à comparer ⇒ non.
 */
function memeEnsembleLignes(a: { metaAdId: string | null; ensemble: string | null; ensembleId: string | null }, b: { metaAdId: string | null; ensemble: string | null; ensembleId: string | null }): boolean {
  if (a.metaAdId && a.metaAdId === b.metaAdId) return true;
  if (a.ensembleId && b.ensembleId) return a.ensembleId === b.ensembleId;
  const x = a.ensemble ? normNom(a.ensemble) : '', y = b.ensemble ? normNom(b.ensemble) : '';
  return x !== '' && x === y;
}

/**
 * Le CBO qu'ÉTABLIT la plus récente ligne d'export de la campagne qui en
 * établit un (`cboEtabliParExport` non nul) · `null` si aucune · une ligne
 * muette ne dit rien et n'efface pas ce qu'une ligne plus ancienne a établi.
 * `recentes` · triées de la plus récente à la plus ancienne.
 */
function cboEtabliParLaCampagne(recentes: readonly EntreeCsvRetenable[], deLaCampagne: (l: EntreeCsvRetenable) => boolean): boolean | null {
  const ligne = recentes.find((l) => deLaCampagne(l) && cboEtabliParExport(l.protocole) !== null);
  return ligne ? cboEtabliParExport(ligne.protocole) : null;
}

/**
 * Le protocole d'une ad · la connexion d'abord (elle suit l'ensemble tel qu'il
 * tourne), sinon la ligne de fichier importée la plus récente · `source` le dit.
 *
 * Le CBO de la connexion se croise avec la plus récente ligne d'export DE SA
 * CAMPAGNE QUI L'ÉTABLIT (`cboEtabliParExport` non nul) · une ligne muette
 * (sans colonne budget, budget à vie) ne dit rien et n'efface pas ce qu'une
 * ligne plus ancienne a établi. Une ligne est de sa campagne quand elle porte
 * l'identifiant Meta de l'annonce (`idMeta`), sinon par `memeCampagne`. Le CBO
 * l'emporte dès qu'une des deux sources le dit (un « non » périmé ne cache pas
 * un CBO) · sinon ce que la connexion sait, sinon ce que l'export établit ·
 * c'est le contournement naturel d'un jeton sans droits sur les ensembles. Le
 * reste du protocole reste celui de la connexion.
 *
 * Sans connexion (ad jamais synchronisée) · le protocole est celui de la ligne
 * la plus récente · son CBO suit la même règle asymétrique · chaque campagne
 * de l'ad (`memeCampagneLignes`) parle par sa plus récente ligne qui établit ·
 * l'une dit CBO ⇒ CBO (une ad rattachée par son nom dans deux campagnes a une
 * part de sa dépense sous CBO) · l'ABO, lui, ne vaut que si CHAQUE campagne de
 * l'ad le dit · une campagne aux seules lignes muettes a une dépense qui
 * compte, sans preuve · sinon INCONNU (`null`), jamais `false` · un
 * export sans colonne budget ne prouve pas l'ABO (le lot passerait
 * « comparables » en CBO, §6.1).
 *
 * Risque connu, non traité · un « non » de la connexion PÉRIMÉ (instance lue en
 * ABO, campagne passée en CBO depuis, ensembles illisibles) tient tant qu'aucun
 * export ne dit CBO · rien ne date le dernier ensemble lu.
 */
export function protocoleRetenu(
  meta: ProtocoleAd | null | undefined, csv: readonly EntreeCsvRetenable[] = [], o: { idMeta?: string | null } = {},
): { protocole: ProtocoleAd; source: SourceMesure | null } {
  const recentes = [...csv].sort((x, y) => (x.importeLe < y.importeLe ? 1 : x.importeLe > y.importeLe ? -1 : 0));
  if (meta) {
    const deLaCampagne = (l: EntreeCsvRetenable) => (!!o.idMeta && l.metaAdId === o.idMeta) || memeCampagne(meta, l.protocole);
    const etabli = cboEtabliParLaCampagne(recentes, deLaCampagne);
    const cbo = meta.cbo === true || etabli === true ? true : (meta.cbo ?? etabli);
    return { protocole: cbo === meta.cbo ? meta : { ...meta, cbo }, source: 'meta' };
  }
  const dernier = recentes[0];
  if (!dernier) return { protocole: PROTOCOLE_INCONNU, source: null };
  // Les campagnes de l'ad · une par représentant (sa ligne la plus récente) · la VOIX de chacune · sa plus récente
  // ligne qui établit (un export correctif de la MÊME campagne l'emporte), `null` si elle n'a que des lignes muettes.
  const campagnes: Array<{ rep: EntreeCsvRetenable; voix: boolean | null }> = [];
  for (const l of recentes) {
    let c = campagnes.find((x) => memeCampagneLignes(x.rep, l));
    if (!c) campagnes.push((c = { rep: l, voix: null }));
    c.voix ??= cboEtabliParExport(l.protocole);
  }
  const cbo = campagnes.some((c) => c.voix === true) ? true : campagnes.every((c) => c.voix === false) ? false : null;
  return { protocole: { ...dernier.protocole, nomAnnonce: dernier.nomAnnonce, cbo }, source: 'csv' };
}

/**
 * Le CBO d'une ad synchronisée · celui que la synchro a écrit sur son instance
 * (`ad_instances.campaign_budget_optimization`, 0073) quand elle l'a lu ·
 * sinon (instance d'avant 0073, ou ensemble non lu) le RELAIS du contrôle du
 * lot (`protocol_check_json.cboMeta`, écrit avant que l'instance le porte) ·
 * sinon le budget d'ENSEMBLE connu sur l'instance (une instance d'avant 0073 en
 * porte un) · Meta ne pose pas de budget d'ensemble sous un budget de
 * campagne, donc il prouve l'ABO, comme la colonne budget d'un export ·
 * sinon INCONNU (`null`). Le relais ne liste que les ads lues en CBO · en être
 * absent ne prouve pas l'ABO, donc ne vaut pas `false`.
 */
export const cboRetenu = (instance: boolean | null | undefined, relais: boolean, budgetJour: number | null = null): boolean | null =>
  instance ?? (relais ? true : budgetJour !== null ? false : null);

/**
 * Ce que la synchro vient de lire chez Meta pour une ad · l'annonce (campagne,
 * ensemble, nom) vient des journées, le budget et le CBO de l'ENSEMBLE, lu à
 * part (`metaAdsetsSync`) · `ensemble` vaut `null` quand il n'a PAS été lu
 * (lecture des ensembles en échec · quota, droits · ou ensemble absent de la
 * lecture).
 */
export interface ProtocoleLuMeta {
  annonce: Omit<ProtocoleAd, 'budgetJour' | 'cbo'>;
  ensemble: { budgetJour: number | null; cbo: boolean } | null;
}

/**
 * Le protocole Meta retenu pour une ad · ce que la synchro vient de lire s'il
 * y en a, sinon le protocole stocké sur l'instance · le CBO par `cboRetenu`.
 *
 * Un ensemble NON LU ne fait rien oublier · le budget et le CBO restent ceux
 * qu'on connaissait (instance, relais du lot), seule l'annonce est rafraîchie ·
 * le budget stocké ne vaut que pour le MÊME ensemble · c'est l'écriture de
 * l'instance qui le garantit (`ingest` efface budget et statut quand l'ad change
 * d'ensemble, le CBO quand elle change de campagne) · le recalcul relit
 * l'instance APRÈS cette écriture, donc `stocke` est toujours celui de
 * l'ensemble du jour. Rien de connu · CBO inconnu (`null`), le lot ne se
 * compare pas.
 * Le rendre « sans CBO, budget inconnu » ferait passer un lot en CBO pour
 * « Protocole respecté · comparables » (le contrôle ignore les budgets nuls) et
 * ouvrirait des `winner` absolus que le §6.1 interdit.
 *
 * `stocke` · le protocole lu sur l'instance (son `cbo` n'est pas lu ici) ·
 * `cbo` · le CBO de l'instance et le relais du lot.
 */
export function protocoleMetaRetenu(
  lu: ProtocoleLuMeta | undefined,
  stocke: ProtocoleAd | undefined,
  cbo: { instance: boolean | null | undefined; relais: boolean },
): ProtocoleAd | undefined {
  if (lu?.ensemble) return { ...lu.annonce, ...lu.ensemble };
  const connu = cboRetenu(cbo.instance, cbo.relais, stocke?.budgetJour ?? null);
  if (lu) return { ...lu.annonce, budgetJour: stocke?.budgetJour ?? null, cbo: connu };
  return stocke ? { ...stocke, cbo: connu } : undefined;
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
    if (e.source === 'csv') t.importees += e.nombre ?? 1;
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
export const importeesDans = (entrees: readonly EntreeRetenue[], du: string, au: string) =>
  entrees.reduce((t, e) => (e.source === 'csv' && dansFenetre(e, du, au) ? t + (e.nombre ?? 1) : t), 0);

/** La mention d'un écran de mesures quand un export y compte · `null` sinon (rien n'est ajouté). */
export function mentionImportees(n: number): string | null {
  return n > 0 ? `dont ${n} entrée${n > 1 ? 's' : ''} d’un export Ads Manager (la connexion Meta l’emporte le même jour)` : null;
}

/* ───────────────────────── réimport ───────────────────────── */

/** Ce qu'une ligne d'export garde du protocole en base · la forme de `adsmap_mesures_csv`. */
export interface PreuveLigne<D> {
  metaAdId: string | null; campagne: string | null; campagneId: string | null; ensemble: string | null; ensembleId: string | null;
  cbo: boolean; budgetJour: number | null; importeLe: D;
}

/**
 * Ce qu'écrit une ligne d'export qui REMPLACE la même période de la même ad
 * (réimport · clé `(ad_id, date_debut, date_fin)`). Une ligne MUETTE
 * (`cboEtabliParExport` nul · sans colonne budget) ne dit rien du budget · si
 * la ligne remplacée en établissait un, de la même campagne
 * (`memeCampagneLignes` · même Ad ID, sinon `memeCampagne`), elle le garde · le
 * CBO, ou le budget d'ensemble pour le MÊME ensemble seulement
 * (`memeEnsembleLignes`) · ET SA DATE · la date d'une preuve décide de son rang
 * (`protocoleRetenu` · la plus récente qui établit) · rajeunie, une vieille
 * preuve d'ABO passerait devant un CBO plus récent d'une autre période. Une
 * ligne qui dit un budget remplace la preuve, toujours.
 */
export function preuveAEcrire<D>(ancienne: PreuveLigne<D> | undefined, nouvelle: PreuveLigne<D>): { cbo: boolean; budgetJour: number | null; importeLe: D } {
  const neuve = { cbo: nouvelle.cbo, budgetJour: nouvelle.budgetJour, importeLe: nouvelle.importeLe };
  if (!ancienne || cboEtabliParExport(nouvelle) !== null) return neuve;
  const ligne = (p: PreuveLigne<D>) => ({ metaAdId: p.metaAdId, protocole: { campagne: p.campagne, campagneId: p.campagneId, ensemble: p.ensemble, ensembleId: p.ensembleId, budgetJour: p.budgetJour, cbo: p.cbo } });
  if (!memeCampagneLignes(ligne(ancienne), ligne(nouvelle))) return neuve;
  // Le CBO est de la campagne · le budget, de l'ENSEMBLE · la ligne prend le nouvel ensemble, un autre budget fausserait `budget_variance`.
  const gardee = { cbo: ancienne.cbo, budgetJour: memeEnsembleLignes(ancienne, nouvelle) ? ancienne.budgetJour : null };
  return cboEtabliParExport(gardee) === null ? neuve : { ...gardee, importeLe: ancienne.importeLe };
}

/**
 * La clé du verrou d'ÉCRITURE d'un import de mesures · une par marque. Sous ce
 * verrou, l'import relit les lignes qu'il remplace puis les écrit · aucun autre
 * import de la marque n'écrit entre les deux (`preuveAEcrire` calcule sur une
 * lecture juste). Le verrou n'ATTEND pas · tenu ailleurs, l'import est refusé
 * (`REFUS_IMPORT_MESURES_EN_COURS`) au lieu de garder une connexion du pool le
 * temps de l'autre import.
 */
export const cleVerrouImportMesures = (brandId: string): string => `adsmap-mesures-import:${brandId}`;

/** Ce que lit l'administrateur quand un autre import de la marque tient le verrou · rien n'est écrit. */
export const REFUS_IMPORT_MESURES_EN_COURS = 'Un import de mesures est déjà en cours pour cette marque · réessaie dans un instant.';
