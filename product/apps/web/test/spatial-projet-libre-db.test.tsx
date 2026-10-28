// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Spatial · fiche projet · disposition libre, au RÉSULTAT · vraie base (pglite
 * et les migrations du dépôt), vraies actions serveur (aucune simulée).
 *
 *  · la VISITE de la fiche Spatiale (`?disposition=libre`) n'écrit rien ;
 *  · une flèche sur une carte de l'écran Spatial écrit UNE ligne
 *    `app_settings` pour (personne, projet) · la clé et la forme de la V5,
 *    ni le projet, ni la version, ni `studio_layouts` ne bougent ;
 *  · la page relit ensuite la position telle qu'enregistrée ;
 *  · une disposition rangée par la V5 (même clé) est relue telle quelle ·
 *    aucune donnée perdue au passage d'une interface à l'autre.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
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
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, usePathname: () => '/studio/projets', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq, sql } from '@tiktrends/db';
import { deriverCanvas, positionAuto } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { projetVideo } from './l4a-outils';
import { contenuVideo } from '../../../packages/core/test/studios-fixtures';
import { cleDispositionCanvas } from '../lib/studios/canvas/disposition';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import { avecSpatial } from './spatial/fournisseur';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = h.ids;
let A = { projectId: '', versionId: '' };
const modele = deriverCanvas(contenuVideo());
const auto = (id: string) => positionAuto({ ...modele, dimensions: Object.fromEntries(modele.cartes.map((c) => [c.id, { w: 220, h: 160 }])) }, id)!;

async function instantane() {
  const compte = async (t: string) => Number(((await db.execute(sql.raw(`select count(*)::int as n from ${t}`))) as unknown as { rows: Array<{ n: number }> }).rows[0]!.n);
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, A.projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, A.versionId));
  return {
    reglages: await compte('app_settings'), dispositionsPartagees: await compte('studio_layouts'), versions: await compte('studio_project_versions'),
    projet: { rowVersion: p!.rowVersion, courante: p!.currentVersionId, maj: p!.updatedAt?.toISOString?.() ?? null },
    version: { hash: v!.contentHash, contenu: JSON.stringify(v!.content) },
  };
}
const page = (projectId: string) => ProjetSpatial({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve({ disposition: 'libre' }) });
const html = async (projectId: string) => renderToStaticMarkup(avecSpatial(await page(projectId)));
const ligne = async (userId: string, projectId: string) => (await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleDispositionCanvas(userId, projectId))))[0]?.value as
  { v: number; rev: number; projectId: string; positions: Record<string, { x: number; y: number }> } | undefined;

let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; document.body.innerHTML = ''; });

beforeAll(async () => {
  await semer(db, schema, ids);
  A = await projetVideo(db as unknown as BaseStudio, ids, ids.brandA1, ids.ua);
});

describe('Spatial · disposition libre · vraie base', () => {
  it('la visite (`?disposition=libre`) n’écrit rien · les cartes du canvas métier à leur place automatique', async () => {
    h.session = session(ids, 'ua');
    const avant = await instantane();
    const rendu = await html(A.projectId);
    const e = auto('export');
    expect(rendu).toContain(`data-canvas-libre="${A.projectId}"`);
    expect(rendu).toMatch(new RegExp(`data-carte="export"[^>]*data-x="${e.x}" data-y="${e.y}"`));
    expect(await instantane(), 'visiter la fiche Spatiale a écrit en base').toEqual(avant);
  });

  it('une flèche sur une carte de l’écran Spatial · UNE ligne app_settings (clé et forme V5), projet et version intacts, position relue', async () => {
    h.session = session(ids, 'ua');
    const avant = await instantane();
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    root = createRoot(hote);
    const el = avecSpatial(await page(A.projectId));
    await act(async () => { root!.render(el); });
    const carte = hote.querySelector<HTMLButtonElement>('[data-carte="export"]')!;
    const e = auto('export');
    await act(async () => { carte.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await vi.waitFor(async () => expect(await ligne(ids.ua, A.projectId)).toBeTruthy(), { timeout: 5000 });
    await vi.waitFor(() => expect(hote.querySelector('[data-canvas-message]')!.textContent).toContain('Position enregistrée pour toi'));
    const l = (await ligne(ids.ua, A.projectId))!;
    expect(l).toMatchObject({ v: 2, rev: 1, projectId: A.projectId, positions: { export: { x: e.x + 16, y: e.y } } });
    expect(Object.keys(l.positions)).toEqual(['export']);
    const apres = await instantane();
    expect(apres.reglages).toBe(avant.reglages + 1);
    expect({ ...apres, reglages: avant.reglages }).toEqual(avant);
    // La page relit la position telle qu'enregistrée.
    expect(await html(A.projectId)).toMatch(new RegExp(`data-carte="export"[^>]*data-x="${e.x + 16}" data-y="${e.y}"`));
  });

  it('une disposition rangée par la V5 (même clé, même forme) est relue telle quelle par Spatial · rien de réécrit à la lecture', async () => {
    h.session = session(ids, 'ur');
    const cle = cleDispositionCanvas(ids.ur, A.projectId);
    const v5 = { v: 2, rev: 3, workspaceId: ids.wsA, brandId: ids.brandA1, projectId: A.projectId, positions: { mix: { x: 777, y: -333 }, export: { x: 12, y: 34 } } };
    await db.insert(schema.appSettings).values({ key: cle, value: v5 });
    const rendu = await html(A.projectId);
    expect(rendu).toMatch(/data-carte="mix"[^>]*data-x="777" data-y="-333"/);
    expect(rendu).toMatch(/data-carte="export"[^>]*data-x="12" data-y="34"/);
    expect(rendu).toContain('2 placées à la main');
    expect(await ligne(ids.ur, A.projectId)).toEqual(v5);
  });
});
