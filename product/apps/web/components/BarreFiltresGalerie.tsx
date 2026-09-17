'use client';

import { useId, type CSSProperties } from 'react';
import { criteresActifs, resumeCriteres, CRITERES_DEFAUT, type CriteresGalerie, type CritereQualite, type CriterePerf, type CritereTri } from '@tiktrends/core';
import { Icon } from './Icon';

/**
 * La barre de filtres locale d'une galerie · recherche + axes discrets + tri,
 * avec le résumé des critères actifs et un retour à zéro (CDC v7 · N06).
 *
 * La règle de filtrage/tri vit au noyau (`galerie-filtres`) · ici on n'expose
 * que les CHOIX et on remonte les critères. Chaque champ porte un libellé
 * associé · on filtre au clavier comme à la souris.
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
  const actifs = criteresActifs(criteres);
  const resume = resumeCriteres(criteres, formatLabel);
  const set = (p: Partial<CriteresGalerie>) => onChange({ ...criteres, ...p });

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
          <label htmlFor={rechId} style={sr}>Rechercher dans les pubs par titre</label>
          <span aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'inline-flex' }}><Icon name="search" size={15} /></span>
          <input id={rechId} type="search" value={criteres.recherche} onChange={(e) => set({ recherche: e.target.value })}
            placeholder="Rechercher un titre…"
            style={{ width: '100%', minWidth: 0, minHeight: 40, padding: '8px 12px 8px 34px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13 }} />
        </div>

        <Choix label="Format" value={criteres.format} onChange={(v) => set({ format: v })}
          options={[['toutes', 'Tous les formats'], ...formats.map((f) => [f, formatLabel(f)] as [string, string])]} />
        <Choix label="Qualité" value={criteres.qualite} onChange={(v) => set({ qualite: v as CritereQualite })}
          options={[['toutes', 'Toute qualité'], ['prete', 'Prête à diffuser'], ['a_verifier', 'À vérifier'], ['a_revoir', 'À revoir'], ['non_verifiee', 'Non vérifiée']]} />
        <Choix label="Performance" value={criteres.performance} onChange={(v) => set({ performance: v as CriterePerf })}
          options={[['toutes', 'Toute performance'], ['gagnante', 'Gagnante'], ['en_mesure', 'En mesure'], ['inconnue', 'Inconnue']]} />
        <Choix label="Tri" value={criteres.tri} onChange={(v) => set({ tri: v as CritereTri })}
          options={[['recent', 'Plus récentes'], ['ancien', 'Plus anciennes'], ['titre', 'Titre (A→Z)']]} />
      </div>

      {actifs > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          <span aria-live="polite"><b style={{ color: 'var(--ink-2)' }}>{nGarde}</b> sur {nTotal} · {resume}</span>
          <button type="button" onClick={() => onChange({ ...CRITERES_DEFAUT })}
            style={{ minHeight: 30, padding: '4px 11px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
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
  minHeight: 40, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line-2)',
  background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', maxWidth: '100%',
};
