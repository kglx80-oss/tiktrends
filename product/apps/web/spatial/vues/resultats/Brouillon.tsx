import type { ReactNode } from 'react';
import type { DraftView } from '../../../app/actions/adsmap-draft';

/**
 * Le brouillon de concept écrit par Jarvis (`draftConceptAction`), dans le
 * langage de la maquette. L'ordre de l'ancien `DraftCard` · la réécriture
 * d'abord (ce qui met en doute), puis l'accroche, le déroulé, l'hypothèse, les
 * réserves · on lit ce qui inquiète avant ce qui rassure.
 */
export function Brouillon({ vue, children }: { vue: DraftView; children?: ReactNode }) {
  return (
    <div className="tile" style={{ marginTop: 10 }}>
      {vue.rewritten && <p style={{ fontSize: '12px', color: 'var(--good)' }}><b>Jarvis a réécrit son accroche</b> · la première reprenait une formulation qui avait déjà perdu ici.</p>}
      <p style={{ fontSize: '15px' }}><b>« {vue.draft.headline} »</b></p>
      <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3, fontSize: '13px' }}>
        {vue.draft.beats.map((b, i) => <li key={i}>{b}</li>)}
      </ol>
      <p className="muted" style={{ fontSize: '12.5px' }}><b>Hypothèse ·</b> {vue.draft.hypothesis}</p>
      {vue.warning && <p style={{ fontSize: '12px', color: 'var(--warn)' }}>{vue.warning}</p>}
      {vue.draft.rationale?.map((r, i) => <p key={i} className="faint" style={{ fontSize: '11.5px' }}>{r}</p>)}
      {children}
    </div>
  );
}
