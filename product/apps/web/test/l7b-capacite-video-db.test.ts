import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L7-B · la capacité vidéo SONDÉE, lue côté serveur, sur une VRAIE base
 * (pglite + migrations réelles). Aucun réseau, 0 $ : on s'arrête au devis.
 *
 *  · sans sonde (ou sonde périmée, ou échantillon non décodé) ⇒ le devis d'un
 *    clip reste refusé `UNSUPPORTED_CAPABILITY` comme avant, l'écran dit
 *    « aucun décodeur vidéo » ;
 *  · sonde fraîche publiée par le worker (`publierSondeVideo`, ligne
 *    `app_settings`) ⇒ le contrôle de DÉCODAGE passe ; le devis reste refusé,
 *    mais pour la bonne raison : aucun fournisseur d'animation n'est branché.
 *  · worker complet (ffmpeg présent) · une vraie vidéo est livrée, une vidéo
 *    à charge utile abîmée est refusée par le décodage complet.
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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, schema, eq } from '@tiktrends/db';
import {
  CLE_SONDE_VIDEO, FRAICHEUR_SONDE_VIDEO_MS, RAISON_ANIMATION_INDISPONIBLE, RAISON_ANIMATION_SANS_FOURNISSEUR, CREDIT_COSTS, inspecterMedia,
  type SondeVideo,
} from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe, poserSolde, solde, projetTest, banc, jusquAuBout, etatEnBase } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { lireCapaciteVideo } from '../lib/studios/execution/capacite-video';
import { lireVideoPour } from '../lib/studios/video/lecture';
import { publierSondeVideo, sonderVideo } from '../../workers/src/studios/sonde-video';
import { DecodeurSharp } from '../../workers/src/studios/decodeur';
import { decoderVideoFfmpeg } from '../../workers/src/studios/decodeur-video';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
const base = db as unknown as BaseStudio;
const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const LECTURE = { maintenant: new Date(), releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };
let projet = { projectId: '', versionId: '' };

const sonde = (o: Partial<SondeVideo> = {}): SondeVideo => ({
  version: 1, sondeLe: new Date().toISOString(), workerId: 'worker-test', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'échantillon 32×32 de 12 images décodé en entier', dureeMs: 480 }, encodeurs: { libx264: true, aac: true }, ...o,
});
const effacerSonde = () => db.delete(schema.appSettings).where(eq(schema.appSettings.key, CLE_SONDE_VIDEO));
const nbDevis = async () => (await db.select().from(schema.studioQuotes)).length;
const devisClip = () => creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['clip:s_ouverture'], variante: true }, base, new Date());

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 1000);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
});
beforeEach(async () => { await effacerSonde(); LECTURE.maintenant = new Date(); });

describe('sans preuve fraîche · le devis vidéo reste refusé (comportement d’avant)', () => {
  it('aucune sonde ⇒ UNSUPPORTED_CAPABILITY « ne sait pas vérifier », aucun devis, écran « aucun décodeur »', async () => {
    const avant = await nbDevis();
    const d = await devisClip();
    expect(d, 'une animation a passé le contrôle de décodage sans aucune sonde').toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', targetIds: ['clip:s_ouverture'] });
    expect(!d.ok && d.message).toMatch(/ne sait pas encore vérifier une vidéo produite/);
    expect(await nbDevis()).toBe(avant);
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projet.projectId, LECTURE);
    expect(l.ok && l.vue.disponibilite.animation).toEqual({ disponible: false, raison: RAISON_ANIMATION_INDISPONIBLE });
  });

  it('sonde périmée (au-delà de la borne) ⇒ refus identique', async () => {
    await publierSondeVideo(base, sonde({ sondeLe: new Date(Date.now() - FRAICHEUR_SONDE_VIDEO_MS - 60_000).toISOString() }));
    expect((await lireCapaciteVideo(base, new Date())).raison).toMatch(/^sonde vidéo périmée/);
    const d = await devisClip();
    expect(!d.ok && d.message).toMatch(/ne sait pas encore vérifier une vidéo produite/);
  });

  it('sonde fraîche mais échantillon NON décodé ⇒ refus identique', async () => {
    await publierSondeVideo(base, sonde({ decodage: { ok: false, raison: 'lecture incomplète', dureeMs: 3 } }));
    const d = await devisClip();
    expect(!d.ok && d.message).toMatch(/ne sait pas encore vérifier une vidéo produite/);
  });
});

describe('sonde fraîche · le contrôle de décodage passe, l’absence de fournisseur est dite', () => {
  it('le devis d’un clip n’est plus refusé pour le décodage, mais faute de fournisseur d’animation · aucun devis, aucun débit', async () => {
    await publierSondeVideo(base, sonde());
    expect(await lireCapaciteVideo(base, new Date())).toMatchObject({ decodage: true, encodeurs: { libx264: true, aac: true } });
    const avant = await nbDevis();
    const s0 = await solde(db, ids.wsA);
    const d = await devisClip();
    expect(!d.ok && d.message, 'avec une sonde fraîche, le devis invoque encore l’absence de décodeur').not.toMatch(/ne sait pas encore vérifier/);
    expect(d).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', targetIds: ['clip:s_ouverture'], message: 'Animation indisponible · aucun fournisseur d’animation n’est branché sur ce serveur · clip:s_ouverture. Retire-la du devis.' });
    expect(await nbDevis()).toBe(avant);
    expect(await solde(db, ids.wsA)).toBe(s0);
    // L'animation passe par le fournisseur studio (fal) : l'écran la dit indisponible exactement quand lui ne l'est pas.
    const l = await lireVideoPour(ctxDe(ids, 'ua'), projet.projectId, { ...LECTURE, fournisseurImage: false });
    expect(l.ok && l.vue.disponibilite.animation).toEqual({ disponible: false, raison: RAISON_ANIMATION_SANS_FOURNISSEUR });
  });

  it('une image clé se devise toujours, sonde ou pas', async () => {
    await publierSondeVideo(base, sonde());
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true }, base, new Date());
    expect(d.ok, !d.ok ? d.code : '').toBe(true);
  });

  it.skipIf(!FFMPEG)('sonde RÉELLE du worker (ffmpeg du conteneur) publiée ⇒ le contrôle de décodage passe', async () => {
    const s = await sonderVideo({ workerId: 'worker-reel' });
    expect(s.decodage.ok, s.decodage.raison).toBe(true);
    await publierSondeVideo(base, s);
    const [ligne] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, CLE_SONDE_VIDEO));
    expect(ligne!.value).toMatchObject({ version: 1, workerId: 'worker-reel', decodage: { ok: true } });
    const d = await devisClip();
    expect(!d.ok && d.message).toMatch(/^Animation indisponible · aucun fournisseur d’animation/);
  });
});

describe.skipIf(!FFMPEG)('worker complet · décodeur vidéo réel branché', () => {
  let dossier = '';
  let VIDEO = new Uint8Array();
  beforeAll(() => {
    dossier = mkdtempSync(join(tmpdir(), 'l7b-web-'));
    const f = join(dossier, 'v.mp4');
    const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x48:rate=24:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4', f], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
    VIDEO = new Uint8Array(readFileSync(f));
    return () => rmSync(dossier, { recursive: true, force: true });
  });

  async function jobEnFile(): Promise<string> {
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
    if (!d.ok) throw new Error(d.code);
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `k-${d.devis.id}` }, { illimite: false });
    if (!r.ok) throw new Error(r.code);
    return r.job.id;
  }
  const decodeur = () => new DecodeurSharp({ video: (o) => decoderVideoFfmpeg(o) });

  it('une vraie vidéo rendue par le fournisseur ⇒ décodée en entier, completed, média 64×48 relié', async () => {
    const id = await jobEnFile();
    const w = banc(db, { decodeur: decodeur() });
    w.fournisseur.prochaine('sortie_imposee');
    w.fournisseur.octetsImposes = VIDEO;
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    const e = await etatEnBase(db, id);
    expect(e.assets).toHaveLength(1);
    expect(e.assets[0]).toMatchObject({ mime: 'video/mp4', width: 64, height: 48, storageState: 'stored' });
    expect(e.violations).toEqual([]);
  });

  it('charge utile abîmée (boîtes intactes) ⇒ refusée par le décodage, jamais livrée, aucun crédit réglé', async () => {
    const abime = new Uint8Array(VIDEO);
    const dv = new DataView(abime.buffer);
    for (let i = 0; i + 8 <= abime.length;) {
      const t = dv.getUint32(i);
      if (String.fromCharCode(...abime.subarray(i + 4, i + 8)) === 'mdat') { for (let k = i + 8 + Math.floor((t - 8) / 2); k < i + t; k += 7) abime[k] = abime[k]! ^ 0x5a; break; }
      i += t;
    }
    expect(inspecterMedia(abime), 'précondition : structure plausible').toMatchObject({ mime: 'video/mp4' });
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const w = banc(db, { decodeur: decodeur() });
    w.fournisseur.prochaine('sortie_imposee');
    w.fournisseur.octetsImposes = abime;
    expect(await jusquAuBout(db, w.moteur, id)).toBe('failed');
    const e = await etatEnBase(db, id);
    expect(e.assets, 'une vidéo abîmée a été reliée').toEqual([]);
    expect((e.job.error as { motif?: string }).motif).toMatch(/décodage refusé|lecture incomplète/);
    expect(e.registre.filter((m) => m.kind === 'settle').map((m) => m.credits)).toEqual([0]);
    expect(await solde(db, ids.wsA)).toBe(s0 + CREDIT_COSTS.image);
  });
});
