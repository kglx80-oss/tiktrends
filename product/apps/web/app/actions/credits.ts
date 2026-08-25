'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { PLAN_CREDITS, type Plan } from '../../lib/rbac';

const norm = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

async function addCredits(workspaceId: string, delta: number, reason: string) {
  if (!db || !delta) return;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
  const next = Math.max(0, (w?.c ?? 0) + delta);
  await db.update(schema.workspaces).set({ creditsBalance: next }).where(eq(schema.workspaces.id, workspaceId));
  await db.insert(schema.creditLedger).values({ workspaceId, delta, reason });
}

/** Accorder / retirer des crédits (ajustement manuel) · propriétaire. */
export async function grantCreditsAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/credits?e=forbidden');
  const amount = parseInt(norm(formData.get('amount')), 10);
  const reason = norm(formData.get('reason')) || 'Ajustement manuel';
  if (!Number.isFinite(amount) || amount === 0) redirect('/credits?e=amount');
  await addCredits(s.workspaceId, amount, reason);
  redirect('/credits?ok=grant');
}

/** Recharger l'allocation mensuelle selon le plan · propriétaire. */
export async function rechargeAllocationAction(): Promise<void> {
  const s = await getSession();
  if (!s || !db) redirect('/login');
  if (s.role !== 'owner') redirect('/credits?e=forbidden');
  const alloc = PLAN_CREDITS[s.plan as Plan] ?? 0;
  const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
  const delta = alloc - (w?.c ?? 0);
  if (delta > 0) await addCredits(s.workspaceId, delta, `Allocation mensuelle (${s.plan})`);
  redirect('/credits?ok=recharge');
}
