import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L8-D · persistance de la disposition du canvas, au RÉSULTAT · vraie base
 * (pglite + les migrations du dépôt).
 *
 *  · consulter (action ET composant serveur de la page) n'écrit RIEN ;
 *  · déplacer écrit UNE ligne `app_settings`, propre à la personne et au
 *    projet · ni la version, ni le projet, ni `studio_layouts` ne bougent ;
 *  · une autre personne garde sa propre disposition (vide) ;
 *  · hors portée : introuvable, rien d'écrit ; révision périmée : 409, rien
 *    d'écrasé ; disposition invalide : refusée, rien d'écrit.
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

import { db, schema, eq, sql } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { projetVideo } from './l4a-outils';
import { lireCanvasProjet, enregistrerDispositionCanvas, reinitialiserDispositionCanvas } from '../app/actions/studios/canvas';
import { CanvasProjet } from '../components/studios/canvas/CanvasProjet';
import { cleDispositionCanvas } from '../lib/studios/canvas/disposition';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
let A = { projectId: '', versionId: '' };
let B = { projectId: '', versionId: '' };

async function instantane() {
  const compte = async (t: string) => Number(((await db.execute(sql.raw(`select count(*)::int as n from ${t}`))) as unknown as { rows: Array<{ n: number }> }).rows[0]!.n);
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, A.projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, A.versionId));
  return {
    reglages: await compte('app_settings'),
    dispositionsPartagees: await compte('studio_layouts'),
    versions: await compte('studio_project_versions'),
    projet: { rowVersion: p!.rowVersion, courante: p!.currentVersionId, maj: p!.updatedAt?.toISOString?.() ?? null },
    version: { hash: v!.contentHash, contenu: JSON.stringify(v!.content) },
  };
}

beforeAll(async () => {
  await semer(db, schema, ids);
  A = await projetVideo(db as unknown as BaseStudio, ids, ids.brandA1, ids.ua);
  B = await projetVideo(db as unknown as BaseStudio, ids, ids.brandB1, ids.ub);
});

describe('canvas · consulter n’écrit rien', () => {
  it('l’action de lecture et le composant serveur de la page · base identique avant/après', async () => {
    etat.session = session(ids, 'ua');
    const avant = await instantane();
    const r = await lireCanvasProjet({ projectId: A.projectId, versionId: A.versionId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.canvas.modele.cartes.map((c) => c.id)).toContain('clip:s_produit');
    expect(r.canvas.disposition).toEqual({ positions: {} });
    expect(r.canvas.rev).toBe(0);
    const html = renderToStaticMarkup(await CanvasProjet({ projectId: A.projectId, versionId: A.versionId }));
    expect(html).toContain('data-carte="export"');
    expect(html).toContain('data-vue-canvas="liste"');
    expect(await instantane(), 'consulter le canvas a écrit en base').toEqual(avant);
  });
});

describe('canvas · déplacer écrit la disposition PERSONNELLE, rien d’autre', () => {
  it('une ligne app_settings pour (personne, projet) · version, projet, studio_layouts intacts', async () => {
    etat.session = session(ids, 'ua');
    const avant = await instantane();
    const r = await enregistrerDispositionCanvas({ projectId: A.projectId, disposition: { positions: { mix: { x: 10, y: 20 } } }, rev: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rev).toBe(1);
    const apres = await instantane();
    expect(apres.reglages).toBe(avant.reglages + 1);
    expect({ ...apres, reglages: avant.reglages }, 'déplacer une carte a touché le projet, la version ou la disposition partagée').toEqual(avant);
    const [l] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleDispositionCanvas(ids.ua, A.projectId)));
    expect((l!.value as { positions: unknown }).positions).toEqual({ mix: { x: 10, y: 20 } });

    const relu = await lireCanvasProjet({ projectId: A.projectId });
    expect(relu.ok && relu.canvas.disposition.positions).toEqual({ mix: { x: 10, y: 20 } });
    // L'empreinte de structure ne dépend pas de la position.
    expect(relu.ok && relu.canvas.modele.empreinte).toBe((await lireCanvasProjet({ projectId: A.projectId, versionId: A.versionId }) as { canvas: { modele: { empreinte: string } } }).canvas.modele.empreinte);
  });

  it('une autre personne du même espace garde SA disposition (vide) et range la sienne', async () => {
    etat.session = session(ids, 'ur');
    const r = await lireCanvasProjet({ projectId: A.projectId });
    expect(r.ok && r.canvas.disposition, 'la disposition d’une autre personne lui est servie').toEqual({ positions: {} });
    const w = await enregistrerDispositionCanvas({ projectId: A.projectId, disposition: { positions: { export: { x: 0, y: 0 } } }, rev: 0 });
    expect(w.ok).toBe(true);
    etat.session = session(ids, 'ua');
    const moi = await lireCanvasProjet({ projectId: A.projectId });
    expect(moi.ok && moi.canvas.disposition.positions, 'la disposition d’une autre personne a écrasé la mienne').toEqual({ mix: { x: 10, y: 20 } });
  });

  it('révision périmée · 409, rien d’écrasé', async () => {
    etat.session = session(ids, 'ua');
    // Première écriture concurrente (révision 0 alors qu'une ligne existe).
    const r = await enregistrerDispositionCanvas({ projectId: A.projectId, disposition: { positions: { mix: { x: 999, y: 999 } } }, rev: 0 });
    expect(!r.ok && r.code).toBe('VERSION_CONFLICT');
    // Un onglet avance la révision (1 → 2), l'autre écrit avec la révision 1, périmée.
    const onglet1 = await enregistrerDispositionCanvas({ projectId: A.projectId, disposition: { positions: { mix: { x: 12, y: 20 } } }, rev: 1 });
    expect(onglet1.ok && onglet1.rev).toBe(2);
    const onglet2 = await enregistrerDispositionCanvas({ projectId: A.projectId, disposition: { positions: { mix: { x: 999, y: 999 } } }, rev: 1 });
    expect(!onglet2.ok && onglet2.code, 'une révision périmée a écrasé la disposition').toBe('VERSION_CONFLICT');
    const relu = await lireCanvasProjet({ projectId: A.projectId });
    expect(relu.ok && relu.canvas.disposition.positions).toEqual({ mix: { x: 12, y: 20 } });
  });

  it('disposition invalide · refusée, rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await instantane();
    const r = await enregistrerDispositionCanvas({ projectId: A.projectId, disposition: { positions: { mix: { x: 'à gauche', y: 0 } } }, rev: 1 });
    expect(!r.ok && r.code).toBe('INVALID_SCHEMA');
    expect(await instantane()).toEqual(avant);
  });

  it('réinitialiser · disposition vide, révision suivante', async () => {
    etat.session = session(ids, 'ua');
    const r = await reinitialiserDispositionCanvas({ projectId: A.projectId, rev: 2 });
    expect(r.ok && r.rev).toBe(3);
    const relu = await lireCanvasProjet({ projectId: A.projectId });
    expect(relu.ok && relu.canvas.disposition).toEqual({ positions: {} });
  });
});

describe('canvas · portée', () => {
  it('une personne d’un autre espace · introuvable en lecture comme en écriture, rien d’écrit', async () => {
    etat.session = session(ids, 'ub');
    const avant = await instantane();
    const r = await lireCanvasProjet({ projectId: A.projectId });
    expect(!r.ok && r.code).toBe('NOT_FOUND');
    const w = await enregistrerDispositionCanvas({ projectId: A.projectId, disposition: { positions: { mix: { x: 1, y: 1 } } }, rev: 0 });
    expect(!w.ok && w.code).toBe('NOT_FOUND');
    expect(await instantane()).toEqual(avant);
    const [l] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleDispositionCanvas(ids.ub, A.projectId)));
    expect(l).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain(A.projectId);
  });

  it('une version d’un autre projet · introuvable', async () => {
    etat.session = session(ids, 'ua');
    const r = await lireCanvasProjet({ projectId: A.projectId, versionId: B.versionId });
    expect(!r.ok && r.code).toBe('NOT_FOUND');
  });

  it('sans session · refus, le composant serveur ne montre rien', async () => {
    etat.session = null;
    const r = await lireCanvasProjet({ projectId: A.projectId });
    expect(!r.ok && r.code).toBe('AUTH_REQUIRED');
    expect(await CanvasProjet({ projectId: A.projectId, versionId: A.versionId })).toBeNull();
  });
});
