import {
  VALEUR_ABSENTE, MARGE_BRUTE_CIBLE, adminEuros, corporateTaxRate, creditMarkup, eurosFinance, financeParFormule, adminMois, adminMoisLong, adminNombre, adminPluriel, adminPourcent, estPayant, ltvMoyenne,
  margeBrutePonderee, mrrPlateforme, noteRepartitionMrr, partsMrr, rentabiliteForfaits, tauxChurn30,
} from '@tiktrends/core';
import { PLAN_CREDITS, PLAN_LABEL, PLAN_PRICE } from '../../../../../lib/rbac';
import { Revenus, type PropsFinanceFormules } from '../../../../../spatial/vues/admin/Revenus';
import { bandeau, chargerEspaces, chargerResiliations, chargerTarifs, porteAdmin, resiliationsSur30j, navAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Les indicateurs de l'ancienne page Finance, TELS QU'ELLE LES CALCULAIT
 * (noyau `financeParFormule`) · la formule de chaque espace × le prix et la
 * dotation du CATALOGUE du code (`PLAN_PRICE`, `PLAN_CREDITS`), marge
 * `CREDIT_MARKUP`, IS `CORPORATE_TAX_RATE`. Aucune définition nouvelle.
 */
function financeFormules(formules: readonly string[]): PropsFinanceFormules {
  const markup = creditMarkup(), taux = corporateTaxRate();
  const f = financeParFormule({ formules, prix: PLAN_PRICE, credits: PLAN_CREDITS, libelles: PLAN_LABEL, markup, taux });
  const cible = `${Math.round(MARGE_BRUTE_CIBLE * 100)} %`;
  return {
    intro: `Revenu récurrent et bénéfice net de la plateforme. La marge nette déduit coût API (pire cas, allocation pleine), frais de paiement et IS (${Math.round(taux * 100)} %).`,
    base: 'Base de ce calcul · la formule de chaque espace, abonnement Stripe actif ou non, × le prix du catalogue. Le MRR en tête d’écran compte les seuls abonnements Stripe actifs, aux tarifs en vigueur · les deux résultats peuvent différer, la définition du MRR reste à décider.',
    kpis: [
      { lbl: 'MRR', v: eurosFinance(f.mrr), d: 'Revenu mensuel récurrent' },
      { lbl: 'ARR', v: eurosFinance(f.arr), d: 'Annualisé (MRR × 12)' },
      { lbl: 'Bénéfice net / mois', v: eurosFinance(f.beneficeNetMensuel), d: 'Après coût API, frais, IS', c: f.beneficeNetMensuel > 0 ? 'up' : '' },
      { lbl: 'Clients payants', v: String(f.clientsPayants), d: `ARPA ${eurosFinance(f.arpa)}` },
    ],
    lignes: f.lignes.map((r) => ({
      plan: r.plan, libelle: r.libelle, prix: eurosFinance(r.prix), clients: String(r.clients), mrr: eurosFinance(r.prix * r.clients),
      netAbonne: eurosFinance(r.net.netEur), netPct: `${r.net.netPct}%`, netPositif: r.net.netEur > 0, netMois: eurosFinance(r.net.netEur * r.clients),
      saine: r.risque.healthy,
    })),
    cible,
    recos: f.lignes.map((r) => ({
      plan: r.plan, libelle: r.libelle, prix: eurosFinance(r.prix), surAlloue: r.surAlloue,
      lignes: [
        { k: 'Crédits actuels', v: r.credits.toLocaleString('fr-FR'), accent: false },
        { k: `Crédits pour ${cible} de marge`, v: r.creditsOptimaux.toLocaleString('fr-FR'), accent: r.surAlloue },
        { k: 'Coût API pire cas', v: eurosFinance(r.net.apiCostEur), accent: false },
        { k: 'Prix conseillé (crédits actuels)', v: eurosFinance(r.risque.recommendedPriceEur), accent: r.risque.recommendedPriceEur > r.prix },
        { k: 'Pire cas de marge', v: `${r.risque.worstMarginPct}% · ${r.risque.worstAction}`, accent: false },
      ],
      conseil: r.surAlloue ? `Réduire à ~${r.creditsOptimaux.toLocaleString('fr-FR')} crédits (ou passer le prix à ${eurosFinance(r.risque.recommendedPriceEur)}) pour sécuriser la marge.` : null,
    })),
    reglages: 'Réglages via variables serveur : CREDIT_MARKUP (marge), CORPORATE_TAX_RATE (IS). Les allocations et prix des formules sont dans lib/rbac.ts (PLAN_CREDITS / PLAN_PRICE).',
  };
}

/**
 * « Revenus & MRR » · `/admin/finance`, écran EXCLUSIF (l'ancienne page est
 * retirée, ses indicateurs vivent ici) · fondateur ET admin de l'espace, la
 * même porte que l'ancienne page.
 */
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
      bandeau={bandeau(espaces, tarifs, await navAdmin())}
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
      financeFormules={financeFormules(espaces.map((e) => e.forfait))}
    />
  );
}
