import { randomUUID } from 'node:crypto';
import { desc } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  VALEUR_ABSENTE, ecranReconciliation, type EcranReconciliation, type EcranReconciliees,
  adminDateHeure, adminDollars, adminEuros, adminNombre, adminPluriel, adminPourcent, coutsParFournisseur, margeBrutePonderee, margesOperations,
  mrrPlateforme, rentabiliteForfaits, VALEUR_CREDIT_EUR,
} from '@tiktrends/core';
import { spendStatus, spendByAction, depensesAReconcilier, depensesReconciliees } from '../../../../../lib/spend-guard';
import { Couts } from '../../../../../spatial/vues/admin/Couts';
import { bandeau, chargerDepenseParFournisseur, chargerEspaces, chargerTarifs, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Coûts IA & marges » · porte de `/admin/depenses` (`porteDepenses` V5 ·
 * `porteAdmin`, la même règle) · fondateur ET admin de l'espace, avant toute
 * lecture. Vague 3 · la réconciliation (R4/R5 · `reconcilierDepenseAction`,
 * qui repose la porte) et le détail des appels sont servis ici. Le geste
 * redirige vers `/admin/depenses?reconciliee=…#reconciliees`.
 */
type Parametres = Record<string, string | string[] | undefined>;
export default async function CoutsSpatial({ searchParams }: { searchParams?: Promise<Parametres> } = {}) {
  await porteAdmin();
  const q = (await searchParams) ?? {};
  const maintenant = new Date();
  const [tarifs, depense, parFournisseur, reconciliation, historique, parAction, recentes] = await Promise.all([
    chargerTarifs(), spendStatus(), chargerDepenseParFournisseur(maintenant),
    lire<EcranReconciliation>(async () => ecranReconciliation(await depensesAReconcilier()), 'lignes à réconcilier'),
    lire<EcranReconciliees>(() => depensesReconciliees(), 'réconciliations'),
    spendByAction(12),
    db ? db.select().from(schema.aiSpend).orderBy(desc(schema.aiSpend.createdAt)).limit(25) : Promise.resolve([]),
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
        detail: `${depense.summary} · plafond réglé sur le serveur (AI_SPEND_CAP_USD)`, detailHref: '#appels',
      }}
      legendeOperations={`Valeur d’un crédit : ${adminEuros(VALEUR_CREDIT_EUR, 2)} · coûts fournisseurs estimés`}
      operations={margesOperations().map((o) => ({ libelle: o.libelle, credits: adminNombre(o.credits), revenu: adminEuros(o.revenuEur, 3), cout: adminEuros(o.coutEur, 3), marge: o.margePct, margeTexte: adminPourcent(o.margePct), aRevoir: o.aRevoir }))}
      note="Revenu = crédits débités × valeur d’un crédit. Coût = estimation du modèle économique (packages/core/economics.ts), à rapprocher des factures. « À revoir » sous 65 % de marge, la cible de l’écran Finance."
      aReconcilier={{
        erreur: reconciliation.erreur, resume: reconciliation.ecran?.resume ?? '', consigne: reconciliation.ecran?.consigne ?? '',
        parFournisseur: reconciliation.ecran?.parFournisseur ?? [],
        // R5 · une clé d'idempotence par ligne et par rendu · la même soumission rejouée rend la même réconciliation.
        lignes: (reconciliation.ecran?.lignes ?? []).map((l) => ({ ...l, cle: randomUUID() })),
      }}
      reconciliees={{
        erreur: historique.erreur, resume: historique.ecran?.resume ?? '', lignes: historique.ecran?.lignes ?? [],
        recente: typeof q.reconciliee === 'string' ? q.reconciliee : null, deja: q.deja === '1',
      }}
      parPoste={parAction.map((a) => ({ poste: a.action, montant: adminDollars(a.usd), appels: adminPluriel(a.calls, 'appel'), part: depense.spentUsd > 0 ? (a.usd / depense.spentUsd) * 100 : 0 }))}
      appels={recentes.map((r) => ({
        id: r.id, quand: adminDateHeure(r.createdAt as Date), fournisseur: r.provider, modele: r.model ?? VALEUR_ABSENTE, poste: r.action,
        jetons: r.inputTokens !== null ? `${r.inputTokens} → ${r.outputTokens ?? 0}` : VALEUR_ABSENTE, cout: adminDollars(r.actualUsd),
      }))}
    />
  );
}

/** Une lecture qui échoue se DIT (état « lecture impossible ») · elle ne casse pas l'écran. */
async function lire<T>(f: () => Promise<T>, quoi: string): Promise<{ ecran: T | null; erreur: string | null }> {
  try {
    return { ecran: await f(), erreur: null };
  } catch (e) {
    console.error(`[depenses] lecture des ${quoi}`, e instanceof Error ? e.message : e);
    return { ecran: null, erreur: 'erreur de lecture en base' };
  }
}
