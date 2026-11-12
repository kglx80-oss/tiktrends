import {
  PARAM_FILTRE_LOTS, actionAConclure, boucleIterationLots, compteLotsEnAttente, dansFiltreLots, filtreInitialLots, gestesListeLots, porteeListeLots, presentationLot,
  selectionAConclure, sousListeAConclure, sousNavResultats,
} from '@tiktrends/core';
import { iterationPlanAction } from '../../../../actions/adsmap-iterate';
import { Lots } from '../../../../../spatial/vues/resultats/Lots';
import { RefusResultats } from '../../../../../spatial/vues/resultats/communs';
import { chargerLots, etatsLots, gardeResultats } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Lots de test · la garde est celle de l'ARBITRAGE (G-adsmap · celle de
 * `validateVerdictAction`) · la portée suit le rôle (`porteeListeLots`) ·
 *  · la fonction `lots` ouverte (admin, comme la page V5 `app/(app)/adsmap/lots`) ·
 *    la liste complète, inchangée · « Nouveau lot », les cinq filtres, et le
 *    bouton de boucle « Itérer · N itérations conseillées » qui compte les
 *    gagnantes PROUVÉES du plan d'itération réel (`iterationPlanAction`,
 *    lecture) · il mène à l'écran Itérer, où l'on choisit la variable ;
 *  · sinon (membre qui peut arbitrer) · « À conclure » seulement, en LECTURE ·
 *    les lots de la marque active qu'on peut conclure (`selectionAConclure`) ·
 *    seuls ceux-là quittent le serveur · chaque ligne mène à la fiche du lot,
 *    où l'arbitrage existe déjà. Composer, préparer, lancer, dupliquer restent
 *    aux admins (actions gardées) et n'apparaissent pas · la raison est écrite.
 * `?filtre=conclure` (`LIEN_A_CONCLURE` · la tuile « À traiter » et « À faire
 * maintenant » de l'Accueil) ouvre la liste sur « À conclure » · un filtre que
 * la portée ne montre pas est ignoré (`filtreInitialLots`).
 * Rien n'est créé ni débité ici.
 */
export default async function LotsSpatial({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const g = await gardeResultats();
  if (!g.ok) return <RefusResultats titre="Lots de test" raison={g.raison} />;
  const portee = porteeListeLots({ lotsOuverts: g.lots, arbitrageOuvert: true })!;
  const base = gestesListeLots(portee, { admin: g.admin });
  const gestes = { ...base, filtreInitial: filtreInitialLots(base, (await searchParams)[PARAM_FILTRE_LOTS]) };

  const d = await chargerLots(g.s.workspaceId, g.marque.id);
  const note = d.configEnregistree
    ? `Les seuils viennent du protocole de la marque · cible de ${d.config.targetCpa.toLocaleString('fr-FR')} € par achat, fenêtre de ${d.ctx.fenetreJours} jours.`
    : `Aucun seuil enregistré pour cette marque · les verdicts suivent les valeurs par défaut du moteur (cible de ${d.config.targetCpa.toLocaleString('fr-FR')} € par achat) tant que le protocole n’est pas réglé.`;
  const ligne = (l: (typeof d.lots)[number]) => {
    const p = presentationLot(l, d.ctx);
    return { ...p, pubs: l.ads.slice(0, 2).map((a) => ({ texte: ' ', image: a.image })), mesure: `${p.plateformes} · Coût par achat` };
  };

  if (portee === 'a-conclure') {
    const lots = selectionAConclure(d.lots, d.ctx).map(ligne).map((x) => ({ ...x, action: actionAConclure(x) }));
    return (
      <Lots
        sousNav={sousNavResultats({ admin: g.admin })}
        sous={sousListeAConclure(lots.length, g.marque.nom)}
        lots={lots}
        peutCreer={false}
        gestes={gestes}
        note={note}
      />
    );
  }

  const etats = etatsLots(d);
  const plan = await iterationPlanAction();
  const boucle = plan.view ? boucleIterationLots(plan.view.rows) : { libelle: 'Itérer', href: null, raison: plan.error ?? 'Le plan d’itération n’a pas pu être lu · recharge la page pour réessayer.' };
  const aConclure = etats.filter((e) => dansFiltreLots(e, 'conclure')).length;
  const lots = d.lots.map(ligne);

  return (
    <Lots
      sousNav={sousNavResultats({ admin: g.admin })}
      sous={`${lots.length} lot${lots.length > 1 ? 's' : ''} · ${aConclure ? `${aConclure} à conclure` : `${compteLotsEnAttente(etats)} en attente d’une action`} · ${g.marque.nom}`}
      lots={lots}
      peutCreer={gestes.creer}
      gestes={gestes}
      boucle={boucle}
      note={note}
    />
  );
}
