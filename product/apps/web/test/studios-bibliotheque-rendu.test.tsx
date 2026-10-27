// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · les sorties LIVRÉES des projets Studios apparaissent dans
 * `/assets`, au HTML RENDU de la vraie page (pglite, migrations réelles).
 *
 * Avant : la page ne lisait que `assets` · une image produite dans un projet
 * Studios (`studio_assets`) n'apparaissait pas dans la bibliothèque de sa marque.
 *
 * On sème, dans l'espace A : une sortie livrée de la marque A1, un brouillon
 * non stocké, une sortie d'un lot échoué, une sortie écartée à la relecture,
 * une entrée de travail (dépôt), un export livré de la marque A2 ; dans
 * l'espace B : une sortie livrée. Puis on lit ce que chaque personne VOIT.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as null | { id: string; name: string } }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.marque, listBrands: async () => [] }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }), usePathname: () => '/assets', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { projetTest } from './l3-harnais';
// Vague 2 · l'écran V5 `/assets` est retiré · on lit ce que la page Spatiale
// (seule à servir `/assets`) remet à l'écran · ses fichiers, origine et gestes possibles.
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import type { FichierDrive } from '@tiktrends/core';

const ids = h.ids;
const m = {} as Record<'livreA' | 'brouillonA' | 'echecA' | 'rejeteA' | 'entreeA' | 'livreA2' | 'livreB' | 'exportB' | 'historiqueA', string>;
const projets = {} as Record<'A1' | 'A2' | 'B1', { id: string; titre: string }>;

async function sortie(o: { ws: string; brand: string; projet: string; version: string; origin: 'generated' | 'render' | 'upload'; etat?: 'stored' | 'pending'; mime?: string; lot?: { state: 'completed' | 'failed'; quality: 'passed' | 'pending' | 'rejected' } }): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.studioAssets).values({
    id, workspaceId: o.ws, brandId: o.brand, projectId: o.projet, storageKey: `studios/${o.ws}/${id}.png`, mime: o.mime ?? 'image/png',
    bytes: 10, width: 8, height: 6, sha256: 'a'.repeat(64), origin: o.origin, storageState: o.etat ?? 'stored',
  });
  if (o.lot) {
    await db.insert(schema.studioJobs).values({
      workspaceId: o.ws, brandId: o.brand, projectId: o.projet, projectVersionId: o.version, operation: 'image_generate',
      state: o.lot.state, qualityStatus: o.lot.quality, idempotencyKey: `biblio-${randomUUID()}`, inputHash: 'b'.repeat(64),
      snapshot: {}, result: { assets: { 'keyframe:s_image': id } },
    });
  }
  return id;
}

async function projet(brand: string, user: string) {
  const p = await projetTest(db, ids, brand, user);
  const [l] = await db.select({ title: schema.studioProjects.title }).from(schema.studioProjects).where(eq(schema.studioProjects.id, p.projectId));
  return { ...p, titre: l!.title };
}

beforeAll(async () => {
  await semer(db, schema, ids);
  const a1 = await projet(ids.brandA1, ids.ua);
  const a2 = await projet(ids.brandA2, ids.ua);
  const b1 = await projet(ids.brandB1, ids.ub);
  projets.A1 = { id: a1.projectId, titre: a1.titre };
  projets.A2 = { id: a2.projectId, titre: a2.titre };
  projets.B1 = { id: b1.projectId, titre: b1.titre };
  const A = { ws: ids.wsA, brand: ids.brandA1, projet: a1.projectId, version: a1.versionId };
  m.livreA = await sortie({ ...A, origin: 'generated', lot: { state: 'completed', quality: 'passed' } });
  m.brouillonA = await sortie({ ...A, origin: 'generated', etat: 'pending' });
  m.echecA = await sortie({ ...A, origin: 'generated', lot: { state: 'failed', quality: 'pending' } });
  m.rejeteA = await sortie({ ...A, origin: 'generated', lot: { state: 'completed', quality: 'rejected' } });
  m.entreeA = await sortie({ ...A, origin: 'upload' });
  m.livreA2 = await sortie({ ws: ids.wsA, brand: ids.brandA2, projet: a2.projectId, version: a2.versionId, origin: 'render', mime: 'image/jpeg' });
  m.livreB = await sortie({ ws: ids.wsB, brand: ids.brandB1, projet: b1.projectId, version: b1.versionId, origin: 'generated', lot: { state: 'completed', quality: 'passed' } });
  // Un export (sans lot) · la portée seule le retient, pas l'absence de lot.
  m.exportB = await sortie({ ws: ids.wsB, brand: ids.brandB1, projet: b1.projectId, version: b1.versionId, origin: 'render' });
  const [hist] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, uploaderUserId: ids.ua, name: 'Rush historique', kind: 'image', source: 'upload', url: 'https://exemple.invalid/rush.png' }).returning({ id: schema.assets.id });
  m.historiqueA = hist!.id;
});
beforeEach(() => {
  h.session = session(ids, 'ua');
  h.marque = { id: ids.brandA1, name: 'Marque A1' };
  for (const k of ['STUDIOS_CAPACITES_GENERALES', 'STUDIOS_CAPACITES_COUPEES', 'STUDIOS_ESPACES_PILOTES', 'STUDIOS_CAPACITES_PILOTES']) vi.stubEnv(k, '');
});
afterEach(async () => { vi.unstubAllEnvs(); await db.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsA))); });

async function rendre(): Promise<FichierDrive[]> {
  const el = (await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as React.ReactElement<{ donnees: { fichiers: FichierDrive[] } }>;
  return el.props.donnees.fichiers;
}
const carte = (d: FichierDrive[], id: string) => d.find((f) => f.id === id) ?? null;
const visibles = (d: FichierDrive[]) => d.map((f) => f.id);
/** L'origine affichée · sortie Studios (lien du projet), ancienne création (téléchargement), ou bibliothèque. */
const origine = (f: FichierDrive) => (f.projet ? 'studios' : f.telecharger ? 'historique' : 'bibliotheque');

describe('/assets (Spatial) · les sorties livrées des projets Studios rejoignent la bibliothèque', () => {
  it('marque A1 active · la sortie livrée apparaît, avec son origine, le lien du projet et sa vignette gardée', async () => {
    const d = await rendre();
    const c = carte(d, m.livreA);
    expect(c, 'la sortie Studios livrée de la marque A1 n’apparaît pas dans la bibliothèque').not.toBeNull();
    expect(origine(c!)).toBe('studios');
    expect(c!.projet).toEqual({ href: `/studio/projets/${projets.A1.id}`, titre: projets.A1.titre });
    expect(c!.vignette).toBe(`/api/studios/media/${m.livreA}`);
    expect(c!.url).toBe(`/api/studios/media/${m.livreA}`);
    expect(c!.lectureSeule).toBe(true);
    // La bibliothèque historique reste là, avec ses gestes.
    const hist = carte(d, m.historiqueA)!;
    expect(origine(hist)).toBe('bibliotheque');
    expect(hist.lectureSeule).toBe(false);
  });

  it('aucune action destructrice ni d’écriture sur la ligne Studios', async () => {
    const c = carte(await rendre(), m.livreA)!;
    // Lecture seule · l'écran n'offre alors ni suppression, ni droits, ni rangement.
    expect(c.lectureSeule, 'une sortie Studios est modifiable').toBe(true);
    expect(c.ia, 'la bascule IA, le template ou l’analyse sont offerts sur une sortie Studios').toBeUndefined();
    expect(c.droit).toBeNull();
  });

  it('brouillon, lot échoué, sortie écartée, entrée de travail · rien de tout ça n’apparaît', async () => {
    const v = visibles(await rendre());
    expect(v).not.toContain(m.brouillonA);
    expect(v).not.toContain(m.echecA);
    expect(v).not.toContain(m.rejeteA);
    expect(v).not.toContain(m.entreeA);
  });

  it('isolement · jamais une sortie de l’espace B, ni d’une autre marque que l’active', async () => {
    const v = visibles(await rendre());
    expect(v, 'une sortie de l’espace B fuit dans la bibliothèque de A').not.toContain(m.livreB);
    expect(v, 'un export de l’espace B fuit dans la bibliothèque de A').not.toContain(m.exportB);
    expect(v, 'la marque A2 apparaît alors que A1 est active').not.toContain(m.livreA2);
    expect(v.filter((x) => x === m.livreA)).toHaveLength(1);
  });

  it('sans marque active · toutes les marques visibles de l’espace, toujours pas l’espace B', async () => {
    h.marque = null;
    const d = await rendre();
    const v = visibles(d);
    expect(v).toContain(m.livreA);
    expect(v).toContain(m.livreA2);
    expect(v).not.toContain(m.livreB);
    expect(v, 'un export de l’espace B fuit dans la bibliothèque de A').not.toContain(m.exportB);
    expect(carte(d, m.livreA2)!.projet?.titre).toBe(projets.A2.titre);
  });

  it('membre restreint à A1 · la marque A2 lui reste fermée', async () => {
    h.session = session(ids, 'ur');
    h.marque = null;
    const v = visibles(await rendre());
    expect(v).toContain(m.livreA);
    expect(v, 'une marque restreinte fuit dans la bibliothèque').not.toContain(m.livreA2);
  });

  it('espace B · voit sa sortie, jamais celles de A', async () => {
    h.session = session(ids, 'ub');
    h.marque = null;
    const v = visibles(await rendre());
    expect(v).toContain(m.livreB);
    expect(v).toContain(m.exportB);
    expect(v, 'une sortie de l’espace A fuit dans la bibliothèque de B').not.toContain(m.livreA);
    expect(v).not.toContain(m.livreA2);
  });

  it('projets Studios coupés pour l’espace · aucune ligne Studios (la vignette répondrait 404)', async () => {
    await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ids.wsA), value: { actives: [], coupees: ['projets'] } });
    const d = await rendre();
    expect(d.filter((f) => origine(f) === 'studios').length, 'une sortie Studios est listée alors que les projets sont coupés pour l’espace').toBe(0);
    expect(visibles(d)).toContain(m.historiqueA);
  });
});
