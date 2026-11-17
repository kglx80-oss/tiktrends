import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schema, eq, and } from '@tiktrends/db';
import {
  contenuVide, empreinteContenu, SCHEMA_VERSION_CONTENU, OPERATION_JOB_STUDIO, avecControleParole, GRILLE_STUDIO, ErreurFournisseurCertaine,
  type SnapshotJob, type LigneDevis, type TranscriptionLue,
} from '@tiktrends/core';
import type { DemandeTranscription } from '@tiktrends/integrations';
import { ErreurFournisseurIncertaine } from '@tiktrends/core';
import { controlerParolesEnAttente, mesurerPriseFfprobe, ACTION_CONTROLE_PAROLE, ESSAIS_CONTROLE_PAROLE_MAX, DELAI_ISSUE_INCERTAINE_MS, type DependancesControleParole } from '../src/studios/controle-parole';
import { BarriereDepenseStudio, TranscripteurFal } from '@tiktrends/integrations';
import { idDepenseControleParole } from '@tiktrends/core';
import { portDepenseBase } from '../src/studios/fournisseurs';
import type { BaseStudio } from '../src/studios/types';
import { pgMemoire } from './pg-memoire';

/**
 * Contrôle de la parole dans le worker · en BASE (pglite, migrations
 * réelles). Le transcripteur est remplacé par une fonction qui rend une
 * transcription connue et COMPTE ses appels (sa barrière et son HTTP sont
 * éprouvés par `packages/integrations/test/transcription-fal.test.ts`). 0 $.
 */

let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const user = randomUUID();
let projet = '';
let version = '';
let versionVoixOff = '';
let PRISE_PARLEE = new Uint8Array();
let PRISE_MUETTE = new Uint8Array();

const REPLIQUE = 'Un shampooing sans sulfate.';
const plan = (narration: string, speechMode: string) => ({
  shotId: 's1', purpose: '', subject: '', action: '', framing: '', camera: '', lighting: '', environment: '', referenceIds: [], narration, onScreenText: [], speechMode, estimatedDurationMs: 5000,
});

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core', creditsBalance: 100 });
  await base.insert(schema.users).values({ id: user, email: `${user}@w.test` });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B' });
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'video', title: 'P', ownerId: user }).returning();
  const c = { ...contenuVide(), shots: { order: ['s1'], byId: { s1: plan(REPLIQUE, 'lipsync') } } };
  const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId: ws, brandId: brand, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c as never), authorId: user }).returning();
  projet = p!.id;
  version = v!.id;
  // Une seconde version · le même plan en VOIX OFF (la réplique est dite hors champ).
  const c2 = { ...contenuVide(), shots: { order: ['s1'], byId: { s1: plan(REPLIQUE, 'voiceover') } } };
  const [v2] = await base.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId: ws, brandId: brand, n: 2, schemaVersion: SCHEMA_VERSION_CONTENU, content: c2, contentHash: empreinteContenu(c2 as never), authorId: user }).returning();
  versionVoixOff = v2!.id;
  const d = await mkdtemp(join(tmpdir(), 'prise-'));
  const x = promisify(execFile);
  await x('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=24:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-f', 'mp4', join(d, 'p.mp4')]);
  await x('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=24:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'mp4', join(d, 'm.mp4')]);
  PRISE_PARLEE = new Uint8Array(await readFile(join(d, 'p.mp4')));
  PRISE_MUETTE = new Uint8Array(await readFile(join(d, 'm.mp4')));
  await rm(d, { recursive: true, force: true });
});

/** La ligne du clip APPROUVÉE · 6 s à 70 000 µ$ et 40 crédits la seconde (le prix réellement accepté, pas la grille). */
const ligneClip: LigneDevis = { operation: 'clip:s1', nature: 'generation', profil: 'animation', unites: 6, credits: 40, usdMicros: 70_000, inclus: false };
const VEO = 'fal-ai/veo3.1/fast/image-to-video';
const KLING = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
/** Prise PARLÉE à l'image · Veo, voix native demandée. */
const parametresClip = { schema: 'studio_clip/2', operation: 'clip:s1', shotId: 's1', source: { assetId: `sta_${randomUUID()}`, sha256: 'a'.repeat(64) }, consigne: 'Mouvement.', interdits: [], dureeS: 6, modele: VEO, audio: true };

let stockes: Map<string, Uint8Array>;
let appels: DemandeTranscription[];
let dite: string;
beforeEach(() => { stockes = new Map(); appels = []; dite = REPLIQUE; });

/** Un clip livré (`completed`, qualité `pending`) et sa prise stockée. */
async function semerPrise(o: { parole?: boolean; octets?: Uint8Array; clip?: Record<string, unknown>; versionId?: string } = {}): Promise<string> {
  const lignes = o.parole === false ? [ligneClip] : avecControleParole([ligneClip], { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }] }).lignes;
  const h = 'c'.repeat(64);
  const cle = `studios/${ws}/${randomUUID()}/clip_s1.mp4`;
  stockes.set(cle, o.octets ?? PRISE_PARLEE);
  const [a] = await base.insert(schema.studioAssets).values({ workspaceId: ws, brandId: brand, projectId: projet, storageKey: cle, mime: 'video/mp4', bytes: 1, sha256: 'b'.repeat(64), origin: 'generated', storageState: 'stored' }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: randomUUID(), projectVersionId: version, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 240, usdMicros: 430_000 }, parametres: { ...parametresClip, ...o.clip } };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: o.versionId ?? version, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${randomUUID()}`, inputHash: h, snapshot, createdBy: user, state: 'completed', result: { assets: { 'clip:s1': a!.id } } }).returning();
  return j!.id;
}

/**
 * La VRAIE barrière (registre \`ai_spend\` en base) et le VRAI transcripteur, contre un fetch
 * qui compte les requêtes PAYANTES reçues · la seule mesure de ce qui aurait été facturé.
 */
let postsPayants = 0;
const transcripteurReel = (retenue?: Promise<void>) => {
  postsPayants = 0;
  const f = (async (_u: string, init?: RequestInit) => {
    if (init?.method === 'POST') postsPayants += 1;
    if (retenue && postsPayants === 1) await retenue;
    return Response.json({ text: REPLIQUE, language_code: 'fra', words: REPLIQUE.split(' ').map((t, i) => ({ text: t, start: 0.1 + i * 0.3, end: 0.35 + i * 0.3, type: 'word' })) });
  }) as typeof fetch;
  return new TranscripteurFal({ apiKey: 'cle-fal-de-test:secret', fetch: f, barriere: new BarriereDepenseStudio({ port: portDepenseBase(base), env: { AI_SPEND_CAP_USD: '10' } }) });
};
const depenseTranscription = async (jobId: string) => {
  let t = 0;
  for (const essai of [1, 2, 3]) {
    const [l] = await base.select({ a: schema.aiSpend.actualUsd }).from(schema.aiSpend).where(eq(schema.aiSpend.id, idDepenseControleParole(jobId, 'clip:s1', essai)));
    t += l?.a ?? 0;
  }
  return t;
};

const transcription = (texte: string): TranscriptionLue => ({ texte, langue: 'fra', mots: texte.split(' ').map((t, i) => ({ texte: t, debutMs: 100 + i * 300, finMs: 350 + i * 300 })) });
const deps = (o: Partial<DependancesControleParole> = {}): DependancesControleParole => ({
  base, stockage: { relire: async (cle) => stockes.get(cle) ?? null },
  transcrire: async (d) => { appels.push(d); return { transcription: transcription(dite), reserveUsdMicros: 10_000 }; },
  adresse: (cle) => `https://stockage.test/${cle}?signature=x`,
  ...o,
});
const audit = async (jobId: string) => base.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.action, ACTION_CONTROLE_PAROLE), eq(schema.studioAuditEvents.targetId, jobId)));
const qualite = async (jobId: string) => (await base.select({ q: schema.studioJobs.qualityStatus }).from(schema.studioJobs).where(eq(schema.studioJobs.id, jobId)))[0]!.q;
/** Les autres prises encore en attente ne doivent pas brouiller le cas · on vide la file avant chaque cas. */
const viderFile = () => controlerParolesEnAttente(deps({ transcrire: async () => { throw new ErreurFournisseurCertaine('hors cas'); } }), 100);

describe('mesure de la prise (ffprobe)', () => {
  it('durée et piste audio lues dans le fichier', async () => {
    expect(await mesurerPriseFfprobe(PRISE_PARLEE)).toMatchObject({ audio: true });
    expect(await mesurerPriseFfprobe(PRISE_MUETTE)).toMatchObject({ audio: false });
    expect(Math.abs((await mesurerPriseFfprobe(PRISE_PARLEE))!.dureeMs - 2000)).toBeLessThan(100);
    expect(await mesurerPriseFfprobe(new TextEncoder().encode('pas une vidéo'))).toBeNull();
  });
});

describe('contrôle de la parole des prises livrées', () => {
  it('prise conforme · transcrite UNE fois sous la ligne approuvée, qualité inchangée, mots conservés pour les sous-titres', async () => {
    await viderFile();
    const job = await semerPrise();
    const r = await controlerParolesEnAttente(deps());
    expect(r).toEqual([{ jobId: job, suite: 'conforme', raison: '' }]);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatchObject({ workspaceId: ws, jobId: job, operation: 'clip:s1', essai: 1, approuveUsdMicros: 10_000 });
    expect(appels[0]!.audioUrl).toMatch(/^https:\/\/stockage\.test\/studios\//);
    expect(await qualite(job)).toBe('pending');
    const [a] = await audit(job);
    expect(a!.details).toMatchObject({ suite: 'conforme', conforme: true, ecarts: 0, operation: 'clip:s1', projectId: projet, mots: [['Un', 100, 350], ['shampooing', 400, 650], ['sans', 700, 950], ['sulfate.', 1000, 1250]] });
    // Un second tour ne transcrit plus rien.
    expect(await controlerParolesEnAttente(deps())).toEqual([]);
    expect(appels).toHaveLength(1);
  });

  it('écart · plan « à reprendre » (qualité requires_review), raison nommée, reprise PROPOSÉE avec son prix, jamais lancée', async () => {
    await viderFile();
    dite = 'Un shampooing sulfate.';
    const job = await semerPrise();
    const [r] = await controlerParolesEnAttente(deps({ mode: 'decision' }));
    expect(r).toMatchObject({ jobId: job, suite: 'proposer_reprise', raison: 'La prise ne dit pas la réplique validée · manque « sans ».' });
    expect(await qualite(job)).toBe('requires_review');
    const [a] = await audit(job);
    expect(a).toMatchObject({ versionBefore: 'pending', versionAfter: 'requires_review', reason: 'La prise ne dit pas la réplique validée · manque « sans ».' });
    expect(a!.details).toMatchObject({ conforme: false, manquants: ['sans'], prixReprise: { credits: 240, usdMicros: 420_000 + 10_000 }, reprisesFaites: 0 });
  });

  it('la reprise refusée à son tour · plus aucune relance, revue humaine', async () => {
    await viderFile();
    dite = 'Un shampooing sulfate.';
    const reprise = await semerPrise();
    const [r] = await controlerParolesEnAttente(deps({ mode: 'decision' }));
    expect(r).toMatchObject({ jobId: reprise, suite: 'revue' });
    expect(r!.raison).toMatch(/aucune relance/);
  });

  it('sans ligne « contrôle de la parole » approuvée · 0 appel, rien d’écrit', async () => {
    await viderFile();
    const job = await semerPrise({ parole: false });
    expect(await controlerParolesEnAttente(deps())).toEqual([]);
    expect(appels).toHaveLength(0);
    expect(await audit(job)).toHaveLength(0);
  });

  it('prise NON parlée à l’image · Kling avec narration et piste audio, Veo sans voix demandée, Veo voix off ⇒ « sans objet », 0 appel, 0 $', async () => {
    for (const o of [{ clip: { modele: KLING, audio: true } }, { clip: { audio: false } }, { versionId: versionVoixOff }]) {
      await viderFile();
      const job = await semerPrise(o);
      const [r] = await controlerParolesEnAttente(deps());
      expect(r, JSON.stringify(o)).toMatchObject({ jobId: job, suite: 'sans_objet' });
      expect(r!.raison).toMatch(/prise non parlée à l’image/);
    }
    expect(appels).toHaveLength(0);
  });

  it('prise muette · « sans objet », 0 appel', async () => {
    await viderFile();
    const job = await semerPrise({ octets: PRISE_MUETTE });
    const [r] = await controlerParolesEnAttente(deps());
    expect(r).toMatchObject({ jobId: job, suite: 'sans_objet' });
    expect(appels).toHaveLength(0);
    expect(await qualite(job)).toBe('pending');
  });

  it('OBSERVATION (défaut, aucune vraie prise mesurée) · écart noté au journal avec les mots, ni « à reprendre » ni reprise proposée', async () => {
    await viderFile();
    dite = 'Un shampooing sulfate.';
    const job = await semerPrise();
    const [r] = await controlerParolesEnAttente(deps());
    expect(r).toMatchObject({ jobId: job, suite: 'observation', raison: 'La prise ne dit pas la réplique validée · manque « sans ».' });
    expect(await qualite(job)).toBe('pending');
    const [a] = await audit(job);
    expect(a!.versionAfter).toBe('pending');
    expect(a!.details).toMatchObject({ suite: 'observation', conforme: false, manquants: ['sans'], mots: [['Un', 100, 350], ['shampooing', 400, 650], ['sulfate.', 700, 950]] });
    expect(a!.details).not.toHaveProperty('prixReprise');
  });

  it('arrêt demandé · aucune prise entamée ; demandé pendant une prise · la suivante n’est pas entamée', async () => {
    await viderFile();
    await semerPrise();
    await semerPrise();
    expect(await controlerParolesEnAttente(deps({ arretDemande: () => true }))).toEqual([]);
    expect(appels).toHaveLength(0);
    let arret = false;
    const r = await controlerParolesEnAttente(deps({ arretDemande: () => arret, transcrire: async (d) => { appels.push(d); arret = true; return { transcription: transcription(dite), reserveUsdMicros: 10_000 }; } }));
    expect(r).toHaveLength(1);
    expect(appels).toHaveLength(1);
    // La prise non entamée l'est au tour suivant, sans arrêt.
    expect(await controlerParolesEnAttente(deps())).toHaveLength(1);
  });

  it('erreur PASSAGÈRE (fal 503, prise illisible, ffprobe) · retentée au tour suivant, essai suivant, puis « non contrôlé » à la borne', async () => {
    await viderFile();
    const job = await semerPrise();
    const passagere = deps({ transcrire: async (d) => { appels.push(d); throw Object.assign(new ErreurFournisseurCertaine('fal a refusé la transcription (HTTP 503)'), { passagere: true }); } });
    for (let i = 1; i < ESSAIS_CONTROLE_PAROLE_MAX; i++) {
      expect(await controlerParolesEnAttente(passagere)).toEqual([]);
      expect(await audit(job)).toHaveLength(0);
    }
    const [r] = await controlerParolesEnAttente(passagere);
    expect(r).toMatchObject({ jobId: job, suite: 'non_controle' });
    expect(r!.raison).toMatch(new RegExp(`après ${ESSAIS_CONTROLE_PAROLE_MAX} essais`));
    expect(appels.map((a) => a.essai)).toEqual(Array.from({ length: ESSAIS_CONTROLE_PAROLE_MAX }, (_, i) => i + 1));
    // Mesure illisible (ffprobe) · passagère aussi.
    await viderFile();
    const j2 = await semerPrise();
    expect(await controlerParolesEnAttente(deps({ mesurer: async () => null }))).toEqual([]);
    expect(await audit(j2)).toHaveLength(0);
    // Le tour suivant, la mesure revient · la prise est contrôlée, à l'essai 2.
    expect(await controlerParolesEnAttente(deps())).toMatchObject([{ jobId: j2, suite: 'conforme' }]);
    expect(appels.at(-1)!.essai).toBe(2);
  });

  it('UNE transcription payée par ligne approuvée · plantage après paiement : rien n’est repayé, verdict « issue incertaine » après le délai', async () => {
    await viderFile();
    const job = await semerPrise();
    const reel = transcripteurReel();
    // Un worker a payé la transcription de l'essai 1 puis s'est arrêté net (SIGKILL) AVANT la transaction finale.
    await reel.transcrire({ workspaceId: ws, jobId: job, operation: 'clip:s1', essai: 1, audioUrl: 'https://stockage.test/p.mp4', dureeMs: 2_000, approuveUsdMicros: 10_000 });
    expect(postsPayants).toBe(1);
    // Tour suivant · la ligne de cet essai est déjà réservée : on attend, rien n'est écrit, rien n'est repayé.
    expect(await controlerParolesEnAttente(deps({ transcrire: (d) => reel.transcrire(d) }))).toEqual([]);
    expect(await controlerParolesEnAttente(deps({ transcrire: (d) => reel.transcrire(d) }))).toEqual([]);
    expect(postsPayants).toBe(1);
    expect(await audit(job)).toHaveLength(0);
    // Passé le délai d'une transcription · verdict final, réserve gardée.
    const plusTard = new Date(Date.now() + DELAI_ISSUE_INCERTAINE_MS + 60_000);
    const [r] = await controlerParolesEnAttente(deps({ transcrire: (d) => reel.transcrire(d), horloge: () => plusTard }));
    expect(r).toMatchObject({ jobId: job, suite: 'non_controle' });
    expect(r!.raison).toMatch(/issue incertaine/);
    expect(postsPayants).toBe(1);
    expect(await depenseTranscription(job)).toBeCloseTo(0.01, 6);
  });

  it('UNE transcription payée par ligne approuvée · deux workers sur la même prise', async () => {
    await viderFile();
    const job = await semerPrise();
    // Le worker A est DANS sa requête payante (réponse retenue) pendant que le worker B fait deux tours.
    let liberer: () => void = () => {};
    const retenue = new Promise<void>((r) => { liberer = r; });
    const reel = transcripteurReel(retenue);
    const a = controlerParolesEnAttente(deps({ transcrire: (d) => reel.transcrire(d) }));
    while (postsPayants === 0) await new Promise((r) => setTimeout(r, 5));
    expect(await controlerParolesEnAttente(deps({ transcrire: (d) => reel.transcrire(d) }))).toEqual([]);
    expect(await controlerParolesEnAttente(deps({ transcrire: (d) => reel.transcrire(d) }))).toEqual([]);
    liberer();
    expect(await a).toMatchObject([{ jobId: job, suite: 'conforme' }]);
    expect(await controlerParolesEnAttente(deps({ transcrire: (d) => reel.transcrire(d) }))).toEqual([]);
    expect(postsPayants).toBe(1);
    expect(await depenseTranscription(job)).toBeCloseTo(0.01, 6);
  });

  it('transcription refusée (plafond, fournisseur) · « non contrôlé », écrit une fois, jamais retenté', async () => {
    await viderFile();
    const job = await semerPrise();
    const echec = deps({ transcrire: async (d) => { appels.push(d); throw new ErreurFournisseurCertaine('plafond de dépense atteint'); } });
    const [r] = await controlerParolesEnAttente(echec);
    expect(r).toMatchObject({ jobId: job, suite: 'non_controle' });
    expect(r!.raison).toMatch(/plafond de dépense atteint/);
    expect(await controlerParolesEnAttente(echec)).toEqual([]);
    expect(appels).toHaveLength(1);
    expect((await audit(job))[0]!.details).toMatchObject({ issueFinanciere: 'aucun_frais' });
  });
});
