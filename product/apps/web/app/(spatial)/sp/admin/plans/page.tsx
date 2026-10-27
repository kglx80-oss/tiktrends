import { VALEUR_ABSENTE, adminEuros, adminNombre, adminPluriel, adminPourcent, espacesParForfait, inscriptions } from '@tiktrends/core';
import { signupOpen } from '../../../../../lib/auth';
import { planPurchasable } from '../../../../../lib/stripe';
import { CREDIT_PACKS } from '../../../../../lib/credit-packs';
import { TRIAL_DEFAULT_CREDITS, TRIAL_DEFAULT_DAYS } from '../../../../../lib/trial';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { afficherCredits, texteCredits } from '@tiktrends/core';
import { PLAN_CREDITS, type Plan } from '../../../../../lib/rbac';
import { unlimitedCredits } from '../../../../../lib/credits';
import { Forfaits } from '../../../../../spatial/vues/admin/Forfaits';
import { bandeau, chargerEspaces, chargerRecharges, chargerTarifs, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

const OK: Record<string, string> = {
  changed: 'Formule appliquée.', same: 'C’est déjà la formule actuelle.',
  grant: 'Crédits ajustés.', recharge: 'Allocation rechargée.',
};
const ERR: Record<string, string> = { forbidden: 'Réservé au fondateur.', plan: 'Formule inconnue.', amount: 'Montant invalide.' };

/**
 * « Forfaits & offres » · porte de `/admin/plans` (V5) · fondateur ET admin de
 * l'espace. Aucune offre, aucun prix n'est modifié ici · « Modifier » mène au
 * réglage des tarifs existant (console). Vague 3 · les leviers internes de
 * l'ancien écran (appliquer une formule, ajuster les crédits, recharger
 * l'allocation de SON espace) sont servis ici, par leurs actions existantes.
 */
export default async function ForfaitsSpatial({ searchParams }: { searchParams?: Promise<{ ok?: string; e?: string }> } = {}) {
  const s = await porteAdmin();
  const { ok, e } = (await searchParams) ?? {};
  const maintenant = new Date();
  const [tarifs, recharges, ws] = await Promise.all([
    chargerTarifs(), chargerRecharges(maintenant),
    db ? db.select({ c: schema.workspaces.creditsBalance, st: schema.workspaces.subscriptionStatus }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1) : Promise.resolve([]),
  ]);
  const plan = s.plan as Plan;
  const solde = texteCredits(afficherCredits({ balance: ws[0]?.c ?? 0, unlimited: unlimitedCredits(s.user.email) }), adminNombre);
  const statut = ws[0]?.st ?? null;
  const espaces = await chargerEspaces(maintenant, []);
  const parForfait = espacesParForfait(espaces);
  const ins = inscriptions(espaces, tarifs, maintenant);

  return (
    <Forfaits
      bandeau={bandeau(espaces, tarifs)}
      reglage="/console"
      forfaits={tarifs.ordre.map((f) => {
        const vendable = f === 'starter' ? signupOpen() : planPurchasable(f as Plan);
        return {
          cle: f, libelle: tarifs.libelles[f] ?? f,
          prix: (tarifs.prix[f] ?? 0) > 0 ? adminEuros(tarifs.prix[f]) : 'Gratuit',
          credits: adminNombre(tarifs.credits[f] ?? 0), abonnes: adminNombre(parForfait[f] ?? 0), annuel: VALEUR_ABSENTE, vendable,
          raisonVente: f === 'starter' ? (vendable ? 'Inscription libre ouverte' : 'Inscription sur invitation seulement') : (vendable ? 'Prix Stripe configuré sur le serveur' : 'Aucun prix Stripe configuré sur le serveur'),
        };
      })}
      packs={CREDIT_PACKS.map((k) => {
        const ventes = recharges.filter((r) => r.credits === k.credits).length;
        return { credits: adminNombre(k.credits), prix: adminEuros(k.eur), ventes: `${adminPluriel(ventes, 'vente')} / 30 j`, unitaire: `${adminEuros((k.eur / k.credits) * 100, 2)} / 100 crédits` };
      })}
      essai={[
        { libelle: 'Durée', valeur: adminPluriel(TRIAL_DEFAULT_DAYS, 'jour') },
        { libelle: 'Crédits offerts', valeur: adminPluriel(TRIAL_DEFAULT_CREDITS, 'crédit') },
        { libelle: 'Carte bancaire requise', valeur: 'Non' },
        { libelle: 'Conversion inscrits → payants', valeur: ins.conversionPct == null ? VALEUR_ABSENTE : `${adminPourcent(ins.conversionPct)} (30 j)` },
      ]}
      leviers={{
        espace: s.workspaceName, formule: tarifs.libelles[plan] ?? plan, formuleActuelle: plan,
        prixFormule: (tarifs.prix[plan] ?? 0) > 0 ? `${adminEuros(tarifs.prix[plan])} / mois` : 'Gratuit',
        solde, allocation: `allocation ${adminNombre(PLAN_CREDITS[plan] ?? 0)} / mois`,
        abonnement: statut ? { libelle: statut, detail: 'géré par Stripe' } : { libelle: 'Aucun', detail: 'pilotage manuel' },
        formules: tarifs.ordre.map((f) => ({ cle: f, libelle: `${tarifs.libelles[f] ?? f} · ${adminNombre(PLAN_CREDITS[f as Plan] ?? 0)} cr.` })),
        message: ok && OK[ok] ? { ok: true, texte: OK[ok] } : e && ERR[e] ? { ok: false, texte: ERR[e] } : null,
      }}
    />
  );
}
