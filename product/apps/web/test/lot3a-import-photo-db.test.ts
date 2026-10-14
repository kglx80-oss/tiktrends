import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * UX V2 · lot 3a · photo produit importée dans le projet, sur une VRAIE base
 * (pglite + migrations réelles). On lit les LIGNES écrites (produit, version,
 * contenu, audit) et les octets SERVIS par la route d'aperçu, jamais la
 * présence d'un appel.
 *
 *  · l'import ajoute la photo au produit de la marque DU PROJET et l'épingle
 *    (identifiant = SHA-256 des octets), une version, un audit, rien d'autre ;
 *  · même contenu ré-importé · aucun doublon dans le produit ;
 *  · portée · un autre espace, un membre restreint, un lecteur, le produit
 *    d'une autre marque : refusés, RIEN écrit ;
 *  · refus avant écriture · fichier invalide, borne de photos, base périmée ;
 *  · un GET (lecture de l'écran, aperçu servi) n'écrit rien.
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

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { db, schema, eq, and } from '@tiktrends/db';
import { lireReferenceEpinglee, idPhotoProduit, colonnesApresImport, DATA_URI_PHOTO_MAX, MESSAGES_REFUS_PHOTO, PHOTOS_PRODUIT_MAX, type ContenuVersion, type BriefCanonique } from '@tiktrends/core';
import { importerPhotoProduitPour } from '../lib/studios/produit/import-photo';
import * as actions from '../app/actions/studios/produit';
import { GET as apercu } from '../app/(app)/studio/projets/[id]/produit/fichier/[assetId]/route';
import { semer, session } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, delta, type Catalogue } from './l5c-outils';

const ids = etat.ids;
const V = schema.studioProjectVersions;
const P = schema.products;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-11T10:00:00Z') };
let cat: Catalogue;

/** Une « photo » PNG : vraie signature, octets distincts. */
const png = () => `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(400)]).toString('base64')}`;
const sha = (uri: string) => createHash('sha256').update(Buffer.from(uri.split(',')[1]!, 'base64')).digest('hex');

async function produit(brandId: string, o: { imageUrl?: string | null; imageUrls?: string[] | null } = {}) {
  const [p] = await db.insert(P).values({ brandId, name: `Flacon ${randomBytes(2).toString('hex')}`, imageUrl: o.imageUrl ?? null, imageUrls: o.imageUrls ?? null }).returning();
  return p!;
}
const ligne = async (id: string) => (await db.select().from(P).where(eq(P.id, id)))[0]!;
const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  return (await db.select().from(V).where(eq(V.id, p!.currentVersionId!)))[0]!;
};

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
});
beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('import · la photo rejoint le produit de la marque du projet et devient la photo épinglée', () => {
  it('produit à photo distante · ajoutée EN FIN, principale gardée ; épinglée par son empreinte ; une version, un audit, rien d’autre', async () => {
    const pr = await produit(ids.brandA1, { imageUrl: 'https://cdn.test/flacon.jpg' });
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    const photo = png();
    const r = await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: photo, composants: ['bouchon doré'] }, O);
    const attendu = idPhotoProduit(pr.id, sha(photo));
    expect(r).toMatchObject({ ok: true, inchange: false, ajoutee: true, photoId: attendu });

    const apres = await ligne(pr.id);
    expect({ imageUrl: apres.imageUrl, imageUrls: apres.imageUrls }, 'écriture SQL différente de la règle du noyau').toEqual(colonnesApresImport({ imageUrl: 'https://cdn.test/flacon.jpg', imageUrls: null }, photo));
    expect(apres.imageUrl).toBe('https://cdn.test/flacon.jpg');

    const v = await courante(projectId);
    expect(v.n).toBe(2);
    const ref = lireReferenceEpinglee((v.content as ContenuVersion).productRef);
    expect(ref, 'la photo importée n’est pas la photo épinglée du projet').toMatchObject({ productId: pr.id, assetId: attendu, photo: { assetId: attendu, sha256: sha(photo), nature: 'contenu', position: 2, total: 2 }, composantsObligatoires: ['bouchon doré'] });
    const refs = ((v.content as ContenuVersion).brief as unknown as BriefCanonique).references;
    expect(refs).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: attendu, role: 'product', scope: 'product' })]));
    // Seules la version et son audit naissent · le produit est MIS À JOUR (aucune ligne de plus), aucune bibliothèque, aucune dépense.
    expect(delta(avant, await compter(db))).toEqual({ versions: 1, audit: 1 });
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, projectId), eq(schema.studioAuditEvents.action, 'project.version.create')));
    expect(a!.reason).toBe(`Photo importée et épinglée : ${pr.name} · photo 2 sur 2`);
  });

  it('produit sans aucune photo · la photo devient la principale', async () => {
    const pr = await produit(ids.brandA1);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const photo = png();
    expect(await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: photo }, O)).toMatchObject({ ok: true, ajoutee: true });
    expect(await ligne(pr.id)).toMatchObject({ imageUrl: photo, imageUrls: [photo] });
  });

  it('même contenu ré-importé · aucun doublon dans le produit, la photo existante est épinglée', async () => {
    const photo = png();
    const pr = await produit(ids.brandA1, { imageUrl: photo, imageUrls: [photo] });
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const r = await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: photo }, O);
    expect(r).toMatchObject({ ok: true, ajoutee: false, photoId: idPhotoProduit(pr.id, sha(photo)) });
    expect((await ligne(pr.id)).imageUrls, 'doublon écrit dans le produit').toEqual([photo]);
  });

  it('par l’action serveur (garde réelle, membre) · même résultat', async () => {
    const pr = await produit(ids.brandA1);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const r = await actions.importerPhotoProduit({ projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() });
    expect(r).toMatchObject({ ok: true, ajoutee: true });
  });
});

describe('concurrence · deux imports au même instant', () => {
  it('produit à 5 photos, deux photos DIFFÉRENTES importées en même temps · la borne tient (6), un seul ajout', async () => {
    const cinq = Array.from({ length: PHOTOS_PRODUIT_MAX - 1 }, (_, i) => `https://cdn.test/p${i}.jpg`);
    const pr = await produit(ids.brandA1, { imageUrl: cinq[0]!, imageUrls: cinq });
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const [a, b] = await Promise.all([png(), png()].map((dataUri) =>
      importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri }, O)));
    const urls = (await ligne(pr.id)).imageUrls ?? [];
    expect(urls.length, 'deux imports simultanés ont dépassé la borne de photos').toBe(PHOTOS_PRODUIT_MAX);
    const res = [a!, b!];
    const ajouts = res.filter((r) => r.ok && r.ajoutee).length;
    expect(ajouts, 'les deux imports disent avoir ajouté leur photo').toBeLessThanOrEqual(1);
    const refus = res.find((r) => !r.ok && r.code === 'INVALID_SCHEMA');
    expect(refus && !refus.ok ? refus.message : null, 'le perdant ne dit pas que le produit est complet').toBe(MESSAGES_REFUS_PHOTO.complet);
  });
});

describe('portée · personne hors du projet ne peut importer dedans', () => {
  it('autre espace (session et contexte) · NOT_FOUND neutre, rien écrit, produit intact', async () => {
    const pr = await produit(ids.brandA1);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    expect(await importerPhotoProduitPour(ctxDe(ids, 'ub'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() }, O)).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    etat.session = session(ids, 'ub');
    expect(await actions.importerPhotoProduit({ projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(delta(avant, await compter(db))).toEqual({});
    expect((await ligne(pr.id)).imageUrls, 'un autre espace a écrit une photo dans ce produit').toBeNull();
    expect((await courante(projectId)).n).toBe(1);
  });

  it('membre restreint à A1 sur un projet de la marque A2 · NOT_FOUND, rien écrit', async () => {
    const pr = await produit(ids.brandA2);
    const { projectId, versionId } = await projetStatique(db, ids, cat, { brandId: ids.brandA2 });
    const avant = await compter(db);
    expect(await importerPhotoProduitPour(ctxDe(ids, 'ur'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() }, O)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(delta(avant, await compter(db))).toEqual({});
    expect((await ligne(pr.id)).imageUrls).toBeNull();
  });

  it('lecteur · FORBIDDEN par l’action, rien écrit', async () => {
    const pr = await produit(ids.brandA1);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    etat.session = session(ids, 'uv');
    expect(await actions.importerPhotoProduit({ projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    // Lecteur d'espace vu par l'équipe plateforme · il LIT l'écran produit (studio.read)
    // mais n'a pas studio.propose : seul le garde de l'action l'arrête.
    etat.session = session(ids, 'uv', { equipe: { role: 'admin', matrice: {}, plateformeAdmissible: false } } as never);
    expect((await actions.lireProduitProjet({ projectId })).ok, 'le sujet devrait pouvoir lire').toBe(true);
    expect(await actions.importerPhotoProduit({ projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() }), 'un rôle en lecture seule a importé une photo').toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(delta(avant, await compter(db))).toEqual({});
    expect((await ligne(pr.id)).imageUrls).toBeNull();
  });

  it('produit d’une AUTRE marque visé depuis un projet A1 · refusé, ce produit n’est pas touché', async () => {
    const autre = await produit(ids.brandA2);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    expect(await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: autre.id, dataUri: png() }, O)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ chemin: 'productId' }] });
    expect(delta(avant, await compter(db))).toEqual({});
    expect((await ligne(autre.id)).imageUrls).toBeNull();
  });
});

describe('refus AVANT toute écriture', () => {
  it('fichier invalide (GIF, signature fausse, trop long) · INVALID_SCHEMA avec la phrase du noyau, produit intact', async () => {
    const pr = await produit(ids.brandA1);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const avant = await compter(db);
    const essai = (dataUri: string) => importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri }, O);
    expect(await essai(`data:image/gif;base64,${Buffer.from('GIF89a----').toString('base64')}`)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ chemin: 'dataUri', raison: MESSAGES_REFUS_PHOTO.format }] });
    expect(await essai(`data:image/jpeg;base64,${Buffer.from('<html>pas une image</html>').toString('base64')}`)).toMatchObject({ ok: false, violations: [{ raison: MESSAGES_REFUS_PHOTO.illisible }] });
    expect(await essai(`data:image/png;base64,iVBORw0KGgo${'A'.repeat(DATA_URI_PHOTO_MAX)}`)).toMatchObject({ ok: false, violations: [{ raison: MESSAGES_REFUS_PHOTO.trop_lourd }] });
    expect(delta(avant, await compter(db))).toEqual({});
    expect((await ligne(pr.id)).imageUrls).toBeNull();
  });

  it(`produit déjà à ${PHOTOS_PRODUIT_MAX} photos · refusé avec la phrase du noyau, rien ajouté`, async () => {
    const six = Array.from({ length: PHOTOS_PRODUIT_MAX }, png);
    const pr = await produit(ids.brandA1, { imageUrl: six[0]!, imageUrls: six });
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const r = await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() }, O);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ raison: MESSAGES_REFUS_PHOTO.complet }] });
    expect((await ligne(pr.id)).imageUrls).toEqual(six);
  });

  it('version de base périmée · VERSION_CONFLICT, la photo n’est PAS ajoutée au produit', async () => {
    const pr = await produit(ids.brandA1);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() }, O);
    const lu = await ligne(pr.id);
    const avant = await compter(db);
    const r = await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: png() }, O);
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect(delta(avant, await compter(db))).toEqual({});
    expect((await ligne(pr.id)).imageUrls, 'photo ajoutée malgré une base périmée').toEqual(lu.imageUrls);
  });
});

describe('un GET n’écrit rien', () => {
  it('lecture de l’écran produit puis aperçu de la photo importée · octets exacts servis, aucune ligne bougée', async () => {
    const pr = await produit(ids.brandA1);
    const { projectId, versionId } = await projetStatique(db, ids, cat);
    const photo = png();
    const r = await importerPhotoProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: pr.id, dataUri: photo }, O);
    if (!r.ok) throw new Error(r.code);
    const avant = await compter(db);
    const produitAvant = await ligne(pr.id);

    const vue = await actions.lireProduitProjet({ projectId });
    if (!vue.ok) throw new Error(vue.code);
    expect(vue.vue.epingle?.photo.assetId).toBe(r.photoId);
    const ph = vue.vue.produits.find((p) => p.id === pr.id)!.photos.find((x) => x.assetId === r.photoId)!;
    expect(ph.apercu).toBe(`/studio/projets/${projectId}/produit/fichier/${r.photoId}`);

    const rep = await apercu(new Request(`http://local${ph.apercu}`), { params: Promise.resolve({ id: projectId, assetId: r.photoId }) });
    expect(rep.status).toBe(200);
    expect(rep.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await rep.arrayBuffer()).equals(Buffer.from(photo.split(',')[1]!, 'base64')), 'l’aperçu ne sert pas les octets importés').toBe(true);

    // Autre espace · l'aperçu reste introuvable.
    etat.session = session(ids, 'ub');
    expect((await apercu(new Request('http://local/'), { params: Promise.resolve({ id: projectId, assetId: r.photoId }) })).status).toBe(404);

    expect(delta(avant, await compter(db)), 'un GET a écrit').toEqual({});
    expect(await ligne(pr.id)).toEqual(produitAvant);
  });
});

describe('la borne tient sous la limite RÉELLE du corps d’une action Next', () => {
  it('Next installé · 1 Mio par défaut, aucune surcharge dans next.config ; la borne laisse plus de 100 ko', () => {
    const req = createRequire(join(__dirname, '../package.json'));
    const racineNext = dirname(req.resolve('next/package.json'));
    const src = readFileSync(join(racineNext, 'dist/server/app-render/action-handler.js'), 'utf8');
    expect(src, 'la limite par défaut des actions Next a changé · re-mesurer DATA_URI_PHOTO_MAX').toMatch(/:\s*1024 \* 1024 \/\/ 1 MB/);
    const conf = readFileSync(join(__dirname, '../next.config.mjs'), 'utf8');
    expect(conf).not.toMatch(/bodySizeLimit/);
    expect(1024 * 1024 - DATA_URI_PHOTO_MAX).toBeGreaterThan(100_000);
  });
});
