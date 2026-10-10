import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * E4 (contre-recette Codex sur 150c17c, P1) · « Un job livré avec
 * qualityStatus requires_review et contrôle incertain réconcilié saute le
 * bloc réservé à pending. Pourtant controleVisuel reconnaît ensuite la
 * réconciliation et peut relancer l'appel : sans contrôle des interrupteurs
 * ni engagement au registre cumulatif. »
 *
 * Vraie base (pglite + migrations dont 0056), semis de recette, VRAI
 * adaptateur de production pointé vers un faux serveur Anthropic LOCAL (0 $)
 * qui, à CHAQUE requête reçue, lit le registre sur disque. Moteur et
 * fournisseur fal de production contre un `fetch` factice pour le premier
 * rendu. On lit les RÉSULTATS : requêtes reçues, engagements écrits (et leur
 * présence au moment de la requête), code de sortie, qualité du job.
 *
 *  (a) réconcilié + interrupteur `controle_visuel` coupé ⇒ 0 requête, 0 engagement ;
 *  (b) réconcilié + registre presque plein par une AUTRE base ⇒ 0 requête,
 *      alors que la barrière de la base locale aurait laissé passer ;
 *  (c) réconcilié, `requires_review`, budget disponible ⇒ engagement durable
 *      sur disque AU MOMENT de la requête, puis réglé ;
 *  (d) même chose avec la qualité `pending` (la décision partielle d'avant
 *      voyait « incertain » et n'engageait rien, l'appel partait quand même).
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { db, schema, eq, reconcilierDepense, type BaseDepense } from '@tiktrends/db';
import { decisionReconciliation, lireMarqueurControleVision } from '@tiktrends/core';
import { semerRecette } from '../scripts/recette/semer';
import { executerPas1 } from '../scripts/recette/pas1';
import { RECETTE, usdAffiche } from '../scripts/recette/regles';
import { FICHIER_REGISTRE, bilanRegistre, ecrireRegistre, lireRegistre } from '../scripts/recette/registre';
import { sousVerrou } from '../scripts/recette/verrou';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { adaptateurAnthropicGarde, type AdaptateurModele, type AppelModele } from '../lib/studios/prompts/adaptateur';

const MODELE = 'claude-sonnet-5';
const ENV = {
  TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15',
  STUDIOS_ESPACES_PILOTES: RECETTE.workspaceId, STUDIOS_CAPACITES_PILOTES: 'generation_image,controle_visuel',
  DATABASE_URL: 'postgres://recette:mdp-e4-vision@127.0.0.1:5432/tiktrends_recette',
  STUDIO_FOURNISSEUR_REEL: 'autorise', FAL_KEY: 'fal-e4-factice-31aa', ANTHROPIC_API_KEY: 'sk-e4-factice-90bc',
};
/** Le contrôle visuel COUPÉ pour l'espace de recette (seule la génération reste ouverte). */
const VISION_COUPEE = { ...ENV, STUDIOS_CAPACITES_PILOTES: 'generation_image' };

/* ── Faux serveur Anthropic · compte les requêtes et LIT LE REGISTRE à chacune ── */
let dossierLu = '';
const srv = { n: 0, mode: 'coupure' as 'coupure' | 'ok', ouvertsALaRequete: [] as Array<Array<[string, number]>> };
let serveur: Server;
const SORTIE_VISION = JSON.stringify({ status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { verdict: 'passed', issues: [], unverifiable: [], summary: 'Lunettes visibles' } });
const ouvertsSurDisque = (d: string): Array<[string, number]> => {
  const f = join(d, FICHIER_REGISTRE);
  const r = existsSync(f) ? lireRegistre(readFileSync(f, 'utf8')) : null;
  return r ? Object.values(r.engagements).filter((g) => g.etat === 'engage').map((g) => [g.commande, g.reserveMicros]) : [];
};

/* ── Premier rendu · adaptateur simulé (compilation et contrôle), fal factice ── */
const simule = adaptateurSimule((a: AppelModele) => {
  if (a.profil === 'vision_analysis') return JSON.parse(SORTIE_VISION);
  const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
  return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
    generationInstruction: 'Coureuse de face sur un sentier au matin, lunettes bleues et bandeau bleu portés, lumière douce, cadrage poitrine.',
    negativeConstraints: ['Aucun autre produit visible'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
    referenceBindings: ti.referenceIds.filter((id) => id.startsWith('pph_')).map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
  } };
});
const texteSimule = Object.assign(Object.create(simule) as AdaptateurModele, { modelePour: (p: string) => (p === 'reasoning_structured' || p === 'vision_analysis' ? MODELE : null) });
const REQ = 'e4e40000-0000-4000-8000-0000000fa104';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
let png = new Uint8Array();
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const fetchFactice = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  if ((init?.method ?? 'GET') === 'POST') return json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` });
  if (u.endsWith(`/requests/${REQ}/status`)) return json(200, { status: 'COMPLETED', response_url: BASE_REQ });
  if (u.endsWith(`/requests/${REQ}`)) return json(200, { images: [{ url: 'https://v3.fal.media/files/recette/e4.png', content_type: 'image/png', width: 1080, height: 1350 }] });
  if (u.startsWith('https://v3.fal.media/')) return new Response(png as unknown as BodyInit, { status: 200, headers: { 'content-length': String(png.length) } });
  throw new Error(`appel non prévu ${u}`);
}) as typeof fetch;

let sortie = '';
let registre = '';
const avantEnv = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };
const lancer = (argv: string[], o: { env?: Record<string, string>; dossier?: string; adaptateur?: AdaptateurModele } = {}) => {
  dossierLu = o.dossier ?? registre;
  return executerPas1({
    env: o.env ?? ENV, argv, adaptateur: o.adaptateur ?? adaptateurAnthropicGarde(), fetch: fetchFactice, sortie, registre: dossierLu, simule: true,
    verifierAdresse: async () => true, attente: { maxMs: 20_000, pasMs: 10 }, dormir: (ms) => new Promise((ok) => setTimeout(ok, ms)), journal: () => {},
  });
};
const job = async () => (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.workspaceId, RECETTE.workspaceId)))[0]!;
const engagements = (d: string) => Object.values(lireRegistre(readFileSync(join(d, FICHIER_REGISTRE), 'utf8'))!.engagements);
let ligneVisionMicros = 0;
/** Le marqueur incertain du contrôle coupé, réconcilié · chaque cas repart de lui. */
let marqueurIncertain: unknown = null;
/** Remet le job dans l'état du cas Codex · contrôle incertain RÉCONCILIÉ, qualité donnée. */
const remettre = async (qualite: 'requires_review' | 'pending') => {
  const j = await job();
  await db.update(schema.studioJobs).set({ qualityStatus: qualite, result: { ...(j.result as Record<string, unknown>), controleVision: marqueurIncertain } }).where(eq(schema.studioJobs.id, j.id));
};

beforeAll(async () => {
  serveur = createServer((req, res) => {
    srv.n += 1;
    // Ce que le registre contient sur disque À L'INSTANT où la requête payante arrive.
    srv.ouvertsALaRequete.push(ouvertsSurDisque(dossierLu));
    req.on('data', () => {});
    req.on('end', () => {
      if (srv.mode === 'coupure') { req.socket.destroy(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_e4', type: 'message', role: 'assistant', model: MODELE, stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: SORTIE_VISION }], usage: { input_tokens: 9000, output_tokens: 300 } }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', () => ok()));
  process.env.ANTHROPIC_API_KEY = ENV.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_GEN_MODEL = MODELE;
  sortie = mkdtempSync(join(tmpdir(), 'e4-pas1-'));
  registre = mkdtempSync(join(tmpdir(), 'e4-pas1-registre-'));
  const s = await semerRecette(ENV, { maintenant: new Date('2026-10-09T10:00:00Z') });
  if (!s.ok) throw new Error(s.raisons.join(' ; '));
  png = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 230, g: 170, b: 110 } } }).png().toBuffer());

  // 1 · premier rendu complet (adaptateur simulé) · livrable et contrôle conclu.
  const r0 = await lancer([], { adaptateur: texteSimule });
  ligneVisionMicros = r0.devis!.lignes.find((l) => l.cle === 'vision')!.reservationUsdMicros;
  const r1 = await lancer(['--confirmer-usd', usdAffiche(r0.devis!.afficheUsdMicros).replace(' $', '')], { adaptateur: texteSimule });
  if (r1.code !== 0) throw new Error(`premier rendu : ${r1.refus.join(' ; ')}`);

  // 2 · contrôle repris par le VRAI adaptateur, coupé en route ⇒ issue incertaine, ligne à réconcilier.
  const j = await job();
  const { controleVision: _, ...reste } = j.result as Record<string, unknown>;
  await db.update(schema.studioJobs).set({ qualityStatus: 'pending', result: reste }).where(eq(schema.studioJobs.id, j.id));
  srv.mode = 'coupure';
  const r2 = await lancer([]);
  if (r2.code !== 1 || srv.n !== 1) throw new Error(`contrôle coupé attendu (code ${r2.code}, ${srv.n} requête(s))`);
  const [ligne] = (await db.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'studio-prompt:quality.visual'))).filter((l) => l.reconcileReason !== null);
  if (!ligne) throw new Error('ligne incertaine du contrôle absente');

  // 3 · le propriétaire RÉCONCILIE la ligne avec la facture.
  const rec = await reconcilierDepense(db as unknown as BaseDepense, {
    aiSpendId: ligne.id, billedMicros: 40_000, currency: 'USD', providerRef: 'inv_e4_01', reason: 'appel retrouvé sur la facture', authorId: RECETTE.userId, idempotencyKey: `e4-${randomUUID()}`,
  }, (e) => decisionReconciliation(e, ligne.id));
  if (!rec.ok) throw new Error(`réconciliation : ${JSON.stringify(rec)}`);
  marqueurIncertain = ((await job()).result as Record<string, unknown>).controleVision;
}, 180_000);

afterAll(async () => {
  await new Promise<void>((ok) => { serveur.closeAllConnections?.(); serveur.close(() => ok()); });
  for (const x of [sortie, registre]) if (x) rmSync(x, { recursive: true, force: true });
  for (const [k, v] of [['ANTHROPIC_API_KEY', avantEnv.cle], ['ANTHROPIC_BASE_URL', avantEnv.url], ['ANTHROPIC_GEN_MODEL', avantEnv.modele], ['AI_SPEND_CAP_USD', avantEnv.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('E4 · pas 1 · reprise d’un contrôle incertain réconcilié, sous interrupteur et registre', () => {
  it('le cas de départ est bien celui de Codex : qualité requires_review, marqueur incertain réconcilié', async () => {
    const j = await job();
    expect(j.qualityStatus).toBe('requires_review');
    expect(lireMarqueurControleVision(j.result)).toMatchObject({ etat: 'incertain' });
  });

  it('(a) interrupteur `controle_visuel` coupé ⇒ 0 requête au faux serveur, 0 engagement, refus nommé', async () => {
    await remettre('requires_review');
    srv.mode = 'ok'; srv.n = 0;
    const avant = engagements(registre).length;
    const r = await lancer([], { env: VISION_COUPEE });
    expect(srv.n, 'contrôle visuel relancé alors que son interrupteur est coupé').toBe(0);
    expect(engagements(registre).length, 'un engagement a été pris pour un contrôle coupé').toBe(avant);
    expect(r.code).toBe(2);
    expect(r.refus.join('\n')).toContain('INTERRUPTEUR_COUPE');
    expect((await job()).qualityStatus).toBe('requires_review');
  }, 60_000);

  it('(b) registre presque plein par une AUTRE base ⇒ 0 requête, 0 engagement (la barrière de la base locale aurait laissé passer)', async () => {
    await remettre('requires_review');
    srv.mode = 'ok'; srv.n = 0;
    const plein = mkdtempSync(join(tmpdir(), 'e4-pas1-plein-'));
    cpSync(registre, plein, { recursive: true });
    const reg = lireRegistre(readFileSync(join(plein, FICHIER_REGISTRE), 'utf8'))!;
    const restant = bilanRegistre(reg).restantMicros;
    const autre = { id: 'autre-base-ligne-1', provider: 'fal', model: 'fal_image', action: 'studio.generation', reserveMicros: restant - 1_000, actualMicros: restant - 1_000, etat: 'reglee' as const,
      regleMicros: restant - 1_000, incertainMicros: 0, cause: null, creeeLe: '2026-10-08T10:00:00.000Z', base: 'tiktrends_recette@autre-cluster', vueLe: '2026-10-08T10:00:00.000Z', engagement: null };
    await sousVerrou(plein, (v) => ecrireRegistre(plein, { ...reg, lignes: { ...reg.lignes, [autre.id]: autre as never } }, v));
    expect(bilanRegistre(lireRegistre(readFileSync(join(plein, FICHIER_REGISTRE), 'utf8'))!).restantMicros).toBeLessThan(ligneVisionMicros);
    const avant = engagements(plein).length;
    const r = await lancer([], { dossier: plein });
    expect(srv.n, 'contrôle visuel relancé sans place au registre cumulatif (seule la barrière de la base a été consultée)').toBe(0);
    expect(engagements(plein).length).toBe(avant);
    expect(r.code).toBe(2);
    expect(r.refus.join('\n')).toContain('Budget d’essai insuffisant');
    rmSync(plein, { recursive: true, force: true });
  }, 60_000);

  it('(c) budget disponible ⇒ l’engagement est sur disque AU MOMENT de la requête, puis réglé ; verdict enregistré', async () => {
    await remettre('requires_review');
    srv.mode = 'ok'; srv.n = 0; srv.ouvertsALaRequete = [];
    const avant = engagements(registre).length;
    const r = await lancer([]);
    expect(r.code, r.refus.join('\n')).toBe(0);
    expect(srv.n).toBe(1);
    expect(srv.ouvertsALaRequete, 'la reprise a appelé sans engagement durable au registre').toEqual([[['recette:pas1', ligneVisionMicros]]]);
    const apres = engagements(registre);
    expect(apres.length).toBe(avant + 1);
    expect(apres.at(-1)!.etat, 'l’engagement de la reprise n’est pas réglé').toBe('regle');
    expect((await job()).qualityStatus).toBe('passed');
  }, 60_000);

  it('(d) même reprise avec la qualité `pending` ⇒ engagement avant la requête, puis réglé', async () => {
    await remettre('pending');
    srv.mode = 'ok'; srv.n = 0; srv.ouvertsALaRequete = [];
    const r = await lancer([]);
    expect(r.code, r.refus.join('\n')).toBe(0);
    expect(srv.ouvertsALaRequete, 'la reprise (qualité pending) a appelé sans engagement durable au registre').toEqual([[['recette:pas1', ligneVisionMicros]]]);
    expect(engagements(registre).at(-1)!.etat).toBe('regle');
  }, 60_000);
});
