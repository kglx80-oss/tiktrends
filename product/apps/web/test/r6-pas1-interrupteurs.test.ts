import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * R6 · le PAS 1 de la recette passe par les interrupteurs Studios (F1).
 *
 * Le défaut réparé : `recette:pas1` construisait le moteur du worker SANS
 * interrupteurs ; l'essai réel aurait donc contourné la garde que la boucle
 * de production applique (un job dont une capacité est coupée reste en file),
 * et rien ne disait, avant de dépenser, qu'une capacité était coupée.
 *
 * Vraie base (pglite + migrations), semis réel, adaptateur texte SIMULÉ,
 * fournisseur fal de production contre un `fetch` FACTICE (0 $), moteur RÉEL.
 * On lit les RÉSULTATS : code de sortie, refus, soumissions reçues par le faux
 * fal, lignes en base, état du job.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { db, schema, eq } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { semerRecette } from '../scripts/recette/semer';
import { executerPas1 } from '../scripts/recette/pas1';
import { RECETTE, usdAffiche } from '../scripts/recette/regles';
import { adaptateurSimule } from './l2-adaptateur-simule';
import type { AdaptateurModele, AppelModele } from '../lib/studios/prompts/adaptateur';

const BASE_ENV = {
  TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15',
  DATABASE_URL: 'postgres://recette:mdp@127.0.0.1:5432/tiktrends_recette', STUDIO_FOURNISSEUR_REEL: 'autorise', FAL_KEY: 'fal-factice-r6', ANTHROPIC_API_KEY: 'sk-factice-r6',
};
/** Ce que pose docker-compose.recette.yml pour le service d'outils (pas 1). */
const OUVERT = { ...BASE_ENV, STUDIOS_ESPACES_PILOTES: RECETTE.workspaceId, STUDIOS_CAPACITES_PILOTES: 'generation_image,controle_visuel' };

const texteBrut = adaptateurSimule((a: AppelModele) => {
  const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
  return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
    generationInstruction: 'Coureuse de face sur un sentier au matin, lunettes bleues et bandeau bleu portés, lumière douce, cadrage poitrine.',
    negativeConstraints: ['Aucun autre produit visible'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
    referenceBindings: ti.referenceIds.filter((id) => id.startsWith('pph_')).map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
  } };
});
const modelePour = (p: string) => (p === 'reasoning_structured' || p === 'vision_analysis' ? 'claude-sonnet-5' : null);
/**
 * Adaptateur de la compilation · APRÈS la vérification d'avant-engagement,
 * AVANT le moteur : il coupe `generation_image` pour l'espace de recette
 * (réglage plateforme, `app_settings`). Seule la garde du worker peut alors
 * empêcher la soumission.
 */
const texteQuiCoupe: AdaptateurModele = {
  nom: 'simule-test', simule: true, modelePour,
  async appeler(a) {
    await db!.insert(schema.appSettings).values({ key: cleInterrupteursEspace(RECETTE.workspaceId), value: { actives: [], coupees: ['generation_image'] } })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: { actives: [], coupees: ['generation_image'] } } });
    return texteBrut.appeler(a);
  },
};

const REQ = 'e5ec0000-0000-4000-8000-0000000fa6a6';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
const fal = { soumissions: 0, png: new Uint8Array() };
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const fetchFactice = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  if ((init?.method ?? 'GET') === 'POST') { fal.soumissions += 1; return json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` }); }
  if (u.endsWith(`/requests/${REQ}/status`)) return json(200, { status: 'COMPLETED', response_url: BASE_REQ });
  if (u.endsWith(`/requests/${REQ}`)) return json(200, { images: [{ url: 'https://v3.fal.media/files/recette/r6.png', content_type: 'image/png', width: 1080, height: 1350 }] });
  if (u.startsWith('https://v3.fal.media/')) return new Response(fal.png as unknown as BodyInit, { status: 200, headers: { 'content-length': String(fal.png.length) } });
  throw new Error(`appel non prévu ${u}`);
}) as typeof fetch;

let sortie = '';
let registre = '';
const lancer = (argv: string[], env: Record<string, string | undefined>, adaptateur: AdaptateurModele) => executerPas1({
  env, argv, adaptateur: Object.assign(Object.create(adaptateur) as AdaptateurModele, { modelePour }), fetch: fetchFactice, sortie, registre, simule: true,
  verifierAdresse: async () => true, attente: { maxMs: 800, pasMs: 20 }, dormir: (ms) => new Promise((ok) => setTimeout(ok, ms)), journal: () => {},
});

beforeAll(async () => {
  sortie = mkdtempSync(join(tmpdir(), 'r6-pas1-'));
  registre = mkdtempSync(join(tmpdir(), 'r6-pas1-registre-'));
  const r = await semerRecette(BASE_ENV, { maintenant: new Date('2026-10-09T10:00:00Z') });
  if (!r.ok) throw new Error(r.raisons.join(' ; '));
  fal.png = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 200, g: 160, b: 120 } } }).png().toBuffer());
}, 120_000);
afterAll(() => { for (const x of [sortie, registre]) if (x) rmSync(x, { recursive: true, force: true }); });

describe('R6 · pas 1 · interrupteurs du worker', () => {
  it('capacités coupées (défaut F1) ⇒ refus nommé AVANT tout engagement, rien écrit ni dépensé', async () => {
    const r = await lancer([], BASE_ENV, texteBrut);
    expect(r.code).toBe(2);
    expect(r.refus.join('\n'), 'le pas 1 n’a pas dit que les capacités sont coupées').toContain('INTERRUPTEUR_COUPE · « Génération d’images » · non activé pour cet espace. Rien n’a été écrit ni débité.');
    expect(r.refus.join('\n')).toContain(`STUDIOS_ESPACES_PILOTES=${RECETTE.workspaceId}`);
    // Même avec la confirmation exacte, rien ne part.
    const montant = usdAffiche(r.devis!.afficheUsdMicros).replace(' $', '');
    const r2 = await lancer(['--confirmer-usd', montant], BASE_ENV, texteBrut);
    expect(r2.code).toBe(2);
    expect({ depenses: (await db!.select().from(schema.aiSpend)).length, jobs: (await db!.select().from(schema.studioJobs)).length, soumissions: fal.soumissions }).toEqual({ depenses: 0, jobs: 0, soumissions: 0 });
  });

  it('capacité coupée APRÈS la vérification (réglage de l’espace) ⇒ la garde du worker garde le job en file : 0 soumission fal', async () => {
    const r0 = await lancer([], OUVERT, texteBrut);
    expect(r0.refus.join('\n')).not.toContain('INTERRUPTEUR_COUPE');
    const montant = usdAffiche(r0.devis!.afficheUsdMicros).replace(' $', '');
    const r = await lancer(['--confirmer-usd', montant], OUVERT, texteQuiCoupe);
    expect(fal.soumissions, 'le moteur du pas 1 a soumis un job dont la capacité est coupée · garde du worker absente').toBe(0);
    expect(r.code, JSON.stringify(r.refus)).toBe(3);
    const [j] = await db!.select().from(schema.studioJobs).where(eq(schema.studioJobs.workspaceId, RECETTE.workspaceId));
    expect(j?.state).toBe('queued');
  }, 60_000);
});
