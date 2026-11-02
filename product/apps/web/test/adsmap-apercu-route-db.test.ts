import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * `GET /api/adsmap/[id]/apercu` · le média d'une ad Adsmap rangé au stockage
 * privé, servi par l'identifiant de l'ad (l'aperçu des gagnantes de
 * l'assistant, le « Lien de l'Ad » de la table). On lit la RÉPONSE · statut,
 * cible de la redirection, en-têtes · pour chaque porte de la garde : session,
 * offre Adsmap, marque active, espace, objet du stockage de l'espace, lien
 * externe jamais relayé.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  brand: null as { id: string; name: string } | null,
  appelsDistants: [] as string[],
}));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.apercu.test', region: 'gra', bucket: 'tt-prive', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://stockage.apercu.test/tt-prive' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => etat.brand }));
vi.mock('@tiktrends/integrations/src/safe-fetch', () => ({ safeFetch: async (u: string) => { etat.appelsDistants.push(u); return null; } }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG }));

import { db, schema } from '@tiktrends/db';
import { routeApercuAdAdsmap } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { GET } from '../app/api/adsmap/[id]/apercu/route';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const ids = etat.ids;
const objet = (ws: string, n: string) => `${CFG.publicBaseUrl}/assets/${ws}/${n}`;
const ad = { a1: '', a2: '', b1: '', externe: '', autreEspace: '', sansLien: '' };

async function adDe(workspaceId: string, brandId: string, assetUrl: string | null): Promise<string> {
  const [pe] = await db!.insert(schema.personas).values({ brandId, name: 'Persona' }).returning();
  const [de] = await db!.insert(schema.desires).values({ workspaceId, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db!.insert(schema.angles).values({ workspaceId, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db!.insert(schema.concepts).values({ workspaceId, angleId: an!.id, title: 'Concept' }).returning();
  const [x] = await db!.insert(schema.ads).values({ workspaceId, conceptId: co!.id, variantCode: 'V1', assetUrl }).returning();
  return x!.id;
}

async function lire(id: string): Promise<{ statut: number; location: string | null; entetes: Headers }> {
  const r = await GET(new Request(`http://localhost${routeApercuAdAdsmap(id)}`), { params: Promise.resolve({ id }) });
  return { statut: r.status, location: r.headers.get('location'), entetes: r.headers };
}

const proprietaire = (surcharge: Partial<SessionTest> = {}) => session(ids, 'ua', { role: 'owner', plan: 'plus', ...surcharge });

beforeAll(async () => {
  await semer(db, schema, ids);
  ad.a1 = await adDe(ids.wsA, ids.brandA1, objet(ids.wsA, '1700000000007-44444444-gagnante.png'));
  ad.a2 = await adDe(ids.wsA, ids.brandA2, objet(ids.wsA, '1700000000008-55555555-autre-marque.png'));
  ad.b1 = await adDe(ids.wsB, ids.brandB1, objet(ids.wsB, '1700000000009-66666666-autre-espace.png'));
  ad.externe = await adDe(ids.wsA, ids.brandA1, 'https://drive.google.com/file/d/abc/view');
  ad.autreEspace = await adDe(ids.wsA, ids.brandA1, objet(ids.wsB, '1700000000010-77777777-intrus.png'));
  ad.sansLien = await adDe(ids.wsA, ids.brandA1, null);
});

describe('GET /api/adsmap/[id]/apercu · le média d’une ad, par sa route gardée', () => {
  it('l’ad de la marque active, objet du stockage de l’espace · 302 vers une adresse signée éphémère, en-têtes fermés', async () => {
    etat.session = proprietaire(); etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    const r = await lire(ad.a1);
    expect(r.statut, 'la gagnante doit être servie').toBe(302);
    const cible = new URL(r.location ?? 'http://x');
    expect(cible.host, 'la redirection vise le service du stockage').toBe(CFG.endpoint);
    expect(cible.pathname, 'la redirection vise l’objet de l’ad').toBe(`/${CFG.bucket}/assets/${ids.wsA}/1700000000007-44444444-gagnante.png`);
    expect(Number(cible.searchParams.get('X-Amz-Expires')), 'signature éphémère (≤ 300 s)').toBeLessThanOrEqual(300);
    expect(r.entetes.get('x-content-type-options')).toBe('nosniff');
    expect(r.entetes.get('cache-control'), 'la signature ne se garde pas en cache').toContain('no-store');
  });

  it('sans session · 401, aucune adresse du stockage', async () => {
    etat.session = null; etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    const r = await lire(ad.a1);
    expect(r.statut).toBe(401);
    expect(r.location).toBeNull();
  });

  it('offre sans Adsmap · 404 neutre', async () => {
    etat.session = proprietaire({ plan: 'core' }); etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    const r = await lire(ad.a1);
    expect(r.statut, 'Adsmap fermé par l’offre · l’ad ne se sert pas').toBe(404);
    expect(r.location).toBeNull();
  });

  it('l’ad d’une AUTRE marque de l’espace · 404 (même portée que la table, la marque active)', async () => {
    etat.session = proprietaire(); etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    const r = await lire(ad.a2);
    expect(r.statut, 'une ad hors de la marque active ne se sert pas').toBe(404);
    expect(r.location).toBeNull();
  });

  it('l’ad d’un AUTRE espace · 404', async () => {
    etat.session = proprietaire(); etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    const r = await lire(ad.b1);
    expect(r.statut).toBe(404);
    expect(r.location).toBeNull();
  });

  it('un lien externe n’est jamais relayé (aucun proxy ouvert vers une adresse saisie) · 404, rien n’est téléchargé', async () => {
    etat.session = proprietaire(); etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    etat.appelsDistants.length = 0;
    const r = await lire(ad.externe);
    expect(r.statut, 'un lien externe s’affiche tel quel à l’écran, la route ne le sert pas').toBe(404);
    expect(r.location).toBeNull();
    expect(etat.appelsDistants).toEqual([]);
  });

  it('un objet d’un autre espace dans le lien d’une ad de la marque · 404 (jamais signé)', async () => {
    etat.session = proprietaire(); etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    const r = await lire(ad.autreEspace);
    expect(r.statut).toBe(404);
    expect(r.location).toBeNull();
  });

  it('sans lien, ou identifiant malformé · 404', async () => {
    etat.session = proprietaire(); etat.brand = { id: ids.brandA1, name: 'Marque A1' };
    expect((await lire(ad.sansLien)).statut).toBe(404);
    expect((await lire('pas-un-uuid')).statut).toBe(404);
  });
});
