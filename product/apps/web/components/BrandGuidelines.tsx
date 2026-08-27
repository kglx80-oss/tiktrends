'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { lbl } from './ui';

/**
 * Charte visuelle : logos (avec un logo « par défaut »), couleurs en pastilles
 * (sélecteur natif) et polices en jetons. Édition directe, sans saisie de listes.
 * Les valeurs sont sérialisées dans des champs cachés pour le POST du formulaire.
 */
export function BrandGuidelines({
  logos, onLogos, defaultLogo, onDefaultLogo, colors, onColors, fonts, onFonts,
}: {
  logos: string[]; onLogos: (v: string[]) => void;
  defaultLogo: string; onDefaultLogo: (v: string) => void;
  colors: string[]; onColors: (v: string[]) => void;
  fonts: string[]; onFonts: (v: string[]) => void;
}) {
  const [logoDraft, setLogoDraft] = useState('');
  const [fontDraft, setFontDraft] = useState('');
  const colorRef = useRef<HTMLInputElement>(null);

  const addLogo = () => {
    const v = logoDraft.trim();
    if (!v) return;
    if (!logos.includes(v)) onLogos([...logos, v]);
    if (!defaultLogo) onDefaultLogo(v);
    setLogoDraft('');
  };
  const removeLogo = (u: string) => {
    const next = logos.filter((x) => x !== u);
    onLogos(next);
    if (defaultLogo === u) onDefaultLogo(next[0] ?? '');
  };
  const addFont = () => { const v = fontDraft.trim(); if (v && !fonts.includes(v)) onFonts([...fonts, v]); setFontDraft(''); };

  return (
    <>
      {/* Logos */}
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Logos <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· clique pour définir celui par défaut</span></label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {logos.map((u) => {
            const isDefault = u === defaultLogo;
            return (
              <div key={u} style={{ position: 'relative' }}>
                <button type="button" onClick={() => onDefaultLogo(u)} title={isDefault ? 'Logo par défaut' : 'Définir par défaut'}
                  style={{ width: 74, height: 74, borderRadius: 14, cursor: 'pointer', overflow: 'hidden', padding: 6,
                    border: `2px solid ${isDefault ? 'var(--accent-strong)' : 'var(--line-2)'}`, background: 'var(--paper)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </button>
                {isDefault && <span style={badge}>Défaut</span>}
                <button type="button" onClick={() => removeLogo(u)} aria-label="Retirer" style={removeBtn}>×</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={logoDraft} onChange={(e) => setLogoDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLogo(); } }}
              placeholder="https://…/logo.png" style={{ ...miniInput, width: 200 }} />
            <button type="button" onClick={addLogo} style={addBtn}>+</button>
          </div>
        </div>
      </div>

      {/* Couleurs */}
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Couleurs de marque</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {colors.map((c, i) => (
            <span key={c + i} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line-2)', borderRadius: 10, padding: '5px 9px 5px 6px', background: 'var(--paper)' }}>
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(c) ? c : '#000000'} onChange={(e) => onColors(colors.map((x, j) => (j === i ? e.target.value : x)))}
                style={{ width: 26, height: 26, border: 'none', borderRadius: 7, background: 'none', padding: 0, cursor: 'pointer' }} />
              <code style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{c}</code>
              <button type="button" onClick={() => onColors(colors.filter((_, j) => j !== i))} aria-label="Retirer" style={{ ...removeBtn, position: 'static', width: 16, height: 16, fontSize: 12 }}>×</button>
            </span>
          ))}
          <input ref={colorRef} type="color" defaultValue="#fe2c55" onChange={(e) => onColors([...colors, e.target.value])} style={{ display: 'none' }} />
          <button type="button" onClick={() => colorRef.current?.click()} style={addBtn}>+</button>
        </div>
      </div>

      {/* Polices */}
      <div style={{ marginBottom: 6 }}>
        <label style={lbl}>Polices <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· titre en premier</span></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {fonts.map((ft, i) => (
            <span key={ft + i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line-2)', borderRadius: 999, padding: '5px 9px 5px 12px', background: 'var(--paper)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: i === 0 ? 800 : 500 }}>{ft}{i === 0 && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · titre</span>}</span>
              <button type="button" onClick={() => onFonts(fonts.filter((_, j) => j !== i))} aria-label="Retirer" style={{ ...removeBtn, position: 'static', width: 16, height: 16, fontSize: 12 }}>×</button>
            </span>
          ))}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={fontDraft} onChange={(e) => setFontDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFont(); } }}
              placeholder="Inter, Playfair…" style={{ ...miniInput, width: 150 }} />
            <button type="button" onClick={addFont} style={addBtn}>+</button>
          </div>
        </div>
      </div>

      {/* Valeurs envoyées au serveur */}
      <input type="hidden" name="logoUrl" value={defaultLogo} />
      <input type="hidden" name="logos" value={logos.join(',')} />
      <input type="hidden" name="colors" value={colors.join(',')} />
      <input type="hidden" name="fonts" value={fonts.join(',')} />
    </>
  );
}

const miniInput: CSSProperties = { padding: '8px 11px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 12.5, outline: 'none' };
const addBtn: CSSProperties = { width: 32, height: 32, borderRadius: 10, border: '1px dashed var(--line-2)', background: 'transparent', color: 'var(--muted)', fontSize: 17, cursor: 'pointer', lineHeight: 1 };
const badge: CSSProperties = { position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)', fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'var(--grad-accent)', color: '#0d070c', whiteSpace: 'nowrap' };
const removeBtn: CSSProperties = { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--line-2)', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
