import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { accesTotal, type RolePlateforme, type MatriceDroits } from '@tiktrends/core';
import { isFounder } from './founder';

/**
 * Le rôle d'ÉQUIPE INTERNE d'un compte + la matrice des droits éditable.
 *
 * C'est ce qui fait entrer les rôles plateforme dans la session · une fois posé,
 * `effectiveAccess` construit un `Access` à face « équipe » (rubriques) plutôt
 * qu'à face « client » (rôle d'espace + formule). Absent → le compte reste un
 * client ordinaire, exactement comme avant.
 */
export interface EquipeSession {
  role: RolePlateforme;
  matrice: MatriceDroits;
}

/**
 * La logique PURE, séparée de la base pour être éprouvée au RÉSULTAT :
 *
 * - `platform_staff` donne le rôle. Pas de ligne mais compte fondateur →
 *   `adminplus` (filet : un fondateur garde l'accès total même si l'amorçage a
 *   sauté). Ni l'un ni l'autre → `null` (compte client, pas d'équipe).
 * - Accès total (adminplus/admin) → matrice VIDE : ils voient tout, la matrice
 *   ne les concerne pas · une requête de moins et aucune ambiguïté.
 * - Rôle gradé → on porte la matrice éditable telle quelle (rôle → rubriques).
 */
export function equipeDepuisLignes(
  email: string | null | undefined,
  staffRole: RolePlateforme | null,
  rightsRows: ReadonlyArray<{ role: string; rubriques: readonly string[] | null }>,
): EquipeSession | null {
  const role: RolePlateforme | null = staffRole ?? (isFounder(email) ? 'adminplus' : null);
  if (!role) return null;
  if (accesTotal(role)) return { role, matrice: {} };
  const matrice: MatriceDroits = {};
  for (const r of rightsRows) matrice[r.role as RolePlateforme] = r.rubriques ?? [];
  return { role, matrice };
}

/**
 * Lit le rôle d'équipe et, s'il est gradé, la matrice des droits · appelé une
 * fois par requête depuis `getSession`. Pour un accès total on n'ouvre PAS la
 * table des droits (inutile). L'email est normalisé en minuscules comme il est
 * stocké à l'amorçage.
 */
export async function equipeDeSession(email?: string | null): Promise<EquipeSession | null> {
  const e = email?.trim().toLowerCase();
  if (!e || !db) return equipeDepuisLignes(email, null, []);

  const [row] = await db
    .select()
    .from(schema.platformStaff)
    .where(eq(schema.platformStaff.email, e))
    .limit(1);
  const staffRole = (row?.role as RolePlateforme | undefined) ?? null;

  // Accès total → matrice inutile · on tranche sans seconde requête.
  if (staffRole && accesTotal(staffRole)) return { role: staffRole, matrice: {} };

  const rights = staffRole
    ? await db.select().from(schema.platformRoleRights)
    : [];
  return equipeDepuisLignes(email, staffRole, rights as { role: string; rubriques: readonly string[] | null }[]);
}
