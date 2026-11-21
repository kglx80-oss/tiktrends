import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { SessionTest } from './studios-semis';

/**
 * Composer un lot · une ad n'entre que dans un lot de SA marque · sur une VRAIE
 * base (pglite, migrations du dépôt), avec la VRAIE garde et les VRAIES actions
 * serveur appelées directement, comme le ferait un navigateur qui contourne
 * l'écran · on lit la base, jamais la présence d'un appel.
 *
 * L'écran ne propose que les ads hors lot de la marque active · l'action, elle,
 * ne vérifiait que l'ESPACE de l'ad. Une ad de la marque Y rangée dans un lot de
 * la marque X n'apparaît sur aucun écran de X (lectures par le graphe) mais
 * compte à l'Accueil (lecture par lot) · le lot ne passe jamais pour conclu.
 *
 *  · ranger une ad d'une autre marque, ou d'un autre espace · refus, rien écrit ;
 *  · retirer, depuis un lot de X, une ad rangée ailleurs (autre marque, ou lot
 *    lancé de X) · refus, l'ad reste où elle est ;
 *  · ranger une ad déjà dans un autre lot · refus (l'écran ne le propose pas) ;
 *  · le geste de l'écran (ad hors lot de la marque) · rangée, puis retirée ;
 *  · dupliquer un lot déjà contaminé · seules les variantes de la marque suivent.
 * Aucun réseau, aucun modèle, 0 $.
 */

const h = vi.hoisted(() => ({
  session: null as SessionTest | null,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
  /** Une lecture PÉRIMÉE du lot de l'ad (une autre requête l'a déplacée entre la lecture et l'écriture). */
  perime: null as { adId: string; lotId: string | null } | null,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bX', 'bY', 'bZ', 'uo', 'ub']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('../lib/adsmap-marque', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('../lib/adsmap-marque')>();
  return {
    adsDeLaMarque: async (...a: Parameters<typeof vrai.adsDeLaMarque>) => {
      const m = await vrai.adsDeLaMarque(...a);
      const p = h.perime;
      if (p && m.has(p.adId)) m.set(p.adId, { ...m.get(p.adId)!, lotId: p.lotId });
      return m;
    },
  };
});
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));

import { db, schema, eq } from '@tiktrends/db';
import { sql } from 'drizzle-orm';
import { RAISON_AD_HORS_MARQUE_DU_LOT, RAISON_AD_DANS_UN_AUTRE_LOT, RAISON_LOT_DEJA_LANCE } from '@tiktrends/core';
import { duplicateBatchAction, setBatchAdAction } from '../app/actions/adsmap-batch';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const ads: Record<string, string> = {};
const lots: Record<string, string> = {};
const concepts: Record<string, string> = {};

function sess(qui: 'uo' | 'ub'): SessionTest {
  return {
    user: { id: I[qui]!, email: `${qui}@lot-marque.test`, name: null }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace',
    role: 'owner', plan: 'plus', equipe: null,
  };
}
const MARQUE = { X: () => ({ id: I.bX!, name: 'Neva' }), Y: () => ({ id: I.bY!, name: 'Autre' }), Z: () => ({ id: I.bZ!, name: 'Ailleurs' }) };
function comme(qui: 'uo' | 'ub', marque: { id: string; name: string }) { h.session = sess(qui); h.marque = marque; }

/** Un concept dans la marque (persona → désir → angle → concept). */
async function concept(ws: string, brand: string, titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: brand, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: titre }).returning();
  concepts[titre] = c!.id;
  return c!.id;
}
async function lot(cle: string, ws: string, brand: string, numero: number, status: 'planned' | 'testing') {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: numero, status, launchedAt: status === 'testing' ? new Date() : null }).returning();
  lots[cle] = b!.id;
}
async function ad(cle: string, ws: string, brand: string, lotCle: string | null, statut: 'draft' | 'live' = 'draft') {
  const c = await concept(ws, brand, `Concept ${cle}`);
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://neva.test/p', label: 'Page' }).returning();
  const [a] = await db.insert(schema.ads).values({
    workspaceId: ws, conceptId: c, batchId: lotCle ? lots[lotCle]! : null, variantCode: `v-${cle}`, status: statut, adType: 'ideation', format: 'static',
    hypothesis: 'Si on pose une question en accroche, alors le CPA baisse parce que la cible se reconnaît.', testedVariable: 'hook',
    offerId: offre!.id, landingPageId: page!.id, launchedAt: statut === 'live' ? new Date() : null,
  }).returning();
  ads[cle] = a!.id;
}
async function lotDe(cle: string) {
  return (await db.select({ b: schema.ads.batchId }).from(schema.ads).where(eq(schema.ads.id, ads[cle]!)))[0]!.b;
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus' }, { id: I.wsB!, name: 'Espace B', plan: 'plus' }]);
  await db.insert(schema.users).values((['uo', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@lot-marque.test` })));
  await db.insert(schema.workspaceMembers).values([{ workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' }]);
  await db.insert(schema.brands).values([
    { id: I.bX!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bY!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bZ!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  await lot('X1', I.wsA!, I.bX!, 1, 'planned');
  await lot('X2', I.wsA!, I.bX!, 2, 'testing');
  await lot('Xc', I.wsA!, I.bX!, 3, 'planned');
  await lot('Y1', I.wsA!, I.bY!, 1, 'testing');
  await ad('x1', I.wsA!, I.bX!, 'X1');
  await ad('xLibre', I.wsA!, I.bX!, null);
  await ad('x2', I.wsA!, I.bX!, 'X2', 'live');
  await ad('yLibre', I.wsA!, I.bY!, null);
  await ad('y1', I.wsA!, I.bY!, 'Y1', 'live');
  await ad('zLibre', I.wsB!, I.bZ!, null);
  // Un lot de X DÉJÀ contaminé (avant le correctif) · une ad de X, une ad de Y.
  await ad('xc', I.wsA!, I.bX!, 'Xc');
  await ad('yc', I.wsA!, I.bY!, 'Xc');
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; h.perime = null; });

describe('ranger une ad dans un lot · seulement une ad de la marque du lot', () => {
  it('une ad de la marque Y, rangée dans un lot de X par appel direct · refusée, elle reste hors lot', async () => {
    comme('uo', MARQUE.X());
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.yLibre!, inBatch: true })).toEqual({ error: RAISON_AD_HORS_MARQUE_DU_LOT });
    expect(await lotDe('yLibre'), 'l’ad de Y est entrée dans le lot de X').toBeNull();
    const dansX1 = await db.select({ id: schema.ads.id }).from(schema.ads).where(eq(schema.ads.batchId, lots.X1!));
    expect(dansX1.map((r) => r.id), 'le lot de X ne doit contenir que ses propres variantes').toEqual([ads.x1!]);
  });
  it('une ad d’un autre espace · refusée du même mot, sans dire qu’elle existe', async () => {
    comme('uo', MARQUE.X());
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.zLibre!, inBatch: true })).toEqual({ error: RAISON_AD_HORS_MARQUE_DU_LOT });
    expect(await lotDe('zLibre')).toBeNull();
  });
  it('retirer, depuis un lot de X, l’ad d’un lot LANCÉ de Y · refusé, elle reste dans son lot', async () => {
    comme('uo', MARQUE.X());
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.y1!, inBatch: false })).toEqual({ error: RAISON_AD_HORS_MARQUE_DU_LOT });
    expect(await lotDe('y1'), 'l’ad du lot lancé de Y en a été retirée').toBe(lots.Y1!);
  });
  it('retirer, depuis un lot en préparation de X, l’ad d’un lot LANCÉ de X · refusé, le témoin reste entier', async () => {
    comme('uo', MARQUE.X());
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.x2!, inBatch: false })).toEqual({ error: RAISON_AD_DANS_UN_AUTRE_LOT });
    expect(await lotDe('x2')).toBe(lots.X2!);
  });
  it('ranger dans un lot de X une ad déjà dans un autre lot de X · refusé, elle ne change pas de lot', async () => {
    comme('uo', MARQUE.X());
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.x2!, inBatch: true })).toEqual({ error: RAISON_AD_DANS_UN_AUTRE_LOT });
    expect(await lotDe('x2')).toBe(lots.X2!);
  });
  it('ranger une ad hors lot de X dans un lot LANCÉ de X · refusé, le témoin reste entier', async () => {
    comme('uo', MARQUE.X());
    expect(await setBatchAdAction({ batchId: lots.X2!, adId: ads.xLibre!, inBatch: true })).toEqual({ error: RAISON_LOT_DEJA_LANCE });
    expect(await lotDe('xLibre')).toBeNull();
  });
  it('l’ad a changé de lot entre la lecture et l’écriture · rien n’est écrit, elle reste dans son lot lancé', async () => {
    comme('uo', MARQUE.X());
    // La lecture la croit hors lot · en base, elle est dans le lot lancé #2.
    h.perime = { adId: ads.x2!, lotId: null };
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.x2!, inBatch: true })).toEqual({ error: RAISON_AD_DANS_UN_AUTRE_LOT });
    expect(await lotDe('x2'), 'une lecture périmée a sorti l’ad de son lot lancé').toBe(lots.X2!);
  });
  it('le geste de l’écran · une ad hors lot de X entre dans le lot de X, puis en sort', async () => {
    comme('uo', MARQUE.X());
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.xLibre!, inBatch: true })).toEqual({ ok: true });
    expect(await lotDe('xLibre')).toBe(lots.X1!);
    // Deux fois · rien ne change, rien n'est refusé (double clic).
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.xLibre!, inBatch: true })).toEqual({ ok: true });
    expect(await setBatchAdAction({ batchId: lots.X1!, adId: ads.xLibre!, inBatch: false })).toEqual({ ok: true });
    expect(await lotDe('xLibre')).toBeNull();
  });
  it('depuis la marque Y active, le lot de X « n’existe pas » · rien n’est écrit', async () => {
    comme('uo', MARQUE.Y());
    expect((await setBatchAdAction({ batchId: lots.X1!, adId: ads.yLibre!, inBatch: true })).error).toMatch(/introuvable|n’existe|existe pas|accessible/i);
    expect(await lotDe('yLibre')).toBeNull();
  });
});

describe('dupliquer un lot déjà contaminé · seules les variantes de la marque suivent', () => {
  it('le lot #3 de X porte une ad de Y · la copie n’en garde que la variante de X', async () => {
    comme('uo', MARQUE.X());
    const r = await duplicateBatchAction(lots.Xc!);
    expect(r.error).toBeUndefined();
    expect(r.variantes, 'la duplication a compté l’ad de l’autre marque').toBe(1);
    const copies = await db.select({ concept: schema.ads.conceptId }).from(schema.ads).where(eq(schema.ads.batchId, r.id!));
    expect(copies.map((c) => c.concept), 'une variante de Y a été copiée dans un lot de X').toEqual([concepts['Concept xc']!]);
  });
});

/** La requête en LECTURE seule donnée au propriétaire dans la PR · éprouvée ici, sur la même base. */
const REQUETE_LOTS_CONTAMINES = `
SELECT count(DISTINCT b.id) AS lots_contamines, count(*) AS ads_etrangeres
FROM adsmap_batches b
JOIN adsmap_ads a      ON a.batch_id = b.id
JOIN adsmap_concepts c ON c.id = a.concept_id
JOIN adsmap_angles an  ON an.id = c.angle_id
JOIN adsmap_desires d  ON d.id = an.desire_id
JOIN personas p        ON p.id = d.persona_id
WHERE p.brand_id <> b.brand_id OR a.workspace_id <> b.workspace_id`;

describe('la requête de comptage du propriétaire', () => {
  it('compte le seul lot contaminé (#3 de X, une ad de Y) · aucun des lots sains', async () => {
    const r = await db.execute(sql.raw(REQUETE_LOTS_CONTAMINES));
    const ligne = ((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[]))[0] as Record<string, unknown>;
    expect({ lots: Number(ligne.lots_contamines), ads: Number(ligne.ads_etrangeres) }).toEqual({ lots: 1, ads: 1 });
  });
});
