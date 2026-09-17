import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * CDC v7 · N04-suite · le parcours COMPLET de la validation factuelle, sur une
 * vraie base (pglite) · ajouter une source → vérifier → modifier → invalider →
 * re-vérifier. On exerce l'action réelle (`verifierFaitAction`), la lecture
 * réelle (`chargerValidationsActives` + `faitsAvecEtat`) et la décision du
 * noyau (`qualiteCarte`). On vérifie des RÉSULTATS, pas des appels.
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
// Hors runtime Next, `revalidatePath` lève · on le neutralise, l'effet testé est
// la persistance et l'état recalculé, pas l'invalidation du cache de rendu.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { qualiteCarte } from '@tiktrends/core';
import { verifierFaitAction } from '../app/actions/ads-faits';
import { chargerValidationsActives, faitsAvecEtat } from '../lib/faits-preuve';

const CONTROLE_PROPRE = { produitFidele: true, texteLisible: true };
let genId: string;

// L'état d'un fait, tel que la carte le calcule · lecture réelle + noyau.
async function faits(rec: { template: string; quote?: string; headline?: string }) {
  const parGen = await chargerValidationsActives([genId]);
  return faitsAvecEtat(rec, parGen.get(genId));
}
async function nbPreuves(): Promise<number> {
  const rows = await db!.select().from(schema.factValidations);
  return rows.length;
}

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.userId, email: 'val@test.local', name: 'Camille' });
  await db!.insert(schema.workspaces).values({ id: ids.wsId, name: 'Agence' });
  await db!.insert(schema.brands).values({ id: ids.brandId, workspaceId: ids.wsId, name: 'Klorea' });
  const [g] = await db!.insert(schema.generations).values({
    brandId: ids.brandId, kind: 'ad',
    input: { template: 'testimonial', headline: 'Avis client', quote: 'Ma piscine n’a jamais été aussi nette' },
  }).returning({ id: schema.generations.id });
  genId = g!.id;
});

describe('N04-suite · ajouter source → vérifier → modifier → invalider → re-vérifier', () => {
  const recV1 = { template: 'testimonial', headline: 'Avis client', quote: 'Ma piscine n’a jamais été aussi nette' };
  const recV2 = { template: 'testimonial', headline: 'Avis client', quote: 'La meilleure piscine de tout le quartier' };

  it('1 · sans preuve, le témoignage est « à vérifier » et bloque « Prête à diffuser »', async () => {
    const f = await faits(recV1);
    expect(f[0]!.etat).toBe('a_verifier');
    expect(qualiteCarte({ ...CONTROLE_PROPRE, faits: f }).pretADiffuser).toBe(false);
  });

  it('2 · une case cochée seule ne suffit pas · vérifier SANS source est refusé', async () => {
    const r = await verifierFaitAction({ adId: genId, factCle: 'temoignage', source: '   ' });
    expect(r.error, 'une vérification sans source doit être refusée').toBeTruthy();
    expect(await nbPreuves(), 'aucune preuve ne doit être enregistrée sans source').toBe(0);
  });

  it('3 · avec une source, le fait devient « vérifié » et « Prête à diffuser » s’ouvre', async () => {
    const r = await verifierFaitAction({ adId: genId, factCle: 'temoignage', source: 'https://avis.example/123' });
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    const f = await faits(recV1);
    expect(f[0]!.etat).toBe('verifiee');
    expect(f[0]!.source).toBe('https://avis.example/123');
    expect(f[0]!.validateur, 'la preuve porte son validateur').toBe('Camille');
    expect(f[0]!.date, 'la preuve porte sa date').toBeTruthy();
    expect(qualiteCarte({ ...CONTROLE_PROPRE, faits: f }).pretADiffuser).toBe(true);
  });

  it('4 · modifier la citation INVALIDE la preuve, sans effacer l’historique approuvé', async () => {
    // On change le contenu du fait (la citation) · la signature ne colle plus.
    await db!.update(schema.generations).set({ input: recV2 }).where(eq(schema.generations.id, genId));
    const f = await faits(recV2);
    expect(f[0]!.etat, 'un contenu changé rend la preuve caduque').toBe('invalidee');
    expect(qualiteCarte({ ...CONTROLE_PROPRE, faits: f }).pretADiffuser, 'une preuve caduque bloque « prête »').toBe(false);
    // L'enregistrement approuvé N'EST PAS touché · l'historique reste.
    expect(await nbPreuves(), 'la validation d’origine reste dans l’historique').toBe(1);
  });

  it('5 · re-vérifier sur le nouveau contenu rétablit « vérifié » · l’historique grossit', async () => {
    const r = await verifierFaitAction({ adId: genId, factCle: 'temoignage', source: 'https://avis.example/456' });
    expect(r.error).toBeUndefined();
    const f = await faits(recV2);
    expect(f[0]!.etat).toBe('verifiee');
    expect(f[0]!.source, 'la preuve active est la plus récente').toBe('https://avis.example/456');
    expect(await nbPreuves(), 'append-only · deux preuves, l’ancienne conservée').toBe(2);
  });
});
