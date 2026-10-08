import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Lot F-D · exécuteur image RÉEL du benchmark (`executeurMediasFal`, sur
 * l'adaptateur F-A `FournisseurFal`) contre un `fetch` INJECTÉ qui rejoue la
 * file fal · aucun appel réseau, 0 $. La campagne réelle tourne en vrai
 * (registre, approbation, barrière `sousPlafond` de la campagne, pglite).
 *
 * Provenance des réponses rejouées : celles du lot F-A (documentation publique
 * de la file fal : soumission `{request_id, status_url, response_url,
 * cancel_url}`, statuts `IN_PROGRESS`/`COMPLETED`, sortie Nano Banana
 * `images: [{url, content_type, …}]` sur `v3.fal.media`). Écrites à la main,
 * jamais capturées sur le service.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import { imageVide } from '@tiktrends/core';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { approuverBudgetBenchmark, lancerCampagneReelle, planEtDevis } from '../lib/studios/benchmark/programme';
import { executeurMediasFal } from '../lib/studios/benchmark/executeur-fal';
import { encoder, genererJeu } from '../lib/studios/benchmark/jeu-synthetique';
import type { Jeu } from '../lib/studios/benchmark/scenarios';
import { executeurDepuisEnv } from '../scripts/bench-studios';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { espionScenarios } from './fd-outils';

const CLE = 'cle-fal-de-test:secret-0123456789';
const ADMIN = randomUUID();
let releaseId = '';
let jeu: Jeu;
let PNG: Uint8Array;

/* ── la file fal rejouée ── */
interface Appel { url: string; methode: string; entetes: Record<string, string>; corps: any }
let appels: Appel[] = [];
let soumission: () => Response | Error;
let n = 0;
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
const base = (id: string) => `https://queue.fal.run/fal-ai/nano-banana-2/requests/${id}`;
const lectures = new Map<string, number>();
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = { url: String(url), methode: init?.method ?? 'GET', entetes: Object.fromEntries(new Headers(init?.headers).entries()), corps: init?.body ? JSON.parse(String(init.body)) : null };
  appels.push(a);
  if (a.methode === 'POST') { const r = soumission(); if (r instanceof Error) throw r; return r; }
  const st = /\/requests\/([^/]+)\/status$/.exec(a.url);
  if (st) { const k = (lectures.get(st[1]!) ?? 0) + 1; lectures.set(st[1]!, k); return json(200, { status: k < 2 ? 'IN_PROGRESS' : 'COMPLETED' }); }
  const res = /\/requests\/([^/]+)$/.exec(a.url);
  if (res) return json(200, { images: [{ url: `https://v3.fal.media/files/zebra/${res[1]}.png`, content_type: 'image/png', file_name: 'sortie.png', width: 8, height: 6 }], description: '' });
  if (a.url.startsWith('https://v3.fal.media/')) return new Response(PNG.slice(), { status: 200, headers: { 'content-type': 'text/html', 'content-length': String(PNG.length) } });
  throw new Error(`appel non prévu ${a.methode} ${a.url}`);
}) as typeof fetch;
const soumissionOk = () => { const id = `req-${++n}`; return json(200, { request_id: id, response_url: base(id), status_url: `${base(id)}/status`, cancel_url: `${base(id)}/cancel`, queue_position: 0 }); };
const coupure = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }) });

function executeur() {
  let t = Date.parse('2026-10-08T12:00:00Z');
  return executeurMediasFal({ apiKey: CLE, fetch: fetchRejoue, jeu, verifierAdresse: async () => true, horloge: () => new Date(t), attendre: async (ms) => { t += ms; } });
}
async function campagne(cas: string[], budget: string) {
  const ap = await approuverBudgetBenchmark(acteurPlateforme(ADMIN), { releaseId, cas, budgetUsd: budget, motif: 'Benchmark média' });
  if (!ap.ok) throw new Error(JSON.stringify(ap.refus));
  const pd = planEtDevis(cas);
  if (!pd.ok) throw new Error('plans');
  const espion = espionScenarios(jeu, pd.plans);
  const exec = executeur();
  const r = await lancerCampagneReelle({ budgetBrut: budget, releaseId, cas, adaptateur: espion.a, medias: exec, racine: null, jeu });
  if (!r.ok) throw new Error(JSON.stringify(r.refus));
  return { r, espion, exec };
}
const depenses = async (action: string) => (await db.select().from(schema.aiSpend)).filter((l) => l.action === action);

beforeAll(async () => {
  process.env.AI_SPEND_CAP_USD = '10';
  await db.insert(schema.users).values({ id: ADMIN, email: 'admin-fal@studios.test' });
  releaseId = await publierRegistreDeTest(depot, acteurPlateforme(ADMIN));
  jeu = await genererJeu();
  PNG = new Uint8Array(await encoder(imageVide(8, 6, [30, 120, 200, 255])));
}, 60_000);
afterAll(() => { delete process.env.AI_SPEND_CAP_USD; });

describe('exécuteur fal · nominal (F14, deux sorties)', () => {
  it('une soumission par média, sondée puis téléchargée, image relue · UNE ligne ai_spend par média', async () => {
    appels = []; soumission = soumissionOk;
    const { r, exec } = await campagne(['F14'], '0.424');
    const f14 = r.resultat.resultats[0]!;
    expect(f14.statut).toBe('execute');
    const posts = appels.filter((a) => a.methode === 'POST');
    expect(posts.map((a) => a.url)).toEqual(['https://queue.fal.run/fal-ai/nano-banana-2/edit', 'https://queue.fal.run/fal-ai/nano-banana-2/edit']);
    // Corps natif : consigne compilée, format 1080×1920 → 9:16, la référence du jeu en data URI (jamais une URL extérieure).
    expect(posts[0]!.corps).toMatchObject({ prompt: expect.stringContaining('Produit sur une table'), num_images: 1, aspect_ratio: '9:16' });
    expect(posts[0]!.corps.image_urls).toEqual([`data:image/png;base64,${Buffer.from(jeu.get('f06-produit')!.octets).toString('base64')}`]);
    // La clé ne part que vers la file, jamais vers l'hôte des médias.
    expect(appels.filter((a) => a.url.startsWith('https://v3.fal.media/')).every((a) => a.entetes.authorization === undefined)).toBe(true);
    expect(posts.every((a) => a.entetes.authorization === `Key ${CLE}`)).toBe(true);
    // Une seule barrière : la campagne. Le port de l'exécuteur n'a rien écrit.
    const lignes = await depenses('studio-benchmark:F14:generation');
    expect(lignes.map((l) => [l.provider, l.model, l.actualUsd])).toEqual([['fal', 'fal_image', 0.08], ['fal', 'fal_image', 0.08]]);
    expect((await db.select().from(schema.aiSpend)).filter((l) => l.action === 'studio.generation')).toEqual([]);
    expect(exec.port.reservations).toHaveLength(2);
    expect(r.resultat.appelsMedias).toBe(2);
  }, 60_000);
});

describe('exécuteur fal · issue incertaine', () => {
  it('réponse perdue après envoi : la campagne s’arrête, aucune resoumission, la dépense reste comptée, F21 n’est pas joué', async () => {
    appels = []; soumission = coupure;
    const { r, espion } = await campagne(['F14', 'F21'], '0.556');
    expect(r.resultat.resultats.map((x) => [x.cas, x.statut])).toEqual([['F14', 'arrete_incertain'], ['F21', 'arrete_incertain']]);
    expect(r.resultat.rapport.arrete).toMatch(/^Arrêt sur issue incertaine à F14\/generation#0/);
    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(1);
    expect(espion.appels.map((a) => a.action)).toEqual(['studio-prompt:storyboard.plan', 'studio-prompt:image.compile']);
    const lignes = (await depenses('studio-benchmark:F14:generation')).slice(2);
    expect(lignes.map((l) => l.actualUsd)).toEqual([0.08]);
  }, 60_000);
});

describe('exécuteur fal · ce qu’il ne sait pas faire est refusé AVANT la barrière', () => {
  it('F05 (retouche masquée, aucune consigne image.compile) : 0 requête, 0 ligne de dépense', async () => {
    appels = []; soumission = soumissionOk;
    const { r } = await campagne(['F05'], '0.292');
    const etapes = r.resultat.observations[0]!.etapes.filter((e) => e.etapeId === 'retouche');
    expect(etapes.map((e) => e.code)).toEqual(['EXECUTEUR_REFUS', 'EXECUTEUR_REFUS']);
    expect(appels).toEqual([]);
    expect(await depenses('studio-benchmark:F05:retouche')).toEqual([]);
  }, 60_000);
});

describe('commande --reel · branchement', () => {
  it('sans clé ou avec la clé de simulation locale : aucun exécuteur, rien n’est construit', () => {
    let construits = 0;
    const f = () => { construits++; return 'exec'; };
    expect(executeurDepuisEnv({}, f)).toBeNull();
    expect(executeurDepuisEnv({ FAL_KEY: 'simule-local-sans-reseau' }, f)).toBeNull();
    expect(executeurDepuisEnv({ FAL_KEY: 'id:secret' }, f)).toBe('exec');
    expect(construits).toBe(1);
  });
});
