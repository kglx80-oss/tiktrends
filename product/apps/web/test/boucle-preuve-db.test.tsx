// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Boucler la preuve · de l'inspiration au résultat, et retour · base RÉELLE
 * (pglite, migrations du dépôt), VRAIES actions, VRAIES pages rendues et
 * montées · on lit le DOM et ce qui est écrit, jamais la présence d'un appel.
 *
 *  · une hypothèse née d'un tag de Veille récurrent, d'un apprentissage, à la
 *    main · avant la conclusion de son lot, sa carte n'a aucun résultat · après
 *    (« Valider le verdict », `validateVerdictAction`), elle dit « Confirmée »,
 *    « Infirmée » ou « Sans conclusion », le chiffre clé et le lien vers le lot,
 *    et rappelle sa provenance avec son lien (`/saved?tag=…`) ;
 *  · « D'où viennent les hypothèses qui gagnent » · muet sous le seuil (et il le
 *    dit), présent au-dessus avec ses deux intervalles ;
 *  · les gestes P06 · seulement quand un persona du lot se détache · « Itérer
 *    sur ce persona » ouvre Itérer, la gagnante présélectionnée, rien de créé
 *    avant « Créer l'itération » · « Créer une hypothèse » ouvre le formulaire
 *    pré-rempli, rien d'écrit avant « Ranger dans « À formuler » » ;
 *  · une autre marque, un lecteur client · refus, rien d'écrit, rien ne fuit.
 * 0 $ · aucun modèle, aucune dépense, aucun crédit.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/adsmap/hypotheses', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));
vi.mock('../lib/spend-guard', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/spend-guard')>()), spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { and } from 'drizzle-orm';
import type { InspoAd } from '@tiktrends/integrations';
import { NOTE_GESTES_SILENCE, NIVEAU_BILAN_PROVENANCE, lienIterationVariable, lienJarvisCarteHypothese, lireOrigineHypothese, wilsonInterval } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { avecSpatial } from './spatial/fournisseur';
import { saveAd } from '../app/actions/inspo';
import { creerHypotheseAction } from '../app/actions/adsmap-hypotheses';
import { validateVerdictAction } from '../app/actions/adsmap-verdict';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 240_000 });

const ids = h.ids;
const P = { lea: '', max: '', sam: '', zed: '' };
const S = { R: '', T: '', I: '', SC: '', L: '', A2: '', tag: [] as string[], app: '', libre: '', lea: [] as string[], maxGagnante: '', learning: '' };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
const JOUR = 86_400_000;

/* ───────────────────────────── semis ───────────────────────────── */

async function lot(brandId: string, number: number, goal: string, ws = ids.wsA) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: ws, brandId, number, goal, status: 'testing', launchedAt: new Date(Date.now() - 30 * JOUR) }).returning({ id: schema.batches.id });
  return b!.id;
}
const agg = (v: 'winner' | 'loser') => ({ spend: 120, impressions: 18000, purchases: v === 'winner' ? 12 : 3, cpa: v === 'winner' ? 10 : 40, roas: v === 'winner' ? 2.4 : 0.6, reason: v === 'winner' ? 'CPA sous la cible.' : 'CPA au-dessus de la cible.' });
async function verdict(adId: string, v: 'winner' | 'loser', statut: 'validated' | 'computed', ws = ids.wsA) {
  await db.insert(schema.verdicts).values({ adId, workspaceId: ws, computed: v, validated: statut === 'validated' ? v : null, status: statut, comparable: true, metricsAgg: agg(v) });
}
/** Une ad de la carte (persona → désir → angle → concept → ad), rangée dans un lot, avec son verdict. */
async function adCarte(personaId: string, batchId: string, code: string, v: 'winner' | 'loser', statut: 'validated' | 'computed', ws = ids.wsA) {
  const [d] = await db.insert(schema.desires).values({ workspaceId: ws, personaId, label: `Désir ${code}` }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ws, desireId: d!.id, label: `Angle ${code}`, mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ws, angleId: a!.id, title: `Concept ${code}` }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: ws, conceptId: c!.id, batchId, variantCode: code, status: 'done', testedVariable: 'hook', hypothesis: `Si on teste ${code}, alors le coût par achat baisse, parce que la preuve rassure.` }).returning({ id: schema.ads.id });
  await verdict(ad!.id, v, statut, ws);
  return ad!.id;
}
/** Une hypothèse créée par la VRAIE action, puis rangée dans un lot (le geste « Ranger dans un lot » existant écrit `batch_id`). */
async function hypothese(source: Parameters<typeof creerHypotheseAction>[0]['source'], si: string) {
  const r = await creerHypotheseAction({ source, saisie: { si, alors: 'le coût par achat baisse', parceQue: 'la source le montre', variable: 'hook' } });
  expect(r.ok, r.error).toBe(true);
  return r.adId!;
}
async function ranger(adId: string, batchId: string, v: 'winner' | 'loser', statut: 'validated' | 'computed') {
  await db.update(schema.ads).set({ batchId, status: 'done' }).where(eq(schema.ads.id, adId));
  await verdict(adId, v, statut);
}
const pub = (id: string, annonceur: string): InspoAd => ({ id, platform: 'meta', status: 'active', daysRunning: 12, mediaType: 'image', advertiserName: annonceur, body: `Texte de ${annonceur}` });

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  h.session = proprietaire(); h.marque = ids.brandA1;
  const [lea, max, sam, zed] = await db.insert(schema.personas).values([
    { brandId: ids.brandA1, name: 'Léa, 34 ans', status: 'validated' }, { brandId: ids.brandA1, name: 'Max', status: 'validated' },
    { brandId: ids.brandA1, name: 'Sam', status: 'validated' }, { brandId: ids.brandA2, name: 'Zed secret', status: 'validated' },
  ]).returning({ id: schema.personas.id });
  Object.assign(P, { lea: lea!.id, max: max!.id, sam: sam!.id, zed: zed!.id });

  // Un tag de Veille RÉCURRENT de A1 · « Hook UGC » sur 3 sauvegardes, 2 annonceurs.
  for (const [id, a] of [['p1', 'Ploufy'], ['p2', 'Nagette'], ['p3', 'Ploufy']] as const) {
    const r = await saveAd({ platform: 'meta', externalId: id, snapshot: pub(id, a), tags: ['Hook UGC'] });
    expect(r.ok, r.error).toBe(true);
  }
  // R · lot #1, conclu · la référence · Max, 1 gagnante sur 10.
  S.R = await lot(ids.brandA1, 1, 'Référence');
  S.maxGagnante = await adCarte(P.max, S.R, 'R0', 'winner', 'validated');
  for (let i = 1; i < 10; i++) await adCarte(P.max, S.R, `R${i}`, 'loser', 'validated');
  // SC · lot #4, conclu sous l'effectif · une hypothèse à la main (et Sam, une perdante).
  S.SC = await lot(ids.brandA1, 4, 'Deux variantes seulement');
  S.libre = await hypothese({ type: 'libre' }, 'on tutoie dans l’accroche');
  await ranger(S.libre, S.SC, 'winner', 'validated');
  await adCarte(P.sam, S.SC, 'SC2', 'loser', 'validated');
  // I · lot #3, à conclure · une hypothèse tirée d'un apprentissage, et 4 perdantes.
  const [l] = await db.insert(schema.learnings).values({ workspaceId: ids.wsA, brandId: ids.brandA1, scope: 'ad', statement: 'Les accroches en question retiennent mieux', status: 'validated' }).returning();
  S.learning = l!.id;
  S.I = await lot(ids.brandA1, 3, 'Question ou affirmation ?');
  S.app = await hypothese({ type: 'apprentissage', learningId: S.learning }, 'l’accroche s’ouvre sur une question');
  await ranger(S.app, S.I, 'loser', 'computed');
  for (let i = 1; i < 5; i++) await adCarte(P.sam, S.I, `I${i}`, 'loser', 'computed');
  // Six hypothèses du tag, en brouillon · elles entrent en test plus loin.
  for (let i = 0; i < 6; i++) S.tag.push(await hypothese({ type: 'tag', cle: 'hook ugc' }, `nos pubs reprennent « Hook UGC » · version ${i + 1}`));
  // A2 · un lot conclu et un secret, jamais visible depuis A1.
  S.A2 = await lot(ids.brandA2, 9, 'SECRET_LOT_A2');
  for (let i = 0; i < 4; i++) await adCarte(P.zed, S.A2, `Z${i}`, 'winner', 'validated');
});

/* ───────────────────────────── outils ───────────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const pageHypotheses = async () => dom(renderToStaticMarkup(avecSpatial(await HypothesesSpatial({ searchParams: Promise.resolve({}) }))));
const pageLot = async (id: string) => dom(renderToStaticMarkup(avecSpatial(await LotSpatial({ params: Promise.resolve({ id }) }))));
/** La carte d'une ad · celle dont « Demander à Jarvis » joint CETTE ad (une suite du plan joint son ad de départ avec une question). */
const carte = (d: ParentNode, adId: string) => {
  const href = lienJarvisCarteHypothese({ cle: adId, texte: '' });
  return [...d.querySelectorAll<HTMLElement>('.hcard')].find((x) => x.querySelector(`a[data-demander-jarvis="hypothese"]`)?.getAttribute('href') === href) ?? null;
};
async function traces() {
  const n = (rows: unknown[]) => rows.length;
  return {
    ads: n(await db.select({ id: schema.ads.id }).from(schema.ads)),
    aretes: n(await db.select({ id: schema.iterationEdges.id }).from(schema.iterationEdges)),
    arbitres: n(await db.select({ id: schema.verdicts.adId }).from(schema.verdicts).where(eq(schema.verdicts.status, 'validated'))),
    apprentissages: n(await db.select({ id: schema.learnings.id }).from(schema.learnings)),
    depense: n(await db.select({ id: schema.aiSpend.id }).from(schema.aiSpend)),
    credits: n(await db.select({ id: schema.creditLedger.id }).from(schema.creditLedger)),
  };
}
async function conclure(adIds: readonly string[]) {
  for (const adId of adIds) {
    const [v] = await db.select({ c: schema.verdicts.computed }).from(schema.verdicts).where(eq(schema.verdicts.adId, adId));
    const r = await validateVerdictAction({ adId, value: v!.c!, learning: { statement: 'Ce que la variante a montré, en une phrase réutilisable.', scope: 'ad', confidence: 3 } });
    expect(r.ok, r.error).toBe(true);
  }
}

let root: Root | null = null;
beforeEach(() => { h.session = proprietaire(); h.marque = ids.brandA1; });
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; });
async function monter(el: ReactElement) {
  act(() => { root?.unmount(); });
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
}
async function cliquer(el: Element | null | undefined, nom: string) {
  expect(el, nom).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function saisir(el: HTMLInputElement | HTMLTextAreaElement | null, valeur: string) {
  expect(el).toBeTruthy();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
  await act(async () => { el!.dispatchEvent(new Event('input', { bubbles: true })); });
}
const params = (href: string) => Object.fromEntries(new URL(`http://x${href}`).searchParams);
const bilan = (d: ParentNode) => d.querySelector<HTMLElement>('[aria-label="D’où viennent les hypothèses qui gagnent"]');

/* ───────────────────────────── le bilan, muet puis présent ───────────────────────────── */

describe('« D’où viennent les hypothèses qui gagnent » · muet sous le seuil, présent au-dessus avec l’intervalle', () => {
  it('sous le seuil · aucune provenance n’a 4 variantes tranchées · le bilan se tait et le dit', async () => {
    const d = await pageHypotheses();
    const b = bilan(d)!;
    expect(b, 'le bilan n’est pas rendu').toBeTruthy();
    expect(b.getAttribute('data-bilan-provenances')).toBe('silence');
    expect(b.querySelector('[data-phrase-provenances]')!.textContent).toBe('Aucune provenance n’a encore 4 variantes tranchées · le bilan se tait, faute d’effectif.');
    expect(b.querySelector('[data-groupe-provenance="apprentissage"]')!.getAttribute('data-lecture')).toBe('effectif');
    expect(b.querySelector('[data-groupe-provenance="libre"]')!.getAttribute('data-lecture')).toBe('effectif');
    expect(b.querySelector('[data-groupe-provenance="tag"]'), 'le tag n’a encore rien de tranché').toBeNull();
    expect(b.querySelector('[data-taux-general]')!.textContent).toContain('2 gagnantes sur 17 variantes tranchées au protocole (12 %)');
    expect(b.textContent).toContain('Règle · une hypothèse gagne quand sa variante est tranchée gagnante au protocole');
  });

  it('les six hypothèses du tag entrent en test et gagnent · le tag se détache, ses deux intervalles écrits', async () => {
    S.T = await lot(ids.brandA1, 2, 'Hook UGC');
    for (const id of S.tag) await ranger(id, S.T, 'winner', 'computed');
    const b = bilan(await pageHypotheses())!;
    expect(b.getAttribute('data-bilan-provenances')).toBe('parle');
    const g = b.querySelector('[data-groupe-provenance="tag"]')!;
    expect(g.getAttribute('data-lecture')).toBe('au_dessus');
    const pc = (x: number) => `${Math.round(x * 100)} %`;
    const ip = wilsonInterval(6, 6, NIVEAU_BILAN_PROVENANCE), ir = wilsonInterval(2, 17, NIVEAU_BILAN_PROVENANCE);
    expect(g.textContent).toContain(`6 gagnantes sur 6 variantes tranchées (${pc(ip.lo)} à ${pc(ip.hi)}) · nettement au-dessus du reste de la marque, 2 sur 17 (${pc(ir.lo)} à ${pc(ir.hi)}).`);
    expect(b.querySelector('[data-phrase-provenances]')!.textContent).toBe('Tag de Veille récurrent au-dessus du reste de la marque, intervalles disjoints au niveau 0,975.');
  });
});

/* ───────────────────────────── le résultat, avant puis après la conclusion ───────────────────────────── */

describe('le résultat sur la carte · rien avant la conclusion du lot, puis confirmée, infirmée, sans conclusion', () => {
  it('avant · le lot du tag est à conclure · la carte est « En test », aucun résultat, la provenance et son lien', async () => {
    const d = await pageHypotheses();
    const c = carte(d, S.tag[0]!)!;
    expect(c, 'la carte de l’hypothèse du tag').toBeTruthy();
    expect(c.querySelector('[data-resultat-hypothese]'), 'un résultat avant la conclusion').toBeNull();
    expect(c.textContent).toContain('Lot #2 · à conclure');
    const p = c.querySelector('[data-provenance-hypothese]')!;
    expect(p.textContent).toContain('Provenance · Veille · tag « Hook UGC » · 3 sauvegardes');
    expect(p.querySelector('a'), 'la provenance n’a pas de lien').toBeTruthy();
    expect(p.querySelector('a')!.getAttribute('href')).toBe('/saved?tag=hook%20ugc');
    const a = carte(d, S.app)!;
    expect(a.querySelector('[data-resultat-hypothese]')).toBeNull();
  });

  it('après « Valider le verdict » de chaque variante · « Confirmée », le chiffre clé, le lien vers le lot', async () => {
    const avant = await traces();
    await conclure(S.tag);
    expect((await traces()).arbitres - avant.arbitres).toBe(6);
    const d = await pageHypotheses();
    const c = carte(d, S.tag[0]!)!;
    const r = c.querySelector('[data-resultat-hypothese]')!;
    expect(r, 'la carte ne dit pas le résultat du lot').toBeTruthy();
    expect(r.getAttribute('data-resultat-hypothese')).toBe('confirmee');
    expect(r.textContent).toMatch(/^Lot #2 · Confirmée · 6 gagnantes sur 6 variantes tranchées \(\d+ % à 100 %\) · la marque, 2 sur 17 dans ses autres lots \(\d+ % à \d+ %\)/);
    expect(r.querySelector('a')!.getAttribute('href')).toBe(`/adsmap/lots/${S.T}`);
    expect(c.querySelector('.pill.g')!.textContent).toBe('Confirmée');
    expect(c.querySelector('[data-provenance-hypothese] a')!.getAttribute('href')).toBe('/saved?tag=hook%20ugc');
    // La carte est rangée dans « Conclue » · le résultat n'est écrit nulle part, il est relu.
    const [ad] = await db.select({ h: schema.ads.hypothesis, s: schema.ads.sourceRef }).from(schema.ads).where(eq(schema.ads.id, S.tag[0]!));
    expect(JSON.stringify(ad)).not.toMatch(/confirm/i);
  });

  it('le lot de l’apprentissage conclu · « Infirmée », la provenance « Apprentissage » et son lien', async () => {
    const enLot = (await db.select({ id: schema.ads.id }).from(schema.ads).where(eq(schema.ads.batchId, S.I))).map((x) => x.id);
    await conclure(enLot);
    const c = carte(await pageHypotheses(), S.app)!;
    const r = c.querySelector('[data-resultat-hypothese]')!;
    expect(r, 'la carte ne dit pas le résultat du lot').toBeTruthy();
    expect(r.getAttribute('data-resultat-hypothese')).toBe('infirmee');
    expect(r.textContent).toMatch(/^Lot #3 · Infirmée · 0 gagnante sur 5 variantes tranchées/);
    expect(c.querySelector('[data-provenance-hypothese]')!.textContent).toContain('Apprentissage · Les accroches en question retiennent mieux');
    expect(c.querySelector('[data-provenance-hypothese] a')!.getAttribute('href')).toBe('/adsmap/apprentissages');
  });

  it('le lot de deux variantes, conclu · « Sans conclusion », la raison en chiffre · « Idée d’équipe »', async () => {
    const c = carte(await pageHypotheses(), S.libre)!;
    const r = c.querySelector('[data-resultat-hypothese]')!;
    expect(r, 'la carte ne dit pas le résultat du lot').toBeTruthy();
    expect(r.getAttribute('data-resultat-hypothese')).toBe('sans_conclusion');
    expect(r.textContent).toContain('Lot #4 · Sans conclusion · 2 variantes tranchées au protocole · il en faut 4 pour qu’un lot ait le droit de conclure');
    expect(c.querySelector('[data-provenance-hypothese]')!.textContent).toBe('Provenance · Idée d’équipe');
    expect(c.querySelector('[data-provenance-hypothese] a'), 'une idée d’équipe n’a pas de page').toBeNull();
  });
});

/* ───────────────────────────── les gestes P06 ───────────────────────────── */

describe('P06 · les gestes depuis la lecture par persona · seulement quand un persona se détache', () => {
  it('rien ne se détache dans le lot de Sam · aucun geste, et c’est dit', async () => {
    const d = await pageLot(S.SC);
    const bloc = d.querySelector('[aria-label="Pour qui · les personas du lot"]')!;
    expect(bloc.querySelector(`[data-groupe-persona="${P.sam}"]`)!.getAttribute('data-lecture')).not.toMatch(/au_dessus|en_dessous/);
    expect(bloc.querySelector('[data-gestes-persona]'), 'un geste sans persona détaché').toBeNull();
    expect(bloc.querySelector('[data-gestes-persona-silence]')?.textContent, 'le silence des gestes n’est pas dit').toBe(NOTE_GESTES_SILENCE);
  });

  it('Léa gagne 6 fois sur 6 · ses gestes apparaissent · Itérer ouvre l’écran existant, la gagnante présélectionnée · rien de créé avant le clic', async () => {
    S.L = await lot(ids.brandA1, 5, 'Pour Léa');
    for (let i = 0; i < 6; i++) S.lea.push(await adCarte(P.lea, S.L, `L${i}`, 'winner', 'validated'));
    const avant = await traces();
    const d = await pageLot(S.L);
    const g = d.querySelector(`[data-groupe-persona="${P.lea}"]`)!;
    expect(g.getAttribute('data-lecture')).toBe('au_dessus');
    const it = g.querySelector<HTMLAnchorElement>('[data-geste-persona-lot="iterer"]')!;
    expect(it.tagName, 'Itérer ouvert est un lien').toBe('A');
    const href = it.getAttribute('href')!;
    expect(lienIterationVariable({ adId: params(href).iter })).toBe(href);
    expect(S.lea, 'Itérer part d’une gagnante de Léa dans ce lot').toContain(params(href).iter);
    expect(it.style.minHeight).toBe('44px');
    expect(d.querySelector(`[data-gestes-persona="${P.max}"]`), 'Max n’est pas dans ce lot').toBeNull();
    expect(await traces(), 'ouvrir la fiche a écrit').toEqual(avant);

    await monter(await IterationSpatiale({ searchParams: Promise.resolve(params(href)) }));
    expect([...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad')), 'la gagnante de Léa présélectionnée').toEqual([params(href).iter]);
    expect(await traces(), 'ouvrir Itérer a écrit').toEqual(avant);
    await cliquer(document.querySelector('#orn [data-geste="continuer"]'), 'continuer');
    await saisir(document.querySelector('[data-champ="valeur"]'), 'Une accroche nouvelle pour Léa');
    await cliquer(document.querySelector('#orn [data-geste="creer-iteration"]'), 'créer l’itération');
    const [e] = await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, params(href).iter!));
    expect(e, 'au clic, l’itération est créée depuis la gagnante de Léa').toBeTruthy();
    const apres = await traces();
    expect([apres.ads - avant.ads, apres.aretes - avant.aretes, apres.depense, apres.credits]).toEqual([1, 1, avant.depense, avant.credits]);
  });

  it('« Créer une hypothèse » ouvre le formulaire existant pré-rempli (Léa citée, ses verdicts) · rien d’écrit avant « Ranger »', async () => {
    await monter((await LotSpatial({ params: Promise.resolve({ id: S.L }) })) as ReactElement);
    const avant = await traces();
    await cliquer(document.querySelector(`[data-gestes-persona="${P.lea}"] [data-geste-persona-lot="hypothese"] button`), 'créer une hypothèse');
    const f = document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
    expect(f, 'le formulaire n’est pas ouvert').toBeTruthy();
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="si"]')!.value).toBe('on décline nos prochaines créas pour Léa');
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="alors"]')!.value, 'un résultat attendu inventé').toBe('');
    expect(f.querySelector<HTMLTextAreaElement>('textarea[name="parceQue"]')!.value).toMatch(/^ses variantes gagnent nettement plus souvent que le reste de la marque \(6 sur 6 contre \d+ sur \d+\)$/);
    expect(f.textContent).toContain('Source · la lecture par persona du lot #5.');
    expect(await traces(), 'ouvrir le formulaire a écrit').toEqual(avant);

    await saisir(f.querySelector('textarea[name="alors"]'), 'le coût par achat baisse sur ce segment');
    await cliquer([...f.querySelectorAll('button')].find((b) => b.textContent === 'Ranger dans « À formuler »'), 'ranger');
    for (let i = 0; i < 50 && (await traces()).ads === avant.ads; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect((await traces()).ads - avant.ads, 'l’hypothèse n’est pas créée').toBe(1);
    const brouillons = await db.select().from(schema.ads).where(and(eq(schema.ads.workspaceId, ids.wsA), eq(schema.ads.status, 'draft')));
    const neuve = brouillons.find((a) => lireOrigineHypothese(a.sourceRef)?.type === 'persona')!;
    expect(neuve, 'l’hypothèse ne porte pas le persona').toBeTruthy();
    expect(neuve.hypothesis).toMatch(/^Si on décline nos prochaines créas pour Léa, alors le coût par achat baisse sur ce segment, parce que ses variantes gagnent nettement plus souvent/);
    expect(lireOrigineHypothese(neuve.sourceRef)).toMatchObject({ type: 'persona', personaId: P.lea, persona: 'Léa, 34 ans' });
    const c = carte(await pageHypotheses(), neuve.id);
    expect(c?.textContent, 'la nouvelle hypothèse n’est pas dans « À formuler » avec sa provenance').toContain('Persona · Léa');
  });

  it('Max se détache vers le bas dans la référence · ses gestes · Itérer part de sa seule gagnante, au plan', async () => {
    const g = (await pageLot(S.R)).querySelector(`[data-groupe-persona="${P.max}"]`)!;
    expect(g.getAttribute('data-lecture')).toBe('en_dessous');
    expect(g.querySelector('[data-geste-persona-lot="iterer"]')!.getAttribute('href')).toBe(lienIterationVariable({ adId: S.maxGagnante }));
  });
});

/* ───────────────────────────── autre marque, lecteur client ───────────────────────────── */

describe('autre marque, lecteur client · refus sans fuite, rien d’écrit', () => {
  it('marque A2 active · les hypothèses et le bilan de A1 ne fuient pas · ses lots sont introuvables', async () => {
    h.marque = ids.brandA2;
    const d = await pageHypotheses();
    expect(d.textContent).not.toMatch(/Hook UGC|Léa|Les accroches en question/);
    expect(bilan(d)!.querySelector('[data-taux-general]')!.textContent).toContain('4 gagnantes sur 4 variantes tranchées');
    await expect(pageLot(S.L)).rejects.toThrow('NOT_FOUND');
  });

  it('A2 active · « Créer une hypothèse » sur Léa est refusé · Itérer sur la gagnante de Léa ne la présélectionne pas', async () => {
    h.marque = ids.brandA2;
    const avant = await traces();
    const r = await creerHypotheseAction({ source: { type: 'persona', personaId: P.lea }, saisie: { si: 'forgé' } });
    expect(r.error).toBe('Persona introuvable dans la marque active.');
    await monter(await IterationSpatiale({ searchParams: Promise.resolve(params(lienIterationVariable({ adId: S.lea[0] }))) }));
    expect([...document.querySelectorAll('[data-itad][aria-pressed="true"]')].map((b) => b.getAttribute('data-itad'))).not.toContain(S.lea[0]);
    expect(document.body.innerHTML).not.toContain(S.lea[0]!);
    expect(await traces()).toEqual(avant);
  });

  it('un lecteur client · Hypothèses et fiche de lot refusées, l’action refuse, rien d’écrit', async () => {
    h.session = session(ids, 'uv', { plan: 'plus' });
    const avant = await traces();
    const d = await pageHypotheses();
    expect(bilan(d)).toBeNull();
    expect(d.textContent).not.toContain('Hook UGC');
    const l = await pageLot(S.L);
    expect(l.querySelector('[data-gestes-persona]')).toBeNull();
    expect((await creerHypotheseAction({ source: { type: 'persona', personaId: P.lea }, saisie: { si: 'forgé' } })).error).toBeTruthy();
    expect(await traces()).toEqual(avant);
  });
});
