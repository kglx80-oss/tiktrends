'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { listNotifications, unreadCount, markAllRead } from '../../lib/notifications';
import { notifsRelues } from '../../lib/studios/mes-mentions';

export interface NotifItem {
  id: string; type: string; title: string; body: string | null; href: string | null;
  read: boolean; createdAt: string;
}
export interface NotifPayload { items: NotifItem[]; unread: number }

/**
 * Récupère les notifications récentes + le nombre de non lues (appelé en polling).
 *
 * Une notification née d'un fil des Studios (mention, nouveau commentaire) est
 * RELUE dans la portée actuelle avant de partir au client (`notifsRelues`,
 * la relecture de « Mes mentions ») · hors portée, son titre, son texte et son
 * lien ne sortent pas · elle reste listée et comptée.
 */
export async function fetchNotifications(): Promise<NotifPayload> {
  const s = await getSession();
  if (!s) return { items: [], unread: 0 };
  const [rows, unread] = await Promise.all([
    listNotifications(s.user.id, 20),
    unreadCount(s.user.id),
  ]);
  const montrees = await notifsRelues(s, rows.map((r) => ({
    type: r.type, workspaceId: r.workspaceId, titre: r.title, corps: r.body, href: r.href, creeLe: (r.createdAt as Date).getTime(),
  })));
  return {
    unread,
    items: rows.map((r, i) => ({
      id: r.id, type: r.type, title: montrees[i]!.titre, body: montrees[i]!.corps, href: montrees[i]!.href,
      read: r.readAt != null, createdAt: (r.createdAt as Date).toISOString(),
    })),
  };
}

export async function markNotificationRead(id: string): Promise<void> {
  const s = await getSession();
  if (!s || !db) return;
  await db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, s.user.id)));
}

export async function markAllNotificationsRead(): Promise<void> {
  const s = await getSession();
  if (!s) return;
  await markAllRead(s.user.id);
}
