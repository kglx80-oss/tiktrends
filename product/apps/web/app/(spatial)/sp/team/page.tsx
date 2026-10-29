import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  DESCRIPTIF_FORMULES, formuleDeReference, ORDRE_FORMULES, RAISON_REFUS_MEMBRE, ROLES_INVITABLES, confirmationRetraitMembre, estCleRole, etatInvitation, formuleSuivante,
  initialesPersonne, messagesRetourEquipe, nomCourt, optionsRoleMembre, refusGesteMembre, teinteAvatar, type CleRole,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { PLAN_CREDITS, PLAN_LABEL, ROLE_LABEL, roleAtLeast, type Plan, type Role } from '../../../../lib/rbac';
import { appUrl } from '../../../../lib/mailer';
import { createInviteAction, revokeInviteAction } from '../../../actions/invites';
import { changerRoleMembreAction, retirerMembreAction } from '../../../actions/membres';
import { Equipe } from '../../../../spatial/vues/reglages/Equipe';
import { SOUS_NAV_REGLAGES } from '../../../../spatial/vues/reglages/sous-nav';

export const dynamic = 'force-dynamic';

export default async function EquipeSpatiale() {
  const s = await getSession();
  if (!s) redirect('/login');
  // Même garde que /team V5 · AVANT toute lecture (e-mails, liens d'invitation).
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const plan = s.plan as Plan;
  let membres: Array<{ userId: string; email: string; name: string | null; role: Role }> = [];
  let invitations: Array<typeof schema.invites.$inferSelect> = [];
  if (db) {
    [membres, invitations] = await Promise.all([
      db.select({ userId: schema.workspaceMembers.userId, email: schema.users.email, name: schema.users.name, role: schema.workspaceMembers.role })
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
  // Les gestes sur chaque membre · la MÊME règle que l'action serveur, qui la relit avant d'écrire.
  const cle = (r: unknown): CleRole => (estCleRole(r) ? r : 'client_viewer');
  const acteur = { id: s.user.id, role: cle(s.role) };
  const proprietaires = membres.filter((m) => m.role === 'owner').length;
  const raison = (r: keyof typeof RAISON_REFUS_MEMBRE | null) => (r ? RAISON_REFUS_MEMBRE[r] : null);
  const gestes = (m: (typeof membres)[number]) => {
    // Retrait et rôle se ferment pour les mêmes raisons (le rôle choisi, lui, est relu à l'envoi).
    const r = raison(refusGesteMembre({ acteur, cible: { id: m.userId, role: cle(m.role) }, proprietaires }));
    return {
      userId: m.userId, roleCle: m.role, raisonRole: r, raisonRetrait: r,
      confirmation: confirmationRetraitMembre(nomCourt(m.name, m.email), cle(m.role)),
    };
  };

  return (
    <Equipe
      sousNav={SOUS_NAV_REGLAGES} plan={PLAN_LABEL[plan]}
      formules={ORDRE_FORMULES.map((k) => ({ nom: PLAN_LABEL[k], actuelle: k === plan, valeur: `${PLAN_CREDITS[k].toLocaleString('fr-FR')} crédits`, detail: DESCRIPTIF_FORMULES[k].marques }))} /* le prix d'un forfait ne se lit qu'au moment de le choisir (Forfaits, décision du 29/10) */
      suivante={suivante ? { libelle: `${PLAN_LABEL[suivante]} · ${PLAN_CREDITS[suivante].toLocaleString('fr-FR')} crédits`, href: '/billing' } : null}
      membres={tries.map((m, i) => ({ cle: m.email, initiales: initialesPersonne(m.name, m.email), teinte: teinteAvatar(i), nom: nomCourt(m.name, m.email), email: m.email, role: ROLE_LABEL[m.role], moi: m.email === s.user.email, gestes: m.email === s.user.email ? undefined : gestes(m) }))}
      invitations={invitations.map((v) => ({ id: v.id, email: v.email, role: ROLE_LABEL[v.role as Role], expiree: etatInvitation(v.expiresAt as Date | null, maintenant) === 'expiree', lien: `${base}/invite/${v.token}` }))}
      roles={ROLES_INVITABLES.map((r) => ({ valeur: r, libelle: ROLE_LABEL[r] }))}
      optionsRole={optionsRoleMembre().map((o) => ({ valeur: o.cle, libelle: ROLE_LABEL[o.cle], choisissable: o.choisissable }))}
      inviter={createInviteAction} revoquer={revokeInviteAction} changerRole={changerRoleMembreAction} retirer={retirerMembreAction}
      retours={messagesRetourEquipe()}
    />
  );
}
