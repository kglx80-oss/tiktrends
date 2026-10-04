'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { importBrandDAAction, saveBrandDAAction, extractBrandVisualDaAction, saveBrandVisualDaAction } from '../../../actions/brand-detail';
import { BrandGuidelines } from '../../../../components/BrandGuidelines';
import { PaletteMarque } from './PaletteMarque';
import { Icon } from '../../../../components/Icon';
import { CIBLE_TACTILE_MIN, costFor, daVisuelleUtile, normaliserDaVisuelle, policeTechnique, SECTIONS_IDENTITE, HAUTEUR_ENTETE_APP, MARGE_BARRE_INDEX, MARGE_ANCRE_SECTION, SEUIL_SECTION_ACTIVE, type DaVisuelleMarque } from '@tiktrends/core';

// L'identité visuelle se lit en DEUX sections distinctes · les tokens bruts
// (couleurs + typographie) d'un côté, le kit (logo + style déduit + actions) de
// l'autre. Chaque section porte sa propre ancre · JAMAIS deux libellés vers le
// même point. L'index en tête surligne la section en vue.
// Libellés, sous-titres et ancres · la MÊME source que le rail « Marque »
// (packages/core · identite-marque) · « Styles » / « Brand kits ».
const SECTIONS = SECTIONS_IDENTITE;
const sectionDe = (id: 'couleurs' | 'charte') => SECTIONS.find((s) => s.id === id)!;

// L'assise NEUTRE d'un logo · un gris moyen (luminance ≈ 0,18) où un logo NOIR
// comme un logo BLANC tiennent ≈ 4,6:1, sans retoucher leur dessin (même choix
// que la carte de marque de la Home · #708). L'ancien `rgba(255,255,255,.06)`,
// quasi transparent sur la surface sombre, effaçait un logo sombre (ex. Klorea).
const FOND_LOGO = '#767676';

/**
 * La police est-elle RÉELLEMENT disponible pour un rendu fidèle ? On ne se fie PAS
 * à `document.fonts.check` (généreux · il a renvoyé vrai pour « Playfair Display »
 * absente, d'où un faux spécimen sans empattements). On MESURE · on dessine un
 * texte dans la police candidate PUIS dans une police de repli neutre ; si la
 * largeur diffère, la police a bien changé le rendu → elle est disponible. Sinon
 * elle retombe sur le repli · aucun spécimen fidèle possible. Aucun chargement
 * externe · on ne teste que ce que le navigateur a déjà.
 */
function policeDisponible(nom: string): boolean {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return false;
    const echantillon = 'mmmmmwwwwwiiiii0123';
    const mesure = (famille: string) => { ctx.font = `28px ${famille}`; return ctx.measureText(echantillon).width; };
    // Deux repères neutres · la police n'est disponible que si elle DÉPLACE la
    // largeur par rapport aux DEUX (sinon elle coïncide avec un repli).
    const base1 = mesure('monospace'), base2 = mesure('serif');
    const t1 = mesure(`'${nom}', monospace`), t2 = mesure(`'${nom}', serif`);
    return Math.abs(t1 - base1) > 0.5 && Math.abs(t2 - base2) > 0.5;
  } catch { return false; }
}

/**
 * L'aperçu d'une police · HONNÊTE. Un vrai spécimen n'est montré que si la police
 * est prouvée disponible (mesure ci-dessus) · sinon on nomme la police et on dit
 * que l'aperçu fidèle n'est pas disponible, plutôt que de simuler « Aa Bb Cc »
 * dans une police de repli (ce qui mentait · Playfair Display sans empattements).
 */
function ApercuPolice({ nom }: { nom: string }) {
  const [dispo, setDispo] = useState<boolean | null>(null);
  useEffect(() => {
    let vivant = true;
    const teste = () => { if (vivant) setDispo(policeDisponible(nom)); };
    teste();
    // Les fontes peuvent finir de charger après le montage · on re-teste une fois.
    (document.fonts?.ready ?? Promise.resolve()).then(teste);
    return () => { vivant = false; };
  }, [nom]);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', padding: '11px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2, rgba(255,255,255,.03))' }}>
      <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.15, minWidth: 0, wordBreak: 'break-word' }}>{nom}</span>
      {dispo === true
        // Police prouvée disponible · spécimen FIDÈLE, rendu dans sa fonte.
        ? <span style={{ fontSize: 20, color: 'var(--ink-2)', fontFamily: `'${nom}', system-ui, sans-serif` }}>Aa Bb Cc</span>
        // Non prouvée disponible · aucun faux spécimen · on le dit honnêtement.
        : <span style={{ fontSize: 12, color: 'var(--muted)' }}>{dispo === false ? '· police de la marque · aperçu fidèle indisponible' : '· police de la marque'}</span>}
    </div>
  );
}

/**
 * L'index de sections · deux puces qui mènent aux deux ancres, avec un état ACTIF
 * COHÉRENT · la puce active est la section sur laquelle on est posé. Balayage par
 * le HAUT · la section active est la DERNIÈRE dont le haut a atteint sa position
 * d'ancrage (`SEUIL_SECTION_ACTIVE`, dérivé de la marge d'ancrage mesurée).
 *
 * L'index est COLLANT, juste sous l'en-tête de l'app · après un saut d'ancre il
 * restait au-dessus de la section atteinte, donc glissé sous l'en-tête, puces
 * coupées (recette #710). Collé, il reste entier à l'écran · fond de page opaque
 * pour que le contenu passe dessous proprement.
 */
function IndexSections() {
  const [actif, setActif] = useState<string>('couleurs');
  useEffect(() => {
    const calcule = () => {
      let courant = SECTIONS[0]?.id ?? 'couleurs';
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= SEUIL_SECTION_ACTIVE) courant = s.id;
      }
      setActif(courant);
    };
    // Le hash explicite prime au clic · on cale tout de suite, le balayage suit.
    const surHash = () => { const h = window.location.hash.replace('#', ''); if (SECTIONS.some((s) => s.id === h)) setActif(h); };
    surHash();
    calcule();
    window.addEventListener('scroll', calcule, { passive: true });
    window.addEventListener('resize', calcule);
    window.addEventListener('hashchange', surHash);
    return () => { window.removeEventListener('scroll', calcule); window.removeEventListener('resize', calcule); window.removeEventListener('hashchange', surHash); };
  }, []);
  return (
    <nav aria-label="Sections de l'identité visuelle" style={{ position: 'sticky', top: HAUTEUR_ENTETE_APP, zIndex: 5, display: 'flex', gap: 8, flexWrap: 'wrap', padding: `${MARGE_BARRE_INDEX}px 0`, marginBottom: 4, background: 'var(--bg)' }}>
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
            <Icon name={s.icone} size={13} /> {s.libelle}
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

      {/* ── Styles · les tokens bruts de la marque (couleurs + typographie) ──── */}
      <section id="couleurs" style={{ ...sectionCard, scrollMarginTop: MARGE_ANCRE_SECTION }}>
        <div style={sectionTitre}><Icon name={sectionDe('couleurs').icone} size={15} /> {sectionDe('couleurs').libelle}</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{sectionDe('couleurs').sousTitre}</div>
        {(da.colors.length > 0 || da.fonts.length > 0) ? (
          <div style={{ display: 'grid', gap: 20, marginTop: 16 }}>
            <div>
              <div style={daLbl}>Couleurs</div>
              {da.colors.length ? <PaletteMarque colors={da.colors} /> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
            <div>
              <div style={daLbl}>Typographie</div>
              {da.fonts.length ? (
                // Le nom de chaque police · avec un spécimen FIDÈLE seulement si la
                // fonte est réellement chargée (sinon on ne ment pas · cf. ApercuPolice).
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {da.fonts.map((f) => <ApercuPolice key={f} nom={f} />)}
                </div>
              ) : <span style={{ fontSize: 12, color: 'var(--muted)' }}>·</span>}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)' }}>Aucune couleur ni police pour l'instant · récupère la DA depuis le site pour les remplir.</div>
        )}
      </section>

      {/* ── Brand kits · le kit de la marque (logo, variantes, style déduit) ──── */}
      <section id="charte" style={{ ...sectionCard, scrollMarginTop: MARGE_ANCRE_SECTION }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={sectionTitre}><Icon name={sectionDe('charte').icone} size={15} /> {sectionDe('charte').libelle}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>{sectionDe('charte').sousTitre}</div>
          </div>
          <button type="button" onClick={() => setEditing((v) => !v)} disabled={busy} style={{ minHeight: CIBLE_TACTILE_MIN, padding: '10px 16px', borderRadius: 999, border: '1px solid var(--line-2)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', background: 'transparent', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
            {editing ? 'Annuler' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="pen" size={13} /> Éditer</span>}
          </button>
          <button type="button" onClick={fetchDA} disabled={busy} style={{ minHeight: CIBLE_TACTILE_MIN, padding: '10px 18px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13, cursor: busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: 'var(--on-accent)', opacity: busy ? .6 : 1, whiteSpace: 'nowrap' }}>
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
              ? <img src={da.logoUrl} alt="" style={{ height: 56, maxWidth: 200, objectFit: 'contain', background: FOND_LOGO, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)', borderRadius: 10, padding: 8 }} />
              : <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Aucun logo · récupère la DA pour l'importer depuis le site.</span>}
            {/* Les variantes réelles du logo (clair, foncé, icône) déjà en base ·
                de vraies miniatures qui aident à reconnaître chaque version, pas
                une décoration. Affichées seulement s'il en existe plus d'une. */}
            {logoList.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {logoList.map((u) => (
                  <img key={u} src={u} alt="" style={{ height: 28, maxWidth: 92, objectFit: 'contain', background: FOND_LOGO, borderRadius: 6, padding: 4, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />
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
