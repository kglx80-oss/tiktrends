import { sousNavResultats, titreDecision } from '@tiktrends/core';
import { listDecisionsAction } from '../../../../actions/adsmap-decisions';
import { Decisions } from '../../../../../spatial/vues/resultats/Decisions';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerCiblesDecisions, gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** À décider · la file de décisions de l'ancienne Adsmap · mêmes gardes, lecture par `listDecisionsAction` (ne recalcule rien). */
export default async function DecisionsSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="À décider" raison={g.raison} />;

  const r = await listDecisionsAction();
  const inbox = r.inbox;
  const items = inbox?.items ?? [];
  // Le nom de ce que chaque décision concerne · une ligne sans titre enregistré
  // affiche le test, le lot ou le concept, jamais « n.c. ».
  const noms = await chargerCiblesDecisions(g.s.workspaceId, g.marque.id, items.map((d) => ({ kind: d.targetKind, id: d.targetId })));
  return (
    <Decisions
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={`Résultats · ${g.marque.nom}`}
      resume={inbox?.summary ?? ''}
      ecartees={inbox?.dismissed ?? 0}
      decisions={items.map((d) => {
        const nom = noms.get(`${d.targetKind}:${d.targetId}`) ?? null;
        return {
          id: d.id, type: d.type, titre: titreDecision({ type: d.type, titre: d.title, cible: { kind: d.targetKind, nom } }),
          action: d.action, priorite: d.priority, enJeu: d.spendAtStake,
          // La fiche n'est proposée que pour un test retrouvé dans la marque · sinon elle s'ouvrirait sur « introuvable ».
          adId: d.targetKind === 'ad' && nom ? d.targetId : null,
        };
      })}
      erreur={r.error ?? null}
    />
  );
}
