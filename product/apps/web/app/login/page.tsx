import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import { loginAction } from '../actions/auth';
import { AuthShell, field, primaryBtn, errorBox } from '../../components/AuthShell';

const ERRORS: Record<string, string> = {
  invalid: 'E-mail ou mot de passe incorrect.',
  missing: 'Renseigne ton e-mail et ton mot de passe.',
  server: 'Base de données indisponible. Réessaie dans un instant.',
  throttled: 'Trop de tentatives. Patiente quelques minutes avant de réessayer.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  if (await getSession()) redirect('/dashboard');
  const { e } = await searchParams;

  return (
    <AuthShell title="Connexion" subtitle="Accède à ton espace TikTrends.">
      {e && errorBox(ERRORS[e] || 'Une erreur est survenue.')}
      <form action={loginAction} style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>E-mail</span>
          <input name="email" type="email" required autoComplete="email" placeholder="toi@agence.fr" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Mot de passe</span>
          <input name="password" type="password" required autoComplete="current-password" placeholder="••••••••" style={field} />
        </label>
        <button type="submit" style={primaryBtn}>Se connecter</button>
      </form>
      <p style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)' }}>
        Pas encore de compte ?{' '}
        <Link href="/signup" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>Créer un espace</Link>
      </p>
      <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--muted)' }}>
        <Link href="/legal/mentions-legales" style={{ color: 'var(--muted)' }}>Mentions légales</Link> ·{' '}
        <Link href="/legal/cgv" style={{ color: 'var(--muted)' }}>CGV</Link> ·{' '}
        <Link href="/legal/confidentialite" style={{ color: 'var(--muted)' }}>Confidentialité</Link>
      </p>
    </AuthShell>
  );
}
