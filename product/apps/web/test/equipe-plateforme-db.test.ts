import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import { pgMemoire } from './helpers/pg-memoire';

/**
 * La couche BASE de l'équipe plateforme · on applique les vraies migrations à une
 * base pglite et on lit le RÉSULTAT : le seed des deux fondateurs est là, et la
 * matrice des droits accepte bien une ligne par rôle (rubriques en jsonb). C'est
 * ce qui prouve que la migration 0053 s'applique et fait ce qu'elle promet, pas
 * seulement qu'un fichier .sql existe.
 */

async function base() {
  return pgMemoire(schema as unknown as Record<string, unknown>);
}

describe('équipe plateforme · migration + seed', () => {
  it('amorce les deux fondateurs · kguilbaux=adminplus, marine=admin', async () => {
    const db = await base();
    const rows = await db.select().from(schema.platformStaff);
    const parEmail = Object.fromEntries(rows.map((r) => [r.email, r.role]));
    expect(parEmail['kguilbaux@agence-glx.fr']).toBe('adminplus');
    expect(parEmail['marine@agence-melie.fr']).toBe('admin');
  });

  it('la matrice des droits stocke une liste de rubriques par rôle (jsonb)', async () => {
    const db = await base();
    await db.insert(schema.platformRoleRights).values({ role: 'manager', rubriques: ['dashboard', 'adsmap'] });
    const [row] = await db.select().from(schema.platformRoleRights).where(eq(schema.platformRoleRights.role, 'manager'));
    expect(row?.rubriques).toEqual(['dashboard', 'adsmap']);
    // Une ligne par rôle · réécrire remplace, pas d'empilement (clé primaire = rôle).
    await expect(
      db.insert(schema.platformRoleRights).values({ role: 'manager', rubriques: [] }),
    ).rejects.toThrow();
  });
});
