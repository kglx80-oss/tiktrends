// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InspoAd } from '@tiktrends/integrations';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Fermer les deux boucles des lots 1 à 3 · base RÉELLE (pglite, migrations),
 * actions RÉELLES, vues RÉELLES montées dans le DOM · on lit ce qu'on VOIT et
 * ce qui est ÉCRIT, jamais la présence d'un appel.
 *
 *  · RJ A04 · « En tirer une hypothèse » sur un apprentissage (carte et
 *    tiroir) · le formulaire s'ouvre prérempli (« parce que » = l'énoncé,
 *    variable reprise), l'hypothèse naît dans « À formuler » avec la provenance
 *    « Apprentissage » · un apprentissage rejeté sert à se retester ;
 *  · VB F26 · « Itérer à partir de cette pub » dans le détail d'une pub de la
 *    Veille · l'écran Itérer la prend en source, « je garde / je remplace » sur
 *    UNE variable · ce qui naît est une ad brouillon de la marque ACTIVE, avec
 *    la provenance Veille · rien n'est écrit sur la sauvegarde ;
 *  · variable non admise fermée avec sa raison (écran et serveur), autre
 *    marque refusée, lecture seule refusée · rien d'écrit.
 * Aucun réseau, aucun modèle, aucune dépense.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as string | null, push: [] as string[] }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push(u: string) { h.push.push(u); }, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/adsmap/apprentissages', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/adsmap/apprentissages', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
// La mémoire Jarvis n'est qu'un cache de statistiques · neutralisée, rien de lent.
vi.mock('../lib/jarvis-memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/jarvis-memory')>()), invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }),
}));

import { db, schema, eq } from '@tiktrends/db';
import { and } from 'drizzle-orm';
import {
  accesHypothese, lienIterationVeille, lienPreparationInspiration, raisonStructurelleInspiration,
  APRES_CREATION_ITERATION, RAISON_DESTINATION_INSPIRATION, RAISON_DEUX_SOURCES, RAISON_TEMOIN, RAISON_UNE_SEULE, RAISON_VEILLE_AUTRE_MARQUE, RAISON_VEILLE_NON_GARDEE,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { creerHypotheseAction } from '../app/actions/adsmap-hypotheses';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import ApprentissagesSpatial from '../app/(spatial)/sp/adsmap/apprentissages/page';
import HypothesesSpatial from '../app/(spatial)/sp/adsmap/hypotheses/page';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import { carteVeille } from '../app/(spatial)/sp/veille/cartes';
import { CarteVeille } from '../spatial/vues/veille/client';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const S = { W: '', R: '', LV: '', LR: '', LX: '', sauvee: '' };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });
const lecteur = (): SessionTest => session(ids, 'uv', { plan: 'plus' });
const ENONCE = 'La preuve en ouverture convertit mieux.';
const ENONCE_REJETE = 'Les accroches en question retiennent mieux';
const PUB: InspoAd = { id: 'veille-1', platform: 'meta', status: 'active', daysRunning: 21, mediaType: 'image', advertiserName: 'Ploufy', body: 'Le texte réel de la pub Ploufy', thumbnailUrl: 'https://cdn.example.test/ploufy.jpg' };
const PUB_A2: InspoAd = { id: 'veille-2', platform: 'meta', status: 'active', daysRunning: 9, mediaType: 'image', advertiserName: 'Autre', body: 'x' };

async function chaine(brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function ad(conceptId: string, code: string, variable: 'proof' | 'hook') {
  const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId, variantCode: code, status: 'done', hypothesis: 'Si on montre la preuve, alors on convertit, parce que la peur tombe.', testedVariable: variable }).returning({ id: schema.ads.id });
  await db.insert(schema.verdicts).values({ adId: a!.id, workspaceId: ids.wsA, computed: 'winner', validated: 'winner', status: 'validated', comparable: true, metricsAgg: { roas: 2.4, spend: 120 } });
  return a!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  const c1 = await chaine(ids.brandA1, 'Sérum');
  S.W = await ad(c1, 'V1', 'proof');
  S.R = await ad(c1, 'V2', 'hook');
  const [lv] = await db.insert(schema.learnings).values({ workspaceId: ids.wsA, brandId: ids.brandA1, adId: S.W, scope: 'ad', statement: ENONCE, status: 'validated' }).returning();
  const [lr] = await db.insert(schema.learnings).values({ workspaceId: ids.wsA, brandId: ids.brandA1, adId: S.R, scope: 'ad', statement: ENONCE_REJETE, status: 'validated', refuted: true }).returning();
  const [lx] = await db.insert(schema.learnings).values({ workspaceId: ids.wsA, brandId: ids.brandA2, scope: 'ad', statement: 'Constat de la marque A2', status: 'validated' }).returning();
  S.LV = lv!.id; S.LR = lr!.id; S.LX = lx!.id;
  // La pub de la Veille, gardée pour la marque A1 · et une autre, gardée pour A2.
  const [sv] = await db.insert(schema.savedAds).values({ workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA1, platform: 'meta', externalId: PUB.id, snapshot: PUB }).returning();
  S.sauvee = sv!.id;
  await db.insert(schema.savedAds).values({ workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA2, platform: 'meta', externalId: PUB_A2.id, snapshot: PUB_A2 });
}, 180_000);

/* ───────────────────────────── DOM ───────────────────────────── */

let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; h.push.length = 0; });
async function monter(el: ReactElement) {
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
}
async function cliquer(el: Element | string | null | undefined) {
  const e = typeof el === 'string' ? document.querySelector<HTMLElement>(el) : (el as HTMLElement | null | undefined);
  expect(e, `élément ${typeof el === 'string' ? el : 'cliqué'}`).toBeTruthy();
  await act(async () => { e!.click(); await new Promise((r) => setTimeout(r, 0)); });
  // Les actions serveur réelles (pglite) · on laisse leurs promesses se résoudre.
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}
async function saisir(el: Element | string | null, valeur: string) {
  const e = (typeof el === 'string' ? document.querySelector(el) : el) as HTMLInputElement | HTMLTextAreaElement | null;
  expect(e, 'champ à saisir').toBeTruthy();
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(e, valeur);
  await act(async () => { e!.dispatchEvent(new Event('input', { bubbles: true })); });
}
const bouton = (texte: string, dans: ParentNode = document) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));
const carteDe = (texte: string) => [...document.querySelectorAll('article.lcard')].find((a) => a.querySelector('h3')?.textContent === texte)!;
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const raisonDe = (v: string) => { const b = document.querySelector(`[data-itvar="${v}"]`)!; return document.getElementById(b.getAttribute('aria-describedby')!)!.textContent; };
const nbAds = async () => (await db.select({ id: schema.ads.id }).from(schema.ads)).length;
const sauvegarde = async (externalId: string) => (await db.select().from(schema.savedAds).where(and(eq(schema.savedAds.workspaceId, ids.wsA), eq(schema.savedAds.externalId, externalId))))[0];
/** Le tableau des hypothèses rendu · le HTML de chaque colonne, par titre (même lecture que le lot 1). */
async function tableau(): Promise<Record<string, string[]>> {
  const html = renderToStaticMarkup(avecSpatial(await HypothesesSpatial()));
  const board = html.slice(html.indexOf('<div class="board4">'));
  const out: Record<string, string[]> = {};
  for (const col of board.split('<div class="colh">').slice(1)) out[col.slice(0, col.indexOf('<span'))] = col.split('<div class="hcard">').slice(1);
  return out;
}
const marqueDeLAd = async (adId: string) => (await db.select({ brandId: schema.personas.brandId, concept: schema.concepts.sourceRef, adType: schema.concepts.adType }).from(schema.ads)
  .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id)).innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
  .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id)).innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
  .where(eq(schema.ads.id, adId)))[0];
/** Un prix écrit à l'écran · crédits, euros ou dollars précédés d'un nombre. */
const PRIX = /\d[\d\s .,]*\s*(crédits?|€|\$)/i;

/* ───────────────────────────── RJ A04 ───────────────────────────── */

describe('RJ A04 · « En tirer une hypothèse » depuis un apprentissage', () => {
  it('sur la carte · formulaire prérempli (« parce que » = l’énoncé, variable reprise) · l’hypothèse naît dans « À formuler », provenance « Apprentissage »', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    await monter(await ApprentissagesSpatial());
    const carte = carteDe(ENONCE);
    expect(carte, 'la carte de l’apprentissage validé n’est pas rendue').toBeTruthy();
    expect(carte.querySelector('[data-geste="hypothese-tiroir"] button'), 'le geste manque dans le tiroir').toBeTruthy();
    await cliquer(carte.querySelector('[data-geste="hypothese-carte"] button'));
    const d = document.querySelector('[role="dialog"]')!;
    expect(d, 'le formulaire ne s’ouvre pas').toBeTruthy();
    expect(d.querySelector('h2')!.textContent).toBe('En tirer une hypothèse');
    expect((d.querySelector('textarea[name="parceQue"]') as HTMLTextAreaElement).value, 'le « parce que » n’est pas l’énoncé').toBe(ENONCE);
    expect((d.querySelector('select[name="variable"]') as HTMLSelectElement).value, 'la variable de l’apprentissage n’est pas reprise').toBe('proof');
    expect((d.querySelector('textarea[name="si"]') as HTMLTextAreaElement).value, 'un « Si… » inventé').toBe('');

    await saisir(d.querySelector('textarea[name="si"]'), 'on montre l’avant après dès la première seconde');
    const avant = await nbAds();
    await cliquer(bouton('Ranger dans « À formuler »', d));
    expect(d.querySelector('[role="alert"]')?.textContent ?? null, 'refus inattendu').toBeNull();
    expect(await nbAds(), 'aucune hypothèse créée').toBe(avant + 1);
    const [cree] = await db.select().from(schema.ads).where(eq(schema.ads.hypothesis, 'Si on montre l’avant après dès la première seconde, alors…, parce que La preuve en ouverture convertit mieux.'));
    expect(cree, 'l’hypothèse écrite n’est pas la phrase préremplie').toBeTruthy();
    expect([cree!.status, cree!.testedVariable]).toEqual(['draft', 'proof']);
    expect((cree!.sourceRef as { hypotheseLibre?: unknown } | null)?.hypotheseLibre, 'provenance perdue').toEqual({ type: 'apprentissage', enonce: ENONCE, learningId: S.LV });
    expect((await marqueDeLAd(cree!.id))?.brandId, 'l’hypothèse n’est pas de la marque active').toBe(ids.brandA1);

    const t = await tableau();
    const c = (t['À formuler'] ?? []).find((x) => x.includes('l’avant après dès la première seconde')) ?? '';
    expect(c, 'l’hypothèse n’est pas dans « À formuler »').not.toBe('');
    expect(c, 'la carte ne dit ni ce qui manque ni sa provenance').toContain(`Il manque le résultat attendu (alors…) · Apprentissage · ${ENONCE}`);
  });

  it('rejeté · le geste reste ouvert (il sert à retester) · depuis le tiroir, le « parce que » dit le rejet, jamais l’énoncé comme un acquis', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    await monter(await ApprentissagesSpatial());
    const carte = carteDe(ENONCE_REJETE);
    expect(carte.querySelector('.pill')?.textContent, 'le rejeté n’est pas « À retester »').toBe('À retester');
    await cliquer(carte.querySelector('[data-geste="hypothese-tiroir"] button'));
    const d = document.querySelector('[role="dialog"]')!;
    expect((d.querySelector('textarea[name="parceQue"]') as HTMLTextAreaElement).value, 'le rejeté entre comme raison acquise')
      .toBe(`le constat « ${ENONCE_REJETE} » a été rejeté et reste à retester`);
    expect(d.textContent).toContain('il n’est plus une raison acquise, l’hypothèse sert à le retester');
    expect((d.querySelector('select[name="variable"]') as HTMLSelectElement).value).toBe('hook');
    await saisir(d.querySelector('textarea[name="si"]'), 'on rouvre sur une question');
    await cliquer(bouton('Ranger dans « À formuler »', d));
    const c = ((await tableau())['À formuler'] ?? []).find((x) => x.includes('on rouvre sur une question')) ?? '';
    expect(c, 'l’hypothèse du rejeté n’est pas dans « À formuler »').toContain(`Apprentissage · ${ENONCE_REJETE}`);
  });

  it('serveur · apprentissage d’une autre marque, lecture seule · refusés, rien d’écrit', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    const avant = await nbAds();
    expect((await creerHypotheseAction({ source: { type: 'apprentissage', learningId: S.LX }, saisie: { si: 'x' } })).error, 'apprentissage d’une autre marque accepté')
      .toBe('Apprentissage introuvable dans la marque active.');
    h.session = lecteur();
    expect((await creerHypotheseAction({ source: { type: 'apprentissage', learningId: S.LV }, saisie: { si: 'x' } })).error, 'lecture seule acceptée')
      .toBe('Ton rôle ne permet pas d’accéder à Adsmap.');
    expect(await nbAds()).toBe(avant);
  });
});

/* ───────────────────────────── VB F26 ───────────────────────────── */

describe('VB F26 · itérer à partir d’une pub de la Veille', () => {
  it('détail de la pub → Itérer (je garde / je remplace) → ad brouillon de la marque active, provenance Veille · la sauvegarde intacte', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    const avantSauvegarde = await sauvegarde(PUB.id);
    const c = carteVeille(PUB, { cpm: 10, sauvee: true, suivie: false, contexte: '/veille', sauvegardeId: S.sauvee, hypothese: accesHypothese({ adsmap: 'ok', marqueActive: true }) });
    await monter(<CarteVeille c={c} coutJarvis="c" />);
    await cliquer('button.xv');
    const geste = document.querySelector('.xmod [data-geste="iterer-veille"]');
    expect(geste?.textContent, 'le geste manque dans le détail').toContain('Itérer à partir de cette pub');
    await cliquer(geste);
    expect(h.push, 'le geste ne mène pas à l’écran Itérer, pub en source').toEqual([lienIterationVeille({ platform: 'meta', externalId: PUB.id })]);

    act(() => { root?.unmount(); });
    const sp = Object.fromEntries(new URL(h.push[0]!, 'http://x').searchParams);
    h.push.length = 0;
    await monter(await IterationSpatiale({ searchParams: Promise.resolve(sp) }));
    expect(document.querySelector('[data-inspiration]')?.textContent, 'la pub de la Veille n’est pas la source').toContain('Ploufy');
    await cliquer('#orn [data-geste="continuer"]');
    expect(coche(), 'défaut · la première admise du tunnel').toEqual(['hook']);
    // Fermées · focalisables, raison écrite à côté · un clic ne coche rien.
    expect(document.querySelector('[data-itvar="landing"]')!.getAttribute('aria-disabled'), 'page de destination ouverte à l’écran').toBe('true');
    expect(raisonDe('landing'), 'raison écrite de la page de destination').toBe(RAISON_DESTINATION_INSPIRATION);
    expect(raisonDe('angle')).toBe(raisonStructurelleInspiration('angle'));
    await cliquer('[data-itvar="landing"]');
    expect(coche(), 'une variable fermée a été cochée').toEqual(['hook']);
    await cliquer('[data-itvar="cta"]');
    expect(coche(), 'deux variables à la fois').toEqual(['cta']);
    expect(document.querySelector('[data-itvar="cta"] [data-je]')?.textContent).toBe('Je remplace');
    expect(document.querySelector('[data-itvar="hook"] [data-je]')?.textContent).toBe('Je garde');
    expect(document.querySelector('[data-garde-remplace]')!.textContent).toMatch(/^Je garde · accroche, visuel d’ouverture, .+ · Je remplace · appel à l’action$/);

    await saisir('[data-champ="valeur"]', '« Essaie-le 30 jours »');
    const hyp = (document.querySelector('[data-champ="hypothese"]') as HTMLTextAreaElement).value;
    expect(hyp).toBe('Si on reprend la pub de Ploufy en remplaçant seulement l’appel à l’action par « Essaie-le 30 jours », alors… ?');
    expect(document.body.textContent, 'un prix est écrit avant le devis serveur').not.toMatch(PRIX);

    const avant = await nbAds();
    await cliquer('#orn [data-geste="creer-iteration"]');
    expect(document.querySelector('[data-erreur]')?.textContent ?? null, 'refus inattendu').toBeNull();
    expect(await nbAds(), 'aucune ad créée').toBe(avant + 1);
    const [cree] = await db.select().from(schema.ads).where(eq(schema.ads.hypothesis, hyp));
    expect(cree, 'l’ad n’a pas l’hypothèse relue à l’écran').toBeTruthy();
    expect([cree!.status, cree!.adType, cree!.testedVariable, cree!.variableValue], 'statut, type, variable CHOISIE, valeur').toEqual(['draft', 'imitation', 'cta', '« Essaie-le 30 jours »']);
    expect((cree!.sourceRef as { hypotheseLibre?: unknown } | null)?.hypotheseLibre, 'provenance Veille perdue').toEqual({ type: 'veille', annonceur: 'Ploufy', savedAdId: S.sauvee });
    const m = await marqueDeLAd(cree!.id);
    expect(m?.brandId, 'l’ad n’est pas de la marque active').toBe(ids.brandA1);
    expect([m?.adType, (m?.concept as { savedAdId?: string })?.savedAdId], 'le concept « imitation » ne garde pas la sauvegarde').toEqual(['imitation', S.sauvee]);
    expect(await db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.childAdId, cree!.id)), 'une filiation inventée vers une pub concurrente').toEqual([]);
    expect(await sauvegarde(PUB.id), 'la sauvegarde Veille a été réécrite').toEqual(avantSauvegarde);

    expect(document.querySelector('.ithead h2')!.textContent).toBe(`Itération ${cree!.variantCode} créée`);
    expect(document.querySelector('[data-iteration-creee]')!.textContent).toContain('garde la structure de la pub de Ploufy');
    expect(document.querySelector('[data-devis="serveur"]')!.textContent).toBe(APRES_CREATION_ITERATION);
    await cliquer('#orn [data-geste="preparer-iteration"]');
    expect(h.push).toEqual([lienPreparationInspiration({ savedAdId: S.sauvee, source: { cle: 'meta:veille-1', nom: 'Ploufy' }, video: false, code: cree!.variantCode, variable: 'cta', valeur: '« Essaie-le 30 jours »' })]);

    const t = (await tableau())['À formuler'] ?? [];
    expect(t.find((x) => x.includes('remplaçant seulement l’appel à l’action')) ?? '', 'l’itération Veille n’est pas dans « À formuler » avec sa provenance').toContain('Veille · Ploufy');
  });

  it('serveur · même règle qu’à l’écran · fermée, deux variables, deux sources, autre marque, non gardée, lecture seule · refusés, rien d’écrit', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    const avantSauvegarde = await sauvegarde(PUB.id);
    const avant = await nbAds();
    const appel = async (o: Record<string, unknown>) => {
      const r = await creerIterationChoisieAction({ inspiration: { platform: 'meta', externalId: PUB.id }, variable: 'format', valeur: 'vidéo face caméra', hypothese: 'Si on reprend sa structure en vidéo, alors… ?', ...o });
      return r.ok ? `CRÉÉE (${r.variable})` : r.error;
    };
    expect(await appel({ variable: 'landing' }), 'page de destination acceptée').toBe(RAISON_DESTINATION_INSPIRATION);
    expect(await appel({ variable: 'angle' }), 'angle accepté').toBe(raisonStructurelleInspiration('angle'));
    expect(await appel({ variable: 'none_control' }), 'témoin accepté').toBe(RAISON_TEMOIN);
    expect(await appel({ variable: 'format,cta' }), 'deux variables acceptées').toBe(RAISON_UNE_SEULE);
    expect(await appel({ parentAdId: S.W }), 'deux sources acceptées').toBe(RAISON_DEUX_SOURCES);
    expect(await appel({ inspiration: { platform: 'meta', externalId: PUB_A2.id } }), 'pub gardée pour une autre marque acceptée').toBe(RAISON_VEILLE_AUTRE_MARQUE);
    expect(await appel({ inspiration: { platform: 'meta', externalId: 'jamais-gardee' } }), 'pub non gardée acceptée').toBe(RAISON_VEILLE_NON_GARDEE);
    h.session = lecteur();
    expect(await appel({}), 'lecture seule acceptée').toBe('Ton rôle ne permet pas d’accéder à Adsmap.');
    expect(await nbAds(), 'un refus a écrit une ad').toBe(avant);
    expect(await sauvegarde(PUB.id)).toEqual(avantSauvegarde);
  });

  it('écran · une pub gardée pour une autre marque n’est pas reprise, la page dit pourquoi', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    await monter(await IterationSpatiale({ searchParams: Promise.resolve({ veille: 'meta', pub: PUB_A2.id }) }));
    expect(document.querySelector('[data-inspiration]'), 'la pub d’une autre marque est proposée').toBeNull();
    expect(document.body.textContent).toContain(RAISON_VEILLE_AUTRE_MARQUE);
  });
});
