import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L5-A · actions `rendreApercu` (lecture) et `declinerFormat` (nouvelle version
 * par recomposition seule), sur vraie base (pglite + migrations du dépôt).
 * Preuves : lignes en base, réponses, pixels de l'aperçu décodés.
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

import { db, schema, sql, eq } from '@tiktrends/db';
import { contenuVide, type ContenuVersion, type DocumentStudio, type CalqueImage, type CalqueTexte } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerProjet } from '../app/actions/studios/projets';
import { rendreApercu, declinerFormat } from '../app/actions/studios/rendu';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import { pub11, decorA, produit, logo, decoder, capture } from './l5a-outils';

const ids = etat.ids;
const stockage = new Map<string, Uint8Array>();
const P = { a1: '', v1: '', a1Croise: '', a2: '' };
const M = { fond: '', produit: '', logo: '', logoA2: '' };

async function poser(brand: string, cle: string, octets: Uint8Array): Promise<string> {
  stockage.set(cle, octets);
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ids.wsA, brandId: brand, storageKey: cle, mime: 'image/png', bytes: octets.length,
    sha256: createHash('sha256').update(octets).digest('hex'), origin: 'upload', storageState: 'stored',
  }).returning();
  return a!.id;
}

type Comptes = { versions: number; audit: number; medias: number; jobs: number; devis: number; registre: number };
async function comptes(): Promise<Comptes> {
  const r = await db.execute(sql`select
    (select count(*)::int from studio_project_versions) versions, (select count(*)::int from studio_audit_events) audit,
    (select count(*)::int from studio_assets) medias, (select count(*)::int from studio_jobs) jobs,
    (select count(*)::int from studio_quotes) devis, (select count(*)::int from studio_budget_ledger) registre`);
  return ((r as unknown as { rows: Comptes[] }).rows ?? (r as unknown as Comptes[]))[0]!;
}

function contenu(doc: DocumentStudio): ContenuVersion {
  return { ...contenuVide(), productRef: { productId: 'prod_creme', assetId: M.produit }, document: doc };
}

beforeAll(async () => {
  await semer(db, schema, ids);
  M.fond = await poser(ids.brandA1, 'studios/a/fond.png', await decorA());
  M.produit = await poser(ids.brandA1, 'studios/a/produit.png', await produit());
  M.logo = await poser(ids.brandA1, 'studios/a/logo.png', await logo());
  M.logoA2 = await poser(ids.brandA2, 'studios/a2/logo.png', await logo());
  injecterLecteurMedias({ lire: async (m) => stockage.get(m.storageKey) ?? null });

  etat.session = session(ids, 'ua');
  const c = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Crème 24 h', contenu: contenu(pub11({ fond: M.fond, produit: M.produit, logo: M.logo })) });
  if (!c.ok) throw new Error(`semis : ${c.code} ${JSON.stringify(c.violations)}`);
  P.a1 = c.projet.id; P.v1 = c.version.id;
  // Projet A1 qui emprunte le logo de la marque A2 · interdit au rendu (pas d'usage inter-marques).
  const x = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Croisé', contenu: contenu(pub11({ fond: M.fond, produit: M.produit, logo: M.logoA2 })) });
  if (!x.ok) throw new Error('semis croisé');
  P.a1Croise = x.projet.id;
});

describe('rendreApercu · lecture pure d’une version', () => {
  it('rend la version courante : dimensions, PNG décodable aux pixels attendus, empreinte stable, RIEN d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await comptes();
    const a = await rendreApercu({ projectId: P.a1 });
    const b = await rendreApercu({ projectId: P.a1 });
    expect(await comptes()).toEqual(avant);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect([a.apercu.largeur, a.apercu.hauteur, a.apercu.versionId]).toEqual([1080, 1080, P.v1]);
    expect(a.apercu.sha256).toBe(b.apercu.sha256);
    expect(a.apercu.image.startsWith('data:image/png;base64,')).toBe(true);
    const px = await decoder(Buffer.from(a.apercu.image.split(',')[1]!, 'base64'));
    // Centre du produit : rouge rayé ; coin : décor bleu.
    const centre = (540 * 1080 + 540) * 4;
    expect(px.donnees[centre]!).toBeGreaterThan(150);
    expect(px.donnees[centre + 2]!).toBeLessThan(60);
    expect(px.donnees[(5 * 1080 + 5) * 4 + 2]!).toBeGreaterThan(150);
    expect(JSON.stringify(a)).not.toMatch(/studios\/a\//);
  });

  it('aperçu réduit sur demande, sans changer l’empreinte de la pleine taille', async () => {
    etat.session = session(ids, 'ua');
    const a = await rendreApercu({ projectId: P.a1, largeurMax: 270 });
    const b = await rendreApercu({ projectId: P.a1 });
    expect(a.ok && [a.apercu.largeurApercu, a.apercu.hauteurApercu]).toEqual([270, 270]);
    expect(a.ok && b.ok && a.apercu.sha256 === b.apercu.sha256).toBe(true);
  });

  it('SEC-01 · autre espace et marque restreinte : NOT_FOUND neutre ; média d’une autre marque : MISSING_REFERENCE', async () => {
    etat.session = session(ids, 'ub');
    const b = await rendreApercu({ projectId: P.a1 });
    expect(b).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    expect(JSON.stringify(b)).not.toContain(P.a1);
    etat.session = session(ids, 'ua');
    const x = await rendreApercu({ projectId: P.a1Croise });
    expect(x).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    expect(JSON.stringify(x)).not.toContain(M.logoA2);
  });
});

describe('IMG-10 · declinerFormat : nouvelle version par recomposition seule', () => {
  it('1:1 → 4:5 → 9:16 : versions n+1 chaînées, v1 intacte, aucun devis ni job ni dépense, audit écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await comptes();
    const v1Avant = (await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, P.v1)))[0]!;

    const d45 = await declinerFormat({ projectId: P.a1, baseVersionId: P.v1, format: '4:5', profil: 'meta-reels' });
    if (!d45.ok) throw new Error(`${d45.code} ${d45.message}`);
    const d916 = await declinerFormat({ projectId: P.a1, baseVersionId: d45.version.id, format: '9:16', profil: 'meta-reels' });
    if (!d916.ok) throw new Error(`${d916.code} ${d916.message}`);

    expect([d45.version.n, d45.version.parentId]).toEqual([2, P.v1]);
    expect([d916.version.n, d916.version.parentId]).toEqual([3, d45.version.id]);
    const doc = (d916.version.content as ContenuVersion).document!;
    expect([doc.width, doc.height]).toEqual([1080, 1920]);
    const prod = doc.layers.produit as CalqueImage;
    expect(Math.abs(prod.height - (prod.width * 1200) / 800)).toBeLessThanOrEqual(1);
    expect((doc.layers.cta as CalqueTexte).y + (doc.layers.cta as CalqueTexte).height).toBeLessThanOrEqual(1248);
    expect(d916.rapport.generationsProposees.map((g) => g.operation)).toEqual(['extension_decor']);

    const v1Apres = (await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, P.v1)))[0]!;
    expect(v1Apres.contentHash).toBe(v1Avant.contentHash);
    expect((v1Apres.content as ContenuVersion).document!.width).toBe(1080);

    const apres = await comptes();
    expect(apres).toEqual({ ...avant, versions: avant.versions + 2, audit: avant.audit + 2 });
    expect([apres.jobs, apres.devis, apres.registre]).toEqual([avant.jobs, avant.devis, avant.registre]);

    // La version déclinée se rend.
    const ap = await rendreApercu({ projectId: P.a1, versionId: d916.version.id });
    expect(ap.ok && [ap.apercu.largeur, ap.apercu.hauteur]).toEqual([1080, 1920]);
    if (ap.ok) capture('action-declinaison-9x16.png', Buffer.from(ap.apercu.image.split(',')[1]!, 'base64'));
  });

  it('base périmée : 409 VERSION_CONFLICT avec le diff, aucune version écrite', async () => {
    etat.session = session(ids, 'ua');
    const avant = await comptes();
    const r = await declinerFormat({ projectId: P.a1, baseVersionId: P.v1, format: '9:16' });
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', status: 409 });
    if (!r.ok) expect(r.conflit?.differences.length).toBeGreaterThan(0);
    expect(await comptes()).toEqual(avant);
  });

  it('refus : lecteur (FORBIDDEN), autre espace (NOT_FOUND), format inconnu (INVALID_SCHEMA), base absente', async () => {
    etat.session = session(ids, 'uv');
    expect(await declinerFormat({ projectId: P.a1, baseVersionId: P.v1, format: '9:16' })).toMatchObject({ code: 'FORBIDDEN' });
    etat.session = session(ids, 'ub');
    expect(await declinerFormat({ projectId: P.a1, baseVersionId: P.v1, format: '9:16' })).toMatchObject({ code: 'NOT_FOUND', targetIds: [] });
    etat.session = session(ids, 'ua');
    expect(await declinerFormat({ projectId: P.a1, baseVersionId: P.v1, format: '3:2' })).toMatchObject({ code: 'INVALID_SCHEMA' });
    expect(await declinerFormat({ projectId: P.a1, baseVersionId: null, format: '9:16' })).toMatchObject({ code: 'INVALID_SCHEMA' });
  });
});
