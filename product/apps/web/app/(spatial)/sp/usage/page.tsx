import { redirect } from 'next/navigation';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { CREDIT_COSTS, FUSEAU_ACCUEIL, LIBELLE_ACTION_CREDIT, consommationParSemaine, consommationSur, journalCredits, partSolde, type CreditAction } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast, PLAN_CREDITS, PLAN_LABEL, type Plan } from '../../../../lib/rbac';
import { unlimitedCredits } from '../../../../lib/credits';
import { stripeConfigured } from '../../../../lib/stripe';
import { createPortalAction } from '../../../actions/stripe';
import { Utilisation } from '../../../../spatial/vues/reglages/Utilisation';
import { SOUS_NAV_REGLAGES } from '../../../../spatial/vues/reglages/sous-nav';

export const dynamic = 'force-dynamic';

/** Les opérations montrées · les quatre gestes de création les plus courants, prix RÉELS du barème. */
const OPERATIONS: CreditAction[] = ['image', 'clone_image', 'brief', 'video'];
const SEMAINES = 12;
/** Le journal · mêmes bornes que l'écran V5 `/usage` (120 mouvements, totaux sur 30 jours). */
const LIMITE_JOURNAL = 120;
const JOURS_JOURNAL = 30;

export default async function UsageSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');

  const plan = s.plan as Plan;
  const maintenant = new Date();
  const depuis = new Date(maintenant.getTime() - SEMAINES * 7 * 86_400_000);
  let solde = 0, abonne = false;
  let mouvements: Array<{ delta: number; createdAt: Date }> = [];
  let journal: Array<{ id: string; delta: number; reason: string; createdAt: Date }> = [];
  let ajoute = 0, consomme = 0;
  const depuisJournal = new Date(maintenant.getTime() - JOURS_JOURNAL * 86_400_000);
  if (db) {
    const [[w], rows, lignes, [agg]] = await Promise.all([
      db.select({ c: schema.workspaces.creditsBalance, st: schema.workspaces.subscriptionStatus, sub: schema.workspaces.stripeSubscriptionId })
        .from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
      db.select({ delta: schema.creditLedger.delta, createdAt: schema.creditLedger.createdAt }).from(schema.creditLedger)
        .where(and(eq(schema.creditLedger.workspaceId, s.workspaceId), gte(schema.creditLedger.createdAt, depuis), lt(schema.creditLedger.delta, 0))),
      db.select({ id: schema.creditLedger.id, delta: schema.creditLedger.delta, reason: schema.creditLedger.reason, createdAt: schema.creditLedger.createdAt }).from(schema.creditLedger)
        .where(eq(schema.creditLedger.workspaceId, s.workspaceId)).orderBy(desc(schema.creditLedger.createdAt)).limit(LIMITE_JOURNAL),
      db.select({
        consomme: sql<number>`coalesce(-sum(case when ${schema.creditLedger.delta} < 0 then ${schema.creditLedger.delta} else 0 end), 0)`,
        ajoute: sql<number>`coalesce(sum(case when ${schema.creditLedger.delta} > 0 then ${schema.creditLedger.delta} else 0 end), 0)`,
      }).from(schema.creditLedger).where(and(eq(schema.creditLedger.workspaceId, s.workspaceId), gte(schema.creditLedger.createdAt, depuisJournal))),
    ]);
    journal = lignes.map((l) => ({ id: String(l.id), delta: l.delta, reason: l.reason, createdAt: l.createdAt as Date }));
    ajoute = Number(agg?.ajoute ?? 0);
    consomme = Number(agg?.consomme ?? 0);
    solde = w?.c ?? 0;
    abonne = !!w?.sub && ['active', 'trialing', 'past_due'].includes(w?.st ?? '');
    mouvements = rows.map((r) => ({ delta: r.delta, createdAt: r.createdAt as Date }));
  }
  const illimite = unlimitedCredits(s.user.email);
  const dotation = PLAN_CREDITS[plan] ?? 0;
  const portail = stripeConfigured() && abonne && roleAtLeast(s.role, 'owner');
  const conso30 = consommationSur(mouvements, maintenant, 30);

  return (
    <Utilisation
      sousNav={SOUS_NAV_REGLAGES}
      plan={{ nom: `Plan ${PLAN_LABEL[plan]}`, dotation, solde, illimite, part: illimite ? 100 : partSolde(solde, dotation), detail: `${conso30.toLocaleString('fr-FR')} crédit${conso30 > 1 ? 's' : ''} consommé${conso30 > 1 ? 's' : ''} sur 30 jours` }}
      peutChangerPlan={roleAtLeast(s.role, 'owner')}
      semaines={consommationParSemaine(mouvements, maintenant, SEMAINES)}
      couts={OPERATIONS.map((a) => ({ libelle: LIBELLE_ACTION_CREDIT[a], credits: CREDIT_COSTS[a] }))}
      // Les factures vivent chez Stripe · aucune n'est recopiée ici, donc
      // aucune ligne n'est affichée. Le portail sécurisé les donne toutes.
      factures={[]}
      journal={{ ...journalCredits(journal, { depuis: depuisJournal, limite: LIMITE_JOURNAL, jours: JOURS_JOURNAL, fuseau: FUSEAU_ACCUEIL }), ajoute, consomme }}
      sansFacture={portail
        ? { message: 'Tes factures sont dans ton espace de paiement sécurisé.', portail: createPortalAction }
        : { message: abonne ? 'Seul le propriétaire de l’espace accède aux factures.' : 'Aucune facture · ton espace n’a pas d’abonnement payant.', portail: null }}
    />
  );
}
