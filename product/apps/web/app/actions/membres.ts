'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { estCleRole, refusChangementRole, refusRetraitMembre, revocationInvitationsAuRetrait, type CleRole, type RefusMembre } from '@tiktrends/core';
import { getSession } from '../../lib/auth';

/**
 * Équipe · retirer un membre de l'espace, changer son rôle. La règle vit au
 * noyau (`refusRetraitMembre`, `refusChangementRole`) · elle est relue ICI sur
 * les adhésions de l'espace VERROUILLÉES (`for update`), pour que deux
 * propriétaires ne se rétrogradent pas l'un l'autre au même instant.
 *
 * Retirer ne supprime que l'ADHÉSION (`workspace_members`) · le compte et tout
 * ce que la personne a créé restent. Chaque geste est écrit au journal d'audit
 * (`studio_audit_events`, ajout seul) dans la même transaction · les
 * restrictions de marque que le retrait emporte y sont recopiées.
 */

const HOME = '/team';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const champ = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };

type Issue = { refus: RefusMembre } | { ok: 'membre_retire' | 'role_change' };

async function avecEquipe(userId: string, faire: (ctx: {
  tx: Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];
  acteur: { id: string; role: CleRole }; cible: { id: string; role: CleRole } | null; proprietaires: number; workspaceId: string;
}) => Promise<Issue>): Promise<Issue> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!UUID.test(userId)) return { refus: 'membre_absent' };
  return db.transaction(async (tx) => {
    const M = schema.workspaceMembers;
    const lignes = await tx.select({ userId: M.userId, role: M.role }).from(M).where(eq(M.workspaceId, s.workspaceId)).for('update');
    const role = (r: unknown): CleRole => (estCleRole(r) ? r : 'client_viewer');
    const c = lignes.find((l) => l.userId === userId);
    // Le rôle de l'acteur est relu SOUS le verrou · pas celui de la session, lu
    // avant la transaction, qu'un geste concurrent a pu changer entre-temps.
    const moi = lignes.find((l) => l.userId === s.user.id);
    if (!moi) return { refus: 'forbidden' };
    return faire({
      tx, workspaceId: s.workspaceId,
      acteur: { id: s.user.id, role: role(moi.role) },
      cible: c ? { id: c.userId, role: role(c.role) } : null,
      proprietaires: lignes.filter((l) => l.role === 'owner').length,
    });
  });
}

function conclure(i: Issue): never {
  redirect('refus' in i ? `${HOME}?e=${i.refus}` : `${HOME}?ok=${i.ok}`);
}

/** Retire un membre de l'espace · son adhésion seulement, rien de ce qu'il a créé. */
export async function retirerMembreAction(formData: FormData): Promise<void> {
  const userId = champ(formData, 'userId');
  const issue = await avecEquipe(userId, async ({ tx, acteur, cible, proprietaires, workspaceId }) => {
    const refus = refusRetraitMembre({ acteur, cible, proprietaires });
    if (refus || !cible) return { refus: refus ?? 'membre_absent' };
    const S = schema.studioMemberBrandScopes;
    const portees = await tx.select({ brandId: S.brandId }).from(S).where(and(eq(S.workspaceId, workspaceId), eq(S.userId, cible.id)));
    await tx.delete(schema.workspaceMembers).where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, cible.id)));
    // Un lien d'invitation gardé ne doit pas lui rouvrir la porte (`revocationInvitationsAuRetrait`).
    const I = schema.invites;
    const enAttente = and(eq(I.workspaceId, workspaceId), eq(I.status, 'pending'));
    const annulees = await tx.update(I).set({ status: 'revoked' })
      .where(revocationInvitationsAuRetrait(cible.role) === 'espace' ? enAttente : and(enAttente, eq(I.invitedBy, cible.id)))
      .returning({ id: I.id });
    await tx.insert(schema.studioAuditEvents).values({
      actorId: acteur.id, effectiveRole: acteur.role, workspaceId, brandId: null,
      action: 'equipe.membre.retire', targetType: 'workspace_member', targetId: cible.id,
      versionBefore: cible.role, versionAfter: null, reason: '', traceId: randomUUID(),
      details: { restrictionsMarques: portees.map((p) => p.brandId), invitationsAnnulees: annulees.map((a) => a.id) },
    });
    return { ok: 'membre_retire' };
  });
  conclure(issue);
}

/** Change le rôle d'un membre · l'un des rôles invitables, jamais un second propriétaire. */
export async function changerRoleMembreAction(formData: FormData): Promise<void> {
  const userId = champ(formData, 'userId');
  const nouveau = champ(formData, 'role');
  const issue = await avecEquipe(userId, async ({ tx, acteur, cible, proprietaires, workspaceId }) => {
    const refus = refusChangementRole({ acteur, cible, proprietaires, nouveau });
    if (refus || !cible || !estCleRole(nouveau)) return { refus: refus ?? 'role' };
    if (cible.role === nouveau) return { ok: 'role_change' };
    await tx.update(schema.workspaceMembers).set({ role: nouveau })
      .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, cible.id)));
    await tx.insert(schema.studioAuditEvents).values({
      actorId: acteur.id, effectiveRole: acteur.role, workspaceId, brandId: null,
      action: 'equipe.membre.role', targetType: 'workspace_member', targetId: cible.id,
      versionBefore: cible.role, versionAfter: nouveau, reason: '', traceId: randomUUID(), details: null,
    });
    return { ok: 'role_change' };
  });
  conclure(issue);
}
