import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import { signupAction } from '../actions/auth';
import { AuthShell, field, primaryBtn, errorBox } from '../../components/AuthShell';

const ERRORS: Record<string, string> = {
  missing: 'Renseigne au moins un e-mail et un mot de passe.',
  weak: 'Le mot de passe doit faire au moins 8 caractères.',
  exists: 'Un compte existe déjà avec cet e-mail.',
  server: 'Base de données indisponible. Réessaie dans un instant.',
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getSession()) redirect('/dashboard');
  const { e } = await searchParams;

  return (
    <AuthShell title="Créer un espace" subtitle="Ton agence, tes marques, tes droits.">
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
