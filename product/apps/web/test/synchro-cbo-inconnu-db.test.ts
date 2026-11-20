import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * CBO INCONNU ⇒ lot non comparable.
 *
 * Le défaut · quand rien ne dit si le budget d'une ad est piloté par sa
 * campagne (aucun ensemble lu, ni sur l'instance, ni au relais du lot), le
 * CBO valait `false` · un lot pouvait passer « Protocole respecté ·
 * comparables » et couronner des `winner` absolus sans que personne sache s'il
 * tournait en CBO (§6.1). Trois chemins y mènent ·
 *  - A · la toute PREMIÈRE synchro d'une marque, lecture des ensembles en échec ;
 *  - B · une première synchro dont la lecture des ensembles réussit mais ne
 *    rend pas l'ensemble d'une ad ;
 *  - C · une instance d'avant 0073 (CBO NULL) sans relais `cboMeta` au lot, un
 *    soir où les ensembles ne se lisent pas. Avec le relais, le CBO tient ; à la
 *    lecture réussie suivante, le contrôle se rétablit.
 *
 * Le CBO est une propriété de la CAMPAGNE · une ad de la même campagne dont le
 * CBO est connu le dit pour celles qui ne l'ont pas (B, D · une ad terminée,
 * plus relue par la synchro, ne reste pas « inconnue » pour toujours). Un
 * export Ads Manager qui dit le budget de l'ensemble l'établit aussi (E · le
 * contournement d'un jeton sans droits sur les ensembles).
 *
 * La garde lance la VRAIE synchro (`runAdsMapSyncForBrand`), la VRAIE lecture
 * Meta contre une vraie base (pglite) · seul `fetch` est simulé · aucun réseau,
 * aucune dépense. Elle LIT la base · contrôle du lot, verdicts, file de
 * décisions, jalons.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), A: randomUUID(), B: randomUUID(), B2: randomUUID(), C: randomUUID(), D: randomUUID(), E: randomUUID(), F: randomUUID(), marque: '' };
});
const JOUR = 86_400_000;
const J = (k: number) => new Date(Date.now() - k * JOUR).toISOString().slice(0, 10);
/** Le faux Meta, par compte · `ensembles` · ce que rend la lecture des ensembles, ou `'droits'` · un refus (403, non redemandé). */
const meta = vi.hoisted(() => ({
  ensembles: {} as Record<string, Array<Record<string, unknown>> | 'droits'>,
  /** La campagne d'une ad, si elle n'est pas celle de sa marque. */
  campagneDe: {} as Record<string, string>,
}));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  decryptSecret: (v: string | null) => (v ? 'jeton-factice' : null),
}));
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.user, email: 'admin@test.local', name: null }, workspaceId: ids.ws, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { id: ids.marque, name: 'Marque', workspaceId: ids.ws },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));

import { db, schema, eq, and, inArray, sql } from '@tiktrends/db';
import { runAdsMapSyncForBrand } from '../lib/adsmap-sync';
import { daterJalons } from '../lib/jarvis-memory';
import { applyMesuresAction } from '../app/actions/adsmap-mesures';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const MARQUES = { A: 'act_a', B: 'act_b', B2: 'act_b2', C: 'act_c', D: 'act_d', E: 'act_e', F: 'act_f' } as const;
type Cle = keyof typeof MARQUES;
/** Les identifiants Meta des ads d'une marque · E en chiffres (un export Ads Manager ne rattache qu'un identifiant Meta valide). */
const adsDe = (m: Cle) => (m === 'E' ? ['120200000000000101', '120200000000000102'] : m === 'F' ? ['120200000000000201', '120200000000000202'] : [`${m.toLowerCase()}-1`, `${m.toLowerCase()}-2`]);
const JOURS = [7, 6, 5, 4, 3, 2, 1];

function fauxFetch() {
  vi.stubGlobal('fetch', async (url: string) => {
    const u = new URL(url);
    const compte = (Object.keys(MARQUES) as Cle[]).find((m) => u.pathname.includes(`/${MARQUES[m]}/`))!;
    const fin = { cursors: { after: 'fin' } };
    if (u.pathname.endsWith('/adsets')) {
      const e = meta.ensembles[compte] ?? [];
      if (e === 'droits') return new Response(JSON.stringify({ error: { message: '(#200) Permissions error · ads_read', code: 200 } }), { status: 403 });
      return new Response(JSON.stringify({ data: e, paging: fin }), { status: 200 });
    }
    // 7 journées par ad, 50 € et 5 achats par jour · CPA 10 € · de quoi couronner un `winner` absolu si le lot était comparable.
    const data = adsDe(compte).flatMap((ad) => JOURS.map((k) => ({
      ad_id: ad, ad_name: `Marque_B1_${ad}`, adset_id: `s-${ad}`, adset_name: `Ensemble ${ad}`, campaign_id: meta.campagneDe[ad] ?? `c-${compte}`, campaign_name: '[ADSMAP] TEST Marque B1',
      date_start: J(k), spend: '50', impressions: '5000', reach: '4000', clicks: '120', inline_link_clicks: '90',
      actions: [{ action_type: 'omni_purchase', value: '5' }], action_values: [{ action_type: 'omni_purchase', value: '195' }],
    })));
    return new Response(JSON.stringify({ data, paging: fin }), { status: 200 });
  });
}

/** Les ensembles ABO (budget à l'ensemble, 50 €) des ads données. */
const abo = (ads: string[]) => ads.map((ad) => ({ id: `s-${ad}`, name: `Ensemble ${ad}`, campaign_id: 'c', status: 'ACTIVE', daily_budget: '5000' }));

const S = { lots: {} as Record<Cle, string>, ads: {} as Record<Cle, string[]> };

async function lot(m: Cle) {
  const [b] = await db!.select({ pc: schema.batches.protocolCheck }).from(schema.batches).where(eq(schema.batches.id, S.lots[m]));
  const pc = b!.pc as { violations: Array<{ code: string }>; summary: string; compliant: boolean; cboMeta?: string[] };
  return { codes: pc.violations.map((v) => v.code), resume: pc.summary, conforme: pc.compliant, relais: pc.cboMeta ?? null };
}
async function verdicts(m: Cle) {
  const vs = await db!.select({ computed: schema.verdicts.computed, comparable: schema.verdicts.comparable }).from(schema.verdicts).where(inArray(schema.verdicts.adId, S.ads[m]));
  return { verdicts: vs.length, comparables: vs.filter((v) => v.comparable).length, winners: vs.filter((v) => v.computed === 'winner').length };
}
const RELATIFS = { verdicts: 2, comparables: 0, winners: 0 };
const COMPARABLES = { verdicts: 2, comparables: 2, winners: 2 };
const RESUME_INCONNU = 'CBO non établi · les verdicts de ce lot ne seront que relatifs tant qu’il ne l’est pas.';
const ACTION_INCONNU = 'Rétablis l’accès de la connexion Meta aux ensembles de publicités, ou importe un export Ads Manager du lot avec la colonne budget de l’ensemble · le CBO établi, le contrôle du lot se refait.';

async function synchro(m: Cle) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { await runAdsMapSyncForBrand(ids[m]); } finally { warn.mockRestore(); }
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'admin@test.local' });
  for (const m of Object.keys(MARQUES) as Cle[]) {
    await db!.insert(schema.brands).values({ id: ids[m], workspaceId: ids.ws, name: 'Marque', metaAdAccountId: MARQUES[m], metaToken: 'chiffre' });
    const [p] = await db!.insert(schema.personas).values({ brandId: ids[m], name: 'Persona' }).returning();
    const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'Désir' }).returning();
    const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'Angle', mechanism: 'demo' }).returning();
    const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Concept' }).returning();
    const [b] = await db!.insert(schema.batches).values({ workspaceId: ids.ws, brandId: ids[m], number: 1, status: 'testing', launchedAt: new Date(Date.now() - 7 * JOUR) }).returning({ id: schema.batches.id });
    S.lots[m] = b!.id;
    S.ads[m] = [];
    for (const [i, ext] of adsDe(m).entries()) {
      const [ad] = await db!.insert(schema.ads).values({
        workspaceId: ids.ws, conceptId: c!.id, batchId: b!.id, variantCode: `v${i + 1}`, format: 'static', status: 'paused',
        externalIds: { ad_id: ext }, launchedAt: new Date(Date.now() - 7 * JOUR),
      }).returning({ id: schema.ads.id });
      S.ads[m].push(ad!.id);
    }
  }
  fauxFetch();
});

describe('A · toute première synchro, lecture des ensembles en ÉCHEC · rien n’est connu', () => {
  it('le lot n’est PAS comparable · aucun `winner` absolu, le résumé dit pourquoi', async () => {
    meta.ensembles.A = 'droits';
    await synchro('A');
    expect(await verdicts('A'), 'CBO inconnu · le lot a des verdicts comparables et des winners absolus (§6.1)').toEqual(RELATIFS);
    const l = await lot('A');
    expect(l.conforme, 'CBO inconnu · le lot passe « Protocole respecté »').toBe(false);
    expect(l.codes).toEqual(['cbo_inconnu']);
    expect(l.resume).toBe(RESUME_INCONNU);
    expect(l.relais, 'un CBO inconnu ne s’écrit pas au relais comme un CBO lu').toEqual([]);
  });

  it('la file de décisions le dit, avec l’action qui le rétablit (lire les ensembles), pas « corrige la structure »', async () => {
    const d = await db!.select({ type: schema.decisionItems.type, payload: schema.decisionItems.payload }).from(schema.decisionItems)
      .where(and(eq(schema.decisionItems.brandId, ids.A), eq(schema.decisionItems.type, 'protocol_violation')));
    expect(d).toHaveLength(1);
    const p = d[0]!.payload as { title: string; action: string };
    expect(p.title, 'le titre porte un point avant la parenthèse des montants').toBe(`Lot 1 · ${RESUME_INCONNU.slice(0, -1)} (700 € engagés).`);
    expect(p.action, 'protocole inconnu · la décision demande de corriger une structure qu’on n’a pas pu lire').toBe(ACTION_INCONNU);
  });

  it('les jalons · rien de daté sur un lot non comparable, et `daterJalons` n’échoue pas', async () => {
    expect(await daterJalons(ids.A, ids.ws)).toBe(0);
    const [n] = await db!.select({ n: sql<number>`count(*)::int` }).from(schema.statMilestones).where(eq(schema.statMilestones.brandId, ids.A));
    expect(n!.n).toBe(0);
  });

  it('la lecture réussie suivante rétablit le contrôle · ABO lu, lot comparable, la décision tombe', async () => {
    meta.ensembles.A = abo(adsDe('A'));
    await synchro('A');
    expect((await lot('A')).codes).toEqual([]);
    expect(await verdicts('A')).toEqual(COMPARABLES);
    const d = await db!.select({ type: schema.decisionItems.type }).from(schema.decisionItems)
      .where(and(eq(schema.decisionItems.brandId, ids.A), eq(schema.decisionItems.type, 'protocol_violation')));
    expect(d).toHaveLength(0);
  });
});

describe('B · première synchro, lecture réussie qui ne rend PAS l’ensemble d’une ad', () => {
  it('même campagne qu’une ad lue · le CBO de la campagne vaut pour elle · lot comparable', async () => {
    meta.ensembles.B = abo(['b-2']);
    await synchro('B');
    expect((await lot('B')).codes, 'une ad de la même campagne dit le CBO · il reste « inconnu »').toEqual([]);
    expect(await verdicts('B')).toEqual(COMPARABLES);
  });

  it('AUTRE campagne, rien de connu d’elle · CBO inconnu · lot non comparable', async () => {
    meta.campagneDe['b2-1'] = 'c-autre';
    meta.ensembles.B2 = abo(['b2-2']);
    await synchro('B2');
    expect(await verdicts('B2'), 'ensemble absent, rien de connu de sa campagne · le lot couronne des winners absolus').toEqual(RELATIFS);
    expect((await lot('B2')).codes).toEqual(['cbo_inconnu']);
  });
});

describe('D · une ad TERMINÉE (plus relue par la synchro) au CBO inconnu, sa voisine de campagne lue ensuite', () => {
  it('1re synchro ensembles refusés · lot inconnu · d-2 passe « terminée » · la lecture réussie suivante (d-1 en ABO) rétablit le lot, deux fois de suite', async () => {
    meta.ensembles.D = 'droits';
    await synchro('D');
    expect((await lot('D')).codes).toEqual(['cbo_inconnu']);
    await db!.update(schema.ads).set({ status: 'done' }).where(eq(schema.ads.id, S.ads.D[1]!));
    meta.ensembles.D = abo(adsDe('D'));
    for (const passage of [1, 2]) {
      await synchro('D');
      expect((await lot('D')).codes, `lecture réussie n° ${passage} · l’ad terminée reste « CBO inconnu » pour toujours, alors que sa campagne est lue`).toEqual([]);
      expect(await verdicts('D')).toEqual(COMPARABLES);
    }
    const [i] = await db!.select({ c: schema.adInstances.campaignBudgetOptimization }).from(schema.adInstances).where(eq(schema.adInstances.externalAdId, 'd-2'));
    expect(i!.c, 'témoin · l’instance de l’ad terminée n’a pas été relue (le lot se rétablit par sa campagne, pas par elle)').toBeNull();
  });
});

/** Un export Ads Manager des ads d'une marque · `budget` · la colonne « Ad set budget » (montant, ou « Using campaign budget »). */
const exportAbo = (budget: string, m: Cle = 'E', campagne = '[ADSMAP] TEST Marque B1') => [
  'Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,Ad ID,Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,Ad set budget,Ad set budget type,Clicks (all)',
  ...adsDe(m).map((ad) => [J(8), J(8), J(8), campagne, `Ensemble ${ad}`, `Marque_B1_${ad}`, ad, 'Active', 1, 'purchase', 900, 1000, '10.00', 20, 1, 39, budget, 'Daily', 30].join(',')),
].join('\n') + '\n';

describe('E · ensembles toujours refusés, un export Ads Manager qui dit le budget de l’ensemble', () => {

  it('l’export dit ABO (50 € par ensemble) · le CBO inconnu de Meta est établi par le fichier · lot comparable', async () => {
    meta.ensembles.E = 'droits';
    await synchro('E');
    expect((await lot('E')).codes).toEqual(['cbo_inconnu']);
    ids.marque = ids.E;
    const r = await applyMesuresAction(exportAbo('50'), [], 'export-e.csv');
    expect(r.error).toBeUndefined();
    expect((await lot('E')).codes, 'un export qui dit le budget de l’ensemble (ABO) est ignoré · le lot reste « CBO inconnu »').toEqual([]);
    expect(await verdicts('E')).toEqual(COMPARABLES);
  });

  it('l’export dit « Utilisation du budget de la campagne » · CBO établi · lot relatif (cbo)', async () => {
    ids.marque = ids.E;
    expect((await applyMesuresAction(exportAbo('Using campaign budget'), [], 'export-e2.csv')).error).toBeUndefined();
    expect((await lot('E')).codes).toEqual(['cbo']);
    expect(await verdicts('E')).toEqual(RELATIFS);
  });

  it('puis un export ABO CORRECTIF (mauvais fichier, ou campagne passée en ABO) · le lot redevient comparable · l’export n’a rien écrit de définitif au relais', async () => {
    ids.marque = ids.E;
    expect((await applyMesuresAction(exportAbo('50'), [], 'export-e3.csv')).error).toBeUndefined();
    expect((await lot('E')).relais, 'le CBO dit par un export a été écrit au relais du lot comme un CBO lu chez Meta').toEqual([]);
    expect((await lot('E')).codes, 'export CBO puis export ABO correctif · le lot reste coincé en CBO').toEqual([]);
    expect(await verdicts('E')).toEqual(COMPARABLES);
  });
});

describe('F · ensembles refusés, export rattaché à l’ad mais d’une AUTRE campagne que sa campagne Meta', () => {
  it('l’export (ABO, autre campagne) n’établit rien · le lot reste « CBO non établi »', async () => {
    meta.ensembles.F = 'droits';
    await synchro('F');
    expect((await lot('F')).codes).toEqual(['cbo_inconnu']);
    ids.marque = ids.F;
    expect((await applyMesuresAction(exportAbo('50', 'F', 'Campagne ABO de l’an dernier'), [], 'export-f.csv')).error).toBeUndefined();
    expect((await lot('F')).codes, 'un export d’une autre campagne établit le CBO de la campagne Meta de l’ad').toEqual(['cbo_inconnu']);
    expect(await verdicts('F')).toEqual(RELATIFS);
  });

  it('témoin · le même export, campagne de l’ad (nom identique, casse et espaces près) · il établit l’ABO', async () => {
    ids.marque = ids.F;
    expect((await applyMesuresAction(exportAbo('50', 'F', '[adsmap]  test MARQUE b1'), [], 'export-f2.csv')).error).toBeUndefined();
    expect((await lot('F')).codes).toEqual([]);
    expect(await verdicts('F')).toEqual(COMPARABLES);
  });
});

describe('C · instance d’avant 0073 (CBO NULL) · le relais d’abord, sinon inconnu', () => {
  it('semis · une lecture réussie (ABO), puis le CBO de l’instance remis à NULL comme avant 0073', async () => {
    meta.ensembles.C = abo(adsDe('C'));
    await synchro('C');
    expect(await verdicts('C')).toEqual(COMPARABLES);
    await db!.update(schema.adInstances).set({ campaignBudgetOptimization: null }).where(inArray(schema.adInstances.externalAdId, adsDe('C')));
  });

  it('relais `cboMeta` présent, ensembles non lus · le relais dit CBO, le lot reste relatif', async () => {
    await db!.update(schema.batches).set({ protocolCheck: sql`${schema.batches.protocolCheck} || ${JSON.stringify({ cboMeta: [...S.ads.C].sort() })}::jsonb` }).where(eq(schema.batches.id, S.lots.C));
    meta.ensembles.C = 'droits';
    await synchro('C');
    expect((await lot('C')).codes).toEqual(['cbo']);
    expect(await verdicts('C')).toEqual(RELATIFS);
  });

  it('ni CBO d’instance ni relais, mais le budget d’ensemble (50 €) connu sur l’instance · il prouve l’ABO · lot comparable, stable d’une nuit à l’autre', async () => {
    await db!.update(schema.batches).set({ protocolCheck: sql`${schema.batches.protocolCheck} - 'cboMeta'` }).where(eq(schema.batches.id, S.lots.C));
    for (const nuit of [1, 2]) {
      await synchro('C');
      expect((await lot('C')).codes, `nuit ${nuit} · un budget d’ensemble connu ne prouve pas l’ABO pour une instance d’avant 0073`).toEqual([]);
      expect(await verdicts('C')).toEqual(COMPARABLES);
    }
  });

  it('ni CBO, ni relais, ni budget connus, ensembles non lus · CBO non établi · lot non comparable', async () => {
    await db!.update(schema.adInstances).set({ adsetDailyBudget: null }).where(inArray(schema.adInstances.externalAdId, adsDe('C')));
    await synchro('C');
    expect(await verdicts('C'), 'instance d’avant 0073 sans relais ni budget · le lot couronne des winners absolus').toEqual(RELATIFS);
    expect((await lot('C')).codes).toEqual(['cbo_inconnu']);
  });

  it('la lecture réussie suivante écrit le CBO sur l’instance et rétablit le lot', async () => {
    meta.ensembles.C = abo(adsDe('C'));
    await synchro('C');
    const i = await db!.select({ c: schema.adInstances.campaignBudgetOptimization }).from(schema.adInstances).where(inArray(schema.adInstances.externalAdId, adsDe('C')));
    expect(i.map((x) => x.c)).toEqual([false, false]);
    expect((await lot('C')).codes).toEqual([]);
    expect(await verdicts('C')).toEqual(COMPARABLES);
  });
});
