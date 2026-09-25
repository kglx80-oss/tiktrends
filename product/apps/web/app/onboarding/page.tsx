import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { OnboardingWizard } from './OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams?: Promise<{ redo?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  // Ré-entrée volontaire · « Personnaliser Jarvis » ouvre /onboarding?redo=1.
  // Sans ce paramètre, un compte déjà onboardé est renvoyé au tableau de bord ·
  // le parcours ne se rejoue jamais TOUT SEUL, seulement sur un clic explicite.
  const redo = !!(await searchParams)?.redo;
  if (db && !redo) {
    const [w] = await db.select({ at: schema.workspaces.onboardedAt }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    if (w?.at) redirect('/dashboard'); // déjà onboardé, et pas de reprise demandée
  }
  const firstName = ((s.user.name || s.user.email || '').trim().split(/\s+/)[0]) || '';
  return <OnboardingWizard firstName={firstName} />;
}
