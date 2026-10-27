import { cartesHypotheses, presentationLot, sousNavResultats, RESERVE_ESTIMATION, type FaitsHypotheseAd } from '@tiktrends/core';
import { iterationPlanAction } from '../../../../actions/adsmap-iterate';
import { Hypotheses } from '../../../../../spatial/vues/resultats/Hypotheses';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerLots, gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** Hypothèses · nouvelle adresse · mêmes gardes que l'Adsmap V5. */
export default async function HypothesesSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Hypothèses" raison={g.raison} />;

  const [d, plan] = await Promise.all([chargerLots(g.s.workspaceId, g.marque.id), iterationPlanAction()]);
  const ads: FaitsHypotheseAd[] = [
    ...d.lots.flatMap((l) => {
      const p = presentationLot(l, d.ctx);
      return l.ads.map((a) => ({ ad: a, concept: a.concept, bande: a.bande, lot: { id: l.id, numero: l.numero, etat: p.etat, jour: p.etat === 'diffusion' ? p.jour : null } }));
    }),
    ...d.horsLot.map((a) => ({ ad: a, concept: a.concept, bande: a.bande, lot: null })),
  ];
  const suites = (plan.view?.rows ?? []).slice(0, 12).map((r) => ({
    adId: r.adId, libelle: r.label, variable: r.changedVariable, etape: r.stageLabel, raison: r.rationale, priorite: r.priority,
  }));

  return (
    <Hypotheses
      sousNav={sousNavResultats({ admin: g.admin })}
      cartes={cartesHypotheses(ads, suites)}
      jarvis={g.jarvis}
      note={`La priorité vient du pré-score du concept, lu sur tes tests passés, ou du rang de la suite dans le plan d’itération · une ${RESERVE_ESTIMATION}, pas une mesure.`}
    />
  );
}
