import { VALEUR_ABSENTE, adminEuros, adminPluriel, adminPourcent, ancienneteMoyenneMois, comptesARisque, filtresComptes, ligneRisqueAffichee, mrrARisque, mrrPlateforme, resiliationsParMois, tauxChurn30 } from '@tiktrends/core';
import { Churn } from '../../../../../spatial/vues/admin/Churn';
import { bandeau, chargerEspaces, chargerResiliations, chargerTarifs, porteAdmin, resiliationsSur30j } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Churn & rétention » · NOUVELLE adresse (aucun écran V5 équivalent). Même
 * porte que `/admin` · fondateur ET admin de l'espace, avant toute lecture.
 */
export default async function ChurnSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const [tarifs, resiliations] = await Promise.all([chargerTarifs(), chargerResiliations(maintenant)]);
  const espaces = await chargerEspaces(maintenant);
  const m = mrrPlateforme(espaces, tarifs);
  const r30 = resiliationsSur30j(resiliations, maintenant);
  const churn = tauxChurn30(r30, m.payants);
  const risque = comptesARisque(espaces, tarifs, maintenant);
  const anciennete = ancienneteMoyenneMois(espaces, tarifs, maintenant);
  const total12 = resiliations.length;

  return (
    <Churn
      bandeau={bandeau(espaces, tarifs)}
      kpis={[
        { lbl: 'Churn comptes · 30 j', v: adminPourcent(churn), d: adminPluriel(r30, 'résiliation'), c: r30 > 0 ? 'dn' : '', s: `base · ${adminPluriel(m.payants + r30, 'compte payant', 'comptes payants')}` },
        { lbl: 'Churn revenu brut', v: VALEUR_ABSENTE, d: 'Montant non relevé', s: 'la résiliation Stripe ne garde pas le prix' },
        { lbl: 'Rétention nette (NRR)', v: VALEUR_ABSENTE, d: 'Pas d’historique du MRR' },
        { lbl: 'MRR à risque', v: adminEuros(mrrARisque(risque)), d: adminPluriel(risque.length, 'compte'), c: risque.length ? 'w' : '', s: 'au moins un signal' },
        { lbl: 'Sauvés ce mois', v: VALEUR_ABSENTE, d: 'Aucune offre de rétention', s: 'rien n’est proposé avant le départ' },
        { lbl: 'Ancienneté moyenne', v: anciennete == null ? VALEUR_ABSENTE : adminPluriel(anciennete, 'mois', 'mois'), d: 'des abonnés actifs' },
      ]}
      mois={resiliationsParMois(resiliations, maintenant).map((x) => ({ ...x, titre: `${x.libelle} · ${adminPluriel(x.n, 'résiliation')}` }))}
      objectif={null}
      legendeMois={`Événements Stripe · ${adminPluriel(total12, 'résiliation')} sur 12 mois`}
      filtres={filtresComptes(tarifs, 'critique')}
      comptes={risque.map((c) => ligneRisqueAffichee(c, tarifs))}
    />
  );
}
