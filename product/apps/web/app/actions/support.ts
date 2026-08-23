'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { createNotification, notifyWorkspaceStaff } from '../../lib/notifications';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');
const TYPES = ['bug', 'suggestion', 'question'] as const;
const STATUSES = ['open', 'in_progress', 'resolved'] as const;
const STATUS_LABEL: Record<string, string> = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu' };

/** Ouverture d'un ticket : ticket + 1er message + notification aux admins. */
export async function createTicketAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const type = norm(formData.get('type'));
  const title = norm(formData.get('title'));
  const body = norm(formData.get('body'));
  const t = (TYPES.includes(type as typeof TYPES[number]) ? type : 'suggestion') as typeof TYPES[number];
  if (!title) redirect('/support?e=title');

  const author = s.user.name || s.user.email;
  const [tk] = await db.insert(schema.tickets).values({
    workspaceId: s.workspaceId, userId: s.user.id, authorName: author, type: t, title, body,
  }).returning();

  if (tk && body) {
    await db.insert(schema.ticketMessages).values({ ticketId: tk.id, userId: s.user.id, authorName: author, body, isStaff: roleAtLeast(s.role, 'admin') });
  }
  if (tk) {
    await notifyWorkspaceStaff(s.workspaceId, {
      type: 'ticket_new', title: `Nouveau ${t === 'bug' ? 'bug' : t === 'question' ? 'question' : 'suggestion'} : ${title}`,
      body: `De ${author}`, href: `/support/${tk.id}`,
    }, s.user.id);
    redirect(`/support/${tk.id}?ok=created`);
  }
  redirect('/support?ok=1');
}

/** Réponse dans un fil de ticket : membre auteur ↔ staff, avec notification croisée. */
export async function replyTicketAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  const ticketId = norm(formData.get('ticketId'));
  const body = norm(formData.get('body'));
  if (!ticketId) redirect('/support');
  if (!body) redirect(`/support/${ticketId}?e=empty`);

  const [tk] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).limit(1);
  if (!tk || tk.workspaceId !== s.workspaceId) redirect('/support?e=notfound');

  const isStaff = roleAtLeast(s.role, 'admin');
  // Un membre ne peut répondre qu'à ses propres tickets ; le staff à tous ceux du workspace.
  if (!isStaff && tk.userId !== s.user.id) redirect('/support?e=forbidden');

  const author = s.user.name || s.user.email;
  await db.insert(schema.ticketMessages).values({ ticketId, userId: s.user.id, authorName: author, body, isStaff });
  await db.update(schema.tickets).set({ updatedAt: new Date(), status: isStaff && tk.status === 'open' ? 'in_progress' : tk.status }).where(eq(schema.tickets.id, ticketId));

  if (isStaff) {
    // Le staff répond -> notifier l'auteur du ticket.
    if (tk.userId && tk.userId !== s.user.id) {
      await createNotification({ workspaceId: s.workspaceId, userId: tk.userId, type: 'ticket_reply', title: `Réponse à : ${tk.title}`, body, href: `/support/${ticketId}` });
    }
  } else {
    // L'auteur répond -> notifier le staff.
    await notifyWorkspaceStaff(s.workspaceId, { type: 'ticket_reply', title: `Réponse de ${author} : ${tk.title}`, body, href: `/support/${ticketId}` }, s.user.id);
  }
  redirect(`/support/${ticketId}?ok=reply`);
}

/** Changement de statut (staff) + notification à l'auteur. */
export async function setTicketStatusAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/support?e=forbidden');
  const ticketId = norm(formData.get('ticketId'));
  const status = norm(formData.get('status'));
  if (!ticketId || !STATUSES.includes(status as typeof STATUSES[number])) redirect('/support?e=bad');

  const [tk] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId)).limit(1);
  if (!tk || tk.workspaceId !== s.workspaceId) redirect('/support?e=notfound');

  await db.update(schema.tickets).set({ status: status as typeof STATUSES[number], updatedAt: new Date() }).where(eq(schema.tickets.id, ticketId));
  if (tk.userId && tk.userId !== s.user.id) {
    await createNotification({ workspaceId: s.workspaceId, userId: tk.userId, type: 'ticket_status', title: `Statut mis à jour : ${tk.title}`, body: `Nouveau statut : ${STATUS_LABEL[status]}`, href: `/support/${ticketId}` });
  }
  revalidatePath(`/support/${ticketId}`);
  redirect(`/support/${ticketId}?ok=status`);
}
