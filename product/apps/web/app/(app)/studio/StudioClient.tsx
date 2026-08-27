'use client';

import { useActionState, useState } from 'react';
import { generateAction, type StudioState } from '../../actions/studio';

const input: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, outline: 'none' };
const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', display: 'block', marginBottom: 5 };
const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: 18 };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' };

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* noop */ } }}
      style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: done ? 'var(--ok)' : 'var(--ink-2)', cursor: 'pointer', flexShrink: 0 }}>
      {done ? '✓ copié' : 'copier'}
    </button>
  );
}

/** Envoie un angle/hook directement au studio Pubs IA (pré-rempli comme angle). */
function ToAds({ text }: { text: string }) {
  return (
    <a href={`/studio/ads?angle=${encodeURIComponent(text)}`} title="Créer la pub à partir de cet angle"
      style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(254,44,85,.35)', background: 'transparent', color: 'var(--accent-strong)', fontWeight: 700, cursor: 'pointer', flexShrink: 0, textDecoration: 'none', whiteSpace: 'nowrap' }}>
      ✨ Pubs IA
    </a>
  );
}

export function StudioClient({ hasKey, prefillProduct, prefillInspiration }: { hasKey: boolean; prefillProduct?: string; prefillInspiration?: string }) {
  const [state, formAction, pending] = useActionState<StudioState, FormData>(generateAction, {});
  const out = state.output;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 22, alignItems: 'start' }}>
      {/* Brief */}
      <form action={formAction} style={{ ...card, display: 'grid', gap: 12, position: 'sticky', top: 20 }}>
        <div><label style={lbl}>Produit / marque / offre *</label><input name="product" required defaultValue={prefillProduct} placeholder="Ex : sérum vitamine C bio" style={input} /></div>
        <div><label style={lbl}>Cible</label><input name="audience" placeholder="Ex : femmes 25-40, peau sensible" style={input} /></div>
        <div><label style={lbl}>Angle / promesse</label><input name="angle" placeholder="Ex : résultats visibles en 7 jours" style={input} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={lbl}>Ton</label><input name="tone" placeholder="Ex : UGC spontané" style={input} /></div>
          <div style={{ flex: 1 }}><label style={lbl}>Plateforme</label>
            <select name="platform" defaultValue="tiktok" style={{ ...input, cursor: 'pointer' }}><option value="tiktok">TikTok</option><option value="meta">Meta</option></select>
          </div>
        </div>
        <div><label style={lbl}>Inspiration (créa gagnante à réinterpréter)</label><textarea name="inspiration" rows={4} defaultValue={prefillInspiration} placeholder="Colle ici le copy d'une annonce repérée dans l'Inspo…" style={{ ...input, resize: 'vertical' }} /></div>
        <button type="submit" disabled={pending || !hasKey} style={{ padding: '12px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: pending || !hasKey ? 'default' : 'pointer', opacity: pending || !hasKey ? .6 : 1 }}>
          {pending ? 'Génération en cours…' : '✨ Générer la créative'}
        </button>
        {!hasKey && <p style={{ margin: 0, fontSize: 12, color: 'var(--warn)' }}>IA non configurée : ajoute <code>ANTHROPIC_API_KEY</code> sur le serveur.</p>}
        {state.error && <p style={{ margin: 0, fontSize: 12, color: '#ff9db0' }}>{state.error}</p>}
      </form>

      {/* Résultats */}
      <div style={{ display: 'grid', gap: 16 }}>
        {!out && !pending && (
          <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
            Remplis le brief à gauche et lance la génération. Astuce : depuis l'<b>Inspo</b>, le bouton « ✨ Générer » pré-remplit l'inspiration avec une créa gagnante.
          </div>
        )}
        {pending && <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>✨ Le Studio compose angles, hooks, script et textes…</div>}

        {out && (
          <>
            <section style={card}>
              <h2 style={h2}>Angles</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {out.angles.map((a, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1 }}>• {a}</span><ToAds text={a} /><Copy text={a} /></div>)}
              </div>
            </section>

            <section style={card}>
              <h2 style={h2}>Hooks (0-3 s)</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {out.hooks.map((hk, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600, flex: 1 }}>{hk}</span><ToAds text={hk} /><Copy text={hk} /></div>)}
              </div>
            </section>

            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ ...h2, marginBottom: 0 }}>Script</h2>
                <Copy text={out.script.map((b) => `${b.time} · ${b.line}`).join('\n')} />
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {out.script.map((b, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                    <span style={{ fontSize: 12, color: 'var(--accent-strong)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{b.time}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{b.line}</span>
                  </div>
                ))}
              </div>
            </section>

            <section style={card}>
              <h2 style={h2}>Textes d'annonce</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {out.primaryTexts.map((t, i) => (
                  <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', background: 'var(--bg)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1, whiteSpace: 'pre-wrap' }}>{t}</span><Copy text={t} />
                  </div>
                ))}
              </div>
            </section>

            <section style={card}>
              <h2 style={h2}>Légendes</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {out.captions.map((c, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1 }}>{c}</span><Copy text={c} /></div>)}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
