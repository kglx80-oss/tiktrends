'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '../../lib/auth';
import { isFounder } from '../../lib/founder';
import { getPlanConfig, setPlanConfig } from '../../lib/settings';
import type { Plan } from '../../lib/rbac';

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
const num = (v: FormDataEntryValue | null) => {
  const n = typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

/** Met à jour tarifs + allocations de crédits par plan. Réservé au fondateur. */
export async function updatePlanConfigAction(formData: FormData): Promise<void> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!isFounder(s.user.email)) redirect('/console?e=forbidden');

  const current = await getPlanConfig();
  const prices = { ...current.prices };
  const credits = { ...current.credits };
  for (const p of PLANS) {
    const price = num(formData.get(`price_${p}`));
    if (price != null) prices[p] = price;
    const cr = num(formData.get(`credits_${p}`));
    if (cr != null) credits[p] = cr;
  }
  await setPlanConfig({ prices, credits });
  revalidatePath('/console');
  redirect('/console?ok=config');
}
