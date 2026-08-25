import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, count, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, ROLE_LABEL, PLAN_LABEL, type Role, type Plan } from '../../../lib/rbac';
import { ADMIN_THEME } from '../../../lib/theme';
import { isFounder } from '../../../lib/founder';
import { computePlatformMetrics } from '../../../lib/platform-metrics';
import { getPlanConfig } from '../../../lib/settings';
import { updatePlanConfigAction } from '../../actions/platform';
import { input, Msg } from '../../../components/ui';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

const roleColor: Record<Role, string> = { owner: '#fe2c55', admin: '#7aa2ff', member: '#18cc8c', client_viewer: '#f5a623' };
const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Ouvert', color: '#f5a623' }, in_progress: { label: 'En cours', color: '#7aa2ff' }, resolved: { label: 'Résolu', color: '#18cc8c' },
};
const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];
const eur = (n: number) => n.toLocaleString('fr-FR') + ' €';
async function c(q: Promise<{ n: number }[]>): Promise<number> { try { return (await q)[0]?.n ?? 0; } catch { return 0; } }

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { ok, e } = await searchParams;

  const founder = isFounder(s.user.email);
  const planCfg = await getPlanConfig();
  const PLAN_PRICE = planCfg.prices;
  const metrics = founder ? await computePlatformMetrics(planCfg.prices) : null;

  const ws = s.workspaceId;
  let members = 0, saved = 0, follows = 0, ticketsTotal = 0, ticketsOpen = 0, brands = 0, creditsBalance = 0;
  let recent: Array<typeof schema.tickets.$inferSelect> = [];
  let roster: Array<{ userId: string; name: string | null; email: string; role: Role; joinedAt: Date }> = [];
  let ticketsByUser: Record<string, number> = {};

  if (db) {
    [members, saved, follows, ticketsTotal, ticketsOpen, brands] = await Promise.all([
      c(db.select({ n: count() }).from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, ws))),
      c(db.select({ n: count() }).from(schema.savedAds).where(eq(schema.savedAds.workspaceId, ws))),
      c(db.select({ n: count() }).from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, ws))),
      c(db.select({ n: count() }).from(schema.tickets).where(eq(schema.tickets.workspaceId, ws))),
      c(db.select({ n: count() }).from(schema.tickets).where(and(eq(schema.tickets.workspaceId, ws), eq(schema.tickets.status, 'open')))),
      c(db.select({ n: count() }).from(schema.brands).where(eq(schema.brands.workspaceId, ws))),
    ]);
    const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws)).limit(1);
    creditsBalance = w?.creditsBalance ?? 0;
    recent = await db.select().from(schema.tickets).where(eq(schema.tickets.workspaceId, ws)).orderBy(desc(schema.tickets.createdAt)).limit(6);
    roster = (await db.select({ userId: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.workspaceMembers.role, joinedAt: schema.users.createdAt })
      .from(schema.workspaceMembers).innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(eq(schema.workspaceMembers.workspaceId, ws))) as typeof roster;
    try {
      const tc = await db.select({ uid: schema.tickets.userId, n: count() }).from(schema.tickets)
        .where(eq(schema.tickets.workspaceId, ws)).groupBy(schema.tickets.userId);
      ticketsByUser = Object.fromEntries(tc.filter((r) => r.uid).map((r) => [r.uid as string, Number(r.n)]));
    } catch { /* ignore */ }
  }

  // Répartition des accès par rôle (équipes / admins / clients).
  const ROLE_GROUPS: Array<{ role: Role; label: string }> = [
    { role: 'owner', label: 'Propriétaire' }, { role: 'admin', label: 'Administrateurs' },
    { role: 'member', label: 'Membres' }, { role: 'client_viewer', label: 'Clients (lecture)' },
  ];
  const now = Date.now();

  return (
    <main style={{ ...ADMIN_THEME, padding: '30px 36px 60px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>ADMIN+</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>CONSOLE</span>
        {founder && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#fe2c55', background: 'rgba(254,44,85,.12)' }}>FONDATEUR</span>}
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Réservé au fondateur et aux administrateurs. {founder ? 'Vue plateforme complète : revenus, activité, tickets, données.' : <>Pilotage de <b>{s.workspaceName}</b>.</>}
      </p>
      <PageInfo title="console ADMIN+">
        Interface d'administration. Les <b>administrateurs</b> pilotent leur espace (équipe, tickets, crédits).
        La <b>vue plateforme</b> (MRR, churn, tous les espaces) est réservée au <b>fondateur</b> pour ne jamais
        exposer les données d'un client à un autre.
      </PageInfo>

      {ok === 'config' && <Msg kind="ok">Tarifs et allocations mis à jour.</Msg>}
      {e === 'forbidden' && <Msg kind="err">Action réservée au fondateur.</Msg>}

      {/* ============ VUE PLATEFORME (fondateur) ============ */}
      {founder && metrics && (
        <section style={{ marginBottom: 34 }}>
          <h2 style={sectionH}>Vue plateforme</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Kpi label="MRR" value={eur(metrics.mrr)} accent hint={`ARR ${eur(metrics.arr)}`} />
            <Kpi label="ARPA" value={eur(metrics.arpa)} hint={`${metrics.paying} payants`} />
            <Kpi label="Espaces" value={String(metrics.workspaces)} hint={`+${metrics.new30} sur 30 j`} />
            <Kpi label="Utilisateurs" value={String(metrics.usersTotal)} hint={`${metrics.brandsTotal} marques`} />
            <Kpi label="Actifs 30 j" value={String(metrics.active30)} hint={`sur ${metrics.workspaces}`} />
            <Kpi label="Risque de churn" value={metrics.churnRiskPct + ' %'} danger={metrics.churnRiskPct >= 30} hint={`${metrics.atRisk} inactifs 30 j`} />
            <Kpi label="Crédits conso. 30 j" value={metrics.creditsConsumed30.toLocaleString('fr-FR')} hint={`${metrics.creditsConsumedAll.toLocaleString('fr-FR')} au total`} />
            <Kpi label="Générations IA" value={metrics.generationsTotal.toLocaleString('fr-FR')} hint={`${metrics.ticketsOpen} tickets ouverts`} />
          </div>

          {/* Répartition par plan */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: 18, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Répartition par abonnement</h3>
            {PLANS.map((p) => {
              const nb = metrics.byPlan[p]; const pct = metrics.workspaces ? (nb / metrics.workspaces) * 100 : 0;
              return (
                <div key={p} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 }}>
                    <span>{PLAN_LABEL[p]} <span style={{ color: 'var(--muted)' }}>· {eur(PLAN_PRICE[p])}/mois</span></span>
                    <span>{nb} · {eur(nb * PLAN_PRICE[p])}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: 'var(--grad-accent)' }} /></div>
                </div>
              );
            })}
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>Tarifs indicatifs (paramétrables). MRR/churn réels dès l'intégration de la facturation.</p>
          </div>

          {/* Table des espaces */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)', flex: 1 }}>Tous les espaces ({metrics.rows.length})</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <th style={th}>Espace</th><th style={th}>Plan</th><th style={th}>Membres</th><th style={th}>Crédits</th><th style={th}>Activité</th><th style={th}>Créé</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.rows.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{r.name}</td>
                      <td style={td}>{PLAN_LABEL[r.plan]}</td>
                      <td style={td}>{r.members}</td>
                      <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{r.credits.toLocaleString('fr-FR')}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: r.active30 ? '#18cc8c' : '#f5a623' }}>{r.active30 ? 'Actif' : 'Inactif 30 j'}</span></td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{new Date(r.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tarifs & allocations · éditables par le fondateur */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: 18, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Tarifs &amp; allocations par plan</h3>
            <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--muted)' }}>Modifiable ici. Le MRR et la répartition se recalculent sur ces valeurs.</p>
            <form action={updatePlanConfigAction}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      <th style={th}>Plan</th><th style={th}>Tarif €/mois</th><th style={th}>Crédits /mois</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PLANS.map((p) => (
                      <tr key={p} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{PLAN_LABEL[p]}</td>
                        <td style={td}><input name={`price_${p}`} defaultValue={planCfg.prices[p]} inputMode="numeric" style={{ ...input, width: 120, padding: '8px 10px' }} /></td>
                        <td style={td}><input name={`credits_${p}`} defaultValue={planCfg.credits[p]} inputMode="numeric" style={{ ...input, width: 140, padding: '8px 10px' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 14 }}>
                <button type="submit" style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Enregistrer les tarifs</button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* ============ VUE ESPACE (tous admins) ============ */}
      <section>
        <h2 style={sectionH}>{founder ? `Ton espace · ${s.workspaceName}` : "Vue d'ensemble"}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Kpi label="Membres" value={String(members)} />
          <Kpi label="Marques" value={String(brands)} />
          <Kpi label="Créas sauvées" value={String(saved)} />
          <Kpi label="Marques suivies" value={String(follows)} />
          <Kpi label="Tickets ouverts" value={`${ticketsOpen} / ${ticketsTotal}`} />
          <Kpi label="Crédits restants" value={creditsBalance.toLocaleString('fr-FR')} />
        </div>

        {/* Gestion rapide */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <ManageCard href="/credits" title="Gestion des crédits" desc="Barème, allocations, recharge, historique." />
          <ManageCard href="/support" title="Gestion des tickets" desc={`${ticketsOpen} ouvert(s) · réponses & statuts.`} />
          <ManageCard href="/team" title="Équipe & rôles" desc="Inviter, changer les rôles, retirer." />
          <ManageCard href="/settings" title="Réglages & intégrations" desc="Clés serveur, abonnement, espace." />
        </div>

        {/* ============ ÉQUIPES & ACCÈS ============ */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Équipes & accès <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{roster.length}</span></h3>
            <Link href="/team" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none' }}>Gérer les accès →</Link>
          </div>

          {/* Compteurs par rôle */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            {ROLE_GROUPS.map((g) => {
              const n = roster.filter((m) => m.role === g.role).length;
              return (
                <div key={g.role} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleColor[g.role] }} />
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{g.label}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{n}</div>
                </div>
              );
            })}
          </div>

          {/* Table détaillée avec suivi */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <th style={th}>Personne</th><th style={th}>Rôle</th><th style={th}>Inscrit</th><th style={th}>Tickets</th><th style={th}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {[...roster].sort((a, b) => ({ owner: 0, admin: 1, member: 2, client_viewer: 3 } as Record<Role, number>)[a.role] - ({ owner: 0, admin: 1, member: 2, client_viewer: 3 } as Record<Role, number>)[b.role]).map((m) => {
                    const joined = new Date(m.joinedAt);
                    const isNew = now - joined.getTime() < 7 * 864e5;
                    const tk = ticketsByUser[m.userId] ?? 0;
                    return (
                      <tr key={m.email} style={{ borderTop: '1px solid var(--line)' }}>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>{(m.name || m.email).slice(0, 1).toUpperCase()}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{m.name || '(sans nom)'}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{m.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={td}><span style={{ fontSize: 11.5, fontWeight: 800, color: roleColor[m.role] }}>{ROLE_LABEL[m.role]}</span></td>
                        <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{joined.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                        <td style={{ ...td, fontVariantNumeric: 'tabular-nums', color: tk ? 'var(--ink)' : 'var(--muted)' }}>{tk}</td>
                        <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: isNew ? '#7aa2ff' : '#18cc8c' }}>{isNew ? 'Nouveau' : 'Actif'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Derniers tickets</h3>
              <Link href="/support" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', textDecoration: 'none' }}>Support →</Link>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {recent.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun ticket.</p>}
              {recent.map((t) => {
                const st = STATUS[t.status] || STATUS.open!;
                return (
                  <Link key={t.id} href={`/support/${t.id}`} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', background: 'var(--surface)', textDecoration: 'none', display: 'block' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: st.color, background: 'rgba(255,255,255,.06)' }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.authorName || 'Anonyme'} · {new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, hint, accent, danger }: { label: string; value: string; hint?: string; accent?: boolean; danger?: boolean }) {
  return (
    <div style={{ padding: '15px 16px', border: `1px solid ${accent ? 'var(--line-2)' : 'var(--line)'}`, borderRadius: 16, background: accent ? 'linear-gradient(180deg, rgba(245,166,35,.10), var(--surface))' : 'var(--surface)' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: danger ? '#ff6b6b' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function ManageCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} style={{ display: 'block', border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px', textDecoration: 'none' }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3 }}>{desc}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)', marginTop: 10 }}>Ouvrir ›</div>
    </Link>
  );
}

const sectionH = { margin: '0 0 14px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' } as const;
const th = { padding: '9px 16px', fontWeight: 700 } as const;
const td = { padding: '10px 16px' } as const;
