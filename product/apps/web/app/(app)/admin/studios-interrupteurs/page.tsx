import { redirect } from 'next/navigation';
import { aPermissionPlateforme } from '@tiktrends/core';
import { gardePlateforme } from '../../../../lib/studios/prompts/garde-prompts';
import { vueInterrupteurs } from '../../../../lib/studios/interrupteurs';
import { vueBudgetEssai } from '../../../../lib/studios/budget-essai';
import { cadrePage } from '../../../../components/ui';
import { EcranInterrupteurs, EnTeteInterrupteurs } from './Ecran';

export const dynamic = 'force-dynamic';

/**
 * ADMIN · « Interrupteurs Studios » (F1, cahier 01 §14).
 *
 * LIT l'état des interrupteurs, tel que le serveur et le worker le décident :
 * environnement, décision générale par capacité, et par espace (réglés et
 * pilotes d'abord). Plateforme SEULEMENT (`provider.configure`, accès total
 * d'équipe) : un owner ou un admin d'espace voit le refus, sans aucune donnée.
 * L'écriture par espace passe par l'action auditée
 * (`app/actions/studios/interrupteurs.ts`), qui repose la même garde.
 */
type SP = { q?: string; espace?: string };

export default async function InterrupteursPage({ searchParams }: { searchParams: Promise<SP> }) {
  const g = await gardePlateforme('provider.configure');
  if (!g.ok && g.code === 'AUTH_REQUIRED') redirect('/login');
  if (!g.ok) {
    return (
      <main style={cadrePage}>
        <EnTeteInterrupteurs retour={{ href: '/dashboard', libelle: '← Retour à l’app' }} />
        <div role="alert" data-etat="acces-refuse" style={{ background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, padding: '16px 18px' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Accès réservé à l’équipe de la plateforme.</p>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>Les interrupteurs des Studios se règlent avec un accès total d’équipe. Un administrateur d’espace ne les modifie pas.</p>
        </div>
      </main>
    );
  }
  const sp = await searchParams;
  const espace = typeof sp.espace === 'string' ? sp.espace : null;
  const vue = await vueInterrupteurs({ recherche: sp.q ?? null, espace });
  const detail = espace ? vue.espaces.find((w) => w.id === espace) ?? null : null;
  const b = detail ? await vueBudgetEssai(detail.id) : null;
  const budget = b ? { plafondUsd: b.budget.plafondUsd, depuis: b.budget.depuis.toISOString(), engageUsd: b.engageUsd, restantUsd: b.restantUsd, motif: b.budget.motif } : null;
  return (
    <main style={cadrePage}>
      <EnTeteInterrupteurs />
      <EcranInterrupteurs vue={vue} detail={detail} peutEcrire={aPermissionPlateforme(g.ctx.permissions, 'provider.configure')} recherche={sp.q ?? ''} budget={budget} />
    </main>
  );
}
