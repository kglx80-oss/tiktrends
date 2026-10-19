import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios } from './studios-semis';

/**
 * F-B · résolution des références `bib_` · le DROIT D'USAGE est relu À LA
 * GÉNÉRATION, sur une VRAIE base (pglite + migrations réelles, 0058 comprise).
 *
 * Le défaut que cette garde empêche · un asset associé au brief puis reclassé
 * « À préciser » (droits incertains, posés à dessein) repassait au modèle à la
 * génération, parce que la branche `bib_` relisait l'asset par id scopé
 * espace+marque SANS regarder `rights`. On lit le RÉSULTAT de
 * `resoudreReferencesImage` · un droit qui n'autorise pas la pub rend l'asset
 * `absent`, comme un média retiré du catalogue ; un droit autorisé (ou null,
 * non classé) le résout normalement. La règle est celle, UNIQUE, du noyau
 * (`droitAutorisePub`) · ce test n'en redéfinit aucune.
 *
 * MUTATION qui doit faire TOMBER la garde · retirer `&& droitAutorisePub(...)`
 * de la branche `bib_` dans references.ts · l'asset « À préciser » se résout
 * `present` et le cas `a_preciser → absent` échoue.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios }));
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

import { db, schema } from '@tiktrends/db';
import { resoudreReferencesImage } from '../lib/studios/image/references';
import { semer } from './studios-semis';

const ids = etat.ids;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const portee = () => ({ workspaceId: ids.wsA, brandId: ids.brandA1 });

/** Insère un asset image de l'espace A / marque A1, avec le droit donné · renvoie l'id de référence `bib_`. */
async function semerAsset(rights: string | null): Promise<string> {
  const [row] = await db!.insert(schema.assets).values({
    workspaceId: ids.wsA, brandId: ids.brandA1, name: 'flacon', kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png', rights,
  }).returning();
  return `bib_${row!.id}`;
}

async function etatDe(ref: string): Promise<string> {
  const m = await resoudreReferencesImage(db as never, portee(), [ref]);
  return m.get(ref)!.etat;
}

beforeAll(async () => {
  await semer(db, schema, ids);
});

describe('F-B · bib_ · le droit d’usage est relu à la génération', () => {
  it('droit « À préciser » · l’asset devient ABSENT (il ne repasse pas au modèle)', async () => {
    expect(await etatDe(await semerAsset('a_preciser'))).toBe('absent');
  });

  it('droit NULL (non classé, hérité) · résout normalement (present)', async () => {
    expect(await etatDe(await semerAsset(null))).toBe('present');
  });

  it('droit explicitement autorisé (« Photo de la marque ») · résout normalement (present)', async () => {
    expect(await etatDe(await semerAsset('photo_marque'))).toBe('present');
  });

  it('droit autorisé « Banque d’images » · present ; droit incertain · absent · côte à côte', async () => {
    expect(await etatDe(await semerAsset('banque_images'))).toBe('present');
    expect(await etatDe(await semerAsset('a_preciser'))).toBe('absent');
  });
});
