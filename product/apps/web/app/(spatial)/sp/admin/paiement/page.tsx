import { desc, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  VALEUR_ABSENTE, adminEuros, adminIlYa, adminNombre, adminPluriel, enDefautDePaiement, mrrEspace, mrrPlateforme, rapprochementStripe,
} from '@tiktrends/core';
import { stripeConfigured } from '../../../../../lib/stripe';
import { personnelPlateforme } from '../../../../../lib/personnel-plateforme';
import { Paiements } from '../../../../../spatial/vues/admin/Paiements';
import { bandeau, chargerEspaces, chargerTarifs, porteAdmin, navAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

const MOTIF: Record<string, string> = { past_due: 'Paiement en retard · Stripe relance la carte', unpaid: 'Impayé · relances Stripe épuisées' };
const STATUT: Record<string, string> = { past_due: 'En retard', unpaid: 'Impayé' };

/** « Stripe & Whop » · porte de `/admin/paiement` (V5) · fondateur ET admin de l'espace. */
export default async function PaiementsSpatial() {
  const session = await porteAdmin();
  const maintenant = new Date();
  const tarifs = await chargerTarifs();
  const espaces = await chargerEspaces(maintenant, []);
  const defauts = espaces.filter(enDefautDePaiement);
  const [clients, webhooks] = db ? await Promise.all([
    defauts.length ? db.select({ id: schema.workspaces.id, client: schema.workspaces.stripeCustomerId }).from(schema.workspaces).where(inArray(schema.workspaces.id, defauts.map((d) => d.id))) : Promise.resolve([]),
    db.select().from(schema.stripeEvents).orderBy(desc(schema.stripeEvents.createdAt)).limit(4),
  ]) : [[], []];
  const clientDe = new Map(clients.map((c) => [c.id, c.client]));
  const m = mrrPlateforme(espaces, tarifs);
  const configure = stripeConfigured();
  const cle = process.env.STRIPE_SECRET_KEY ?? '';
  const mode = cle.startsWith('sk_live') ? 'live' : cle.startsWith('sk_test') ? 'test' : null;
  const tableau = mode === 'test' ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
  const r = rapprochementStripe(espaces, tarifs);
  const dernier = webhooks[0]?.createdAt as Date | undefined;

  return (
    <Paiements
      bandeau={bandeau(espaces, tarifs, await navAdmin())}
      controle
      offreV2={personnelPlateforme(session)}
      cartes={[
        {
          cle: 'stripe', nom: 'Stripe', sous: 'Abonnements et recharges de crédits', connecte: configure, etat: configure ? 'Connecté' : 'Non configuré',
          stats: [
            { libelle: 'Abonnés', valeur: adminPluriel(m.payants, 'abonné') },
            { libelle: 'MRR', valeur: adminEuros(m.mrr) },
            { libelle: 'Paiements en défaut', valeur: adminPluriel(defauts.length, 'défaut') },
          ],
          note: configure ? `Mode ${mode === 'live' ? 'production (paiements réels)' : mode === 'test' ? 'test' : 'inconnu'} · dernier webhook ${dernier ? adminIlYa(dernier, maintenant) : 'jamais reçu'}` : 'Aucune clé Stripe sur le serveur · le paiement est coupé.',
          ouvrir: configure ? tableau : null, verifier: configure,
        },
        {
          cle: 'whop', nom: 'Whop', sous: 'Communautés et créateurs', connecte: false, etat: 'Non branché',
          stats: [{ libelle: 'Abonnés', valeur: VALEUR_ABSENTE }, { libelle: 'MRR', valeur: VALEUR_ABSENTE }, { libelle: 'Paiements en défaut', valeur: VALEUR_ABSENTE }],
          note: 'Aucune intégration Whop dans l’outil · rien n’est encaissé par Whop.', ouvrir: null, verifier: false,
        },
      ]}
      defauts={{
        legende: `${adminEuros(defauts.reduce((s, e) => s + mrrEspace(e, tarifs), 0))} de MRR concernés`,
        lignes: defauts.map((e) => {
          const c = clientDe.get(e.id);
          return {
            id: e.id, nom: e.nom, forfait: tarifs.libelles[e.forfait] ?? e.forfait, prix: adminEuros(tarifs.prix[e.forfait] ?? 0),
            motif: MOTIF[e.statutAbonnement ?? ''] ?? (e.statutAbonnement ?? ''), statut: STATUT[e.statutAbonnement ?? ''] ?? 'Défaut',
            lien: c ? `${tableau}/customers/${encodeURIComponent(c)}` : null,
          };
        }),
      }}
      webhooks={{
        etat: dernier ? { libelle: `Dernier reçu ${adminIlYa(dernier, maintenant)}`, classe: 'g' } : { libelle: 'Aucun reçu', classe: '' },
        lignes: webhooks.map((w) => ({ id: w.eventId, type: w.type, quand: adminIlYa(w.createdAt as Date, maintenant) })),
      }}
      rapprochement={{
        lignes: [{ libelle: 'Stripe ↔ TikTrends', valeur: `${adminNombre(r.rattaches)} / ${adminNombre(r.attendus)}`, etat: r.ecarts.length ? { libelle: adminPluriel(r.ecarts.length, 'écart'), classe: 'w' } : { libelle: 'OK', classe: 'g' } }],
        ecarts: r.ecarts.map((e) => e.nom),
      }}
    />
  );
}

