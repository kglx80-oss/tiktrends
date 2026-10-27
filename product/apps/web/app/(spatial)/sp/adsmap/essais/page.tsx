import { essaiSuivant, sousNavResultats, type EssaiVariable } from '@tiktrends/core';
import { bilanCopieAction, bilanNotesAction, calibrationScoreAction, essaisViewAction } from '../../../../actions/adsmap-attribution';
import { Essais } from '../../../../../spatial/vues/resultats/Essais';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Essais et relectures · la section « Ce que Jarvis a appris de tes tests » de
 * l'ancienne Adsmap (`SectionEssais`) · mêmes gardes (offre Plus, marque active),
 * mêmes actions, aucun modèle appelé. Le conseil du prochain essai se déduit des
 * deux lectures (`essaiSuivant`, noyau).
 */
export default async function EssaisSpatial() {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Essais et relectures" raison={g.raison} />;

  const [essais, notes, calibration, copies] = await Promise.all([essaisViewAction(), bilanNotesAction(), calibrationScoreAction(), bilanCopieAction()]);
  const ev = essais.view;
  const bn = notes.bilan;
  const conseil = ev && bn
    ? essaiSuivant({
        cumuls: ev.cumuls,
        trancheParVariable: ev.lots.reduce<Partial<Record<EssaiVariable, number>>>((acc, l) => {
          if (l.tranche) acc[l.variable as EssaiVariable] = (acc[l.variable as EssaiVariable] ?? 0) + 1;
          return acc;
        }, {}),
        tauxDefauts: bn.defauts.taux,
        suspect: bn.defauts.suspects[0] ? { quoi: bn.defauts.suspects[0].cle, taux: bn.defauts.suspects[0].taux } : null,
      })
    : null;

  return (
    <Essais
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={`Résultats · ${g.marque.nom}`}
      essais={essais} notes={notes} calibration={calibration} copies={copies}
      conseil={conseil ? { question: conseil.question, pourquoi: conseil.pourquoi, avantTout: conseil.avantTout ?? null, variable: conseil.variable ?? null } : null}
    />
  );
}
