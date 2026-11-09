import 'server-only';
import { gte, lte, notInArray, type AnyColumn } from 'drizzle-orm';
import { db, schema, eq, and, inArray, sql } from '@tiktrends/db';
import {
  DEFAULT_VERDICT_CONFIG, motifEchecRemontee, verdictsDesMesures, cleEntreeMesure, retenirJournees, protocoleRetenu, adAMesurer, sourceDesEntrees,
  marquesRetenues, cboRetenu,
  type AdAMesurer, type CandidatMesure, type DeclencheurRemontee, type EntreeCsvRetenable, type EntreeMesure, type EntreeRetenue, type JourneeMetaLue,
  type JourneesRetenues, type MesuresLigne, type ProtocolRules, type ProtocoleAd, type RemonteeJournal, type SourceRemontee, type VerdictConfig,
} from '@tiktrends/core';

/**
 * ADSMAP · lectures et écritures des MESURES IMPORTÉES (export Ads Manager) et
 * du journal des remontées. Les règles (rattachement, priorité, verdicts)
 * vivent au noyau · ici, seulement ce qui se lit et s'écrit en base.
 *
 * Portée · tout passe par la marque · une ad n'a pas de colonne marque, elle s'y
 * rattache par le graphe (concept → angle → désir → persona → marque), comme la
 * synchro. Une ad d'une autre marque n'est donc jamais candidate.
 */

/** Une ad de la marque · ce qu'il faut pour la rattacher, la mesurer et rendre son verdict. */
export interface AdDeLaMarque extends CandidatMesure {
  workspaceId: string;
  lotId: string | null;
  statut: string;
  lanceLe: string | null;
}

/** Les ads de la marque qui peuvent recevoir des mesures · tout sauf les brouillons (rien n'a été diffusé). */
export async function adsDeLaMarque(workspaceId: string, brandId: string): Promise<AdDeLaMarque[]> {
  if (!db) return [];
  const rows = await db.select({
    id: schema.ads.id, workspaceId: schema.ads.workspaceId, batchId: schema.ads.batchId, batchNumber: schema.batches.number,
    variantCode: schema.ads.variantCode, generatedName: schema.ads.generatedName, externalIds: schema.ads.externalIds,
    status: schema.ads.status, launchedAt: schema.ads.launchedAt,
  })
    .from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .leftJoin(schema.batches, eq(schema.ads.batchId, schema.batches.id))
    .where(and(eq(schema.ads.workspaceId, workspaceId), eq(schema.personas.brandId, brandId)));
  return rows.filter((r) => r.status !== 'draft').map((r) => ({
    id: r.id, workspaceId: r.workspaceId, lotId: r.batchId, lot: r.batchNumber ?? null, variante: r.variantCode,
    nomRegie: r.generatedName, idMeta: (r.externalIds as { ad_id?: string } | null)?.ad_id ?? null,
    statut: r.status, lanceLe: r.launchedAt ? (r.launchedAt as Date).toISOString().slice(0, 10) : null,
  }));
}

/** Une entrée d'export lue en base. */
export type EntreeCsvLue = EntreeCsvRetenable;

/**
 * La portée d'une lecture · des ads nommées (verdicts, aperçu d'import), ou une
 * fenêtre de la marque (indicateurs, Reporting). `entreeParEntree` · la fenêtre
 * relue entièrement par la règle, sans les marques écrites · c'est le repli
 * des entrées non marquées, forcé pour toutes · la preuve d'égalité et le banc
 * le comparent à la lecture marquée.
 */
export type PorteeLecture =
  | { ads: ReadonlyArray<{ id: string; idMeta: string | null }>; metaEnPlus?: ReadonlyMap<string, readonly EntreeMesure[]> }
  | { du: string; au: string; entreeParEntree?: boolean };

export interface LectureRetenues extends JourneesRetenues {
  /** Toutes les entrées d'export lues (retenues ou non), par ad, protocole compris · l'aperçu d'import dit « identique » ou « remplacée » · lue pour des ads nommées seulement (vide pour une fenêtre). */
  csv: Map<string, EntreeCsvLue[]>;
  /** Les jours mesurés par la connexion, par ad · ce que `retenirMesures` laisse à Meta. */
  joursMeta: Map<string, Set<string>>;
  /** Le protocole de l'instance synchronisée, par ad (`cbo` y vaut `false` · le CBO lu est dans `cboInstance`). */
  protocoleMeta: Map<string, ProtocoleAd>;
  /** Le CBO écrit sur l'instance par la synchro (0073), par ad · `null` · pas encore lu (instance d'avant) · voir `cboRetenu`. */
  cboInstance: Map<string, boolean | null>;
  /** Fenêtre · entrées d'export relues une à une faute de marque (ads à relire) · 0 en régime. */
  relues: number;
  /** Requêtes lancées · mesurées par le test de coût (aucune ne dépend du nombre d'ads ni de jours). */
  requetes: number;
}

const opt = (v: number | null) => (v === null ? undefined : v);
const zero = (v: number | null) => v ?? 0;

/*
 * Les trois lectures de `metrics_daily` · toutes sur une créa DE LA MARQUE
 * (`creatives.brand_id`), plateforme Meta · lecture seule, la synchro reste
 * seule à écrire là. Les sommes d'une fenêtre se font en SQL (une ligne par
 * jour) · seules les ads qui ont un export lisent leurs jours Meta un par un.
 */

/** Les journées de ces annonces (identifiants Meta), une par instance et par jour · pour les verdicts. */
async function lignesMeta(brandId: string, ext: readonly string[]) {
  if (!db || !ext.length) return [];
  const M = schema.metricsDaily, I = schema.adInstances;
  return db.select({
    ext: I.externalAdId, campagne: I.campaignName, ensemble: I.adsetName,
    ensembleId: I.externalAdsetId, campagneId: I.externalCampaignId, budget: I.adsetDailyBudget, cbo: I.campaignBudgetOptimization,
    date: M.date, spend: M.spend, impressions: M.impressions, reach: M.reach, clicks: M.clicks,
    linkClicks: M.linkClicks, conv: M.conv, revenue: M.revenue, v3s: M.v3s, thruplays: M.thruplays, p50: M.p50,
  })
    .from(schema.metricsDaily)
    .innerJoin(schema.adInstances, eq(schema.metricsDaily.adInstanceId, schema.adInstances.id))
    .innerJoin(schema.creatives, eq(schema.adInstances.creativeId, schema.creatives.id))
    .where(and(eq(schema.creatives.brandId, brandId), eq(I.platform, 'meta'), inArray(I.externalAdId, [...ext])));
}

/**
 * Les journées de la marque sur `[du, au]`, sommées par jour (toutes annonces
 * suivies confondues) · pour les indicateurs. Les instances de la marque en
 * semi-jointure (`in (…)`) · une journée a une instance et une créa, les lignes
 * sommées sont les mêmes qu'avec deux jointures, sans porter leurs colonnes ·
 * et seulement les colonnes qu'une fenêtre lit (`sommeRetenues`,
 * `journeesReporting` · dépense, impressions, clics, clics sur un lien, achats,
 * ventes, vues 3 s · couverture, ThruPlays et 50 % ne sont pas sommés).
 * Mesuré sur le semis de `lireJourneesRetenues`, 180 jours, requête seule ·
 * deux jointures, 10 sommes 16,4 ms · semi-jointure 11,3 – 12,5 ms.
 */
async function sommesMetaParJour(brandId: string, du: string, au: string) {
  if (!db) return [];
  const M = schema.metricsDaily, I = schema.adInstances;
  const s = (c: AnyColumn) => sql<number>`coalesce(sum(${c}), 0)`;
  const instances = db.select({ id: I.id }).from(I)
    .innerJoin(schema.creatives, eq(schema.adInstances.creativeId, schema.creatives.id))
    .where(and(eq(schema.creatives.brandId, brandId), eq(I.platform, 'meta')));
  return db.select({
    date: M.date, spend: s(M.spend), impressions: s(M.impressions), clicks: s(M.clicks), linkClicks: s(M.linkClicks),
    conv: s(M.conv), revenue: s(M.revenue), v3s: s(M.v3s),
  })
    .from(M)
    .where(and(inArray(M.adInstanceId, instances), gte(M.date, du), lte(M.date, au)))
    .groupBy(M.date);
}

/**
 * Les JOURS (sans mesures) que la connexion a mesurés pour ces annonces, sur
 * `[du, au]` (sans borne · tous) · ils écartent une entrée d'export. `ex` · le
 * client (une transaction, pour la marque écrite).
 */
async function joursMetaDes(brandId: string, ext: readonly string[], du: string | null, au: string | null, ex: Executeur | null = db) {
  if (!ex || !ext.length) return [];
  const M = schema.metricsDaily, I = schema.adInstances;
  return ex.selectDistinct({ ext: I.externalAdId, date: M.date })
    .from(schema.metricsDaily)
    .innerJoin(schema.adInstances, eq(schema.metricsDaily.adInstanceId, schema.adInstances.id))
    .innerJoin(schema.creatives, eq(schema.adInstances.creativeId, schema.creatives.id))
    .where(and(eq(schema.creatives.brandId, brandId), eq(I.platform, 'meta'), inArray(I.externalAdId, [...ext]),
      du ? gte(M.date, du) : undefined, au ? lte(M.date, au) : undefined));
}
type Executeur = Pick<NonNullable<typeof db>, 'select' | 'selectDistinct' | 'update' | 'execute'>;
type LigneMeta = Awaited<ReturnType<typeof lignesMeta>>[number];
const mesuresDeLaLigne = (r: Pick<LigneMeta, 'spend' | 'impressions' | 'reach' | 'clicks' | 'linkClicks' | 'conv' | 'revenue' | 'v3s' | 'thruplays' | 'p50'>): MesuresLigne => ({
  spend: zero(r.spend), impressions: zero(r.impressions), reach: zero(r.reach), clicks: zero(r.clicks), linkClicks: zero(r.linkClicks),
  purchases: zero(r.conv), purchaseValue: zero(r.revenue), video3s: zero(r.v3s), thruplays: zero(r.thruplays), videoP50: zero(r.p50),
});

/** Les entrées d'export (`adsmap_mesures_csv`) de ces ads, bornées à la marque · protocole compris (verdicts, aperçu d'import). */
async function lignesCsv(brandId: string, adIds: readonly string[]) {
  if (!db || !adIds.length) return [];
  const C = schema.mesuresCsv;
  return db.select().from(C).where(and(eq(C.brandId, brandId), inArray(C.adId, [...adIds])));
}

/**
 * Pour une fenêtre · TOUTES les entrées d'export des ads qui ont une entrée
 * commençant dans `[du, au]` (la priorité se décide sur l'ensemble des entrées
 * d'une ad, jamais sur une tranche), bornées à la marque, avec l'identifiant
 * Meta épinglé de l'ad. Seulement les colonnes d'une somme · lire les 30
 * colonnes double le temps de lecture (mesure dans `lireJourneesRetenues`).
 * `aRelire` · seulement les ads dont une entrée attend sa marque (le repli) ·
 * sans lui, toutes (`entreeParEntree`).
 */
async function lignesCsvFenetre(brandId: string, du: string, au: string, aRelire: boolean) {
  if (!db) return [];
  const C = schema.mesuresCsv;
  const touchees = db.selectDistinct({ id: C.adId }).from(C).where(and(
    eq(C.brandId, brandId), gte(C.dateDebut, du), lte(C.dateDebut, au),
    aRelire ? inArray(C.adId, adsARelire(brandId)) : undefined,
  ));
  return db.select({
    adId: C.adId, debut: C.dateDebut, fin: C.dateFin, ext: schema.ads.externalIds,
    spend: C.spend, impressions: C.impressions, linkClicks: C.linkClicks, purchases: C.purchases,
    clicks: C.clicks, purchaseValue: C.purchaseValue, video3s: C.video3s,
  }).from(C)
    .leftJoin(schema.ads, eq(schema.ads.id, C.adId))
    .where(and(eq(C.brandId, brandId), inArray(C.adId, touchees)));
}

/** Les ads de la marque dont une entrée d'export attend sa marque (NULL) · vide en régime (index partiel `adsmap_mesures_csv_a_marquer_idx`). */
function adsARelire(brandId: string) {
  const C = schema.mesuresCsv;
  return db!.selectDistinct({ id: C.adId }).from(C).where(and(eq(C.brandId, brandId), sql`${C.retenue} is null`));
}

/**
 * Pour une fenêtre · les entrées d'export RETENUES (marque écrite), sommées
 * par premier jour en SQL, hors des ads qui ont une entrée à relire (elles
 * passent par `lignesCsvFenetre`, entrée par entrée) · une ligne par jour,
 * avec le nombre d'entrées qu'elle additionne.
 */
async function sommesCsvRetenuesParJour(brandId: string, du: string, au: string) {
  if (!db) return [];
  const C = schema.mesuresCsv;
  const s = (c: AnyColumn) => sql<number>`coalesce(sum(${c}), 0)`;
  return db.select({
    date: C.dateDebut, spend: s(C.spend), impressions: s(C.impressions), linkClicks: s(C.linkClicks), purchases: s(C.purchases),
    clicks: s(C.clicks), purchaseValue: s(C.purchaseValue), video3s: s(C.video3s), nombre: sql<number>`count(*)`,
  }).from(C)
    .where(and(eq(C.brandId, brandId), sql`${C.retenue} = true`, gte(C.dateDebut, du), lte(C.dateDebut, au), notInArray(C.adId, adsARelire(brandId))))
    .groupBy(C.dateDebut);
}

function entreeCsv(r: typeof schema.mesuresCsv.$inferSelect): EntreeCsvLue {
  const mesures: MesuresLigne = {
    spend: r.spend, impressions: r.impressions, linkClicks: r.linkClicks, purchases: r.purchases,
    reach: opt(r.reach), clicks: opt(r.clicks), purchaseValue: opt(r.purchaseValue), video3s: opt(r.video3s),
    thruplays: opt(r.thruplays), videoP50: opt(r.videoP50), addToCart: opt(r.addToCart), landingViews: opt(r.landingViews),
  };
  for (const k of Object.keys(mesures) as Array<keyof MesuresLigne>) if (mesures[k] === undefined) delete mesures[k];
  return {
    debut: r.dateDebut, fin: r.dateFin, mesures, nomAnnonce: r.nomAnnonce,
    protocole: { campagne: r.campagne, campagneId: r.campagneId, ensemble: r.ensemble, ensembleId: r.ensembleId, budgetJour: r.budgetJour, cbo: r.cbo },
    importeLe: (r.importeLe as Date).toISOString(),
  };
}

/**
 * LA lecture des journées RETENUES d'une marque · la connexion Meta d'abord,
 * l'export ensuite (`retenirJournees`, noyau). Toutes les lectures de mesures
 * passent par ici · les verdicts (synchro ET import · `recalculerVerdicts`),
 * l'aperçu d'import, les indicateurs de Résultats (`chargerMesures`), le
 * Reporting de l'Accueil. Bornée à la marque · journées Meta sur une créa de la
 * marque, entrées d'export de la marque.
 *
 * Des ads nommées (verdicts, aperçu) · 2 requêtes, entrées d'export lues une à
 * une, la priorité décidée au noyau.
 *
 * Une fenêtre (indicateurs, Reporting) · 3 requêtes en parallèle · les
 * journées Meta sommées PAR JOUR en SQL, les entrées d'export RETENUES (la
 * marque écrite, `marquerRetenues`) sommées par premier jour en SQL, et les
 * entrées des ads qui ont une entrée SANS marque (lignes d'avant 0073, ou
 * invalidées par une écriture en attente de son recalcul), relues entrée par
 * entrée par la même règle (une 4ᵉ requête lit alors leurs jours Meta) · le
 * repli est vide en régime. Une ligne de somme CSV n'a pas d'ad (`adId` nul,
 * `nombre` · combien d'entrées elle additionne) · `parAd` ne porte, pour une
 * fenêtre, que les ads relues une à une, et `ecartees` que leurs écartées.
 * Jamais une requête par ad ni par jour (pas de N+1).
 *
 * MESURÉ (pglite, base statistiquement analysée comme en production · semis ·
 * 300 ads, 18 000 journées Meta sur 60 jours, 6 000 entrées d'export par jour
 * sur un tiers des ads dont la moitié des jours couverts par Meta · médiane de
 * 15 passages, 3 de chauffe, même semis, même machine · 3 exécutions, la
 * fourchette est celle des 3 médianes) :
 *
 *   lecture                                  #1046 (entrée par entrée)   marquée (0073)
 *   Résultats · période + précédente (14 j)  11,5 – 11,9 ms             9,3 – 12,4 ms
 *   Accueil · Reporting 14 j + précédents    11,1 – 11,7 ms             9,9 – 12,3 ms
 *   Accueil · Reporting 90 j + précédents    134,5 – 160,0 ms           19,4 ms (19,35 · 19,43 · 19,44)
 *   dont · somme Meta seule, 180 jours       16,4 ms (deux jointures)    11,3 – 12,5 ms (semi-jointure)
 *   dont · somme d'export marquée, 180 jours ·                          3,0 – 4,4 ms
 *   écriture de la marque, 6 000 entrées     ·                          0,80 – 0,92 s la première fois · 86 – 105 ms ensuite (rien ne change)
 *
 * (charge machine 1 à 4,5 · sous une charge de 14, la lecture de 90 jours
 * marquée a mesuré 18,5 – 27,6 ms.) Le plancher de la lecture de 90 jours est
 * la somme des 18 000 journées Meta (≈ 12 ms), que la marque ne touche pas ·
 * l'objectif de ≈ 15 ms n'est pas atteint sur pglite, il demanderait d'agréger
 * aussi `metrics_daily` à l'écriture. L'écriture de la marque ne se paie qu'au
 * recalcul (import, synchro), jamais à l'affichage.
 *
 * (#1046 avait mesuré 9,9 · 8,6 · 11,6 → 126,8 ms sur une autre exécution du
 * même semis.) Sans statistiques (base neuve, jamais analysée), le
 * planificateur prend l'index unique (plateforme, annonce) pour le filtre
 * `platform = 'meta'` et toutes les lectures filtrées par plateforme passent à
 * ~230 ms · c'est l'état d'une base de test, pas de la production (autovacuum
 * analyse).
 *
 * `metaEnPlus` · des journées que la connexion a lues mais pas écrites (une ad
 * liée à la créa d'une autre marque, `porteuseSynchro`) · elles comptent comme
 * Meta pour cette ad (verdicts seulement · une fenêtre ne lit que ce qui est
 * écrit, comme la marque).
 */
export async function lireJourneesRetenues(brandId: string, portee: PorteeLecture): Promise<LectureRetenues> {
  const vide: LectureRetenues = { entrees: [], parAd: new Map(), ecartees: 0, csv: new Map(), joursMeta: new Map(), protocoleMeta: new Map(), cboInstance: new Map(), relues: 0, requetes: 0 };
  if (!db) return vide;
  const parExt = new Map<string, string>();
  const enPlus = new Map<string, Set<string>>();
  const journees: JourneeMetaLue[] = [];
  const protocoleMeta = new Map<string, ProtocoleAd>();
  const cboInstance = new Map<string, boolean | null>();
  let requetes = 0, relues = 0;
  const csv = new Map<string, EntreeCsvLue[]>();
  const fenetre = new Map<string, EntreeMesure[]>();
  const sommesCsv: EntreeRetenue[] = [];

  if ('ads' in portee) {
    for (const a of portee.ads) if (a.idMeta) parExt.set(a.idMeta, a.id);
    const [meta, c] = await Promise.all([lignesMeta(brandId, [...parExt.keys()]), lignesCsv(brandId, portee.ads.map((a) => a.id))]);
    for (const r of c) { let l = csv.get(r.adId); if (!l) csv.set(r.adId, (l = [])); l.push(entreeCsv(r)); }
    requetes += (parExt.size ? 1 : 0) + (portee.ads.length ? 1 : 0);
    const remplacees = new Set(portee.metaEnPlus?.keys() ?? []);
    for (const r of meta) {
      const adId = parExt.get(r.ext) ?? null;
      if (adId && remplacees.has(adId)) continue;
      journees.push({ adId, debut: r.date, fin: r.date, mesures: mesuresDeLaLigne(r) });
      if (adId && !protocoleMeta.has(adId)) {
        protocoleMeta.set(adId, { nomAnnonce: null, campagne: r.campagne, campagneId: r.campagneId, ensemble: r.ensemble, ensembleId: r.ensembleId, budgetJour: r.budget, cbo: false });
        cboInstance.set(adId, r.cbo ?? null);
      }
    }
    for (const [adId, es] of portee.metaEnPlus ?? []) for (const e of es) journees.push({ adId, debut: e.debut, fin: e.fin, mesures: e.mesures });
  } else {
    const aRelire = !portee.entreeParEntree;
    const [sommes, retenuesCsv, c] = await Promise.all([
      sommesMetaParJour(brandId, portee.du, portee.au),
      aRelire ? sommesCsvRetenuesParJour(brandId, portee.du, portee.au) : Promise.resolve([]),
      lignesCsvFenetre(brandId, portee.du, portee.au, aRelire),
    ]);
    requetes += aRelire ? 3 : 2;
    // La connexion compte toujours · la marque, jour par jour (une somme n'a pas besoin de retrouver l'ad).
    for (const r of sommes) {
      const d = String(r.date);
      journees.push({ adId: null, debut: d, fin: d, mesures: {
        spend: Number(r.spend), impressions: Number(r.impressions), clicks: Number(r.clicks), linkClicks: Number(r.linkClicks),
        purchases: Number(r.conv), purchaseValue: Number(r.revenue), video3s: Number(r.v3s),
      } });
    }
    // Les entrées d'export retenues, marque écrite · une ligne par premier jour.
    for (const r of retenuesCsv) {
      const d = String(r.date);
      sommesCsv.push({ adId: null, debut: d, fin: d, source: 'csv', nombre: Number(r.nombre), mesures: {
        spend: Number(r.spend), impressions: Number(r.impressions), linkClicks: Number(r.linkClicks), purchases: Number(r.purchases),
        clicks: Number(r.clicks), purchaseValue: Number(r.purchaseValue), video3s: Number(r.video3s),
      } });
    }
    // Le repli · les ads à relire, entrée par entrée · avec les jours Meta de ces ads (dans la fenêtre ou hors d'elle), qui écartent une entrée d'export sans compter.
    const adsDeExt = new Map<string, string[]>();
    let du = '', au = '';
    for (const r of c) {
      relues++;
      const ext = (r.ext as { ad_id?: string } | null)?.ad_id;
      if (ext && !fenetre.has(r.adId)) adsDeExt.set(ext, [...(adsDeExt.get(ext) ?? []), r.adId]);
      if (!du || r.debut < du) du = r.debut;
      if (r.fin > au) au = r.fin;
      const mesures: MesuresLigne = { spend: r.spend, impressions: r.impressions, linkClicks: r.linkClicks, purchases: r.purchases, clicks: opt(r.clicks), purchaseValue: opt(r.purchaseValue), video3s: opt(r.video3s) };
      let l = fenetre.get(r.adId);
      if (!l) fenetre.set(r.adId, (l = []));
      l.push({ debut: r.debut, fin: r.fin, mesures });
    }
    if (adsDeExt.size) {
      requetes++;
      for (const r of await joursMetaDes(brandId, [...adsDeExt.keys()], du, au)) {
        for (const adId of adsDeExt.get(r.ext) ?? []) enPlus.set(adId, (enPlus.get(adId) ?? new Set()).add(String(r.date)));
      }
    }
  }

  const retenues = retenirJournees(journees, 'ads' in portee ? csv : fenetre, enPlus);
  if (sommesCsv.length) {
    retenues.entrees.push(...sommesCsv);
    retenues.entrees.sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
  }
  const joursMeta = new Map<string, Set<string>>([...enPlus].map(([k, v]) => [k, new Set(v)]));
  for (const j of journees) if (j.adId) joursMeta.set(j.adId, (joursMeta.get(j.adId) ?? new Set()).add(j.debut));
  return { ...retenues, csv, joursMeta, protocoleMeta, cboInstance, relues, requetes };
}

/* ───────────────────────── la marque « retenue », écrite ───────────────────────── */

/**
 * Efface la marque des entrées d'export de ces ads · à faire DANS l'écriture
 * qui peut la changer (une entrée importée, une journée Meta, un identifiant
 * épinglé), AVANT son recalcul (`marquerRetenues`) · si le recalcul n'a pas
 * lieu (erreur, coupure), la lecture relit ces ads entrée par entrée et reste
 * juste · une marque présente n'est jamais périmée.
 */
export async function invaliderRetenues(brandId: string, adIds: readonly string[], ex: Executeur | null = db): Promise<void> {
  if (!ex || !adIds.length) return;
  const C = schema.mesuresCsv;
  await ex.update(C).set({ retenue: null }).where(and(eq(C.brandId, brandId), inArray(C.adId, [...adIds]), sql`${C.retenue} is not null`));
}

/**
 * Écrit la marque « retenue » de TOUTES les entrées d'export de la marque ·
 * la décision de `retenirJournees` (`marquesRetenues`, noyau), sur ce qu'une
 * fenêtre lit · chaque ad, toutes ses entrées, tous les jours que la
 * connexion a ÉCRITS pour son identifiant épinglé (créas de la marque). Seules
 * les marques qui changent sont réécrites · rejouer ne fait rien. Appelée par
 * le recalcul (`recalculerVerdicts` · import ET synchro), et elle seule écrit
 * `true` ou `false` · toute la marque, donc aussi les lignes d'avant 0073 et
 * celles qu'une écriture a invalidées.
 *
 * Sérialisée par marque (verrou de transaction) · deux recalculs simultanés ne
 * croisent pas leur lecture et leur écriture, et chaque écriture de mesures
 * est suivie de son propre recalcul · le dernier voit tout ce qui précède.
 */
export async function marquerRetenues(brandId: string): Promise<{ entrees: number; changees: number }> {
  if (!db) return { entrees: 0, changees: 0 };
  const C = schema.mesuresCsv;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`adsmap-mesures-retenues:${brandId}`}))`);
    const lignes = await tx.select({ adId: C.adId, debut: C.dateDebut, fin: C.dateFin, retenue: C.retenue, ext: schema.ads.externalIds })
      .from(C).leftJoin(schema.ads, eq(schema.ads.id, C.adId)).where(eq(C.brandId, brandId));
    if (!lignes.length) return { entrees: 0, changees: 0 };
    const parAd = new Map<string, typeof lignes>();
    const adsDeExt = new Map<string, Set<string>>();
    for (const l of lignes) {
      let es = parAd.get(l.adId);
      if (!es) parAd.set(l.adId, (es = []));
      es.push(l);
      const ext = (l.ext as { ad_id?: string } | null)?.ad_id;
      if (ext) adsDeExt.set(ext, (adsDeExt.get(ext) ?? new Set()).add(l.adId));
    }
    const joursMeta = new Map<string, Set<string>>();
    for (const r of await joursMetaDes(brandId, [...adsDeExt.keys()], null, null, tx)) {
      for (const adId of adsDeExt.get(r.ext) ?? []) joursMeta.set(adId, (joursMeta.get(adId) ?? new Set()).add(String(r.date)));
    }
    const marques = marquesRetenues(parAd, joursMeta);
    const aEcrire: Record<'oui' | 'non', typeof lignes> = { oui: [], non: [] };
    for (const [l, m] of marques) if (l.retenue !== m) aEcrire[m ? 'oui' : 'non'].push(l);
    for (const [cle, ls] of Object.entries(aEcrire) as Array<['oui' | 'non', typeof lignes]>) {
      for (let i = 0; i < ls.length; i += 500) {
        const cles = sql.join(ls.slice(i, i + 500).map((l) => sql`(${l.adId}::uuid, ${l.debut}::date, ${l.fin}::date)`), sql`, `);
        await tx.update(C).set({ retenue: cle === 'oui' })
          .where(and(eq(C.brandId, brandId), sql`(${C.adId}, ${C.dateDebut}, ${C.dateFin}) in (${cles})`));
      }
    }
    return { entrees: lignes.length, changees: aEcrire.oui.length + aEcrire.non.length };
  });
}

/** Les entrées CSV déjà en base, indexées par clé d'écriture · pour dire « identique » ou « remplacée ». */
export function existantesParCle(csv: ReadonlyMap<string, readonly EntreeCsvLue[]>): Map<string, MesuresLigne> {
  const out = new Map<string, MesuresLigne>();
  for (const [adId, es] of csv) for (const e of es) out.set(cleEntreeMesure(adId, e), e.mesures);
  return out;
}

/**
 * Le RELAIS du CBO · tel que la connexion l'a lu au dernier passage, par lot,
 * dans `protocol_check_json.cboMeta` · le seul endroit où il vivait avant 0073.
 * Le CBO est désormais écrit sur l'instance (`ad_instances.campaign_budget_optimization`)
 * et lu d'abord là (`cboRetenu`) · le relais n'est plus lu que pour une
 * instance d'avant 0073 (NULL), et toujours écrit pour que le repli reste
 * vrai. Il se retire (lecture ET écriture, une PR) quand plus aucune instance
 * Meta n'a son CBO NULL (`select count(*) from ad_instances where platform =
 * 'meta' and campaign_budget_optimization is null` → 0 sur le VPS).
 */
const cboDuLot = (pc: unknown): Set<string> => {
  const v = (pc as { cboMeta?: unknown } | null)?.cboMeta;
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
};

/**
 * Recalcule les verdicts des lots touchés · LA logique de verdict, la même pour
 * la synchro Meta (`syncBrand`) et pour l'import d'un export · mêmes règles
 * (`verdictsDesMesures`), sur les journées RETENUES (`lireJourneesRetenues`).
 * Une ad mesurée par fichier puis synchronisée garde ses journées d'export des
 * jours que la connexion n'a pas. N'écrit que `computed`, `comparable`,
 * `metrics_agg` · un verdict arbitré par l'équipe reste ce qu'il est.
 *
 * `protocoleFrais` · ce que la synchro vient de lire chez Meta (CBO compris),
 * prioritaire · `metaNonEcrites` · journées lues chez Meta mais non écrites
 * (créa d'une autre marque).
 */
export async function recalculerVerdicts(
  brand: { id: string; name: string; workspaceId: string },
  ads: readonly AdDeLaMarque[],
  touchees: ReadonlySet<string>,
  o: { maintenant?: Date; protocoleFrais?: ReadonlyMap<string, ProtocoleAd>; metaNonEcrites?: ReadonlyMap<string, readonly EntreeMesure[]> } = {},
): Promise<{ verdicts: number; lots: number }> {
  if (!db) return { verdicts: 0, lots: 0 };
  const maintenant = o.maintenant ?? new Date();
  // La marque « retenue » d'abord · elle ne décide pas du verdict (lu entrée par entrée ci-dessous), elle accélère les fenêtres.
  // Best-effort · un échec laisse les marques invalidées (NULL), et la lecture d'une fenêtre relit ces ads entrée par entrée.
  try { await marquerRetenues(brand.id); } catch (e) { console.error('[adsmap] marque retenue', brand.id, (e as Error).message); }
  const lotsTouches = new Set(ads.filter((a) => touchees.has(a.id) && a.lotId).map((a) => a.lotId!));
  const concernees = ads.filter((a) => touchees.has(a.id) || (a.lotId && lotsTouches.has(a.lotId)));

  const [lu, [vc], [tp], lots] = await Promise.all([
    lireJourneesRetenues(brand.id, { ads, metaEnPlus: o.metaNonEcrites }),
    db.select({ config: schema.verdictConfigs.config }).from(schema.verdictConfigs).where(eq(schema.verdictConfigs.brandId, brand.id)).limit(1),
    db.select().from(schema.testProtocols).where(eq(schema.testProtocols.brandId, brand.id)).limit(1),
    lotsTouches.size
      ? db.select({ id: schema.batches.id, pc: schema.batches.protocolCheck }).from(schema.batches).where(and(eq(schema.batches.brandId, brand.id), inArray(schema.batches.id, [...lotsTouches])))
      : Promise.resolve([] as Array<{ id: string; pc: unknown }>),
  ]);
  const cfg: VerdictConfig = { ...DEFAULT_VERDICT_CONFIG, ...((vc?.config as Partial<VerdictConfig>) ?? {}) };
  const regles: ProtocolRules = {
    structure: tp?.structure ?? 'abo_one_adset_per_ad',
    campaignNamePattern: tp?.campaignNamePattern ?? '[ADSMAP] TEST {brand} B{batch}',
    budgetVarianceTolerance: tp?.budgetVarianceTolerance ?? 0.2,
    minSpendShare: cfg.minSpendShare,
  };
  const cboConnu = new Map(lots.map((l) => [l.id, cboDuLot(l.pc)]));

  const protocoles = new Map<string, { protocole: ProtocoleAd; source: 'meta' | 'csv' | null }>();
  const protocoleDe = (a: AdDeLaMarque) => {
    let p = protocoles.get(a.id);
    if (!p) {
      const stocke = lu.protocoleMeta.get(a.id);
      const relais = !!a.lotId && !!cboConnu.get(a.lotId)?.has(a.id);
      const meta = o.protocoleFrais?.get(a.id) ?? (stocke ? { ...stocke, cbo: cboRetenu(lu.cboInstance.get(a.id), relais) } : undefined);
      p = protocoleRetenu(meta, lu.csv.get(a.id));
      protocoles.set(a.id, p);
    }
    return p.protocole;
  };
  const aMesurer = (a: AdDeLaMarque): AdAMesurer => adAMesurer(a, lu, protocoleDe(a));
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  const r = verdictsDesMesures(concernees.map(aMesurer), { config: cfg, regles, marque: brand.name, aujourdhui, reperes: ads.map(aMesurer) });

  for (const p of r.protocoles) {
    const membres = concernees.filter((a) => a.lotId === p.lotId);
    await db.update(schema.batches).set({
      protocolCheck: {
        ...p.check, summary: p.resume, checkedAt: maintenant.toISOString(),
        source: sourceDesEntrees(membres.flatMap((a) => lu.parAd.get(a.id) ?? [])),
        // Le RELAIS (voir `cboDuLot`) · toujours écrit tant qu'une instance d'avant 0073 peut en dépendre · trié, ensemble stable quel que soit l'ordre de lecture des ads.
        cboMeta: membres.filter((a) => protocoles.get(a.id)?.source === 'meta' && protocoles.get(a.id)!.protocole.cbo).map((a) => a.id).sort(),
      },
    }).where(and(eq(schema.batches.id, p.lotId), eq(schema.batches.brandId, brand.id)));
  }
  const parAd = new Map(concernees.map((a) => [a.id, a]));
  for (const v of r.verdicts) {
    await db.insert(schema.verdicts).values({
      adId: v.adId, workspaceId: parAd.get(v.adId)!.workspaceId,
      computed: v.res.computed, comparable: v.res.comparable, failedStage: v.res.failedStage, killFlag: v.res.killFlag,
      metricsAgg: {
        ...v.res.derived, spend: v.metrics.spend, impressions: v.metrics.impressions, purchases: v.metrics.purchases,
        daysElapsed: v.jours, daysRemaining: v.res.daysRemaining, reason: v.res.reason, syncedAt: maintenant.toISOString(),
        source: sourceDesEntrees(lu.parAd.get(v.adId) ?? []) ?? 'meta',
      },
      computedAt: maintenant,
    }).onConflictDoUpdate({
      target: schema.verdicts.adId,
      set: {
        computed: sql`excluded.computed`, comparable: sql`excluded.comparable`,
        failedStage: sql`excluded.failed_stage`, killFlag: sql`excluded.kill_flag`,
        metricsAgg: sql`excluded.metrics_agg_json`, computedAt: sql`excluded.computed_at`,
        // `validated`, `status` et `override_reason` restent intacts : ce sont
        // des décisions humaines, et ni un import ni la synchro ne défont un arbitrage.
      },
    });
  }
  return { verdicts: r.verdicts.length, lots: r.protocoles.length };
}


/* ───────────────────────── journal des remontées ───────────────────────── */

/**
 * Inscrit une remontée au journal · ne fait JAMAIS échouer l'appelant (une
 * mesure réussie ne devient pas un échec parce que son journal n'a pas pu
 * s'écrire). L'échec est un code (`motifEchecRemontee`), jamais le message brut.
 */
export async function journaliserRemontee(e: {
  workspaceId: string; brandId: string; source: SourceRemontee; declencheur: DeclencheurRemontee;
  ok: boolean; erreur?: unknown; resume?: RemonteeJournal['resume'];
}): Promise<void> {
  if (!db) return;
  try {
    await db.insert(schema.remontees).values({
      workspaceId: e.workspaceId, brandId: e.brandId, source: e.source, declencheur: e.declencheur, ok: e.ok,
      motif: e.ok ? null : motifEchecRemontee(e.erreur instanceof Error ? e.erreur.message : String(e.erreur ?? '')),
      resume: e.resume ?? null,
    });
  } catch (x) {
    console.error('[adsmap] journal des remontées', e.brandId, (x as Error).message);
  }
}

/** Les dernières remontées de la marque, la plus récente d'abord. */
export async function lireRemontees(brandId: string, limite = 10): Promise<RemonteeJournal[]> {
  if (!db) return [];
  const rows = await db.select().from(schema.remontees).where(eq(schema.remontees.brandId, brandId))
    .orderBy(sql`${schema.remontees.le} desc`).limit(limite);
  return rows.map((r) => ({
    source: r.source === 'csv' ? 'csv' : 'meta',
    declencheur: r.declencheur === 'nuit' || r.declencheur === 'import' ? r.declencheur : 'bouton',
    le: (r.le as Date).toISOString(), ok: r.ok,
    motif: (r.motif as RemonteeJournal['motif']) ?? null,
    resume: (r.resume as RemonteeJournal['resume']) ?? null,
  }));
}

/** Le réglage de la remontée nocturne et la dernière mesure réussie de la marque · lecture seule. */
export async function lireReglageRemontee(brandId: string): Promise<{ suspendueLe: string | null; derniereReussie: string | null }> {
  if (!db) return { suspendueLe: null, derniereReussie: null };
  const [b] = await db.select({ suspendue: schema.brands.adsmapRemonteeSuspendueLe, mesure: schema.brands.adsmapSyncedAt })
    .from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  return {
    suspendueLe: b?.suspendue ? (b.suspendue as Date).toISOString() : null,
    derniereReussie: b?.mesure ? (b.mesure as Date).toISOString() : null,
  };
}
