'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  accesTotal, estRolePlateforme, estRoleMatriciel, nettoyerRubriques,
  type RolePlateforme,
} from '@tiktrends/core';
import { getSession } from '../../lib/auth';

const HOME = '/admin/equipe';

/**
 * Écriture de l'équipe interne · réservée à l'ACCÈS TOTAL (adminplus/admin).
 *
 * Le garde lit le rôle d'équipe de la session (posé par getSession), pas le rôle
 * d'espace ni « fondateur » : c'est ce qui permet à un admin ajouté ICI de gérer
 * l'équipe à son tour, sans redéploiement. Un compte sans accès total est
 * renvoyé au tableau de bord.
 */
async function exigerAccesTotal() {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!s.equipe || !accesTotal(s.equipe.role)) redirect('/dashboard');
  return s;
}

/** Ajoute ou change le rôle d'un membre (email → rôle). */
export async function enregistrerStaffAction(formData: FormData): Promise<void> {
  const s = await exigerAccesTotal();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || '');
  if (!email || !email.includes('@')) redirect(`${HOME}?e=email`);
  if (!estRolePlateforme(role)) redirect(`${HOME}?e=role`);
  // Anti-verrouillage · on ne se rétrograde pas soi-même hors de l'accès total
  // (sinon l'écran devient inaccessible dès la requête suivante). Symétrique du
  // refus de se retirer soi-même dans retirerStaffAction. Rétrograder AUTRUI
  // reste permis · c'est le sens même d'un écran d'administration.
  if (email === s.user.email.trim().toLowerCase() && !accesTotal(role as RolePlateforme)) {
    redirect(`${HOME}?e=soi`);
  }

  await db!
    .insert(schema.platformStaff)
    .values({ email, role: role as RolePlateforme })
    .onConflictDoUpdate({
      target: schema.platformStaff.email,
      set: { role: role as RolePlateforme, updatedAt: new Date() },
    });
  redirect(`${HOME}?ok=staff`);
}

/**
 * Retire un membre de l'équipe. On refuse de se retirer SOI-MÊME · c'est le
 * garde anti-verrouillage le plus simple (un accès total ne se coupe pas l'herbe
 * sous le pied ; il rétrograde d'abord un autre s'il le faut). Les fondateurs
 * codés en dur reviennent de toute façon en adminplus (filet, lib/founder).
 */
export async function retirerStaffAction(formData: FormData): Promise<void> {
  const s = await exigerAccesTotal();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email) redirect(`${HOME}?e=email`);
  if (email === s.user.email.trim().toLowerCase()) redirect(`${HOME}?e=soi`);

  await db!.delete(schema.platformStaff).where(eq(schema.platformStaff.email, email));
  redirect(`${HOME}?ok=retire`);
}

/**
 * Enregistre les rubriques cochées d'un rôle MATRICIEL. adminplus/admin sont
 * refusés (accès total, jamais éditable). Les rubriques passent par
 * `nettoyerRubriques` · seul le connu entre en base, dédupliqué et ordonné.
 */
export async function enregistrerMatriceAction(formData: FormData): Promise<void> {
  await exigerAccesTotal();
  const role = String(formData.get('role') || '');
  if (!estRolePlateforme(role) || !estRoleMatriciel(role as RolePlateforme)) redirect(`${HOME}?e=role`);
  const rubriques = nettoyerRubriques(formData.getAll('rubrique').map(String));

  await db!
    .insert(schema.platformRoleRights)
    .values({ role: role as RolePlateforme, rubriques })
    .onConflictDoUpdate({
      target: schema.platformRoleRights.role,
      set: { rubriques, updatedAt: new Date() },
    });
  redirect(`${HOME}?ok=matrice`);
}
