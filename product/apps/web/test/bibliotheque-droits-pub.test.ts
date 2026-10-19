import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios } from './studios-semis';

/**
 * Bibliothèque V5 · les DROITS branchés sur l'éligibilité PUBLICITÉ, au RÉSULTAT.
 *
 * Le catalogue d'un projet (`chargerCatalogueProjet`) est le point où un média
 * de la bibliothèque devient associable à une création (donc à une pub). Seuls
 * les médias AUTORISÉS en pub (règle `droitAutorisePub` du noyau) doivent y
 * entrer. On sème trois images sous la même marque · droit null (hérité),
 * « Photo de la marque » (autorisé) et « À préciser » (incertain), puis on lit
 * la table de résolution `fichiers` et on vérifie QUI en sort.
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
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));

import { db, schema } from '@tiktrends/db';
import { idBibliotheque } from '@tiktrends/core';
import { semer } from './studios-semis';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';
import { ctxDe } from './l4a-outils';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';

const ids = etat.ids;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const O = { veilleOuverte: true, maintenant: new Date() };
let cat: Catalogue;
let projet = '';
const idDroit = { autorise: '', preciser: '' };

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);                 // 1 image biblio, droit null (hérité)
  const [aut] = await db!.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'Photo marque', kind: 'image', source: 'upload', url: PNG, rights: 'photo_marque' }).returning();
  const [pre] = await db!.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'À préciser', kind: 'image', source: 'upload', url: PNG, rights: 'a_preciser' }).returning();
  idDroit.autorise = aut!.id; idDroit.preciser = pre!.id;
  projet = (await projetStatique(db, ids, cat)).projectId;
});

async function assetsDuCatalogue(): Promise<Set<string>> {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projet, O);
  if (!c.ok) throw new Error(`catalogue KO · ${c.code}`);
  return new Set([...c.catalogue.fichiers.values()].filter((f) => f.provenance === 'bibliotheque').map((f) => f.assetId));
}

describe('droits → éligibilité publicité (catalogue du projet)', () => {
  it('admet le non classé (hérité) et le droit autorisé, exclut « À préciser »', async () => {
    const biblio = await assetsDuCatalogue();
    expect(biblio.has(idBibliotheque(cat.bibliotheque)), 'droit null (hérité) exclu à tort').toBe(true);
    expect(biblio.has(idBibliotheque(idDroit.autorise)), '« Photo de la marque » exclue à tort').toBe(true);
    expect(biblio.has(idBibliotheque(idDroit.preciser)), '« À préciser » admis en pub à tort').toBe(false);
  });
});
