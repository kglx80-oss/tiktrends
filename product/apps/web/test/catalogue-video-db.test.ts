import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Catalogue vidéo des Studios · de bout en bout sur une VRAIE base (pglite +
 * migrations réelles). Aucun réseau, 0 $ : devis et approbation réels, corps
 * préparé par le VRAI préparateur du worker, réserve calculée par la VRAIE
 * règle du worker (`coutSoumissionStudio`), rien n'est envoyé.
 *
 *  · `FAL_VIDEO_MODEL_STUDIO` = Veo 3.1 Lite ⇒ l'écran annonce le prix du plan,
 *    le devis le reprend à la seconde (estimation), l'approbation débite ces
 *    crédits, le worker prépare le corps Veo du modèle DEVISÉ (pas le sien) et
 *    réserve au plancher de l'ancien forfait (aucune facture rapprochée) ;
 *  · modèle de l'environnement changé entre le devis et l'approbation ⇒ le
 *    job part au modèle FIGÉ au devis ; devis d'avant le catalogue ⇒ refus
 *    nommé, rien débité ; modèle hors catalogue ⇒ devis refusé ;
 *  · instantané `studio_clip/1` en file ⇒ Kling 5 s au prix de son devis, ou
 *    refus avant envoi ;
 *  · Kling + prise parlée en français ⇒ voix native refusée (raison écrite à
 *    l'écran avant le clic), clip muet au prix muet.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
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

import { db, schema, eq } from '@tiktrends/db';
import { cleFournisseurDuJob, coutSoumissionStudio, lireSnapshotJob, operationsDuSnapshot, type SondeVideo } from '@tiktrends/core';
import type { StorageConfig } from '@tiktrends/integrations';
import { semer } from './studios-semis';
import { ctxDe, poserSolde, solde, projetTest, banc, jusquAuBout } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { lireVideoPour } from '../lib/studios/video/lecture';
import { publierSondeVideo } from '../../workers/src/studios/sonde-video';
import { preparateurFal } from '../../workers/src/studios/fournisseurs';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const PLAN = 's_ouverture';
const VEO_LITE = 'fal-ai/veo3.1/lite/image-to-video';
const VEO_FAST = 'fal-ai/veo3.1/fast/image-to-video';
const KLING = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const CFG: StorageConfig = { endpoint: 's3.gra.io.cloud.ovh.net', region: 'gra', bucket: 'tiktrends-test', accessKeyId: 'x', secretAccessKey: 'y' };
// Le worker tourne avec SON défaut (Kling) · un clip devisé part au modèle de son devis.
const MODELES_WORKER = { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit', animation: KLING };
const LECTURE = { maintenant: new Date(), releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };
const BRANCHE = { FAL_KEY: 'cle-fal-reelle-de-test', STUDIO_FOURNISSEUR_REEL: 'autorise', S3_ENDPOINT: CFG.endpoint, S3_BUCKET: CFG.bucket, S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'y' };
let projet = { projectId: '', versionId: '' };

const sonde = (): SondeVideo => ({
  version: 1, sondeLe: new Date().toISOString(), workerId: 'worker-test', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'échantillon décodé en entier', dureeMs: 480 }, encodeurs: { libx264: true, aac: true },
});
const brancher = () => { for (const [k, v] of Object.entries(BRANCHE)) vi.stubEnv(k, v); };
const modeleStudio = (m: string) => vi.stubEnv('FAL_VIDEO_MODEL_STUDIO', m);
const devisClip = (projectId = projet.projectId) => creerDevis(ctxDe(ids, 'ua'), { projectId, operations: [`clip:${PLAN}`], variante: true }, base, new Date());
const approuver = (d: { id: string; inputHash: string; maximumCredits: number }) =>
  approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.id, inputHash: d.inputHash, creditsAnnonces: d.maximumCredits, idempotencyKey: `c-${d.id}` }, { illimite: false });

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 5000);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
  await publierSondeVideo(base, sonde());
  brancher();
  // Image clé produite (job réel, worker du banc), déposée comme un média réel.
  const dk = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: [`keyframe:${PLAN}`], variante: true }, base, new Date());
  if (!dk.ok) throw new Error(dk.code);
  const ak = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: dk.devis.id, inputHash: dk.devis.inputHash, creditsAnnonces: dk.devis.maximumCredits, idempotencyKey: `k-${dk.devis.id}` }, { illimite: false });
  if (!ak.ok) throw new Error(ak.code);
  expect(await jusquAuBout(db, banc(db).moteur, ak.job.id)).toBe('completed');
  const [a] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.projectId, projet.projectId));
  await db.update(schema.studioAssets).set({ storageKey: `studios/${a!.id}.png` }).where(eq(schema.studioAssets.id, a!.id));
});
afterEach(() => { vi.unstubAllEnvs(); brancher(); });

describe('catalogue vidéo · écran, devis, approbation, préparation et réserve du worker', () => {
  it('Veo 3.1 Lite · écran = devis = débit = réserve du worker (4 s × 0,03 $, 72 crédits), corps Veo du modèle devisé', async () => {
    modeleStudio(VEO_LITE);
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projet.projectId, LECTURE);
    expect(l.ok && l.vue.clips[PLAN]!.prix).toEqual({ ok: true, modele: VEO_LITE, libelleModele: 'Veo 3.1 Lite', dureeS: 4, audio: false, credits: 72, usdMicros: 120_000, limites: [] });

    const d = await devisClip();
    expect(d.ok, !d.ok ? `${d.code} ${d.message}` : '').toBe(true);
    if (!d.ok) return;
    const clip = d.devis.lignes.filter((x) => x.profil === 'animation');
    expect(clip.map((x) => [x.operation, x.unites, x.usdMicros, x.credits])).toEqual([[`clip:${PLAN}`, 4, 30_000, 18]]);
    expect((clip[0] as unknown as { clip: unknown }).clip).toEqual({ modele: VEO_LITE, dureeS: 4, audio: false, resolution: '720p', ratio: '9:16' });
    expect(clip[0]!.motifEstimation).toMatch(/^Veo 3\.1 Lite · 4 s × 0,03 \$\/s muet · prix catalogue fal relevé le 16\/11\/2026/);
    expect([d.devis.maximumCredits, d.devis.maximumUsdMicros]).toEqual([72, 120_000]);

    const avant = await solde(db, ids.wsA);
    const r = await approuver(d.devis);
    expect(r.ok, !r.ok ? `${r.code} ${'message' in r ? r.message : ''}` : '').toBe(true);
    if (!r.ok) return;
    expect(avant - (await solde(db, ids.wsA))).toBe(72);
    const [job] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, r.job.id));
    const snap = lireSnapshotJob(job!.snapshot)!;
    expect(snap.parametres).toMatchObject({ schema: 'studio_clip/2', modele: VEO_LITE, dureeS: 4, audio: false, resolution: '720p', ratio: '9:16' });

    const prep = await preparateurFal(base, { modeles: MODELES_WORKER, stockage: CFG })({ cleIdempotence: cleFournisseurDuJob(r.job.id), operations: [], parametres: {} }, r.job.id);
    if (!prep.ok) throw new Error(prep.motif);
    expect(prep.modele).toBe(VEO_LITE);
    expect(prep.corps).toEqual({ prompt: snap.parametres.consigne, image_url: expect.stringMatching(/^https:\/\//), duration: '4s', aspect_ratio: '9:16', resolution: '720p', generate_audio: false, negative_prompt: expect.any(String) });

    // La règle que le worker applique avant d'envoyer · réserve au plancher (0,60 $) tant qu'aucune facture n'est rapprochée ; le devis dit l'estimation (0,12 $).
    const reserve = coutSoumissionStudio(operationsDuSnapshot(snap), { parametres: snap.parametres, modele: prep.modele });
    expect(reserve).toMatchObject({ ok: true, usdMicros: 600_000, modele: VEO_LITE, poste: 'fal_video' });
    expect(snap.reserve.usdMicros).toBe(120_000);
  });

  it('modèle de l’environnement changé après le devis ⇒ le job part au modèle FIGÉ au devis, au prix annoncé', async () => {
    modeleStudio(VEO_FAST);
    const d = await devisClip();
    if (!d.ok) throw new Error(`${d.code} ${d.message}`);
    expect([d.devis.maximumCredits, d.devis.maximumUsdMicros]).toEqual([232, 400_000]);
    modeleStudio(KLING);
    const avant = await solde(db, ids.wsA);
    const r = await approuver(d.devis);
    if (!r.ok) throw new Error(`${r.code} ${'message' in r ? r.message : ''}`);
    expect(avant - (await solde(db, ids.wsA))).toBe(232);
    const [job] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, r.job.id));
    expect(lireSnapshotJob(job!.snapshot)!.parametres).toMatchObject({ modele: VEO_FAST, dureeS: 4, resolution: '1080p', ratio: '9:16' });
  });

  it('devis d’avant le catalogue (ligne sans choix figé) ⇒ refus propre, aucun job, rien débité', async () => {
    modeleStudio(KLING);
    const d = await devisClip();
    if (!d.ok) throw new Error(`${d.code} ${d.message}`);
    const Q = schema.studioQuotes;
    const [q] = await db.select().from(Q).where(eq(Q.id, d.devis.id));
    // La table des devis est en ajout seul · on écrit un devis jumeau tel que main l'écrivait (ligne sans choix figé).
    const anciennes = (q!.lines as Array<Record<string, unknown>>).map(({ clip: _c, ...l }) => l);
    const { id: _id, createdAt: _cr, ...reste } = q!;
    const [ancien] = await db.insert(Q).values({ ...reste, lines: anciennes }).returning();
    const avant = await solde(db, ids.wsA);
    const jobs = (await db.select().from(schema.studioJobs)).length;
    const r = await approuver({ id: ancien!.id, inputHash: ancien!.inputHash, maximumCredits: ancien!.maximumCredits });
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', message: 'Ce devis date d’avant le catalogue vidéo · redemande un devis. Rien n’a été débité.' });
    expect(await solde(db, ids.wsA)).toBe(avant);
    expect((await db.select().from(schema.studioJobs)).length).toBe(jobs);
  });

  it('choix figé au devis ≠ ce qui partirait (même modèle, même prix, autre résolution) ⇒ refus nommé, rien débité', async () => {
    modeleStudio(VEO_FAST);
    const d = await devisClip();
    if (!d.ok) throw new Error(`${d.code} ${d.message}`);
    const Q = schema.studioQuotes;
    const [q] = await db.select().from(Q).where(eq(Q.id, d.devis.id));
    // Veo Fast coûte autant en 720p qu'en 1080p · un devis jumeau figé en 720p, mêmes montants.
    const lignes = (q!.lines as Array<Record<string, unknown>>).map((l) => (l.profil === 'animation' ? { ...l, clip: { ...(l.clip as Record<string, unknown>), resolution: '720p' } } : l));
    const { id: _id, createdAt: _cr, ...reste } = q!;
    const [jumeau] = await db.insert(Q).values({ ...reste, lines: lignes }).returning();
    const avant = await solde(db, ids.wsA);
    const r = await approuver({ id: jumeau!.id, inputHash: jumeau!.inputHash, maximumCredits: jumeau!.maximumCredits });
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', message: 'Le modèle, la durée, la voix ou le format du clip ont changé depuis ce devis · redemande un devis. Rien n’a été débité.' });
    expect(await solde(db, ids.wsA)).toBe(avant);
  });

  it('modèle Studios hors catalogue ⇒ devis refusé, raison écrite, aucune ligne', async () => {
    modeleStudio('fal-ai/kling-video/v2/master/image-to-video');
    const n = (await db.select().from(schema.studioQuotes)).length;
    const d = await devisClip();
    expect(d).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'Modèle vidéo non chiffré au catalogue · ajoute-le au catalogue avec son prix avant de l’utiliser (fal-ai/kling-video/v2/master/image-to-video).' });
    expect((await db.select().from(schema.studioQuotes)).length).toBe(n);
  });

  it('instantané studio_clip/1 en file au déploiement ⇒ Kling 5 s au prix de son devis de main (0,60 $) ; worker sur Veo ⇒ refusé avant envoi', async () => {
    modeleStudio(KLING);
    const d = await devisClip();
    if (!d.ok) throw new Error(`${d.code} ${d.message}`);
    const r = await approuver(d.devis);
    if (!r.ok) throw new Error(r.code);
    const J = schema.studioJobs;
    const [job] = await db.select().from(J).where(eq(J.id, r.job.id));
    const snap = lireSnapshotJob(job!.snapshot)!;
    const { modele: _m, audio: _a, resolution: _r, ratio: _q, ...v1 } = snap.parametres as Record<string, unknown>;
    // L'instantané tel que main l'écrivait · ligne au forfait (200 crédits, 0,60 $).
    const lignesMain = snap.lignes.map((l) => (l.profil === 'animation' ? { operation: l.operation, nature: l.nature, profil: l.profil, unites: 1, credits: 200, usdMicros: 600_000, inclus: false } : l));
    await db.update(J).set({ snapshot: { ...snap, lignes: lignesMain, reserve: { credits: 200, usdMicros: 600_000 }, parametres: { ...v1, schema: 'studio_clip/1' } } }).where(eq(J.id, r.job.id));
    const ancien = lireSnapshotJob((await db.select().from(J).where(eq(J.id, r.job.id)))[0]!.snapshot)!;
    const cle = cleFournisseurDuJob(r.job.id);
    const prep = await preparateurFal(base, { modeles: MODELES_WORKER, stockage: CFG })({ cleIdempotence: cle, operations: [], parametres: {} }, r.job.id);
    if (!prep.ok) throw new Error(prep.motif);
    expect(prep.modele).toBe(KLING);
    expect(prep.corps).toEqual({ prompt: ancien.parametres.consigne, image_url: expect.stringMatching(/^https:\/\//), duration: '5', negative_prompt: expect.any(String) });
    expect(coutSoumissionStudio(operationsDuSnapshot(ancien), { parametres: ancien.parametres, modele: prep.modele })).toMatchObject({ ok: true, usdMicros: ancien.reserve.usdMicros });
    const veo = await preparateurFal(base, { modeles: { ...MODELES_WORKER, animation: VEO_FAST }, stockage: CFG })({ cleIdempotence: cle, operations: [], parametres: {} }, r.job.id);
    expect(veo).toMatchObject({ ok: false, motif: expect.stringMatching(/^INVALID_SCHEMA · instantané studio_clip\/1/) });
  });

  it('Kling + prise parlée en français ⇒ l’écran dit avant le clic que la voix native est refusée, le devis part MUET au prix muet', async () => {
    modeleStudio(KLING);
    const parle = await projetTest(db, ids, ids.brandA1, ids.ua, (c) => { c.shots.byId[PLAN]!.speechMode = 'lipsync'; });
    const l = await lireVideoPour(ctxDe(ids, 'ua'), parle.projectId, LECTURE);
    expect(l.ok && l.vue.clips[PLAN]!.prix).toMatchObject({ ok: true, audio: false, credits: 200, limites: [expect.stringMatching(/^Voix native en français refusée avec Kling 2\.5 turbo pro/)] });
  });
});
