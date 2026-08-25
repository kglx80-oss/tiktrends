import Link from 'next/link';

export interface OnboardStep {
  key: string;
  label: string;
  desc: string;
  done: boolean;
  href: string;
  cta: string;
}

/** Parcours de démarrage guidé d'une marque · schéma étape par étape (façon checklist d'onboarding). */
export function BrandOnboarding({ steps }: { steps: OnboardStep[] }) {
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / total) * 100);
  const complete = done === total;
  // Première étape non terminée : mise en avant comme « prochaine action ».
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(254,44,85,.06), var(--surface))', padding: '18px 20px', marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 18 }}>{complete ? '🎉' : '🚀'}</span>
          <b style={{ fontSize: 16, color: 'var(--ink)' }}>Démarrage</b>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: complete ? '#7ee8bf' : 'var(--accent-strong)' }}>{done}/{total} étapes</span>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 7, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: complete ? 'linear-gradient(90deg,#3ddc97,#7ee8bf)' : 'var(--grad-accent)', transition: 'width .4s ease' }} />
      </div>
      <p style={{ margin: '8px 0 14px', fontSize: 12.5, color: 'var(--ink-2)' }}>
        {complete
          ? 'Marque prête. Toutes les étapes sont validées · tu peux générer des créas au top.'
          : 'Suis ces étapes dans l’ordre pour une marque 100 % opérationnelle. Chaque étape nourrit l’IA.'}
      </p>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {steps.map((s, i) => {
          const isNext = i === nextIdx;
          return (
            <li key={s.key}>
              <Link href={s.href} style={{
                display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
                border: `1px solid ${isNext ? 'var(--accent-strong)' : 'var(--line)'}`,
                borderRadius: 13, padding: '11px 14px',
                background: isNext ? 'rgba(254,44,85,.06)' : 'var(--surface)',
                opacity: s.done ? 0.72 : 1,
              }}>
                {/* Puce d'état */}
                <span style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800,
                  background: s.done ? 'var(--grad-accent)' : 'transparent',
                  border: s.done ? 'none' : `1.5px solid ${isNext ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                  color: s.done ? '#0d070c' : isNext ? 'var(--accent-strong)' : 'var(--muted)',
                }}>{s.done ? '✓' : i + 1}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', textDecoration: s.done ? 'line-through' : 'none', textDecorationColor: 'var(--muted)' }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{s.desc}</div>
                </div>

                {!s.done && (
                  <span style={{
                    fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
                    padding: '7px 13px', borderRadius: 999,
                    background: isNext ? 'var(--grad-accent)' : 'transparent',
                    color: isNext ? '#0d070c' : 'var(--accent-strong)',
                    border: isNext ? 'none' : '1px solid var(--line-2)',
                  }}>{s.cta} ›</span>
                )}
                {s.done && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7ee8bf' }}>Fait</span>}
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
