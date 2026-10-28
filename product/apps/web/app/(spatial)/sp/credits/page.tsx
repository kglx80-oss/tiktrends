import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  CREDIT_COSTS, CREDIT_EUR, LIBELLE_ACTION_CREDIT, PAYMENT_FEE_PCT, corporateTaxRate, creditMarkup, ecranCreditsMarges, libelleMotif,
  partConsommeeCycle, videHistoriqueCredits, type CreditAction,
} from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { PLAN_CREDITS, PLAN_LABEL, roleAtLeast, type Plan } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { unlimitedCredits } from '../../../../lib/credits';
import { trialStatus } from '../../../../lib/trial';
import { CreditsMarges } from '../../../../spatial/vues/admin/CreditsMarges';
import { bandeau, chargerEspaces, chargerTarifs, navAdmin } from '../admin/donnees';

export const dynamic = 'force-dynamic';

/**
 * « Crédits & marges » · vague 4 · mêmes gardes que l'écran V5 retiré, avant
 * toute lecture · un membre retourne à l'accueil, un administrateur qui n'est
 * pas du personnel de la plateforme à son abonnement (`/billing`) · les coûts
 * réels et les marges ne se montrent qu'au fondateur.
 */
export default async function CreditsMargesSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/billing');

  let solde = 0, finEssai: Date | null = null, sorte = 'normal';
  let journal: Array<typeof schema.creditLedger.$inferSelect> = [];
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance, t: schema.workspaces.trialEndsAt, k: schema.workspaces.accountKind }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    solde = w?.c ?? 0; finEssai = w?.t ?? null; sorte = w?.k ?? 'normal';
    journal = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, s.workspaceId)).orderBy(desc(schema.creditLedger.createdAt)).limit(12);
  }
  const maintenant = new Date();
  const [tarifs, espaces] = await Promise.all([chargerTarifs(), chargerEspaces(maintenant, [])]);
  const allocation = PLAN_CREDITS[s.plan as Plan] ?? 0;
  const illimite = unlimitedCredits(s.user.email);
  const conso = partConsommeeCycle({ allocation, solde, illimite, mouvements: journal.length });
  const essai = trialStatus({ trialEndsAt: finEssai, accountKind: sorte });
  const markup = creditMarkup();
  const taux = corporateTaxRate();

  return (
    <CreditsMarges
      bandeau={bandeau(espaces, tarifs, await navAdmin())}
      essai={essai.isTrial && essai.daysLeft != null ? {
        texte: `${sorte === 'staff' ? 'Compte staff' : 'Compte de test / beta'}${essai.expired ? ' · période terminée' : ` · ${essai.daysLeft} jour${essai.daysLeft > 1 ? 's' : ''} restant${essai.daysLeft > 1 ? 's' : ''}`}`,
        conseil: essai.expired ? 'Contacte-nous pour continuer.' : 'Profite de tes crédits de test pour explorer TikTrends.',
        alerte: essai.expired || essai.daysLeft <= 3,
      } : null}
      compte={{
        solde: illimite ? '∞' : solde.toLocaleString('fr-FR'), illimite, forfait: PLAN_LABEL[s.plan as Plan] ?? s.plan,
        allocation: allocation.toLocaleString('fr-FR'), conso: conso.pct === null ? 'Sans objet' : `${conso.pct} %`, note: conso.note,
      }}
      regle={{ markup, credit: `${CREDIT_EUR.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`, taux: Math.round(taux * 100), frais: Math.round(PAYMENT_FEE_PCT * 100) }}
      ecran={ecranCreditsMarges({ forfaits: tarifs.ordre.map((k) => ({ libelle: tarifs.libelles[k] ?? k, prix: tarifs.prix[k] ?? 0, credits: tarifs.credits[k] ?? 0 })), markup, taux })}
      bareme={(Object.keys(CREDIT_COSTS) as CreditAction[]).map((k) => ({ cle: k, libelle: LIBELLE_ACTION_CREDIT[k], credits: CREDIT_COSTS[k] }))}
      historique={journal.map((l) => ({
        id: l.id, motif: libelleMotif(l.reason),
        quand: new Date(l.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        delta: `${l.delta >= 0 ? '+' : ''}${l.delta.toLocaleString('fr-FR')}`, credit: l.delta >= 0,
      }))}
      vide={{ ...videHistoriqueCredits(illimite), action: { href: '/studio/projets', libelle: 'Ouvrir les Studios' } }}
    />
  );
}
