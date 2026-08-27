import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../../lib/auth';
import { resetPasswordAction } from '../../actions/auth';
import { AuthShell, field, primaryBtn, errorBox } from '../../../components/AuthShell';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  weak: 'Le mot de passe doit faire au moins 8 caractères.',
  invalid: 'Ce lien est invalide ou expiré. Demande-en un nouveau.',
};

export default async function ResetPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  if (await getSession()) redirect('/dashboard');
  const { token } = await params;
  const { e } = await searchParams;

  // Le lien est-il encore valide ? (sinon on propose d'en redemander un)
  let valid = false;
  if (db) {
    const [row] = await db.select({ id: schema.passwordResets.id }).from(schema.passwordResets)
      .where(and(eq(schema.passwordResets.token, token), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())))
      .limit(1);
    valid = !!row;
  }

  if (!valid) {
    return (
      <AuthShell title="Lien expiré" subtitle="Ce lien de réinitialisation n'est plus valable.">
        <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Les liens expirent au bout d'1 heure et ne servent qu'une fois.{' '}
          <Link href="/forgot" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>Demander un nouveau lien</Link>.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Nouveau mot de passe" subtitle="Choisis un mot de passe pour ton compte TikTrends.">
      {e && errorBox(ERRORS[e] || 'Une erreur est survenue.')}
      <form action={resetPasswordAction} style={{ display: 'grid', gap: 14 }}>
        <input type="hidden" name="token" value={token} />
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Nouveau mot de passe</span>
          <input name="password" type="password" required autoComplete="new-password" placeholder="8 caractères min." style={field} />
        </label>
        <button type="submit" style={primaryBtn}>Mettre à jour</button>
      </form>
      <p style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)' }}>
        <Link href="/login" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>← Retour à la connexion</Link>
      </p>
    </AuthShell>
  );
}
