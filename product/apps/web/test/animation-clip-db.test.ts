import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Animation d'un plan · de bout en bout sur une VRAIE base (pglite +
 * migrations réelles). Aucun réseau, 0 $ : le devis et l'approbation sont
 * réels, le corps fal est préparé par le VRAI préparateur du worker, rien
 * n'est envoyé.
 *
 *  · sans image clé produite pour le plan ⇒ devis refusé, aucune ligne ;
 *  · image clé produite et valide ⇒ devis d'un clip au forfait vidéo, écran
 *    « clip à animer » avec devis ; approbation ⇒ job dont l'instantané porte
 *    `studio_clip/1` (image clé et son empreinte) ;
 *  · worker ⇒ corps image → vidéo (adresse publique de l'image clé, 5 s) ;
 *    image clé modifiée depuis ⇒ bloqué avant tout envoi ;
 *  · fournisseur non branché ⇒ devis refusé, comme avant.
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
import { cleFournisseurDuJob, lireSnapshotJob, GRILLE_STUDIO, SCHEMA_PARAMETRES_CLIP, type SondeVideo } from '@tiktrends/core';
import { publicUrlFor, type StorageConfig } from '@tiktrends/integrations';
import { semer } from './studios-semis';
import { ctxDe, poserSolde, projetTest, banc, jusquAuBout } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { lireVideoPour } from '../lib/studios/video/lecture';
import { publierSondeVideo } from '../../workers/src/studios/sonde-video';
import { preparateurFal } from '../../workers/src/studios/fournisseurs';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const PLAN = 's_ouverture';
const CFG: StorageConfig = { endpoint: 's3.gra.io.cloud.ovh.net', region: 'gra', bucket: 'tiktrends-test', accessKeyId: 'x', secretAccessKey: 'y' };
const MODELES = { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit', animation: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' };
const LECTURE = { maintenant: new Date(), releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };
const BRANCHE = { FAL_KEY: 'cle-fal-reelle-de-test', STUDIO_FOURNISSEUR_REEL: 'autorise', S3_ENDPOINT: CFG.endpoint, S3_BUCKET: CFG.bucket, S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'y' };
let projet = { projectId: '', versionId: '' };
let keyframe = { id: '', sha256: '', cle: '' };

const sonde = (): SondeVideo => ({
  version: 1, sondeLe: new Date().toISOString(), workerId: 'worker-test', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'échantillon décodé en entier', dureeMs: 480 }, encodeurs: { libx264: true, aac: true },
});
const brancher = (oui: boolean) => { for (const [k, v] of Object.entries(BRANCHE)) vi.stubEnv(k, oui ? v : ''); };
const nbDevis = async () => (await db.select().from(schema.studioQuotes)).length;
const devisClip = () => creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: [`clip:${PLAN}`], variante: true }, base, new Date());

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 1000);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
  await publierSondeVideo(base, sonde());
  brancher(true);
});

describe('animation d’un plan · devis, approbation, corps fal', () => {
  it('sans image clé produite ⇒ devis refusé (MISSING_REFERENCE), aucune ligne', async () => {
    const avant = await nbDevis();
    const d = await devisClip();
    expect(d).toMatchObject({ ok: false, code: 'MISSING_REFERENCE', targetIds: [`clip:${PLAN}`] });
    expect(!d.ok && d.message).toMatch(/pas d’image clé valide/);
    expect(await nbDevis()).toBe(avant);
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projet.projectId, LECTURE);
    expect(l.ok && l.vue.clips[PLAN]).toMatchObject({ etat: 'a_produire', keyframePrete: false, devis: null });
  });

  it('image clé produite (job réel, worker du banc) ⇒ devis d’un clip au forfait vidéo, l’écran le montre', async () => {
    const dk = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: [`keyframe:${PLAN}`], variante: true }, base, new Date());
    if (!dk.ok) throw new Error(dk.code);
    const ak = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: dk.devis.id, inputHash: dk.devis.inputHash, creditsAnnonces: dk.devis.maximumCredits, idempotencyKey: `k-${dk.devis.id}` }, { illimite: false });
    if (!ak.ok) throw new Error(ak.code);
    expect(await jusquAuBout(db, banc(db).moteur, ak.job.id)).toBe('completed');
    const [a] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.projectId, projet.projectId));
    // Le banc dépose sous `simule/` ; un média réel a une clé de stockage du bucket.
    keyframe = { id: a!.id, sha256: a!.sha256, cle: `studios/${a!.id}.png` };
    await db.update(schema.studioAssets).set({ storageKey: keyframe.cle }).where(eq(schema.studioAssets.id, a!.id));

    const d = await devisClip();
    expect(d.ok, !d.ok ? `${d.code} ${d.message}` : '').toBe(true);
    if (!d.ok) return;
    const lignes = (await db.select().from(schema.studioQuotes).where(eq(schema.studioQuotes.id, d.devis.id)))[0]!.lines as Array<{ operation: string; profil: string; usdMicros: number }>;
    expect(lignes.filter((x) => x.profil !== 'calcul').map((x) => [x.operation, x.profil, x.usdMicros])).toEqual([[`clip:${PLAN}`, 'animation', GRILLE_STUDIO.animation.usdMicros]]);
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projet.projectId, LECTURE);
    expect(l.ok && l.vue.disponibilite.animation.disponible).toBe(true);
    expect(l.ok && l.vue.clips[PLAN]).toMatchObject({ etat: 'a_produire', keyframePrete: true, devis: { id: d.devis.id } });
  });

  it('approbation ⇒ job en file dont l’instantané porte studio_clip/1 (image clé et son empreinte)', async () => {
    const d = await devisClip();
    if (!d.ok) throw new Error(d.code);
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `c-${d.devis.id}` }, { illimite: false });
    expect(r.ok, !r.ok ? r.code : '').toBe(true);
    if (!r.ok) return;
    const [job] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, r.job.id));
    const p = lireSnapshotJob(job!.snapshot)?.parametres as Record<string, unknown>;
    expect(p).toMatchObject({ schema: SCHEMA_PARAMETRES_CLIP, operation: `clip:${PLAN}`, source: { assetId: `sta_${keyframe.id}`, sha256: keyframe.sha256 }, dureeS: 5 });
    expect(String(p.consigne)).toMatch(/^Mouvement : /);

    // Le VRAI préparateur du worker · corps image → vidéo, adresse publique de l'image clé.
    const preparer = preparateurFal(base, { modeles: MODELES, stockage: CFG });
    const cle = cleFournisseurDuJob(r.job.id);
    const prep = await preparer({ cleIdempotence: cle, operations: [], parametres: {} }, r.job.id);
    expect(prep).toEqual({ ok: true, workspaceId: ids.wsA, modele: MODELES.animation, corps: { prompt: p.consigne, image_url: publicUrlFor(CFG, keyframe.cle), duration: '5', negative_prompt: expect.any(String) } });

    // Image clé modifiée depuis le devis ⇒ bloqué avant tout envoi, tracé.
    await db.update(schema.studioAssets).set({ sha256: 'f'.repeat(64) }).where(eq(schema.studioAssets.id, keyframe.id));
    const bloque = await preparer({ cleIdempotence: cle, operations: [], parametres: {} }, r.job.id);
    expect(bloque).toMatchObject({ ok: false, motif: expect.stringMatching(/^MISSING_REFERENCE · image clé modifiée depuis le devis/) });
    await db.update(schema.studioAssets).set({ sha256: keyframe.sha256 }).where(eq(schema.studioAssets.id, keyframe.id));
    const traces = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, r.job.id));
    expect(traces.map((t) => t.action).filter((a) => a.startsWith('job.provider')).sort()).toEqual(['job.provider.blocked', 'job.provider.payload']);
  });

  it('fournisseur non branché ⇒ devis du clip refusé, comme avant', async () => {
    brancher(false);
    try {
      const d = await devisClip();
      expect(d).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: expect.stringMatching(/aucun fournisseur d’animation/) });
    } finally {
      brancher(true);
    }
  });
});
