import { describe, it, expect, vi, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';

// Base pglite réelle à la place du singleton `db` · schéma et opérateurs réels.
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import { brandFacts } from '../lib/digest';

/**
 * Le pendant RÉSULTAT du garde de source `digest-scope-marque.test.ts`. On sème
 * un espace agence avec deux marques et on vérifie, sur une vraie base, que la
 * lettre d'une marque ne compte JAMAIS les verdicts, gagnants et le stock de
 * l'autre · le bug #514, attrapé pour de vrai.
 */
const wsId = randomUUID();
const aId = randomUUID();
const bId = randomUUID();

/** Une chaîne concept→persona complète pour une marque · rend l'id de l'ad. */
async function chaine(brandId: string): Promise<string> {
  const [persona] = await db.insert(schema.personas).values({ brandId, name: 'P' }).returning();
  const [desire] = await db.insert(schema.desires).values({ workspaceId: wsId, personaId: persona!.id, label: 'D' }).returning();
  const [angle] = await db.insert(schema.angles).values({ workspaceId: wsId, desireId: desire!.id, label: 'A', mechanism: 'demo' }).returning();
  const [concept] = await db.insert(schema.concepts).values({ workspaceId: wsId, angleId: angle!.id, title: 'C' }).returning();
  const [ad] = await db.insert(schema.ads).values({ workspaceId: wsId, conceptId: concept!.id, variantCode: 'v1' }).returning();
  return ad!.id;
}

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: wsId, name: 'Agence' });
  await db.insert(schema.brands).values([
    { id: aId, workspaceId: wsId, name: 'Marque A' },
    { id: bId, workspaceId: wsId, name: 'Marque B' },
  ]);
  // Marque A · une ad sans verdict → c'est du STOCK en attente.
  await chaine(aId);
  // Marque B · une ad avec un verdict gagnant ARBITRÉ cette semaine.
  const adB = await chaine(bId);
  await db.insert(schema.verdicts).values({ adId: adB, workspaceId: wsId, status: 'validated', validated: 'winner' });
});

describe('digest · brandFacts isole les marques (résultat réel, pglite)', () => {
  const depuis = new Date(Date.now() - 8 * 86_400_000);

  // Note · on n'assertionne pas `iterationsReady` (requête « suites ») · elle
  // filtre `validated = any(${tableauJS})`, que le driver pglite ne lie pas
  // (« requires array on right side »). Le driver de prod (postgres.js) lie les
  // tableaux correctement · c'est une limite du harnais, pas un défaut produit.
  // Les trois autres faits suffisent à prouver l'isolation par marque de #514.

  it('la marque A ne compte ni les verdicts, ni les gagnants, ni le stock de B', async () => {
    const fa = await brandFacts(aId, wsId, 'Marque A', depuis);
    expect(fa.verdictsWeek, 'A ne doit compter aucun verdict de B').toBe(0);
    expect(fa.winnersWeek, 'A ne doit compter aucun gagnant de B').toBe(0);
    expect(fa.pending, 'A ne compte QUE sa propre ad en attente').toBe(1);
  });

  it('la marque B compte bien ses propres faits', async () => {
    const fb = await brandFacts(bId, wsId, 'Marque B', depuis);
    expect(fb.verdictsWeek).toBe(1);
    expect(fb.winnersWeek).toBe(1);
    expect(fb.pending, 'l’ad de B a un verdict arbitré · elle n’est plus en attente').toBe(0);
  });
});
