import { dateCourteUtc, CIBLE_TACTILE_MIN, teinte, rangEtapeProjet, ORDRE_ETAPES_PROJET, type EtapeProjet } from '@tiktrends/core';
import type { CarteProjet as Carte } from '../../../lib/studios/sources/projet';
import { Icon } from '../../Icon';
import { surface } from '../../ui';

/**
 * Carte de reprise d'un projet (cahier 01 §4.1) · marque, type, étape, ce qui
 * manque, date. Le statut est porté par un MOT (jamais la couleur seule). Un
 * titre long est coupé à l'écran et complet au survol et au lecteur d'écran.
 *
 * ── Alignement V5 (image 5.webp) ──────────────────────────────────────────────
 *
 * Bandeau de type + pastille de version en tête, barre de progression des
 * étapes sous le titre · toutes des données RÉELLES (`libelleType`, `versionN`,
 * `etape`). Pas de vignette d'image : un projet n'a pas d'aperçu généré à ce
 * stade, on montre le pictogramme NEUTRE de son type, jamais une image inventée.
 */

/** Le rôle de tokens.css qui teinte chaque étape · la pastille en porte le
 *  point plein, la bordure (ancien suffixe `66` · 102/255) et le fond (`1a` · 26/255). */
export const ROLE_ETAPE: Readonly<Record<EtapeProjet, 'warn' | 'ok' | 'info'>> = {
  brief_a_completer: 'warn',
  brief_pret: 'ok',
  production: 'info',
};

/** Le pictogramme NEUTRE du type de projet · jamais une image générée. */
const ICONE_TYPE: Readonly<Record<string, string>> = { image: 'image', video: 'film', ads: 'sparkles', text: 'file', campaign: 'layers' };

export function PastilleEtape({ etape, libelle }: { etape: EtapeProjet; libelle: string }) {
  const r = ROLE_ETAPE[etape];
  return (
    <span data-etape={etape} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink)', padding: '3px 9px', borderRadius: 999, border: `1px solid ${teinte(r, 0x66 / 255)}`, background: teinte(r, 0x1a / 255), whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: `var(--${r})` }} />{libelle}
    </span>
  );
}

/** La barre d'étapes · trois segments, autant remplis que le rang de l'étape (la couleur ne dit jamais seule, le mot l'accompagne via la pastille). */
export function BarreEtapes({ etape }: { etape: EtapeProjet }) {
  const rang = rangEtapeProjet(etape);
  return (
    <span aria-hidden data-barre-etape={etape} style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
      {ORDRE_ETAPES_PROJET.map((e, i) => (
        <span key={e} style={{ height: 4, width: 26, borderRadius: 2, background: i < rang ? 'var(--accent-strong)' : 'var(--line-2)' }} />
      ))}
    </span>
  );
}

export function CarteProjet({ carte }: { carte: Carte }) {
  const bloquants = carte.manques.filter((m) => m.bloquant);
  const affiches = (bloquants.length ? bloquants : carte.manques).slice(0, 3);
  return (
    <a href={`/studio/projets/${carte.id}`} data-projet={carte.id} aria-label={`${carte.title} · ${carte.marque} · ${carte.libelleEtape}`}
      style={{ ...surface, background: 'var(--surface)', padding: 16, display: 'grid', gap: 10, textDecoration: 'none', color: 'inherit', minHeight: CIBLE_TACTILE_MIN, minWidth: 0 }}>
      {/* Bandeau · type (pictogramme neutre + libellé) à gauche, version réelle à droite. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', padding: '3px 9px', borderRadius: 999, background: 'var(--paper)', minWidth: 0 }}>
          <span aria-hidden style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}><Icon name={ICONE_TYPE[carte.kind] ?? 'folder'} size={13} /></span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{carte.libelleType}</span>
        </span>
        {carte.versionN != null && (
          <span data-version style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-2)', padding: '3px 8px', borderRadius: 999, background: 'var(--paper)', whiteSpace: 'nowrap' }}>V{carte.versionN}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={carte.marque}>{carte.marque || 'Marque'}</span>
      </div>
      <h2 title={carte.title} style={{ margin: 0, fontSize: 16, fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{carte.title}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <PastilleEtape etape={carte.etape} libelle={carte.libelleEtape} />
        <BarreEtapes etape={carte.etape} />
      </div>
      {affiches.length > 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          <span style={{ color: 'var(--muted)' }}>Ce qui manque · </span>{affiches.map((m) => m.libelle).join(' · ')}
          {carte.manques.length > affiches.length && <span style={{ color: 'var(--muted)' }}> · et {carte.manques.length - affiches.length} autre{carte.manques.length - affiches.length > 1 ? 's' : ''}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>Rien ne manque.</div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Modifié le {dateCourteUtc(carte.updatedAt)} · {carte.sources} source{carte.sources > 1 ? 's' : ''}
      </div>
    </a>
  );
}
