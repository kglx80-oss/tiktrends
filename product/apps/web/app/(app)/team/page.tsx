import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { ROLE_LABEL, PLAN_LABEL, roleAtLeast, type Role } from '../../../lib/rbac';
import { createInviteAction, revokeInviteAction } from '../../actions/invites';
import { input, btn, btnGhost, panel, Msg } from '../../../components/ui';

export const dynamic = 'force-dynamic';

const roleColor: Record<Role, string> = {
  owner: '#fe2c55', admin: '#7aa2ff', member: '#18cc8c', client_viewer: '#f5a623',
};
const OK: Record<string, string> = { invite: 'Invitation créée — copie le lien ci-dessous.', revoked: 'Invitation révoquée.' };
const ERR: Record<string, string> = {
  forbidden: 'Action réservée aux administrateurs.', email: 'Renseigne un e-mail.',
  role: 'Rôle invalide.', already: 'Cette personne a déjà un compte.', notfound: 'Invitation introuvable.',
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { ok, e } = await searchParams;
  const isAdmin = roleAtLeast(s.role, 'admin');
  const appUrl = process.env.APP_URL || '';

  let members: Array<{ email: string; name: string | null; role: Role }> = [];
  let invites: Array<typeof schema.invites.$inferSelect> = [];
  if (db) {
    members = (await db
      .select({ email: schema.users.email, name: schema.users.name, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(eq(schema.workspaceMembers.workspaceId, s.workspaceId))) as typeof members;
    if (isAdmin) {
      invites = await db.select().from(schema.invites)
        .where(and(eq(schema.invites.workspaceId, s.workspaceId), eq(schema.invites.status, 'pending')));
    }
  }

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Équipe & droits</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Espace <b>{s.workspaceName}</b> — chaque membre voit et agit selon son rôle.
      </p>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      {/* Cartes récap */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 26 }}>
        <div style={card}><div style={cardLabel}>Abonnement</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{PLAN_LABEL[s.plan]}</div></div>
        <div style={card}><div style={cardLabel}>Ton rôle</div><div style={{ fontSize: 20, fontWeight: 800, color: roleColor[s.role] }}>{ROLE_LABEL[s.role]}</div></div>
        <div style={card}><div style={cardLabel}>Membres</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{members.length}</div></div>
      </div>

      {/* Inviter (admin+) */}
      {isAdmin && (
        <div style={panel}>
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Inviter un membre</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 14 }}>
            L'invité reçoit un lien pour définir son mot de passe et rejoindre l'espace avec le rôle choisi.
          </p>
          <form action={createInviteAction} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={lbl}>E-mail</label>
              <input name="email" type="email" required placeholder="collegue@agence.fr" style={input} />
            </div>
            <div style={{ minWidth: 180 }}>
              <label style={lbl}>Rôle</label>
              <select name="role" defaultValue="member" style={{ ...input, width: 'auto', minWidth: 180 }}>
                <option value="admin">Admin</option>
                <option value="member">Membre</option>
                <option value="client_viewer">Client (lecture)</option>
              </select>
            </div>
            <button type="submit" style={btn}>Créer l'invitation</button>
          </form>

          {invites.length > 0 && (
            <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Invitations en attente</div>
              {invites.map((inv) => (
                <div key={inv.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', background: 'var(--bg)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{inv.email}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: roleColor[inv.role as Role], background: 'rgba(255,255,255,.06)' }}>{ROLE_LABEL[inv.role as Role]}</span>
                    <form action={revokeInviteAction} style={{ marginLeft: 'auto' }}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button type="submit" style={btnGhost}>Révoquer</button>
                    </form>
                  </div>
                  <code style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'var(--accent-strong)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                    {appUrl}/invite/{inv.token}
                  </code>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Membres */}
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
const lbl = { fontSize: 13, color: 'var(--ink-2)', display: 'block', marginBottom: 6 } as const;
