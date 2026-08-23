import { redirect } from 'next/navigation';
import { and, count, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { roleAtLeast, ROLE_LABEL, PLAN_LABEL, type Role } from '../../../lib/rbac';
import { ADMIN_THEME } from '../../../lib/theme';
import { PageInfo } from '../../../components/PageInfo';

export const dynamic = 'force-dynamic';

const roleColor: Record<Role, string> = { owner: '#fe2c55', admin: '#7aa2ff', member: '#18cc8c', client_viewer: '#f5a623' };
const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Ouvert', color: '#f5a623' }, in_progress: { label: 'En cours', color: '#7aa2ff' }, resolved: { label: 'Résolu', color: '#18cc8c' },
};

async function c(q: Promise<{ n: number }[]>): Promise<number> {
  try { const r = await q; return r[0]?.n ?? 0; } catch { return 0; }
}

export default async function ConsolePage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');

  const ws = s.workspaceId;
  let members = 0, saved = 0, follows = 0, ticketsTotal = 0, ticketsOpen = 0, brands = 0, creditsBalance = 0;
  let recent: Array<typeof schema.tickets.$inferSelect> = [];
  let roster: Array<{ name: string | null; email: string; role: Role }> = [];

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
    roster = (await db.select({ name: schema.users.name, email: schema.users.email, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers).innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(eq(schema.workspaceMembers.workspaceId, ws)).limit(8)) as typeof roster;
  }

  const stats: Array<[string, string, string]> = [
    ['Membres', String(members), 'users'],
    ['Marques gérées', String(brands), 'store'],
    ['Créas sauvegardées', String(saved), 'save'],
    ['Marques suivies', String(follows), 'follow'],
    ['Tickets ouverts', `${ticketsOpen} / ${ticketsTotal}`, 'ticket'],
    ['Abonnement', PLAN_LABEL[s.plan], 'plan'],
  ];

  return (
    <main style={{ ...ADMIN_THEME, padding: '30px 36px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Console</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Vue d'ensemble de <b>{s.workspaceName}</b> : activité, équipe et abonnement en un coup d'œil.
      </p>
      <PageInfo title="suivi de l'espace">
        La <b>Console</b> réservée aux administrateurs suit la santé de ton espace : nombre de membres et de
        marques, créas sauvegardées, marques suivies, tickets ouverts et abonnement en cours. Les compteurs
        se mettent à jour en direct depuis ta base. Utilise «&nbsp;Gérer&nbsp;» pour agir sur l'équipe et
        «&nbsp;Support&nbsp;» pour traiter les tickets.
      </PageInfo>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 28 }}>
        {stats.map(([label, value]) => (
          <div key={label} style={{ padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        {/* Équipe */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Équipe</h2>
            <a href="/team" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', textDecoration: 'none' }}>Gérer →</a>
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            {roster.map((m, i) => (
              <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{(m.name || m.email).slice(0, 1).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{m.name || '(sans nom)'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: roleColor[m.role] }}>{ROLE_LABEL[m.role]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Activité récente (tickets) */}
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Derniers tickets</h2>
            <a href="/support" style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', textDecoration: 'none' }}>Support →</a>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recent.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Aucun ticket.</p>}
            {recent.map((t) => {
              const st = STATUS[t.status] || STATUS.open!;
              return (
                <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 13, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: st.color, background: 'rgba(255,255,255,.06)' }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.authorName || 'Anonyme'} · {new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
        Crédits IA restants : <b>{creditsBalance}</b> · Analytics d'usage détaillés : bientôt.
      </p>
    </main>
  );
}
