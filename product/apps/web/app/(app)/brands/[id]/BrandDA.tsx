'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importBrandDAAction, saveBrandDAAction, extractBrandVisualDaAction, saveBrandVisualDaAction } from '../../../actions/brand-detail';
import { BrandGuidelines } from '../../../../components/BrandGuidelines';
import { PaletteMarque } from './PaletteMarque';
import { Icon } from '../../../../components/Icon';
import { costFor, daVisuelleUtile, normaliserDaVisuelle, policeTechnique, type DaVisuelleMarque } from '@tiktrends/core';

// L'identité visuelle se lit en DEUX sections distinctes · les tokens bruts
// (couleurs + typographie) d'un côté, le kit (logo + style déduit + actions) de
// l'autre. Chaque section porte sa propre ancre · JAMAIS deux libellés vers le
// même point. L'index en tête surligne la section en vue.
const SECTIONS = [
  { id: 'couleurs', label: 'Couleurs & typographie', icon: 'palette' as const },
  { id: 'charte', label: 'Charte & kit', icon: 'layers' as const },
];

/**
 * L'index de sections · deux puces qui mènent aux deux ancres, avec un état
 * ACTIF cohérent · la puce de la section en vue est surlignée (IntersectionObserver
 * + hashchange). Purement client · le rendu statique montre l'état initial.
 */
function IndexSections() {
  const [actif, setActif] = useState<string>('couleurs');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    // Le hash explicite prime · un clic sur une puce cale l'état tout de suite.
    const sync = () => {
      const h = window.location.hash.replace('#', '');
      if (SECTIONS.some((s) => s.id === h)) setActif(h);
    };
    sync();
    window.addEventListener('hashchange', sync);
    const io = new IntersectionObserver((entries) => {
      const vu = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const id = vu?.target?.id;
      if (id && SECTIONS.some((s) => s.id === id)) setActif(id);
    }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] });
    els.forEach((el) => io.observe(el));
    return () => { io.disconnect(); window.removeEventListener('hashchange', sync); };
  }, []);
  return (
    <nav aria-label="Sections de l'identité visuelle" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {SECTIONS.map((s) => {
        const on = actif === s.id;
        return (
          <a key={s.id} href={`#${s.id}`} aria-current={on ? 'true' : undefined} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999,
            fontSize: 12.5, fontWeight: on ? 800 : 600, textDecoration: 'none',
            border: `1px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
            background: on ? 'rgba(254,44,85,.10)' : 'transparent',
            color: on ? 'var(--accent-strong)' : 'var(--ink-2)',
          }}>
            <Icon name={s.icon} size={13} /> {s.label}
          </a>
        );
      })}
    </nav>
  );
}

export function BrandDA({ brandId, logoUrl, logos = [], colors, fonts, daVisuelle = null }: { brandId: string; logoUrl: string | null; logos?: string[]; colors: string[]; fonts: string[]; daVisuelle?: DaVisuelleMarque | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);
  // Les polices déjà stockées AVANT le filtre d'icônes (S04/N09) sont nettoyées
  // à l'affichage · une marque enrichie autrefois ne montre plus « JudgemeStar »
  // comme police, même sans re-enrichissement.
  const [da, setDa] = useState<{ logoUrl: string | null; colors: string[]; fonts: string[] }>({ logoUrl, colors, fonts: fonts.filter((f) => !policeTechnique(f)) });
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
    <div style={{ margin: '4px 0 22px' }}>
      <IndexSections />

      {/* ── Couleurs & typographie · les tokens bruts de la marque ───────────── */}
      <section id="couleurs" style={{ ...sectionCard, scrollMarginTop: 90 }}>
        <div style={sectionTitre}><Icon name="palette" size={15} /> Couleurs & typographie</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>Les couleurs et polices de la marque · appliquées à chaque créa générée.</div>
        {(da.colors.length > 0 || da.fonts.length > 0) ? (
          <div style={{ display: 'grid', gap: 20, marginTop: 16 }}>
            <div>
              <div style={daLbl}>Couleurs</div>
              {da.colors.length ? <PaletteMarque colors={da.colors} /> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
            <div>
              <div style={daLbl}>Typographie</div>
              {da.fonts.length ? (
                // Chaque police dans SA propre fonte, en grand · on reconnaît le
                // caractère, pas seulement son nom. Repli système si non chargée.
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {da.fonts.map((f) => (
                    <div key={f} style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', padding: '11px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2, rgba(255,255,255,.03))' }}>
                      <span style={{ fontSize: 21, fontWeight: 600, color: 'var(--ink)', fontFamily: `'${f}', system-ui, sans-serif`, lineHeight: 1.15, minWidth: 0, wordBreak: 'break-word' }}>{f}</span>
                      <span style={{ fontSize: 15, color: 'var(--muted)', fontFamily: `'${f}', system-ui, sans-serif` }}>Aa Bb Cc</span>
                    </div>
                  ))}
                </div>
              ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)' }}>Aucune couleur ni police pour l'instant · récupère la DA depuis le site pour les remplir.</div>
        )}
      </section>

      {/* ── Charte & kit · logo, style déduit et actions de DA ───────────────── */}
      <section id="charte" style={{ ...sectionCard, scrollMarginTop: 90 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={sectionTitre}><Icon name="layers" size={15} /> Charte & kit</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>Logo et style déduit du site · appliqués automatiquement à tes pubs.</div>
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

        {/* Le logo (+ ses variantes réelles) · l'état vide dit une phrase, pas une
            boîte grise · le geste « Récupérer la DA » reste au-dessus. */}
        {!editing && (
          <div style={{ marginTop: 16 }}>
            <div style={daLbl}>Logo</div>
            {da.logoUrl
              ? <img src={da.logoUrl} alt="" style={{ height: 56, maxWidth: 200, objectFit: 'contain', background: 'rgba(255,255,255,.06)', borderRadius: 10, padding: 8 }} />
              : <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Aucun logo · récupère la DA pour l'importer depuis le site.</span>}
            {/* Les variantes réelles du logo (clair, foncé, icône) déjà en base ·
                de vraies miniatures qui aident à reconnaître chaque version, pas
                une décoration. Affichées seulement s'il en existe plus d'une. */}
            {logoList.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {logoList.map((u) => (
                  <img key={u} src={u} alt="" style={{ height: 28, maxWidth: 92, objectFit: 'contain', background: 'rgba(255,255,255,.06)', borderRadius: 6, padding: 4, border: '1px solid rgba(255,255,255,.12)' }} />
                ))}
              </div>
            )}
          </div>
        )}
        {msg && <div style={{ marginTop: 12, fontSize: 12.5, color: ok ? '#9fe6b3' : '#f5b043' }}>{msg}</div>}
      </section>
    </div>
  );
}

const sectionCard = { border: '1px solid var(--line-2)', borderRadius: 16, background: 'var(--surface)', padding: '16px 18px', marginBottom: 14 } as const;
const sectionTitre = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)' } as const;
const daLbl = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 7 };
const taStyle = { width: '100%', marginTop: 4, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface-2, transparent)', color: 'var(--ink)', fontSize: 13, lineHeight: 1.45, resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const };
