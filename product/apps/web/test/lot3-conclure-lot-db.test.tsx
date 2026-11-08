// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SessionTest } from './studios-semis';

/**
 * Lot 3 · conclure un lot entier et réutiliser l'apprentissage · sur une VRAIE
 * base (pglite, migrations réelles), avec les VRAIES actions et les VRAIES pages
 * Spatiales rendues · on lit le HTML et la base, jamais la présence d'un appel.
 *
 *  · la conclusion du lot (règle du noyau, contre les autres lots de la marque)
 *    s'affiche AU-DESSUS du verdict du moteur ;
 *  · dupliquer un lot crée un lot neuf en préparation, ses variantes en
 *    brouillon, sans aucune mesure ni verdict · le lot source ne bouge pas ;
 *  · un apprentissage validé passe dans les règles de la marque sur un clic,
 *    et la page Règles le montre, avec son origine ;
 *  · une autre marque, un autre espace, un rôle insuffisant · refus, rien écrit ;
 *  · l'Accueil dit l'écart de la gagnante au reste de son lot (G09).
 * Aucun réseau, aucune dépense.
 */

const h = vi.hoisted(() => ({
  session: null as SessionTest | null,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bB', 'uo', 'um', 'ub']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/adsmap/lots',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

import { db, schema, eq, and } from '@tiktrends/db';
import { inArray } from 'drizzle-orm';
import { avecSpatial } from './spatial/fournisseur';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import ApprentissagesSpatial from '../app/(spatial)/sp/adsmap/apprentissages/page';
import ReglesSpatiale from '../app/(spatial)/sp/brands/[id]/regles/page';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import { duplicateBatchAction } from '../app/actions/adsmap-batch';
import { validateVerdictAction } from '../app/actions/adsmap-verdict';
import { apprentissageVersReglesAction, rejeterApprentissageAction } from '../app/actions/adsmap-apprentissage';

const I = h.ids;
const JOUR = 86_400_000;
const lots: Record<string, string> = {};
const ads: Record<string, string[]> = {};
const ENONCE = 'Une question en accroche retient mieux que l’affirmation sur cette cible.';
const REGLES_INITIALES = 'Interdit : Montrer un enfant sans surveillance';

type Qui = 'uo' | 'um' | 'ub';
function sess(qui: Qui): SessionTest {
  return {
    user: { id: I[qui]!, email: `${qui}@lot3.test`, name: null }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace',
    role: qui === 'um' ? 'member' : 'owner', plan: 'plus', equipe: null,
  };
}
const MARQUE = { A: () => ({ id: I.bA!, name: 'Neva' }), A2: () => ({ id: I.bA2!, name: 'Autre' }), B: () => ({ id: I.bB!, name: 'Ailleurs' }) };
function comme(qui: Qui, marque: { id: string; name: string }) { h.session = sess(qui); h.marque = marque; }

const visible = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return { d, texte: (d.textContent ?? '').replace(/\s+/g, ' ') }; };
async function pageLot(id: string) { return visible(renderToStaticMarkup(avecSpatial(await LotSpatial({ params: Promise.resolve({ id }) })))); }
async function pageApprentissages() { return visible(renderToStaticMarkup(avecSpatial(await ApprentissagesSpatial()))); }
async function pageRegles(id: string) { return visible(renderToStaticMarkup(avecSpatial(await ReglesSpatiale({ params: Promise.resolve({ id }) })))); }

/** Un concept dans la marque (persona → désir → angle → concept). */
async function concept(ws: string, brand: string, titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: brand, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: titre }).returning();
  return c!.id;
}

/** Un lot lancé il y a `il` jours, ses variantes et leurs verdicts. */
async function lot(cle: string, o: { ws?: string; brand?: string; numero: number; il: number; statut?: 'testing' | 'analyzed'; variantes: Array<{ calcule: 'winner' | 'loser'; valide?: boolean; hook?: number }> }) {
  const ws = o.ws ?? I.wsA!, brand = o.brand ?? I.bA!;
  const lance = new Date(Date.now() - o.il * JOUR);
  const [offre] = await db.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Offre de lancement' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://neva.test/p', label: 'Page produit' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId: brand, number: o.numero, status: o.statut ?? 'analyzed', launchedAt: lance, goal: `Accroche ${o.numero}` }).returning();
  lots[cle] = b!.id;
  ads[cle] = [];
  for (const [i, v] of o.variantes.entries()) {
    const c = await concept(ws, brand, `Concept ${cle} ${i + 1}`);
    const [a] = await db.insert(schema.ads).values({
      workspaceId: ws, conceptId: c, batchId: b!.id, variantCode: `v${i + 1}`, status: v.valide ? 'done' : 'live', adType: 'ideation', format: 'static',
      hypothesis: 'Si on pose une question en accroche, alors le CPA baisse parce que la cible se reconnaît.', testedVariable: 'hook', variableValue: `Question ${i + 1}`,
      offerId: offre!.id, landingPageId: page!.id,
      generatedName: `NEVA_B${o.numero}_C${i + 1}_v${i + 1}_hook`, externalIds: { ad_id: `meta-${cle}-${i}` }, launchedAt: lance,
    }).returning();
    ads[cle].push(a!.id);
    await db.insert(schema.verdicts).values({
      adId: a!.id, workspaceId: ws, computed: v.calcule, validated: v.valide ? v.calcule : null, status: v.valide ? 'validated' : 'computed', comparable: true,
      metricsAgg: { spend: 120, impressions: 20000, purchases: v.calcule === 'winner' ? 6 : 1, cpa: v.calcule === 'winner' ? 20 : 120, hookRate: v.hook ?? 0.2, reason: 'Moteur', daysElapsed: 7, syncedAt: lance.toISOString() },
    });
  }
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus' }, { id: I.wsB!, name: 'Espace B', plan: 'plus' }]);
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@lot3.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva', creativeRules: REGLES_INITIALES },
    { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre', creativeRules: 'Obligatoire : Dès 3 ans' },
    { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  // La référence de la marque · trois autres lots suivis, 1 gagnante sur 10 variantes tranchées.
  await lot('l1', { numero: 1, il: 60, variantes: [{ calcule: 'winner', valide: true }, { calcule: 'loser', valide: true }, { calcule: 'loser', valide: true }, { calcule: 'loser', valide: true }] });
  await lot('l2', { numero: 2, il: 45, variantes: [{ calcule: 'loser', valide: true }, { calcule: 'loser', valide: true }, { calcule: 'loser', valide: true }, { calcule: 'loser', valide: true }] });
  await lot('l3', { numero: 3, il: 30, statut: 'testing', variantes: [{ calcule: 'loser' }, { calcule: 'loser' }] });
  // Le lot à conclure · 4 gagnantes sur 4 au protocole, la première accroche nettement au-dessus du reste.
  await lot('l4', { numero: 4, il: 20, statut: 'testing', variantes: [{ calcule: 'winner', hook: 0.3 }, { calcule: 'winner' }, { calcule: 'winner' }, { calcule: 'winner' }] });
  await db.insert(schema.learnings).values({ workspaceId: I.wsA!, brandId: I.bA!, adId: ads.l1![0]!, scope: 'ad', statement: 'Le lot #1 a gagné sur la preuve sociale.', status: 'validated', evidence: { source: 'arbitrage' } });
  // v2 du lot 4 est l'itération de la gagnante du lot 1 · la filiation fait partie de la structure.
  await db.insert(schema.iterationEdges).values({ workspaceId: I.wsA!, childAdId: ads.l4![1]!, parentAdId: ads.l1![0]!, mode: 'better', changedVariable: 'hook', rationale: 'Question plutôt qu’affirmation' });
  // Une autre marque du même espace, et un autre espace.
  await lot('a2', { brand: I.bA2!, numero: 1, il: 20, statut: 'testing', variantes: [{ calcule: 'winner', valide: true }] });
  await db.insert(schema.learnings).values({ workspaceId: I.wsA!, brandId: I.bA2!, adId: ads.a2![0]!, scope: 'ad', statement: 'Le court tient sur la marque Autre.', status: 'validated', evidence: { source: 'arbitrage' } });
  await lot('b1', { ws: I.wsB!, brand: I.bB!, numero: 1, il: 20, variantes: [{ calcule: 'winner', valide: true }] });
}, 120_000);

afterEach(() => { h.session = null; h.marque = null; });

async function lotsDe(brand: string) { return db.select().from(schema.batches).where(eq(schema.batches.brandId, brand)); }
async function reglesDe(brand: string) { return (await db.select({ r: schema.brands.creativeRules }).from(schema.brands).where(eq(schema.brands.id, brand)))[0]!.r; }

describe('la conclusion du lot entier s’affiche au-dessus des verdicts du moteur', () => {
  it('lot #4 · 4 gagnantes sur 4 contre 1 sur 10 dans les autres lots · « Hypothèse confirmée », avant le verdict', async () => {
    comme('uo', MARQUE.A());
    const { d, texte } = await pageLot(lots.l4!);
    const bloc = d.querySelector('[aria-label="Conclusion du lot"]');
    expect(bloc?.getAttribute('data-conclusion')).toBe('confirmee');
    expect(bloc?.textContent).toContain('Hypothèse confirmée');
    expect(bloc?.textContent).toContain('4 gagnantes sur 4 variantes tranchées');
    expect(bloc?.textContent).toContain('la marque, 1 sur 10 dans ses autres lots');
    expect(texte.indexOf('Conclusion du lot, contre la référence de la marque'), 'la conclusion du lot doit précéder le verdict du moteur')
      .toBeLessThan(texte.indexOf('Verdict du moteur, sur la règle de la marque'));
    expect(texte.indexOf('Verdict du moteur, sur la règle de la marque')).toBeGreaterThan(0);
    const verdict = d.querySelector('section.tile.verdict')!;
    expect(verdict.contains(bloc), 'la conclusion du lot est rangée DANS le verdict du moteur').toBe(false);
    expect(bloc!.nextElementSibling, 'la conclusion du lot doit être juste au-dessus du verdict du moteur').toBe(verdict);
  });
  it('lot #3 · 2 variantes tranchées · non concluante, et elle dit pourquoi (effectif minimum)', async () => {
    comme('uo', MARQUE.A());
    const { d } = await pageLot(lots.l3!);
    const bloc = d.querySelector('[aria-label="Conclusion du lot"]')!;
    expect(bloc.getAttribute('data-conclusion')).toBe('non_concluante');
    expect(bloc.textContent).toContain('2 variantes tranchées au protocole · il en faut 4 pour qu’un lot ait le droit de conclure.');
  });
});

describe('dupliquer un lot · la structure, jamais les mesures', () => {
  it('un membre voit le geste fermé avec sa raison · l’action le refuse · rien n’est créé', async () => {
    comme('um', MARQUE.A());
    const { d } = await pageLot(lots.l4!);
    const sec = d.querySelector('[aria-label="Dupliquer le lot"]')!;
    expect(sec.querySelector('button')?.hasAttribute('disabled')).toBe(true);
    expect(sec.textContent).toContain('Dupliquer un lot est réservé aux admins de l’espace, comme en créer un.');
    const avant = (await lotsDe(I.bA!)).length;
    expect(await duplicateBatchAction(lots.l4!)).toEqual({ error: 'Action réservée aux administrateurs de l’espace.' });
    expect((await lotsDe(I.bA!)).length).toBe(avant);
  });
  it('depuis une autre marque active, ou un autre espace · le lot « n’existe pas » · rien n’est créé', async () => {
    const avant = (await db.select().from(schema.batches)).length;
    comme('uo', MARQUE.A2());
    expect((await duplicateBatchAction(lots.l4!)).error).toMatch(/introuvable|n’existe|existe pas|accessible/i);
    comme('ub', MARQUE.B());
    expect((await duplicateBatchAction(lots.l4!)).error).toMatch(/introuvable|n’existe|existe pas|accessible/i);
    expect((await db.select().from(schema.batches)).length).toBe(avant);
  });
  it('le propriétaire duplique le lot #4 · lot #5 en préparation, 4 variantes en brouillon, aucune mesure · la source intacte', async () => {
    comme('uo', MARQUE.A());
    const source = async () => JSON.stringify([
      await db.select().from(schema.ads).where(eq(schema.ads.batchId, lots.l4!)),
      await db.select().from(schema.verdicts).where(inArray(schema.verdicts.adId, ads.l4!)),
      await db.select().from(schema.batches).where(eq(schema.batches.id, lots.l4!)),
    ]);
    const avant = await source();
    const r = await duplicateBatchAction(lots.l4!);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ number: 5, variantes: 4 });
    expect(await source(), 'la duplication a modifié le lot source').toBe(avant);

    const [nouveau] = await db.select().from(schema.batches).where(eq(schema.batches.id, r.id!));
    expect(nouveau).toMatchObject({ brandId: I.bA!, workspaceId: I.wsA!, number: 5, status: 'planned', launchedAt: null, protocolCheck: null, goal: 'Reprise du lot #4 · Accroche 4', authorId: I.uo! });
    const copies = await db.select().from(schema.ads).where(eq(schema.ads.batchId, r.id!));
    expect(copies).toHaveLength(4);
    for (const c of copies) {
      expect(c).toMatchObject({ status: 'draft', generatedName: null, externalIds: null, launchedAt: null, sourceRef: null, testedVariable: 'hook' });
      expect(c.hypothesis).toContain('Si on pose une question en accroche');
    }
    expect(copies.map((c) => c.variantCode).sort()).toEqual(['v1', 'v2', 'v3', 'v4']);
    const ids = copies.map((c) => c.id);
    expect(await db.select().from(schema.verdicts).where(inArray(schema.verdicts.adId, ids)), 'un verdict a suivi la copie').toEqual([]);
    expect(await db.select().from(schema.learnings).where(inArray(schema.learnings.adId, ids))).toEqual([]);
    // La filiation de l'itération suit (structure) · même parent, même variable.
    const v2 = copies.find((c) => c.variantCode === 'v2')!;
    expect(await db.select({ p: schema.iterationEdges.parentAdId, v: schema.iterationEdges.changedVariable }).from(schema.iterationEdges).where(eq(schema.iterationEdges.childAdId, v2.id)))
      .toEqual([{ p: ads.l1![0]!, v: 'hook' }]);

    // La fiche du lot neuf · en préparation, sans verdict, sans conclusion.
    const { d, texte } = await pageLot(r.id!);
    expect(d.querySelector('[aria-label="Conclusion du lot"]')?.getAttribute('data-conclusion')).toBe('en_attente');
    expect(texte).toContain('Pas encore de verdict');
    expect(texte).toContain('Composer et préparer');
    expect(texte).not.toContain('NEVA_B4');
  });
});

describe('un apprentissage validé passe dans les règles de la marque · geste explicite', () => {
  let appris = '';
  it('conclure une variante du lot #4 écrit l’apprentissage (vraie action) · la carte offre « Ajouter aux règles »', async () => {
    comme('uo', MARQUE.A());
    expect(await validateVerdictAction({ adId: ads.l4![0]!, value: 'winner', learning: { statement: ENONCE, scope: 'concept', confidence: 4 } })).toEqual({ ok: true });
    const [l] = await db.select().from(schema.learnings).where(and(eq(schema.learnings.adId, ads.l4![0]!), eq(schema.learnings.statement, ENONCE)));
    appris = l!.id;
    const { d } = await pageApprentissages();
    const carte = [...d.querySelectorAll('article.lcard')].find((a) => a.textContent?.includes(ENONCE))!;
    expect(carte, 'la carte de l’apprentissage n’est pas rendue').toBeTruthy();
    const bouton = [...carte.querySelectorAll('button')].find((b) => b.textContent?.includes('Ajouter aux règles de la marque'))!;
    expect(bouton.hasAttribute('disabled')).toBe(false);
    // Le tiroir · d'où ça vient, limites (dont la conclusion du lot), vaut pour.
    expect(carte.querySelector('details summary')?.textContent).toBe('D’où ça vient · Limites · Vaut pour');
    expect(carte.querySelector('details')?.textContent).toContain('Lot #4 · variante v1 · verdict « Gagnante »');
    expect(carte.querySelector('details')?.textContent).toContain('Conclusion du lot #4 · Hypothèse confirmée');
    expect(carte.querySelector('details')?.textContent).toContain('Le concept entier');
  });
  it('un membre voit le geste fermé avec sa raison · l’action le refuse · les règles ne bougent pas', async () => {
    comme('um', MARQUE.A());
    const { d } = await pageApprentissages();
    const carte = [...d.querySelectorAll('article.lcard')].find((a) => a.textContent?.includes(ENONCE))!;
    expect(carte.textContent).toContain('Passer un apprentissage dans les règles est réservé aux admins de l’espace, comme écrire une règle.');
    expect(await apprentissageVersReglesAction({ learningId: appris })).toEqual({ error: 'Action réservée aux administrateurs de l’espace.' });
    expect(await reglesDe(I.bA!)).toBe(REGLES_INITIALES);
  });
  it('depuis une autre marque active, ou un autre espace · l’apprentissage « n’existe pas » · aucune règle écrite nulle part', async () => {
    comme('uo', MARQUE.A2());
    expect((await apprentissageVersReglesAction({ learningId: appris })).error).toMatch(/introuvable|n’existe|existe pas|accessible/i);
    comme('ub', MARQUE.B());
    expect((await apprentissageVersReglesAction({ learningId: appris })).error).toMatch(/introuvable|n’existe|existe pas|accessible/i);
    expect(await reglesDe(I.bA!)).toBe(REGLES_INITIALES);
    expect(await reglesDe(I.bA2!)).toBe('Obligatoire : Dès 3 ans');
    expect(await reglesDe(I.bB!)).toBeNull();
  });
  it('le propriétaire l’ajoute · une Préférence à la fin des règles, la trace sur l’apprentissage, visible dans la page Règles', async () => {
    comme('uo', MARQUE.A());
    expect(await apprentissageVersReglesAction({ learningId: appris })).toEqual({ ok: true });
    expect(await reglesDe(I.bA!)).toBe(`${REGLES_INITIALES}\nPréférence : ${ENONCE}`);
    const [l] = await db.select().from(schema.learnings).where(eq(schema.learnings.id, appris));
    expect((l!.evidence as { regle?: { par?: string; type?: string } }).regle).toMatchObject({ par: I.uo!, type: 'pref' });
    expect((l!.evidence as { source?: string }).source, 'la preuve d’origine a été écrasée').toBe('arbitrage');

    const { d } = await pageRegles(I.bA!);
    const pill = [...d.querySelectorAll('.pill')].find((p) => p.textContent?.includes(ENONCE));
    expect(pill, 'la règle venue de l’apprentissage n’apparaît pas dans la page Règles').toBeTruthy();
    expect(pill!.querySelector('[data-origine="apprentissage"]')?.textContent).toBe('· d’un apprentissage');

    // Deux fois · refusé, rien ne double.
    expect(await apprentissageVersReglesAction({ learningId: appris })).toEqual({ error: 'Déjà dans les règles de la marque.' });
    expect((await reglesDe(I.bA!))!.split('\n')).toHaveLength(2);
    const { d: d2 } = await pageApprentissages();
    const carte = [...d2.querySelectorAll('article.lcard')].find((a) => a.textContent?.includes(ENONCE))!;
    expect(carte.textContent).toContain('dans les règles de la marque');
    expect([...carte.querySelectorAll('button')].find((b) => b.textContent?.includes('Ajouter aux règles'))!.hasAttribute('disabled')).toBe(true);
  });
});

describe('rejeter puis rétablir un apprentissage · « À retester » se calcule', () => {
  it('un membre rejette · drapeau posé, rien d’effacé, la carte passe « À retester » · il le rétablit', async () => {
    comme('um', MARQUE.A());
    const [l] = await db.select().from(schema.learnings).where(eq(schema.learnings.statement, ENONCE));
    expect(await rejeterApprentissageAction({ learningId: l!.id, refute: true })).toEqual({ ok: true });
    const [apres] = await db.select().from(schema.learnings).where(eq(schema.learnings.id, l!.id));
    expect(apres).toMatchObject({ refuted: true, statement: ENONCE, status: 'validated' });
    const { d } = await pageApprentissages();
    const carte = [...d.querySelectorAll('article.lcard')].find((a) => a.textContent?.includes(ENONCE))!;
    expect(carte.querySelector('.head')?.textContent).toContain('À retester');
    expect([...carte.querySelectorAll('button')].map((b) => b.textContent)).toContain('Rétablir');
    expect(d.querySelector('[aria-label="Filtrer par état"]')?.textContent).toContain('À retester · 1');
    expect(await rejeterApprentissageAction({ learningId: l!.id, refute: false })).toEqual({ ok: true });
    comme('uo', MARQUE.A2());
    expect((await rejeterApprentissageAction({ learningId: l!.id, refute: true })).error).toMatch(/introuvable|n’existe|existe pas|accessible/i);
    expect((await db.select().from(schema.learnings).where(eq(schema.learnings.id, l!.id)))[0]!.refuted).toBe(false);
  });
});

describe('Accueil · « Quoi itérer » dit l’écart de la gagnante au reste de son lot (G09)', () => {
  it('v1 du lot #4 · accroche 30 % contre 20 % sur 60 000 impressions · « Accroche +10 pts vs le reste du lot #4 »', async () => {
    comme('uo', MARQUE.A());
    const html = renderToStaticMarkup(await AccueilSpatial({ searchParams: Promise.resolve({}) }));
    const { d } = visible(html);
    const cartes = [...d.querySelectorAll('#suggestions article')];
    const v1 = cartes.find((c) => c.textContent?.includes('Concept l4 1'));
    expect(v1, 'la gagnante arbitrée du lot #4 n’est pas dans « Quoi itérer »').toBeTruthy();
    expect([...v1!.querySelectorAll('.pill')].map((p) => p.textContent)).toContain('Accroche +10 pts vs le reste du lot #4');
    // Une seule pastille d'écart · la règle ne s'applique qu'à la carte qui la porte.
    expect(d.textContent?.match(/vs le reste du lot/g)).toHaveLength(1);
  });
});
