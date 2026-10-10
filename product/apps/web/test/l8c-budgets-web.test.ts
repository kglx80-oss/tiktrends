import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios } from './studios-semis';

/**
 * L8-C · GARDES DE TEMPS TOLÉRANTES côté serveur (UX-06).
 *
 * ⚠ Budgets de temps : p95 du temps CPU de 20 tirages ≤ p95 MESURÉ × 3 (`budgetGarde`,
 * `perf/mesures.ts`). Elles attrapent un changement d'ordre de grandeur, pas
 * une milliseconde : la lecture de l'écran vidéo reconstruisait deux graphes
 * par média relu (10,5 s pour 200 plans, mesuré) ; ce genre de rechute fait
 * tomber la garde. Base réelle (pglite), 200 jobs terminés à relire.
 *
 * Rendu du document : garde à l'échelle typique seulement (100 calques, une
 * seconde environ par tirage) ; l'échelle de stress (≈ 3 à 8 s par tirage)
 * est mesurée à la demande (`l8c-mesure-web.test.ts`), son coût étant
 * linéaire en calques, une rechute par calque se voit déjà à 100.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import { contenuEchelle, budgetGarde, MESURES, MARGE_GARDE, type EchelleMesure, type CalqueTexte } from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { lireEditeurPour } from '../lib/studios/editeur/lecture';
import { lireVideoPour } from '../lib/studios/video/lecture';
import { enregistrerVersion } from '../lib/studios/depot';
import { rendreDocument } from '../lib/studios/rendu/compositeur';
import { mediasSynthetiques, projetAvecJobs, chronometrerAsync } from './l8c-outils';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = h.ids;
const base = db as unknown as BaseStudio;
const TIRAGES = 20;
const LECTURE = { maintenant: new Date('2026-10-09T10:00:00Z'), releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };
const projets: Record<EchelleMesure, string> = { petit: '', grand: '' };

const sousBudget = (id: 'lecture_editeur' | 'lecture_video' | 'enregistrement' | 'rendu_document', e: EchelleMesure, r: { mur: { p95Ms: number }; cpu: { p95Ms: number; medianeMs: number } }) =>
  expect(r.cpu.p95Ms, `${id} · ${e} · p95 CPU ${r.cpu.p95Ms} ms (médiane ${r.cpu.medianeMs}, mur p95 ${r.mur.p95Ms}) pour un budget de ${budgetGarde(id, e)} ms (mesuré ${MESURES[id][e].p95Ms} ms × ${MARGE_GARDE})`).toBeLessThanOrEqual(budgetGarde(id, e));

beforeAll(async () => {
  await semer(db, schema, ids);
  for (const e of ['petit', 'grand'] as const) projets[e] = (await projetAvecJobs(base, ids, contenuEchelle(e))).projectId;
}, 120_000);

describe.each(['petit', 'grand'] as EchelleMesure[])('BUDGET DE TEMPS TOLÉRANT (p95 mesuré × 3) · serveur · %s', (e) => {
  it('ouverture de l’éditeur · lecture et vue sérialisée', async () => {
    const ctx = ctxDe(ids, 'ua');
    const r = await chronometrerAsync(async () => { const l = await lireEditeurPour(ctx, projets[e]); if (!l.ok) throw new Error(l.code); return JSON.stringify(l.donnees); }, TIRAGES);
    sousBudget('lecture_editeur', e, r);
  }, 120_000);

  it('ouverture de l’écran vidéo · une image clé produite par plan, à juger', async () => {
    const ctx = ctxDe(ids, 'ua');
    const r = await chronometrerAsync(async () => { const l = await lireVideoPour(ctx, projets[e], LECTURE); if (!l.ok) throw new Error(l.code); return JSON.stringify(l.vue); }, TIRAGES);
    sousBudget('lecture_video', e, r);
  }, 120_000);

  it('enregistrement d’une version', async () => {
    const ctx = ctxDe(ids, 'ua');
    const texte = Object.values(contenuEchelle(e).document!.layers).find((l): l is CalqueTexte => l.kind === 'text' && !l.locked)!;
    let n = 0;
    const r = await chronometrerAsync(async () => {
      const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projets[e]));
      const s = await enregistrerVersion(ctx, { projectId: projets[e], baseVersionId: p!.currentVersionId, changes: [{ op: 'replace', path: `/document/layers/${texte.id}/text`, newValue: `Essai ${++n}`, reason: 'garde' }], raison: 'garde' });
      if (!s.ok) throw new Error(s.code);
    }, TIRAGES);
    sousBudget('enregistrement', e, r);
  }, 120_000);
});

describe('BUDGET DE TEMPS TOLÉRANT (p95 mesuré × 3) · rendu serveur · petit', () => {
  it('rendu du document de 100 calques', async () => {
    const medias = await mediasSynthetiques();
    const doc = contenuEchelle('petit').document!;
    const r = await chronometrerAsync(async () => { const x = await rendreDocument(doc, medias); if (!x.ok) throw new Error(x.code); }, TIRAGES, 1);
    sousBudget('rendu_document', 'petit', r);
  }, 180_000);
});
