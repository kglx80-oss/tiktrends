import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Bibliothèque · « Utiliser dans un projet » sur une VRAIE base (pglite +
 * migrations réelles), par les VRAIES actions serveur. On lit ce qui est
 * écrit (version courante, `brief.references`, audit) et ce que l'écran
 * « Produit et références » du projet relit ensuite (`lireProduitProjet`).
 *
 *  · versement réel · deux images (commune et de la marque) deviennent des
 *    références du projet, rôle et portée choisis, UNE version, UN audit ;
 *  · tout ou rien · un fichier d'un autre espace, à la corbeille, une vidéo,
 *    une image d'une autre marque ou aux droits refusés ⇒ rien n'est écrit ;
 *    un projet d'un autre espace ⇒ NOT_FOUND, rien d'écrit ;
 *  · rôle sans droit d'écriture Studios (`client_viewer`) ⇒ FORBIDDEN ;
 *  · doublons non ajoutés · aucune version quand rien n'est nouveau ;
 *  · borne `TAG_SELECTION_MAX` ;
 *  · une image ANCIENNE (hors des 60 plus récentes) versée reste lisible
 *    dans le catalogue du projet · la référence n'est pas orpheline.
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

import { randomUUID } from 'node:crypto';
import { db, schema, eq, and } from '@tiktrends/db';
import { idBibliotheque, refusSelectionFichiersTropLarge, TAG_SELECTION_MAX, type BriefCanonique, type ContenuVersion } from '@tiktrends/core';
import { verserSelectionDansProjet, projetsPourVersement } from '../app/actions/studios/versement';
import { lireProduitProjet } from '../app/actions/studios/produit';
import { semer, session } from './studios-semis';
import { semerCatalogue, projetStatique, compter, delta, dataUri, JAMAIS_TOUCHE, type Catalogue } from './l5c-outils';

const ids = etat.ids;
const V = schema.studioProjectVersions;
let cat: Catalogue;
const m: Record<'commune' | 'video' | 'autreMarque' | 'autreEspace' | 'jetee' | 'aPreciser' | 'ancienne', string> = {} as never;

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(V).where(eq(V.id, p!.currentVersionId!));
  return v!;
};
const refs = async (projectId: string) => (((await courante(projectId)).content as ContenuVersion).brief as unknown as BriefCanonique).references;
const sansEffet = (d: Record<string, number | undefined>) => {
  for (const k of JAMAIS_TOUCHE) expect(d[k], `${k} a bougé : ${JSON.stringify(d)}`).toBeUndefined();
};
async function media(o: Partial<typeof schema.assets.$inferInsert> & { name: string }): Promise<string> {
  const [a] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: null, kind: 'image', url: dataUri(100 + Math.floor(Math.random() * 500)), ...o }).returning();
  return a!.id;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  m.ancienne = await media({ name: 'Ancienne', brandId: ids.brandA1, createdAt: new Date('2025-01-01T00:00:00Z') });
  m.commune = await media({ name: 'Commune', rights: 'photo_marque' });
  m.video = await media({ name: 'Rush', kind: 'video', url: 'https://cdn.test/rush.mp4' });
  m.autreMarque = await media({ name: 'De la marque A2', brandId: ids.brandA2 });
  m.autreEspace = await media({ name: 'Secrète', workspaceId: ids.wsB, brandId: ids.brandB1 });
  m.jetee = await media({ name: 'Jetée', deletedAt: new Date() });
  m.aPreciser = await media({ name: 'Douteuse', rights: 'a_preciser' });
  // Soixante images plus récentes · l'ancienne sort des « plus récentes » du catalogue.
  await db.insert(schema.assets).values(Array.from({ length: 60 }, (_, i) => ({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'image' as const, name: `Récente ${i}`, url: dataUri(700 + i) })));
});
beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('verser une sélection dans un projet', () => {
  it('deux images deviennent des références (rôle et portée choisis) · UNE version, UN audit, relues par l’écran du projet', async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    const r = await verserSelectionDansProjet({ projectId, ids: [m.commune, cat.bibliotheque], role: 'style', scope: 'background' });
    expect(r).toMatchObject({ ok: true, ajoutes: 2, dejaPresents: 0, versionN: 2, projet: { id: projectId, href: `/studio/projets/${projectId}/produit` } });
    const d = delta(avant, await compter(db));
    expect(d).toEqual({ versions: 1, audit: 1 });
    sansEffet(d);
    expect((await refs(projectId)).filter((x) => x.assetId.startsWith('bib_')).map((x) => [x.assetId, x.role, x.scope]))
      .toEqual([[idBibliotheque(m.commune), 'style', 'background'], [idBibliotheque(cat.bibliotheque), 'style', 'background']]);
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, projectId), eq(schema.studioAuditEvents.action, 'project.version.create')));
    expect(a!.reason).toBe('Bibliothèque · sélection de 2 images versée dans les références · rôle Style, portée Décor');
    expect(a!.actorId).toBe(ids.ua);
    // L'écran « Produit et références » du projet les montre, avec leur nom.
    const vue = await lireProduitProjet({ projectId });
    if (!vue.ok) throw new Error(JSON.stringify(vue));
    expect(vue.vue.associations.filter((x) => x.provenance === 'bibliotheque').map((x) => [x.libelle, x.libelleRole])).toEqual([['Commune', 'Style'], ['Coureuse de face', 'Style']]);
  });

  it('doublons · déjà là avec ce rôle, ils ne sont pas ajoutés ; rien de nouveau ⇒ aucune version', async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune], role: 'style', scope: 'global' })).toMatchObject({ ok: true, ajoutes: 1 });
    const avant = await compter(db);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune, cat.bibliotheque], role: 'style', scope: 'global' })).toMatchObject({ ok: true, ajoutes: 1, dejaPresents: 1, versionN: 3 });
    expect(delta(avant, await compter(db))).toEqual({ versions: 1, audit: 1 });
    const milieu = await compter(db);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune, cat.bibliotheque], role: 'style', scope: 'global' })).toMatchObject({ ok: true, ajoutes: 0, dejaPresents: 2, versionN: 3 });
    expect(delta(milieu, await compter(db))).toEqual({});
    expect((await refs(projectId)).filter((x) => x.assetId === idBibliotheque(m.commune))).toHaveLength(1);
  });

  it('une image ANCIENNE (hors des 60 plus récentes) · versée, elle reste dans le catalogue du projet', async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.ancienne], role: 'composition', scope: 'global' })).toMatchObject({ ok: true, ajoutes: 1 });
    const vue = await lireProduitProjet({ projectId });
    if (!vue.ok) throw new Error(JSON.stringify(vue));
    expect(vue.vue.associations.find((x) => x.assetId === idBibliotheque(m.ancienne))).toMatchObject({ libelle: 'Ancienne', provenance: 'bibliotheque' });
    expect(vue.vue.preparation.generative_scene.violations.map((x) => x.raison)).not.toContain('fichier qui n’est plus dans le catalogue ni dans les sources du projet');
  });
});

describe('tout ou rien · portée, corbeille, type, marque, droits', () => {
  const cas: Array<[string, () => string, RegExp]> = [
    ['un fichier d’un autre espace', () => m.autreEspace, /introuvable dans cet espace/],
    ['un fichier à la corbeille', () => m.jetee, /« Jetée » est à la corbeille/],
    ['une vidéo', () => m.video, /« Rush » n’est pas une image/],
    ['une image d’une autre marque', () => m.autreMarque, /autre marque que le projet/],
    ['une image aux droits « à préciser »', () => m.aPreciser, /n’autorisent pas la publicité/],
  ];
  for (const [nom, fichier, phrase] of cas) {
    it(`${nom} avec une image valide · refus total, rien d’écrit`, async () => {
      const { projectId } = await projetStatique(db, ids, cat);
      const avant = await compter(db);
      const r = await verserSelectionDansProjet({ projectId, ids: [m.commune, fichier()], role: 'style', scope: 'global' });
      expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
      expect(r.ok ? '' : r.violations!.map((x) => x.raison).join(' | ')).toMatch(phrase);
      expect(delta(avant, await compter(db))).toEqual({});
      expect((await refs(projectId)).some((x) => x.assetId.startsWith('bib_'))).toBe(false);
    });
  }

  it('un projet d’un autre espace · NOT_FOUND (même réponse que « n’existe pas »), rien d’écrit', async () => {
    const autre = await projetStatique(db, ids, cat, { brandId: ids.brandB1 });
    const avant = await compter(db);
    expect(await verserSelectionDansProjet({ projectId: autre.projectId, ids: [m.commune], role: 'style', scope: 'global' })).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    expect(await verserSelectionDansProjet({ projectId: randomUUID(), ids: [m.commune], role: 'style', scope: 'global' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(delta(avant, await compter(db))).toEqual({});
  });

  it('l’espace vient de la SESSION · depuis l’espace B, ni le projet ni les fichiers de A ne sont atteints', async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    etat.session = session(ids, 'ub');
    const avant = await compter(db);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune], role: 'style', scope: 'global' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(delta(avant, await compter(db))).toEqual({});
  });
});

describe('droits et bornes', () => {
  it('rôle sans droit d’écriture Studios (client_viewer, lecteur d’équipe) · FORBIDDEN, rien d’écrit', async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    etat.session = session(ids, 'uv');
    const avant = await compter(db);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune], role: 'style', scope: 'global' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    // Membre d'équipe invité en lecteur, studio ouvert par la matrice · il voit les projets, il n'y verse rien.
    etat.session = session(ids, 'uv', { equipe: { role: 'membre', matrice: { membre: ['studio'] } } } as never);
    const lus = await projetsPourVersement();
    expect(lus.ok && lus.projets.map((p) => p.id)).toContain(projectId);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune], role: 'style', scope: 'global' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(delta(avant, await compter(db))).toEqual({});
    expect((await refs(projectId)).some((x) => x.assetId.startsWith('bib_'))).toBe(false);
  });

  it(`au-delà de ${TAG_SELECTION_MAX} fichiers · refusé avec la phrase de la barre, rien d’écrit`, async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    const trop = Array.from({ length: TAG_SELECTION_MAX + 1 }, () => randomUUID());
    const r = await verserSelectionDansProjet({ projectId, ids: trop, role: 'style', scope: 'global' });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ raison: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) }] });
    expect(delta(avant, await compter(db))).toEqual({});
  });

  it('rôle Produit ou rôle absent · refusés, rien d’écrit', async () => {
    const { projectId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune], role: 'product', scope: 'product' })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(await verserSelectionDansProjet({ projectId, ids: [m.commune], role: undefined, scope: 'global' })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(delta(avant, await compter(db))).toEqual({});
  });

  it('la liste des projets · ceux de l’espace de la session, pas ceux d’un autre espace', async () => {
    const a = await projetStatique(db, ids, cat);
    const b = await projetStatique(db, ids, cat, { brandId: ids.brandB1 });
    const r = await projetsPourVersement();
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.projets.map((p) => p.id)).toContain(a.projectId);
    expect(r.projets.map((p) => p.id)).not.toContain(b.projectId);
    expect(r.projets.find((p) => p.id === a.projectId)).toMatchObject({ marque: 'Marque A1' });
  });
});
