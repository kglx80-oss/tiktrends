import { redirect } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { roleAtLeast } from '../../../../lib/rbac';
import { isFounder } from '../../../../lib/founder';
import { COMPETITORS, AI_STACK, CAPABILITIES, GAPS, ADVANTAGES, type Cap } from '../../../../lib/intel';

export const dynamic = 'force-dynamic';

export default async function IntelligencePage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'admin')) redirect('/dashboard');
  if (!isFounder(s.user.email)) redirect('/dashboard');

  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 4px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: -0.5 }}>Intelligence marché</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: '#0d070c', background: 'var(--grad-accent)' }}>ADMIN+</span>
      </div>
      <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 6, marginBottom: 22, maxWidth: 760, lineHeight: 1.6 }}>
        Où l'on se situe face aux concurrents directs, et comment notre pile IA maison (Jarvis) fait la différence.
        Données publiques / estimations · les tarifs évoluent, à revérifier avant tout usage commercial.
      </p>

      {/* Matrice comparative */}
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Matrice comparative</h2>
      <div style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden', marginBottom: 30 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 680 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={mth}>Capacité</th>
                <th style={mthC}>TikTrends</th><th style={mthC}>Atria</th><th style={mthC}>Foreplay</th><th style={mthC}>Higgsfield</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((r) => (
                <tr key={r.capability} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ ...mtd, color: 'var(--ink)', fontWeight: 700 }}>{r.capability}{r.note && <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>{r.note}</div>}</td>
                  <td style={mtdC}><Dot v={r.us} highlight /></td>
                  <td style={mtdC}><Dot v={r.atria} /></td>
                  <td style={mtdC}><Dot v={r.foreplay} /></td>
                  <td style={mtdC}><Dot v={r.higgsfield} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span><b style={{ color: '#7ee8bf' }}>●</b> Oui</span><span><b style={{ color: '#f5b043' }}>◐</b> Partiel</span><span><b style={{ color: 'var(--line-2)' }}>○</b> Non</span>
        </div>
      </div>

      {/* Où faire mieux + avantages */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ border: '1px solid rgba(245,176,67,.35)', borderRadius: 16, background: 'linear-gradient(180deg, rgba(245,166,35,.06), var(--surface))', padding: '18px 20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>🎯 Où l'on doit faire mieux</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {GAPS.map((g) => (
              <div key={g.title}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', borderRadius: 999, color: g.priority === 'haute' ? '#0d070c' : 'var(--ink-2)', background: g.priority === 'haute' ? 'linear-gradient(135deg,#f5a623,#ff8c42)' : 'var(--line)' }}>{g.priority.toUpperCase()}</span>
                  <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{g.title}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 'auto' }}>vs {g.vs}</span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{g.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={{ border: '1px solid rgba(126,232,191,.35)', borderRadius: 16, background: 'linear-gradient(180deg, rgba(61,220,151,.06), var(--surface))', padding: '18px 20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>💪 Nos avantages à presser</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 9, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {ADVANTAGES.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      </div>

      {/* Notre pile IA */}
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Notre pile IA · orchestration maison</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-2)', maxWidth: 760, lineHeight: 1.6 }}>
        Les modèles (Nano Banana, Kling, Claude) sont le <b>moteur</b>. Notre valeur, c'est la <b>chaîne</b> et la
        gouvernance : veille → contexte marque → règles Jarvis → concept → scène produit fidèle → design → vidéo →
        contrôle qualité. Interchangeable : si un meilleur modèle sort, on le branche sans changer la couche Jarvis.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10, marginBottom: 30 }}>
        {AI_STACK.map((l, i) => (
          <div key={l.layer} style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '13px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--grad-accent)', color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
              <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{l.layer}</b>
            </div>
            <p style={{ margin: '8px 0 6px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>{l.role}</p>
            <div style={{ fontSize: 11, color: 'var(--accent-strong)', fontWeight: 700 }}>{l.engines}</div>
          </div>
        ))}
      </div>

      {/* Concurrents */}
      <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Concurrents directs</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>Atria · Foreplay · Higgsfield</p>

      <div style={{ display: 'grid', gap: 16 }}>
        {COMPETITORS.map((c) => (
          <div key={c.key} style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--ink)' }}>{c.name}</h3>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', padding: '2px 8px', borderRadius: 999, color: 'var(--accent-strong)', border: '1px solid var(--line-2)' }}>{c.tag}</span>
              <span style={{ flex: 1 }} />
              <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>{c.url.replace('https://', '')} ↗</a>
            </div>
            <p style={{ margin: '10px 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>{c.positioning}</p>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)', background: 'rgba(255,255,255,.04)', border: '1px solid var(--line)', borderRadius: 10, padding: '7px 11px', marginBottom: 14 }}>
              <span style={{ fontSize: 13 }}>💶</span><b style={{ color: 'var(--ink)' }}>Tarif estimé :</b> {c.pricing}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <div style={colH('#7ee8bf')}>Forces</div>
                <ul style={ulS}>{c.strengths.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
              </div>
              <div>
                <div style={colH('#f5b043')}>Limites</div>
                <ul style={ulS}>{c.weaknesses.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</ul>
              </div>
            </div>

            <div style={{ marginTop: 14, padding: '12px 15px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(254,44,85,.10), rgba(120,90,255,.06))', border: '1px solid var(--line-2)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent-strong)', marginBottom: 4 }}>Notre angle</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.55 }}>{c.ourEdge}</p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

const ulS = { margin: '2px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 } as const;
function colH(color: string) {
  return { fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color, marginBottom: 6 } as const;
}

function Dot({ v, highlight }: { v: Cap; highlight?: boolean }) {
  const map = { yes: { c: '#7ee8bf', s: '●' }, partial: { c: '#f5b043', s: '◐' }, no: { c: 'var(--line-2)', s: '○' } } as const;
  const m = map[v];
  return <span style={{ fontSize: 16, color: m.c, textShadow: highlight && v === 'yes' ? '0 0 10px rgba(126,232,191,.5)' : 'none' }}>{m.s}</span>;
}

const mth = { padding: '10px 16px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' } as const;
const mthC = { ...mth, textAlign: 'center', width: 96 } as const;
const mtd = { padding: '10px 16px', verticalAlign: 'top' } as const;
const mtdC = { ...mtd, textAlign: 'center' } as const;
