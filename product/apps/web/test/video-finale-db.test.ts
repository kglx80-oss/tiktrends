import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Vidéo finale · de bout en bout sur une VRAIE base (pglite + migrations
 * réelles), avec le VRAI assembleur (ffmpeg du conteneur). Aucun réseau, 0 $.
 *
 * Chaque plan du projet reçoit son image clé puis son clip animé par le
 * worker du banc (fournisseur simulé, décodeur vidéo RÉEL) ; on lit ensuite :
 *  · l'écran dit pourquoi la vidéo finale n'est pas encore possible (plan nommé) ;
 *  · une fois tous les clips là : assemblage, fichier H.264/AAC conservé
 *    (ligne `studio_assets` origine `render`, durée = somme des plans), audit,
 *    l'écran montre la dernière vidéo ;
 *  · un clip devenu illisible ⇒ refus nommé, rien n'est conservé ;
 *  · un lecteur client (sans export) ⇒ FORBIDDEN ; un autre espace ⇒ NOT_FOUND ;
 *  · deux assemblages simultanés ⇒ le second est refusé et dit, le verrou se
 *    libère même quand l'assembleur échoue.
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

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, schema, eq, and } from '@tiktrends/db';
import { dureePlanMs, type ContenuVersion, type SondeVideo, type StockageStudio } from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe, poserSolde, projetTest, banc, jusquAuBout } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { lireVideoPour } from '../lib/studios/video/lecture';
import { assemblerVideoFinalePour, ACTION_AUDIT_VIDEO_FINALE, ASSEMBLAGES_SIMULTANES_MAX } from '../lib/studios/video/rendu-final';
import { publierSondeVideo } from '../../workers/src/studios/sonde-video';
import { DecodeurSharp } from '../../workers/src/studios/decodeur';
import { decoderVideoFfmpeg } from '../../workers/src/studios/decodeur-video';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const LECTURE = { maintenant: new Date(), releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };
const BRANCHE = { FAL_KEY: 'cle-fal-reelle-de-test', STUDIO_FOURNISSEUR_REEL: 'autorise', S3_ENDPOINT: 'e', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'x', S3_SECRET_ACCESS_KEY: 'y' };
const sonde = (): SondeVideo => ({
  version: 1, sondeLe: new Date().toISOString(), workerId: 'worker-test', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'échantillon décodé en entier', dureeMs: 480 }, encodeurs: { libx264: true, aac: true },
});

describe.skipIf(!FFMPEG)('vidéo finale · assemblage réel des clips des plans', () => {
  let projet = { projectId: '', versionId: '' };
  let dossier = '';
  let VIDEO = new Uint8Array();
  let musiqueId = '';
  let octetsMusique = new Uint8Array();
  const CLE_MUSIQUE = 'simule/musique.m4a';
  let w: ReturnType<typeof banc>;
  const conserve = new Map<string, Uint8Array>();
  const memoire: StockageStudio = { async deposer(cle, o) { conserve.set(cle, o); }, async relire(cle) { return conserve.get(cle) ?? null; } };
  const lecteur = { lire: async (m: { storageKey: string }) => w.stockage.relire(m.storageKey) };

  async function lancer(operation: string): Promise<string> {
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: [operation], variante: true }, base, new Date());
    if (!d.ok) throw new Error(`${operation} · ${d.code} ${d.message}`);
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `k-${d.devis.id}` }, { illimite: true });
    if (!r.ok) throw new Error(`${operation} · ${r.code}`);
    return r.job.id;
  }
  async function produire(sid: string): Promise<void> {
    // Image clé (le banc dépose sous `simule/` ; un média réel a une clé du bucket).
    expect(await jusquAuBout(db, w.moteur, await lancer(`keyframe:${sid}`))).toBe('completed');
    const S = schema.studioAssets;
    for (const a of await db.select().from(S).where(and(eq(S.projectId, projet.projectId), eq(S.mime, 'image/png')))) {
      if (a.storageKey.startsWith('simule/')) await db.update(S).set({ storageKey: `studios/kf-${a.id}.png` }).where(eq(S.id, a.id));
    }
    // Clip · le fournisseur simulé rend une VRAIE vidéo, décodée en entier par ffmpeg.
    const job = await lancer(`clip:${sid}`);
    w.fournisseur.prochaine('sortie_imposee');
    w.fournisseur.octetsImposes = VIDEO;
    expect(await jusquAuBout(db, w.moteur, job)).toBe('completed');
  }

  beforeAll(async () => {
    dossier = mkdtempSync(join(tmpdir(), 'video-finale-'));
    const f = join(dossier, 'clip.mp4');
    const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=288x512:rate=24:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4', f], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    VIDEO = new Uint8Array(readFileSync(f));
    for (const [k, v] of Object.entries(BRANCHE)) vi.stubEnv(k, v);
    await semer(db, schema, ids);
    await poserSolde(db, ids.wsA, 1000);
    // Musique · une VRAIE piste AAC de la marque, choisie dans la timeline du projet.
    const fm = join(dossier, 'musique.m4a');
    const rm = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30', '-c:a', 'aac', '-f', 'mp4', fm], { encoding: 'utf8' });
    if (rm.status !== 0) throw new Error(rm.stderr);
    octetsMusique = new Uint8Array(readFileSync(fm));
    const [mu] = await db.insert(schema.studioAssets).values({
      workspaceId: ids.wsA, brandId: ids.brandA1, projectId: null, storageKey: CLE_MUSIQUE, mime: 'audio/mp4', bytes: octetsMusique.length,
      width: null, height: null, durationMs: 30_000, sha256: createHash('sha256').update(octetsMusique).digest('hex'),
      origin: 'upload', rights: {}, parentAssetId: null, storageState: 'stored', createdBy: ids.ua,
    }).returning();
    musiqueId = mu!.id;
    projet = await projetTest(db, ids, ids.brandA1, ids.ua, (c) => { c.timeline!.music = { assetId: musiqueId, gainDb: -12 }; });
    await publierSondeVideo(base, sonde());
    w = banc(db, { decodeur: new DecodeurSharp({ video: (o) => decoderVideoFfmpeg(o) }) });
    await w.stockage.deposer(CLE_MUSIQUE, octetsMusique);
    return () => rmSync(dossier, { recursive: true, force: true });
  });

  it('un plan sans clip ⇒ l’écran dit lequel, aucun bouton actif', async () => {
    await produire('s_ouverture');
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projet.projectId, LECTURE);
    expect(l.ok && l.vue.videoFinale).toMatchObject({ possible: false, derniere: null, raison: expect.stringContaining('Le plan 2 n’a pas de clip animé valide') });
    expect(l.ok && l.vue.clips.s_ouverture?.etat).toBe('valide');
  });

  it('tous les clips ⇒ vidéo H.264/AAC assemblée, conservée (render, durée des plans), auditée, montrée à l’écran', async () => {
    await produire('s_produit');
    await produire('s_fin');
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, projet.versionId));
    const c = v!.content as ContenuVersion;
    const attendu = c.shots.order.reduce((t, sid) => t + Math.round(dureePlanMs(c.shots.byId[sid]!)), 0);

    const r = await assemblerVideoFinalePour(ctxDe(ids, 'ua'), { projectId: projet.projectId }, { lecteur, stockage: memoire });
    expect(r.ok, !r.ok ? `${r.code} ${r.message}` : '').toBe(true);
    if (!r.ok) return;
    // Durée MESURÉE par ffprobe sur le fichier produit (trame AAC comprise) · à une image + 100 ms du montage.
    expect(Math.abs(r.video.dureeMs - attendu)).toBeLessThanOrEqual(1000 / 30 + 100);
    expect([r.video.largeur, r.video.hauteur]).toEqual([1080, 1920]);
    const [a] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, r.video.assetId));
    expect(a).toMatchObject({ origin: 'render', mime: 'video/mp4', durationMs: r.video.dureeMs, width: 1080, height: 1920, storageState: 'stored', projectId: projet.projectId });
    expect(conserve.get(a!.storageKey)?.length).toBe(a!.bytes);
    expect(a!.rights).toMatchObject({ videoFinale: { versionId: projet.versionId, musique: musiqueId } });
    expect((a!.rights as { videoFinale: { clips: string[] } }).videoFinale.clips).toHaveLength(c.shots.order.length);
    // Le fichier conservé est relu ici aussi : H.264 + AAC, et la piste n'est PAS silencieuse (la musique y est).
    const f = join(dossier, 'final.mp4');
    writeFileSync(f, conserve.get(a!.storageKey)!);
    const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', f], { encoding: 'utf8' });
    expect(JSON.parse(pr.stdout).streams.map((x: { codec_name: string }) => x.codec_name).sort()).toEqual(['aac', 'h264']);
    const vol = spawnSync('ffmpeg', ['-nostdin', '-i', f, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const moyen = Number(/mean_volume: (-?[\d.]+) dB/.exec(vol.stderr)?.[1] ?? 'NaN');
    expect(moyen).toBeGreaterThan(-50);
    const au = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, ACTION_AUDIT_VIDEO_FINALE));
    expect(au).toHaveLength(1);
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projet.projectId, LECTURE);
    expect(l.ok && l.vue.videoFinale).toMatchObject({ possible: true, derniere: { assetId: r.video.assetId, dureeMs: r.video.dureeMs } });
  });

  it('un clip devenu illisible ⇒ refus nommé, rien n’est conservé ; un lecteur client ou un autre espace ⇒ refus', async () => {
    const avant = conserve.size;
    const clipsPerdus = { lire: async (m: { storageKey: string }) => (m.storageKey === CLE_MUSIQUE ? w.stockage.relire(m.storageKey) : null) };
    const r = await assemblerVideoFinalePour(ctxDe(ids, 'ua'), { projectId: projet.projectId }, { lecteur: clipsPerdus, stockage: memoire });
    expect(r).toMatchObject({ ok: false, code: 'MISSING_REFERENCE', targetIds: ['clip:s_ouverture'] });
    expect(conserve.size).toBe(avant);
    expect(await assemblerVideoFinalePour(ctxDe(ids, 'uv'), { projectId: projet.projectId }, { lecteur, stockage: memoire })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await assemblerVideoFinalePour(ctxDe(ids, 'ub'), { projectId: projet.projectId }, { lecteur, stockage: memoire })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(conserve.size).toBe(avant);
  });

  it('deux assemblages simultanés ⇒ le second refusé, rien de conservé ; le verrou se libère même après un échec', async () => {
    expect(ASSEMBLAGES_SIMULTANES_MAX).toBe(1);
    const avant = conserve.size;
    let liberer: () => void = () => {};
    let entre: () => void = () => {};
    const bloque = new Promise<void>((ok) => { liberer = ok; });
    const dedans = new Promise<void>((ok) => { entre = ok; });
    const lent = async () => { entre(); await bloque; return { ok: false as const, motif: 'arrêté par le test', cause: 'rendu' as const }; };
    const premier = assemblerVideoFinalePour(ctxDe(ids, 'ua'), { projectId: projet.projectId }, { lecteur, stockage: memoire, assembler: lent });
    await dedans; // le premier tient le verrou, dans l'assembleur
    const second = await assemblerVideoFinalePour(ctxDe(ids, 'ua'), { projectId: projet.projectId }, { lecteur, stockage: memoire });
    expect(second).toMatchObject({ ok: false, code: 'RATE_LIMITED', message: expect.stringContaining('déjà en cours') });
    liberer();
    expect(await premier).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(conserve.size).toBe(avant);
    // Libéré malgré l'échec · un assemblage suivant passe.
    const ensuite = await assemblerVideoFinalePour(ctxDe(ids, 'ua'), { projectId: projet.projectId }, { lecteur, stockage: memoire });
    expect(ensuite.ok).toBe(true);
  });
});
