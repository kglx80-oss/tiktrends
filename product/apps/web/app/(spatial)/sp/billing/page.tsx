import { redirect } from 'next/navigation';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  DESCRIPTIF_FORMULES, FORMULE_MISE_EN_AVANT, ORDRE_FORMULES, boutonFormule, formuleDeReference, consommationSur, deltaUniteCourante, economiePack, equivalencePack,
  messagesRetourForfaits, partSolde, preavisBascule, tarifsV2Actifs, prixFormule, rythmeCredits, texteBaremeCredits,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { PLAN_CREDITS, PLAN_LABEL, PLAN_PRICE, roleAtLeast, type Plan } from '../../../../lib/rbac';
import { unlimitedCredits } from '../../../../lib/credits';
import { CREDIT_PACKS } from '../../../../lib/credit-packs';
import { planPurchasable, stripeConfigured } from '../../../../lib/stripe';
import { createCheckoutAction, createPortalAction, createTopupCheckoutAction } from '../../../actions/stripe';
import { Forfaits } from '../../../../spatial/vues/reglages/Forfaits';
import { SOUS_NAV_REGLAGES } from '../../../../spatial/vues/reglages/sous-nav';

export const dynamic = 'force-dynamic';

const JOURS = 30;

export default async function ForfaitsSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard'); // même garde que /billing V5
  const plan = s.plan as Plan;
  const proprietaire = s.role === 'owner';
  const maintenant = new Date();
  let solde = 0, abonne = false, consommes = 0, echeance: Date | null = null;
  if (db) {
    const [[w], rows] = await Promise.all([
      db.select({ c: schema.workspaces.creditsBalance, st: schema.workspaces.subscriptionStatus, sub: schema.workspaces.stripeSubscriptionId, convertiLe: schema.workspaces.creditUnitConvertedAt, echeance: schema.workspaces.subscriptionPeriodEnd })
        .from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
      db.select({ delta: schema.creditLedger.delta, reason: schema.creditLedger.reason, createdAt: schema.creditLedger.createdAt }).from(schema.creditLedger)
        .where(and(eq(schema.creditLedger.workspaceId, s.workspaceId), gte(schema.creditLedger.createdAt, new Date(maintenant.getTime() - JOURS * 86_400_000)), lt(schema.creditLedger.delta, 0))),
    ]);
    solde = w?.c ?? 0;
    echeance = (w?.echeance as Date | null) ?? null;
    abonne = !!w?.sub && ['active', 'trialing', 'past_due'].includes(w?.st ?? '');
    // Unité ÷ 10 · une consommation antérieure à la conversion se lit ×10 (`deltaUniteCourante`).
    consommes = consommationSur(rows.map((r) => ({ delta: deltaUniteCourante({ delta: r.delta, reason: r.reason, createdAt: r.createdAt as Date }, (w?.convertiLe as Date | null) ?? null), createdAt: r.createdAt as Date })), maintenant, JOURS);
  }
  const illimite = unlimitedCredits(s.user.email);
  const paiement = stripeConfigured();
  const dotation = PLAN_CREDITS[plan] ?? 0;
  const raisonAchat = !paiement ? 'Le paiement en ligne n’est pas encore disponible.' : !proprietaire ? 'Seul le propriétaire de l’espace achète des crédits.' : null;

  return (
    <Forfaits
      sousNav={SOUS_NAV_REGLAGES}
      plan={{ nom: PLAN_LABEL[plan], dotation, solde, illimite, part: illimite ? 100 : partSolde(solde, dotation) }}
      rythme={rythmeCredits(solde, consommes, JOURS)}
      formules={ORDRE_FORMULES.map((k) => ({
        cle: k, nom: PLAN_LABEL[k], prix: prixFormule(PLAN_PRICE[k]), parMois: PLAN_PRICE[k] > 0,
        credits: PLAN_CREDITS[k].toLocaleString('fr-FR'), fonctions: DESCRIPTIF_FORMULES[k].fonctions, radar: k !== 'starter',
        actuelle: k === plan, miseEnAvant: k === FORMULE_MISE_EN_AVANT,
        bouton: boutonFormule({ formule: k, actuelle: formuleDeReference(plan), proprietaire, paiement, abonne, achetable: planPurchasable(k), libelle: PLAN_LABEL[k], prix: PLAN_PRICE[k] }),
      }))}
      portail={proprietaire && paiement && abonne ? createPortalAction : null}
      abonnement={proprietaire && paiement ? createCheckoutAction : null}
      packs={CREDIT_PACKS.map((x) => {
        const e = economiePack(CREDIT_PACKS, x.key);
        return { key: x.key, credits: x.credits.toLocaleString('fr-FR'), prix: `${x.eur.toLocaleString('fr-FR')} €`, economie: e ? `−${e} %` : null, equivalence: equivalencePack(x.credits), nouveauSolde: (solde + x.credits).toLocaleString('fr-FR') };
      })}
      acheter={raisonAchat ? null : createTopupCheckoutAction}
      raisonAchat={raisonAchat}
      faq={[
        { question: 'Que deviennent mes crédits non utilisés ?', reponse: 'Les crédits du plan sont remis à niveau à chaque échéance, sans effacer les crédits achetés en recharge.' },
        { question: 'Puis-je changer de plan à tout moment ?', reponse: 'Oui, depuis « Gérer mon abonnement » : le portail de paiement sécurisé gère le changement de formule et la résiliation.' },
        { question: 'Comment sont comptés les crédits ?', reponse: texteBaremeCredits() },
      ]}
      retours={messagesRetourForfaits()}
      preavis={preavisBascule({ plan, tarifsV2: tarifsV2Actifs(process.env), abonne, finPeriode: echeance })}
    />
  );
}
