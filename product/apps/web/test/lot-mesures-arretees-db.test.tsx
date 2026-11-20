// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Un lot dont la mesure s'est arrêtée n'est jamais dit conclu · et « fin
 * prévue passée » vit enfin · sur une VRAIE base (pglite, migrations du
 * dépôt), avec les VRAIES gardes, la VRAIE action de lancement et les VRAIES
 * vues · l'écran d'import (`/adsmap/import`) et l'Accueil (`/dashboard`) · on
 * lit le DOM et les lignes écrites.
 *  · n1 · lancé par `launchBatchAction` · sa fin prévue est écrite (lancement
 *    + fenêtre de la marque) · l'horloge avance de 8 jours, aucune mesure ·
 *    « Mesures manquantes · la fin prévue du lot #1 … est passée » à l'import,
 *    « fin prévue passée » à l'Accueil ;
 *  · n2 · le jeton a expiré à J3 · ses verdicts datés de J3 (un tranché) · à J8,
 *    « Mesures manquantes · … mesures arrêtées le … » · jamais compté « à conclure » ;
 *  · n3 · les mêmes verdicts, recalculés le jour où la fenêtre se ferme · inchangé,
 *    « à conclure ».
 * Aucun réseau, 0 $.
 */

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['ws', 'b', 'uo']) h.ids[k] = randomUUID();
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('../lib/brands', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/brands')>()), getActiveBrand: async () => h.marque }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/adsmap/import',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: 'localhost' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../app/actions/adsmap-attribution', () => ({ attributionViewAction: async () => ({}), creativeTrendAction: async () => ({}) }));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { phraseFinPrevuePassee } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { launchBatchAction } from '../app/actions/adsmap-batch';
import ImportSpatial from '../app/(spatial)/sp/adsmap/import/page';
import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';
import { compterAConclure } from '../app/(spatial)/sp/adsmap/donnees';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

const I = h.ids;
const L: Record<string, string> = {};
const J = 86_400_000;
/** Lancement · le lundi 5 octobre 2026 à 10 h (Paris) · fenêtre du moteur par défaut, 7 jours. */
const T0 = new Date('2026-10-05T08:00:00Z');
const A = (jours: number) => new Date(T0.getTime() + jours * J);

function commeProprietaire() {
  h.session = { user: { id: I.uo!, email: 'uo@arret.test', name: 'Camille' }, workspaceId: I.ws!, workspaceName: 'Espace', role: 'owner', plan: 'plus', equipe: null };
  h.marque = { id: I.b!, name: 'Neva' };
}

async function concept(titre: string) {
  const [p] = await db.insert(schema.personas).values({ brandId: I.b!, name: `P ${titre}` }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: I.ws!, personaId: p!.id, label: 'D' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: I.ws!, desireId: d!.id, label: 'A', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: I.ws!, angleId: a!.id, title: titre }).returning();
  return c!.id;
}

type Verdict = { calcule: 'loser' | 'inconclusive'; le: Date };
/** Un lot de deux variantes Meta · `pret` (à lancer par l'action) ou déjà lancé à T0 (comme un lot d'avant, sans fin prévue), ses verdicts datés. */
async function lot(cle: string, numero: number, o: { pret?: true; verdicts?: Verdict[] }) {
  const [offre] = await db.insert(schema.offers).values({ workspaceId: I.ws!, brandId: I.b!, label: 'Offre' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.ws!, brandId: I.b!, url: 'https://neva.test/p', label: 'Page' }).returning();
  const [b] = await db.insert(schema.batches).values({ workspaceId: I.ws!, brandId: I.b!, number: numero, status: o.pret ? 'ready' : 'testing', launchedAt: o.pret ? null : T0, goal: `Lot ${cle}` }).returning();
  L[cle] = b!.id;
  for (let i = 0; i < 2; i++) {
    const [a] = await db.insert(schema.ads).values({
      workspaceId: I.ws!, conceptId: await concept(`Concept ${cle} ${i + 1}`), batchId: b!.id, variantCode: `v${i + 1}`, status: o.pret ? 'ready' : 'live', adType: 'ideation', format: 'static', platform: 'meta',
      hypothesis: 'Si on montre la preuve chiffrée, alors le coût par achat baisse parce que la cible doute.', testedVariable: 'hook', variableValue: `Preuve ${i + 1}`,
      offerId: offre!.id, landingPageId: page!.id, launchedAt: o.pret ? null : T0, generatedName: `NEVA_${cle}_v${i + 1}`,
    }).returning();
    const v = o.verdicts?.[i];
    if (v) {
      await db.insert(schema.verdicts).values({
        adId: a!.id, workspaceId: I.ws!, computed: v.calcule, status: 'computed', comparable: true, computedAt: v.le,
        metricsAgg: { spend: 150, impressions: 20000, purchases: 1, cpa: 150, reason: 'Moteur', daysElapsed: 3 },
      });
    }
  }
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: I.ws!, name: 'Espace', plan: 'plus', onboardedAt: new Date('2020-01-06T09:00:00Z') });
  await db.insert(schema.users).values({ id: I.uo!, email: 'uo@arret.test', name: 'Camille' });
  await db.insert(schema.workspaceMembers).values({ workspaceId: I.ws!, userId: I.uo!, role: 'owner' });
  await db.insert(schema.brands).values({ id: I.b!, workspaceId: I.ws!, name: 'Neva' });
  await lot('n1', 1, { pret: true });
  // Le jeton a expiré à J3 · les verdicts du dernier passage (J3) restent · l'un est tranché (un coût déjà trop haut).
  await lot('n2', 2, { verdicts: [{ calcule: 'loser', le: A(3) }, { calcule: 'inconclusive', le: A(3) }] });
  // Les mêmes, recalculés par la synchro du jour où la fenêtre se ferme (le 12 oct., 7 h Paris).
  await lot('n3', 3, { verdicts: [{ calcule: 'loser', le: new Date('2026-10-12T05:00:00Z') }, { calcule: 'inconclusive', le: new Date('2026-10-12T05:00:00Z') }] });
}, 180_000);

afterEach(() => { vi.useRealTimers(); h.session = null; h.marque = null; });

const dom = (el: ReactNode) => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(el as ReactElement); return d; };
const net = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const horloge = (t: Date) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(t); };

/** L'écran d'import ouvert sur un lot · la phrase de son cas (`data-cas-mesures`) et son diagnostic. */
async function importSur(cle: string) {
  const d = dom(avecSpatial(await ImportSpatial({ searchParams: Promise.resolve({ lot: L[cle]! }) })));
  const s = d.querySelector<HTMLElement>('section[data-lot-cible]');
  expect(s?.dataset.lotCible, `l’écran d’import ne s’ouvre pas sur ${cle}`).toBe(L[cle]);
  const cas = s!.querySelector<HTMLElement>('[data-cas-mesures]');
  return { cas: cas?.dataset.casMesures ?? null, texte: net(cas?.textContent) || null, diagnostic: net(s!.querySelector('[data-diagnostic]')?.textContent) || null };
}

/** L'Accueil rendu · l'étape « En diffusion » (sous-titre, diagnostic) et le nombre « À traiter ». */
async function accueil() {
  const d = dom(avecSpatial(await AccueilSpatial({ searchParams: Promise.resolve({}) })));
  const etape = (titre: string) => [...d.querySelectorAll<HTMLAnchorElement>('.pipe a.tile.stage')].find((a) => net(a.querySelector('strong')?.textContent) === titre) ?? null;
  const e = etape('En diffusion');
  expect(e, 'préalable · l’étape « En diffusion » de la boucle').not.toBeNull();
  const t = etape('À traiter');
  return {
    sous: net(e!.querySelector('strong + span')?.textContent),
    diagnostic: e!.querySelector('[data-fin-prevue]') ? net(e!.querySelector('[data-fin-prevue] > span:not(.btn)')?.textContent) : null,
    traiter: t ? Number(net(t.querySelector('.big3')?.textContent)) : null,
  };
}

describe('le lancement écrit la fin prévue · « fin prévue passée » s’allume', () => {
  it('lancé par la vraie action · fin prévue = lancement + fenêtre · à J8 sans mesure · « la fin prévue … est passée »', async () => {
    commeProprietaire();
    horloge(T0);
    expect(await launchBatchAction(L.n1!)).toEqual({ ok: true });
    const [b] = await db.select({ lance: schema.batches.launchedAt, fin: schema.batches.plannedEndAt, statut: schema.batches.status }).from(schema.batches).where(eq(schema.batches.id, L.n1!));
    expect(b!.statut).toBe('testing');
    expect(b!.lance?.toISOString()).toBe(T0.toISOString());
    expect(b!.fin?.toISOString() ?? null, 'le lancement n’écrit pas la fin prévue').toBe(A(7).toISOString());

    // En diffusion (J5) · « mesures en cours », jusqu'à la fin prévue.
    horloge(A(5));
    expect((await importSur('n1')).texte, 'la fin prévue n’est pas dite en diffusion').toBe('Mesures en cours · le lot #1 est en diffusion jusqu’au 12 oct. · sous le minimum du moteur d’ici là, c’est normal.');

    horloge(A(8));
    const i = await importSur('n1');
    expect(i.cas).toBe('manquantes');
    expect(i.texte, 'la fin prévue n’est pas dite passée').toBe('Mesures manquantes · la fin prévue du lot #1 (le 12 oct.) est passée.');
    const a = await accueil();
    expect(a.sous, '« fin prévue passée » ne s’allume pas à l’Accueil').toBe(phraseFinPrevuePassee([{ numero: 1 }]));
    expect(a.diagnostic).toBe('Lot #1 · aucune mesure reçue depuis le lancement');
  });
});

describe('une mesure arrêtée à J3 · à J8, mesures manquantes · jamais conclue', () => {
  it('verdicts de J3 · l’import dit « mesures arrêtées » · le compte « à conclure » ne le propose pas · un lot à jour reste « à conclure »', async () => {
    commeProprietaire();
    horloge(A(8));
    const i = await importSur('n2');
    expect(i.cas, 'le lot n’est pas dit en manque de mesures').toBe('manquantes');
    expect(i.texte).toBe('Mesures manquantes · lot #2 · mesures arrêtées le 8 oct., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2.');
    expect(i.diagnostic).toBe('Lot #2 · mesures arrêtées le 8 oct., avant la fin de la fenêtre du moteur (7 jours) · 2 variantes sur 2');
    const c = await compterAConclure(I.ws!, I.b!, new Date());
    expect(c.lots.map((l) => l.numero), 'un lot aux mesures arrêtées est proposé à conclure').toEqual([3]);
    // n3 · à jour · inchangé · il n'attend rien.
    expect((await importSur('n3')).cas).toBeNull();
    expect((await accueil()).traiter).toBe(1);
  });
});
