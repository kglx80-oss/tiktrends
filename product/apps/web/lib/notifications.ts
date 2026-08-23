import 'server-only';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';

export interface NewNotification {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
}

/** Crée une notification pour un utilisateur (best-effort, ne jette pas). */
export async function createNotification(n: NewNotification): Promise<void> {
  if (!db) return;
  try {
    await db.insert(schema.notifications).values({
      workspaceId: n.workspaceId, userId: n.userId, type: n.type,
      title: n.title, body: n.body ?? null, href: n.href ?? null,
    });
  } catch { /* la notification ne doit jamais bloquer l'action principale */ }
}

/** Notifie tous les admins/propriétaires d'un workspace (sauf un utilisateur optionnel). */
export async function notifyWorkspaceStaff(
  workspaceId: string,
  n: Omit<NewNotification, 'workspaceId' | 'userId'>,
  exceptUserId?: string,
): Promise<void> {
  if (!db) return;
  try {
    const staff = await db.select({ userId: schema.workspaceMembers.userId, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, workspaceId));
    const targets = staff.filter((m) => (m.role === 'admin' || m.role === 'owner') && m.userId !== exceptUserId);
    if (targets.length === 0) return;
    await db.insert(schema.notifications).values(
      targets.map((m) => ({ workspaceId, userId: m.userId, type: n.type, title: n.title, body: n.body ?? null, href: n.href ?? null })),
    );
  } catch { /* best-effort */ }
}

export async function unreadCount(userId: string): Promise<number> {
  if (!db) return 0;
  try {
    const rows = await db.select({ id: schema.notifications.id }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
    return rows.length;
  } catch { return 0; }
}

export async function listNotifications(userId: string, limit = 20) {
  if (!db) return [];
  try {
    return await db.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt)).limit(limit);
  } catch { return []; }
}

/** Marque comme lues toutes les notifs non lues de l'utilisateur. */
export async function markAllRead(userId: string): Promise<void> {
  if (!db) return;
  try {
    await db.update(schema.notifications).set({ readAt: new Date() })
      .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  } catch { /* best-effort */ }
}
