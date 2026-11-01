import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Bibliothèque · « Utilisé dans » sur une VRAIE base (pglite + migrations
 * réelles), par la VRAIE lecture de la page (`lireUtilisationsBibliotheque` ·
 * garde Studios, capacité, portée). On écrit de vrais projets et de vraies
 * versions, puis on lit ce que l'aperçu d'un fichier recevra :
 *
 *  · le projet A cite le fichier dans sa version COURANTE · il est là, avec son
 *    rôle et le lien vers son écran « Produit et références » ;
 *  · le projet B cite un autre fichier · absent ;
 *  · le projet R ne le citait que dans une version ANCIENNE · absent ;
 *  · le projet archivé le cite · là, marqué archivé, après les actifs ;
 *  · le projet de la marque A2 le cite · visible pour un membre sans
 *    restriction, INVISIBLE pour le membre restreint à A1 ;
 *  · le projet d'un autre espace le cite · jamais visible depuis l'espace A,
 *    seul visible depuis l'espace B ;
 *  · sans lecture Studios (offre) · `null`, l'aperçu ne dit rien ;
 *  · les projets actifs listés sont exactement ceux que la page Studios
 *    (`listerProjetsCartes`) montre et qui citent le fichier · même lecture.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown }));
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
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));

import { db, schema, eq } from '@tiktrends/db';
import { contenuVide, empreinteContenu, idBibliotheque, vueUtiliseDans, SCHEMA_VERSION_CONTENU, type ContenuVersion } from '@tiktrends/core';
import { lireUtilisationsBibliotheque } from '../lib/studios/bibliotheque-utilisations';
import { listerProjetsCartes } from '../app/actions/studios/sources';
import { semer, session } from './studios-semis';

const ids = etat.ids;
const F = { cite: '', autre: '' };
const P: Record<'A' | 'B' | 'R' | 'archive' | 'marqueA2' | 'autreEspace', string> = {} as never;

const contenu = (refs: Array<{ uuid: string; role: string }>): ContenuVersion => ({
  ...contenuVide(),
  brief: { references: refs.map((r) => ({ assetId: idBibliotheque(r.uuid), role: r.role, scope: 'global' })) } as unknown as ContenuVersion['brief'],
});

/** Un projet et ses versions · la DERNIÈRE est la version courante. */
async function projet(titre: string, brandId: string, versions: Array<Array<{ uuid: string; role: string }>>, statut: 'active' | 'archived' = 'active'): Promise<string> {
  const ws = brandId === ids.brandB1 ? ids.wsB : ids.wsA;
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ws, brandId, kind: 'ads', title: titre, ownerId: ids.ua, status: statut }).returning();
  let parentId: string | null = null;
  for (const [i, refs] of versions.entries()) {
    const c = contenu(refs);
    const lignes: Array<{ id: string }> = await db.insert(schema.studioProjectVersions).values({
      projectId: p!.id, workspaceId: ws, brandId, parentId, n: i + 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c), authorId: ids.ua, reason: 'test',
    }).returning({ id: schema.studioProjectVersions.id });
    parentId = lignes[0]!.id;
  }
  await db.update(schema.studioProjects).set({ currentVersionId: parentId, rowVersion: versions.length }).where(eq(schema.studioProjects.id, p!.id));
  return p!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  const [a, b] = await db.insert(schema.assets).values([
    { workspaceId: ids.wsA, brandId: null, kind: 'image', name: 'Cité', url: 'https://cdn.test/cite.jpg' },
    { workspaceId: ids.wsA, brandId: null, kind: 'image', name: 'Autre', url: 'https://cdn.test/autre.jpg' },
  ]).returning();
  F.cite = a!.id; F.autre = b!.id;
  P.R = await projet('R · cité autrefois', ids.brandA1, [[{ uuid: F.cite, role: 'style' }], [{ uuid: F.autre, role: 'style' }]]);
  P.archive = await projet('Archivé', ids.brandA1, [[{ uuid: F.cite, role: 'logo' }]], 'archived');
  P.marqueA2 = await projet('Marque A2', ids.brandA2, [[{ uuid: F.cite, role: 'style' }]]);
  P.autreEspace = await projet('Secret B', ids.brandB1, [[{ uuid: F.cite, role: 'style' }]]);
  P.B = await projet('B · autre fichier', ids.brandA1, [[{ uuid: F.autre, role: 'composition' }]]);
  P.A = await projet('A · cite le fichier', ids.brandA1, [[], [{ uuid: F.cite, role: 'composition' }, { uuid: F.cite, role: 'style' }, { uuid: F.autre, role: 'style' }]]);
});
beforeEach(() => { etat.session = session(ids, 'ua'); });

const citants = async (fichier: string) => {
  const u = await lireUtilisationsBibliotheque();
  if (!u) throw new Error('lecture refusée');
  return (u.parFichier[fichier] ?? []).map((p) => ({ id: p.id, titre: p.titre, roles: p.roles, archive: p.archive, href: p.href, marque: p.marque }));
};

describe('« Utilisé dans » · les projets visibles qui citent le fichier dans leur version courante', () => {
  it('membre sans restriction · A (version courante) et la marque A2, puis l’archivé · ni B, ni R, ni l’autre espace', async () => {
    const r = await citants(F.cite);
    expect(r.map((x) => x.id).sort()).toEqual([P.A, P.marqueA2, P.archive].sort());
    expect(r.map((x) => x.id).slice(-1)).toEqual([P.archive]);
    expect(r.find((x) => x.id === P.A)).toEqual({ id: P.A, titre: 'A · cite le fichier', roles: ['Composition', 'Style'], archive: false, href: `/studio/projets/${P.A}/produit`, marque: 'Marque A1' });
    expect(r.find((x) => x.id === P.archive)).toMatchObject({ archive: true, roles: ['Logo'] });
    for (const absent of [P.B, P.R, P.autreEspace]) expect(r.map((x) => x.id)).not.toContain(absent);
    // L'autre fichier · A, B et R (sa version courante le cite).
    expect((await citants(F.autre)).map((x) => x.id).sort()).toEqual([P.A, P.B, P.R].sort());
  });

  it('les projets ACTIFS listés sont exactement ceux de la page Studios qui citent le fichier · même lecture', async () => {
    for (const qui of ['ua', 'ur'] as const) {
      etat.session = session(ids, qui);
      const cartes = await listerProjetsCartes();
      if (!cartes.ok) throw new Error(JSON.stringify(cartes));
      const actifs = (await citants(F.cite)).filter((x) => !x.archive).map((x) => x.id).sort();
      expect(actifs, qui).toEqual(cartes.cartes.map((c) => c.id).filter((id) => [P.A, P.marqueA2, P.autreEspace].includes(id)).sort());
    }
  });

  it('membre restreint à A1 · le projet de la marque A2 est INVISIBLE', async () => {
    etat.session = session(ids, 'ur');
    expect((await citants(F.cite)).map((x) => x.id).sort()).toEqual([P.A, P.archive].sort());
  });

  it('autre espace · seul son propre projet, jamais ceux de l’espace A', async () => {
    etat.session = session(ids, 'ub');
    expect((await citants(F.cite)).map((x) => x.id)).toEqual([P.autreEspace]);
    expect(await citants(F.autre)).toEqual([]);
  });

  it('sans lecture Studios (offre Starter) · null, comme la page Studios refuse · l’aperçu n’en dit rien', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    expect((await listerProjetsCartes()).ok).toBe(false);
    const u = await lireUtilisationsBibliotheque();
    expect(u).toBeNull();
    expect(vueUtiliseDans(u, { id: F.cite, lectureSeule: false })).toBeNull();
  });

  it('sans session · null', async () => {
    etat.session = null;
    expect(await lireUtilisationsBibliotheque()).toBeNull();
  });

  it('lecture seule · aucune ligne n’est écrite', async () => {
    const compte = async () => (await db.select().from(schema.studioAuditEvents)).length + (await db.select().from(schema.studioProjectVersions)).length;
    const avant = await compte();
    await lireUtilisationsBibliotheque();
    expect(await compte()).toBe(avant);
  });
});
