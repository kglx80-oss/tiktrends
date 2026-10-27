import { redirect } from 'next/navigation';
import { aPermissionPlateforme } from '@tiktrends/core';
import { gardePlateforme } from '../../../../../lib/studios/prompts/garde-prompts';
import { vueInterrupteurs } from '../../../../../lib/studios/interrupteurs';
import { vueBudgetEssai } from '../../../../../lib/studios/budget-essai';
import { Interrupteurs } from '../../../../../spatial/vues/admin/Interrupteurs';
import { bandeauSeul } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Interrupteurs Studios » · porte de l'ancien `/admin/studios-interrupteurs` ·
 * la garde plateforme `provider.configure` (accès total d'équipe), AVANT
 * toute lecture · un owner ou un admin d'espace est renvoyé, sans aucune
 * donnée. L'écriture passe par les actions auditées, qui reposent la garde.
 */
export default async function InterrupteursSpatial({ searchParams }: { searchParams?: Promise<{ q?: string; espace?: string }> }) {
  const g = await gardePlateforme('provider.configure');
  if (!g.ok) redirect(g.code === 'AUTH_REQUIRED' ? '/login' : '/dashboard');
  const sp = (await searchParams) ?? {};
  const espace = typeof sp.espace === 'string' ? sp.espace : null;
  const [b, vue] = await Promise.all([bandeauSeul(), vueInterrupteurs({ recherche: sp.q ?? null, espace })]);
  const detail = espace ? vue.espaces.find((w) => w.id === espace) ?? null : null;
  const be = detail ? await vueBudgetEssai(detail.id) : null;
  return (
    <Interrupteurs
      bandeau={b} vue={vue} detail={detail} recherche={sp.q ?? ''}
      peutEcrire={aPermissionPlateforme(g.ctx.permissions, 'provider.configure')}
      budget={be ? { plafondUsd: be.budget.plafondUsd, depuis: be.budget.depuis.toISOString(), engageUsd: be.engageUsd, restantUsd: be.restantUsd, motif: be.budget.motif } : null}
    />
  );
}
