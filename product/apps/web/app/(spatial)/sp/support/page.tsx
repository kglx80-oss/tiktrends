import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { PORTEE_TICKET, TYPES_TICKET, adminDateHeure, messagesRetourSupport, pastilleStatutTicket, pastilleTypeTicket } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { createTicketAction } from '../../../actions/support';
import { Support } from '../../../../spatial/vues/reglages/Support';

export const dynamic = 'force-dynamic';

/**
 * « Support » · vague 4 · même garde et même lecture que l'écran V5 retiré ·
 * toute session ; un administrateur voit les tickets de son espace, un membre
 * les siens.
 */
export default async function SupportSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const admin = roleAtLeast(s.role, 'admin');
  let tickets: Array<typeof schema.tickets.$inferSelect> = [];
  if (db) {
    tickets = await db.select().from(schema.tickets)
      .where(admin
        ? eq(schema.tickets.workspaceId, s.workspaceId)
        : and(eq(schema.tickets.workspaceId, s.workspaceId), eq(schema.tickets.userId, s.user.id)))
      .orderBy(desc(schema.tickets.updatedAt));
  }
  return (
    <Support
      admin={admin} portee={PORTEE_TICKET} types={TYPES_TICKET} ouvrir={db ? createTicketAction : null}
      tickets={tickets.map((t) => ({ id: t.id, titre: t.title, type: pastilleTypeTicket(t.type), statut: pastilleStatutTicket(t.status), auteur: t.authorName, le: adminDateHeure(t.updatedAt as Date) }))}
      retours={messagesRetourSupport()}
    />
  );
}
