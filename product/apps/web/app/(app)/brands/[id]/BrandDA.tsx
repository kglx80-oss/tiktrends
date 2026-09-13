'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { importBrandDAAction, saveBrandDAAction, extractBrandVisualDaAction, saveBrandVisualDaAction } from '../../../actions/brand-detail';
import { BrandGuidelines } from '../../../../components/BrandGuidelines';
import { Icon } from '../../../../components/Icon';
import { costFor, daVisuelleUtile, normaliserDaVisuelle, type DaVisuelleMarque } from '@tiktrends/core';

export function BrandDA({ brandId, logoUrl, logos = [], colors, fonts, daVisuelle = null }: { brandId: string; logoUrl: string | null; logos?: string[]; colors: string[]; fonts: string[]; daVisuelle?: DaVisuelleMarque | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);
  const [da, setDa] = useState<{ logoUrl: string | null; colors: string[]; fonts: string[] }>({ logoUrl, colors, fonts });
  // Édition manuelle de la charte (mêmes contrôles que la création de marque).
  const [editing, setEditing] = useState(false);
  // Correction à la main du STYLE déduit du site (pas de dépense).
  const [styleEditing, setStyleEditing] = useState(false);
  const [logoList, setLogoList] = useState<string[]>(logos.length ? logos : (logoUrl ? [logoUrl] : []));

  async function saveDA() {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await saveBrandDAAction({ brandId, logoUrl: da.logoUrl ?? '', logos: logoList, colors: da.colors, fonts: da.fonts });
    setBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    setOk(true); setMsg('Charte enregistrée.'); setEditing(false); router.refresh();
  }

  async function fetchDA() {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await importBrandDAAction({ brandId });
    setBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    setOk(true);
    setDa({ logoUrl: r.logoUrl ?? null, colors: r.colors ?? [], fonts: r.fonts ?? [] });
    setMsg('DA récupérée depuis le site.');
    router.refresh();
  }

  const has = !!da.logoUrl || da.colors.length > 0 || da.fonts.length > 0;

  // Le STYLE déduit par l'agent · rendu EN MOTS pour que le style compris soit
  // visible (et corrigeable) avant de générer, jamais une boîte noire.
  // Normalisée une fois · tolère une DA malformée (aEviter en chaîne, champ en
  // nombre) sans faire tomber le rendu · c'était la cause du crash côté client.
  const dv = normaliserDaVisuelle(daVisuelle);
  const styleShown = daVisuelleUtile(daVisuelle);
  const styleRows: Array<[string, string]> = [
    ['Style', dv.style],
    ['Photo', dv.photo],
    ['Ambiance', dv.ambiance],
    ['Lumière', dv.lumiere],
    ['Couleurs', dv.couleurs],
    ['À éviter', dv.aEviter.join(', ')],
  ];

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', margin: '4px 0 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' }}><Icon name="palette" size={15} /> Identité visuelle (DA)</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>Logo, couleurs et polices récupérés depuis le site, appliqués automatiquement à tes pubs.</div>
        </div>
        <button type="button" onClick={() => setEditing((v) => !v)} disabled={busy} style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid var(--line-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', background: 'transparent', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
          {editing ? 'Annuler' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="pen" size={13} /> Éditer</span>}
        </button>
        <button type="button" onClick={fetchDA} disabled={busy} style={{ padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: busy ? .6 : 1, whiteSpace: 'nowrap' }}>
          {busy ? 'Récupération…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={13} /> Récupérer la DA</span>}
        </button>
        {/* L'analyse du STYLE (LLM) · elle DÉPENSE · action secondaire (contour),
            prix écrit sur le bouton, jamais après le clic. Elle range la DA
            visuelle dans brandKit · la génération la lit et la tient sur chaque
            créa. */}
        <form action={extractBrandVisualDaAction} style={{ margin: 0 }}>
          <input type="hidden" name="brandId" value={brandId} />
          <button type="submit" disabled={busy} title="Analyse le style du site et l'applique à chaque créa générée" style={{ padding: '10px 16px', borderRadius: 999, border: '1px solid var(--accent-strong)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', background: 'transparent', color: 'var(--accent-strong)', whiteSpace: 'nowrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="brain" size={13} /> Analyser le style · {costFor('brief')} cr.</span>
          </button>
        </form>
      </div>

      {/* Le STYLE déduit du site · visible en mots, corrigeable sans re-payer. */}
      {styleShown && !styleEditing && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="brain" size={14} /> Style déduit du site</div>
            <button type="button" onClick={() => setStyleEditing(true)} disabled={busy} style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid var(--line-2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', background: 'transparent', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="pen" size={12} /> Corriger</span>
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>Appliqué à chaque créa générée · la scène reste variée, le style tient.</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {styleRows.map(([k, v]) => v ? (
              <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span style={{ ...daLbl, marginBottom: 0, minWidth: 84, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>{v}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* Correction à la main du style déduit · action serveur, aucune dépense. */}
      {styleEditing && (
        <form action={saveBrandVisualDaAction} style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <input type="hidden" name="brandId" value={brandId} />
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 3 }}>Corriger le style déduit</div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 12 }}>Ta version prime sur celle de l'agent · aucun crédit.</div>
          {([
            ['style', 'Style', dv.style, 'éditorial minimaliste, beaucoup de blanc, cadrages nets'],
            ['photo', 'Photo', dv.photo, 'macro produit sur fond texturé, lifestyle lumineux…'],
            ['ambiance', 'Ambiance', dv.ambiance, 'premium et rassurant, énergique et pop…'],
            ['lumiere', 'Lumière', dv.lumiere, 'lumière naturelle douce, ombres tenues'],
            ['couleurs', 'Couleurs', dv.couleurs, 'tons crème et vert sauge, contrastes doux'],
            ['aEviter', 'À éviter', dv.aEviter.join(', '), 'rendu stock, dégradés criards, surcharge'],
          ] as Array<[string, string, string, string]>).map(([name, label, value, ph]) => (
            <label key={name} style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ ...daLbl, display: 'block' }}>{label}</span>
              <textarea name={name} defaultValue={value} rows={2} placeholder={ph} style={taStyle} />
            </label>
          ))}
          <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '2px 0 12px' }}>Sépare les éléments « à éviter » par une virgule ou un retour à la ligne.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={busy} style={{ padding: '10px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', background: 'var(--grad-accent)', color: 'var(--on-accent)' }}>Enregistrer le style</button>
            <button type="button" onClick={() => setStyleEditing(false)} disabled={busy} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid var(--line-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', background: 'transparent', color: 'var(--ink-2)' }}>Annuler</button>
          </div>
        </form>
      )}

      {/* Édition manuelle : mêmes contrôles que la création de marque. */}
      {editing && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <BrandGuidelines
            logos={logoList} onLogos={setLogoList}
            defaultLogo={da.logoUrl ?? ''} onDefaultLogo={(v) => setDa((s) => ({ ...s, logoUrl: v }))}
            colors={da.colors} onColors={(v) => setDa((s) => ({ ...s, colors: v }))}
            fonts={da.fonts} onFonts={(v) => setDa((s) => ({ ...s, fonts: v }))}
          />
          <button type="button" onClick={saveDA} disabled={busy} style={{ marginTop: 14, padding: '10px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: busy ? .6 : 1 }}>
            {busy ? 'Enregistrement…' : 'Enregistrer la charte'}
          </button>
        </div>
      )}

      {!editing && has && (
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginTop: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={daLbl}>Logo</div>
            {da.logoUrl
               
              ? <img src={da.logoUrl} alt="" style={{ height: 44, maxWidth: 160, objectFit: 'contain', background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: 6 }} />
              : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
          </div>
          <div>
            <div style={daLbl}>Couleurs</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {da.colors.length ? da.colors.map((c) => (
                <span key={c} title={c} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: c, border: '1px solid var(--line-2)' }} />
                  <span style={{ fontSize: 9, color: 'var(--muted)' }}>{c}</span>
                </span>
              )) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
          </div>
          <div>
            <div style={daLbl}>Polices</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {da.fonts.length ? da.fonts.map((f) => <span key={f} style={{ fontSize: 13, color: 'var(--ink-2)' }}>{f}</span>) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 12, fontSize: 12.5, color: ok ? '#9fe6b3' : '#f5b043' }}>{msg}</div>}
    </div>
  );
}

const daLbl = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 7 };
const taStyle = { width: '100%', marginTop: 4, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface-2, transparent)', color: 'var(--ink)', fontSize: 13, lineHeight: 1.45, resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const };
