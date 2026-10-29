import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { DESCRIPTIF_FORMULES, formuleDeReference, ORDRE_FORMULES, ROLES_INVITABLES, etatInvitation, formuleSuivante, initialesPersonne, messagesRetourEquipe, nomCourt, teinteAvatar } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { PLAN_CREDITS, PLAN_LABEL, ROLE_LABEL, roleAtLeast, type Plan, type Role } from '../../../../lib/rbac';
import { appUrl } from '../../../../lib/mailer';
import { createInviteAction, revokeInviteAction } from '../../../actions/invites';
import { Equipe } from '../../../../spatial/vues/reglages/Equipe';
import { SOUS_NAV_REGLAGES } from '../../../../spatial/vues/reglages/sous-nav';

export const dynamic = 'force-dynamic';

export default async function EquipeSpatiale() {
  const s = await getSession();
  if (!s) redirect('/login');
  // Même garde que /team V5 · AVANT toute lecture (e-mails, liens d'invitation).
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const plan = s.plan as Plan;
  let membres: Array<{ email: string; name: string | null; role: Role }> = [];
  let invitations: Array<typeof schema.invites.$inferSelect> = [];
  if (db) {
    [membres, invitations] = await Promise.all([
      db.select({ email: schema.users.email, name: schema.users.name, role: schema.workspaceMembers.role })
        .from(schema.workspaceMembers).innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
        .where(eq(schema.workspaceMembers.workspaceId, s.workspaceId)) as Promise<typeof membres>,
      db.select().from(schema.invites).where(and(eq(schema.invites.workspaceId, s.workspaceId), eq(schema.invites.status, 'pending'))),
    ]);
  }
  const maintenant = new Date();
  const base = appUrl();
  const suivante = formuleSuivante(formuleDeReference(plan));
  // Moi d'abord, comme la maquette.
  const tries = [...membres].sort((a, b) => Number(b.email === s.user.email) - Number(a.email === s.user.email));

  return (
    <Equipe
      sousNav={SOUS_NAV_REGLAGES} plan={PLAN_LABEL[plan]}
      formules={ORDRE_FORMULES.map((k) => ({ nom: PLAN_LABEL[k], actuelle: k === plan, valeur: `${PLAN_CREDITS[k].toLocaleString('fr-FR')} crédits`, detail: DESCRIPTIF_FORMULES[k].marques }))} /* le prix d'un forfait ne se lit qu'au moment de le choisir (Forfaits, décision du 29/10) */
      suivante={suivante ? { libelle: `${PLAN_LABEL[suivante]} · ${PLAN_CREDITS[suivante].toLocaleString('fr-FR')} crédits`, href: '/billing' } : null}
      membres={tries.map((m, i) => ({ cle: m.email, initiales: initialesPersonne(m.name, m.email), teinte: teinteAvatar(i), nom: nomCourt(m.name, m.email), email: m.email, role: ROLE_LABEL[m.role], moi: m.email === s.user.email }))}
      invitations={invitations.map((v) => ({ id: v.id, email: v.email, role: ROLE_LABEL[v.role as Role], expiree: etatInvitation(v.expiresAt as Date | null, maintenant) === 'expiree', lien: `${base}/invite/${v.token}` }))}
      roles={ROLES_INVITABLES.map((r) => ({ valeur: r, libelle: ROLE_LABEL[r] }))}
      tousRoles={Object.values(ROLE_LABEL)}
      inviter={createInviteAction} revoquer={revokeInviteAction}
      retours={messagesRetourEquipe()}
    />
  );
}
