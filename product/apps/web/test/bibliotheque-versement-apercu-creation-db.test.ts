import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Bibliothèque · « Utiliser dans un projet » depuis l'APERÇU d'un fichier, et
 * « Nouveau projet » dans la fenêtre de versement, sur une VRAIE base (pglite +
 * migrations réelles), par les VRAIES actions serveur. On relit ce qui est
 * écrit (projet, versions, `brief.references`, audit) et ce que l'écran
 * « Produit et références » du projet relit ensuite (`lireProduitProjet`).
 *
 *  · aperçu · un seul fichier versé, relu dans le projet ;
 *  · création + versement · le projet est créé par l'écriture CANONIQUE
 *    (`creerProjet` · titre, type, marque, propriétaire, audit `project.create`)
 *    puis la sélection est versée par le même chemin (une seconde version) ;
 *  · rien n'est créé pour un lot refusé (fichier en corbeille, titre vide) ;
 *  · versement refusé APRÈS la création (le fichier part à la corbeille entre
 *    les deux) · le projet reste, la réponse le dit ;
 *  · rôle sans droit Studios ⇒ FORBIDDEN, rien de créé ; marque d'un autre
 *    espace, marque hors portée d'un membre restreint ⇒ NOT_FOUND, rien de créé ;
 *  · ce que la fenêtre propose (`creation`) · prêt avec la marque active, en
 *    lecture seule pour un lecteur.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown, marqueActive: null as string | null,
  /** Simule la course · le fichier part à la corbeille juste avant le versement qui suit la création. */
  jeterAvantVersement: null as string | null,
}));
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
// Marque active · le VRAI `getActiveBrand` (qui vérifie l'espace), cookie piloté par le test.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (k === 'tt_brand' && etat.marqueActive ? { value: etat.marqueActive } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
// Le VRAI versement · seule la course est provoquée (une vraie écriture en base), jamais une réponse simulée.
vi.mock('../lib/studios/produit/commandes', async (o) => {
  const vrai = await o<typeof import('../lib/studios/produit/commandes')>();
  return {
    ...vrai,
    verserSelectionBibliothequePour: async (...a: Parameters<typeof vrai.verserSelectionBibliothequePour>) => {
      if (etat.jeterAvantVersement) {
        const { db, schema, eq } = await import('@tiktrends/db');
        await db.update(schema.assets).set({ deletedAt: new Date() }).where(eq(schema.assets.id, etat.jeterAvantVersement));
        etat.jeterAvantVersement = null;
      }
      return vrai.verserSelectionBibliothequePour(...a);
    },
  };
});

import { db, schema, eq, sql } from '@tiktrends/db';
import { idBibliotheque, type BriefCanonique, type ContenuVersion } from '@tiktrends/core';
import { verserSelectionDansProjet, projetsPourVersement, creerProjetEtVerser } from '../app/actions/studios/versement';
import { lireProduitProjet } from '../app/actions/studios/produit';
import { semer, session } from './studios-semis';
import { semerCatalogue, projetStatique, compter, delta, dataUri, JAMAIS_TOUCHE, type Catalogue } from './l5c-outils';

const ids = etat.ids;
const P = schema.studioProjects;
const V = schema.studioProjectVersions;
let cat: Catalogue;
const m: Record<'commune' | 'seconde' | 'jetee' | 'aJeter' | 'deA1', string> = {} as never;

const courante = async (projectId: string) => {
  const [p] = await db.select().from(P).where(eq(P.id, projectId));
  const [v] = await db.select().from(V).where(eq(V.id, p!.currentVersionId!));
  return { p: p!, v: v! };
};
const refs = async (projectId: string) => (((await courante(projectId)).v.content as ContenuVersion).brief as unknown as BriefCanonique).references;
const nProjets = async () => {
  const r = await db.execute(sql.raw('select count(*)::int as n from studio_projects'));
  return Number(((Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ n: number }>)[0]!.n);
};
async function media(o: Partial<typeof schema.assets.$inferInsert> & { name: string }): Promise<string> {
  const [a] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: null, kind: 'image', url: dataUri(100 + Math.floor(Math.random() * 500)), ...o }).returning();
  return a!.id;
}
const entree = (o: Partial<Record<'brandId' | 'titre' | 'type' | 'role' | 'scope', unknown>> & { ids?: unknown } = {}) => ({
  brandId: ids.brandA1, titre: 'Rentrée · lunettes', type: 'ads', ids: [m.commune, m.seconde], role: 'style', scope: 'background', ...o,
});
/** Rien de créé ni d'écrit · aucun projet, aucune version, aucun audit. */
async function rienCree(f: () => Promise<unknown>) {
  const avant = await compter(db); const np = await nProjets();
  const r = await f();
  expect(delta(avant, await compter(db))).toEqual({});
  expect(await nProjets()).toBe(np);
  return r;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  m.commune = await media({ name: 'Commune', rights: 'photo_marque' });
  m.seconde = await media({ name: 'Seconde' });
  m.jetee = await media({ name: 'Jetée', deletedAt: new Date() });
  m.aJeter = await media({ name: 'Bientôt jetée' });
  m.deA1 = await media({ name: 'De la marque A1', brandId: ids.brandA1 });
});
beforeEach(() => { etat.session = session(ids, 'ua'); etat.marqueActive = ids.brandA1; etat.jeterAvantVersement = null; });

describe('depuis l’aperçu · un seul fichier', () => {
  it('le fichier de l’aperçu devient UNE référence du projet, relue par l’écran du projet', async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.deA1], role: 'composition', scope: 'global' })).toMatchObject({ ok: true, ajoutes: 1, dejaPresents: 0, versionN: 2 });
    expect(delta(avant, await compter(db))).toEqual({ versions: 1, audit: 1 });
    expect((await refs(projectId)).filter((x) => x.assetId.startsWith('bib_')).map((x) => [x.assetId, x.role, x.scope])).toEqual([[idBibliotheque(m.deA1), 'composition', 'global']]);
    const vue = await lireProduitProjet({ projectId });
    if (!vue.ok) throw new Error(JSON.stringify(vue));
    expect(vue.vue.associations.filter((x) => x.provenance === 'bibliotheque').map((x) => [x.libelle, x.libelleRole])).toEqual([['De la marque A1', 'Composition']]);
  });
});

describe('créer un projet depuis la fenêtre, puis y verser', () => {
  it('le projet est créé par l’écriture canonique, puis la sélection y est versée · relus en base et par l’écran du projet', async () => {
    const avant = await compter(db); const np = await nProjets();
    const r = await creerProjetEtVerser(entree());
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.versement).toMatchObject({ ok: true, ajoutes: 2, dejaPresents: 0, versionN: 2 });
    expect(r.projet).toEqual({ id: r.projet.id, titre: 'Rentrée · lunettes', href: `/studio/projets/${r.projet.id}/produit` });
    expect(await nProjets()).toBe(np + 1);
    const d = delta(avant, await compter(db));
    expect(d).toEqual({ versions: 2, audit: 2 });
    for (const k of JAMAIS_TOUCHE) expect(d[k], k).toBeUndefined();
    const { p, v } = await courante(r.projet.id);
    expect([p.title, p.kind, p.brandId, p.workspaceId, p.ownerId, p.status, v.n]).toEqual(['Rentrée · lunettes', 'ads', ids.brandA1, ids.wsA, ids.ua, 'active', 2]);
    expect((await refs(r.projet.id)).map((x) => [x.assetId, x.role, x.scope])).toEqual([[idBibliotheque(m.commune), 'style', 'background'], [idBibliotheque(m.seconde), 'style', 'background']]);
    const audits = await db.select({ action: schema.studioAuditEvents.action, actor: schema.studioAuditEvents.actorId }).from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, r.projet.id));
    expect(audits.map((a) => a.action).sort()).toEqual(['project.create', 'project.version.create']);
    expect(new Set(audits.map((a) => a.actor))).toEqual(new Set([ids.ua]));
    const vue = await lireProduitProjet({ projectId: r.projet.id });
    if (!vue.ok) throw new Error(JSON.stringify(vue));
    expect(vue.vue.associations.filter((x) => x.provenance === 'bibliotheque').map((x) => x.libelle)).toEqual(['Commune', 'Seconde']);
    // Il rejoint la liste de la fenêtre (même lecture que la page Studios).
    const lus = await projetsPourVersement();
    expect(lus.ok && lus.projets.find((x) => x.id === r.projet.id)).toMatchObject({ titre: 'Rentrée · lunettes', marque: 'Marque A1' });
  });

  it('un lot refusé (fichier en corbeille) · RIEN n’est créé, la raison est dite', async () => {
    const r = await rienCree(() => creerProjetEtVerser(entree({ ids: [m.commune, m.jetee] })));
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect((r as { violations: Array<{ raison: string }> }).violations.map((x) => x.raison).join(' | ')).toMatch(/« Jetée » est à la corbeille/);
  });

  it('la règle de nom · titre vide, type inconnu, rôle Produit · rien n’est créé', async () => {
    expect(await rienCree(() => creerProjetEtVerser(entree({ titre: '   ' })))).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ raison: 'Donne un titre au projet.' }] });
    expect(await rienCree(() => creerProjetEtVerser(entree({ type: 'film' })))).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(await rienCree(() => creerProjetEtVerser(entree({ role: 'product' })))).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
  });

  it('versement refusé APRÈS la création · le projet créé RESTE (vide de ces images), la réponse le dit', async () => {
    etat.jeterAvantVersement = m.aJeter;
    const np = await nProjets();
    const r = await creerProjetEtVerser(entree({ ids: [m.aJeter], titre: 'Course' }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.versement).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(r.versement.ok ? '' : r.versement.violations!.map((x) => x.raison).join(' | ')).toMatch(/« Bientôt jetée » est à la corbeille/);
    expect(await nProjets()).toBe(np + 1);
    const { p, v } = await courante(r.projet.id);
    expect([p.title, v.n]).toEqual(['Course', 1]);
    expect(await refs(r.projet.id)).toEqual([]);
  });
});

describe('droits et portée', () => {
  it('rôle sans droit d’écriture Studios (client_viewer, lecteur d’équipe) · FORBIDDEN, rien de créé', async () => {
    etat.session = session(ids, 'uv');
    expect(await rienCree(() => creerProjetEtVerser(entree()))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    etat.session = session(ids, 'uv', { equipe: { role: 'membre', matrice: { membre: ['studio'] } } } as never);
    expect(await rienCree(() => creerProjetEtVerser(entree()))).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    // La fenêtre le dit avant le clic · la règle de la page Studios.
    const lus = await projetsPourVersement();
    expect(lus.ok && lus.creation).toMatchObject({ etat: 'lecture-seule' });
  });

  it('marque d’un autre espace · NOT_FOUND (même réponse qu’une marque inconnue), rien de créé', async () => {
    expect(await rienCree(() => creerProjetEtVerser(entree({ brandId: ids.brandB1, ids: [m.commune] })))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    // L'espace vient de la SESSION · depuis l'espace B, la marque A1 n'existe pas.
    etat.session = session(ids, 'ub');
    expect(await rienCree(() => creerProjetEtVerser(entree({ ids: [m.commune] })))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('membre restreint à A1 · une marque hors de sa portée (A2) est refusée, rien de créé', async () => {
    etat.session = session(ids, 'ur');
    expect(await rienCree(() => creerProjetEtVerser(entree({ brandId: ids.brandA2, ids: [m.commune] })))).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('ce que la fenêtre propose · prêt pour la marque active ; sans marque active, la porte vers les marques', async () => {
    const r = await projetsPourVersement();
    expect(r.ok && r.creation).toEqual({ etat: 'pret', marque: { id: ids.brandA1, nom: 'Marque A1' }, libelle: 'Nouveau concept créatif' });
    etat.marqueActive = null;
    const s = await projetsPourVersement();
    expect(s.ok && s.creation).toMatchObject({ etat: 'sans-marque' });
    // Une marque active d'un autre espace (cookie forgé) ne compte pas.
    etat.marqueActive = ids.brandB1;
    const t = await projetsPourVersement();
    expect(t.ok && t.creation).toMatchObject({ etat: 'sans-marque' });
    // Membre restreint à A1 dont la marque active est A2 · hors de SA portée, la création n'est pas proposée pour elle.
    etat.session = session(ids, 'ur'); etat.marqueActive = ids.brandA2;
    const u = await projetsPourVersement();
    expect(u.ok && u.creation).toMatchObject({ etat: 'sans-marque' });
    etat.marqueActive = ids.brandA1;
    const w = await projetsPourVersement();
    expect(w.ok && w.creation).toMatchObject({ etat: 'pret', marque: { id: ids.brandA1 } });
  });
});

