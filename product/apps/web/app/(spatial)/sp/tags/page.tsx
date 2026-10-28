import { redirect } from 'next/navigation';
import { ETAT_TAGGING, sortieTagging } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess } from '../../../../lib/rbac';
import { Tagging } from '../../../../spatial/vues/reglages/Tagging';

export const dynamic = 'force-dynamic';

/**
 * « Tagging » · vague 4 · toute session (l'écran V5 retiré était ouvert dès
 * Starter). La sortie vers les apprentissages n'apparaît qu'avec un accès
 * RÉEL à Résultats (offre et rôle).
 */
export default async function TaggingSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const resultats = canAccess({ role: s.role, plan: s.plan, equipe: s.equipe ?? undefined }, FEATURES.find((f) => f.key === 'adsmap')!);
  return <Tagging etat={ETAT_TAGGING} sortie={sortieTagging({ resultats })} />;
}
