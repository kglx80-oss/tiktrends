import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { ROLE_LABEL, PLAN_LABEL, roleAtLeast, type Role } from '../../../lib/rbac';
import { revokeInviteAction } from '../../actions/invites';
import { btnGhost, panel, Msg, cadrePage, h1 } from '../../../components/ui';
import { ADMIN_THEME } from '../../../lib/theme';
import { PageInfo } from '../../../components/PageInfo';
import { InviteMemberButton } from '../../../components/InviteMemberButton';
import { CopierTexte } from '../../../components/CopierTexte';
import { appUrl } from '../../../lib/mailer';
import { etatInvitation } from '@tiktrends/core';

export const dynamic = 'force-dynamic';

const roleColor: Record<Role, string> = {
  owner: '#fe2c55', admin: '#7aa2ff', member: '#18cc8c', client_viewer: '#f5a623',
};
const OK: Record<string, string> = {
  invite: 'Invitation créée · aucun e-mail n’est parti (envoi non configuré) · copie le lien ci-dessous pour l’envoyer.',
  invite_mail: 'Invitation créée · l’e-mail est parti, le lien reste aussi ci-dessous.',
  revoked: 'Invitation révoquée.',
};
const ERR: Record<string, string> = {
  forbidden: 'Action réservée aux administrateurs.', email: 'Renseigne un e-mail.',
  role: 'Rôle invalide.', already: 'Cette personne a déjà un compte.', notfound: 'Invitation introuvable.',
  bad: 'Demande incomplète · réessaie depuis la liste.',
};

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  // Réservé aux propriétaires et admins de l'espace (autorisation Kevin, lot 9).
  // La garde passe AVANT toute lecture · un membre ou un client en lecture qui
  // tape l'URL ne reçoit ni les e-mails des membres, ni les liens d'invitation.
  // Même règle que l'entrée « Membres » du menu (`minRole: 'admin'`, rbac.ts).
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  const { ok, e } = await searchParams;
  // Le même lien que l'e-mail (`appUrl` du mailer) · l'écran montrait un chemin
  // relatif inutilisable hors de l'app quand APP_URL manquait (recette #106).
  const lienBase = appUrl();
  const maintenant = new Date();

  let members: Array<{ email: string; name: string | null; role: Role }> = [];
  let invites: Array<typeof schema.invites.$inferSelect> = [];
  if (db) {
    members = (await db
      .select({ email: schema.users.email, name: schema.users.name, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
      .where(eq(schema.workspaceMembers.workspaceId, s.workspaceId))) as typeof members;
    invites = await db.select().from(schema.invites)
      .where(and(eq(schema.invites.workspaceId, s.workspaceId), eq(schema.invites.status, 'pending')));
  }

  return (
    <main style={{ ...ADMIN_THEME, ...cadrePage }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={h1}>Équipe & droits</h1>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ESPACE ADMIN</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Espace <b>{s.workspaceName}</b>, chaque membre voit et agit selon son rôle.
      </p>

      <PageInfo title="équipe & invitations">
        Invite des membres avec un <b>rôle</b> (Admin, Membre, Client lecture) : un lien leur permet de définir leur
        mot de passe et de rejoindre l'espace. Il part par e-mail quand l'envoi est configuré, sinon copie-le depuis la liste. Chaque rôle donne accès à un sous-ensemble du
        produit. Tu peux révoquer une invitation tant qu'elle n'a pas été acceptée.
      </PageInfo>

      {ok && OK[ok] && <Msg kind="ok">{OK[ok]}</Msg>}
      {e && ERR[e] && <Msg kind="err">{ERR[e]}</Msg>}

      {/* Cartes récap */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 26 }}>
        <div style={card}><div style={cardLabel}>Abonnement</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{PLAN_LABEL[s.plan]}</div></div>
        <div style={card}><div style={cardLabel}>Ton rôle</div><div style={{ fontSize: 20, fontWeight: 800, color: roleColor[s.role] }}>{ROLE_LABEL[s.role]}</div></div>
        <div style={card}><div style={cardLabel}>Membres</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{members.length}</div></div>
      </div>

      {/* Inviter (admin+) · en pop-up */}
      <div style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Inviter un membre</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Un lien permet à l'invité de rejoindre l'espace avec le rôle choisi · par e-mail si l'envoi est configuré, sinon à copier.
            </p>
          </div>
          <InviteMemberButton />
        </div>

        {invites.length > 0 && (
          <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Invitations en attente</div>
            {invites.map((inv) => {
              // Expirée · le lien ne mène plus nulle part (l'acceptation la refuse).
              const expiree = etatInvitation(inv.expiresAt as Date | null, maintenant) === 'expiree';
              const lien = `${lienBase}/invite/${inv.token}`;
              return (
              <div key={inv.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', background: 'var(--bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', minWidth: 0, overflowWrap: 'anywhere' }}>{inv.email}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: roleColor[inv.role as Role], background: 'rgba(255,255,255,.06)' }}>{ROLE_LABEL[inv.role as Role]}</span>
                  {expiree && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: '#ffcf8f', background: 'rgba(245,166,35,.12)' }}>Expirée · lien inactif</span>}
                  <form action={revokeInviteAction} style={{ marginLeft: 'auto' }}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button type="submit" aria-label={`Révoquer l’invitation de ${inv.email}`} style={btnGhost}>Révoquer</button>
                  </form>
                </div>
                {!expiree && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    <code style={{ display: 'block', fontSize: 11, color: 'var(--accent-strong)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{lien}</code>
                    <CopierTexte texte={lien} />
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Membres · liste ordinaire (nom, e-mail, rôle) · elle SE REPLIE sur mobile
          plutôt que de défiler à l'horizontale · le défilement est réservé aux
          vrais tableaux denses (ex. Top créas d'Analytics). Chaque champ garde une
          base flexible et passe à la ligne quand la largeur manque. */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '11px 16px', background: 'var(--surface)', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
          <span style={{ flex: '1 1 140px', minWidth: 0 }}>Membre</span><span style={{ flex: '2 1 200px', minWidth: 0 }}>E-mail</span><span style={{ flex: '0 0 auto' }}>Rôle</span>
        </div>
        {members.map((m) => (
          <div key={m.email} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '13px 16px', borderTop: '1px solid var(--line)' }}>
            <span style={{ flex: '1 1 140px', minWidth: 0, fontWeight: 600, color: 'var(--ink)', fontSize: 14, overflowWrap: 'anywhere' }}>{m.name || '(sans nom)'}</span>
            <span style={{ flex: '2 1 200px', minWidth: 0, color: 'var(--ink-2)', fontSize: 13, overflowWrap: 'anywhere' }}>{m.email}</span>
            <span style={{ flex: '0 0 auto', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, color: roleColor[m.role], background: 'rgba(255,255,255,.06)' }}>{ROLE_LABEL[m.role]}</span>
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
