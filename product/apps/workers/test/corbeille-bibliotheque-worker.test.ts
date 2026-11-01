import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema } from '@tiktrends/db';
import { resoudreMedias } from '../src/studios/fournisseurs';
import type { BaseStudio } from '../src/studios/types';
import { pgMemoire } from './pg-memoire';

/**
 * Worker studio · un fichier de la Bibliothèque mis à la CORBEILLE
 * (`assets.deleted_at` posé) entre l'association et l'exécution ne part jamais
 * au fournisseur. Vraie base (pglite, migrations réelles) · on lit le RÉSULTAT
 * de `resoudreMedias` (média autorisé ou absent), jamais la présence d'un appel.
 */
let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const vivant = randomUUID();
const jete = randomUUID();

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core' });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B' });
  await base.insert(schema.assets).values([
    { id: vivant, workspaceId: ws, brandId: brand, name: 'vivant', kind: 'image', source: 'upload', url: PNG },
    { id: jete, workspaceId: ws, brandId: brand, name: 'jeté', kind: 'image', source: 'upload', url: PNG, deletedAt: new Date() },
  ]);
});

describe('resoudreMedias · bib_ · la corbeille', () => {
  it('un fichier vivant part ; un fichier de la corbeille est ABSENT', async () => {
    const r = await resoudreMedias(base, { workspaceId: ws, brandId: brand }, [`bib_${vivant}`, `bib_${jete}`], null);
    expect(r.map((m) => [m.assetId, m.etat])).toEqual([[`bib_${vivant}`, 'autorise'], [`bib_${jete}`, 'absent']]);
  });
});
