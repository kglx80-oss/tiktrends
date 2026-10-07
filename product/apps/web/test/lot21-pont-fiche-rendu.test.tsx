// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { eq, sql } from 'drizzle-orm';

/**
 * Lot 21 · R3 · « le pont mène à la fiche, avec le bon format ».
 *
 * Reproduit avant correction (bc33cec8) :
 * - `PreparerTest` liait vers `/adsmap` (la carte nue) alors que l'action
 *   renvoyait `adId` ; `SavedBoards` affichait « Dans Adsmap » sans lien ;
 * - `trackSavedAdAction` écrivait `format: 'video_ugc'` en dur (une image
 *   « Packshot » devenait une « Vidéo UGC ») ;
 * - un second appel, concept déjà présent, renvoyait `{ ok, conceptId }` sans
 *   `adId` · aucun chemin vers la fiche existante ;
 * - concept puis ad écrits hors transaction · un échec de l'ad laissait un
 *   concept sans ad.
 *
 * Message 77 · la tête a2f157a5 REFUSAIT les vidéos ambiguës et les médias
 * inconnus (capacité retirée) · désormais le serveur ne crée rien et demande un
 * CHOIX explicite (liste compatible, rien de présélectionné), puis valide le
 * choix reçu contre le média lu en base.
 *
 * On lit des RÉSULTATS · le `href` rendu après le clic, la valeur renvoyée par
 * l'action RÉELLE et les LIGNES d'une vraie base (pglite, migrations réelles),
 * avec la garde Adsmap réelle (session et marque active simulées).
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), wsB: randomUUID(), neva: randomUUID(), autre: randomUUID(), user: randomUUID() };
});
const session = vi.hoisted(() => ({ marque: 'neva' as 'neva' | 'autre', ws: '' }));
type Reponse = { ok?: true; adId?: string; conceptId?: string; error?: string; dejaSuivie?: true; choixFormat?: { options: Array<{ id: string; libelle: string }>; raison: string } };
const sim = vi.hoisted(() => ({ n: 0, reponses: [] as Array<() => Promise<Reponse>>, refs: [] as Array<Record<string, unknown>> }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.user, email: 'membre@agence.test', name: 'Membre' },
    workspaceId: session.ws || ids.ws, workspaceName: 'Agence', role: 'member', plan: 'plus',
  }),
}));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => (session.marque === 'neva'
    ? { id: ids.neva, name: 'Neva', workspaceId: ids.ws } : { id: ids.autre, name: 'Autre marque', workspaceId: ids.ws }),
}));
// L'avis d'avant lancement (lectures de mémoire) n'est pas le sujet · neutre.
vi.mock('../lib/jarvis-memory', () => ({ invalidateJarvisMemory: () => {}, briefConceptBeforeLaunch: async () => ({ summary: '' }) }));
// L'action RÉELLE, sauf quand un test rendu en simule la réponse (file `sim`).
vi.mock('../app/actions/adsmap-bridge', async (importOriginal) => {
  const reel = await importOriginal<typeof import('../app/actions/adsmap-bridge')>();
  return {
    ...reel,
    trackSavedAdAction: (ref: { platform: string; externalId: string; formatAd?: string }) => {
      sim.n++; sim.refs.push({ ...ref });
      const r = sim.reponses.shift();
      return r ? r() : reel.trackSavedAdAction(ref);
    },
  };
});
vi.mock('../app/actions/inspo', () => ({ setSavedAdFolder: async () => ({ ok: true }), classerFormatSauvegarde: async () => ({ ok: true }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => 1 }), useToastSiPresent: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../components/AdCard', () => ({ AdCard: () => <div data-adcard="" /> }));
vi.mock('../app/(app)/saved/FormatChoix', () => ({ FormatChoix: () => <input data-format-choix aria-label="Format" /> }));

import { db, schema } from '@tiktrends/db';
import { trackSavedAdAction } from '../app/actions/adsmap-bridge';
import { PreparerTest } from '../app/(app)/veille/formats/PreparerTest';
import { SavedBoards, type SavedItem } from '../components/SavedBoards';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;

/* ── Fixtures synthétiques ─────────────────────────────────────────────────── */

const qualifie = (id: string) => ({ id, version: 1, date: '2026-10-01T10:00:00.000Z', auteur: ids.user });
const LONG = 'Laboratoires Dermatologiques Avancés de la Vallée du Rhône et Associés Internationaux';
const SAUVEGARDES: Array<{ ext: string; ws?: string; mediaType?: string; format?: unknown; nom?: string }> = [
  { ext: 'img-packshot', mediaType: 'image', format: qualifie('packshot'), nom: LONG },
  { ext: 'img-packshot-2', mediaType: 'image', format: qualifie('packshot') },
  { ext: 'vid-demo', mediaType: 'video', format: qualifie('demo') },
  { ext: 'vid-face', mediaType: 'video', format: qualifie('face_camera') },
  { ext: 'vid-nue', mediaType: 'video' },
  { ext: 'media-inconnu' },
  { ext: 'legacy-sans-ad', mediaType: 'image' },
  { ext: 'echec', mediaType: 'image' },
  { ext: 'autre-espace', ws: 'B', mediaType: 'image' },
  { ext: 'rendu-reel', mediaType: 'image', format: qualifie('packshot') },
  { ext: 'gif', mediaType: 'gif' },
  { ext: 'img-auto-forge', mediaType: 'image' },
  { ext: 'vid-choix', mediaType: 'video', format: qualifie('face_camera') },
  { ext: 'vid-ancienne-ugc', mediaType: 'video' },
  { ext: 'rendu-choix', mediaType: 'video' },
  { ext: 'saved-choix', mediaType: 'video', nom: 'Vidéo à choisir' },
];

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.user, email: 'membre@agence.test', name: 'Membre' });
  await db!.insert(schema.workspaces).values([{ id: ids.ws, name: 'Agence', plan: 'plus' }, { id: ids.wsB, name: 'Agence B', plan: 'plus' }]);
  await db!.insert(schema.brands).values([{ id: ids.neva, workspaceId: ids.ws, name: 'Neva' }, { id: ids.autre, workspaceId: ids.ws, name: 'Autre marque' }]);
  for (const s of SAUVEGARDES) {
    await db!.insert(schema.savedAds).values({
      workspaceId: s.ws === 'B' ? ids.wsB : ids.ws, brandId: s.ws === 'B' ? null : ids.neva, platform: 'meta', externalId: s.ext,
      snapshot: { id: s.ext, platform: 'meta', status: 'active', advertiserName: s.nom ?? 'Annonceur ' + s.ext, body: 'Texte ' + s.ext,
        ...(s.mediaType ? { mediaType: s.mediaType } : {}), ...(s.format ? { formatCreatif: s.format } : {}) },
    });
  }
});
beforeEach(() => { session.marque = 'neva'; session.ws = ''; sim.n = 0; sim.reponses = []; sim.refs = []; });

const savedId = async (ext: string) => (await db!.select({ id: schema.savedAds.id }).from(schema.savedAds).where(eq(schema.savedAds.externalId, ext)))[0]!.id;
/** Concepts et ads qui citent CETTE sauvegarde (toutes marques). */
async function lignes(ext: string) {
  const sid = await savedId(ext);
  const concepts = await db!.select().from(schema.concepts).where(sql`${schema.concepts.sourceRef}->>'savedAdId' = ${sid}`);
  const ads = concepts.length ? await db!.select().from(schema.ads).where(sql`${schema.ads.conceptId} in (${sql.join(concepts.map((c) => sql`${c.id}`), sql`, `)})`) : [];
  return { concepts, ads };
}
/** La marque d'une ad, par son chemin concept → angle → désir → persona. */
async function marqueDe(adId: string) {
  const [r] = await db!.select({ brandId: schema.personas.brandId, ws: schema.ads.workspaceId }).from(schema.ads)
    .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
    .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
    .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
    .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
    .where(eq(schema.ads.id, adId));
  return r;
}
async function totaux() {
  const n = async (table: string) => Number(((await db!.execute(sql.raw(`select count(*)::int as n from ${table}`))) as unknown as { rows: Array<{ n: number }> }).rows[0]!.n);
  return { personas: await n('personas'), desires: await n('adsmap_desires'), angles: await n('adsmap_angles'), concepts: await n('adsmap_concepts'), ads: await n('adsmap_ads') };
}

/* ── L'action, sur une vraie base ──────────────────────────────────────────── */

describe('trackSavedAdAction · la même fiche, le bon format, rien de partiel', () => {
  it('image « Packshot » · ad `static`, format qualifié gardé dans la provenance du concept', async () => {
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'img-packshot' });
    expect(r.error).toBeUndefined();
    expect(r.adId, 'aucune ad renvoyée').toBeTruthy();
    const { concepts, ads } = await lignes('img-packshot');
    expect(ads.map((a) => a.format), 'une image « Packshot » n’est pas rangée en statique').toEqual(['static']);
    expect(concepts[0]!.sourceRef).toEqual({ savedAdId: await savedId('img-packshot'), platform: 'meta', externalId: 'img-packshot', formatCreatif: 'packshot', formatAdChoisi: false });
    expect(await marqueDe(r.adId!)).toEqual({ brandId: ids.neva, ws: ids.ws });
  });

  it('second appel · LA MÊME ad, aucun doublon (concept ni ad)', async () => {
    const r1 = await trackSavedAdAction({ platform: 'meta', externalId: 'img-packshot-2' });
    const r2 = await trackSavedAdAction({ platform: 'meta', externalId: 'img-packshot-2' });
    expect(r2.adId, 'le second appel ne renvoie pas la fiche existante').toBe(r1.adId);
    expect(r2.dejaSuivie).toBe(true);
    const { concepts, ads } = await lignes('img-packshot-2');
    expect([concepts.length, ads.length], 'un second appel crée un doublon').toEqual([1, 1]);
  });

  it('autre marque de l’espace · jamais l’ad de Neva · sa propre fiche, dans SA marque', async () => {
    const rNeva = await trackSavedAdAction({ platform: 'meta', externalId: 'vid-demo' });
    session.marque = 'autre';
    const rAutre = await trackSavedAdAction({ platform: 'meta', externalId: 'vid-demo' });
    expect(rAutre.adId, 'l’ad d’une autre marque est renvoyée').not.toBe(rNeva.adId);
    expect((await marqueDe(rAutre.adId!))!.brandId).toBe(ids.autre);
    const rAutre2 = await trackSavedAdAction({ platform: 'meta', externalId: 'vid-demo' });
    expect(rAutre2.adId).toBe(rAutre.adId);
    session.marque = 'neva';
    expect((await trackSavedAdAction({ platform: 'meta', externalId: 'vid-demo' })).adId).toBe(rNeva.adId);
    const { ads } = await lignes('vid-demo');
    expect(ads.map((a) => a.format), 'une vidéo « Démonstration » n’est pas une vidéo démo').toEqual(['video_demo', 'video_demo']);
  });

  const VIDEO = [{ id: 'video_ugc', libelle: 'Vidéo UGC' }, { id: 'video_vsl', libelle: 'Vidéo VSL' }, { id: 'video_demo', libelle: 'Vidéo démo' }, { id: 'video_story', libelle: 'Vidéo story' }];
  it.each([
    ['vid-nue', VIDEO, 'Vidéo non qualifiée · choisis son type d’ad Adsmap · rien n’est déduit.'],
    ['vid-face', VIDEO, 'Format « Face caméra » · aucun type vidéo d’Adsmap ne lui correspond sans ambiguïté · choisis-le.'],
    ['gif', [{ id: 'gif', libelle: 'GIF' }], 'GIF · confirme son type d’ad Adsmap avant de créer la fiche.'],
    ['media-inconnu', ['video_ugc', 'video_vsl', 'video_demo', 'video_story', 'static', 'image_carousel', 'gif'], 'Type de média inconnu dans la source · choisis son type d’ad parmi tous les types Adsmap · rien n’est déduit.'],
  ])('%s sans choix · le choix est DEMANDÉ (liste compatible), ZÉRO ligne', async (ext, options, raison) => {
    const avant = await totaux();
    const r = await trackSavedAdAction({ platform: 'meta', externalId: ext });
    expect(r.error, 'une sauvegarde ambiguë est refusée au lieu de proposer un choix').toBeUndefined();
    expect(r.choixFormat?.raison).toBe(raison);
    expect(r.choixFormat?.options.map((o) => (typeof options[0] === 'string' ? o.id : o))).toEqual(options);
    expect(r.adId).toBeUndefined();
    expect(await totaux(), 'une demande de choix a écrit des lignes').toEqual(avant);
  });

  it.each([
    ['vid-nue', 'static'], ['vid-nue', 'gif'], ['gif', 'video_ugc'], ['vid-face', 'ugc_talking_head'], ['media-inconnu', 'carte'],
  ])('%s + choix forgé « %s » · refusé côté serveur, ZÉRO ligne', async (ext, forge) => {
    const avant = await totaux();
    const r = await trackSavedAdAction({ platform: 'meta', externalId: ext, formatAd: forge });
    expect(r.adId, 'un type forgé par le client a été écrit').toBeUndefined();
    expect(r.error).toMatch(/^Type d’ad non proposé pour ce média · choisis parmi « .+ » · rien n’a été créé\.$/);
    expect(await totaux(), 'un choix forgé a écrit des lignes').toEqual(avant);
  });

  it('choix valide · une ad AU TYPE CHOISI, format qualifié conservé à part, « choisi » noté · second appel sans choix → même fiche', async () => {
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'vid-choix', formatAd: 'video_vsl' });
    expect(r.adId, 'le choix valide ne crée pas de fiche').toBeTruthy();
    const { concepts, ads } = await lignes('vid-choix');
    expect(ads.map((a) => a.format)).toEqual(['video_vsl']);
    expect(concepts[0]!.sourceRef).toEqual({ savedAdId: await savedId('vid-choix'), platform: 'meta', externalId: 'vid-choix', formatCreatif: 'face_camera', formatAdChoisi: true });
    const r2 = await trackSavedAdAction({ platform: 'meta', externalId: 'vid-choix' });
    expect(r2, 'le second appel exige un nouveau choix ou change de fiche').toMatchObject({ ok: true, adId: r.adId, dejaSuivie: true });
    expect(r2.choixFormat).toBeUndefined();
    expect((await lignes('vid-choix')).ads).toHaveLength(1);
  });

  it('automatique · un choix forgé par le client est ignoré (image → static)', async () => {
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'img-auto-forge', formatAd: 'video_ugc' });
    const { concepts, ads } = await lignes('img-auto-forge');
    expect(ads.map((x) => [x.id, x.format])).toEqual([[r.adId, 'static']]);
    expect((concepts[0]!.sourceRef as { formatAdChoisi: boolean }).formatAdChoisi).toBe(false);
  });

  it('déjà suivie AVANT (ancienne ad `video_ugc` d’une vidéo non qualifiée) · renvoyée telle quelle, aucun choix exigé, rien modifié', async () => {
    const sid = await savedId('vid-ancienne-ugc');
    const [p] = await db!.insert(schema.personas).values({ brandId: ids.neva, name: 'Ancien UGC' }).returning();
    const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'D' }).returning();
    const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'A', mechanism: 'comparison' }).returning();
    const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Imitation · ancienne', adType: 'imitation',
      sourceRef: { savedAdId: sid, platform: 'meta', externalId: 'vid-ancienne-ugc' } }).returning();
    const [ad] = await db!.insert(schema.ads).values({ workspaceId: ids.ws, conceptId: c!.id, variantCode: 'v1', format: 'video_ugc', adType: 'imitation', status: 'draft' }).returning();
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'vid-ancienne-ugc' });
    expect(r, 'l’ancienne fiche n’est pas renvoyée d’abord').toMatchObject({ ok: true, adId: ad!.id, dejaSuivie: true });
    expect(r.choixFormat).toBeUndefined();
    const { concepts, ads } = await lignes('vid-ancienne-ugc');
    expect(ads).toEqual([ad]);
    expect(concepts).toEqual([c]);
  });

  it('autre espace · introuvable, zéro ligne', async () => {
    const avant = await totaux();
    expect(await trackSavedAdAction({ platform: 'meta', externalId: 'autre-espace' })).toEqual({ error: 'Pub sauvegardée introuvable.' });
    expect(await totaux()).toEqual(avant);
  });

  it('concept ancien resté SANS ad · son ad est créée dedans, aucun second concept', async () => {
    const sid = await savedId('legacy-sans-ad');
    const [p] = await db!.insert(schema.personas).values({ brandId: ids.neva, name: 'Ancien' }).returning();
    const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'D' }).returning();
    const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'A', mechanism: 'comparison' }).returning();
    const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Imitation · ancien', adType: 'imitation',
      sourceRef: { savedAdId: sid, platform: 'meta', externalId: 'legacy-sans-ad' } }).returning();
    const r = await trackSavedAdAction({ platform: 'meta', externalId: 'legacy-sans-ad' });
    const { concepts, ads } = await lignes('legacy-sans-ad');
    expect(concepts.map((x) => x.id), 'un second concept a été créé').toEqual([c!.id]);
    expect(ads.map((x) => x.id)).toEqual([r.adId]);
    expect(ads[0]!.format).toBe('static');
  });

  it('échec de l’écriture de l’ad · aucun concept orphelin (transaction)', async () => {
    await db!.execute(sql.raw(`create or replace function lot21_echec() returns trigger language plpgsql as $$ begin raise exception 'échec simulé de l''ad'; end $$`));
    await db!.execute(sql.raw('create trigger lot21_echec before insert on adsmap_ads for each row execute function lot21_echec()'));
    try {
      const r = await trackSavedAdAction({ platform: 'meta', externalId: 'echec' });
      expect(r.error, 'l’échec n’est pas dit').toBeTruthy();
      expect(r.adId).toBeUndefined();
      const { concepts, ads } = await lignes('echec');
      expect([concepts.length, ads.length], 'un concept sans ad est resté après l’échec').toEqual([0, 0]);
    } finally {
      await db!.execute(sql.raw('drop trigger lot21_echec on adsmap_ads'));
    }
    // Reprise · l'essai suivant aboutit, une seule ligne de chaque.
    const r2 = await trackSavedAdAction({ platform: 'meta', externalId: 'echec' });
    expect(r2.adId).toBeTruthy();
    const { concepts, ads } = await lignes('echec');
    expect([concepts.length, ads.length]).toEqual([1, 1]);
  });
});

/* ── Le rendu · le lien mène à LA fiche ────────────────────────────────────── */

let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
const vider = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const differee = () => { let lacher: (r: Reponse) => void = () => {}; const p = new Promise<Reponse>((ok) => { lacher = ok; }); return { lancer: () => p, lacher: (r: Reponse) => lacher(r) }; };
async function monter(n: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(n); });
  return el;
}
const bouton = (h: HTMLElement, re: RegExp) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))!;
async function choisir(sel: HTMLSelectElement, v: string) {
  await act(async () => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); });
}
const liens = (h: HTMLElement) => [...h.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), texte: a.textContent, minHeight: a.style.minHeight }));

describe('PreparerTest (Formats) · « Ouvrir la fiche dans Adsmap » vers CETTE ad', () => {
  it('action réussie (simulée, adId) · href = /adsmap?ad=<adId>, cible 44 px', async () => {
    sim.reponses = [() => Promise.resolve({ ok: true, adId: 'ad-123', conceptId: 'c-1' })];
    const h = await monter(<PreparerTest platform="meta" externalId="x" />);
    await act(async () => { bouton(h, /Préparer un test/).click(); });
    await vider();
    expect(liens(h), 'le lien ne mène pas à la fiche de l’ad').toEqual([{ href: '/adsmap?ad=ad-123', texte: 'Ouvrir la fiche dans Adsmap', minHeight: '44px' }]);
    expect(bouton(h, /Adsmap/).textContent).toBe('Brouillon de test créé dans Adsmap');
  });

  it('action RÉELLE (pglite) · le href porte l’id de la ligne créée · second clic après rechargement · même fiche, « déjà suivie »', async () => {
    const h = await monter(<PreparerTest platform="meta" externalId="rendu-reel" />);
    await act(async () => { bouton(h, /Préparer un test/).click(); });
    await vider();
    const { ads } = await lignes('rendu-reel');
    expect(ads).toHaveLength(1);
    expect(liens(h).map((l) => l.href)).toEqual([`/adsmap?ad=${ads[0]!.id}`]);
    act(() => { root?.unmount(); }); el?.remove();
    const h2 = await monter(<PreparerTest platform="meta" externalId="rendu-reel" />);
    await act(async () => { bouton(h2, /Préparer un test/).click(); });
    await vider();
    expect(liens(h2).map((l) => l.href), 'le second clic ne renvoie pas la même fiche').toEqual([`/adsmap?ad=${ads[0]!.id}`]);
    expect(bouton(h2, /Adsmap/).textContent).toBe('Déjà suivie dans Adsmap');
    expect((await lignes('rendu-reel')).ads).toHaveLength(1);
  });

  it('vidéo ambiguë (action RÉELLE) · le choix apparaît, RIEN de sélectionné, focus sur le choix · choix → lien vers l’ad au type choisi', async () => {
    const h = await monter(<PreparerTest platform="meta" externalId="rendu-choix" />);
    await act(async () => { bouton(h, /Préparer un test/).click(); });
    await vider();
    const sel = h.querySelector<HTMLSelectElement>('form[data-choix-type-ad] select');
    expect(sel, 'aucun choix proposé pour une vidéo ambiguë').not.toBeNull();
    expect(sel!.value, 'un type est présélectionné').toBe('');
    expect([...sel!.options].filter((o) => o.value).map((o) => [o.textContent, o.selected])).toEqual([['Vidéo UGC', false], ['Vidéo VSL', false], ['Vidéo démo', false], ['Vidéo story', false]]);
    expect(h.querySelector(`label[for="${sel!.id}"]`)?.textContent).toBe('Type d’ad Adsmap');
    expect(document.activeElement, 'le choix n’a pas le focus').toBe(sel);
    expect((await lignes('rendu-choix')).ads, 'une demande de choix a écrit').toHaveLength(0);
    // Valider sans choisir · dit, rien n'est envoyé.
    await act(async () => { bouton(h, /Créer la fiche/).click(); });
    await vider();
    expect(h.querySelector('[role="alert"]')?.textContent).toBe('Choisis un type d’ad avant de créer la fiche.');
    expect(sim.n).toBe(1);
    await choisir(sel!, 'video_story');
    await act(async () => { bouton(h, /Créer la fiche/).click(); });
    await vider();
    const { ads } = await lignes('rendu-choix');
    expect(ads.map((x) => x.format)).toEqual(['video_story']);
    expect(liens(h).map((l) => l.href), 'après le choix, pas de lien vers la fiche').toEqual([`/adsmap?ad=${ads[0]!.id}`]);
    expect(sim.refs.at(-1)).toEqual({ platform: 'meta', externalId: 'rendu-choix', formatAd: 'video_story' });
    expect(h.querySelector('form[data-choix-type-ad]')).toBeNull();
    expect(document.activeElement?.getAttribute('href'), 'le focus est perdu après la création').toBe(`/adsmap?ad=${ads[0]!.id}`);
  });

  it('annulation (bouton ou Échap) · AUCUN appel, retour au repos, focus rendu au bouton', async () => {
    const CHOIX: Reponse = { choixFormat: { options: [{ id: 'video_ugc', libelle: 'Vidéo UGC' }, { id: 'video_vsl', libelle: 'Vidéo VSL' }], raison: 'Vidéo non qualifiée · choisis son type d’ad Adsmap · rien n’est déduit.' } };
    sim.reponses = [() => Promise.resolve(CHOIX), () => Promise.resolve(CHOIX)];
    const h = await monter(<PreparerTest platform="meta" externalId="x" />);
    await act(async () => { bouton(h, /Préparer un test/).click(); });
    await vider();
    await choisir(h.querySelector('select')!, 'video_vsl');
    await act(async () => { bouton(h, /^Annuler$/).click(); });
    await vider();
    expect(sim.n, 'l’annulation a appelé l’action').toBe(1);
    expect(h.querySelector('form[data-choix-type-ad]'), 'le choix reste ouvert après annulation').toBeNull();
    expect(document.activeElement).toBe(bouton(h, /Préparer un test/));
    expect(liens(h)).toEqual([]);
    // Échap · même effet.
    await act(async () => { bouton(h, /Préparer un test/).click(); });
    await vider();
    const sel = h.querySelector('select')!;
    expect(sel.value, 'l’ancien choix est resté présélectionné').toBe('');
    await act(async () => { sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await vider();
    expect(sim.n).toBe(2);
    expect(h.querySelector('form[data-choix-type-ad]')).toBeNull();
    expect(document.activeElement).toBe(bouton(h, /Préparer un test/));
  });

  it('échec réseau pendant la création · le choix est CONSERVÉ, l’erreur est annoncée, nouvel essai possible', async () => {
    sim.reponses = [() => Promise.resolve({ choixFormat: { options: [{ id: 'gif', libelle: 'GIF' }], raison: 'GIF · confirme son type d’ad Adsmap avant de créer la fiche.' } }),
      () => Promise.reject(new Error('réseau')), () => Promise.resolve({ ok: true, adId: 'ad-gif' })];
    const h = await monter(<PreparerTest platform="meta" externalId="x" />);
    await act(async () => { bouton(h, /Préparer un test/).click(); });
    await vider();
    await choisir(h.querySelector('select')!, 'gif');
    await act(async () => { bouton(h, /Créer la fiche/).click(); });
    await vider();
    expect(h.querySelector('[role="alert"]')?.textContent).toBe('Échec · vérifie ta connexion puis réessaie.');
    expect(h.querySelector('select')!.value, 'le choix est perdu après l’échec').toBe('gif');
    await act(async () => { bouton(h, /Créer la fiche/).click(); });
    await vider();
    expect(sim.refs.map((r) => r.formatAd)).toEqual([undefined, 'gif', 'gif']);
    expect(liens(h).map((l) => l.href)).toEqual(['/adsmap?ad=ad-gif']);
  });

  it('réponse différée · le focus posé ailleurs par l’utilisateur n’est pas volé', async () => {
    const d = differee();
    sim.reponses = [d.lancer];
    const h = await monter(<><PreparerTest platform="meta" externalId="x" /><input aria-label="ailleurs" /></>);
    await act(async () => { bouton(h, /Préparer un test/).click(); });
    const ailleurs = h.querySelector<HTMLInputElement>('input[aria-label="ailleurs"]')!;
    ailleurs.focus();
    await act(async () => { d.lacher({ ok: true, adId: 'ad-9' }); });
    await vider();
    expect(document.activeElement, 'la réponse a déplacé le focus').toBe(ailleurs);
    expect(liens(h).map((l) => l.href)).toEqual(['/adsmap?ad=ad-9']);
  });
});

describe('SavedBoards (Sauvegardes) · après « Suivre dans Adsmap », le lien vers la fiche', () => {
  const items: SavedItem[] = [
    { id: 's1', externalId: 'e1', platform: 'meta', folder: null, ad: { id: 'e1', platform: 'meta', status: 'active', mediaType: 'image', advertiserName: LONG } as InspoAd },
    { id: 's2', externalId: 'e2', platform: 'meta', folder: null, ad: { id: 'e2', platform: 'meta', status: 'active', mediaType: 'video', advertiserName: 'B' } as InspoAd },
  ];
  const cellule = (h: HTMLElement, i: number) => [...h.querySelectorAll('button')].filter((b) => /Adsmap|Ajout…/.test(b.textContent ?? ''))[i]!.parentElement!;

  it('suivi réussi (simulé, adId) · « Dans Adsmap » + href = /adsmap?ad=<adId> sur CETTE carte seulement', async () => {
    sim.reponses = [() => Promise.resolve({ ok: true, adId: 'ad-777', conceptId: 'c' })];
    const h = await monter(<SavedBoards items={items} followKeys={[]} adsmap />);
    await act(async () => { cellule(h, 0).querySelector('button')!.click(); });
    await vider();
    expect(cellule(h, 0).querySelector('button')!.textContent).toBe('Dans Adsmap');
    expect(liens(cellule(h, 0)), 'pas de lien vers la fiche après le suivi').toEqual([{ href: '/adsmap?ad=ad-777', texte: 'Ouvrir la fiche dans Adsmap', minHeight: '44px' }]);
    expect(liens(cellule(h, 1))).toEqual([]);
  });

  it('refus puis reprise (#728 · suiviAdsmapRelancable) · une requête par essai, lien après succès, aucun doublon d’envoi', async () => {
    sim.reponses = [() => Promise.resolve({ error: 'Sélectionne une marque active pour ouvrir Adsmap.' }),
      () => Promise.resolve({ ok: true, adId: 'ad-888', dejaSuivie: true })];
    const h = await monter(<SavedBoards items={items} followKeys={[]} adsmap />);
    await act(async () => { cellule(h, 1).querySelector('button')!.click(); });
    await vider();
    expect(cellule(h, 1).textContent).toContain('Sélectionne une marque active');
    expect(liens(cellule(h, 1))).toEqual([]);
    const b = cellule(h, 1).querySelector('button')!;
    await act(async () => { b.click(); b.click(); });
    await vider();
    expect(sim.n, 'reprise · nombre de requêtes').toBe(2);
    expect(liens(cellule(h, 1)).map((l) => l.href)).toEqual(['/adsmap?ad=ad-888']);
  });

  it('réponse différée · le focus posé dans la recherche reste où l’utilisateur l’a mis', async () => {
    const d = differee();
    sim.reponses = [d.lancer];
    const h = await monter(<SavedBoards items={items} followKeys={[]} adsmap />);
    await act(async () => { cellule(h, 0).querySelector('button')!.click(); });
    const recherche = h.querySelector<HTMLInputElement>('input[aria-label="Rechercher dans les créas gardées"]')!;
    recherche.focus();
    await act(async () => { d.lacher({ ok: true, adId: 'ad-1' }); });
    await vider();
    expect(document.activeElement, 'la réponse a déplacé le focus').toBe(recherche);
    expect(liens(cellule(h, 0)).map((l) => l.href)).toEqual(['/adsmap?ad=ad-1']);
  });

  it('vidéo ambiguë (action RÉELLE) depuis Sauvegardes · choix sans présélection · annuler n’appelle rien · choix → fiche', async () => {
    const it2: SavedItem[] = [{ id: 's7', externalId: 'saved-choix', platform: 'meta', folder: null, ad: { id: 'saved-choix', platform: 'meta', status: 'active', mediaType: 'video', advertiserName: 'Vidéo à choisir' } as InspoAd }];
    const h = await monter(<SavedBoards items={it2} followKeys={[]} adsmap />);
    const declencheur = () => [...h.querySelectorAll('button')].find((b) => /Suivre dans Adsmap|Dans Adsmap|Ajout…/.test(b.textContent ?? ''))!;
    await act(async () => { declencheur().click(); });
    await vider();
    const sel = h.querySelector<HTMLSelectElement>('form[data-choix-type-ad] select')!;
    expect(sel, 'aucun choix proposé').not.toBeNull();
    expect(sel.value).toBe('');
    expect(document.activeElement, 'le choix n’a pas le focus').toBe(sel);
    expect(declencheur().textContent).toBe('Suivre dans Adsmap');
    await act(async () => { bouton(h, /^Annuler$/).click(); });
    await vider();
    expect(sim.n, 'l’annulation a appelé l’action').toBe(1);
    expect(h.querySelector('form[data-choix-type-ad]')).toBeNull();
    expect(document.activeElement).toBe(declencheur());
    expect((await lignes('saved-choix')).ads).toHaveLength(0);
    await act(async () => { declencheur().click(); });
    await vider();
    await choisir(h.querySelector('select')!, 'video_ugc');
    await act(async () => { bouton(h, /Créer la fiche/).click(); });
    await vider();
    const { ads } = await lignes('saved-choix');
    expect(ads.map((x) => x.format)).toEqual(['video_ugc']);
    expect(declencheur().textContent).toBe('Dans Adsmap');
    expect(liens(h).map((l) => l.href)).toEqual([`/adsmap?ad=${ads[0]!.id}`]);
    expect(document.activeElement?.getAttribute('href'), 'le focus est perdu sur body').toBe(`/adsmap?ad=${ads[0]!.id}`);
  });

  it('action RÉELLE (pglite) depuis Sauvegardes · le href porte l’id de la ligne', async () => {
    const reel: SavedItem[] = [{ id: 's9', externalId: 'img-packshot', platform: 'meta', folder: null, ad: { id: 'img-packshot', platform: 'meta', status: 'active', mediaType: 'image', advertiserName: LONG } as InspoAd }];
    const h = await monter(<SavedBoards items={reel} followKeys={[]} adsmap />);
    await act(async () => { cellule(h, 0).querySelector('button')!.click(); });
    await vider();
    const { ads } = await lignes('img-packshot');
    const neva = [];
    for (const a of ads) if ((await marqueDe(a.id))!.brandId === ids.neva) neva.push(a.id);
    expect(neva).toHaveLength(1);
    expect(liens(cellule(h, 0)).map((l) => l.href)).toEqual([`/adsmap?ad=${neva[0]}`]);
  });
});
