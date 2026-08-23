import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { acceptInviteAction } from '../../actions/invites';
import { ROLE_LABEL, type Role } from '../../../lib/rbac';
import { AuthShell, field, primaryBtn, errorBox } from '../../../components/AuthShell';

const ERRORS: Record<string, string> = {
  weak: 'Le mot de passe doit faire au moins 8 caractères.',
  exists: 'Un compte existe déjà avec cet e-mail.',
  invalid: 'Cette invitation est invalide ou expirée.',
  server: 'Base de données indisponible. Réessaie dans un instant.',
};

export const dynamic = 'force-dynamic';

export default async function InvitePage({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const { e } = await searchParams;

  let invite: typeof schema.invites.$inferSelect | undefined;
  let workspaceName = '';
  if (db) {
    [invite] = await db.select().from(schema.invites).where(eq(schema.invites.token, token)).limit(1);
    if (invite) {
      const [w] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, invite.workspaceId)).limit(1);
      workspaceName = w?.name || '';
    }
  }

  const valid = !!invite && invite.status === 'pending' && (!invite.expiresAt || invite.expiresAt.getTime() >= Date.now());

  if (!valid) {
    return (
      <AuthShell title="Invitation invalide" subtitle="Ce lien n'est plus valable.">
        <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          L'invitation a peut-être expiré, été révoquée ou déjà utilisée. Demande à un administrateur
          de t'en renvoyer une.
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
          <Link href="/login" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>Se connecter</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Rejoindre l'espace" subtitle={`${workspaceName} · rôle ${ROLE_LABEL[invite!.role as Role]}`}>
      {e && errorBox(ERRORS[e] || 'Une erreur est survenue.')}
      <form action={acceptInviteAction} style={{ display: 'grid', gap: 14 }}>
        <input type="hidden" name="token" value={token} />
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>E-mail</span>
          <input value={invite!.email} disabled style={{ ...field, opacity: .6 }} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Nom</span>
          <input name="name" type="text" autoComplete="name" placeholder="Ton nom" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Choisis un mot de passe</span>
          <input name="password" type="password" required autoComplete="new-password" placeholder="8 caractères min." style={field} />
        </label>
        <button type="submit" style={primaryBtn}>Créer mon compte</button>
      </form>
    </AuthShell>
  );
}
