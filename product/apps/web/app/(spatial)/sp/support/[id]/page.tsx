import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { LIBELLE_STATUT_TICKET, STATUTS_TICKET, adminDateHeure, filTicket, initialesPersonne, messagesRetourSupport, pastilleStatutTicket, pastilleTypeTicket, peutLireTicket } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { roleAtLeast } from '../../../../../lib/rbac';
import { replyTicketAction, setTicketStatusAction } from '../../../../actions/support';
import { Ticket } from '../../../../../spatial/vues/reglages/Support';

export const dynamic = 'force-dynamic';

/**
 * Le fil d'un ticket · vague 4 · mêmes droits que l'écran V5 retiré · le
 * ticket doit être de l'espace (sinon introuvable) ; un membre ne lit que les
 * siens (sinon retour à la liste, `?e=forbidden`) ; seul un administrateur
 * change le statut.
 */
export default async function TicketSpatial({ params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  if (!db) notFound();
  const admin = roleAtLeast(s.role, 'admin');
  const [tk] = await db.select().from(schema.tickets).where(and(eq(schema.tickets.id, id), eq(schema.tickets.workspaceId, s.workspaceId))).limit(1);
  if (!tk) notFound();
  if (!peutLireTicket({ admin, auteurId: tk.userId, utilisateurId: s.user.id })) redirect('/support?e=forbidden');
  const messages = await db.select().from(schema.ticketMessages).where(eq(schema.ticketMessages.ticketId, id)).orderBy(asc(schema.ticketMessages.createdAt));
  const fil = filTicket(
    { auteur: tk.authorName, corps: tk.body, creeLe: tk.createdAt as Date },
    messages.map((m) => ({ id: m.id, auteur: m.authorName, corps: m.body, equipe: m.isStaff, le: m.createdAt as Date })),
  );
  return (
    <Ticket
      admin={admin}
      ticket={{ id: tk.id, titre: tk.title, type: pastilleTypeTicket(tk.type), statut: pastilleStatutTicket(tk.status), statutCle: tk.status, ouvertPar: tk.authorName || 'un membre', ouvertLe: adminDateHeure(tk.createdAt as Date) }}
      fil={fil.map((m) => ({ id: m.id, auteur: m.auteur, corps: m.corps, equipe: m.equipe, le: adminDateHeure(m.le), initiales: initialesPersonne(m.auteur, m.auteur) }))}
      statuts={STATUTS_TICKET.map((c) => ({ cle: c, libelle: LIBELLE_STATUT_TICKET[c] }))}
      changerStatut={admin ? setTicketStatusAction : null}
      repondre={replyTicketAction}
      retours={messagesRetourSupport()}
    />
  );
}
