import {
  adminDollars, adminEuros, adminMois, adminNombre, adminPluriel, adminPourcent, alertesPlateforme, comptesARisque,
  enDefautDePaiement, estPayant, fluxDirect, indicateursSav, initialesEspace, margeBrutePonderee, mrrARisque, mrrEspace, mrrPlateforme,
  rentabiliteForfaits, resiliationsParMois, tauxChurn30, PASTILLE_TYPE_TICKET, type EvenementPlateforme,
} from '@tiktrends/core';
import { spendStatus, depensesAReconcilier } from '../../../../lib/spend-guard';
import { TourDeControle } from '../../../../spatial/vues/admin/TourDeControle';
import { bandeau, chargerEspaces, chargerRecharges, chargerResiliations, chargerTarifs, chargerTickets, porteAdmin, resiliationsSur30j, navAdmin } from './donnees';

export const dynamic = 'force-dynamic';

/** « Tour de contrôle » · vue d'ensemble de la plateforme. Porte de `/admin` (V5). */
export default async function TourDeControleSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const [tarifs, tickets, resiliations, depense, recharges] = await Promise.all([
    chargerTarifs(), chargerTickets(), chargerResiliations(maintenant), spendStatus(), chargerRecharges(maintenant),
  ]);
  const espaces = await chargerEspaces(maintenant, tickets);
  const aReconcilier = await depensesAReconcilier().then((v) => v.lignes.length).catch(() => 0);

  const m = mrrPlateforme(espaces, tarifs);
  const r30 = resiliationsSur30j(resiliations, maintenant);
  const churn = tauxChurn30(r30, m.payants);
  const rentab = rentabiliteForfaits(m.parForfait);
  const marge = margeBrutePonderee(rentab);
  const sav = indicateursSav(tickets, maintenant);
  const risque = comptesARisque(espaces, tarifs, maintenant);
  const depensePct = depense.capUsd > 0 ? (depense.spentUsd / depense.capUsd) * 100 : 100;
  const defauts = espaces.filter(enDefautDePaiement);

  const alertes = alertesPlateforme({
    depensePct, depenseResume: depense.summary, depensesAReconcilier: aReconcilier,
    defautsPaiement: defauts.length, mrrEnDefaut: defauts.reduce((s, e) => s + mrrEspace(e, tarifs), 0),
    ticketsSansReponse: sav.sansReponse, payantsSansCredit: espaces.filter((e) => estPayant(e, tarifs) && e.solde <= 0).length,
  }).slice(0, 4);

  // En direct · inscriptions, onboardings, tickets, recharges · des lignes réelles.
  const nomDe = new Map(espaces.map((e) => [e.id, e.nom]));
  const evenements: EvenementPlateforme[] = [
    ...espaces.slice(0, 20).map((e) => ({ type: 'inscription' as const, espace: e.nom, le: e.creeLe })),
    ...espaces.filter((e) => e.onboardeLe).map((e) => ({ type: 'onboarding' as const, espace: e.nom, le: e.onboardeLe! })),
    ...tickets.slice(0, 20).map((t) => ({ type: 'ticket' as const, espace: t.espace, le: t.creeLe, detail: PASTILLE_TYPE_TICKET[t.type].libelle })),
    ...recharges.map((r) => ({ type: 'recharge' as const, espace: nomDe.get(r.ws) ?? 'Espace', le: r.le, credits: r.credits })),
  ];

  const barres = resiliationsParMois(resiliations, maintenant);
  const mois = adminMois(maintenant);

  return (
    <TourDeControle
      bandeau={bandeau(espaces, tarifs, await navAdmin())}
      kpis={[
        { lbl: 'MRR', v: adminEuros(m.mrr), d: `ARR ${adminEuros(m.arr)}` },
        { lbl: 'Abonnés payants', v: adminNombre(m.payants), d: `sur ${adminPluriel(espaces.length, 'espace')}` },
        { lbl: 'Churn · 30 j', v: adminPourcent(churn), d: adminPluriel(r30, 'résiliation'), c: r30 > 0 ? 'dn' : '' },
        { lbl: 'Marge brute', v: adminPourcent(marge), d: 'Pire cas · allocation pleine' },
        { lbl: 'Coûts IA · 30 j', v: adminDollars(depense.spentUsd), d: `${adminPourcent(depensePct, 0)} du plafond`, c: depensePct >= 80 ? 'w' : '' },
        { lbl: 'Tickets ouverts', v: adminNombre(sav.ouverts), d: sav.sansReponse ? `${adminNombre(sav.sansReponse)} sans réponse` : 'Tous ont une réponse', c: sav.sansReponse ? 'dn' : 'up' },
      ]}
      churn={{
        titre: 'Churn · 30 derniers jours', valeur: adminPourcent(churn),
        variation: { texte: adminPluriel(r30, 'résiliation'), classe: r30 > 0 ? 'dn' : '' },
        detail: `Résiliations Stripe · ${adminPluriel(m.payants, 'abonné actif', 'abonnés actifs')} · aucun objectif fixé`,
        barres, objectif: null,
        cotes: [
          { libelle: 'MRR à risque', valeur: adminEuros(mrrARisque(risque)), detail: adminPluriel(risque.length, 'compte à surveiller', 'comptes à surveiller') },
          { libelle: '1re raison de départ', valeur: 'Non recueillie', detail: 'aucun questionnaire de sortie' },
        ],
      }}
      mrr={{
        legende: `Relevé du mois en cours seulement · ARR estimé ${adminEuros(m.arr)}`,
        mois: mois.map((x) => ({ libelle: x.libelle, enCours: x.enCours, hauteur: x.enCours && m.mrr > 0 ? 100 : 0, titre: x.enCours ? `${x.libelle} · ${adminEuros(m.mrr)}` : `${x.libelle} · pas de relevé` })),
      }}
      alertes={alertes}
      forfaits={rentab.map((f) => ({ libelle: f.libelle, prix: adminEuros(f.prix), abonnes: adminNombre(f.abonnes), mrr: adminEuros(f.mrr), marge: f.margePct, margeTexte: adminPourcent(f.margePct) }))}
      direct={fluxDirect(evenements, maintenant).map((l) => ({ ...l, initiales: initialesEspace(l.espace) }))}
    />
  );
}

