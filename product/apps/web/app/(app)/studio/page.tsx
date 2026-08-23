import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import { StudioClient } from './StudioClient';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'studio')!;

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ inspo?: string; brand?: string }> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  if (!canAccess({ role: s.role, plan: s.plan }, feature)) {
    const why = denyReason({ role: s.role, plan: s.plan }, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Studio IA</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: 'var(--ink)' }}>{why === 'plan' ? "Inclus dès l'abonnement Core" : 'Accès réservé'}</h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
            {why === 'plan' ? 'Le Studio IA (génération de créatives) est disponible à partir du plan Core.' : "Ton rôle ne permet pas d'accéder au Studio."}
          </p>
          {why === 'plan' && s.role === 'owner' && (
            <a href="/settings" style={{ display: 'inline-block', marginTop: 16, padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Gérer l'abonnement →</a>
          )}
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main style={wrap}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={h1}>Studio IA</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>angles · hooks · script · textes</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22 }}>
        Génère des créatives prêtes à tourner. Source les gagnantes dans l'<b>Inspo</b>, puis itère ici.
      </p>
      <StudioClient hasKey={hasKey} prefillProduct={sp.brand} prefillInspiration={sp.inspo} />
    </main>
  );
}

const wrap = { padding: '30px 36px 60px', maxWidth: 1180, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink)' } as const;
