import { redirect } from 'next/navigation';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast, PLAN_LABEL, type Plan } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';

export const dynamic = 'force-dynamic';

const PROFILE_LABEL: Record<string, string> = { brand: 'Marque / E-com', agency: 'Agence', freelancer: 'Freelance', ai_artist: 'AI Artist', other: 'Autre' };
const AI_LABEL: Record<string, string> = { starter: 'Débutant', exploring: 'Explore', comfortable: 'À l’aise', advanced: 'Avancé' };
const GOAL_LABEL: Record<string, string> = { ads: 'Pubs', clone: 'Clone', analyze: 'Analytics', scale: 'Échelle', multi: 'Multi-marques', video: 'Vidéo' };

interface Onb { profile?: string; aiLevel?: string; goals?: string[]; brandName?: string; siteUrl?: string }

export default async function SignupsPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/admin');
  if (!db) return null;

  const rows = await db.select({
    id: schema.workspaces.id, name: schema.workspaces.name, plan: schema.workspaces.plan,
    onboarding: schema.workspaces.onboarding, onboardedAt: schema.workspaces.onboardedAt, createdAt: schema.workspaces.createdAt,
  }).from(schema.workspaces).orderBy(desc(schema.workspaces.createdAt)).limit(60);

  // E-mails des propriétaires.
  const ids = rows.map((r) => r.id);
  const owners = ids.length ? await db.select({ ws: schema.workspaceMembers.workspaceId, email: schema.users.email })
    .from(schema.workspaceMembers)
    .leftJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
    .where(inArray(schema.workspaceMembers.workspaceId, ids)) : [];
  const ownerBy = new Map<string, string>();
  for (const o of owners) if (o.ws && o.email && !ownerBy.has(o.ws)) ownerBy.set(o.ws, o.email);

  const fmt = (d: Date | null) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '10px 0 4px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Inscriptions & onboarding</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>FONDATEUR</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 18 }}>
        Chaque nouveau compte et son profil déclaré à l'onboarding · {rows.length} espace(s).
      </p>

      <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead><tr>{['Espace', 'Propriétaire', 'Profil', 'Niveau IA', 'Objectifs', 'Site', 'Plan', 'Inscrit', 'Onboardé'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const o = (r.onboarding ?? {}) as Onb;
              return (
                <tr key={r.id}>
                  <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{r.name}</td>
                  <td style={{ ...td, color: 'var(--ink-2)' }}>{ownerBy.get(r.id) ?? '—'}</td>
                  <td style={td}>{o.profile ? (PROFILE_LABEL[o.profile] ?? o.profile) : '—'}</td>
                  <td style={td}>{o.aiLevel ? (AI_LABEL[o.aiLevel] ?? o.aiLevel) : '—'}</td>
                  <td style={td}>{o.goals?.length ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{o.goals.map((g) => <span key={g} style={chip}>{GOAL_LABEL[g] ?? g}</span>)}</span> : '—'}</td>
                  <td style={td}>{o.siteUrl ? <a href={`https://${o.siteUrl}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-strong)' }}>{o.siteUrl}</a> : '—'}</td>
                  <td style={td}>{PLAN_LABEL[r.plan as Plan] ?? r.plan}</td>
                  <td style={td}>{fmt(r.createdAt as Date)}</td>
                  <td style={td}>{r.onboardedAt ? <span style={{ color: '#7ee8bf' }}>{fmt(r.onboardedAt as Date)}</span> : <span style={{ color: '#ffcf8f' }}>en cours</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const th = { padding: '11px 14px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--line)', textAlign: 'left' } as const;
const td = { padding: '11px 14px', fontSize: 12.5, color: 'var(--ink-2)', borderBottom: '1px solid var(--line)', verticalAlign: 'top' } as const;
const chip = { fontSize: 10.5, fontWeight: 700, color: 'var(--ink-2)', background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 7px' } as const;
