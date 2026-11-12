// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 2 · itérer en CHOISISSANT la variable.
 *
 * Base RÉELLE (pglite + migrations), actions RÉELLES, vues RÉELLES montées dans
 * le DOM (pages serveur `studio/iterer`, `adsmap/lots`, fiche projet). On lit
 * ce qu'on VOIT et ce qui est ÉCRIT :
 *  · choisir une variable admise ⇒ l'itération créée porte CETTE variable et sa
 *    valeur (ad en brouillon, arête de filiation) ;
 *  · une variable non admise est fermée, sa raison écrite à côté, et le serveur
 *    la refuse avec la même phrase ;
 *  · deux variables à la fois sont impossibles (à l'écran comme au serveur) ;
 *  · une pub d'une autre marque est refusée ;
 *  · aucun prix n'est inventé · le devis reste celui du serveur, dans le projet.
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
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/studio/iterer', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.marque ? { value: h.marque } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/studio/iterer', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import {
  iterationDepuisPrompt, lienIterationVariable, lienPreparationIteration, raisonGelee, raisonStructurelle, raisonUsee,
  APRES_CREATION_ITERATION, RAISON_AUTRE_MARQUE, RAISON_HORS_PLAN, RAISON_NON_GAGNANTE, RAISON_UNE_SEULE, VIDE_ITERATION_SANS_GAGNANTE,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { creerIterationChoisieAction } from '../app/actions/adsmap-iterer-variable';
import IterationSpatiale from '../app/(spatial)/sp/studio/iterer/page';
import LotsSpatial from '../app/(spatial)/sp/adsmap/lots/page';
import NouveauProjetSpatial from '../app/(spatial)/sp/studio/projets/nouveau/page';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import { Prompts } from '../spatial/vues/studios/Prompts';
import { SOUS_NAV_STUDIOS } from '../spatial/vues/studios/sous-nav';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const S = { W: '', W2: '', L: '', X: '', projet: '', varianteTestee: '', adProjet: '' };
const proprietaire = (): SessionTest => session(ids, 'ua', { role: 'owner', plan: 'plus' });

/* ───────────────────────────── semis ───────────────────────────── */

async function chaine(brandId: string, titre: string) {
  const [pe] = await db.insert(schema.personas).values({ brandId, name: `Persona ${titre}` }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: titre }).returning();
  return co!.id;
}
async function ad(conceptId: string, code: string, o: Partial<typeof schema.ads.$inferInsert> = {}) {
  const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId, variantCode: code, status: 'done', hypothesis: 'Si on montre la preuve, alors on convertit, parce que la peur tombe.', testedVariable: 'proof', ...o }).returning({ id: schema.ads.id });
  return a!.id;
}
async function verdict(adId: string, validated: 'winner' | 'loser', o: Partial<typeof schema.verdicts.$inferInsert> = {}) {
  await db.insert(schema.verdicts).values({ adId, workspaceId: ids.wsA, computed: validated, validated, status: 'validated', comparable: true, metricsAgg: { roas: 2.4, spend: 120 }, ...o });
}
async function arete(parentAdId: string, childAdId: string, variable: 'opening_visual') {
  await db.insert(schema.iterationEdges).values({ workspaceId: ids.wsA, parentAdId, childAdId, mode: 'more', changedVariable: variable, rationale: 'déjà essayé' });
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'plus', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));

  // Marque A1 · W gagnante prouvée ; W2 gagnante dont la lignée a DÉJÀ changé deux fois le visuel d'ouverture ; L perdante.
  const c1 = await chaine(ids.brandA1, 'Sérum');
  S.W = await ad(c1, 'V1');
  await verdict(S.W, 'winner');
  await db.insert(schema.learnings).values({ workspaceId: ids.wsA, brandId: ids.brandA1, adId: S.W, scope: 'ad', statement: 'La preuve en ouverture convertit mieux.', status: 'validated' });
  const r0 = await ad(c1, 'V2');
  const e1 = await ad(c1, 'V2-i1', { testedVariable: 'opening_visual' });
  S.W2 = await ad(c1, 'V2-i2', { testedVariable: 'opening_visual' });
  await arete(r0, e1, 'opening_visual');
  await arete(e1, S.W2, 'opening_visual');
  await verdict(S.W2, 'winner');
  S.L = await ad(c1, 'V3');
  await verdict(S.L, 'loser', { failedStage: 'click' });
  // Marque A2 · une gagnante prouvée, jamais proposée sous A1.
  const c2 = await chaine(ids.brandA2, 'Crème secrète');
  S.X = await ad(c2, 'X1');
  await verdict(S.X, 'winner');

  // Un projet Studios de A1 · une variante rattachée à un test Adsmap (chemin réel), pour le couloir Itération.
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · lancement' });
  S.projet = p.projectId;
  const j = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, KEYFRAMES(1));
  await executer(db, j);
  const assetId = Object.values(await sortiesDuJob(db, j))[0]!;
  const v = await creerVariante(ctxDe(ids, 'ua'), { assetId });
  if (!v.ok) throw new Error(`variante ${v.code}`);
  S.varianteTestee = v.variante.id;
  const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: S.varianteTestee, saisie: saisieTest() });
  if (!l.ok) throw new Error(l.code);
  S.adProjet = l.lien.adsmapAdId;
}, 180_000);

/* ───────────────────────────── DOM ───────────────────────────── */

let root: Root | null = null;
afterEach(() => { act(() => { root?.unmount(); }); root = null; document.body.innerHTML = ''; h.push.length = 0; });
async function monter(el: ReactElement) {
  document.body.innerHTML = '<div id="app"></div><div id="orn" hidden></div>';
  root = createRoot(document.getElementById('app')!);
  await act(async () => { root!.render(avecSpatial(el)); });
}
async function cliquer(sel: string) {
  const el = document.querySelector<HTMLElement>(sel);
  expect(el, `élément ${sel}`).toBeTruthy();
  await act(async () => { el!.click(); await new Promise((r) => setTimeout(r, 0)); });
}
async function saisir(sel: string, valeur: string) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(sel)!;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur);
  await act(async () => { el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const coche = () => [...document.querySelectorAll('[data-itvar][aria-checked="true"]')].map((b) => b.getAttribute('data-itvar'));
const raisonDe = (v: string) => { const b = document.querySelector(`[data-itvar="${v}"]`)!; return document.getElementById(b.getAttribute('aria-describedby')!)!.textContent; };
const iterer = async (sp: Record<string, string>) => monter(await IterationSpatiale({ searchParams: Promise.resolve(sp) }));
const enfantsDe = async (parent: string) => db.select().from(schema.iterationEdges).where(eq(schema.iterationEdges.parentAdId, parent));
const nbAds = async () => (await db.select({ id: schema.ads.id }).from(schema.ads)).length;
/** Un prix écrit à l'écran · crédits, euros ou dollars précédés d'un nombre. */
const PRIX = /\d[\d\s .,]*\s*(crédits?|€|\$)/i;

/* ───────────────────────────── gardes ───────────────────────────── */

describe('la boucle des lots compte les gagnantes prouvées du plan réel', () => {
  it('« Itérer · 2 itérations conseillées » mène à l’écran Itérer', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    await monter(await LotsSpatial({ searchParams: Promise.resolve({}) }));
    const b = document.querySelector('#orn [data-boucle]');
    expect(b?.textContent, 'bouton de boucle des lots').toBe('Itérer · 2 itérations conseillées');
    expect(b!.getAttribute('href')).toBe('/studio/iterer');
  });
});

describe('un prompt conseillé se lance comme itération, variable présélectionnée', () => {
  it('« Lancer comme itération » ouvre Itérer avec la variable · un prompt sans variable garde le geste fermé, raison écrite', async () => {
    const P = (id: string, variable: 'format' | null) => ({
      id, categorie: 'iterer', titre: `Prompt ${id}`, description: 'd', morceaux: [{ texte: 'texte' }], pastilles: [], requis: 'r', appui: 'a', utiliser: '/studio/projets/nouveau',
      iteration: iterationDepuisPrompt(variable),
    });
    await monter(<Prompts sousNav={SOUS_NAV_STUDIOS} categories={[]} contexte={null} prompts={[P('f', 'format'), P('n', null)]} vide={{ titre: '', texte: '' }} />);
    const liens = [...document.querySelectorAll('[data-lancer-iteration]')];
    expect(liens.map((l) => [l.tagName, l.getAttribute('href'), l.getAttribute('aria-disabled')]), '« Lancer comme itération » des prompts').toEqual([['A', '/studio/iterer?variable=format', null], ['BUTTON', null, 'true']]);
    const ferme = liens[1]!;
    expect(document.getElementById(ferme.getAttribute('aria-describedby')!)!.textContent).toBe('Ce prompt ne vise aucune variable · une itération en change exactement une.');

    // Le lien mène à l'écran Itérer · la variable demandée est cochée à l'étape 2.
    h.session = proprietaire(); h.marque = ids.brandA1;
    act(() => { root?.unmount(); });
    await iterer({ iter: S.W, variable: 'format' });
    await cliquer('#orn [data-geste="continuer"]');
    expect(coche(), 'la variable demandée par le prompt n’est pas cochée').toEqual(['format']);
  });
});

describe('choisir la variable · l’itération créée porte CETTE variable et sa valeur', () => {
  it('étape 2 · admises cochables, fermées avec leur raison écrite, une seule cochée · « Créer » écrit la variable choisie', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    await iterer({ iter: S.W });
    expect([...document.querySelectorAll('[data-itad]')].map((b) => b.getAttribute('data-itad'))).not.toContain(S.X);
    await cliquer('#orn [data-geste="continuer"]');

    // La variable du plan est cochée par défaut.
    expect(coche(), 'la variable du plan n’est pas cochée par défaut').toEqual(['opening_visual']);
    // Fermées · focalisables (`aria-disabled`), raison écrite à côté.
    expect(document.querySelector('[data-itvar="hook"]')!.getAttribute('aria-disabled'), 'variable gelée ouverte à l’écran').toBe('true');
    expect(raisonDe('hook'), 'raison écrite de la variable gelée').toBe(raisonGelee('hook'));
    expect(raisonDe('offer')).toBe(raisonGelee('offer'));
    expect(raisonDe('angle')).toBe(raisonStructurelle('angle'));
    // Cliquer une fermée ne coche rien.
    await cliquer('[data-itvar="hook"]');
    expect(coche(), 'une variable fermée a été cochée au clic').toEqual(['opening_visual']);
    // Une seule à la fois · cocher le format décoche le visuel.
    await cliquer('[data-itvar="format"]');
    expect(coche(), 'deux variables cochées à la fois').toEqual(['format']);
    await cliquer('[data-itvar="length"]');
    await cliquer('[data-itvar="format"]');
    expect(coche()).toEqual(['format']);

    await saisir('[data-champ="valeur"]', 'Vidéo face caméra 9:16');
    const hyp = (document.querySelector('[data-champ="hypothese"]') as HTMLTextAreaElement).value;
    expect(hyp).toContain('le format');
    expect(hyp).toContain('(Vidéo face caméra 9:16)');
    // Aucun prix à l'écran · le devis n'existe que dans le projet, calculé par le serveur.
    expect(document.body.textContent, 'un prix est écrit à l’écran avant le devis serveur').not.toMatch(PRIX);
    expect(document.querySelector('#orn [data-geste="creer-iteration"]')!.textContent, 'le geste ne dit plus qu’il est gratuit').toBe('Créer l’itération · gratuit');

    const avant = await nbAds();
    await cliquer('#orn [data-geste="creer-iteration"]');
    expect(document.querySelector('[data-erreur]')).toBeNull();
    expect(await nbAds()).toBe(avant + 1);

    // En base · la variable CHOISIE, sa valeur, l'hypothèse relue à l'écran, une arête de filiation.
    const [e] = await enfantsDe(S.W);
    expect(e, 'aucune arête de filiation écrite').toBeTruthy();
    expect([e!.changedVariable, e!.mode, e!.stageTargeted], 'arête · variable, mode, étape').toEqual(['format', 'more', 'hook']);
    const [enfant] = await db.select().from(schema.ads).where(eq(schema.ads.id, e!.childAdId));
    expect(enfant!.testedVariable, 'l’itération créée ne porte pas la variable CHOISIE').toBe('format');
    expect(enfant!.variableValue, 'l’itération créée ne porte pas la valeur saisie').toBe('Vidéo face caméra 9:16');
    expect(enfant!.hypothesis, 'l’hypothèse écrite n’est pas celle relue à l’écran').toBe(hyp);
    expect([enfant!.status, enfant!.adType, enfant!.variantCode], 'statut, type, code').toEqual(['draft', 'iteration', 'V1-i1']);

    // L'écran le dit · rien de débité, le devis vient du serveur dans le projet.
    expect(document.querySelector('.ithead h2')!.textContent).toBe('Itération V1-i1 créée');
    expect(document.querySelector('[data-devis="serveur"]')!.textContent).toBe(APRES_CREATION_ITERATION);
    expect(document.body.textContent).not.toMatch(PRIX);
    await cliquer('#orn [data-geste="preparer-iteration"]');
    expect(h.push).toEqual([lienPreparationIteration({ parentAdId: S.W, code: 'V1-i1', variable: 'format', valeur: 'Vidéo face caméra 9:16' })]);

    // La préparation RÉELLE (inchangée) reprend le test parent et porte la variable choisie · aucun prix avant le devis serveur du projet.
    const prep = renderToStaticMarkup(avecSpatial(await NouveauProjetSpatial({ searchParams: Promise.resolve(Object.fromEntries(new URL(h.push[0]!, 'http://x').searchParams)) })));
    const texte = prep.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '’');
    expect(texte).toContain('Itération V1-i1 · on change le format : Vidéo face caméra 9:16');
    expect(texte).toContain('Le brief du test Adsmap gagnant est repris');
    expect(texte).not.toMatch(PRIX);
  });

  it('une variable usée par la lignée est fermée · demandée par l’adresse, la phrase dit pourquoi et le défaut passe à la suivante', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    await iterer({ iter: S.W2, variable: 'opening_visual' });
    await cliquer('#orn [data-geste="continuer"]');
    expect(raisonDe('opening_visual'), 'raison écrite de la variable usée').toBe(raisonUsee('opening_visual', 2));
    expect(document.querySelector('[data-note-variable]')!.textContent).toBe(`Visuel d’ouverture n’est pas admise pour cette pub · ${raisonUsee('opening_visual', 2)}`);
    expect(coche()).toEqual(['format']);
  });

  it('la pub déjà déclinée, demandée par l’adresse, n’est plus reprise · la phrase le dit', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    await iterer({ iter: S.W });
    expect(document.querySelector('[data-note-demande]')!.textContent).toBe(`La pub demandée ne peut pas être itérée ici · ${RAISON_HORS_PLAN}`);
  });
});

describe('le serveur rejoue la règle · même refus qu’à l’écran, rien d’écrit', () => {
  const appel = (o: Partial<{ parentAdId: unknown; variable: unknown; valeur: unknown; hypothese: unknown }>) =>
    creerIterationChoisieAction({ parentAdId: S.W2, variable: 'format', valeur: '15 secondes', hypothese: 'Si on raccourcit, alors on retient mieux, parce que…', ...o });

  it('variable fermée, deux variables, autre marque, perdante, déjà déclinée, rôle en lecture · refusés, aucune ad créée', async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    const avant = await nbAds();
    const refus = async (o: Parameters<typeof appel>[0]) => { const r = await appel(o); return r.ok ? `CRÉÉE (${r.variable})` : r.error; };
    expect(await refus({ variable: 'hook' }), 'variable gelée acceptée par le serveur').toBe(raisonGelee('hook'));
    expect(await refus({ variable: 'opening_visual' }), 'variable usée acceptée par le serveur').toBe(raisonUsee('opening_visual', 2));
    expect(await refus({ variable: ['format', 'length'] }), 'deux variables (liste) acceptées').toBe(RAISON_UNE_SEULE);
    expect(await refus({ variable: 'format,length' }), 'deux variables (texte) acceptées').toBe(RAISON_UNE_SEULE);
    expect(await refus({ parentAdId: S.X }), 'pub d’une autre marque non refusée comme telle').toBe(RAISON_AUTRE_MARQUE);
    expect(await refus({ parentAdId: S.L }), 'perdante acceptée').toBe(RAISON_NON_GAGNANTE);
    expect(await refus({ parentAdId: S.W }), 'gagnante déjà déclinée acceptée').toBe(RAISON_HORS_PLAN);
    h.session = session(ids, 'uv', { plan: 'plus' });
    expect(await refus({}), 'rôle en lecture accepté').toMatch(/rôle/);
    expect(await nbAds()).toBe(avant);
    expect(await enfantsDe(S.W2)).toEqual([]);
  });

  it('sous sa propre marque, la gagnante de A2 est proposée et itérable · la marque active borne tout', async () => {
    h.session = proprietaire(); h.marque = ids.brandA2;
    await iterer({});
    expect([...document.querySelectorAll('[data-itad]')].map((b) => b.getAttribute('data-itad'))).toEqual([S.X]);
    const r = await creerIterationChoisieAction({ parentAdId: S.X, variable: 'cta', valeur: '« Essaie-le 30 jours »', hypothese: 'Si l’appel rassure, alors on clique plus, parce que le risque tombe.' });
    expect(r.ok ? [r.variable, r.valeur] : r.error, 'la gagnante de la marque active refusée').toEqual(['cta', '« Essaie-le 30 jours »']);
    const [e] = await enfantsDe(S.X);
    expect([e?.changedVariable, e?.stageTargeted], 'arête · variable et étape').toEqual(['cta', 'click']);
  });
});

describe('le couloir Itération de la fiche projet', () => {
  const canvas = async () => {
    h.session = proprietaire(); h.marque = ids.brandA1;
    const r = await chargerProjet(h.session as never, S.projet);
    if (!r.ok) throw new Error(JSON.stringify(r.raison));
    return renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial="canvas" />));
  };
  const couloir = (html: string) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    return [...t.content.querySelectorAll('.lane')].find((l) => l.querySelector('.lh')?.textContent === 'Itération')!;
  };

  it('sans gagnante arbitrée · le couloir dit pourquoi ; arbitrée gagnante · « Itérer · choisir la variable » ouvre Itérer, pub présélectionnée', async () => {
    expect(couloir(await canvas()).querySelector('[data-vide-couloir="iteration"]')?.textContent, 'le couloir vide ne dit pas pourquoi').toBe(VIDE_ITERATION_SANS_GAGNANTE);

    await verdict(S.adProjet, 'winner');
    const l = couloir(await canvas());
    const n = l.querySelector(`[data-noeud="iterer:${S.adProjet}"]`);
    expect(n, 'aucun nœud « À décliner » pour la gagnante du projet').toBeTruthy();
    expect(n!.querySelector('strong')!.textContent).toMatch(/^À décliner · /);
    const a = n!.querySelector('a.btn')!;
    expect(a.textContent).toBe('Itérer · choisir la variable');
    expect(a.getAttribute('href')).toBe(lienIterationVariable({ adId: S.adProjet }));
  });
});
