import { compteLotsEnAttente, presentationLot, sousNavResultats } from '@tiktrends/core';
import { Lots } from '../../../../../spatial/vues/resultats/Lots';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerLots, etatsLots, gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/** Lots de test · réservé aux administrateurs, comme la page V5 (`app/(app)/adsmap/lots`). */
export default async function LotsSpatial() {
  const g = await gardeResultats('lots');
  if (!g.ok) return <RefusResultats titre="Lots de test" raison={g.raison} />;

  const d = await chargerLots(g.s.workspaceId, g.marque.id);
  const etats = etatsLots(d);
  const aConclure = etats.filter((e) => e === 'a_conclure').length;
  const lots = d.lots.map((l) => {
    const p = presentationLot(l, d.ctx);
    return { ...p, pubs: l.ads.slice(0, 2).map((a) => ({ texte: ' ', image: a.image })), mesure: `${p.plateformes} · Coût par achat` };
  });

  return (
    <Lots
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={`${lots.length} lot${lots.length > 1 ? 's' : ''} · ${aConclure ? `${aConclure} à conclure` : `${compteLotsEnAttente(etats)} en attente d’une action`} · ${g.marque.nom}`}
      lots={lots}
      peutCreer={g.admin}
      note={d.configEnregistree
        ? `Les seuils viennent du protocole de la marque · cible de ${d.config.targetCpa.toLocaleString('fr-FR')} € par achat, fenêtre de ${d.ctx.fenetreJours} jours.`
        : `Aucun seuil enregistré pour cette marque · les verdicts suivent les valeurs par défaut du moteur (cible de ${d.config.targetCpa.toLocaleString('fr-FR')} € par achat) tant que le protocole n’est pas réglé.`}
    />
  );
}
