import 'server-only';
import { redirect } from 'next/navigation';
import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  attendReponse, mrrPlateforme,
  type EspacePlateforme, type TarifsPlateforme, type TicketPlateforme, type StatutTicket, type TypeTicket,
} from '@tiktrends/core';
import { getSession, type Session } from '../../../../lib/auth';
import { roleAtLeast, PLAN_LABEL, type Plan } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { getPlanConfig } from '../../../../lib/settings';
import type { BandeauAdmin } from '../../../../spatial/vues/admin/base';

/**
 * Les lectures du Tour de contrôle Spatial · TOUTES après la porte. Aucune
 * n'écrit. Les règles (payant, risque, churn, marges…) vivent dans le noyau
 * (`packages/core/src/spatial/admin`) · ici, on lit et on met en forme les
 * lignes, rien d'autre.
 */

const JOUR = 86_400_000;
const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

/**
 * La porte des écrans plateforme · la MÊME que les écrans V5 (`/admin`,
 * `/admin/finance`, `/admin/plans`, `/admin/signups`, `/admin/depenses`,
 * `/admin/paiement`) : connecté, admin de l'espace ET fondateur. Un admin
 * d'espace seul n'obtient aucune donnée de plateforme · il est renvoyé AVANT
 * toute lecture.
 */
export async function porteAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/dashboard');
  return s;
}

/** Les tarifs effectifs · formules du code, surcharges en base (`plan_config`). */
export async function chargerTarifs(): Promise<TarifsPlateforme> {
  const cfg = await getPlanConfig();
  return { ordre: PLANS, libelles: PLAN_LABEL, prix: cfg.prices, credits: cfg.credits };
}

const PROFIL: Record<string, string> = { brand: 'Marque / E-com', agency: 'Agence', freelancer: 'Freelance', ai_artist: 'AI Artist', other: 'Autre' };
const date = (v: unknown): Date | null => (v == null ? null : v instanceof Date ? v : new Date(String(v)));

/** Tous les tickets de la plateforme et leurs messages (le plus récent d'abord). */
export async function chargerTickets(limite = 300): Promise<TicketPlateforme[]> {
  if (!db) return [];
  const T = schema.tickets, M = schema.ticketMessages, W = schema.workspaces;
  const rows = await db.select({
    id: T.id, ws: T.workspaceId, espace: W.name, auteur: T.authorName, type: T.type, titre: T.title, corps: T.body,
    statut: T.status, creeLe: T.createdAt, majLe: T.updatedAt,
  }).from(T).leftJoin(W, eq(W.id, T.workspaceId)).orderBy(desc(T.updatedAt)).limit(limite);
  const ids = rows.map((r) => r.id);
  const msgs = ids.length ? await db.select({ t: M.ticketId, auteur: M.authorName, corps: M.body, equipe: M.isStaff, le: M.createdAt })
    .from(M).where(inArray(M.ticketId, ids)).orderBy(asc(M.createdAt)) : [];
  const parTicket = new Map<string, TicketPlateforme['messages']>();
  for (const m of msgs) {
    const l = parTicket.get(m.t) ?? [];
    l.push({ auteur: m.auteur ?? 'Client', corps: m.corps, equipe: m.equipe, le: m.le as Date });
    parTicket.set(m.t, l);
  }
  return rows.map((r) => ({
    id: r.id, espaceId: r.ws, espace: r.espace ?? 'Espace supprimé', auteur: r.auteur, type: r.type as TypeTicket, titre: r.titre, corps: r.corps,
    statut: r.statut as StatutTicket, creeLe: r.creeLe as Date, majLe: r.majLe as Date, messages: parTicket.get(r.id) ?? [],
  }));
}

/** Tous les espaces, avec leurs agrégats de crédits et de tickets. */
export async function chargerEspaces(maintenant: Date, tickets?: readonly TicketPlateforme[]): Promise<EspacePlateforme[]> {
  if (!db) return [];
  const W = schema.workspaces, L = schema.creditLedger;
  const depuis = new Date(maintenant.getTime() - 30 * JOUR);
  const [ws, agg, tk] = await Promise.all([
    db.select().from(W).orderBy(desc(W.createdAt)),
    db.select({
      ws: L.workspaceId,
      // La date passe par `gte` (conversion de la colonne) · une Date brute dans `sql` casse postgres.js.
      conso30: sql<number>`coalesce(-sum(case when ${L.delta} < 0 and ${gte(L.createdAt, depuis)} then ${L.delta} else 0 end), 0)`,
      debits: sql<number>`count(*) filter (where ${L.delta} < 0)`,
      derniere: sql<string | null>`max(${L.createdAt})`,
    }).from(L).groupBy(L.workspaceId),
    tickets ? Promise.resolve(tickets) : chargerTickets(),
  ]);
  const parWs = new Map(agg.map((a) => [a.ws, a]));
  const sansReponse = new Map<string, number>();
  for (const t of tk) if (attendReponse(t)) sansReponse.set(t.espaceId, (sansReponse.get(t.espaceId) ?? 0) + 1);
  return ws.map((w) => {
    const a = parWs.get(w.id);
    const onb = (w.onboarding ?? {}) as { profile?: string };
    return {
      id: w.id, nom: w.name, forfait: PLANS.includes(w.plan as Plan) ? w.plan : 'starter', type: w.accountKind,
      creeLe: w.createdAt as Date, onboardeLe: date(w.onboardedAt), essaiFinLe: date(w.trialEndsAt),
      abonnementStripe: !!w.stripeSubscriptionId, statutAbonnement: w.subscriptionStatus ?? null,
      solde: w.creditsBalance, conso30: Number(a?.conso30 ?? 0), aConsomme: Number(a?.debits ?? 0) > 0,
      derniereActivite: date(a?.derniere ?? null), ticketsSansReponse: sansReponse.get(w.id) ?? 0,
      profil: onb.profile ? (PROFIL[onb.profile] ?? onb.profile) : null,
    };
  });
}

/** Les dates de résiliation · un événement Stripe `customer.subscription.deleted` chacune. */
export async function chargerResiliations(maintenant: Date, mois = 12): Promise<Date[]> {
  if (!db) return [];
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - (mois - 1), 1);
  const rows = await db.select({ le: schema.stripeEvents.createdAt }).from(schema.stripeEvents)
    .where(and(eq(schema.stripeEvents.type, 'customer.subscription.deleted'), gte(schema.stripeEvents.createdAt, debut)));
  return rows.map((r) => r.le as Date);
}

export const resiliationsSur30j = (dates: readonly Date[], maintenant: Date) =>
  dates.filter((d) => d.getTime() > maintenant.getTime() - 30 * JOUR).length;

/** Le bandeau Admin+ · nombre RÉEL de comptes payants, lu à l'instant. */
export function bandeau(espaces: readonly EspacePlateforme[], tarifs: TarifsPlateforme): BandeauAdmin {
  return { payants: mrrPlateforme(espaces, tarifs).payants, actualise: 'à l’instant' };
}

/** Le bandeau seul, pour un écran qui ne charge pas les espaces · un comptage léger. */
export async function bandeauSeul(): Promise<BandeauAdmin> {
  const maintenant = new Date();
  const [tarifs, espaces] = await Promise.all([chargerTarifs(), chargerEspaces(maintenant, [])]);
  return bandeau(espaces, tarifs);
}

/** La dépense IA réelle sur 30 jours, par fournisseur et par modèle (`ai_spend`). */
export async function chargerDepenseParFournisseur(maintenant: Date): Promise<{
  fournisseurs: Array<{ fournisseur: string; usd: number; appels: number }>;
  modeles: Array<{ fournisseur: string; modele: string; usd: number; appels: number; poste: string | null }>;
}> {
  if (!db) return { fournisseurs: [], modeles: [] };
  const S = schema.aiSpend;
  const depuis = new Date(maintenant.getTime() - 30 * JOUR);
  const [f, m, postes] = await Promise.all([
    db.select({ fournisseur: S.provider, usd: sql<number>`coalesce(sum(${S.actualUsd}), 0)`, appels: count() }).from(S).where(gte(S.createdAt, depuis)).groupBy(S.provider),
    db.select({ fournisseur: S.provider, modele: S.model, usd: sql<number>`coalesce(sum(${S.actualUsd}), 0)`, appels: count() }).from(S).where(gte(S.createdAt, depuis)).groupBy(S.provider, S.model),
    db.select({ modele: S.model, action: S.action, n: count() }).from(S).where(gte(S.createdAt, depuis)).groupBy(S.model, S.action),
  ]);
  const posteDe = new Map<string, { action: string; n: number }>();
  for (const p of postes) {
    const k = p.modele ?? '';
    const n = Number(p.n);
    if (!posteDe.has(k) || posteDe.get(k)!.n < n) posteDe.set(k, { action: p.action, n });
  }
  return {
    fournisseurs: f.map((r) => ({ fournisseur: r.fournisseur, usd: Number(r.usd), appels: Number(r.appels) })),
    modeles: m.map((r) => ({ fournisseur: r.fournisseur, modele: r.modele ?? 'Modèle non renseigné', usd: Number(r.usd), appels: Number(r.appels), poste: posteDe.get(r.modele ?? '')?.action ?? null })),
  };
}

/** Les recharges de crédits payées (Stripe) sur 30 jours · une ligne au grand livre chacune. */
export async function chargerRecharges(maintenant: Date): Promise<Array<{ ws: string; credits: number; le: Date }>> {
  if (!db) return [];
  const L = schema.creditLedger;
  const rows = await db.select({ ws: L.workspaceId, credits: L.delta, le: L.createdAt }).from(L)
    .where(and(eq(L.reason, 'Recharge de crédits (Stripe)'), gte(L.createdAt, new Date(maintenant.getTime() - 30 * JOUR)), sql`${L.delta} > 0`));
  return rows.map((r) => ({ ws: r.ws, credits: r.credits, le: r.le as Date }));
}



/**
 * Les déclarations d'onboarding des espaces les plus récents · la MÊME lecture
 * que l'ancienne page `/admin/signups` (60 derniers espaces, colonne
 * `onboarding`, et l'e-mail du premier membre trouvé pour chaque espace).
 */
export async function chargerDeclarations(limite: number): Promise<Array<{
  id: string; nom: string; forfait: string; onboarding: unknown; creeLe: Date; onboardeLe: Date | null; proprietaire: string | null;
}>> {
  if (!db) return [];
  const W = schema.workspaces;
  const rows = await db.select({ id: W.id, nom: W.name, forfait: W.plan, onboarding: W.onboarding, onboardeLe: W.onboardedAt, creeLe: W.createdAt })
    .from(W).orderBy(desc(W.createdAt)).limit(limite);
  const ids = rows.map((r) => r.id);
  const membres = ids.length ? await db.select({ ws: schema.workspaceMembers.workspaceId, email: schema.users.email })
    .from(schema.workspaceMembers)
    .leftJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
    .where(inArray(schema.workspaceMembers.workspaceId, ids)) : [];
  const parEspace = new Map<string, string>();
  for (const m of membres) if (m.ws && m.email && !parEspace.has(m.ws)) parEspace.set(m.ws, m.email);
  return rows.map((r) => ({
    id: r.id, nom: r.nom, forfait: r.forfait, onboarding: r.onboarding,
    creeLe: r.creeLe as Date, onboardeLe: date(r.onboardeLe), proprietaire: parEspace.get(r.id) ?? null,
  }));
}
