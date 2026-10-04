'use client';

import { useActionState, useState } from 'react';
import { generateAction, type StudioState } from '../../../actions/studio';
import { costFor, CIBLE_TACTILE_MIN, TEXTES_IA_INACTIFS, BOUTON_TEXTES_INACTIF } from '@tiktrends/core';
import type { CreativeOutput } from '@tiktrends/ai';
import { Icon } from '../../../../components/Icon';
import { useIsMobile } from '../../../../components/useIsMobile';

const input: React.CSSProperties = { width: '100%', minHeight: CIBLE_TACTILE_MIN, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, outline: 'none' };
const lbl: React.CSSProperties = { fontSize: 12, color: 'var(--ink-2)', display: 'block', marginBottom: 5 };
const card: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: 18 };
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' };

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* noop */ } }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: done ? 'var(--ok)' : 'var(--ink-2)', cursor: 'pointer', flexShrink: 0 }}>
      {done ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={11} /> copié</span> : 'copier'}
    </button>
  );
}

/** Envoie un angle/hook directement au studio Pubs IA (pré-rempli comme angle). */
function ToAds({ text }: { text: string }) {
  return (
    <a href={`/studio/ads?angle=${encodeURIComponent(text)}`} title="Créer la pub à partir de cet angle"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, gap: 5, fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(254,44,85,.35)', background: 'transparent', color: 'var(--accent-strong)', fontWeight: 700, cursor: 'pointer', flexShrink: 0, textDecoration: 'none', whiteSpace: 'nowrap' }}>
      <Icon name="sparkles" size={12} /> Pubs IA
    </a>
  );
}

export function StudioClient({ hasKey, prefillProduct, prefillInspiration, initialOutput }: { hasKey: boolean; prefillProduct?: string; prefillInspiration?: string; initialOutput?: CreativeOutput }) {
  const [state, formAction, pending] = useActionState<StudioState, FormData>(generateAction, {});
  // Le dernier résultat enregistré s'affiche au retour · le studio ne repart plus
  // d'un écran vide alors que la génération d'hier est en base. Une nouvelle
  // génération le remplace.
  const out = state.output ?? initialOutput;
  // Écran étroit · le brief et les résultats s'empilent (le split 2 colonnes
  // débordait le téléphone), et le brief cesse de coller (inutile empilé).
  const mobile = useIsMobile();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(300px, 380px) 1fr', gap: 22, alignItems: 'start' }}>
      {/* Brief */}
      <form action={formAction} style={{ ...card, display: 'grid', gap: 12, minWidth: 0, position: mobile ? 'static' : 'sticky', top: 20 }}>
        <div><label htmlFor="studio-textes-product" style={lbl}>Produit / marque / offre *</label><input id="studio-textes-product" name="product" required defaultValue={prefillProduct} placeholder="Ex : sérum vitamine C bio" style={input} /></div>
        <div><label htmlFor="studio-textes-audience" style={lbl}>Cible</label><input id="studio-textes-audience" name="audience" placeholder="Ex : femmes 25-40, peau sensible" style={input} /></div>
        <div><label htmlFor="studio-textes-angle" style={lbl}>Angle / promesse</label><input id="studio-textes-angle" name="angle" placeholder="Ex : résultats visibles en 7 jours" style={input} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label htmlFor="studio-textes-tone" style={lbl}>Ton</label><input id="studio-textes-tone" name="tone" placeholder="Ex : UGC spontané" style={input} /></div>
          <div style={{ flex: 1 }}><label htmlFor="studio-textes-platform" style={lbl}>Plateforme</label>
            <select id="studio-textes-platform" name="platform" defaultValue="tiktok" style={{ ...input, cursor: 'pointer' }}><option value="tiktok">TikTok</option><option value="meta">Meta</option></select>
          </div>
        </div>
        <div><label htmlFor="studio-textes-inspiration" style={lbl}>Inspiration (piste repérée à réinterpréter)</label><textarea id="studio-textes-inspiration" name="inspiration" rows={4} defaultValue={prefillInspiration} placeholder="Colle ici le copy d'une annonce repérée dans la Veille…" style={{ ...input, resize: 'vertical' }} /></div>
        {/* Lot 12 · service inactif · le bouton dit l'état (plus « Générer · 3
            crédits » d'aspect actif) et l'explication le suit immédiatement. */}
        <button type="submit" disabled={pending || !hasKey} aria-describedby={hasKey ? undefined : 'studio-textes-inactif'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '12px 18px', borderRadius: 999, border: hasKey ? 'none' : '1px dashed var(--line-2)', background: hasKey ? 'var(--grad-accent)' : 'transparent', color: hasKey ? 'var(--on-accent)' : 'var(--muted)', fontWeight: 700, fontSize: 14, cursor: pending || !hasKey ? 'default' : 'pointer', opacity: pending ? .6 : 1 }}>
          {!hasKey ? BOUTON_TEXTES_INACTIF : pending ? 'Génération en cours…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Icon name="sparkles" size={15} /> Générer la créative · {costFor('script')} crédits</span>}
        </button>
        {/* Le coût se dit AVANT le clic · aucune génération payante sans prix connu
             (CDC S21). Ce que ça produit, et la politique d'échec, avec. */}
        {hasKey && (
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
            {costFor('script')} crédits · angles, hooks, script et légendes en un lot · non facturé si la génération échoue.
          </p>
        )}
        {/* Copie CLIENT · ce qui manque, qui agit, quoi faire · jamais un nom de
            variable ni de fournisseur (recette #106). La logique (bouton
            désactivé sans IA) ne change pas. */}
        {!hasKey && (
          <div role="status" id="studio-textes-inactif" style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--warn)', lineHeight: 1.5 }}>
              <b>{TEXTES_IA_INACTIFS.constat}</b> {TEXTES_IA_INACTIFS.suite}
            </p>
            {TEXTES_IA_INACTIFS.action && (
              <a href={TEXTES_IA_INACTIFS.action.href} style={{ display: 'inline-flex', alignItems: 'center', justifySelf: 'start', minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                {TEXTES_IA_INACTIFS.action.libelle}
              </a>
            )}
          </div>
        )}
        {state.error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#ff9db0' }}>{state.error}</p>}
      </form>

      {/* Résultats */}
      <div style={{ display: 'grid', gap: 16 }}>
        {!out && !pending && (
          <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
            Remplis le brief à gauche et lance la génération. Astuce : colle dans « Inspiration » le texte d’une annonce repérée dans la <b>Veille</b> · c’est une piste à réinterpréter, pas une preuve de résultat.
          </div>
        )}
        {pending && <div role="status" style={{ ...card, color: 'var(--muted)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="sparkles" size={15} /> Le Studio compose angles, hooks, script et textes…</div>}

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
