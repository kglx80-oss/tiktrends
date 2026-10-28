import { and, count, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { VALEUR_ABSENTE, adminDateCourte, adminEuros, adminNombre, diagnosticDeploiementAdmin, etatEssaiAdmin } from '@tiktrends/core';
import { ROLE_LABEL, PLAN_LABEL, type Plan, type Role } from '../../../../lib/rbac';
import { computePlatformMetrics } from '../../../../lib/platform-metrics';
import { getPlanConfig } from '../../../../lib/settings';
import { currentDeployment } from '../../../../lib/deployment';
import { trialStatus, TRIAL_DEFAULT_CREDITS, TRIAL_DEFAULT_DAYS } from '../../../../lib/trial';
import { Console } from '../../../../spatial/vues/admin/Console';
import { bandeauSeul, porteAdmin } from '../admin/donnees';

export const dynamic = 'force-dynamic';

const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
const ORDRE_ROLE: Record<Role, number> = { owner: 0, admin: 1, member: 2, client_viewer: 3 };
const GROUPES: ReadonlyArray<{ role: Role; libelle: string }> = [
  { role: 'owner', libelle: 'Propriétaire' }, { role: 'admin', libelle: 'Administrateurs' }, { role: 'member', libelle: 'Membres' }, { role: 'client_viewer', libelle: 'Clients (lecture)' },
];
const STATUT_TICKET: Record<string, string> = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu' };
const MESSAGES: Record<string, { ok: boolean; texte: string }> = {
  config: { ok: true, texte: 'Tarifs et allocations mis à jour.' }, testpack: { ok: true, texte: 'Crédits de test accordés.' }, revoked: { ok: true, texte: 'Période de test terminée.' },
  forbidden: { ok: false, texte: 'Action réservée au fondateur.' }, badinput: { ok: false, texte: 'Saisie invalide · rien n’a été modifié.' },
};

async function c(q: Promise<{ n: number }[]>): Promise<number> { try { return Number((await q)[0]?.n ?? 0); } catch { return 0; } }

/**
 * « Console » · porte de l'ancienne `/console` (`porteAdmin` · admin de
 * l'espace ET fondateur), AVANT toute lecture. Les gestes passent par leurs
 * actions existantes (`updatePlanConfigAction`, `grantTestPackAction`,
 * `revokeTrialAction`), qui reposent la garde et redirigent ici (`?ok=` / `?e=`).
 */
export default async function ConsoleSpatial({ searchParams }: { searchParams?: Promise<{ ok?: string; e?: string }> }) {
  const s = await porteAdmin();
  const { ok, e } = (await searchParams) ?? {};
  const [b, deploiement, cfg] = await Promise.all([bandeauSeul(), currentDeployment(), getPlanConfig()]);
  const metrics = await computePlatformMetrics(cfg.prices);
  const ws = s.workspaceId;
  const T = schema.tickets;
  const [membres, marques, sauvees, suivies, ticketsTotal, ticketsOuverts, espace, recents, roster, parAuteur, essais] = db ? await Promise.all([
    c(db.select({ n: count() }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, ws))),
    c(db.select({ n: count() }).from(schema.brands).where(eq(schema.brands.workspaceId, ws))),
    c(db.select({ n: count() }).from(schema.savedAds).where(eq(schema.savedAds.workspaceId, ws))),
    c(db.select({ n: count() }).from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, ws))),
    c(db.select({ n: count() }).from(T).where(eq(T.workspaceId, ws))),
    c(db.select({ n: count() }).from(T).where(and(eq(T.workspaceId, ws), eq(T.status, 'open')))),
    db.select({ credits: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ws)).limit(1),
    db.select().from(T).where(eq(T.workspaceId, ws)).orderBy(desc(T.createdAt)).limit(6),
    db.select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.workspaceMembers.role, joinedAt: schema.users.createdAt })
      .from(schema.workspaceMembers).innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId)).where(eq(schema.workspaceMembers.workspaceId, ws)),
    db.select({ uid: T.userId, n: count() }).from(T).where(eq(T.workspaceId, ws)).groupBy(T.userId).catch(() => []),
    db.select({ id: schema.workspaces.id, name: schema.workspaces.name, plan: schema.workspaces.plan, creditsBalance: schema.workspaces.creditsBalance, accountKind: schema.workspaces.accountKind, trialEndsAt: schema.workspaces.trialEndsAt })
      .from(schema.workspaces).orderBy(desc(schema.workspaces.createdAt)).limit(60),
  ]) : [0, 0, 0, 0, 0, 0, [], [], [], [], []] as const;
  const ticketsDe = new Map(parAuteur.filter((r) => r.uid).map((r) => [r.uid as string, Number(r.n)]));
  const maintenant = Date.now();
  const eur = (n: number) => adminEuros(n);

  return (
    <Console
      bandeau={b}
      message={(ok && MESSAGES[ok]) || (e && MESSAGES[e]) || null}
      deploiement={diagnosticDeploiementAdmin(deploiement, process.env.BUILD_TIME ?? null, VALEUR_ABSENTE)}
      plateforme={{
        kpis: [
          { lbl: 'MRR', v: eur(metrics.mrr), s: `ARR ${eur(metrics.arr)}` },
          { lbl: 'ARPA', v: eur(metrics.arpa), s: `${metrics.paying} payants` },
          { lbl: 'Espaces', v: adminNombre(metrics.workspaces), s: `+${metrics.new30} sur 30 j` },
          { lbl: 'Utilisateurs', v: adminNombre(metrics.usersTotal), s: `${metrics.brandsTotal} marques` },
          { lbl: 'Actifs 30 j', v: adminNombre(metrics.active30), s: `sur ${metrics.workspaces}` },
          { lbl: 'Risque de churn', v: `${metrics.churnRiskPct} %`, c: metrics.churnRiskPct >= 30 ? 'dn' : '', d: `${metrics.atRisk} inactifs 30 j` },
          { lbl: 'Crédits conso. 30 j', v: adminNombre(metrics.creditsConsumed30), s: `${adminNombre(metrics.creditsConsumedAll)} au total` },
          { lbl: 'Générations IA', v: adminNombre(metrics.generationsTotal), s: `${metrics.ticketsOpen} tickets ouverts` },
        ],
        repartition: PLANS.map((p) => ({ libelle: PLAN_LABEL[p], prix: eur(cfg.prices[p]), n: metrics.byPlan[p], part: metrics.workspaces ? (metrics.byPlan[p] / metrics.workspaces) * 100 : 0, mrr: eur(metrics.byPlan[p] * cfg.prices[p]) })),
        espaces: metrics.rows.map((r) => ({ id: r.id, nom: r.name, formule: PLAN_LABEL[r.plan], membres: r.members, credits: adminNombre(r.credits), actif: r.active30, creeLe: adminDateCourte(new Date(r.createdAt)) })),
        tarifs: PLANS.map((p) => ({ cle: p, libelle: PLAN_LABEL[p], prix: cfg.prices[p], credits: cfg.credits[p] })),
      }}
      essais={{
        espaces: essais.map((r) => ({ id: r.id, nom: r.name })), creditsDefaut: TRIAL_DEFAULT_CREDITS, joursDefaut: TRIAL_DEFAULT_DAYS,
        lignes: essais.map((r) => {
          const t = trialStatus(r);
          const x = etatEssaiAdmin(t);
          return { id: r.id, nom: r.name, type: r.accountKind === 'normal' ? VALEUR_ABSENTE : r.accountKind, formule: PLAN_LABEL[r.plan as Plan] ?? r.plan, credits: adminNombre(r.creditsBalance), essai: { texte: x.texte, c: x.classe }, coupable: t.isTrial && !t.expired };
        }),
      }}
      espace={{
        nom: s.workspaceName,
        kpis: [
          { lbl: 'Membres', v: adminNombre(membres) }, { lbl: 'Marques', v: adminNombre(marques) }, { lbl: 'Créas sauvées', v: adminNombre(sauvees) },
          { lbl: 'Marques suivies', v: adminNombre(suivies) }, { lbl: 'Tickets ouverts', v: `${ticketsOuverts} / ${ticketsTotal}` }, { lbl: 'Crédits restants', v: adminNombre(espace[0]?.credits ?? 0) },
        ],
        roles: GROUPES.map((g) => ({ libelle: g.libelle, n: roster.filter((m) => m.role === g.role).length })),
        membres: [...roster].sort((a, z) => ORDRE_ROLE[a.role as Role] - ORDRE_ROLE[z.role as Role]).map((m) => ({
          email: m.email, nom: m.name || '(sans nom)', role: ROLE_LABEL[m.role as Role], inscrit: adminDateCourte(m.joinedAt as Date),
          tickets: ticketsDe.get(m.userId) ?? 0, nouveau: maintenant - new Date(m.joinedAt as Date).getTime() < 7 * 86_400_000,
        })),
        tickets: recents.map((t) => ({ id: t.id, titre: t.title, statut: STATUT_TICKET[t.status] ?? t.status, auteur: t.authorName || 'Anonyme', le: adminDateCourte(t.createdAt as Date) })),
      }}
    />
  );
}
