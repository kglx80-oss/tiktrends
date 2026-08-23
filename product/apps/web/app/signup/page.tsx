import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { signupAction } from '../actions/auth';
import { AuthShell, field, primaryBtn, errorBox } from '../../components/AuthShell';

const ERRORS: Record<string, string> = {
  missing: 'Renseigne au moins un e-mail et un mot de passe.',
  weak: 'Le mot de passe doit faire au moins 8 caractères.',
  exists: 'Un compte existe déjà avec cet e-mail.',
  closed: "L'inscription est fermée : l'accès se fait désormais sur invitation.",
  server: 'Base de données indisponible. Réessaie dans un instant.',
};

export const dynamic = 'force-dynamic';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getSession()) redirect('/dashboard');
  const { e } = await searchParams;

  // Inscription ouverte uniquement tant qu'aucun compte n'existe (amorçage).
  let open = true;
  if (db) {
    const [firstUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    open = !firstUser;
  }

  if (!open) {
    return (
      <AuthShell title="Sur invitation" subtitle="L'accès à TikTrends se fait par invitation.">
        <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Cet espace est déjà créé. Pour rejoindre une équipe, demande à un administrateur de
          t'envoyer une invitation par e-mail, tu recevras un lien pour définir ton mot de passe.
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
          Déjà un compte ?{' '}
          <Link href="/login" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>Se connecter</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Créer l'espace" subtitle="Premier compte : tu en seras le propriétaire.">
      {e && errorBox(ERRORS[e] || 'Une erreur est survenue.')}
      <form action={signupAction} style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Nom</span>
          <input name="name" type="text" autoComplete="name" placeholder="Kévin Guilbaux" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Nom de l'espace / agence</span>
          <input name="workspace" type="text" placeholder="Agence GLX" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>E-mail</span>
          <input name="email" type="email" required autoComplete="email" placeholder="toi@agence.fr" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Mot de passe</span>
          <input name="password" type="password" required autoComplete="new-password" placeholder="8 caractères min." style={field} />
        </label>
        <button type="submit" style={primaryBtn}>Créer mon espace</button>
      </form>
      <p style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)' }}>
        Déjà un compte ?{' '}
        <Link href="/login" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>Se connecter</Link>
      </p>
    </AuthShell>
  );
}
