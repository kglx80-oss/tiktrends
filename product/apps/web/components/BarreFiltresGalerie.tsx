'use client';

import { useId, useState, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { criteresActifs, resumeCriteres, CRITERES_DEFAUT, type CriteresGalerie, type CritereQualite, type CriterePerf, type CritereTri } from '@tiktrends/core';
import { Icon } from './Icon';

/**
 * La barre de filtres locale d'une galerie · UNE barre recherche + tri, et les
 * FILTRES (format, qualité, performance) à la demande, dans un panneau (CDC v7 ·
 * N06, recomposé pour Pubs IA). Le panneau reste toujours dans le DOM (`hidden`
 * quand replié) · découvrable au clavier via le bouton « Filtres », et sans
 * champ orphelin. Chaque champ porte un libellé associé · on filtre au clavier
 * comme à la souris. La règle de filtrage/tri vit au noyau (`galerie-filtres`).
 */
export function BarreFiltresGalerie({ criteres, onChange, formats, formatLabel, nGarde, nTotal }: {
  criteres: CriteresGalerie;
  onChange: (c: CriteresGalerie) => void;
  /** Les formats présents dans la galerie · seuls ceux-là sont proposés. */
  formats: string[];
  formatLabel: (f: string) => string;
  /** Combien de pubs après filtre, sur combien au total · le compte honnête. */
  nGarde: number;
  nTotal: number;
}) {
  const rechId = useId();
  const panneauId = useId();
  const [ouvert, setOuvert] = useState(false);
  const actifs = criteresActifs(criteres);
  const resume = resumeCriteres(criteres, formatLabel);
  const set = (p: Partial<CriteresGalerie>) => onChange({ ...criteres, ...p });
  // Combien de FILTRES actifs (hors recherche/tri) · le badge du bouton, pour
  // savoir qu'un filtre agit même quand le panneau est replié.
  const nFiltres = (criteres.format !== 'toutes' ? 1 : 0) + (criteres.qualite !== 'toutes' ? 1 : 0) + (criteres.performance !== 'toutes' ? 1 : 0);

  return (
    <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
      {/* La barre · recherche (prend la place), tri, et le bouton Filtres. Sur
          mobile, ces trois éléments s'empilent proprement (flex-wrap). */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <label htmlFor={rechId} style={sr}>Rechercher dans les pubs par titre</label>
          <span aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="search" size={15} /></span>
          <input id={rechId} type="search" value={criteres.recherche} onChange={(e) => set({ recherche: e.target.value })}
            placeholder="Rechercher un titre…"
            style={{ width: '100%', minWidth: 0, minHeight: CIBLE_TACTILE_MIN, padding: '8px 12px 8px 36px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>

        <Choix label="Tri" value={criteres.tri} onChange={(v) => set({ tri: v as CritereTri })}
          options={[['recent', 'Plus récentes'], ['ancien', 'Plus anciennes'], ['titre', 'Titre (A→Z)']]} />

        <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-controls={panneauId} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: CIBLE_TACTILE_MIN,
          padding: '0 15px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
          border: `1px solid ${nFiltres > 0 ? 'var(--accent-strong)' : 'var(--line-2)'}`,
          background: 'var(--surface)', color: nFiltres > 0 ? 'var(--accent-strong)' : 'var(--ink-2)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
          Filtres
          {nFiltres > 0 && <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 999, padding: '0 5px', fontSize: 10.5, fontWeight: 800, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>{nFiltres}</span>}
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ouvert ? '▴' : '▾'}</span>
        </button>
      </div>

      {/* Le panneau de filtres · à la demande, mais TOUJOURS dans le DOM (`hidden`
          quand replié). Sur mobile il s'empile · c'est un panneau accessible. */}
      <div id={panneauId} style={{ display: ouvert ? 'flex' : 'none', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '11px 12px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>
        <Choix label="Format" value={criteres.format} onChange={(v) => set({ format: v })}
          options={[['toutes', 'Tous les formats'], ...formats.map((f) => [f, formatLabel(f)] as [string, string])]} />
        <Choix label="Qualité" value={criteres.qualite} onChange={(v) => set({ qualite: v as CritereQualite })}
          options={[['toutes', 'Toute qualité'], ['prete', 'Prête à diffuser'], ['a_verifier', 'À vérifier'], ['a_revoir', 'À revoir'], ['non_verifiee', 'Non vérifiée']]} />
        <Choix label="Performance" value={criteres.performance} onChange={(v) => set({ performance: v as CriterePerf })}
          options={[['toutes', 'Toute performance'], ['gagnante', 'Gagnante'], ['en_mesure', 'En mesure'], ['inconnue', 'Inconnue']]} />
      </div>

      {actifs > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          <span aria-live="polite"><b style={{ color: 'var(--ink-2)' }}>{nGarde}</b> sur {nTotal} · {resume}</span>
          <button type="button" onClick={() => onChange({ ...CRITERES_DEFAUT })}
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Effacer les filtres
          </button>
        </div>
      )}
    </div>
  );
}

function Choix({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>;
}) {
  const id = useId();
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
      <label htmlFor={id} style={sr}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

const sr: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const selectStyle: CSSProperties = {
  minHeight: CIBLE_TACTILE_MIN, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line-2)',
  background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', maxWidth: '100%',
};
