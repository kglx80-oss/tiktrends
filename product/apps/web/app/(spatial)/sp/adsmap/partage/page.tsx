import { redirect } from 'next/navigation';
import { sousNavResultats } from '@tiktrends/core';
import { listShareLinksAction } from '../../../../actions/adsmap-share';
import { Partage } from '../../../../../spatial/vues/resultats/Partage';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Partager au client · le panneau de partage de l'ancienne Adsmap · réservé aux
 * administrateurs, comme ses actions (`adsmap-share`, `minRole: 'admin'`) · un
 * membre revient à la vue d'ensemble.
 */
export default async function PartageSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Partager au client" raison={g.raison} />;
  if (!g.admin) redirect('/adsmap');

  const r = await listShareLinksAction();
  return <Partage sousNav={sousNavResultats({ admin: g.admin })} sous={`Résultats · ${g.marque.nom}`} liens={r.links ?? []} erreur={r.error ?? null} />;
}
