import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Studios · reprendre l'existant · sur une VRAIE base (pglite + migrations),
 * fournisseur SIMULÉ qui enregistre ce qu'il reçoit. On lit ce qui part vers
 * le modèle, les lignes en base et les réponses · jamais « une fonction a été
 * appelée ».
 *
 *  · DA · la tâche d'un projet de la marque A1 reçoit, dans son message
 *    compilé, les règles créatives et la promesse saisies pour A1 · jamais
 *    celles de la marque B1 (autre espace).
 *  · Sources · une création précédente de A1 (Pubs IA, terminée) s'ajoute à un
 *    projet de A1 et y reste lisible ; celle de B1 (autre espace) est refusée
 *    `NOT_FOUND` ; une création archivée, celle d'une autre marque ou d'une
 *    marque fermée au membre restreint, aussi.
 *  · Préparer une création · la liste « Créations précédentes » de A1 ne montre
 *    que les créations réutilisables de A1.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios }));
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

import { randomUUID } from 'node:crypto';
import { db, schema, eq } from '@tiktrends/db';
import { lireReferencesSources } from '@tiktrends/core';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { executerTache } from '../lib/studios/prompts/resolveur';
import { creerProjetDepuisSourcesPour, lireProjetDetailPour } from '../lib/studios/sources/projet';
import { preparerCreationPour } from '../lib/studios/sources/preparation';
import { contexteDepuisSession, type ContexteStudio } from '../lib/studios/garde';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule, SORTIE_JARVIS_ROUTE, ENTREE_JARVIS_ROUTE } from './l2-adaptateur-simule';

const ids = etat.ids;
const fournisseur = adaptateurSimule(() => SORTIE_JARVIS_ROUTE);
const O = { veilleOuverte: true, maintenant: new Date('2026-10-10T08:00:00Z') };
const G = { a1: randomUUID(), a1Archivee: randomUUID(), a1Image: randomUUID(), a2: randomUUID(), b1: randomUUID() };

const REGLES_A1 = 'REGLE_A1 · toujours un fond crème\nJamais de rouge vif';
const REGLES_B1 = 'REGLE_B1_SECRETE · fond noir laqué';

function ctxDe(qui: 'ua' | 'ur' | 'ub'): ContexteStudio {
  const marques = qui === 'ub' ? [ids.brandB1] : [ids.brandA1, ids.brandA2];
  return contexteDepuisSession(session(ids, qui), marques, qui === 'ur' ? [ids.brandA1] : [], `st_test_${randomUUID()}`);
}
const creer = (ctx: ContexteStudio, brandId: string, generationId: string) =>
  creerProjetDepuisSourcesPour(ctx, { sources: [{ type: 'creation', id: generationId }], brandId, kind: 'image', titre: 'Reprise', cleClic: `clic-${randomUUID()}` }, O);

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.brands).set({ creativeRules: REGLES_A1, usp: 'USP_A1 zéro plastique', description: '', tone: null, brandKit: { style: 'éditorial minimaliste' } }).where(eq(schema.brands.id, ids.brandA1));
  await db.update(schema.brands).set({ creativeRules: REGLES_B1, usp: 'USP_B1' }).where(eq(schema.brands.id, ids.brandB1));
  const pub = (id: string, brandId: string, o: Record<string, unknown> = {}) => ({
    id, brandId, kind: 'ad' as const, status: 'completed', assetUrls: [`https://cdn.test/${id}.png`],
    input: { headline: `Accroche ${id.slice(0, 4)}`, cta: 'Essayer' }, ...o,
  });
  await db.insert(schema.generations).values([
    pub(G.a1, ids.brandA1),
    pub(G.a1Archivee, ids.brandA1, { status: 'archived' }),
    pub(G.a1Image, ids.brandA1, { kind: 'image', input: { prompt: 'flacon' } }),
    pub(G.a2, ids.brandA2),
    pub(G.b1, ids.brandB1),
  ]);
  await publierRegistreDeTest(depot, acteurPlateforme());
});

describe('DA de la marque · ce qui part vers le modèle', () => {
  it('la tâche d’un projet de A1 reçoit les règles créatives et la promesse de A1, jamais celles de B1', async () => {
    const p = await creer(ctxDe('ua'), ids.brandA1, G.a1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const r = await executerTache({
      templateKey: 'jarvis.route', portee: { workspaceId: ids.wsA, brandId: p.projet.brandId }, acteur: { userId: ids.ua, traceId: `st_${randomUUID()}` },
      taskInputs: ENTREE_JARVIS_ROUTE, contexte: { projectVersionId: p.versionId }, liens: { projectId: p.projet.id },
      adaptateur: fournisseur, environnement: 'test',
    });
    expect(r.ok).toBe(true);
    const message = fournisseur.recues.at(-1)!.messages.find((m) => m.nature === 'donnees_utilisateur')!.contenu;
    expect(message).toContain('REGLE_A1 · toujours un fond crème\\nJamais de rouge vif');
    expect(message).toContain('Promesse (USP) : USP_A1 zéro plastique');
    expect(message).toContain('Style visuel : éditorial minimaliste');
    expect(message).not.toContain('Description :');
    expect(message).not.toContain('REGLE_B1');
    // La trace dit quelle DA a été lue.
    const [run] = await db.select().from(schema.studioPromptRuns).where(eq(schema.studioPromptRuns.id, r.ok ? r.runId : ''));
    expect((run!.sourceRefs as Array<{ titre: string }>).map((s) => s.titre)).toContain('Direction artistique de la marque');
  });

  it('une tâche de B1 lit la DA de B1 · la portée suit la marque de la tâche', async () => {
    const r = await executerTache({
      templateKey: 'jarvis.route', portee: { workspaceId: ids.wsB, brandId: ids.brandB1 }, acteur: { userId: ids.ub, traceId: `st_${randomUUID()}` },
      taskInputs: ENTREE_JARVIS_ROUTE, contexte: {}, adaptateur: fournisseur, environnement: 'test',
    });
    expect(r.ok).toBe(true);
    const message = fournisseur.recues.at(-1)!.messages.find((m) => m.nature === 'donnees_utilisateur')!.contenu;
    expect(message).toContain('REGLE_B1_SECRETE');
    expect(message).not.toContain('REGLE_A1');
  });
});

describe('création précédente comme source d’un projet', () => {
  it('celle de A1 s’ajoute à un projet de A1 · référence en base et source lisible', async () => {
    const ctx = ctxDe('ua');
    const p = await creer(ctx, ids.brandA1, G.a1);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const [ligne] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, p.projet.id));
    const { sources } = lireReferencesSources(ligne!.sourceRefs);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ type: 'creation', droit: 'creation_interne', generationId: G.a1, portee: { workspaceId: ids.wsA, brandId: ids.brandA1 } });
    const d = await lireProjetDetailPour(ctx, p.projet.id, O);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.detail.sources[0]).toMatchObject({ statut: 'active', apercu: `/api/ad/${G.a1}` });
    // La reprise de son propre texte n'est pas exclue comme celle d'un concurrent.
    expect(d.detail.brief?.exclusions ?? []).toEqual([]);
  });

  it('celle de B1 (autre espace) est refusée NOT_FOUND · rien n’est créé', async () => {
    const avant = (await db.select().from(schema.studioProjects)).length;
    const r = await creer(ctxDe('ua'), ids.brandA1, G.b1);
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect((await db.select().from(schema.studioProjects)).length).toBe(avant);
  });

  it('archivée, d’une autre marque, ou d’une marque fermée au membre restreint · refusée', async () => {
    expect(await creer(ctxDe('ua'), ids.brandA1, G.a1Archivee)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await creer(ctxDe('ua'), ids.brandA1, G.a2)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(await creer(ctxDe('ur'), ids.brandA1, G.a2)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('« Préparer une création » liste les créations réutilisables de A1, et seulement elles', async () => {
    const r = await preparerCreationPour(ctxDe('ua'), {
      sources: [{ type: 'creation', id: G.a1 }], brandId: ids.brandA1,
    }, { ...O, marqueActive: null, ia: { configuree: false, releasePubliee: false, modele: 'claude-sonnet-4-5' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.creations.map((c) => c.id).sort()).toEqual([G.a1, G.a1Image].sort());
    expect(r.creations.find((c) => c.id === G.a1)).toMatchObject({ libelle: `Pub · Accroche ${G.a1.slice(0, 4)}`, apercu: `/api/ad/${G.a1}` });
    expect(r.creations.find((c) => c.id === G.a1Image)).toMatchObject({ libelle: 'Image', apercu: `https://cdn.test/${G.a1Image}.png` });
  });
});
