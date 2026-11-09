// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { SessionTest } from './studios-semis';

/**
 * Lot 9 V5 · personas éditables et reliés aux tests · sur une VRAIE base
 * (pglite, migrations réelles jusqu'à 0071), avec les VRAIES actions et les
 * VRAIES pages Spatiales rendues (et montées) · on lit le HTML et la base,
 * jamais la présence d'un appel.
 *
 *  · modifier un persona (nom, segment, rang, désirs) · relu sur la fiche, dans
 *    le sélecteur « Pour qui ? » du brief et sur la fiche du lot ;
 *  · le rang est respecté partout · les autres se décalent ;
 *  · « Créer une pub » d'un persona ouvre Nouveau projet avec CE persona
 *    présélectionné · le brief qui en sort le porte, la variante rattachée au
 *    test (carte « À qualifier ») est lue sous ce persona sur la fiche du lot ;
 *  · la lecture par persona se tait sous le seuil, et le dit · au-dessus, elle
 *    parle avec ses deux intervalles ;
 *  · une autre marque, un autre espace, un membre · refus, rien d'écrit, rien
 *    ne fuit.
 * Aucun réseau, aucune dépense (worker et stockage simulés).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  session: null as SessionTest | null,
  marque: null as { id: string; name: string } | null,
  ids: {} as Record<string, string>,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bB', 'uo', 'um', 'ub', 'lea', 'max', 'sam', 'zed']) h.ids[k] = randomUUID();
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
  usePathname: () => '/brands',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
vi.mock('../lib/spend-guard', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/spend-guard')>()), spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq, and } from '@tiktrends/db';
import { construireBriefV5, saisieBriefVide, REFUS_PERSONA_INTROUVABLE, MIN_VERDICTS_PERSONA } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { contexteDepuisSession } from '../lib/studios/garde';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique, contenuImages } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import PersonasSpatiale from '../app/(spatial)/sp/brands/[id]/personas/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import PreparerProjetPage from '../app/(spatial)/sp/studio/projets/nouveau/page';
import { updatePersonaAction } from '../app/actions/brand-detail';
import { GUARD } from '../lib/guard-error';

const I = h.ids;
const JOUR = 86_400_000;
const scene = { lotStudio: '', adStudio: '', lotLea: '', projet: '', offre: '', page: '' };

type Qui = 'uo' | 'um' | 'ub';
function sess(qui: Qui): SessionTest {
  return {
    user: { id: I[qui]!, email: `${qui}@lot9.test`, name: null }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace',
    role: qui === 'um' ? 'member' : 'owner', plan: 'plus', equipe: null,
  };
}
const MARQUE = { A: () => ({ id: I.bA!, name: 'Neva' }), A2: () => ({ id: I.bA2!, name: 'Autre' }), B: () => ({ id: I.bB!, name: 'Ailleurs' }) };
function comme(qui: Qui, marque: { id: string; name: string } | null) { h.session = sess(qui); h.marque = marque; }

const visible = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return { d, texte: (d.textContent ?? '').replace(/\s+/g, ' ') }; };
const pagePersonas = async (id = I.bA!) => visible(renderToStaticMarkup(avecSpatial(await PersonasSpatiale({ params: Promise.resolve({ id }) }))));
const pageLot = async (id: string) => visible(renderToStaticMarkup(avecSpatial(await LotSpatial({ params: Promise.resolve({ id }) }))));
const pageNouveau = async (sp: Record<string, string>) => visible(renderToStaticMarkup(avecSpatial(await PreparerProjetPage({ searchParams: Promise.resolve(sp) }))));
/** La VRAIE fiche Personas, montée, ouverte sur le persona nommé (sa puce cliquée). */
async function ficheMontee(nom: string) {
  const el = await PersonasSpatiale({ params: Promise.resolve({ id: I.bA! }) });
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => { racine.render(avecSpatial(el)); });
  const puce = [...hote.querySelectorAll<HTMLButtonElement>('[aria-label="Persona"] button')].find((b) => b.textContent?.includes(nom));
  if (!puce) throw new Error(`aucune puce ${nom}`);
  await act(async () => { puce.click(); });
  return { hote, fin: async () => { await act(async () => { racine.unmount(); }); hote.remove(); } };
}
const persona = async (id: string) => (await db.select().from(schema.personas).where(eq(schema.personas.id, id)))[0]!;
const photoPersonas = async () => JSON.stringify((await db.select().from(schema.personas)).sort((a, b) => a.id.localeCompare(b.id)));

/** Une ad dans la carte de la marque (persona → désir → angle → concept → ad), rangée dans un lot, avec son verdict. */
async function adCarte(personaId: string, batchId: string, code: string, verdict: 'winner' | 'loser') {
  const [d] = await db.insert(schema.desires).values({ workspaceId: I.wsA!, personaId, label: `D ${code}` }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: I.wsA!, desireId: d!.id, label: `A ${code}`, mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: I.wsA!, angleId: a!.id, title: `Concept ${code}` }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: I.wsA!, conceptId: c!.id, batchId, variantCode: code, status: 'live', testedVariable: 'hook', hypothesis: 'Si…, alors…, parce que…', offerId: scene.offre, landingPageId: scene.page }).returning();
  await db.insert(schema.verdicts).values({ adId: ad!.id, workspaceId: I.wsA!, computed: verdict, comparable: true, metricsAgg: { reason: 'Moteur', impressions: 20000 } });
  return ad!.id;
}
async function lot(numero: number) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: I.wsA!, brandId: I.bA!, number: numero, status: 'testing', launchedAt: new Date(Date.now() - 20 * JOUR), goal: `Lot ${numero}` }).returning();
  return b!.id;
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus' }, { id: I.wsB!, name: 'Espace B', plan: 'plus' }]);
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@lot9.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  const [offre] = await db.insert(schema.offers).values({ workspaceId: I.wsA!, brandId: I.bA!, label: 'Offre de lancement' }).returning();
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.wsA!, brandId: I.bA!, url: 'https://neva.test/p', label: 'Page produit' }).returning();
  scene.offre = offre!.id;
  scene.page = page!.id;
  await db.insert(schema.personas).values([
    { id: I.lea!, brandId: I.bA!, name: 'Léa, 34 ans', description: 'Maman pressée', desires: ['Gagner du temps'], pains: ['Prix'], objections: ['Trop cher'], status: 'validated' },
    { id: I.max!, brandId: I.bA!, name: 'Max', status: 'validated' },
    { id: I.sam!, brandId: I.bA!, name: 'Sam', status: 'proposed' },
    { id: I.zed!, brandId: I.bA2!, name: 'Zed secret', status: 'validated' },
  ]);
  // La référence · Max (6 perdantes) et Sam (4 perdantes), d'après la carte.
  const lm = await lot(1);
  for (let i = 0; i < 6; i++) await adCarte(I.max!, lm, `m${i + 1}`, 'loser');
  for (let i = 0; i < 4; i++) await adCarte(I.sam!, lm, `s${i + 1}`, 'loser');
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; document.body.innerHTML = ''; });

describe('« Créer une pub » d’un persona · Nouveau projet le présélectionne, le lot le lit', () => {
  it('la fiche Personas pointe « Créer une pub » vers Nouveau projet avec CE persona', async () => {
    comme('uo', MARQUE.A());
    const { d } = await pagePersonas();
    const lien = d.querySelector<HTMLAnchorElement>('a[data-creer-pour]')!;
    const affiche = lien.getAttribute('data-creer-pour')!;
    expect(lien.getAttribute('href')).toBe(`/studio/projets/nouveau?type=ads&persona=${affiche}`);
  });

  it('Nouveau projet · « Pour qui ? » arrive sur Léa · un persona d’une autre marque est ignoré, et c’est dit', async () => {
    comme('uo', MARQUE.A());
    const { d } = await pageNouveau({ type: 'ads', persona: I.lea! });
    const choix = d.querySelector<HTMLSelectElement>('select[data-champ="persona"]')!;
    const retenu = [...choix.querySelectorAll('option')].find((o) => o.hasAttribute('selected'));
    expect(retenu?.getAttribute('value'), 'le persona du lien n’est pas présélectionné').toBe(I.lea);
    expect(retenu?.textContent).toBe('Léa, 34 ans');

    const autre = await pageNouveau({ type: 'ads', persona: I.zed! });
    const choix2 = autre.d.querySelector<HTMLSelectElement>('select[data-champ="persona"]')!;
    expect([...choix2.querySelectorAll('option')].find((o) => o.hasAttribute('selected'))?.getAttribute('value') ?? '').toBe('');
    expect(autre.texte).not.toContain('Zed secret');
    expect(autre.texte).toContain('Le persona de ce lien n’est pas proposé pour la marque active');
  });

  it('le brief né de cette saisie porte Léa · la variante rattachée (carte « À qualifier ») est lue sous Léa sur la fiche du lot', async () => {
    comme('uo', MARQUE.A());
    // Le brief exactement comme l'assistant le compose (`construireBriefV5`) à partir du choix présélectionné.
    const { d } = await pageNouveau({ type: 'ads', persona: I.lea! });
    const opt = [...d.querySelectorAll('select[data-champ="persona"] option')].find((o) => o.hasAttribute('selected'))!;
    const ref = construireBriefV5({ ...saisieBriefVide(), intention: 'Faire acheter', persona: { id: opt.getAttribute('value')!, label: opt.textContent! } }).personaRef;
    expect(ref).toEqual({ id: I.lea, label: 'Léa, 34 ans' });

    const ctx = contexteDepuisSession(sess('uo'), [I.bA!, I.bA2!], [], 'st_lot9');
    const p = await projetAvecBrief(db, { workspaceId: I.wsA!, brandId: I.bA!, userId: I.uo!, titre: 'Pour Léa', contenu: contenuImages(briefCanonique({ personaRef: ref })) });
    scene.projet = p.projectId;
    const job = await lancerLot(db, ctx, p.projectId, KEYFRAMES(1));
    await executer(db, job);
    const [assetId] = Object.values(await sortiesDuJob(db, job));
    const v = await creerVariante(ctx, { assetId: assetId! });
    if (!v.ok) throw new Error(v.code);
    const l = await rattacherVarianteAuTest(ctx, { variantId: v.variante.id, saisie: saisieTest() });
    if (!l.ok) throw new Error(l.code);
    scene.adStudio = l.lien.adsmapAdId;
    // Le rattachement existant range l'ad sous le persona provisoire · rien n'est recopié du brief.
    const [chemin] = await db.select({ nom: schema.personas.name }).from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id)).innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id)).innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(eq(schema.ads.id, scene.adStudio));
    expect(chemin!.nom).toBe('À qualifier');
    scene.lotStudio = await lot(2);
    await db.update(schema.ads).set({ batchId: scene.lotStudio, status: 'live', offerId: scene.offre, landingPageId: scene.page }).where(eq(schema.ads.id, scene.adStudio));
    await db.insert(schema.verdicts).values({ adId: scene.adStudio, workspaceId: I.wsA!, computed: 'winner', comparable: true, metricsAgg: { reason: 'Moteur', impressions: 20000 } });

    const { d: fiche } = await pageLot(scene.lotStudio);
    const bloc = fiche.querySelector('[aria-label="Pour qui · les personas du lot"]')!;
    const ligne = bloc.querySelector(`[data-persona-id="${I.lea}"]`);
    expect(ligne, 'la variante n’est pas lue sous le persona du brief').not.toBeNull();
    expect(ligne!.textContent).toContain('Léa · d’après le brief du projet');
  }, 180_000);
});

describe('la lecture par persona · muette sous le seuil, et elle le dit · présente au-dessus, avec l’intervalle', () => {
  it('Léa n’a qu’une variante tranchée · rien ne parle, la fiche du lot et la fiche persona le disent', async () => {
    comme('uo', MARQUE.A());
    const { d } = await pageLot(scene.lotStudio);
    const bloc = d.querySelector('[aria-label="Pour qui · les personas du lot"]')!;
    expect(bloc.getAttribute('data-lecture-personas')).toBe('silence');
    expect(bloc.querySelector(`[data-groupe-persona="${I.lea}"]`)!.getAttribute('data-lecture')).toBe('effectif');
    expect(bloc.textContent).toContain(`1 variante tranchée · il en faut ${MIN_VERDICTS_PERSONA} pour qu’un persona ait le droit de parler.`);
    expect(bloc.textContent).toContain('Sur toute la marque · Aucun persona ne se détache du reste de la marque · le silence est la conclusion la plus fréquente');
    expect(bloc.textContent).toContain('Règle · au moins 4 variantes tranchées au protocole pour un persona');
    const { hote, fin } = await ficheMontee('Léa');
    expect(hote.querySelector('[data-tests-persona]')!.textContent).toBe('1 test · 1 lot');
    expect(hote.querySelector('[data-lecture-persona]')!.getAttribute('data-lecture-persona')).toBe('effectif');
    await fin();
  });

  it('cinq gagnantes de plus pour Léa (carte) · 6 sur 6 contre 0 sur 10 · « Au-dessus de la marque », les deux intervalles écrits', async () => {
    scene.lotLea = await lot(3);
    for (let i = 0; i < 5; i++) await adCarte(I.lea!, scene.lotLea, `l${i + 1}`, 'winner');
    comme('uo', MARQUE.A());
    const { d } = await pageLot(scene.lotStudio);
    const bloc = d.querySelector('[aria-label="Pour qui · les personas du lot"]')!;
    expect(bloc.getAttribute('data-lecture-personas')).toBe('parle');
    const g = bloc.querySelector(`[data-groupe-persona="${I.lea}"]`)!;
    expect(g.getAttribute('data-lecture')).toBe('au_dessus');
    expect(g.textContent).toMatch(/Au-dessus de la marque6 gagnantes sur 6 variantes tranchées \(\d+ % à 100 %\) · nettement au-dessus du reste de la marque, 0 sur 10 \(0 % à \d+ %\)\./);
    // Max (0 sur 6) se détache aussi, vers le bas, contre 6 sur 10 · ce n'est pas un persona du lot, il n'a pas de ligne ici.
    expect(bloc.textContent).toContain('Sur toute la marque · Léa au-dessus · Max en dessous du reste de la marque, intervalles disjoints au niveau 0,95.');
    expect(bloc.querySelector(`[data-groupe-persona="${I.max}"]`)).toBeNull();
  });
});

describe('modifier un persona · relu partout, rang respecté', () => {
  it('par la VRAIE fiche montée · « Modifier » · nom, segment, rang n°1, désirs · la base change, la fiche, le brief et le lot le relisent', async () => {
    comme('uo', MARQUE.A());
    const { hote, fin } = await ficheMontee('Léa');
    const modifier = hote.querySelector<HTMLButtonElement>('[data-geste-persona="modifier"]')!;
    expect(modifier.style.minHeight).toBe('44px');
    await act(async () => { modifier.click(); });
    const form = document.querySelector<HTMLFormElement>(`form[data-modifier-persona="${I.lea}"]`)!;
    expect(form.querySelector<HTMLInputElement>('input[name="nom"]')!.value).toBe('Léa, 34 ans');
    expect(form.querySelector<HTMLTextAreaElement>('textarea[name="desirs"]')!.value).toBe('Gagner du temps');
    form.querySelector<HTMLInputElement>('input[name="nom"]')!.value = 'Léa, 35 ans';
    form.querySelector<HTMLInputElement>('input[name="segment"]')!.value = 'Jeunes parents';
    form.querySelector<HTMLSelectElement>('select[name="rang"]')!.value = '1';
    form.querySelector<HTMLTextAreaElement>('textarea[name="desirs"]')!.value = 'Gagner du temps\nDormir enfin';
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    for (let i = 0; i < 50 && (await persona(I.lea!)).name !== 'Léa, 35 ans'; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await fin();

    expect(await persona(I.lea!)).toMatchObject({ name: 'Léa, 35 ans', segment: 'Jeunes parents', rank: 1, desires: ['Gagner du temps', 'Dormir enfin'], pains: ['Prix'], objections: ['Trop cher'] });

    const fiche = await pagePersonas();
    expect(fiche.d.querySelector('h2')?.textContent, 'la fiche s’ouvre sur le persona n°1').toBe('Léa, 35 ans');
    expect(fiche.d.querySelector('[data-persona-segment]')?.textContent).toBe('Jeunes parents');
    expect(fiche.d.querySelector('[data-persona-rang]')?.textContent).toBe('Persona n°1');
    expect(fiche.texte).toContain('Dormir enfin');
    const options = (await pageNouveau({ type: 'ads', angle: 'Brief ouvert' })).d.querySelectorAll('select[data-champ="persona"] option');
    expect([...options].map((o) => o.textContent)[1], 'le brief propose le nouveau nom, au rang 1').toBe('Léa, 35 ans');
    expect((await pageLot(scene.lotStudio)).texte).toContain('Léa · d’après le brief du projet');
  });

  it('Max passe n°1 · Léa descend n°2, Sam reste sans rang · l’ordre est le même sur la fiche et dans le brief', async () => {
    comme('uo', MARQUE.A());
    const m = await persona(I.max!);
    expect(await updatePersonaAction({ brandId: I.bA!, id: I.max!, saisie: { nom: m.name, rang: '1' } })).toEqual({ ok: true });
    expect((await persona(I.max!)).rank).toBe(1);
    expect((await persona(I.lea!)).rank).toBe(2);
    expect((await persona(I.sam!)).rank).toBeNull();
    const puces = [...(await pagePersonas()).d.querySelectorAll('[aria-label="Persona"] button')].map((b) => b.textContent);
    expect(puces.slice(0, 2)).toEqual(['Mn°1MaxValidé', 'Ln°2LéaValidé']);
    const options = [...(await pageNouveau({ type: 'ads', angle: 'Brief ouvert' })).d.querySelectorAll('select[data-champ="persona"] option')].map((o) => o.textContent);
    expect(options.slice(1, 3)).toEqual(['Max', 'Léa, 35 ans']);
    // « Sans rang » · Léa sort du classement, rien ne reste en double ni en trou.
    expect(await updatePersonaAction({ brandId: I.bA!, id: I.max!, saisie: { nom: m.name, rang: '' } })).toEqual({ ok: true });
    expect([(await persona(I.max!)).rank, (await persona(I.lea!)).rank]).toEqual([null, 1]);
  });

  it('une saisie invalide · refus champ par champ, rien d’écrit', async () => {
    comme('uo', MARQUE.A());
    const avant = await photoPersonas();
    const r = await updatePersonaAction({ brandId: I.bA!, id: I.lea!, saisie: { nom: 'À qualifier', rang: '0' } });
    expect('erreurs' in r && r.erreurs!.map((e) => e.champ).sort()).toEqual(['nom', 'rang']);
    expect(await photoPersonas()).toBe(avant);
  });

  it('« Valider ce persona » sur Sam (proposé) · `validateNodeAction` existant, par la vraie fiche montée', async () => {
    comme('uo', MARQUE.A());
    const { hote, fin } = await ficheMontee('Sam');
    const valider = hote.querySelector<HTMLButtonElement>('[data-geste-persona="valider"]')!;
    expect(valider.textContent).toContain('Valider ce persona');
    await act(async () => { valider.click(); });
    for (let i = 0; i < 50 && (await persona(I.sam!)).status !== 'validated'; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await fin();
    expect((await persona(I.sam!)).status).toBe('validated');
  });
});

describe('autre marque, autre espace, membre · refus sans fuite, rien d’écrit', () => {
  it('un membre · refus du rôle · la fiche n’est pas servie', async () => {
    comme('um', MARQUE.A());
    const avant = await photoPersonas();
    expect(await updatePersonaAction({ brandId: I.bA!, id: I.lea!, saisie: { nom: 'Pirate' } })).toEqual({ error: GUARD.role({ needRole: 'admin' }) });
    await expect(pagePersonas()).rejects.toThrow(/redirect \/dashboard/);
    expect(await photoPersonas()).toBe(avant);
  });
  it('le persona d’une autre marque du même espace, ou une marque d’un autre espace · la même phrase, rien d’écrit', async () => {
    const avant = await photoPersonas();
    comme('uo', MARQUE.A());
    expect(await updatePersonaAction({ brandId: I.bA!, id: I.zed!, saisie: { nom: 'Pirate' } })).toEqual({ error: REFUS_PERSONA_INTROUVABLE });
    expect(await updatePersonaAction({ brandId: I.bA2!, id: I.lea!, saisie: { nom: 'Pirate' } })).toEqual({ error: REFUS_PERSONA_INTROUVABLE });
    comme('ub', MARQUE.B());
    expect(await updatePersonaAction({ brandId: I.bA!, id: I.lea!, saisie: { nom: 'Pirate' } })).toEqual({ error: REFUS_PERSONA_INTROUVABLE });
    await expect(pagePersonas(I.bA!)).rejects.toThrow('notFound');
    expect(await photoPersonas()).toBe(avant);
  });
  it('la fiche d’un lot depuis une autre marque active · introuvable · la fiche Personas d’une marque non active ne lit pas ses tests et dit pourquoi', async () => {
    comme('uo', MARQUE.A2());
    await expect(pageLot(scene.lotStudio)).rejects.toThrow('notFound');
    const { d, texte } = await pagePersonas(I.bA!);
    expect(d.querySelector('[data-lecture-persona]')).toBeNull();
    expect(texte).toContain('Les tests se lisent dans la marque active · ouvre d’abord cette marque');
    expect(texte).not.toContain('Zed secret');
    const zed = await pagePersonas(I.bA2!);
    expect(zed.texte).not.toContain('Léa');
    expect(await db.select().from(schema.personas).where(and(eq(schema.personas.brandId, I.bA2!), eq(schema.personas.name, 'Pirate')))).toEqual([]);
  });
});
