import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 7 · raccordement V5, sur une VRAIE base (pglite + migrations) et par les
 * ACTIONS serveur. On lit les réponses, les lignes en base et la relecture par
 * `lireProjetDetail` · jamais « une fonction a été appelée ».
 *
 *  (a) poser la provenance et les droits d'un média (`studio_assets.rights`) →
 *      relu en base ET dans `lireProjetDetail.droitsAssets` ;
 *  (b) ajouter une source Veille à un projet existant → `source_refs` mis à
 *      jour et relu ; une même source n'est pas ré-ajoutée ;
 *  PORTÉE · une action hors portée de marque est refusée AVANT écriture
 *      (NOT_FOUND neutre, rien ne bouge en base).
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marqueActive: null as string | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
  process.env.DATABASE_URL = 'postgres://test@127.0.0.1:5433/lot7_pglite';
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => (etat.marqueActive ? { id: etat.marqueActive, name: 'active' } : null),
  listBrands: async () => [],
}));

import { db, schema, eq } from '@tiktrends/db';
import { idSource } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerProjetDepuisSources, ajouterSourcesAuProjet, lireProjetDetail } from '../app/actions/studios/sources';
import { definirDroitsAsset } from '../app/actions/studios/produit';

const ids = etat.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub', s: Partial<SessionTest> = {}) => { etat.session = session(ids, q, s); };

const ANNONCE = {
  id: '9001', platform: 'meta', status: 'active', daysRunning: 40, mediaType: 'image',
  thumbnailUrl: 'https://cdn.exemple.test/a.jpg', advertiserName: 'Lumière Botanique',
  body: 'Votre peau mérite mieux · sérum vitamine C.', callToAction: 'Acheter', landingDomain: 'lb.fr', landingUrl: 'https://lb.fr/s',
};
const ANNONCE2 = { ...ANNONCE, id: '9002', advertiserName: 'Autre annonceur' };
const SRC1 = { type: 'veille', annonce: ANNONCE };
const SRC2 = { type: 'veille', annonce: ANNONCE2 };
const ID_SRC1 = idSource('veille_ad', 'meta:9001');
const ID_SRC2 = idSource('veille_ad', 'meta:9002');

const state = { projetA1: '', assetA1: '', assetA2: '' };

async function compte() {
  const n = async (t: any) => (await db.select().from(t)).length;
  return { projets: await n(schema.studioProjects), versions: await n(schema.studioProjectVersions), audit: await n(schema.studioAuditEvents) };
}

beforeAll(async () => {
  await semer(db, schema, ids);
  qui('ua'); etat.marqueActive = ids.brandA1;
  const r = await creerProjetDepuisSources({ sources: [SRC1], brandId: ids.brandA1, kind: 'ads', titre: 'Projet Lot 7', cleClic: 'clic-lot7-00001' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  state.projetA1 = r.projet.id;
  const [a1, a2] = await db.insert(schema.studioAssets).values([
    { workspaceId: ids.wsA, brandId: ids.brandA1, projectId: state.projetA1, storageKey: `k/${ids.wsA}/a1`, mime: 'image/png', bytes: 1200, sha256: 'a'.repeat(64), origin: 'upload', storageState: 'stored' },
    { workspaceId: ids.wsA, brandId: ids.brandA2, storageKey: `k/${ids.wsA}/a2`, mime: 'image/png', bytes: 1200, sha256: 'b'.repeat(64), origin: 'upload', storageState: 'stored' },
  ]).returning();
  state.assetA1 = a1!.id; state.assetA2 = a2!.id;
});

describe('(a) provenance et droits d’un média', () => {
  it('pose les droits · persistés en base, et relus dans lireProjetDetail.droitsAssets', async () => {
    qui('ua');
    const r = await definirDroitsAsset({ assetId: state.assetA1, licence: 'ugc_accord', source: 'Créateur Léa · accord écrit' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.droits).toMatchObject({ assetId: state.assetA1, licence: 'ugc_accord', libelle: 'UGC avec accord', source: 'Créateur Léa · accord écrit', renseigne: true });

    const [row] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, state.assetA1));
    expect(row!.rights).toMatchObject({ licence: 'ugc_accord', source: 'Créateur Léa · accord écrit', posePar: ids.ua });

    const d = await lireProjetDetail({ projectId: state.projetA1 });
    if (!d.ok) throw new Error(JSON.stringify(d));
    const vue = d.detail.droitsAssets.find((x) => x.assetId === state.assetA1);
    expect(vue).toMatchObject({ licence: 'ugc_accord', libelle: 'UGC avec accord', renseigne: true });

    // Un média sans droits saisis se lit « à préciser », jamais une valeur inventée.
    const ANONYME = d.detail.droitsAssets; // l'asset A2 n'appartient pas au projet · non listé ici
    expect(ANONYME.map((x) => x.assetId)).not.toContain(state.assetA2);

    const audit = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, state.assetA1));
    expect(audit.map((a) => a.action)).toContain('asset.set_rights');
  });

  it('refuse une licence hors énumération · rien n’est écrit', async () => {
    qui('ua');
    const [avant] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, state.assetA2));
    const r = await definirDroitsAsset({ assetId: state.assetA2, licence: 'domaine_public' });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    const [apres] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, state.assetA2));
    expect(apres!.rights).toEqual(avant!.rights);
  });

  it('PORTÉE · un membre restreint à A1 ne peut pas poser les droits d’un média de A2 · NOT_FOUND, rien ne bouge', async () => {
    qui('ur'); // restreint à A1
    const [avant] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, state.assetA2));
    const r = await definirDroitsAsset({ assetId: state.assetA2, licence: 'marque' });
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const [apres] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, state.assetA2));
    expect(apres!.rights, 'aucune écriture hors portée').toEqual(avant!.rights);
  });
});

describe('(b) ajout d’une source Veille après création', () => {
  it('ajoute une nouvelle source · source_refs mis à jour et relu par lireProjetDetail', async () => {
    qui('ua');
    const r = await ajouterSourcesAuProjet({ projectId: state.projetA1, sources: [SRC2] });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.ajoutees).toBe(1);
    expect(r.sources.map((s) => s.sourceId).sort()).toEqual([ID_SRC1, ID_SRC2].sort());

    const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, state.projetA1));
    expect((p!.sourceRefs as any[]).map((s) => s.sourceId).sort()).toEqual([ID_SRC1, ID_SRC2].sort());

    const d = await lireProjetDetail({ projectId: state.projetA1 });
    expect(d.ok && d.detail.sources.map((s) => s.sourceId).sort()).toEqual([ID_SRC1, ID_SRC2].sort());

    const audit = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, state.projetA1));
    expect(audit.map((a) => a.action)).toContain('project.add_sources');
  });

  it('une source déjà jointe n’est pas ré-ajoutée · refus, source_refs inchangé', async () => {
    qui('ua');
    const [avant] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, state.projetA1));
    const r = await ajouterSourcesAuProjet({ projectId: state.projetA1, sources: [SRC1] });
    expect(r).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    const [apres] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, state.projetA1));
    expect(apres!.sourceRefs).toEqual(avant!.sourceRefs);
  });

  it('PORTÉE · un membre d’un AUTRE espace ne peut pas ajouter de source · NOT_FOUND, rien ne bouge', async () => {
    const avantCompte = await compte();
    const [avant] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, state.projetA1));
    qui('ub'); // espace B
    const r = await ajouterSourcesAuProjet({ projectId: state.projetA1, sources: [SRC2] });
    expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const [apres] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, state.projetA1));
    expect(apres!.sourceRefs).toEqual(avant!.sourceRefs);
    expect(await compte(), 'aucune écriture hors portée').toEqual(avantCompte);
  });
});

describe('direction visuelle relue sans pixels concurrents', () => {
  it('persiste composition/style/format, garde provenance et reprend le même projet', async () => {
    qui('ua');
    const directionVisuelle = { composition: 'Produit centré, titre en haut, fond uni.', styleIntent: 'Lumière douce', formats: ['4:5'], texts: ['Découvrez notre produit'] };
    const entree = { sources: [SRC1], brandId: ids.brandA1, kind: 'image', objectif: 'Adapter pour notre marque', directionVisuelle, cleClic: 'direction-relue-0001' };
    const r = await creerProjetDepuisSources(entree);
    if (!r.ok) throw new Error(JSON.stringify(r));
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, r.versionId));
    const contenu = v!.content as { brief: { references: unknown[] } };
    expect(contenu.brief).toMatchObject(directionVisuelle);
    expect(contenu.brief.references).toEqual([]);
    const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, r.projet.id));
    expect((p!.sourceRefs as unknown[])[0]).toMatchObject({ sourceId: ID_SRC1, droit: 'observation_publique' });
    expect(JSON.stringify(p!.sourceRefs)).not.toContain('https://cdn');
    const reprise = await creerProjetDepuisSources(entree);
    expect(reprise).toMatchObject({ ok: true, deja: true, projet: { id: r.projet.id } });
  });
  it('refuse texte concurrent et direction invalide sans écriture', async () => {
    qui('ua'); const avant = await compte();
    for (const directionVisuelle of [
      { composition: 'Logo Lumière Botanique en haut', styleIntent: '', formats: ['1:1'] },
      { composition: '', styleIntent: '', formats: ['1:1'] },
      { composition: 'Produit centré', styleIntent: '', formats: ['inconnu'] },
    ]) {
      const r = await creerProjetDepuisSources({ sources: [SRC1], brandId: ids.brandA1, directionVisuelle, cleClic: 'direction-refus-0001' });
      expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
      expect(await compte()).toEqual(avant);
    }
  });
});
