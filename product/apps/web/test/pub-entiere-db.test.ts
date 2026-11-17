import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Studios · mode « Pub entière » de bout en bout sur une VRAIE base (pglite +
 * migrations réelles) · le choix fait à la compilation va jusqu'au corps fal
 * EXACT, le devis annonce le prix CATALOGUE du moteur et du paramètre envoyés,
 * la relecture tourne à la génération et son verdict se lit sur le rendu.
 *
 *  · `image.compile` · adaptateur texte SIMULÉ (aucun appel) ;
 *  · fal · fournisseur de PRODUCTION du worker contre un `fetch` injecté qui
 *    rejoue la file (0 $, aucun réseau) · on lit le corps POSTÉ et son adresse ;
 *  · vision (contrôle visuel ET relecture) · VRAI client sous plafond
 *    (`guardedAnthropic`, `adaptateurAnthropicGarde`) contre un faux serveur
 *    Anthropic LOCAL (`connection: close`) · on lit les requêtes REÇUES et les
 *    lignes `ai_spend`.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { db, schema, eq, and } from '@tiktrends/db';
import {
  borneControleVisionParImageMicros, borneMaxAppel, consigneDuContenu, CLE_MARQUEUR_CONTROLE_VISION, promptFal, tarifPubEntiere, moteurRecommande, OPERATION_IMAGE, OPERATION_CONTROLE_VISION, CLE_RELECTURE_JOB,
  type ContenuVersion, type SnapshotJob, type DecisionFournisseur, type StockageStudio, type LigneDevis,
} from '@tiktrends/core';
import { borneControlePubMicros, CONTROLE_MODEL } from '@tiktrends/ai';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour, definirFicheProduitPour } from '../lib/studios/produit/commandes';
import { enregistrerVersion } from '../lib/studios/depot';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import { lireParcoursImagePour, devisImagePour, approuverImagePour, controlerMediaPour } from '../lib/studios/image/parcours';
import { resolveurMediasStudio } from '../lib/studios/prompts/resolveur';
import { semer, session } from './studios-semis';
import { publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, delta, PHOTOS, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import type { BaseStudio } from '../lib/studios/execution/types';
import { MoteurStudio } from '../../workers/src/studios/moteur';
import { DecodeurSharp } from '../../workers/src/studios/decodeur';
import { construireFournisseurFal } from '../../workers/src/studios/fournisseurs';
import { pngSimule } from '../../../packages/integrations/src/studios-simule';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const T = new Date('2026-11-16T10:00:00Z');
const O = { veilleOuverte: true, maintenant: T };
const LECTURE = { releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutCompilationUsd: 0.14 };
const MODELE_TEXTE = 'claude-sonnet-5';
const INSTRUCTION = 'Coureur portant les lunettes et le bandeau, piste au lever du jour, lumière rasante. Aucun texte dans l’image.';
let reponse: (a: AppelModele) => unknown = () => ({});
const texte = adaptateurSimule((a) => reponse(a));
const deps = { adaptateur: texte, environnement: 'test' as const, ...O };
let cat: Catalogue;

function repondreConsigne() {
  reponse = (a) => {
    const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
    return {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: {
        generationInstruction: INSTRUCTION, negativeConstraints: ['Pas de texte dans l’image'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
        referenceBindings: ti.referenceIds.map((id) => (id.startsWith('pph_') ? { referenceId: id, role: 'product', scope: 'product' } : { referenceId: id, role: 'style', scope: 'background' })),
      },
    };
  };
}

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return v!;
};
const jobDe = async (id: string) => (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;

/** Projet de la marque A1 · photo n°5 épinglée, textes du projet posés. */
async function projet(textes: string[], faits: Array<{ claim: string }> = []) {
  const p = await projetStatique(db, ids, cat);
  const v = await courante(p.projectId);
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), p.projectId, O);
  if (!c.ok) throw new Error(c.code);
  const photo5 = c.catalogue.produits.find((x) => x.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const e = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: v.id, productId: cat.produit.id, photoId: photo5, composants: ['lunettes', 'bandeau'] }, O);
  if (!e.ok) throw new Error(JSON.stringify(e));
  const brief = (e.version.content as ContenuVersion).brief as unknown as { facts: unknown[] };
  const changes = [{ op: 'replace' as const, path: '/brief/texts', newValue: textes, reason: 'textes du projet' }];
  if (faits.length) changes.push({ op: 'replace' as const, path: '/brief/facts', newValue: [...brief.facts, ...faits.map((f, i) => ({ id: `produit.pe${i}`, claim: f.claim, sourceIds: [`produit:${cat.produit.id}`], kind: 'declared', confidence: 'high' }))] as never, reason: 'fiche' });
  const w = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: e.version.id, changes });
  if (!w.ok) throw new Error(JSON.stringify(w));
  return { projectId: p.projectId, photo5 };
}

async function retenue(projectId: string, typographie?: 'entiere') {
  repondreConsigne();
  const c = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId, mode: 'generative_scene', ...(typographie ? { typographie } : {}) }, deps);
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  const v = await courante(projectId);
  const r = await retenirConsignePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, runId: c.runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return c;
}

/* ── fal rejoué · l'adresse suit le modèle posté ── */
interface Appel { url: string; methode: string; corps: string | null }
let appels: Appel[] = [];
const REQ = 'c3d4e5f6-0000-4000-8000-00000000e17e';
const PNG = pngSimule([200, 90, 40]);
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = { url: String(url), methode: init?.method ?? 'GET', corps: typeof init?.body === 'string' ? init.body : null };
  appels.push(a);
  if (a.methode === 'POST') { const b = `${a.url}/requests/${REQ}`; return json(200, { request_id: REQ, response_url: b, status_url: `${b}/status`, cancel_url: `${b}/cancel` }); }
  if (a.url.endsWith(`/requests/${REQ}/status`)) return json(200, { status: 'COMPLETED', response_url: a.url.slice(0, -'/status'.length) });
  if (a.url.endsWith(`/requests/${REQ}`)) return json(200, { images: [{ url: 'https://v3.fal.media/files/pe/sortie.png', content_type: 'image/png', width: 8, height: 8 }], description: '' });
  if (a.url.startsWith('https://v3.fal.media/')) return new Response(PNG as unknown as BodyInit, { status: 200, headers: { 'content-length': String(PNG.length) } });
  throw new Error(`appel non prévu ${a.methode} ${a.url}`);
}) as typeof fetch;
class StockageMemoire implements StockageStudio {
  objets = new Map<string, Uint8Array>();
  async deposer(cle: string, octets: Uint8Array) { this.objets.set(cle, new Uint8Array(octets)); }
  async relire(cle: string) { return this.objets.get(cle) ?? null; }
}
const stockage = new StockageMemoire();
const lecteur = { async lire(m: { storageKey: string }) { return stockage.objets.get(m.storageKey) ?? null; } };
const DECISION: Extract<DecisionFournisseur, { ok: true }> = { ok: true, apiKey: 'cle-fal-test:secret', queueUrl: null, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit', animation: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' } };
const horloge = { ms: T.getTime() };
async function executer(jobId: string): Promise<string> {
  const fournisseur = construireFournisseurFal({ base, decision: DECISION, fetch: fetchRejoue, env: { AI_SPEND_CAP_USD: '10' }, stockage: null, horloge: () => new Date(horloge.ms), verifierAdresse: async () => true });
  const m = new MoteurStudio({ base, fournisseur, stockage, decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms) });
  for (let i = 0; i < 20; i++) {
    const s = (await jobDe(jobId)).state;
    if (['completed', 'failed', 'cancelled', 'reconciliation_required'].includes(s)) return s;
    await m.tour();
    horloge.ms += 16_000;
  }
  return (await jobDe(jobId)).state;
}

/* ── faux Anthropic local · contrôle visuel (texte) et relecture (outil relire_la_pub) ── */
let lu: { texteLu: string[]; produitFidele?: boolean; ecartsProduit?: string[]; texteLisible?: boolean; problemesLisibilite?: string[] } = { texteLu: [] };
let recus: Array<{ model: string; tools?: Array<{ name: string }>; messages: Array<{ content: Array<{ type: string }> }> }> = [];
let srv: Server;
let urlSrv = '';
const env = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };
function sortieVision(corps: string) {
  const sortieId = /sta_[0-9a-f-]{36}/.exec(corps)?.[0] ?? 'sta_inconnu';
  return JSON.stringify({ status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { verdict: 'passed', issues: [], unverifiable: [], summary: 'Lunettes et bandeau visibles' }, sortieId });
}

beforeAll(async () => {
  srv = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on('data', (b: Buffer) => morceaux.push(b));
    req.on('end', () => {
      const brut = Buffer.concat(morceaux).toString('utf8');
      const r = JSON.parse(brut) as (typeof recus)[number];
      recus.push(r);
      const relecture = r.tools?.some((t) => t.name === 'relire_la_pub');
      res.writeHead(200, { connection: 'close', 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_pe', type: 'message', role: 'assistant', model: r.model, stop_reason: relecture ? 'tool_use' : 'end_turn', stop_sequence: null,
        content: relecture ? [{ type: 'tool_use', id: 'toolu_pe', name: 'relire_la_pub', input: lu }] : [{ type: 'text', text: sortieVision(brut) }],
        usage: { input_tokens: relecture ? 1800 : 9000, output_tokens: relecture ? 120 : 300 },
      }));
    });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  urlSrv = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'cle-factice-pub-entiere';
  process.env.ANTHROPIC_BASE_URL = urlSrv;
  process.env.ANTHROPIC_GEN_MODEL = MODELE_TEXTE;
  process.env.AI_SPEND_CAP_USD = '5';
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts);
  await db.update(schema.workspaces).set({ creditsBalance: 5000 }).where(eq(schema.workspaces.id, ids.wsA));
}, 120_000);
afterAll(async () => {
  await new Promise<void>((ok) => { srv.closeAllConnections?.(); srv.close(() => ok()); });
  for (const [k, v] of [['ANTHROPIC_API_KEY', env.cle], ['ANTHROPIC_BASE_URL', env.url], ['ANTHROPIC_GEN_MODEL', env.modele], ['AI_SPEND_CAP_USD', env.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(async () => { etat.session = session(ids, 'ua'); texte.recues.length = 0; appels = []; recus = []; await db.delete(schema.aiSpend); });

const TEXTES = ['Hook (fr) · Tes lunettes tiennent enfin', 'CTA (fr) · Je les essaie'];
const reference = async () => ({ mediaType: 'image/png', base64: Buffer.from(pngSimule([10, 20, 30])).toString('base64') });

/** Devis → approbation → worker → contrôle à la génération. */
async function generer(projectId: string) {
  const d = await devisImagePour(ctxDe(ids, 'ua'), { projectId }, T);
  if (!d.ok) throw new Error(JSON.stringify(d));
  const a = await approuverImagePour(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `pe-${randomUUID()}` }, { illimite: false, plafond: null, fournisseurImage: true, maintenant: T });
  if (!a.ok) throw new Error(JSON.stringify(a));
  expect(await executer(a.job.id)).toBe('completed');
  return { devis: d.devis, jobId: a.job.id };
}

describe('pub entière · du choix à la compilation au corps fal exact, relue à la génération', () => {
  it('compilation · devis au prix catalogue · corps GPT Image 2 (quality medium) · relecture « à reprendre » affichée avec la raison', async () => {
    const { projectId } = await projet(TEXTES);
    const c = await retenue(projectId, 'entiere');
    if (!c.ok || c.statut !== 'compilee') return;
    expect(c.consigne.pubEntiere).toEqual({ schema: 'pub_entiere/1', copie: { headline: 'Tes lunettes tiennent enfin', subhead: null, benefits: [], cta: 'Je les essaie' }, langue: 'fr', moteur: moteurRecommande('entiere') });
    expect(texte.recues[0]!.messages.map((m) => m.contenu).join(' ')).toContain('Textes : dessinés dans l’image par le générateur, mot pour mot');

    const { devis, jobId } = await generer(projectId);
    // Devis · l'image au prix CATALOGUE du moteur et du paramètre envoyés ; contrôle coché par défaut, relecture comprise.
    const t = tarifPubEntiere('gpt2');
    if (!t.ok) throw new Error(t.motif);
    const bornes = borneControleVisionParImageMicros(MODELE_TEXTE) + borneControlePubMicros(CONTROLE_MODEL);
    expect(devis.lignes.map((l: LigneDevis) => [l.operation, l.credits, l.usdMicros, l.natureCout])).toEqual([[OPERATION_IMAGE, 50, 49_000, 'estimation'], [OPERATION_CONTROLE_VISION, 0, bornes, 'borne']]);
    expect([devis.maximumCredits, devis.maximumUsdMicros]).toEqual([t.credits, t.usdMicros + bornes]);

    // fal · l'adresse et le corps EXACTS envoyés.
    const posts = appels.filter((x) => x.methode === 'POST');
    expect(posts.map((p) => p.url)).toEqual(['https://queue.fal.run/openai/gpt-image-2/edit']);
    const corps = JSON.parse(posts[0]!.corps!) as Record<string, unknown>;
    expect(Object.keys(corps).sort()).toEqual(['image_size', 'image_urls', 'num_images', 'prompt', 'quality']);
    expect([corps.quality, corps.image_size, corps.num_images, corps.image_urls]).toEqual(['medium', 'portrait_4_3', 1, [PHOTOS[4]]]);
    const prompt = String(corps.prompt);
    expect(prompt).toContain('- HEADLINE, large and dominant: Tes lunettes tiennent enfin');
    expect(prompt).toContain('- call-to-action button: Je les essaie');
    expect(prompt).toContain('in FRENCH with all accents and apostrophes');
    expect(prompt).not.toMatch(/Aucun texte|Pas de texte/);
    const snap = (await jobDe(jobId)).snapshot as SnapshotJob;
    expect((snap.parametres as { pubEntiere?: unknown }).pubEntiere).toEqual(c.consigne.pubEntiere);
    expect((await jobDe(jobId)).qualityStatus).toBe('pending');

    // Relecture · la vision lit l'accroche amputée de « enfin » ⇒ « à reprendre », raison écrite sur le job et sur le rendu.
    lu = { texteLu: ['Tes lunettes tiennent', 'Je les essaie', 'VISIO'], produitFidele: true, ecartsProduit: [], texteLisible: true, problemesLisibilite: [] };
    const avant = await compter(db);
    const r = await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias: resolveurMediasStudio(lecteur), relecture: { lireReference: reference } });
    // « À reprendre » n'est pas définitif · à relire par une personne, qui tranche (seul un composant absent écarte).
    expect(r, JSON.stringify(r)).toEqual({ ok: true, qualite: 'requires_review' });
    // La raison posée sur le média dit « À reprendre » et pourquoi (pas seulement le statut des composants).
    const [ctl] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, jobId), eq(schema.studioAuditEvents.action, 'media.quality.control')));
    expect(ctl!.reason, 'la relecture « à reprendre » n’a pas pesé sur la qualité posée').toContain('À reprendre · accroche réécrit · lu « Tes lunettes tiennent » (mot manquant « enfin »)');
    const rel = recus.filter((x) => x.tools?.some((t2) => t2.name === 'relire_la_pub'));
    expect(rel.map((x) => [x.model, x.messages[0]!.content.filter((b) => b.type === 'image').length])).toEqual([[CONTROLE_MODEL, 2]]);
    // La requête RÉELLEMENT reçue tient dans la borne ajoutée au devis.
    expect(Math.ceil(borneMaxAppel(rel[0] as never) * 1e6), 'la relecture envoyée dépasse la borne ajoutée à la ligne du devis').toBeLessThanOrEqual(borneControlePubMicros(CONTROLE_MODEL));
    expect((await db.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'studio:relecture-pub-entiere'))).map((l) => l.workspaceId)).toEqual([ids.wsA]);
    const fini = await jobDe(jobId);
    expect((fini.result as Record<string, unknown>)[CLE_RELECTURE_JOB]).toMatchObject({ statut: 'a_reprendre', raisons: ['accroche réécrit · lu « Tes lunettes tiennent » (mot manquant « enfin »)'] });
    // Aucune reprise automatique payante · ni job, ni devis, ni débit de plus.
    const d = delta(avant, await compter(db));
    for (const k of ['jobs', 'devis', 'approbations', 'credits'] as const) expect(d[k], k).toBeUndefined();
    const vue = await lireParcoursImagePour(ctxDe(ids, 'ua'), projectId, { ...O, ...LECTURE });
    expect(vue.ok && vue.vue.jobs[0]).toMatchObject({ id: jobId, qualite: 'requires_review', libelleQualite: 'À relire · la relecture demande de reprendre la pub', pubEntiere: true, relectureAuDevis: true, relecture: { statut: 'a_reprendre', libelle: 'À reprendre', raisons: ['accroche réécrit · lu « Tes lunettes tiennent » (mot manquant « enfin »)'] } });
    expect(vue.ok && vue.vue.retenue).toMatchObject({ typographie: 'entiere', copie: { headline: 'Tes lunettes tiennent enfin' } });
  }, 120_000);

  it('« Un goût fruits rouges » écrit juste mais étiquette lue « Goût mangue » ⇒ refusée à la relecture, raison dite', async () => {
    const { projectId } = await projet(['Hook (fr) · Un goût fruits rouges qui fait du bien'], []);
    await retenue(projectId, 'entiere');
    const { jobId } = await generer(projectId);
    lu = { texteLu: ['Un goût fruits rouges qui fait du bien', 'naali', 'Goût mangue', '60 gommes'], produitFidele: true, ecartsProduit: [], texteLisible: true, problemesLisibilite: [] };
    expect(await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias: resolveurMediasStudio(lecteur), relecture: { lireReference: reference } })).toEqual({ ok: true, qualite: 'requires_review' });
    expect(((await jobDe(jobId)).result as Record<string, unknown>)[CLE_RELECTURE_JOB]).toMatchObject({
      statut: 'a_reprendre', raisons: ['accroche « Un goût fruits rouges qui fait du bien » contredit le produit · goût « fruit rouge » annoncé, « mangue » sur le produit'],
    });
  }, 120_000);

  it('la fiche produit dit « Goût mangue » · compilation refusée AVANT tout appel, rien d’écrit', async () => {
    const { projectId } = await projet(['Hook (fr) · Un goût fruits rouges qui fait du bien'], [{ claim: 'Goût mangue' }]);
    repondreConsigne();
    const avant = await compter(db);
    const r = await compilerEtAttesterPour(ctxDe(ids, 'ua'), { projectId, mode: 'generative_scene', typographie: 'entiere' }, deps);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', message: expect.stringContaining('goût « fruit rouge » annoncé, « mangue » sur le produit') });
    expect(texte.recues).toHaveLength(0);
    expect(delta(avant, await compter(db))).toEqual({});
  }, 120_000);
});

describe('pub entière · vues choisies du même produit (#1097)', () => {
  it('épinglée + 2 vues choisies ⇒ 3 références, épinglée en tête ; la consigne et l’invariant disent UN article, au même compte', async () => {
    const { projectId } = await projet(TEXTES);
    const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
    if (!c.ok) throw new Error(c.code);
    const photos = c.catalogue.produits.find((x) => x.produit.id === cat.produit.id)!.photos;
    const v = await courante(projectId);
    const f = await definirFicheProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, fiche: null, vues: [photos[2]!.assetId, photos[1]!.assetId] }, O);
    if (!f.ok) throw new Error(JSON.stringify(f));
    await retenue(projectId, 'entiere');
    await generer(projectId);
    const corps = JSON.parse(appels.filter((x) => x.methode === 'POST')[0]!.corps!) as { image_urls: string[]; prompt: string };
    expect(corps.image_urls).toEqual([PHOTOS[4], PHOTOS[2], PHOTOS[1]]);
    expect(corps.prompt).toContain('The first 3 provided images are views of the SAME single product');
    expect(corps.prompt).toContain('Plusieurs exemplaires du produit : les photos produit 1 à 3 sont des vues du même article');
    expect(corps.prompt).not.toContain('The provided image is the EXACT product.');
  }, 120_000);
});

describe('pub entière · relecture qui ne peut pas conclure', () => {
  const marqueur = async (id: string) => ((await jobDe(id)).result as Record<string, { etat?: string } | undefined>)[CLE_MARQUEUR_CONTROLE_VISION]?.etat;

  it('erreur du stockage APRÈS l’envoi du contrôle visuel · relecture « non conclue » avec le motif, marqueur conclu, aucun conflit au tour suivant', async () => {
    const { projectId } = await projet(TEXTES);
    await retenue(projectId, 'entiere');
    const { jobId } = await generer(projectId);
    const reel = resolveurMediasStudio(lecteur);
    let n = 0;
    // Le contrôle visuel lit le média (1er appel) ; la relecture tombe sur une panne du stockage (2e appel).
    const medias: typeof reel = async (portee, idsM) => { n += 1; if (n > 1) throw new Error('S3 indisponible (simulé)'); return reel(portee, idsM); };
    const r = await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias, relecture: { lireReference: reference } });
    expect(r, JSON.stringify(r)).toEqual({ ok: true, qualite: 'requires_review' });
    expect(await marqueur(jobId), 'le marqueur reste « engagé » · toute relance serait refusée à tort').toBe('conclu');
    expect(((await jobDe(jobId)).result as Record<string, unknown>)[CLE_RELECTURE_JOB]).toMatchObject({ statut: 'non_conclue', nonVerifie: [expect.stringContaining('S3 indisponible (simulé)')] });
    expect(await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias, relecture: { lireReference: reference } })).toEqual({ ok: true, qualite: 'requires_review' });
  }, 120_000);

  it('contrôle au devis mais pas lancé (plafond atteint) · la VRAIE raison est écrite et lue sur le rendu', async () => {
    const { projectId } = await projet(TEXTES);
    await retenue(projectId, 'entiere');
    const { jobId } = await generer(projectId);
    const cap = process.env.AI_SPEND_CAP_USD;
    process.env.AI_SPEND_CAP_USD = '0';
    try {
      expect(await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias: resolveurMediasStudio(lecteur), relecture: { lireReference: reference } })).toEqual({ ok: true, qualite: 'requires_review' });
    } finally { process.env.AI_SPEND_CAP_USD = cap; }
    expect(recus.filter((x) => x.tools?.some((t) => t.name === 'relire_la_pub'))).toHaveLength(0);
    const vue = await lireParcoursImagePour(ctxDe(ids, 'ua'), projectId, { ...O, ...LECTURE });
    expect(vue.ok && vue.vue.jobs[0]).toMatchObject({ relectureAuDevis: true, relecture: { statut: 'non_conclue', nonVerifie: ['mots, packaging et lisibilité non relus · le plafond de dépense est atteint'] } });
  }, 120_000);
});

describe('mode calques · inchangé de bout en bout', () => {
  it('sans choix · consigne sans pub entière, devis au barème, corps Nano Banana d’avant (« Aucun texte écrit »), aucune relecture', async () => {
    const { projectId } = await projet(TEXTES);
    const c = await retenue(projectId);
    if (!c.ok || c.statut !== 'compilee') return;
    expect('pubEntiere' in c.consigne).toBe(false);
    expect(texte.recues[0]!.messages.map((m) => m.contenu).join(' ')).toContain('Textes : posés par des calques texte, jamais dans les pixels.');
    const { devis, jobId } = await generer(projectId);
    expect(devis.lignes.map((l: LigneDevis) => [l.operation, l.credits, l.usdMicros, l.natureCout])).toEqual([[OPERATION_IMAGE, 40, 80_000, 'borne'], [OPERATION_CONTROLE_VISION, 0, borneControleVisionParImageMicros(MODELE_TEXTE), 'borne']]);
    const posts = appels.filter((x) => x.methode === 'POST');
    expect(posts.map((p) => p.url)).toEqual(['https://queue.fal.run/fal-ai/nano-banana-2/edit']);
    const corps = JSON.parse(posts[0]!.corps!) as Record<string, unknown>;
    const v = await courante(projectId);
    expect(corps).toEqual({ prompt: promptFal(consigneDuContenu(v.content as ContenuVersion)!.consigne), num_images: 1, aspect_ratio: '4:5', image_urls: [PHOTOS[4]] });
    expect(String(corps.prompt)).toContain('Aucun texte écrit dans l’image : les textes sont posés ensuite par des calques.');
    expect(await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias: resolveurMediasStudio(lecteur), relecture: { lireReference: reference } })).toMatchObject({ ok: true });
    expect(recus.filter((x) => x.tools?.some((t) => t.name === 'relire_la_pub'))).toHaveLength(0);
    expect(CLE_RELECTURE_JOB in ((await jobDe(jobId)).result as Record<string, unknown>)).toBe(false);
    const vue = await lireParcoursImagePour(ctxDe(ids, 'ua'), projectId, { ...O, ...LECTURE });
    expect(vue.ok && vue.vue.jobs[0]).toMatchObject({ pubEntiere: false, relecture: null, relectureAuDevis: true });
  }, 120_000);
});

void and;
