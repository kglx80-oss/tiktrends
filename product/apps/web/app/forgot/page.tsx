import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../lib/auth';
import { forgotPasswordAction } from '../actions/auth';
import { AuthShell, field, primaryBtn } from '../../components/AuthShell';

export const dynamic = 'force-dynamic';

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  if (await getSession()) redirect('/dashboard');
  const { sent } = await searchParams;

  if (sent) {
    return (
      <AuthShell title="Vérifie tes e-mails" subtitle="Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.">
        <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Le lien est valable <b>1 heure</b>. Pense à regarder tes spams. Tu n'as rien reçu ?{' '}
          <Link href="/forgot" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>Réessayer</Link>.
        </div>
        <p style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
          <Link href="/login" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>← Retour à la connexion</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Mot de passe oublié" subtitle="Indique ton e-mail : on t'envoie un lien pour en choisir un nouveau.">
      <form action={forgotPasswordAction} style={{ display: 'grid', gap: 14 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>E-mail</span>
          <input name="email" type="email" required autoComplete="email" placeholder="toi@exemple.com" style={field} />
        </label>
        <button type="submit" style={primaryBtn}>Envoyer le lien</button>
      </form>
      <p style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)' }}>
        <Link href="/login" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>← Retour à la connexion</Link>
      </p>
    </AuthShell>
  );
}
