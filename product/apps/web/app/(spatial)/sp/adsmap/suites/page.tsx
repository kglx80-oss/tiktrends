import { sousNavResultats } from '@tiktrends/core';
import { iterationPlanAction } from '../../../../actions/adsmap-iterate';
import { Suites } from '../../../../../spatial/vues/resultats/Suites';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** Suites · le plan d'itération de l'ancienne Adsmap · mêmes gardes, lecture par `iterationPlanAction`. */
export default async function SuitesSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Suites" raison={g.raison} />;

  const r = await iterationPlanAction();
  return <Suites sousNav={sousNavResultats({ admin: g.admin })} sous={`Résultats · ${g.marque.nom}`} plan={r.view ?? null} erreur={r.error ?? null} />;
}
