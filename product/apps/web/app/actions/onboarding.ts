'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { roleAtLeast } from '../../lib/rbac';
import { setActiveBrand } from './brands';
import { klaviyoOnboarded } from '../../lib/klaviyo';
import { GUARD } from '../../lib/guard-error';

export interface OnboardingData {
  profile?: string;       // brand | agency | freelancer | ai_artist | other
  aiLevel?: string;       // starter | exploring | comfortable | advanced
  goals?: string[];       // objectifs prioritaires
  teamSize?: string;      // solo | small | large
  brandName?: string;
  siteUrl?: string;
}

/** Enregistre les réponses d'onboarding, marque le compte comme onboardé, et crée la 1re marque si possible. */
export async function saveOnboardingAction(data: OnboardingData): Promise<{ ok?: true; brandId?: string; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };

  const clean = (v?: string) => (typeof v === 'string' ? v.trim() : '');
  const url = clean(data.siteUrl).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const payload = {
    profile: clean(data.profile) || null,
    aiLevel: clean(data.aiLevel) || null,
    goals: Array.isArray(data.goals) ? data.goals.slice(0, 8) : [],
    teamSize: clean(data.teamSize) || null,
    brandName: clean(data.brandName) || null,
    siteUrl: url || null,
    at: new Date().toISOString(),
  };

  await db.update(schema.workspaces).set({ onboarding: payload, onboardedAt: new Date() }).where(eq(schema.workspaces.id, s.workspaceId));

  // Optimisation du compte : créer la 1re marque à partir des infos données (si aucune marque encore).
  let brandId: string | undefined;
  const brandName = clean(data.brandName);
  if (roleAtLeast(s.role, 'admin') && (brandName || url)) {
    const existing = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.workspaceId, s.workspaceId)).limit(1);
    if (!existing.length) {
      const [b] = await db.insert(schema.brands).values({
        workspaceId: s.workspaceId,
        name: brandName || (url ? url.split('.')[0]! : 'Ma marque'),
        url: url ? `https://${url}` : null,
      }).returning({ id: schema.brands.id });
      if (b) { brandId = b.id; try { await setActiveBrand(b.id); } catch { /* cookie best-effort */ } }
    }
  }
  // Synchro marketing Klaviyo · enrichit le profil avec les données d'onboarding (best-effort).
  try {
    await klaviyoOnboarded({
      email: s.user.email, name: s.user.name,
      profile: payload.profile ?? undefined, aiLevel: payload.aiLevel ?? undefined,
      goals: payload.goals, brandName: payload.brandName ?? undefined, siteUrl: payload.siteUrl ?? undefined,
    });
  } catch { /* ignore */ }

  return { ok: true, brandId };
}
