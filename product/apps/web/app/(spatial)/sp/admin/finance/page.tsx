import {
  VALEUR_ABSENTE, adminEuros, adminMois, adminMoisLong, adminNombre, adminPluriel, adminPourcent, estPayant, ltvMoyenne,
  margeBrutePonderee, mrrPlateforme, noteRepartitionMrr, partsMrr, rentabiliteForfaits, tauxChurn30,
} from '@tiktrends/core';
import { Revenus } from '../../../../../spatial/vues/admin/Revenus';
import { bandeau, chargerEspaces, chargerResiliations, chargerTarifs, porteAdmin, resiliationsSur30j } from '../donnees';

export const dynamic = 'force-dynamic';

/** « Revenus & MRR » · porte de `/admin/finance` (V5) · fondateur ET admin de l'espace. */
export default async function RevenusSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const [tarifs, resiliations] = await Promise.all([chargerTarifs(), chargerResiliations(maintenant)]);
  const espaces = await chargerEspaces(maintenant);
  const m = mrrPlateforme(espaces, tarifs);
  const rentab = rentabiliteForfaits(m.parForfait);
  const marge = margeBrutePonderee(rentab);
  const churn = tauxChurn30(resiliationsSur30j(resiliations, maintenant), m.payants);
  const ltv = ltvMoyenne(m.arpu, marge, churn);
  const parts = partsMrr(m.parForfait);
  // Comptes payants qui ont consommé plus que leur dotation sur 30 jours, par formule.
  const depassements: Record<string, number> = {};
  for (const e of espaces) if (estPayant(e, tarifs) && e.conso30 > (tarifs.credits[e.forfait] ?? 0)) depassements[e.forfait] = (depassements[e.forfait] ?? 0) + 1;

  return (
    <Revenus
      bandeau={bandeau(espaces, tarifs)}
      hero={{
        titre: `MRR · ${adminMoisLong(maintenant)}`, valeur: adminEuros(m.mrr), variation: null,
        detail: `ARR estimé ${adminEuros(m.arr)} · aucun relevé des mois précédents`,
        // Seul le mois en cours a un relevé · les autres restent vides (aucune valeur reconstituée).
        serie: adminMois(maintenant).map((x) => ({ libelle: x.libelle, enCours: x.enCours, valeur: x.enCours ? m.mrr : null })),
      }}
      cotes={[
        { lbl: 'ARPU', v: adminEuros(m.arpu), d: adminPluriel(m.payants, 'abonné') },
        { lbl: 'NRR', v: VALEUR_ABSENTE, d: 'Pas d’historique du MRR' },
        { lbl: 'LTV moyenne', v: adminEuros(ltv), s: ltv == null ? 'aucun départ mesuré sur 30 jours' : 'ARPU × marge ÷ churn' },
        { lbl: 'CAC', v: VALEUR_ABSENTE, d: 'Aucune dépense d’acquisition relevée' },
      ]}
      repartition={{
        legende: `${adminEuros(m.mrr)} · ${adminPluriel(m.payants, 'abonné')}`,
        formules: parts.map((f) => ({ libelle: f.libelle, mrr: f.mrr, mrrTexte: adminEuros(f.mrr), part: adminPourcent(f.part) })),
        note: noteRepartitionMrr(parts, depassements),
      }}
      rentabilite={rentab.map((r) => ({
        libelle: r.libelle, prix: adminEuros(r.prix), abonnes: adminNombre(r.abonnes), mrr: adminEuros(r.mrr),
        coutIa: adminEuros(r.coutIaPireCas, 2), frais: adminEuros(r.fraisPaiement, 2), marge: r.margePct, margeTexte: adminPourcent(r.margePct),
        churn: VALEUR_ABSENTE, ltv: VALEUR_ABSENTE,
      }))}
    />
  );
}
