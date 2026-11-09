// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { SessionTest } from './studios-semis';

/**
 * Lot 9 bis V5 · offres et allégations de la marque, choisies au brief, lues
 * sur le lot · sur une VRAIE base (pglite, migrations réelles jusqu'à 0072),
 * avec les VRAIES actions et les VRAIES pages Spatiales rendues (et montées) ·
 * on lit le HTML et la base, jamais la présence d'un appel.
 *
 *  · créer et modifier une offre, une allégation, par la VRAIE fiche montée ·
 *    relues sur la fiche et dans l'assistant (Nouveau projet) ;
 *  · une allégation « à prouver » porte son signal, sur la fiche ET dans
 *    l'assistant · « prouvée » sans preuve est refusée, rien d'écrit ;
 *  · « Créer une pub » d'une offre ouvre Nouveau projet avec CETTE offre ·
 *    l'assistant monté crée le projet (action réelle) · son brief porte le fait
 *    d'offre · la variante issue de ce brief est lue sous cette offre sur la
 *    fiche du lot ;
 *  · la lecture par offre se tait sous le seuil, et le dit · au-dessus, elle
 *    parle avec ses deux intervalles ;
 *  · une autre marque, un autre espace, un membre · refus, rien d'écrit, rien
 *    ne fuit · un brief qui cite l'offre d'une autre marque est refusé.
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
  for (const k of ['wsA', 'wsB', 'bA', 'bA2', 'bB', 'uo', 'um', 'ub', 'per', 'secrete']) h.ids[k] = randomUUID();
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
import {
  MIN_VERDICTS_PERSONA, REFUS_ALLEGATION_INTROUVABLE, REFUS_OFFRE_INTROUVABLE, RAISON_REF_HORS_PORTEE, SIGNAL_ALLEGATION_A_PROUVER,
  construireBriefV5, faitOffre, offreDuBrief, saisieBriefVide, texteOffreBrief, type BriefCanonique,
} from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { contexteDepuisSession } from '../lib/studios/garde';
import { creerProjet as creerProjetDepot } from '../lib/studios/depot';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique, contenuImages } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import OffreSpatiale from '../app/(spatial)/sp/brands/[id]/offre/page';
import LotSpatial from '../app/(spatial)/sp/adsmap/lots/[id]/page';
import PreparerProjetPage from '../app/(spatial)/sp/studio/projets/nouveau/page';
import { archiverAllegationAction, archiverOffreAction, enregistrerAllegationAction, enregistrerOffreAction } from '../app/actions/brand-detail';
import { GUARD } from '../lib/guard-error';

const I = h.ids;
const JOUR = 86_400_000;
const scene = { duo: '', livraison: '', secrete: '', allegation: '', projet: '', lotStudio: '', adStudio: '', page: '', autreOffre: '' };

type Qui = 'uo' | 'um' | 'ub';
function sess(qui: Qui): SessionTest {
  return {
    user: { id: I[qui]!, email: `${qui}@lot9bis.test`, name: null }, workspaceId: qui === 'ub' ? I.wsB! : I.wsA!, workspaceName: 'Espace',
    role: qui === 'um' ? 'member' : 'owner', plan: 'plus', equipe: null,
  };
}
const MARQUE = { A: () => ({ id: I.bA!, name: 'Neva' }), A2: () => ({ id: I.bA2!, name: 'Autre' }), B: () => ({ id: I.bB!, name: 'Ailleurs' }) };
function comme(qui: Qui, marque: { id: string; name: string } | null) { h.session = sess(qui); h.marque = marque; }

const visible = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return { d, texte: (d.textContent ?? '').replace(/\s+/g, ' ') }; };
const pageOffre = async (id = I.bA!) => visible(renderToStaticMarkup(avecSpatial(await OffreSpatiale({ params: Promise.resolve({ id }) }))));
const pageLot = async (id: string) => visible(renderToStaticMarkup(avecSpatial(await LotSpatial({ params: Promise.resolve({ id }) }))));
const pageNouveau = async (sp: Record<string, string>) => visible(renderToStaticMarkup(avecSpatial(await PreparerProjetPage({ searchParams: Promise.resolve(sp) }))));
const attendreQue = async (cond: () => Promise<boolean>) => { for (let i = 0; i < 100 && !(await cond()); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };
async function monter(el: ReactElement) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => { racine.render(avecSpatial(el)); });
  return { hote, fin: async () => { await act(async () => { racine.unmount(); }); hote.remove(); } };
}
const ficheMontee = async () => monter(await OffreSpatiale({ params: Promise.resolve({ id: I.bA! }) }));
const saisir = (form: HTMLFormElement, nom: string, valeur: string) => { (form.querySelector(`[name="${nom}"]`) as HTMLInputElement).value = valeur; };
const soumettre = async (form: HTMLFormElement) => { await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
const offres = async () => db.select().from(schema.offers).where(eq(schema.offers.brandId, I.bA!));
const photo = async () => JSON.stringify([
  (await db.select().from(schema.offers)).sort((a, b) => a.id.localeCompare(b.id)),
  (await db.select().from(schema.brandClaims)).sort((a, b) => a.id.localeCompare(b.id)),
]);

/** Une ad de la marque (persona → désir → angle → concept → ad), rangée dans un lot, avec son offre et son verdict. */
async function adDiffusee(offerId: string | null, batchId: string, code: string, verdict: 'winner' | 'loser') {
  const [d] = await db.insert(schema.desires).values({ workspaceId: I.wsA!, personaId: I.per!, label: `D ${code}` }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: I.wsA!, desireId: d!.id, label: `A ${code}`, mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: I.wsA!, angleId: a!.id, title: `Concept ${code}` }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: I.wsA!, conceptId: c!.id, batchId, variantCode: code, status: 'live', testedVariable: 'hook', hypothesis: 'Si…, alors…, parce que…', offerId, landingPageId: scene.page }).returning();
  await db.insert(schema.verdicts).values({ adId: ad!.id, workspaceId: I.wsA!, computed: verdict, comparable: true, metricsAgg: { reason: 'Moteur', impressions: 20000 } });
  return ad!.id;
}
async function lot(numero: number) {
  const [b] = await db.insert(schema.batches).values({ workspaceId: I.wsA!, brandId: I.bA!, number: numero, status: 'testing', launchedAt: new Date(Date.now() - 20 * JOUR), goal: `Lot ${numero}` }).returning();
  return b!.id;
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: I.wsA!, name: 'Espace A', plan: 'plus' }, { id: I.wsB!, name: 'Espace B', plan: 'plus' }]);
  await db.insert(schema.users).values((['uo', 'um', 'ub'] as const).map((q) => ({ id: I[q]!, email: `${q}@lot9bis.test` })));
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: I.wsA!, userId: I.uo!, role: 'owner' }, { workspaceId: I.wsA!, userId: I.um!, role: 'member' }, { workspaceId: I.wsB!, userId: I.ub!, role: 'owner' },
  ]);
  await db.insert(schema.brands).values([
    { id: I.bA!, workspaceId: I.wsA!, name: 'Neva' }, { id: I.bA2!, workspaceId: I.wsA!, name: 'Autre' }, { id: I.bB!, workspaceId: I.wsB!, name: 'Ailleurs' },
  ]);
  await db.insert(schema.personas).values({ id: I.per!, brandId: I.bA!, name: 'Léa', status: 'validated' });
  const [page] = await db.insert(schema.landingPages).values({ workspaceId: I.wsA!, brandId: I.bA!, url: 'https://neva.test/p', label: 'Page produit' }).returning();
  scene.page = page!.id;
  // Une offre d'une AUTRE marque du même espace · elle ne doit jamais apparaître chez Neva.
  const [secrete] = await db.insert(schema.offers).values({ id: I.secrete!, workspaceId: I.wsA!, brandId: I.bA2!, label: 'Offre secrète', kind: 'remise', conditions: '−50 %' }).returning();
  scene.secrete = secrete!.id;
}, 180_000);

afterEach(() => { h.session = null; h.marque = null; document.body.innerHTML = ''; });

describe('créer et modifier une offre, une allégation · par la VRAIE fiche · relues sur la fiche et dans l’assistant', () => {
  it('la fiche vide dit qu’aucune offre n’est enregistrée, et les trois conditions essentielles manquent', async () => {
    comme('uo', MARQUE.A());
    const { d, texte } = await pageOffre();
    expect(d.querySelector('[data-offres="vide"]')).not.toBeNull();
    expect(texte).toContain('Livraison, retours et garantie manquants');
    expect(texte).not.toContain('Offre secrète');
  });

  it('« Nouvelle offre » · la fenêtre part au serveur · la base a la ligne, la fiche la relit avec son type et ses conditions', async () => {
    comme('uo', MARQUE.A());
    const { hote, fin } = await ficheMontee();
    const bouton = hote.querySelector<HTMLButtonElement>('[data-offres="nouvelle"] [data-geste-offre="nouvelle"]')!;
    expect(bouton.style.minHeight).toBe('44px');
    await act(async () => { bouton.click(); });
    const form = document.querySelector<HTMLFormElement>('form[data-fiche-offre="nouvelle"]')!;
    saisir(form, 'intitule', 'Duo sérum');
    saisir(form, 'type', 'remise');
    saisir(form, 'conditions', '−20 % dès 2 achetés');
    await soumettre(form);
    await attendreQue(async () => (await offres()).length === 1);
    await fin();
    const [o] = await offres();
    expect(o).toMatchObject({ label: 'Duo sérum', kind: 'remise', conditions: '−20 % dès 2 achetés', active: true, workspaceId: I.wsA });
    scene.duo = o!.id;
    const { d } = await pageOffre();
    const ligne = d.querySelector(`[data-offre="${scene.duo}"]`)!;
    expect(ligne.textContent).toContain('Duo sérum');
    expect(ligne.textContent).toContain('Remise · −20 % dès 2 achetés');
    expect(ligne.textContent).toContain('Active');
  });

  it('une saisie invalide · refus champ par champ, rien d’écrit', async () => {
    comme('uo', MARQUE.A());
    const avant = await photo();
    const r = await enregistrerOffreAction({ brandId: I.bA!, saisie: { intitule: '', type: 'promo' } });
    expect('erreurs' in r && r.erreurs!.map((e) => e.champ).sort()).toEqual(['intitule', 'type']);
    expect(await photo()).toBe(avant);
  });

  it('« Modifier » · intitulé et conditions changent, relus sur la fiche ET dans l’assistant (Nouveau projet)', async () => {
    comme('uo', MARQUE.A());
    const { hote, fin } = await ficheMontee();
    await act(async () => { hote.querySelector<HTMLButtonElement>(`[data-offre="${scene.duo}"] [data-geste-offre="modifier"]`)!.click(); });
    const form = document.querySelector<HTMLFormElement>('form[data-fiche-offre="modifier"]')!;
    expect((form.querySelector('[name="intitule"]') as HTMLInputElement).value).toBe('Duo sérum');
    saisir(form, 'intitule', 'Duo sérum hiver');
    saisir(form, 'conditions', '−25 % dès 2 achetés');
    await soumettre(form);
    await attendreQue(async () => (await offres())[0]!.label === 'Duo sérum hiver');
    await fin();
    expect((await offres())[0]).toMatchObject({ label: 'Duo sérum hiver', kind: 'remise', conditions: '−25 % dès 2 achetés' });
    expect((await pageOffre()).texte).toContain('Duo sérum hiver');
    const { d } = await pageNouveau({ type: 'ads', angle: 'Brief ouvert' });
    const options = [...d.querySelectorAll('select[data-champ="offre"] option')].map((o) => o.textContent);
    expect(options).toEqual(['Aucune offre', 'Duo sérum hiver · Remise · −25 % dès 2 achetés']);
    // Une seconde offre, par l'action de la fiche · la pastille des conditions manquantes se réduit.
    const r = await enregistrerOffreAction({ brandId: I.bA!, saisie: { intitule: 'Livraison offerte', type: 'livraison', conditions: 'Dès 35 €' } });
    expect('ok' in r).toBe(true);
    scene.livraison = 'ok' in r ? r.id : '';
    expect((await pageOffre()).texte).toContain('Retours et garantie manquants');
  });

  it('une allégation « à prouver » · créée par la fiche montée · signalée sur la fiche ET dans l’assistant', async () => {
    comme('uo', MARQUE.A());
    const { hote, fin } = await ficheMontee();
    await act(async () => { hote.querySelector<HTMLButtonElement>('[data-geste-offre="nouvelle-allegation"]')!.click(); });
    const form = document.querySelector<HTMLFormElement>('form[data-fiche-offre="nouvelle-allegation"]')!;
    saisir(form, 'texte', 'Hydrate 24 h');
    await soumettre(form);
    await attendreQue(async () => (await db.select().from(schema.brandClaims).where(eq(schema.brandClaims.brandId, I.bA!))).length === 1);
    await fin();
    const [a] = await db.select().from(schema.brandClaims).where(eq(schema.brandClaims.brandId, I.bA!));
    expect(a).toMatchObject({ text: 'Hydrate 24 h', proof: null, status: 'a_prouver', archivedAt: null });
    scene.allegation = a!.id;
    const fiche = (await pageOffre()).d.querySelector(`[data-allegation="${scene.allegation}"]`)!;
    expect(fiche.getAttribute('data-statut')).toBe('a_prouver');
    expect(fiche.querySelector('[data-signal-allegation]')!.textContent).toBe(SIGNAL_ALLEGATION_A_PROUVER);
    const assistant = (await pageNouveau({ type: 'ads', angle: 'Brief ouvert' })).d.querySelector(`[data-allegations-assistant] [data-allegation="${scene.allegation}"]`)!;
    expect(assistant.textContent).toContain('Hydrate 24 h');
    expect(assistant.querySelector('[data-signal-allegation]')!.textContent).toBe(SIGNAL_ALLEGATION_A_PROUVER);
  });

  it('« prouvée » sans preuve · refusée, rien d’écrit · avec sa preuve · « Prouvée », le signal disparaît partout', async () => {
    comme('uo', MARQUE.A());
    const avant = await photo();
    const r = await enregistrerAllegationAction({ brandId: I.bA!, id: scene.allegation, saisie: { texte: 'Hydrate 24 h', preuve: '', statut: 'prouvee' } });
    expect(r).toEqual({ error: 'Une allégation prouvée cite sa preuve ou sa source · sans elle, elle reste « à prouver ».', erreurs: [{ champ: 'preuve', raison: 'Une allégation prouvée cite sa preuve ou sa source · sans elle, elle reste « à prouver ».' }] });
    expect(await photo()).toBe(avant);
    expect(await enregistrerAllegationAction({ brandId: I.bA!, id: scene.allegation, saisie: { texte: 'Hydrate 24 h', preuve: 'Étude Dermscan 2025', statut: 'prouvee' } })).toEqual({ ok: true, id: scene.allegation });
    const fiche = (await pageOffre()).d.querySelector(`[data-allegation="${scene.allegation}"]`)!;
    expect(fiche.getAttribute('data-statut')).toBe('prouvee');
    expect(fiche.textContent).toContain('Preuve · Étude Dermscan 2025');
    expect(fiche.querySelector('[data-signal-allegation]')).toBeNull();
    const assistant = (await pageNouveau({ type: 'ads', angle: 'Brief ouvert' })).d.querySelector(`[data-allegation="${scene.allegation}"]`)!;
    expect(assistant.getAttribute('data-statut')).toBe('prouvee');
    expect(assistant.querySelector('[data-signal-allegation]')).toBeNull();
  });
});

describe('« Créer une pub » d’une offre · Nouveau projet la présélectionne · le brief la porte · le lot la lit', () => {
  it('la fiche pointe « Créer une pub » vers Nouveau projet avec CETTE offre', async () => {
    comme('uo', MARQUE.A());
    const { d } = await pageOffre();
    // L'adresse écrite en clair · la comparer au constructeur lui-même ne garderait rien (mutation M15).
    expect(d.querySelector(`a[data-creer-avec-offre="${scene.duo}"]`)!.getAttribute('href'), '« Créer une pub » ne transporte pas l’offre').toBe(`/studio/projets/nouveau?type=ads&offre=${scene.duo}`);
  });

  it('Nouveau projet · « Quelle offre ? » arrive sur l’offre · l’offre d’une autre marque est ignorée, et c’est dit, sans fuite', async () => {
    comme('uo', MARQUE.A());
    const { d } = await pageNouveau({ type: 'ads', offre: scene.duo });
    const retenue = [...d.querySelectorAll('select[data-champ="offre"] option')].find((o) => o.hasAttribute('selected'));
    expect(retenue?.getAttribute('value'), 'l’offre du lien n’est pas présélectionnée').toBe(scene.duo);
    expect(d.querySelector('[data-offre-brief]')!.textContent).toContain('Offre de la marque · Duo sérum hiver · Remise · −25 % dès 2 achetés');
    const autre = await pageNouveau({ type: 'ads', offre: scene.secrete });
    expect([...autre.d.querySelectorAll('select[data-champ="offre"] option')].find((o) => o.hasAttribute('selected'))?.getAttribute('value') ?? '').toBe('');
    expect(autre.texte).not.toContain('Offre secrète');
    expect(autre.texte).toContain('L’offre de ce lien n’est pas proposée pour la marque active');
  });

  it('l’assistant MONTÉ crée le projet (action réelle) · son brief porte le fait d’offre · la variante issue de ce brief est lue sous l’offre sur le lot', async () => {
    comme('uo', MARQUE.A());
    // La barre d'action de l'assistant se rend dans l'ornement de la coquille (`#orn`), comme à l'écran.
    const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
    const { hote, fin } = await monter(await PreparerProjetPage({ searchParams: Promise.resolve({ type: 'ads', offre: scene.duo }) }));
    const intention = hote.querySelector<HTMLTextAreaElement>('[data-champ="intention"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(intention, 'Vendre le duo cet hiver');
      intention.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-bouton="creer-projet"]')!.click(); });
    const projets = () => db.select().from(schema.studioProjects).where(eq(schema.studioProjects.brandId, I.bA!));
    await attendreQue(async () => (await projets()).length === 1);
    await fin();
    const [p] = await projets();
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, p!.id));
    const brief = (v!.content as { brief: BriefCanonique }).brief;
    expect(offreDuBrief(brief), 'le brief créé ne porte pas l’offre choisie').toEqual({ id: scene.duo, texte: 'Offre de la marque · Duo sérum hiver · Remise · −25 % dès 2 achetés' });
    expect(brief.facts.find((f) => f.id === `offre.${scene.duo}`)).toMatchObject({ kind: 'declared', sourceIds: [] });

    // La production · un projet d'images dont le brief porte CE fait d'offre, une variante rattachée au test (sans offre côté test).
    const ctx = contexteDepuisSession(sess('uo'), [I.bA!, I.bA2!], [], 'st_lot9bis');
    const base = briefCanonique() as unknown as BriefCanonique;
    const pr = await projetAvecBrief(db, { workspaceId: I.wsA!, brandId: I.bA!, userId: I.uo!, titre: 'Duo hiver', contenu: contenuImages(briefCanonique({ facts: [...base.facts, faitOffre(offreDuBrief(brief)!)] })) });
    scene.projet = pr.projectId;
    const job = await lancerLot(db, ctx, pr.projectId, KEYFRAMES(1));
    await executer(db, job);
    const [assetId] = Object.values(await sortiesDuJob(db, job));
    const va = await creerVariante(ctx, { assetId: assetId! });
    if (!va.ok) throw new Error(va.code);
    const l = await rattacherVarianteAuTest(ctx, { variantId: va.variante.id, saisie: saisieTest() });
    if (!l.ok) throw new Error(l.code);
    scene.adStudio = l.lien.adsmapAdId;
    // Rien n'est recopié du brief sur l'ad · le test ne nomme aucune offre.
    expect((await db.select({ o: schema.ads.offerId }).from(schema.ads).where(eq(schema.ads.id, scene.adStudio)))[0]!.o).toBeNull();
    // Rangée dans un lot en composition · pas encore diffusée (une ad diffusée porte son offre, contrainte de la base).
    scene.lotStudio = await lot(2);
    await db.update(schema.ads).set({ batchId: scene.lotStudio }).where(eq(schema.ads.id, scene.adStudio));

    const { d } = await pageLot(scene.lotStudio);
    const bloc = d.querySelector('[aria-label="Quelle offre · les offres du lot"]')!;
    const ligne = bloc.querySelector(`[data-offre-id="${scene.duo}"]`);
    expect(ligne, 'la variante n’est pas lue sous l’offre du brief').not.toBeNull();
    expect(ligne!.textContent).toContain('Duo sérum hiver · d’après le brief du projet');
  }, 180_000);

  it('diffusé avec une AUTRE offre que celle du brief · aucune n’est retenue, l’écran dit les deux · avec la même · d’accord', async () => {
    comme('uo', MARQUE.A());
    await db.update(schema.ads).set({ status: 'live', offerId: scene.livraison, landingPageId: scene.page }).where(eq(schema.ads.id, scene.adStudio));
    const { d } = await pageLot(scene.lotStudio);
    const ligne = d.querySelector('[aria-label="Quelle offre · les offres du lot"] [data-offre-variante]')!;
    expect(ligne.getAttribute('data-offre-id')).toBe('');
    expect(ligne.textContent).toContain('Offre à trancher · le test diffuse « Livraison offerte », le brief du projet « Duo sérum hiver »');
    await db.update(schema.ads).set({ offerId: scene.duo }).where(eq(schema.ads.id, scene.adStudio));
    await db.insert(schema.verdicts).values({ adId: scene.adStudio, workspaceId: I.wsA!, computed: 'winner', comparable: true, metricsAgg: { reason: 'Moteur', impressions: 20000 } });
    const accord = (await pageLot(scene.lotStudio)).d.querySelector(`[data-offre-id="${scene.duo}"]`)!;
    expect(accord.textContent).toContain('Duo sérum hiver · test et brief d’accord');
  });
});

describe('la lecture par offre · muette sous le seuil, et elle le dit · présente au-dessus', () => {
  it('une variante tranchée sous l’offre · rien ne parle, la fiche du lot le dit', async () => {
    comme('uo', MARQUE.A());
    const { d } = await pageLot(scene.lotStudio);
    const bloc = d.querySelector('[aria-label="Quelle offre · les offres du lot"]')!;
    expect(bloc.getAttribute('data-lecture-offres')).toBe('silence');
    expect(bloc.querySelector(`[data-groupe-offre="${scene.duo}"]`)!.getAttribute('data-lecture')).toBe('effectif');
    expect(bloc.textContent).toContain(`1 variante tranchée · il en faut ${MIN_VERDICTS_PERSONA} pour qu’une offre ait le droit de parler.`);
    expect(bloc.textContent).toContain('Sur toute la marque · Aucune offre n’a encore 4 variantes tranchées · la lecture par offre se tait, faute d’effectif.');
    expect(bloc.textContent).toContain('Règle · au moins 4 variantes tranchées au protocole pour une offre');
  });

  it('cinq gagnantes de plus sous le duo, dix perdantes sous la livraison · « Au-dessus de la marque », les deux intervalles écrits', async () => {
    const l3 = await lot(3);
    for (let i = 0; i < 5; i++) await adDiffusee(scene.duo, l3, `d${i + 1}`, 'winner');
    for (let i = 0; i < 10; i++) await adDiffusee(scene.livraison, l3, `l${i + 1}`, 'loser');
    comme('uo', MARQUE.A());
    const bloc = (await pageLot(scene.lotStudio)).d.querySelector('[aria-label="Quelle offre · les offres du lot"]')!;
    expect(bloc.getAttribute('data-lecture-offres')).toBe('parle');
    const g = bloc.querySelector(`[data-groupe-offre="${scene.duo}"]`)!;
    expect(g.getAttribute('data-lecture')).toBe('au_dessus');
    expect(g.textContent).toMatch(/Au-dessus de la marque6 gagnantes sur 6 variantes tranchées \(\d+ % à 100 %\) · nettement au-dessus du reste de la marque, 0 sur 10 \(0 % à \d+ %\)\./);
    expect(bloc.textContent).toContain('Sur toute la marque · Duo sérum hiver au-dessus · Livraison offerte en dessous du reste de la marque, intervalles disjoints au niveau 0,95.');
    // La livraison n'est pas une offre du lot 2 · elle n'a pas de ligne ici.
    expect(bloc.querySelector(`[data-groupe-offre="${scene.livraison}"]`)).toBeNull();
  });

  it('archiver une offre · plus proposée au brief, toujours lue sur le lot · réactiver la rend', async () => {
    comme('uo', MARQUE.A());
    expect(await archiverOffreAction({ brandId: I.bA!, id: scene.duo, archive: true })).toEqual({ ok: true, id: scene.duo });
    expect((await offres()).find((o) => o.id === scene.duo)!.active).toBe(false);
    const options = [...(await pageNouveau({ type: 'ads', angle: 'Brief ouvert' })).d.querySelectorAll('select[data-champ="offre"] option')].map((o) => o.getAttribute('value'));
    expect(options).not.toContain(scene.duo);
    expect((await pageOffre()).d.querySelector(`[data-offre="${scene.duo}"]`)!.textContent).toContain('Archivée');
    expect((await pageLot(scene.lotStudio)).texte).toContain('Duo sérum hiver · test et brief d’accord');
    expect(await archiverOffreAction({ brandId: I.bA!, id: scene.duo, archive: false })).toEqual({ ok: true, id: scene.duo });
    expect(await archiverAllegationAction({ brandId: I.bA!, id: scene.allegation, archive: true })).toEqual({ ok: true, id: scene.allegation });
    expect((await pageNouveau({ type: 'ads', angle: 'Brief ouvert' })).d.querySelector(`[data-allegation="${scene.allegation}"]`)).toBeNull();
    expect(await archiverAllegationAction({ brandId: I.bA!, id: scene.allegation, archive: false })).toEqual({ ok: true, id: scene.allegation });
  });
});

describe('autre marque, autre espace, membre · refus sans fuite, rien d’écrit', () => {
  it('un membre · refus du rôle · la fiche n’est pas servie', async () => {
    comme('um', MARQUE.A());
    const avant = await photo();
    expect(await enregistrerOffreAction({ brandId: I.bA!, saisie: { intitule: 'Pirate', type: 'remise' } })).toEqual({ error: GUARD.role({ needRole: 'admin' }) });
    expect(await archiverAllegationAction({ brandId: I.bA!, id: scene.allegation, archive: true })).toEqual({ error: GUARD.role({ needRole: 'admin' }) });
    await expect(pageOffre()).rejects.toThrow(/redirect \/dashboard/);
    expect(await photo()).toBe(avant);
  });

  it('l’offre d’une autre marque du même espace, une marque d’un autre espace · la même phrase, rien d’écrit', async () => {
    const avant = await photo();
    comme('uo', MARQUE.A());
    expect(await enregistrerOffreAction({ brandId: I.bA!, id: scene.secrete, saisie: { intitule: 'Pirate', type: 'remise' } })).toEqual({ error: REFUS_OFFRE_INTROUVABLE });
    expect(await archiverOffreAction({ brandId: I.bA!, id: scene.secrete, archive: true })).toEqual({ error: REFUS_OFFRE_INTROUVABLE });
    expect(await enregistrerAllegationAction({ brandId: I.bA2!, id: scene.allegation, saisie: { texte: 'Pirate' } })).toEqual({ error: REFUS_ALLEGATION_INTROUVABLE });
    comme('ub', MARQUE.B());
    expect(await enregistrerOffreAction({ brandId: I.bA!, id: scene.duo, saisie: { intitule: 'Pirate', type: 'remise' } })).toEqual({ error: REFUS_OFFRE_INTROUVABLE });
    expect(await enregistrerOffreAction({ brandId: I.bA!, saisie: { intitule: 'Pirate', type: 'remise' } })).toEqual({ error: REFUS_OFFRE_INTROUVABLE });
    expect(await enregistrerAllegationAction({ brandId: I.bA!, saisie: { texte: 'Pirate' } })).toEqual({ error: REFUS_ALLEGATION_INTROUVABLE });
    await expect(pageOffre(I.bA!)).rejects.toThrow('notFound');
    expect(await photo()).toBe(avant);
    comme('uo', MARQUE.A2());
    const autre = await pageOffre(I.bA2!);
    expect(autre.texte).toContain('Offre secrète');
    expect(autre.texte).not.toContain('Duo sérum');
    expect(autre.texte).not.toContain('Hydrate 24 h');
  });

  it('un brief qui cite l’offre d’une AUTRE marque · le projet n’est pas créé, même refus que les références Adsmap', async () => {
    const ctx = contexteDepuisSession(sess('uo'), [I.bA!, I.bA2!], [], 'st_lot9bis');
    const brief = construireBriefV5({ ...saisieBriefVide(), intention: 'Pirate', offre: { id: scene.secrete, texte: texteOffreBrief({ intitule: 'Offre secrète', type: 'remise', conditions: null }) } });
    const avant = (await db.select().from(schema.studioProjects)).length;
    const r = await creerProjetDepot(ctx, { brandId: I.bA!, kind: 'ads', title: 'Pirate', contenu: { brief, productRef: null, styleRef: null, characterRefs: {}, shots: { order: [], byId: {} }, document: null, timeline: null } });
    expect(r.ok).toBe(false);
    expect(!r.ok && (r as { violations?: unknown }).violations).toEqual([{ chemin: '/contenu/brief/facts', raison: RAISON_REF_HORS_PORTEE }]);
    expect((await db.select().from(schema.studioProjects)).length).toBe(avant);
    // La même offre, citée pour SA marque · acceptée.
    const ok = await creerProjetDepot(ctx, { brandId: I.bA2!, kind: 'ads', title: 'Sa marque', contenu: { brief, productRef: null, styleRef: null, characterRefs: {}, shots: { order: [], byId: {} }, document: null, timeline: null } });
    expect(ok.ok).toBe(true);
  });

  it('la fiche d’un lot depuis une autre marque active · introuvable', async () => {
    comme('uo', MARQUE.A2());
    await expect(pageLot(scene.lotStudio)).rejects.toThrow('notFound');
    expect(await db.select().from(schema.offers).where(and(eq(schema.offers.brandId, I.bA2!), eq(schema.offers.label, 'Pirate')))).toEqual([]);
  });
});
