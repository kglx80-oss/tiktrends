import {
  adminDateHeure, adminDollars, adminEuros, adminNombre, adminPluriel, adminPourcent, coutsParFournisseur, margeBrutePonderee, margesOperations,
  mrrPlateforme, rentabiliteForfaits, VALEUR_CREDIT_EUR,
} from '@tiktrends/core';
import { spendStatus, depensesAReconcilier } from '../../../../../lib/spend-guard';
import { Couts } from '../../../../../spatial/vues/admin/Couts';
import { bandeau, chargerDepenseParFournisseur, chargerEspaces, chargerTarifs, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/** Le détail des appels et le geste de réconciliation (R4/R5) vivent dans l'écran V5 · lien plein. */
const ECRAN_V5 = '/admin/depenses?ui=v5';

/**
 * « Coûts IA & marges » · porte de `/admin/depenses` (V5, `porteDepenses`) ·
 * fondateur ET admin de l'espace, avant toute lecture. Lecture seule.
 */
export default async function CoutsSpatial() {
  await porteAdmin();
  const maintenant = new Date();
  const [tarifs, depense, parFournisseur, reconciliation] = await Promise.all([
    chargerTarifs(), spendStatus(), chargerDepenseParFournisseur(maintenant),
    depensesAReconcilier().catch(() => null),
  ]);
  const espaces = await chargerEspaces(maintenant, []);
  const m = mrrPlateforme(espaces, tarifs);
  const marge = margeBrutePonderee(rentabiliteForfaits(m.parForfait));
  const part = depense.capUsd > 0 ? (depense.spentUsd / depense.capUsd) * 100 : 100;
  const appels = parFournisseur.fournisseurs.reduce((s, f) => s + f.appels, 0);

  return (
    <Couts
      bandeau={bandeau(espaces, tarifs)}
      kpis={[
        { lbl: 'Coûts IA · 30 j', v: adminDollars(depense.spentUsd), d: adminPluriel(appels, 'appel') },
        { lbl: 'Part du plafond', v: adminPourcent(part), d: `plafond ${adminDollars(depense.capUsd)}`, c: part >= 80 ? 'w' : 'up' },
        { lbl: 'Coût par abonné', v: m.payants ? adminDollars(depense.spentUsd / m.payants) : adminDollars(null), d: 'dépense ÷ comptes payants' },
        { lbl: 'Marge brute', v: adminPourcent(marge), d: 'Pire cas · allocation pleine' },
      ]}
      fournisseurs={coutsParFournisseur(parFournisseur.fournisseurs).map((f) => ({ cle: f.fournisseur, montant: adminDollars(f.usd), appels: adminPluriel(f.appels, 'appel'), largeur: f.largeur, part: adminPourcent(f.part) }))}
      budget={{
        part: Math.min(100, part), titre: `${adminDollars(depense.spentUsd)} sur ${adminDollars(depense.capUsd)}`,
        detail: `${depense.summary} · plafond réglé sur le serveur (AI_SPEND_CAP_USD)`, detailHref: ECRAN_V5,
      }}
      legendeOperations={`Valeur d’un crédit : ${adminEuros(VALEUR_CREDIT_EUR, 2)} · coûts fournisseurs estimés`}
      operations={margesOperations().map((o) => ({ libelle: o.libelle, credits: adminNombre(o.credits), revenu: adminEuros(o.revenuEur, 3), cout: adminEuros(o.coutEur, 3), marge: o.margePct, margeTexte: adminPourcent(o.margePct), aRevoir: o.aRevoir }))}
      note="Revenu = crédits débités × valeur d’un crédit. Coût = estimation du modèle économique (packages/core/economics.ts), à rapprocher des factures. « À revoir » sous 65 % de marge, la cible de l’écran Finance."
      aReconcilier={reconciliation && reconciliation.lignes.length ? {
        resume: reconciliation.resume,
        lignes: reconciliation.lignes.slice(0, 8).map((l) => ({ id: l.id, quand: adminDateHeure(l.createdAt), poste: l.action, montant: adminDollars(l.estimatedUsd), cause: l.causeLisible })),
      } : null}
    />
  );
}
