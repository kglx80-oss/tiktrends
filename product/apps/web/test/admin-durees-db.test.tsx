// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Durées mesurées des tâches de génération, et le seuil « bloquée » qui s'en
 * déduit · sur une VRAIE base (pglite + migrations du dépôt), la VRAIE page
 * `/admin/taches` rendue, le DOM lu.
 *
 *  · tâches terminées semées avec leurs transitions (`job.*` du registre,
 *    `job.provider.payload` et son modèle), datées AVANT `T0` · horloge
 *    INJECTÉE (`Date` figée sur T0), jamais « à venir » ;
 *  · une vraie tâche menée par le worker simulé · ses transitions RÉELLES sont
 *    lues (aucun corps consigné · « Modèle non consigné ») ;
 *  · le tableau · effectifs, médianes, p95 et seuils attendus calculés ICI, à
 *    la main, sur les durées semées (rang ⌈n·p⌉) ;
 *  · « Bloquées » suit le seuil appliqué de chaque tâche (mesuré du modèle,
 *    mesuré du type, dérivé pour la vidéo) · l'export aussi ;
 *  · refus · admin d'espace non fondateur, sans session · rien rendu, rien cité.
 * 0 $ · aucun modèle, aucun appel réseau.
 */
const h = vi.hoisted(() => ({ session: null as unknown, marque: null as { id: string; name: string } | null }));
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  return {
    wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u(), uF: u(),
    pB: u(), vB: u(), nanoBloquee: u(), nanoPile: u(), gptBloquee: u(), gptEnCours: u(), fileType: u(), video29: u(), video31: u(), rapproche: u(),
  };
});

vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_noStore: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.marque, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }), depensesAReconcilier: async () => ({ lignes: [] }) }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

import { db, eq, schema } from '@tiktrends/db';
import { parseCsv } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { semer, type IdsStudios } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, KEYFRAMES } from './l4c-harnais';
import { exporterTourAction } from '../app/actions/tour-controle';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const FONDATEUR = 'kguilbaux@agence-glx.fr';
const fondateur = () => ({ user: { id: ids.uF, email: FONDATEUR, name: 'Kevin' }, workspaceId: ids.wsA, workspaceName: 'Espace A', plan: 'business', role: 'owner', equipe: null });
/** L'horloge INJECTÉE · la page et l'export se lisent à T0, les semis sont datés avant. */
const T0 = new Date('2026-01-15T10:00:00.000Z');
const S = 1_000;
const MIN = 60_000;
const NANO = 'fal-ai/nano-banana-2/edit';
const GPT = 'openai/gpt-image-2/edit';
const KLING = 'fal-ai/kling-video/v2.1/standard/image-to-video';
const IMG = [{ operation: 'keyframe:s1', profil: 'image_generation' }];
const VID = [{ operation: 'clip:s1', profil: 'animation' }];

/**
 * Les durées SEMÉES (secondes) · et ce qu'on attend, calculé à la main.
 *  · Nano · 100 tâches, 60 à 159 s · médiane rang 50 = 109 s, p95 rang 95 =
 *    154 s · seuil max(154 × 1,5 ; 159) = 231 s (mesuré, ce modèle) ;
 *  · GPT · 20 tâches, 170 à 360 s par 10 · médiane rang 10 = 260 s, p95 rang
 *    19 = 350 s · sous l'effectif ⇒ seuil du type ;
 *  · type image · 121 tâches (+ la vraie, quelques millisecondes) · p95 rang
 *    ⌈114,95⌉ = 115 = 300 s, max 360 · seuil max(450 ; 360) = 450 s ;
 *  · vidéo · 8 tâches, 6 à 13 min · sous l'effectif ⇒ 30 min dérivées ;
 *  · une tâche passée par un rapprochement (5 h) · écartée, ne relève rien.
 */
const NANO_S = Array.from({ length: 100 }, (_, i) => 60 + i);
const GPT_S = Array.from({ length: 20 }, (_, i) => 170 + 10 * i);
const VIDEO_S = Array.from({ length: 8 }, (_, i) => (6 + i) * 60);
const SEUIL_NANO = 231 * S;
const SEUIL_IMAGE = 450 * S;

const S_ = { jobReel: '' };

beforeAll(async () => {
  await semer(db, schema, ids as unknown as IdsStudios);
  await db!.insert(schema.users).values([{ id: ids.uF, email: FONDATEUR, name: 'Kevin' }]);
  await db!.insert(schema.workspaceMembers).values([{ workspaceId: ids.wsA, userId: ids.uF, role: 'owner' }]);

  // Une VRAIE tâche · devis, approbation, worker simulé · ses transitions réelles (aucun corps fal consigné).
  h.marque = { id: ids.brandA1, name: 'Marque A1' };
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · durées' });
  S_.jobReel = await lancerLot(db, ctxDe(ids as unknown as IdsStudios, 'ua'), p.projectId, KEYFRAMES(1));
  await executer(db, S_.jobReel);

  await db!.insert(schema.studioProjects).values({ id: ids.pB, workspaceId: ids.wsB, brandId: ids.brandB1, title: 'Lumière', kind: 'image' });
  await db!.insert(schema.studioProjectVersions).values({ id: ids.vB, projectId: ids.pB, workspaceId: ids.wsB, brandId: ids.brandB1, n: 1, schemaVersion: 1, content: { titre: 'x' }, contentHash: 'a'.repeat(64) });
  const { randomUUID } = await import('node:crypto');
  const jobs: Array<typeof schema.studioJobs.$inferInsert> = [];
  const evts: Array<typeof schema.studioAuditEvents.$inferInsert> = [];
  const ev = (job: string, action: string, le: number, modele?: string) => evts.push({
    actorId: null, effectiveRole: 'systeme:worker', workspaceId: ids.wsB, brandId: ids.brandB1, action, targetType: 'studio_job', targetId: job,
    reason: '', traceId: 'wk:test', occurredAt: new Date(le), details: modele ? { modele } : null,
  });
  const job = (id: string, state: string, creeLe: number, lignes: unknown, finishedAt: number | null) => jobs.push({
    id, projectId: ids.pB, projectVersionId: ids.vB, workspaceId: ids.wsB, brandId: ids.brandB1, state: state as 'queued', operation: 'studio.generation',
    idempotencyKey: id, inputHash: 'b'.repeat(64), snapshot: { lignes }, createdAt: new Date(creeLe), updatedAt: new Date(finishedAt ?? creeLe), finishedAt: finishedAt === null ? null : new Date(finishedAt),
  });
  /** Une tâche saine · attente 5 s, prise 1 s, soumission 2 s, exécution (total − 14 s), téléchargement 6 s. */
  const terminee = (totalS: number, modele: string, lignes: unknown, k: number, detour?: string) => {
    const id = randomUUID();
    const c = T0.getTime() - 6 * 3_600_000 - k * MIN - totalS * S;
    job(id, 'completed', c, lignes, c + totalS * S);
    ev(id, 'job.enqueue', c); ev(id, 'job.claimed', c + 5 * S); ev(id, 'job.running', c + 6 * S); ev(id, 'job.provider.payload', c + 8 * S, modele);
    if (detour) ev(id, detour, c + 9 * S);
    ev(id, 'job.persisting', c + (totalS - 6) * S); ev(id, 'job.completed', c + totalS * S); ev(id, 'media.quality.control', c + totalS * S + S);
    return id;
  };
  let k = 0;
  for (const s of NANO_S) terminee(s, NANO, IMG, k++);
  for (const s of GPT_S) terminee(s, GPT, IMG, k++);
  for (const s of VIDEO_S) terminee(s, KLING, VID, k++);
  terminee(5 * 3600, NANO, IMG, k++, 'job.reconciliation_required');

  /** Une tâche active (`running`), lancée il y a `ageMs`, avec ou sans corps consigné. */
  const active = (id: string, ageMs: number, lignes: unknown, modele: string | null, state = 'running') => {
    const c = T0.getTime() - ageMs;
    job(id, state, c, lignes, null);
    if (modele) { ev(id, 'job.claimed', c + S); ev(id, 'job.running', c + 2 * S); ev(id, 'job.provider.payload', c + 3 * S, modele); }
  };
  active(ids.nanoBloquee, SEUIL_NANO + S, IMG, NANO);
  active(ids.nanoPile, SEUIL_NANO, IMG, NANO);
  active(ids.gptBloquee, SEUIL_IMAGE + S, IMG, GPT);
  active(ids.gptEnCours, SEUIL_IMAGE - S, IMG, GPT);
  active(ids.fileType, SEUIL_IMAGE + S, IMG, null, 'queued');
  active(ids.video29, 29 * MIN, VID, KLING);
  active(ids.video31, 31 * MIN, VID, KLING);
  for (let i = 0; i < jobs.length; i += 200) await db!.insert(schema.studioJobs).values(jobs.slice(i, i + 200));
  for (let i = 0; i < evts.length; i += 300) await db!.insert(schema.studioAuditEvents).values(evts.slice(i, i + 300));
});
afterEach(() => { h.session = null; vi.useRealTimers(); });

/* ───────────────────────── lecture du DOM ───────────────────────── */

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
type Page = { default: (p: { searchParams?: Promise<Record<string, string>> }) => Promise<React.ReactElement> };
const page = async (sp: Record<string, string> = {}) => {
  const m = await import('../app/(spatial)/sp/admin/taches/page') as Page;
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0);
  try { return dom(renderToStaticMarkup(avecSpatial(await m.default({ searchParams: Promise.resolve(sp) })))); } finally { vi.useRealTimers(); }
};
const exporter = async (e: Parameters<typeof exporterTourAction>[0]) => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0);
  try { return await exporterTourAction(e); } finally { vi.useRealTimers(); }
};
const cellules = (r: Element) => [...r.children].map((c) => c.textContent ?? '');
const durees = (d: HTMLElement) => Object.fromEntries([...d.querySelectorAll('[data-table="durees"] [data-duree]')].map((r) => [r.getAttribute('data-duree'), cellules(r)]));
const idsTaches = (d: HTMLElement) => [...d.querySelectorAll('[data-table="taches"] [data-tache]')].map((r) => r.getAttribute('data-tache'));

describe('« Durées mesurées » · le tableau lu dans la vraie page', () => {
  it('effectifs, médianes, p95, seuils et sources · calculés à la main sur les durées semées', async () => {
    h.session = fondateur();
    const d = await page();
    expect(d.querySelector('[data-lecture]')!.textContent, 'une tâche passée par un rapprochement compte comme saine').toBe('130 tâches terminées lues · 129 saines mesurées, 1 écartée (rapprochement ou annulation demandée).');
    const t = durees(d);
    expect(Object.keys(t)).toEqual([`image:${NANO}`, `image:${GPT}`, 'image:', 'image:*', `video:${KLING}`, 'video:*']);
    expect(t[`image:${NANO}`], 'la ligne Nano · effectif, médiane, p95 ou seuil faux').toEqual([NANO, 'Image', '100', '1 min 49 s', '2 min 34 s', '3 min 51 s', 'mesuré · ce modèle, 100 tâches saines']);
    expect(t[`image:${GPT}`]).toEqual([GPT, 'Image', '20', '4 min 20 s', '5 min 50 s', '7 min 30 s', 'mesuré · toutes les tâches image, 121 tâches saines (modèle à 20 sur 100)']);
    expect(t['image:']!.slice(0, 3), 'la vraie tâche du worker simulé · aucun corps consigné').toEqual(['Modèle non consigné', 'Image', '1']);
    expect(t['image:*']).toEqual(['Tous modèles', 'Image', '121', '1 min 59 s', '5 min', '7 min 30 s', 'mesuré · toutes les tâches image, 121 tâches saines (modèle pas encore connu)']);
    expect(t[`video:${KLING}`]).toEqual([KLING, 'Vidéo', '8', '9 min', '13 min', '30 min', 'dérivé, effectif insuffisant (vidéo · 8 sur 100) · 30 min, délais du worker']);
    expect(t['video:*']![5]).toBe('30 min');
    expect(d.querySelector('[data-methode]')!.textContent).toContain('la durée de rang ⌈n·p⌉');
    // Les phases, lues sur les transitions · la vraie tâche n'a pas de corps consigné (soumission sur 120).
    const ph: Record<string, string[]> = Object.fromEntries([...d.querySelectorAll('[data-table="phases"] [data-phase]')].map((r) => [r.getAttribute('data-phase'), cellules(r).slice(2, 5)]));
    expect(ph['image:attente'], 'les phases ne sont pas lues sur les transitions du worker').toEqual(['121', '5 s', '5 s']);
    expect(ph['image:soumission']).toEqual(['120', '2 s', '2 s']);
    expect(ph['image:telechargement']![0]).toBe('121');
    expect(ph['video:execution']).toEqual(['8', '8 min 46 s', '12 min 46 s']);
  });
});

describe('« Bloquées » suit le seuil appliqué de chaque tâche · page et export', () => {
  it('Nano au-delà de 231 s, GPT et la file au-delà de 450 s (type), la vidéo au-delà de 30 min', async () => {
    h.session = fondateur();
    const b = await page({ segment: 'bloquees' });
    expect(new Set(idsTaches(b)), 'le segment « Bloquées » ne suit pas le seuil de chaque tâche').toEqual(new Set([ids.nanoBloquee, ids.gptBloquee, ids.fileType, ids.video31]));
    expect(new Set(idsTaches(await page({ segment: 'en-cours' })))).toEqual(new Set([ids.nanoPile, ids.gptEnCours, ids.video29]));
    const seuil = (id: string) => [b.querySelector(`[data-tache="${id}"]`)?.getAttribute('data-seuil-ms'), b.querySelector(`[data-tache="${id}"]`)?.getAttribute('data-seuil-source')];
    expect(seuil(ids.nanoBloquee)).toEqual([String(SEUIL_NANO), 'mesure-modele']);
    expect(seuil(ids.gptBloquee)).toEqual([String(SEUIL_IMAGE), 'mesure-type']);
    expect(seuil(ids.fileType)).toEqual([String(SEUIL_IMAGE), 'mesure-type']);
    expect(seuil(ids.video31)).toEqual([String(30 * MIN), 'derive']);
    expect(b.querySelector(`[data-tache="${ids.nanoBloquee}"]`)!.textContent).toContain('En cours · bloquée');
    expect(b.querySelector('[data-segment-tache="bloquees"]')!.textContent).toBe('Bloquées · 4');
    const r = await exporter({ ecran: 'taches', segment: 'bloquees' });
    if (!r.ok) throw new Error(r.message);
    const etatsPage = idsTaches(b).map((id) => b.querySelector(`[data-tache="${id}"] .pill`)!.textContent!);
    expect(etatsPage.every((e) => e.endsWith(' · bloquée'))).toBe(true);
    expect(parseCsv(r.csv.replace(/^\uFEFF/, ''), ';').slice(1).map((l) => l[1]), 'l’export ne suit pas le seuil de la page').toEqual(etatsPage);
    expect(r.lignes).toBe(4);
  });
});

describe('Refus · seul le fondateur, admin de son espace, lit les durées', () => {
  it.each([
    ['admin d’espace non fondateur', (): unknown => ({ user: { id: ids.ub, email: 'ub@studios.test', name: 'B' }, workspaceId: ids.wsB, workspaceName: 'B', plan: 'business', role: 'admin', equipe: null }), 'redirect:/dashboard'],
    ['sans session', (): unknown => null, 'redirect:/login'],
  ] as const)('%s · page renvoyée avant toute lecture, export refusé sans rien citer', async (_n, s, attendu) => {
    h.session = s();
    const e = await page().then(() => null, (x: Error) => x);
    expect(e?.message).toBe(attendu);
    const r = await exporter({ ecran: 'taches', segment: 'bloquees' });
    expect(r).toEqual({ ok: false, message: 'Réservé au fondateur (plateforme) · rien n’a été lu ni modifié.' });
    expect(JSON.stringify(r)).not.toContain(NANO);
  });
});

describe('la vraie tâche du worker · ses transitions sont celles que la mesure lit', () => {
  it('claimed, running, persisting, completed écrits par le moteur, cible studio_job', async () => {
    const lues = await db!.select({ action: schema.studioAuditEvents.action }).from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, S_.jobReel));
    expect(lues.map((l) => l.action)).toEqual(expect.arrayContaining(['job.claimed', 'job.running', 'job.persisting', 'job.completed']));
  });
});
