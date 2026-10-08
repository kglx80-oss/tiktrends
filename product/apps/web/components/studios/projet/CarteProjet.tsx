import { dateCourteUtc, CIBLE_TACTILE_MIN, type EtapeProjet } from '@tiktrends/core';
import type { CarteProjet as Carte } from '../../../lib/studios/sources/projet';
import { surface } from '../../ui';

/**
 * Carte de reprise d'un projet (cahier 01 §4.1) · marque, type, étape, ce qui
 * manque, date. Le statut est porté par un MOT (jamais la couleur seule). Un
 * titre long est coupé à l'écran et complet au survol et au lecteur d'écran.
 */

export const COULEURS_ETAPE: Readonly<Record<EtapeProjet, string>> = {
  brief_a_completer: '#f5a623',
  brief_pret: '#18cc8c',
  production: '#3b82f6',
};

export function PastilleEtape({ etape, libelle }: { etape: EtapeProjet; libelle: string }) {
  const c = COULEURS_ETAPE[etape];
  return (
    <span data-etape={etape} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink)', padding: '3px 9px', borderRadius: 999, border: `1px solid ${c}66`, background: `${c}1a`, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{libelle}
    </span>
  );
}

export function CarteProjet({ carte }: { carte: Carte }) {
  const bloquants = carte.manques.filter((m) => m.bloquant);
  const affiches = (bloquants.length ? bloquants : carte.manques).slice(0, 3);
  return (
    <a href={`/studio/projets/${carte.id}`} data-projet={carte.id} aria-label={`${carte.title} · ${carte.marque} · ${carte.libelleEtape}`}
      style={{ ...surface, background: 'var(--surface)', padding: 16, display: 'grid', gap: 10, textDecoration: 'none', color: 'inherit', minHeight: CIBLE_TACTILE_MIN, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={carte.marque}>{carte.marque || 'Marque'}</span>
        <span aria-hidden style={{ color: 'var(--muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{carte.libelleType}</span>
      </div>
      <h2 title={carte.title} style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{carte.title}</h2>
      <div><PastilleEtape etape={carte.etape} libelle={carte.libelleEtape} /></div>
      {affiches.length > 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          <span style={{ color: 'var(--muted)' }}>Ce qui manque · </span>{affiches.map((m) => m.libelle).join(' · ')}
          {carte.manques.length > affiches.length && <span style={{ color: 'var(--muted)' }}> · et {carte.manques.length - affiches.length} autre{carte.manques.length - affiches.length > 1 ? 's' : ''}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Rien ne manque.</div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Modifié le {dateCourteUtc(carte.updatedAt)}{carte.versionN ? ` · version ${carte.versionN}` : ''} · {carte.sources} source{carte.sources > 1 ? 's' : ''}
      </div>
    </a>
  );
}
