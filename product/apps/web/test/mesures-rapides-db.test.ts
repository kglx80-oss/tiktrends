import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Lecture des mesures rapide à 90 jours (0073) · la priorité Meta / export
 * ÉCRITE sur chaque entrée d'export (`adsmap_mesures_csv.retenue`) et sommée
 * en SQL, et le CBO gardé sur l'instance (`ad_instances.campaign_budget_optimization`).
 *
 * Base RÉELLE (pglite + migrations du dépôt), lecture RÉELLE
 * (`lireJourneesRetenues`), import et synchro RÉELS (seul Meta est simulé,
 * aucun réseau, aucune dépense). Ce qui est prouvé, en lisant ce qui SORT ·
 *
 *  · sur trois jeux aléatoires (240 fenêtres tirées), la lecture marquée rend
 *    EXACTEMENT les sommes, le compte d'entrées d'export et le Reporting jour
 *    par jour de la lecture entrée par entrée · avant marque (lignes d'avant
 *    0073, NULL · repli), après marque, et marques à moitié invalidées ;
 *  · une fois marquée, une fenêtre de 90 jours ne relit plus aucune entrée une
 *    à une (le coût est là) ;
 *  · une synchro qui écrit des jours Meta couvrant un export · l'export de ces
 *    jours n'est plus compté · même quand le recalcul de la marque échoue
 *    après l'écriture (la marque a été effacée AVANT, la lecture relit l'ad) ;
 *  · le CBO lu par la synchro est écrit sur l'instance et relu par l'import
 *    (un lot en CBO reste « relatif » sans le relais du lot) · le relais
 *    `cboMeta` est encore lu pour une instance d'avant 0073.
 */

const h = vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  return {
    ids: { ws: u(), user: u(), brandA: u(), autre: u(), r: [u(), u(), u()] },
    marque: '' as string,
    meta: [] as unknown[],
    adsets: [] as unknown[] | null,
  };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  decryptSecret: (v: string | null) => (v ? 'jeton-factice' : null),
  metaDailySync: async () => h.meta,
  metaAdsetsSync: async () => { if (!h.adsets) throw new Error('ensembles indisponibles'); return h.adsets; },
}));
vi.mock('../lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/auth')>()),
  getSession: async () => ({ user: { id: h.ids.user, email: 'proprio@rapides.test', name: 'Camille' }, workspaceId: h.ids.ws, workspaceName: 'Agence', role: 'owner', plan: 'business', equipe: null }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));

import { db, schema, eq, and, inArray, sql } from '@tiktrends/db';
import { journeesReporting, sommeRetenues, importeesDans, type EntreeRetenue } from '@tiktrends/core';
import { lireJourneesRetenues, marquerRetenues, invaliderRetenues } from '../lib/adsmap-mesures';
import { applyMesuresAction } from '../app/actions/adsmap-mesures';
import { runAdsMapSyncForBrand } from '../lib/adsmap-sync';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const ids = h.ids;
const JOUR = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const AUJ = Date.parse(`${ymd(Date.now())}T00:00:00Z`);
/** Jour k d'un jeu · J(0) il y a 70 jours (les jeux aléatoires tiennent dans une fenêtre de 90 jours). */
const J = (k: number) => ymd(AUJ - 70 * JOUR + k * JOUR);

/** xorshift32 · la graine est brassée et les premiers tirages jetés (une petite graine donne sinon des tirages proches de zéro). */
function alea(graine: number) {
  let x = (Math.imul(graine + 1, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  const suivant = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 16; i++) suivant();
  return suivant;
}
/** Montants multiples de 0,25 · exacts en binaire, deux sommes dans deux ordres sont égales AU BIT. */
const quart = (r: () => number, n: number) => Math.floor(r() * n * 4) / 4;

async function chaine(brandId: string, titre: string) {
  const [pe] = await db!.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: an!.id, title: titre }).returning();
  return co!.id;
}

/** Ce qu'un écran lit d'une fenêtre · sommes de Résultats, entrées d'export comptées, Reporting de l'Accueil jour par jour. */
function lu(es: readonly EntreeRetenue[], du: string, au: string) {
  const parJour: Record<string, [number, number, number, number, number, number]> = {};
  for (const l of journeesReporting(es, du, au)) {
    const t = (parJour[l.date] ??= [0, 0, 0, 0, 0, 0]);
    t[0] += l.depense; t[1] += l.impressions; t[2] += l.clics; t[3] += l.achats; t[4] += l.revenu; t[5] += l.vues3s;
  }
  return { somme: sommeRetenues(es, du, au), importees: importeesDans(es, du, au), reporting: parJour };
}
async function deuxLectures(brandId: string, du: string, au: string) {
  const [marquee, entree] = await Promise.all([lireJourneesRetenues(brandId, { du, au }), lireJourneesRetenues(brandId, { du, au, entreeParEntree: true })]);
  return { marquee, entree, a: lu(marquee.entrees, du, au), b: lu(entree.entrees, du, au) };
}

/* ───────────────────────────── jeux aléatoires · lignes semées comme 0073 les laisse (marque NULL) ───────────────────────────── */

async function semerAleatoire(brandId: string, graine: number) {
  const r = alea(graine);
  const c = await chaine(brandId, `Aléatoire ${graine}`);
  const nAds = 8 + Math.floor(r() * 6);
  for (let i = 0; i < nAds; i++) {
    // Une ad sur sept n'a pas d'identifiant épinglé · ses entrées ne sont jamais écartées par la connexion.
    const ext = i % 7 === 3 ? null : `r${graine}-${i}`;
    const [a] = await db!.insert(schema.ads).values({ workspaceId: ids.ws, conceptId: c, variantCode: `v${i}`, externalIds: ext ? { ad_id: ext } : null }).returning({ id: schema.ads.id });
    if (ext && r() < 0.85) {
      const [cr] = await db!.insert(schema.creatives).values({ brandId, fingerprintHash: `r-${graine}-${i}`, type: 'image' }).returning({ id: schema.creatives.id });
      const [inst] = await db!.insert(schema.adInstances).values({ creativeId: cr!.id, externalAdId: ext, platform: 'meta' }).returning({ id: schema.adInstances.id });
      const jours = new Set<number>();
      const nM = Math.floor(r() * 35);
      for (let k = 0; k < nM; k++) jours.add(Math.floor(r() * 80));
      if (jours.size) await db!.insert(schema.metricsDaily).values([...jours].map((d) => ({ adInstanceId: inst!.id, date: J(d), spend: quart(r, 60), impressions: Math.floor(r() * 4000), clicks: Math.floor(r() * 90), conv: Math.floor(r() * 4), revenue: quart(r, 160), v3s: Math.floor(r() * 700) })));
    }
    const vues = new Set<string>();
    const lignes: Array<typeof schema.mesuresCsv.$inferInsert> = [];
    const nE = Math.floor(r() * 40);
    for (let k = 0; k < nE; k++) {
      const d = Math.floor(r() * 80);
      const long = r() < 0.7 ? 1 : 2 + Math.floor(r() * 6);
      const debut = J(d), fin = J(d + long - 1);
      if (vues.has(`${debut}|${fin}`)) continue;
      vues.add(`${debut}|${fin}`);
      lignes.push({
        adId: a!.id, workspaceId: ids.ws, brandId, dateDebut: debut, dateFin: fin, spend: quart(r, 120), impressions: Math.floor(r() * 3000),
        linkClicks: Math.floor(r() * 50), purchases: Math.floor(r() * 5),
        clicks: r() < 0.7 ? Math.floor(r() * 80) : null, purchaseValue: r() < 0.7 ? quart(r, 200) : null, video3s: r() < 0.5 ? Math.floor(r() * 600) : null,
      });
    }
    if (lignes.length) await db!.insert(schema.mesuresCsv).values(lignes);
  }
  // Une annonce suivie sans ad de la marque · ses journées comptent dans la marque.
  const [cr] = await db!.insert(schema.creatives).values({ brandId, fingerprintHash: `r-${graine}-orpheline`, type: 'image' }).returning({ id: schema.creatives.id });
  const [inst] = await db!.insert(schema.adInstances).values({ creativeId: cr!.id, externalAdId: `r${graine}-orpheline`, platform: 'meta' }).returning({ id: schema.adInstances.id });
  await db!.insert(schema.metricsDaily).values([5, 6, 40].map((d) => ({ adInstanceId: inst!.id, date: J(d), spend: 12.5, impressions: 100 })));
}

function fenetres(graine: number, n: number): Array<[string, string]> {
  const r = alea(graine * 104_729 + 3);
  const out: Array<[string, string]> = [[J(0), J(89)]];
  while (out.length < n) { const a = Math.floor(r() * 85), b = a + Math.floor(r() * 45); out.push([J(a), J(b)]); }
  return out;
}
const PAR_JEU = 80;

/* ───────────────────────────── marque A · import, synchro, CBO ───────────────────────────── */

const L = AUJ - 12 * JOUR;
const K = (k: number) => ymd(L + k * JOUR);
const NOM = (lot: number, k: number) => `Rapides_B${lot}_Preuve_v${k + 1}_hook`;
const S = { lot1: '', lot3: '', x: '', y: [] as string[] };
const CADRE: { offre?: string; page?: string } = {};

async function adLive(conceptId: string, code: string, o: Partial<typeof schema.ads.$inferInsert>) {
  if (!CADRE.offre) {
    const [of] = await db!.insert(schema.offers).values({ workspaceId: ids.ws, brandId: ids.brandA, label: 'Offre' }).returning({ id: schema.offers.id });
    const [lp] = await db!.insert(schema.landingPages).values({ workspaceId: ids.ws, brandId: ids.brandA, url: 'https://boutique.test/p', label: 'Fiche' }).returning({ id: schema.landingPages.id });
    CADRE.offre = of!.id; CADRE.page = lp!.id;
  }
  const [a] = await db!.insert(schema.ads).values({
    workspaceId: ids.ws, conceptId, variantCode: code, status: 'live', testedVariable: 'hook', offerId: CADRE.offre, landingPageId: CADRE.page,
    hypothesis: 'Si on montre la preuve, alors on convertit, parce que la preuve rassure.', launchedAt: new Date(L), ...o,
  }).returning({ id: schema.ads.id });
  return a!.id;
}
function exportEn(lignes: Array<{ nom: string; lot: number; k: number; depense: number; achats: number }>) {
  const t = 'Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,Ad set budget,Ad set budget type,Clicks (all),3-second video plays';
  return [t, ...lignes.map((l) => [K(l.k), K(l.k), K(l.k), `[ADSMAP] TEST Rapides B${l.lot}`, `AS ${l.nom}`, l.nom, 'Active', l.achats, 'purchase', 2500, 3000, l.depense.toFixed(2), 45, l.achats, l.achats * 39, 45, 'Daily', 60, 900].join(','))].join('\n') + '\n';
}
const ligneMeta = (adId: string, nom: string, lot: number, k: number, d: number, achats: number) => ({
  adId, adName: nom, adsetId: `as-${adId}`, adsetName: `AS ${adId}`, campaignId: `c-${lot}`, campaignName: `[ADSMAP] TEST Rapides B${lot}`,
  date: K(k), spend: d, impressions: 3000, reach: 2500, clicks: 60, linkClicks: 45, landingViews: 30, addToCart: 4,
  purchases: achats, purchaseValue: achats * 39, video3s: 900, thruplays: 0, videoP25: 0, videoP50: 0, videoP75: 0, videoP100: 0,
});
const SEPT = [0, 1, 2, 3, 4, 5, 6];
const EXPORT_X = exportEn(SEPT.map((k) => ({ nom: NOM(1, 0), lot: 1, k, depense: 10, achats: 1 })));
const EXPORT_Y = exportEn([{ nom: NOM(3, 0), lot: 3, k: 8, depense: 20, achats: 1 }]);

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'proprio@rapides.test' });
  await db!.insert(schema.workspaceMembers).values({ workspaceId: ids.ws, userId: ids.user, role: 'owner' });
  await db!.insert(schema.brands).values([
    { id: ids.brandA, workspaceId: ids.ws, name: 'Rapides', metaAdAccountId: 'act_1', metaToken: 'chiffre' },
    { id: ids.autre, workspaceId: ids.ws, name: 'Autre' },
    ...ids.r.map((id, i) => ({ id, workspaceId: ids.ws, name: `Aléatoire ${i + 1}` })),
  ]);
  for (const [i, id] of ids.r.entries()) await semerAleatoire(id, 101 + i);

  const [l1, l3] = await db!.insert(schema.batches).values([1, 3].map((n) => ({ workspaceId: ids.ws, brandId: ids.brandA, number: n, status: 'testing' as const, launchedAt: new Date(L) }))).returning({ id: schema.batches.id });
  S.lot1 = l1!.id; S.lot3 = l3!.id;
  const c = await chaine(ids.brandA, 'Preuve');
  S.x = await adLive(c, 'v1', { batchId: S.lot1, generatedName: NOM(1, 0), externalIds: { ad_id: 'meta-x' } });
  for (let k = 0; k < 2; k++) S.y.push(await adLive(c, `v${k + 1}`, { batchId: S.lot3, generatedName: NOM(3, k), externalIds: { ad_id: `meta-y${k}` } }));

  // L'autre marque · une entrée d'export marquée « retenue » à la main dans la fenêtre · rien d'elle ne doit compter chez A.
  const cb = await chaine(ids.autre, 'Autre');
  const [ab] = await db!.insert(schema.ads).values({ workspaceId: ids.ws, conceptId: cb, variantCode: 'v1' }).returning({ id: schema.ads.id });
  await db!.insert(schema.mesuresCsv).values({ adId: ab!.id, workspaceId: ids.ws, brandId: ids.autre, dateDebut: K(2), dateFin: K(2), spend: 7000, impressions: 1, linkClicks: 0, purchases: 0, retenue: true });

  h.meta = [
    ...[5, 6].map((k) => ligneMeta('meta-x', NOM(1, 0), 1, k, 40, 2)),
    ...[0, 1].flatMap((i) => SEPT.map((k) => ligneMeta(`meta-y${i}`, NOM(3, i), 3, k, 20, 1))),
  ];
  h.adsets = [
    { adsetId: 'as-meta-x', dailyBudget: 45, status: 'ACTIVE', campaignBudgetOptimization: false },
    ...[0, 1].map((i) => ({ adsetId: `as-meta-y${i}`, dailyBudget: 20, status: 'ACTIVE', campaignBudgetOptimization: true })),
  ];
}, 180_000);

/** Une requête brute · pglite rend `{ rows }` (le type du client de production est celui de postgres-js). */
const lignesSql = async (q: ReturnType<typeof sql>) => ((await db!.execute(q)) as unknown as { rows: Array<Record<string, number>> }).rows;
const nonMarquees = async (brandId: string) => Number((await lignesSql(sql`select count(*)::int as n from adsmap_mesures_csv where brand_id = ${brandId} and retenue is null`))[0]!.n);
const marquesDe = async (adId: string) => (await db!.select({ d: schema.mesuresCsv.dateDebut, r: schema.mesuresCsv.retenue }).from(schema.mesuresCsv).where(eq(schema.mesuresCsv.adId, adId)))
  .sort((a, b) => (a.d < b.d ? -1 : 1)).map((x) => `${x.d.slice(5)}:${x.r}`);

/* ───────────────────────────── 1 · égalité exacte, jeux aléatoires ───────────────────────────── */

describe('lecture marquée = lecture entrée par entrée · 3 jeux aléatoires, 240 fenêtres', () => {
  it('données d’avant 0073 (marque NULL) · la lecture relit les ads une à une et rend les sommes exactes', async () => {
    let relues = 0;
    for (const [i, brandId] of ids.r.entries()) {
      expect(await nonMarquees(brandId), 'témoin · le jeu n’a pas de lignes sans marque').toBeGreaterThan(0);
      for (const [du, au] of fenetres(i + 1, 20)) {
        const l = await deuxLectures(brandId, du, au);
        expect(l.a, `jeu ${i + 1}, fenêtre ${du} → ${au} · lignes d’avant 0073 · la lecture marquée ne rend pas les sommes exactes`).toEqual(l.b);
        relues += l.marquee.relues;
      }
    }
    expect(relues, 'les lignes sans marque n’ont pas été relues une à une (repli absent)').toBeGreaterThan(0);
  });

  it('marquées (`marquerRetenues`) · 240 fenêtres · mêmes sommes, mêmes entrées d’export comptées, même Reporting jour par jour · aucune entrée relue', async () => {
    let comparees = 0, importees = 0, ecarteesParMeta = 0;
    for (const [i, brandId] of ids.r.entries()) {
      const m = await marquerRetenues(brandId);
      expect(m.changees, `jeu ${i + 1} · rien n’a été marqué`).toBe(m.entrees);
      expect(await nonMarquees(brandId), `jeu ${i + 1} · une entrée reste sans marque après le recalcul`).toBe(0);
      ecarteesParMeta += Number((await lignesSql(sql`select count(*)::int as n from adsmap_mesures_csv where brand_id = ${brandId} and retenue = false`))[0]!.n);
      for (const [du, au] of fenetres(i + 1, PAR_JEU)) {
        const l = await deuxLectures(brandId, du, au);
        expect(l.a, `jeu ${i + 1}, fenêtre ${du} → ${au} · la lecture marquée ne rend pas les sommes de la lecture entrée par entrée`).toEqual(l.b);
        expect(l.marquee.relues, `jeu ${i + 1}, fenêtre ${du} → ${au} · des entrées marquées sont encore relues une à une`).toBe(0);
        comparees++; importees += l.a.importees;
      }
    }
    expect(comparees).toBe(3 * PAR_JEU);
    expect([importees > 100, ecarteesParMeta > 20], 'témoin · le jeu n’exerce pas les deux issues (comptée, écartée)').toEqual([true, true]);
  });

  it('marques à moitié invalidées · les ads invalidées relues une à une, le reste en somme SQL · total exact · rejouer la marque ne change rien', async () => {
    const brandId = ids.r[0]!;
    const ads = await db!.selectDistinct({ id: schema.mesuresCsv.adId }).from(schema.mesuresCsv).where(eq(schema.mesuresCsv.brandId, brandId));
    await invaliderRetenues(brandId, ads.filter((_, i) => i % 3 === 0).map((a) => a.id));
    // Une ad sur trois à moitié sans marque (une ligne sur deux) · les marques encore présentes de ces ads ne doivent pas être sommées en plus de leur relecture.
    const mixtes = ads.filter((_, i) => i % 3 === 1).map((a) => a.id);
    await db!.execute(sql`update adsmap_mesures_csv set retenue = null where brand_id = ${brandId} and ad_id in (${sql.join(mixtes.map((x) => sql`${x}::uuid`), sql`, `)}) and extract(day from date_debut)::int % 2 = 0`);
    const [mx] = (await lignesSql(sql`select count(*) filter (where retenue) ::int as oui, count(*) filter (where retenue is null)::int as nul from adsmap_mesures_csv where brand_id = ${brandId} and ad_id in (${sql.join(mixtes.map((x) => sql`${x}::uuid`), sql`, `)})`)) as Array<{ oui: number; nul: number }>;
    expect(mx!.oui > 0 && mx!.nul > 0, 'témoin · aucune ad n’a de marques mêlées (présentes et absentes)').toBe(true);
    let relues = 0;
    for (const [du, au] of fenetres(9, 30)) {
      const l = await deuxLectures(brandId, du, au);
      expect(l.a, `fenêtre ${du} → ${au} · marques à moitié invalidées · la lecture n’est plus exacte`).toEqual(l.b);
      relues += l.marquee.relues;
    }
    expect(relues).toBeGreaterThan(0);
    const m = await marquerRetenues(brandId);
    expect(await nonMarquees(brandId)).toBe(0);
    expect((await marquerRetenues(brandId)).changees, 'rejouer la marque réécrit des lignes').toBe(0);
    expect(m.changees).toBeGreaterThan(0);
  });

  it('coût · une fenêtre de 90 jours (et la précédente) marquée · 3 requêtes, aucune entrée relue, le total de la marque', async () => {
    const brandId = ids.r[1]!;
    const l = await lireJourneesRetenues(brandId, { du: J(-90), au: J(89) });
    expect([l.requetes, l.relues]).toEqual([3, 0]);
    const ref = await lireJourneesRetenues(brandId, { du: J(-90), au: J(89), entreeParEntree: true });
    expect(ref.relues, 'témoin · la lecture entrée par entrée relit bien tout').toBeGreaterThan(50);
    expect(lu(l.entrees, J(-90), J(89))).toEqual(lu(ref.entrees, J(-90), J(89)));
  });
});

/* ───────────────────────────── 2 · import, synchro qui couvre l'export, CBO ───────────────────────────── */

async function lot3() {
  const [b] = await db!.select({ pc: schema.batches.protocolCheck }).from(schema.batches).where(eq(schema.batches.id, S.lot3));
  const pc = b!.pc as { violations: Array<{ code: string }>; summary: string; cboMeta?: string[] };
  return { codes: pc.violations.map((v) => v.code), summary: pc.summary, relais: pc.cboMeta ?? null };
}
const cboInstances = async () => Object.fromEntries((await db!.select({ e: schema.adInstances.externalAdId, c: schema.adInstances.campaignBudgetOptimization }).from(schema.adInstances)
  .where(inArray(schema.adInstances.externalAdId, ['meta-x', 'meta-y0', 'meta-y1']))).map((r) => [r.e, r.c]));

describe('import puis synchro · un jour Meta qui couvre une entrée d’export la retire du compte', () => {
  it('l’import marque ses entrées · 7 jours d’export comptés, aucune relue', async () => {
    h.marque = ids.brandA;
    const r = await applyMesuresAction(EXPORT_X, [], 'export-x.csv');
    expect(r.error).toBeUndefined();
    expect(await marquesDe(S.x), 'l’import n’a pas marqué ses entrées').toEqual(SEPT.map((k) => `${K(k).slice(5)}:true`));
    const l = await deuxLectures(ids.brandA, K(0), K(6));
    expect([l.a.somme.depense, l.a.importees, l.marquee.relues]).toEqual([70, 7, 0]);
    expect(l.a).toEqual(l.b);
  });

  it('synchro dont le recalcul de la marque ÉCHOUE après l’écriture · la marque a été effacée avant, la lecture relit l’ad et ne compte plus J5, J6', async () => {
    const tx = db!.transaction.bind(db!);
    (db as unknown as { transaction: unknown }).transaction = async () => { throw new Error('coupure simulée'); };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { await runAdsMapSyncForBrand(ids.brandA); } finally { (db as unknown as { transaction: unknown }).transaction = tx; err.mockRestore(); }
    expect(await marquesDe(S.x), 'la synchro écrit des journées Meta sans effacer la marque des entrées qu’elles couvrent').toEqual(SEPT.map((k) => `${K(k).slice(5)}:null`));
    const l = await deuxLectures(ids.brandA, K(0), K(6));
    // 5 jours d'export (10 €) + 2 jours Meta de x (40 €) + y0, y1 (20 € × 7 chacun).
    expect([l.a.somme.depense, l.a.importees], 'J5, J6 · l’export compté avec la connexion le même jour').toEqual([50 + 80 + 280, 5]);
    expect(l.marquee.relues).toBe(7);
    expect(l.a).toEqual(l.b);
  });

  it('synchro complète · J5, J6 marqués écartés, la fenêtre se relit en sommes, mêmes chiffres', async () => {
    await runAdsMapSyncForBrand(ids.brandA);
    expect(await marquesDe(S.x), 'la synchro n’a pas recalculé la marque des entrées couvertes').toEqual(SEPT.map((k) => `${K(k).slice(5)}:${k < 5}`));
    const l = await deuxLectures(ids.brandA, K(0), K(6));
    expect([l.a.somme.depense, l.a.importees, l.marquee.relues]).toEqual([50 + 80 + 280, 5, 0]);
    expect(l.a).toEqual(l.b);
  });
});

describe('le CBO gardé sur la pub (ad_instances), le relais du lot en repli', () => {
  it('la synchro écrit le CBO lu chez Meta sur l’instance · un passage sans ensembles lus ne l’efface pas', async () => {
    expect(await cboInstances(), 'le CBO lu chez Meta n’est pas écrit sur l’instance').toEqual({ 'meta-x': false, 'meta-y0': true, 'meta-y1': true });
    h.adsets = null;
    try { await runAdsMapSyncForBrand(ids.brandA); } finally {
      h.adsets = [
        { adsetId: 'as-meta-x', dailyBudget: 45, status: 'ACTIVE', campaignBudgetOptimization: false },
        ...[0, 1].map((i) => ({ adsetId: `as-meta-y${i}`, dailyBudget: 20, status: 'ACTIVE', campaignBudgetOptimization: true })),
      ];
    }
    expect(await cboInstances(), 'un passage sans ensembles lus a effacé le CBO connu').toEqual({ 'meta-x': false, 'meta-y0': true, 'meta-y1': true });
    await runAdsMapSyncForBrand(ids.brandA);
  });

  it('un lot en CBO reste « relatif » après un import · sans le relais du lot, le CBO est relu sur l’instance', async () => {
    await db!.update(schema.batches).set({ protocolCheck: sql`${schema.batches.protocolCheck} - 'cboMeta'` }).where(eq(schema.batches.id, S.lot3));
    expect((await lot3()).relais, 'témoin · le relais n’a pas été retiré').toBeNull();
    h.marque = ids.brandA;
    const r = await applyMesuresAction(EXPORT_Y, [], 'export-y.csv');
    expect(r.error).toBeUndefined();
    const p = await lot3();
    expect(p.codes, 'lot 3 · le CBO écrit sur l’instance n’est pas relu par l’import').toContain('cbo');
    expect(p.summary).toContain('ne seront que relatifs');
  });

  it('lot d’avant 0073 · instance sans CBO (NULL), relais présent · l’import relit le relais et le lot reste « relatif »', async () => {
    await db!.update(schema.adInstances).set({ campaignBudgetOptimization: null }).where(inArray(schema.adInstances.externalAdId, ['meta-y0', 'meta-y1']));
    await db!.update(schema.batches).set({ protocolCheck: sql`${schema.batches.protocolCheck} || ${JSON.stringify({ cboMeta: [...S.y].sort() })}::jsonb` }).where(eq(schema.batches.id, S.lot3));
    h.marque = ids.brandA;
    expect((await applyMesuresAction(EXPORT_Y, [], 'export-y.csv')).error).toBeUndefined();
    const p = await lot3();
    expect(p.codes, 'lot d’avant 0073 · le relais cboMeta n’est plus lu').toContain('cbo');
    expect(p.relais, 'le relais n’est plus réécrit · un lot d’avant 0073 le perdrait au recalcul suivant').toEqual([...S.y].sort());
  });

  it('témoin · instance sans CBO ET relais retiré · le lot n’est plus en CBO (la garde voit l’absence)', async () => {
    await db!.update(schema.batches).set({ protocolCheck: sql`${schema.batches.protocolCheck} - 'cboMeta'` }).where(eq(schema.batches.id, S.lot3));
    h.marque = ids.brandA;
    expect((await applyMesuresAction(EXPORT_Y, [], 'export-y.csv')).error).toBeUndefined();
    expect((await lot3()).codes).not.toContain('cbo');
  });

  it('import qui ÉPINGLE un identifiant Meta dont la connexion a des jours · recalcul de la marque en échec · la marque a été effacée dans l’import, l’entrée couverte n’est plus comptée', async () => {
    // z · mesurée par export (sans identifiant), marquée retenue · la connexion a, pour « 120200000000000099 », une journée K(1) sur une créa de la marque.
    const c = await chaine(ids.brandA, 'Épingle');
    const z = await adLive(c, 'v2', { batchId: S.lot1, generatedName: NOM(1, 1) });
    await db!.insert(schema.mesuresCsv).values([0, 1, 2].map((k) => ({ adId: z, workspaceId: ids.ws, brandId: ids.brandA, dateDebut: K(k), dateFin: K(k), spend: 5, impressions: 3000, linkClicks: 45, purchases: 1, clicks: 60, purchaseValue: 39, video3s: 900 })));
    const [cr] = await db!.insert(schema.creatives).values({ brandId: ids.brandA, fingerprintHash: 'z-1', type: 'image' }).returning({ id: schema.creatives.id });
    const [inst] = await db!.insert(schema.adInstances).values({ creativeId: cr!.id, externalAdId: '120200000000000099', platform: 'meta' }).returning({ id: schema.adInstances.id });
    await db!.insert(schema.metricsDaily).values({ adInstanceId: inst!.id, date: K(1), spend: 3, impressions: 10 });
    await marquerRetenues(ids.brandA);
    expect(await marquesDe(z)).toEqual([0, 1, 2].map((k) => `${K(k).slice(5)}:true`));
    // Le même export, avec la colonne « Ad ID » · l'import épingle 120200000000000099 sur z, la marque doit être recalculée.
    const t = 'Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad ID,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,Ad set budget,Ad set budget type,Clicks (all),3-second video plays';
    const fichier = [t, ...[0, 1, 2].map((k) => [K(k), K(k), K(k), '[ADSMAP] TEST Rapides B1', `AS ${NOM(1, 1)}`, NOM(1, 1), '120200000000000099', 'Active', 1, 'purchase', 2500, 3000, '5.00', 45, 1, 39, 45, 'Daily', 60, 900].join(','))].join('\n') + '\n';
    const tx = db!.transaction.bind(db!);
    let appels = 0;
    (db as unknown as { transaction: unknown }).transaction = (async (f: unknown) => { if (++appels > 1) throw new Error('coupure simulée'); return tx(f as never); }) as unknown;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.marque = ids.brandA;
    try { expect((await applyMesuresAction(fichier, [], 'export-z.csv')).error).toBeUndefined(); } finally { (db as unknown as { transaction: unknown }).transaction = tx; err.mockRestore(); }
    expect(appels, 'témoin · le recalcul de la marque n’a pas été coupé').toBe(2);
    expect((await db!.select({ e: schema.ads.externalIds }).from(schema.ads).where(eq(schema.ads.id, z)))[0]!.e).toMatchObject({ ad_id: '120200000000000099' });
    expect(await marquesDe(z), 'l’import épingle un identifiant sans effacer la marque de ses entrées').toEqual([0, 1, 2].map((k) => `${K(k).slice(5)}:null`));
    const l = await deuxLectures(ids.brandA, K(0), K(2));
    expect(l.a, 'l’entrée de K(1), couverte par la connexion, est encore comptée').toEqual(l.b);
    await marquerRetenues(ids.brandA);
    expect(await marquesDe(z)).toEqual([`${K(0).slice(5)}:true`, `${K(1).slice(5)}:false`, `${K(2).slice(5)}:true`]);
  });

  it('l’autre marque · son entrée marquée ne compte jamais chez A', async () => {
    const l = await lireJourneesRetenues(ids.brandA, { du: K(0), au: K(8) });
    expect(sommeRetenues(l.entrees, K(0), K(8)).depense).toBeLessThan(7000);
    const [n] = (await db!.select({ n: sql<number>`count(*)::int` }).from(schema.mesuresCsv).where(and(eq(schema.mesuresCsv.brandId, ids.autre), eq(schema.mesuresCsv.retenue, true))));
    expect(n!.n, 'le recalcul d’une marque a touché les marques d’une autre').toBe(1);
  });
});
