import 'server-only';
import { redirect } from 'next/navigation';
import { and, asc, count, desc, eq, gte, inArray, isNull, like, notInArray, or, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  ACTIONS_SENSIBLES, ACTION_RAPPROCHEMENT_DEPENSE, ETATS_JOB_TERMINAUX, PREFIXE_AUDIT_PLATEFORME,
  attendReponse, entreesAdminOuvertes, ligneRentabiliteTour, mrrPlateforme, nomEquipePlateforme, rentabiliteForfaits,
  type EvenementAuditLu, type MouvementTache, type TacheLue, type TacheMesurable, type TransitionLue, type EspacePlateforme, type GraviteIncident, type IncidentLu, type LigneRentabiliteTour, type NoteIncident,
  type TarifsPlateforme, type TicketPlateforme, type StatutTicket, type TypeTicket,
} from '@tiktrends/core';
import { fileSupport } from '@tiktrends/core';
import { getSession, type Session } from '../../../../lib/auth';
import { roleAtLeast, PLAN_LABEL, type Plan } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { getPlanConfig } from '../../../../lib/settings';
import type { BandeauAdmin } from '../../../../spatial/vues/admin/base';
import { SOUS_NAV_ADMIN_COMPLETE } from '../../../../spatial/vues/admin/sous-nav';
import { droitsSousNavAdmin } from '../../../../lib/onglets-reglages';

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
  const p = await porteAdminGeste();
  if (!p.ok) redirect(p.vers);
  return p.session;
}

/**
 * La MÊME règle que `porteAdmin`, sans redirection · pour les GESTES du Tour de
 * contrôle (exports, incidents · `app/actions/tour-controle.ts`), qui refusent
 * par un message sans rien lire ni écrire. Une seule règle, deux sorties.
 */
export async function porteAdminGeste(): Promise<{ ok: true; session: Session } | { ok: false; vers: '/login' | '/dashboard' }> {
  const s = await getSession();
  if (!s) return { ok: false, vers: '/login' };
  if (!roleAtLeast(s.role, 'admin')) return { ok: false, vers: '/dashboard' };
  if (!isFounder(s.user.email)) return { ok: false, vers: '/dashboard' };
  return { ok: true, session: s };
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
    statut: T.status, creeLe: T.createdAt, majLe: T.updatedAt, plan: W.plan,
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
  // Support échelonné (29/10, point 6) · dédié, puis prioritaire, puis e-mail ; le plus récent d'abord à rang égal.
  return fileSupport(rows.map((r) => ({
    id: r.id, espaceId: r.ws, espace: r.espace ?? 'Espace supprimé', auteur: r.auteur, type: r.type as TypeTicket, titre: r.titre, corps: r.corps,
    statut: r.statut as StatutTicket, creeLe: r.creeLe as Date, majLe: r.majLe as Date, messages: parTicket.get(r.id) ?? [], plan: r.plan ?? null,
  })));
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

/**
 * Les entrées de la sous-navigation que la session ouvre (SEC-10) · la porte
 * RÉELLE de chaque page (`droitsSousNavAdmin`, `entreesAdminOuvertes`).
 */
export async function navAdmin(): Promise<readonly string[]> {
  const s = await getSession();
  if (!s) return [];
  return entreesAdminOuvertes(SOUS_NAV_ADMIN_COMPLETE, droitsSousNavAdmin(s)).map((i) => i.href);
}

/** Le bandeau Admin+ · nombre RÉEL de comptes payants, lu à l'instant, et la sous-navigation que la session ouvre. */
export function bandeau(espaces: readonly EspacePlateforme[], tarifs: TarifsPlateforme, nav: readonly string[]): BandeauAdmin {
  return { payants: mrrPlateforme(espaces, tarifs).payants, actualise: 'à l’instant', nav };
}

/** Le bandeau seul, pour un écran qui ne charge pas les espaces · un comptage léger. */
export async function bandeauSeul(): Promise<BandeauAdmin> {
  const maintenant = new Date();
  const [tarifs, espaces, nav] = await Promise.all([chargerTarifs(), chargerEspaces(maintenant, []), navAdmin()]);
  return bandeau(espaces, tarifs, nav);
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

/**
 * « Rentabilité par abonnement » (Revenus & MRR) · les lignes de la table · la
 * page ET l'export (`exporterTourAction`) passent par ici.
 */
export function lignesRentabilite(espaces: readonly EspacePlateforme[], tarifs: TarifsPlateforme): LigneRentabiliteTour[] {
  return rentabiliteForfaits(mrrPlateforme(espaces, tarifs).parForfait).map(ligneRentabiliteTour);
}

/** Les incidents lus au plus · les plus récents d'abord. Au-delà, l'écran le dit. */
export const LIMITE_INCIDENTS_DECLARES = 500;

/**
 * Les incidents DÉCLARÉS (`platform_incidents`, 0075), les plus récents
 * d'abord, et le nom affichable de chaque membre de l'équipe cité (ouverture,
 * clôture, notes) · jamais son adresse (`nomEquipePlateforme`). Portée
 * plateforme · à n'appeler qu'APRÈS `porteAdmin` ou `porteAdminGeste`.
 */
export async function chargerIncidentsDeclares(): Promise<{ incidents: IncidentLu[]; nom: (id: string | null) => string; limite: number }> {
  const sansNom = (_id: string | null) => nomEquipePlateforme(null);
  if (!db) return { incidents: [], nom: sansNom, limite: LIMITE_INCIDENTS_DECLARES };
  const I = schema.platformIncidents;
  const rows = await db.select().from(I).orderBy(desc(I.createdAt), desc(I.id)).limit(LIMITE_INCIDENTS_DECLARES);
  const incidents: IncidentLu[] = rows.map((r) => ({
    id: r.id, titre: r.title, gravite: r.severity as GraviteIncident, cause: r.cause, constat: r.description,
    statut: r.status, notes: Array.isArray(r.notes) ? (r.notes as NoteIncident[]) : [],
    ouvertLe: r.createdAt as Date, ouvertPar: r.openedBy, closLe: date(r.closedAt), closPar: r.closedBy, resolution: r.resolution,
  }));
  const ids = [...new Set(incidents.flatMap((i) => [i.ouvertPar, i.closPar, ...i.notes.map((n) => n.auteur)]).filter((x): x is string => !!x))];
  const noms = new Map<string, string>();
  if (ids.length) for (const u of await db.select({ id: schema.users.id, nom: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids))) noms.set(u.id, nomEquipePlateforme(u.nom));
  return { incidents, nom: (id) => (id ? noms.get(id) ?? nomEquipePlateforme(null) : nomEquipePlateforme(null)), limite: LIMITE_INCIDENTS_DECLARES };
}

/* ───────────────────── Suivi opérationnel · tâches et registre d'audit ───────────────────── */

/**
 * Les tâches lues au plus, par famille · les ACTIVES (le worker doit encore
 * agir, bloquées comprises) d'abord, toutes jusqu'à 1 000 · puis les
 * TERMINÉES les plus récentes, 2 000 · une tâche bloquée n'est jamais
 * repoussée hors de l'écran par l'historique. Mesuré le 11/11 (pglite en
 * mémoire, machine partagée chargée, trois passes · `chargerTachesAdmin` puis
 * `tableTachesAdmin`, chaque tâche avec instantané, erreur et deux mouvements
 * de registre) :
 *
 * | tâches en base                         | lecture + classement |
 * | -------------------------------------- | -------------------- |
 * |   500                                  |   60 à 84 ms         |
 * | 2 000                                  |  146 à 175 ms        |
 * | 3 000 (2 000 terminées lues, la borne) |  144 à 175 ms        |
 *
 * Retenu · 2 000 terminées · la page reste sous 0,2 s au banc, et la borne
 * tient le temps quand l'historique grandit · au-delà, l'écran le dit.
 */
export const LIMITE_TACHES_ACTIVES = 1_000;
export const LIMITE_TACHES_TERMINEES = 2_000;

/**
 * Les tâches de génération de TOUTE la plateforme (`studio_jobs`), avec le
 * titre du projet, le nom de l'espace et les mouvements de leur registre de
 * budget (sommés par genre, LUS, jamais recalculés). Portée plateforme · à
 * n'appeler qu'APRÈS `porteAdmin` ou `porteAdminGeste`. Lecture seule.
 */
export async function chargerTachesAdmin(): Promise<{ taches: TacheLue[]; limite: string | null }> {
  if (!db) return { taches: [], limite: null };
  const J = schema.studioJobs, P = schema.studioProjects, W = schema.workspaces, L = schema.studioBudgetLedger;
  const champs = {
    id: J.id, operation: J.operation, etat: J.state, lignes: sql<unknown>`${J.snapshot} -> 'lignes'`,
    projet: P.title, espace: W.name, creeLe: J.createdAt, erreur: J.error,
  };
  const terminaux = [...ETATS_JOB_TERMINAUX];
  const [actives, terminees] = await Promise.all([
    db.select(champs).from(J).leftJoin(P, eq(P.id, J.projectId)).leftJoin(W, eq(W.id, J.workspaceId))
      .where(notInArray(J.state, terminaux)).orderBy(desc(J.createdAt), desc(J.id)).limit(LIMITE_TACHES_ACTIVES),
    db.select(champs).from(J).leftJoin(P, eq(P.id, J.projectId)).leftJoin(W, eq(W.id, J.workspaceId))
      .where(inArray(J.state, terminaux)).orderBy(desc(J.createdAt), desc(J.id)).limit(LIMITE_TACHES_TERMINEES),
  ]);
  const lignes = [...actives, ...terminees];
  const registre = new Map<string, MouvementTache[]>();
  const modeles = new Map<string, string>();
  const ids = lignes.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 500) {
    const lot = ids.slice(i, i + 500);
    const rows = await db.select({ job: L.jobId, kind: L.kind, credits: sql<number>`coalesce(sum(${L.credits}), 0)`, usd: sql<number>`coalesce(sum(${L.usdMicros}), 0)` })
      .from(L).where(inArray(L.jobId, lot)).groupBy(L.jobId, L.kind);
    for (const r of rows) if (r.job) registre.set(r.job, [...(registre.get(r.job) ?? []), { kind: r.kind, credits: Number(r.credits), usdMicros: Number(r.usd) }]);
    // Le modèle · celui du dernier corps envoyé au fournisseur (le seuil « bloquée » de la tâche en dépend).
    for (const m of await lireModelesTaches(lot)) modeles.set(m.job, m.modele);
  }
  const taches: TacheLue[] = lignes
    .sort((a, b) => (b.creeLe as Date).getTime() - (a.creeLe as Date).getTime())
    .map((l) => ({
      id: l.id, operation: l.operation, etat: l.etat, lignes: Array.isArray(l.lignes) ? (l.lignes as Array<{ operation: string; profil?: string }>) : null,
      projet: l.projet, espace: l.espace, creeLe: l.creeLe as Date, erreur: l.erreur, registre: registre.get(l.id) ?? [], modele: modeles.get(l.id) ?? null,
    }));
  const coupe = actives.length >= LIMITE_TACHES_ACTIVES || terminees.length >= LIMITE_TACHES_TERMINEES;
  return { taches, limite: coupe ? `Lecture bornée · les ${LIMITE_TACHES_ACTIVES.toLocaleString('fr-FR')} tâches actives et les ${LIMITE_TACHES_TERMINEES.toLocaleString('fr-FR')} tâches terminées les plus récentes · les plus anciennes ne sont pas lues ici.` : null };
}

/** Le dernier modèle consigné (`job.provider.payload`, `details.modele`) de chaque tâche d'un lot · lecture seule. */
async function lireModelesTaches(lot: readonly string[]): Promise<Array<{ job: string; modele: string }>> {
  if (!db || !lot.length) return [];
  const A = schema.studioAuditEvents;
  const rows = await db.selectDistinctOn([A.targetId], { job: A.targetId, modele: sql<string | null>`${A.details} ->> 'modele'` }).from(A)
    .where(and(eq(A.targetType, 'studio_job'), eq(A.action, 'job.provider.payload'), inArray(A.targetId, [...lot])))
    .orderBy(A.targetId, desc(A.occurredAt));
  return rows.filter((r): r is { job: string; modele: string } => typeof r.modele === 'string' && r.modele.trim() !== '');
}

/**
 * Les tâches TERMINÉES AVEC SUCCÈS lues pour mesurer les durées · les plus
 * récentes d'abord (`finished_at`), avec TOUTES leurs transitions (`job.*` du
 * registre, cible `studio_job`). Mesuré le 12/11 (pglite en mémoire, machine
 * partagée chargée, trois passes · `chargerDureesTaches` puis
 * `mesurerDureesTaches`, chaque tâche avec sept transitions · enqueue,
 * claimed, running, payload, persisting, completed, contrôle qualité) :
 *
 * | tâches terminées en base     | transitions lues | lecture + mesure |
 * | ---------------------------- | ---------------- | ---------------- |
 * |   500                        |   3 500          |   39 à 77 ms     |
 * | 2 000                        |  14 000          |  123 à 167 ms    |
 * | 4 000 (2 000 lues, la borne) |  14 000          |  152 à 165 ms    |
 *
 * (Première passe à 2 000 · 454 à 502 ms · le rang de la borne haute était
 * recalculé en O(n²) par groupe et par phase · une seule passe cumulée
 * depuis.) La lecture des tâches de la table, modèle consigné compris
 * (`lireModelesTaches`), reste à 79 à 104 ms pour 2 000 terminées lues.
 * Retenu · les 2 000 plus récentes · vingt fois l'effectif minimum d'un
 * groupe, la page reste sous 0,2 s au banc, et la fenêtre suit la plateforme
 * d'aujourd'hui (un modèle qui ralentit se voit) · au-delà, l'écran le dit.
 */
export const LIMITE_TACHES_MESUREES = 2_000;

export async function chargerDureesTaches(): Promise<{ taches: TacheMesurable[]; limite: string | null }> {
  if (!db) return { taches: [], limite: null };
  const J = schema.studioJobs, A = schema.studioAuditEvents;
  const lues = await db.select({ id: J.id, etat: J.state, creeLe: J.createdAt, termineLe: J.finishedAt, lignes: sql<unknown>`${J.snapshot} -> 'lignes'` })
    .from(J).where(eq(J.state, 'completed')).orderBy(sql`${J.finishedAt} desc nulls last`, desc(J.id)).limit(LIMITE_TACHES_MESUREES);
  const transitions = new Map<string, TransitionLue[]>();
  for (let i = 0; i < lues.length; i += 500) {
    const lot = lues.slice(i, i + 500).map((l) => l.id);
    const rows = await db.select({ job: A.targetId, action: A.action, le: A.occurredAt, modele: sql<string | null>`${A.details} ->> 'modele'` }).from(A)
      .where(and(eq(A.targetType, 'studio_job'), like(A.action, 'job.%'), inArray(A.targetId, lot)));
    for (const r of rows) {
      const t: TransitionLue = { action: r.action, le: r.le as Date, modele: r.modele };
      const l = transitions.get(r.job);
      if (l) l.push(t); else transitions.set(r.job, [t]);
    }
  }
  const taches: TacheMesurable[] = lues.map((l) => ({
    id: l.id, etat: l.etat, creeLe: l.creeLe as Date, termineLe: (l.termineLe as Date | null) ?? null,
    lignes: Array.isArray(l.lignes) ? (l.lignes as Array<{ operation?: unknown; profil?: unknown }>) : null,
    transitions: transitions.get(l.id) ?? [],
  }));
  return {
    taches,
    limite: lues.length >= LIMITE_TACHES_MESUREES ? `Mesure bornée · les ${LIMITE_TACHES_MESUREES.toLocaleString('fr-FR')} tâches terminées les plus récentes · les plus anciennes ne sont pas mesurées.` : null,
  };
}

/** Une tâche seule, par son identifiant · pour pré-remplir un incident (`/admin/incidents?tache=`). Après la porte. */
export async function chargerTacheAdmin(id: string): Promise<TacheLue | null> {
  if (!db || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const J = schema.studioJobs, P = schema.studioProjects, W = schema.workspaces, L = schema.studioBudgetLedger;
  const [l] = await db.select({
    id: J.id, operation: J.operation, etat: J.state, lignes: sql<unknown>`${J.snapshot} -> 'lignes'`, projet: P.title, espace: W.name, creeLe: J.createdAt, erreur: J.error,
  }).from(J).leftJoin(P, eq(P.id, J.projectId)).leftJoin(W, eq(W.id, J.workspaceId)).where(eq(J.id, id)).limit(1);
  if (!l) return null;
  const rows = await db.select({ kind: L.kind, credits: sql<number>`coalesce(sum(${L.credits}), 0)`, usd: sql<number>`coalesce(sum(${L.usdMicros}), 0)` })
    .from(L).where(eq(L.jobId, id)).groupBy(L.kind);
  return {
    id: l.id, operation: l.operation, etat: l.etat, lignes: Array.isArray(l.lignes) ? (l.lignes as Array<{ operation: string }>) : null,
    projet: l.projet, espace: l.espace, creeLe: l.creeLe as Date, erreur: l.erreur,
    registre: rows.map((r) => ({ kind: r.kind, credits: Number(r.credits), usdMicros: Number(r.usd) })),
  };
}

/**
 * Les événements du registre lus au plus, par source · les plus récents
 * d'abord. Le registre ne lit que sa portée (gestes sans espace, `studios.*`,
 * actions sensibles) · le bruit des espaces n'y entre pas. Mesuré le 11/11
 * (même banc) · 500 événements · 18 à 22 ms, 2 000 · 65 à 68 ms (lecture et
 * table). Retenu · 2 000 par source · au-delà, l'écran le dit.
 */
export const LIMITE_REGISTRE_AUDIT = 2_000;

/**
 * Le registre d'audit de la plateforme · `studio_audit_events` dans la portée
 * de `dansRegistrePlateforme` (la MÊME règle, ici en SQL), et les
 * rapprochements de dépense (`ai_spend_reconciliations`, leur propre audit).
 * Le nom de l'acteur, jamais son adresse. Après la porte · lecture seule.
 */
export async function chargerRegistreAudit(): Promise<{ evenements: EvenementAuditLu[]; limite: string | null }> {
  if (!db) return { evenements: [], limite: null };
  const A = schema.studioAuditEvents, U = schema.users, W = schema.workspaces, R = schema.aiSpendReconciliations;
  const [audit, rapprochements] = await Promise.all([
    db.select({
      id: A.id, le: A.occurredAt, nom: U.name, role: A.effectiveRole, action: A.action, cibleType: A.targetType, cibleId: A.targetId,
      espaceId: A.workspaceId, espace: W.name, motif: A.reason, details: A.details,
    }).from(A).leftJoin(U, eq(U.id, A.actorId)).leftJoin(W, eq(W.id, A.workspaceId))
      .where(or(isNull(A.workspaceId), like(A.action, `${PREFIXE_AUDIT_PLATEFORME}%`), inArray(A.action, [...ACTIONS_SENSIBLES])))
      .orderBy(desc(A.occurredAt), desc(A.id)).limit(LIMITE_REGISTRE_AUDIT),
    db.select({
      id: R.id, le: R.createdAt, nom: U.name, ligne: R.aiSpendId, reserve: R.reservedMicros, facture: R.billedMicros, devise: R.currency, preuve: R.providerRef, motif: R.reason,
    }).from(R).leftJoin(U, eq(U.id, R.authorId)).orderBy(desc(R.createdAt), desc(R.id)).limit(LIMITE_REGISTRE_AUDIT),
  ]);
  const evenements: EvenementAuditLu[] = [
    ...audit.map((a) => ({ id: a.id, le: a.le as Date, acteurNom: a.nom, role: a.role, action: a.action, cibleType: a.cibleType, cibleId: a.cibleId, espaceId: a.espaceId, espace: a.espace, motif: a.motif, details: a.details })),
    ...rapprochements.map((r) => ({
      id: r.id, le: r.le as Date, acteurNom: r.nom, role: 'fondateur', action: ACTION_RAPPROCHEMENT_DEPENSE, cibleType: 'ai_spend', cibleId: r.ligne,
      espaceId: null, espace: null, motif: r.motif,
      details: { reserveMicros: Number(r.reserve), factureMicros: Number(r.facture), devise: r.devise, preuve: r.preuve },
    })),
  ];
  const coupe = audit.length >= LIMITE_REGISTRE_AUDIT || rapprochements.length >= LIMITE_REGISTRE_AUDIT;
  return { evenements, limite: coupe ? `Lecture bornée · les ${LIMITE_REGISTRE_AUDIT.toLocaleString('fr-FR')} événements les plus récents de chaque source · les plus anciens ne sont pas lus ici.` : null };
}
