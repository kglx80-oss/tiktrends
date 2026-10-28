import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { lireVueAccueil } from '@tiktrends/core';
import { Accueil } from '../../../../spatial/vues/accueil/Accueil';
import { Analytics } from '../../../../spatial/vues/accueil/Analytics';
import { chargerAccueilSpatial } from './chargement';
import { chargerAnalyticsSpatial } from './analytics';

export const dynamic = 'force-dynamic';

/**
 * L'Accueil Spatial (`/dashboard`, section « accueil », écran EXCLUSIF · la page
 * V5 est retirée). Une session, puis chaque bloc sous son propre droit (rôle ET
 * offre). `?vue=analytics` (cible de `/analytics`) ouvre la vue Analytics,
 * portée de l'ancien Accueil · refusée au serveur, avant toute lecture, au rôle
 * que la matrice ferme.
 */
export default async function AccueilSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const params = await searchParams;
  if (lireVueAccueil(params) === 'analytics') return <Analytics {...await chargerAnalyticsSpatial(s, params)} />;
  return <Accueil {...await chargerAccueilSpatial(s, params)} />;
}
