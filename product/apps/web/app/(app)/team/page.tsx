import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { ROLE_LABEL, PLAN_LABEL, type Role } from '../../../lib/rbac';

export const dynamic = 'force-dynamic';

const roleColor: Record<Role, string> = {
  owner: '#fe2c55', admin: '#7aa2ff', member: '#18cc8c', client_viewer: '#f5a623',
};

export default async function TeamPage() {
  const s = await getSession();
  if (!s) redirect('/login');

  let members: Array<{ email: string; name: string | null; role: Role }> = [];
  if (db) {
    const rows = await db
      .select({ email: schema.users.email, name: schema.users.name, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(eq(schema.workspaceMembers.workspaceId, s.workspaceId));
    members = rows as typeof members;
  }

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Équipe & droits</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Espace <b>{s.workspaceName}</b> — chaque membre voit et agit selon son rôle. L'accès aux
        fonctionnalités dépend aussi de l'abonnement.
      </p>

      {/* Abonnement courant */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 26 }}>
        <div style={card}>
          <div style={cardLabel}>Abonnement</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{PLAN_LABEL[s.plan]}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Débloque Inspo, Studio IA… en montant en gamme.</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Ton rôle</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: roleColor[s.role] }}>{ROLE_LABEL[s.role]}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.user.email}</div>
        </div>
        <div style={card}>
          <div style={cardLabel}>Membres</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{members.length}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Invitations : bientôt.</div>
        </div>
      </div>

      {/* Table des membres */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', padding: '11px 16px', background: 'var(--surface)', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
          <span>Membre</span><span>E-mail</span><span>Rôle</span>
        </div>
        {members.map((m) => (
          <div key={m.email} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', padding: '13px 16px', borderTop: '1px solid var(--line)', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{m.name || '—'}</span>
            <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>{m.email}</span>
            <span><span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: roleColor[m.role], background: 'rgba(255,255,255,.06)' }}>{ROLE_LABEL[m.role]}</span></span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
        Rôles : <b>Propriétaire</b> (tout) · <b>Admin</b> (marques, connexions, équipe) ·
        <b> Membre</b> (analyse, tagging, studio) · <b>Client (lecture)</b> (dashboard de sa marque).
      </p>
    </main>
  );
}

const card = { flex: '1 1 200px', padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)' } as const;
const cardLabel = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 6 } as const;
