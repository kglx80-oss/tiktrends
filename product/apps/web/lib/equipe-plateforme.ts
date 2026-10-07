import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { accesTotal, plateformeAdmissible, type RolePlateforme, type MatriceDroits } from '@tiktrends/core';
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
  /**
   * SEC-10 / E5 · le compte peut-il recevoir les permissions de portée
   * PLATEFORME du nouveau studio (`prompt.*`, `provider.configure`,
   * `run.inspect_redacted`, `knowledge.manage`) ? Calculé par
   * `plateformeAdmissible` (noyau) : fondateur de la liste codée, ou compte
   * créé AVANT l'inscription de son e-mail dans `platform_staff` (aucun e-mail
   * n'est vérifié dans le produit). Absent → non admissible.
   *
   * N'ENLÈVE RIEN · `role` et `matrice` restent lus comme avant (rail,
   * `/admin/equipe`, connaissances, crédits illimités). Seul le nouveau studio
   * doit le lire (`lib/studios/garde.ts`, branchement décrit au rapport SEC).
   */
  plateformeAdmissible?: boolean;
}

/**
 * Fondateurs de la liste CODÉE (`lib/founder.ts` · `FONDATEURS`), sans
 * `FOUNDER_EMAILS` · `founder.ts` n'exporte que l'union. Recopie éprouvée
 * contre le source de `founder.ts` (`sec-plateforme-admissible.test.ts`) ;
 * un écart y échoue. À remplacer par un export `estFondateurCode` de
 * `founder.ts` (hors périmètre SEC).
 */
export const FONDATEURS_CODES: readonly string[] = ['kguilbaux@agence-glx.fr', 'marine@agence-melie.fr'];

function estFondateurCode(email: string): boolean {
  return FONDATEURS_CODES.includes(email.trim().toLowerCase());
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

  // SEC-10 · antériorité du compte sur l'inscription staff. Une requête de plus
  // pour les seuls comptes d'équipe (jamais pour un client).
  let admissible = estFondateurCode(e);
  if (!admissible && row) {
    const [u] = await db.select({ createdAt: schema.users.createdAt }).from(schema.users)
      .where(eq(schema.users.email, e)).limit(1);
    admissible = plateformeAdmissible({ fondateurCode: false, emailVerifie: null, compteCreeLe: u?.createdAt, staffInscritLe: row.createdAt });
  }

  // Accès total → matrice inutile · on tranche sans seconde requête.
  if (staffRole && accesTotal(staffRole)) return { role: staffRole, matrice: {}, plateformeAdmissible: admissible };

  const rights = staffRole
    ? await db.select().from(schema.platformRoleRights)
    : [];
  const equipe = equipeDepuisLignes(email, staffRole, rights as { role: string; rubriques: readonly string[] | null }[]);
  return equipe ? { ...equipe, plateformeAdmissible: admissible } : null;
}
