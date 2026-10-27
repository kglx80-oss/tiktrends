import { sousNavResultats } from '@tiktrends/core';
import { listDecisionsAction } from '../../../../actions/adsmap-decisions';
import { Decisions } from '../../../../../spatial/vues/resultats/Decisions';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** À décider · la file de décisions de l'ancienne Adsmap · mêmes gardes, lecture par `listDecisionsAction` (ne recalcule rien). */
export default async function DecisionsSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="À décider" raison={g.raison} />;

  const r = await listDecisionsAction();
  const inbox = r.inbox;
  return (
    <Decisions
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={`Résultats · ${g.marque.nom}`}
      resume={inbox?.summary ?? ''}
      ecartees={inbox?.dismissed ?? 0}
      decisions={(inbox?.items ?? []).map((d) => ({
        id: d.id, type: d.type, titre: d.title, action: d.action, priorite: d.priority, enJeu: d.spendAtStake,
        adId: d.targetKind === 'ad' && d.targetId ? d.targetId : null,
      }))}
      erreur={r.error ?? null}
    />
  );
}
