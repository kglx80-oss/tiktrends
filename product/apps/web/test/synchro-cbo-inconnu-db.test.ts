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
 * La garde lance la VRAIE synchro (`runAdsMapSyncForBrand`), la VRAIE lecture
 * Meta contre une vraie base (pglite) · seul `fetch` est simulé · aucun réseau,
 * aucune dépense. Elle LIT la base · contrôle du lot, verdicts, file de
 * décisions, jalons.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), A: randomUUID(), B: randomUUID(), C: randomUUID() };
});
const JOUR = 86_400_000;
const J = (k: number) => new Date(Date.now() - k * JOUR).toISOString().slice(0, 10);
/** Le faux Meta, par compte · `ensembles` · ce que rend la lecture des ensembles, ou `'droits'` · un refus (403, non redemandé). */
const meta = vi.hoisted(() => ({ ensembles: {} as Record<string, Array<Record<string, unknown>> | 'droits'> }));

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

import { db, schema, eq, and, inArray, sql } from '@tiktrends/db';
import { runAdsMapSyncForBrand } from '../lib/adsmap-sync';
import { daterJalons } from '../lib/jarvis-memory';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const MARQUES = { A: 'act_a', B: 'act_b', C: 'act_c' } as const;
type Cle = keyof typeof MARQUES;
const adsDe = (m: Cle) => [`${m.toLowerCase()}-1`, `${m.toLowerCase()}-2`];
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
      ad_id: ad, ad_name: `Marque_B1_${ad}`, adset_id: `s-${ad}`, adset_name: `Ensemble ${ad}`, campaign_id: `c-${compte}`, campaign_name: '[ADSMAP] TEST Marque B1',
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
const RESUME_INCONNU = 'Ensembles Meta non lus · protocole inconnu, les verdicts de ce lot ne seront que relatifs jusqu’à la prochaine lecture.';

async function synchro(m: Cle) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { await runAdsMapSyncForBrand(ids[m]); } finally { warn.mockRestore(); }
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
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
    expect(p.title).toBe(`Lot 1 · ${RESUME_INCONNU} (700 € engagés).`);
    expect(p.action, 'protocole inconnu · la décision demande de corriger une structure qu’on n’a pas pu lire').toBe('Vérifie l’accès de la connexion Meta aux ensembles de publicités · la prochaine lecture réussie rétablit le contrôle du lot.');
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
  it('l’ad dont l’ensemble manque a un CBO inconnu · lot non comparable', async () => {
    meta.ensembles.B = abo(['b-2']);
    await synchro('B');
    expect(await verdicts('B'), 'ensemble absent, rien de connu · le lot couronne des winners absolus').toEqual(RELATIFS);
    expect((await lot('B')).codes).toEqual(['cbo_inconnu']);
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

  it('ni instance ni relais, ensembles non lus · CBO inconnu · lot non comparable', async () => {
    await db!.update(schema.batches).set({ protocolCheck: sql`${schema.batches.protocolCheck} - 'cboMeta'` }).where(eq(schema.batches.id, S.lots.C));
    await synchro('C');
    expect(await verdicts('C'), 'instance d’avant 0073 sans relais · le lot couronne des winners absolus').toEqual(RELATIFS);
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
