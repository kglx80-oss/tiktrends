import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * CDC v8 · provenance Veille→création · la source de veille survit-elle à
 * l'enregistrement de la création et au RECHARGEMENT ? On exerce la lecture
 * RÉELLE (`listBrandAds`) sur une vraie base (pglite) · une génération qui porte
 * `input.sourceVeille` doit ressortir avec sa source ; une génération qui n'en
 * porte pas ne doit pas s'en inventer une. On vérifie un RÉSULTAT (l'objet rendu
 * à la carte), pas la présence d'un appel.
 *
 * Ce que ce test PROUVE · le tronçon « une source enregistrée sur la génération
 * se retrouve depuis la création, après rechargement ». Le geste de SAISIE dans
 * l'interface (ouvrir le studio depuis une pub de veille → générer → voir la
 * pastille) reste une recette UI · la chaîne de sérialisation (URL) et de
 * recomposition (`sourceVeilleDepuisRef`) est, elle, éprouvée au noyau.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsId: randomUUID(), userId: randomUUID(), brandId: randomUUID() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.userId, email: 'val@test.local', name: 'Camille' },
    workspaceId: ids.wsId, workspaceName: 'Agence', role: 'admin', plan: 'business',
  }),
}));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => ({ id: ids.brandId, name: 'Klorea', workspaceId: ids.wsId }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema } from '@tiktrends/db';
import { listBrandAds } from '../app/actions/ads';

const SOURCE = { plateforme: 'meta', id: '789', annonceur: 'Neva' };

let avecSource = '';
let sansSource = '';

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.userId, email: 'val@test.local', name: 'Camille' });
  await db!.insert(schema.workspaces).values({ id: ids.wsId, name: 'Agence' });
  await db!.insert(schema.brands).values({ id: ids.brandId, workspaceId: ids.wsId, name: 'Klorea' });

  // Une création NÉE d'une pub de veille · sa provenance est consignée sur la
  // génération, exactement comme la génération l'écrit (`input.sourceVeille`).
  const [a] = await db!.insert(schema.generations).values({
    brandId: ids.brandId, kind: 'ad',
    input: { template: 'benefits', headline: 'Une piscine nette sans effort', sourceVeille: SOURCE },
  }).returning({ id: schema.generations.id });
  avecSource = a!.id;

  // Une création SANS provenance · le studio ouvert à froid, sans passer par la
  // Veille · rien ne doit lui en inventer une.
  const [b] = await db!.insert(schema.generations).values({
    brandId: ids.brandId, kind: 'ad',
    input: { template: 'benefits', headline: 'Le geste en moins' },
  }).returning({ id: schema.generations.id });
  sansSource = b!.id;
});

describe('provenance · la source de veille se retrouve depuis la création, après rechargement', () => {
  it('listBrandAds rend la source enregistrée · plateforme, identifiant, annonceur', async () => {
    const ads = await listBrandAds();
    const cible = ads.find((x) => x.id === avecSource)!;
    expect(cible, 'la création est bien listée').toBeTruthy();
    expect(cible.sourceVeille, 'la provenance survit à la relecture (rechargement)').toEqual(SOURCE);
  });

  it('une création sans provenance n’en invente pas', async () => {
    const ads = await listBrandAds();
    const cible = ads.find((x) => x.id === sansSource)!;
    expect(cible.sourceVeille ?? null, 'pas de source fabriquée').toBeNull();
  });
});
