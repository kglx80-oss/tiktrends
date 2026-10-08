import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Intégration L5 · la photo produit épinglée par L5-C (identité `pph_…`, octets
 * dans le catalogue EXISTANT) atteint l'éditeur L5-B et le rendu L5-A, sur une
 * VRAIE base (pglite + migrations réelles).
 *
 *  · l'éditeur lit ses dimensions dans les OCTETS et propose de la poser ;
 *  · l'aperçu passe par la route de L5-C, un média studio par la route L5-A ;
 *  · le rendu reçoit exactement ses octets et compose le document ;
 *  · photo distante (jamais téléchargée), photo d'une autre marque, fichier
 *    illisible : rien n'est proposé, le rendu refuse `MISSING_REFERENCE` ;
 *  · tout cela est une LECTURE : aucune ligne écrite.
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

import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { db, schema } from '@tiktrends/db';
import { documentInitial, idPhotoProduit, type DocumentStudio } from '@tiktrends/core';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { lireEditeurPour } from '../lib/studios/editeur/lecture';
import { urlsApercu } from '../lib/studios/editeur/apercus';
import { chargerMediasDocument } from '../lib/studios/rendu/medias';
import { rendreDocument } from '../lib/studios/rendu/compositeur';
import { semer, session } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, type Catalogue } from './l5c-outils';

const ids = etat.ids;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-08T10:00:00Z') };
const DISTANTE = 'https://cdn.boutique.test/gourde-dos.jpg';
let cat: Catalogue;
let png: Buffer;
let gourde = '';
let gourdeA2 = '';
let pngA2: Buffer;

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const uri = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;

async function photoDe(projectId: string, productId: string, n: number): Promise<string> {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  return c.catalogue.produits.find((p) => p.produit.id === productId)!.photos[n - 1]!.assetId;
}
async function projetEpingle(productId: string, n: number): Promise<{ projectId: string; photoId: string }> {
  const { projectId, versionId } = await projetStatique(db, ids, cat);
  const photoId = await photoDe(projectId, productId, n);
  const r = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId, photoId, composants: ['bouchon'] }, O);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return { projectId, photoId };
}
const docAvec = (assetId: string): DocumentStudio => documentInitial('4:5', { produit: { assetId, sourceWidth: 600, sourceHeight: 800 } });

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  png = await sharp({ create: { width: 600, height: 800, channels: 4, background: { r: 20, g: 140, b: 90, alpha: 1 } } }).png().toBuffer();
  pngA2 = await sharp({ create: { width: 600, height: 800, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
  const [g] = await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Gourde isotherme', imageUrl: uri(png), imageUrls: [uri(png), DISTANTE] }).returning();
  gourde = g!.id;
  const [g2] = await db.insert(schema.products).values({ brandId: ids.brandA2, name: 'Gourde de la marque A2', imageUrl: uri(pngA2) }).returning();
  gourdeA2 = g2!.id;
});
beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('raccord L5 · photo du catalogue épinglée → éditeur et rendu', () => {
  it('l’éditeur propose la photo épinglée, dimensions lues dans ses octets, aperçu par la route du projet', async () => {
    const { projectId, photoId } = await projetEpingle(gourde, 1);
    expect(photoId).toMatch(/^pph_[0-9a-f]{24}$/);
    const avant = await compter(db);
    const r = await lireEditeurPour(ctxDe(ids, 'ua'), projectId);
    if (!r.ok) throw new Error(r.code);
    expect(r.donnees.produit, 'la photo épinglée n’atteint pas l’éditeur').toEqual({ assetId: photoId, sourceWidth: 600, sourceHeight: 800, nom: 'Photo produit' });
    const media = randomUUID();
    expect(urlsApercu([photoId, media, 'calque-inconnu'], projectId)).toEqual({
      [photoId]: `/studio/projets/${projectId}/produit/fichier/${photoId}`,
      [media]: `/api/studios/media/${media}`,
    });
    expect(await compter(db), 'la lecture de l’éditeur a écrit').toEqual(avant);
  });

  it('le rendu reçoit exactement les octets de la photo et compose le document', async () => {
    const { projectId, photoId } = await projetEpingle(gourde, 1);
    const avant = await compter(db);
    const m = await chargerMediasDocument(ctxDe(ids, 'ua'), { id: projectId, brandId: ids.brandA1 }, docAvec(photoId));
    if (!m.ok) throw new Error(`${m.code} ${JSON.stringify(m)}`);
    expect(sha(m.medias.get(photoId)!)).toBe(sha(png));
    const rendu = await rendreDocument(docAvec(photoId), m.medias);
    if (!rendu.ok) throw new Error(JSON.stringify(rendu.violations));
    // Centre du document : c'est la photo (vert), pas le fond.
    const { largeur, hauteur, donnees } = rendu.pixels;
    const i = (Math.floor(hauteur / 2) * largeur + Math.floor(largeur / 2)) * 4;
    expect([donnees[i], donnees[i + 1], donnees[i + 2]]).toEqual([20, 140, 90]);
    expect(await compter(db), 'le chargement des médias a écrit').toEqual(avant);
  });

  it('photo distante · jamais téléchargée : rien proposé à l’éditeur, rendu refusé', async () => {
    const { projectId, photoId } = await projetEpingle(gourde, 2);
    const r = await lireEditeurPour(ctxDe(ids, 'ua'), projectId);
    if (!r.ok) throw new Error(r.code);
    expect(r.donnees.produit).toBeNull();
    const m = await chargerMediasDocument(ctxDe(ids, 'ua'), { id: projectId, brandId: ids.brandA1 }, docAvec(photoId));
    expect(!m.ok && m.code).toBe('MISSING_REFERENCE');
  });

  it('fichier du catalogue illisible (octets qui ne sont pas une image complète) · rien proposé, rendu refusé', async () => {
    const { projectId, photoId } = await projetEpingle(cat.produit.id, 1);
    const r = await lireEditeurPour(ctxDe(ids, 'ua'), projectId);
    if (!r.ok) throw new Error(r.code);
    expect(r.donnees.produit).toBeNull();
    const m = await chargerMediasDocument(ctxDe(ids, 'ua'), { id: projectId, brandId: ids.brandA1 }, docAvec(photoId));
    expect(!m.ok && m.code).toBe('MISSING_REFERENCE');
  });

  it('photo d’une autre marque, même visible par la session · le rendu d’un projet A1 la refuse', async () => {
    const { projectId } = await projetEpingle(gourde, 1);
    const etrangere = idPhotoProduit(gourdeA2, sha(pngA2));
    const m = await chargerMediasDocument(ctxDe(ids, 'ua'), { id: projectId, brandId: ids.brandA1 }, docAvec(etrangere));
    expect(!m.ok && m.code).toBe('MISSING_REFERENCE');
  });

  it('projet hors portée (autre espace) · la photo n’est pas lue', async () => {
    const { projectId, photoId } = await projetEpingle(gourde, 1);
    const m = await chargerMediasDocument(ctxDe(ids, 'ub'), { id: projectId, brandId: ids.brandA1 }, docAvec(photoId));
    expect(!m.ok && m.code).toBe('MISSING_REFERENCE');
  });
});
