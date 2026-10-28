import { redirect } from 'next/navigation';
import { desc, eq, isNull, like, or } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  CLES_RUBRIQUES, LIBELLE_ROLE_PLATEFORME, ROLES_MATRICIELS, ROLES_PLATEFORME, RUBRIQUES_PLATEFORME, accesTotal, adminDateCourte, adminIlYa,
  caseDroit, initialesAvatar, peutEcrireEquipe, rubriquesApresBascule, texteAudit, type MatriceDroits, type RolePlateforme,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { Droits } from '../../../../../spatial/vues/admin/Droits';
import { bandeauSeul } from '../donnees';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = { staff: 'Membre enregistré.', retire: 'Membre retiré.', matrice: 'Droits enregistrés.' };
const ERR: Record<string, string> = {
  email: 'E-mail invalide.', role: 'Rôle inconnu.', soi: 'Tu ne peux pas te retirer ni te rétrograder toi-même.',
  admissible: 'Ton compte a été créé après son inscription dans l’équipe : il ne peut pas modifier l’équipe. Un fondateur doit te réinscrire.',
};

/**
 * « Rôles & droits » · porte de `/admin/equipe` (V5) · le rôle d'ÉQUIPE à accès
 * total (adminplus/admin), pas « fondateur » · un admin ajouté ici gère l'équipe
 * à son tour, comme dans l'écran V5. Les écritures (matrice, ajout, changement
 * de rôle, retrait) passent par les actions de l'équipe, qui reposent la garde
 * et l'admissibilité (SEC-10).
 */
export default async function DroitsSpatial({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.equipe || !accesTotal(s.equipe.role)) redirect('/dashboard');
  const { ok, e } = await searchParams;
  const peutEcrire = peutEcrireEquipe(s.equipe, (r) => accesTotal(r as RolePlateforme));

  const [b, staffRows, rightsRows, auditRows] = await Promise.all([
    bandeauSeul(),
    db ? db.select().from(schema.platformStaff) : Promise.resolve([]),
    db ? db.select().from(schema.platformRoleRights) : Promise.resolve([]),
    db ? db.select({ id: schema.studioAuditEvents.id, action: schema.studioAuditEvents.action, le: schema.studioAuditEvents.occurredAt, nom: schema.users.name, email: schema.users.email, role: schema.studioAuditEvents.effectiveRole })
      .from(schema.studioAuditEvents).leftJoin(schema.users, eq(schema.users.id, schema.studioAuditEvents.actorId))
      .where(or(isNull(schema.studioAuditEvents.workspaceId), like(schema.studioAuditEvents.action, 'studios.%')))
      .orderBy(desc(schema.studioAuditEvents.occurredAt)).limit(5) : Promise.resolve([]),
  ]);
  const matrice: MatriceDroits = {};
  for (const r of rightsRows) matrice[r.role as RolePlateforme] = (r.rubriques as string[]) ?? [];
  const rang = (r: RolePlateforme) => ROLES_PLATEFORME.indexOf(r);
  const maintenant = new Date();

  return (
    <Droits
      bandeau={b}
      legende={(ok && OK[ok]) || (e && ERR[e]) || (peutEcrire
        ? 'Clique une case pour ouvrir ou fermer la rubrique · enregistré aussitôt. Admin+ et Admin voient tout.'
        : 'Lecture seule · ton compte n’est pas admissible à modifier l’équipe (créé après son inscription).')}
      roles={ROLES_MATRICIELS.map((r) => LIBELLE_ROLE_PLATEFORME[r])}
      verrouille={!peutEcrire}
      lignes={RUBRIQUES_PLATEFORME.filter((r) => CLES_RUBRIQUES.includes(r.key)).map((rub) => ({
        rubrique: rub.label,
        cases: ROLES_MATRICIELS.map((role) => {
          const c = caseDroit(role, rub.key, matrice);
          return { role, niveau: c.niveau, libelle: c.libelle, aria: `${rub.label} · ${LIBELLE_ROLE_PLATEFORME[role]} : ${c.libelle}`, apres: rubriquesApresBascule(role, rub.key, matrice) };
        }),
      }))}
      rolesInvitation={peutEcrire ? ROLES_PLATEFORME.map((r) => ({ cle: r, libelle: LIBELLE_ROLE_PLATEFORME[r] })) : null}
      equipe={staffRows
        .map((r) => ({ email: r.email, role: r.role as RolePlateforme, depuis: r.createdAt as Date }))
        .sort((a, c) => rang(a.role) - rang(c.role) || a.email.localeCompare(c.email))
        .map((m) => ({
          email: m.email, initiales: initialesAvatar('', m.email), role: LIBELLE_ROLE_PLATEFORME[m.role], total: accesTotal(m.role), depuis: `depuis le ${adminDateCourte(m.depuis)}`,
          cleRole: m.role, moi: m.email.trim().toLowerCase() === s.user.email.trim().toLowerCase(),
        }))}
      gestion={peutEcrire}
      audit={auditRows.map((a) => {
        const acteur = a.nom || a.email || (a.role.startsWith('script:') ? 'Script' : 'Équipe');
        return { id: a.id, initiales: initialesAvatar(a.nom ?? '', a.email ?? acteur), acteur, texte: texteAudit(a.action), quand: adminIlYa(a.le as Date, maintenant) };
      })}
    />
  );
}
