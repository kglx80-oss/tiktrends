import { redirect } from 'next/navigation';
import { sousNavResultats } from '@tiktrends/core';
import { radarViewAction } from '../../../../actions/adsmap-radar';
import { RadarAdsmap } from '../../../../../spatial/vues/resultats/RadarAdsmap';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Radar des concurrents · le radar de veille de l'ancienne Adsmap · réservé aux
 * administrateurs comme la page V5 (armer une dépense récurrente n'est pas une
 * préférence d'affichage) · un membre revient à la vue d'ensemble.
 */
export default async function RadarAdsmapSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Radar des concurrents" raison={g.raison} />;
  if (!g.admin) redirect('/adsmap');

  const r = await radarViewAction();
  return <RadarAdsmap sousNav={sousNavResultats({ admin: g.admin })} sous={`Résultats · ${g.marque.nom}`} vue={r.view ?? null} erreur={r.error ?? null} />;
}
