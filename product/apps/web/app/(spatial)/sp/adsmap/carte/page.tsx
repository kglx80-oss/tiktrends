import { sousNavResultats } from '@tiktrends/core';
import { graphAction } from '../../../../actions/adsmap-graph';
import { Carte } from '../../../../../spatial/vues/resultats/Carte';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** Carte · le graphe de l'ancienne Adsmap (`?vue=carte`) · mêmes gardes, lecture par `graphAction` · construire réservé aux admins. */
export default async function CarteSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Carte" raison={g.raison} />;

  const r = await graphAction();
  return (
    <Carte
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={`Résultats · ${g.marque.nom}`}
      noeuds={r.graph?.nodes ?? []}
      aretes={r.graph?.edges ?? []}
      tronquee={!!r.graph?.truncated}
      erreur={r.error ?? null}
      construire={g.admin}
    />
  );
}
