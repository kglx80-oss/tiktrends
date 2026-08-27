import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { OnboardingWizard } from './OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (db) {
    const [w] = await db.select({ at: schema.workspaces.onboardedAt }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    if (w?.at) redirect('/dashboard'); // déjà onboardé
  }
  const firstName = ((s.user.name || s.user.email || '').trim().split(/\s+/)[0]) || '';
  return <OnboardingWizard firstName={firstName} />;
}
