'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { listNotifications, unreadCount, markAllRead } from '../../lib/notifications';

export interface NotifItem {
  id: string; type: string; title: string; body: string | null; href: string | null;
  read: boolean; createdAt: string;
}
export interface NotifPayload { items: NotifItem[]; unread: number }

/** Récupère les notifications récentes + le nombre de non lues (appelé en polling). */
export async function fetchNotifications(): Promise<NotifPayload> {
  const s = await getSession();
  if (!s) return { items: [], unread: 0 };
  const [rows, unread] = await Promise.all([
    listNotifications(s.user.id, 20),
    unreadCount(s.user.id),
  ]);
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id, type: r.type, title: r.title, body: r.body, href: r.href,
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
