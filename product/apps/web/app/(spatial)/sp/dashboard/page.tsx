import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { Accueil } from '../../../../spatial/vues/accueil/Accueil';
import { chargerAccueilSpatial } from './chargement';

export const dynamic = 'force-dynamic';

/**
 * L'Accueil Spatial (`/dashboard`, section « accueil »). Mêmes gardes que
 * l'Accueil V5 · une session, puis chaque bloc sous son propre droit (rôle ET
 * offre). La vue Analytics de l'Accueil V5 (`?vue=analytics`) n'est pas un
 * écran de la maquette · la bascule ne lit que le chemin, donc en mode
 * Spatial ce paramètre ouvre l'Accueil, dont « Reporting Meta » porte les
 * chiffres Meta réels (ancre `#reporting`).
 */
export default async function AccueilSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const params = await searchParams;
  return <Accueil {...await chargerAccueilSpatial(s, params)} />;
}
