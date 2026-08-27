'use client';

import { useState, useTransition, type CSSProperties } from 'react';
import { rateCreativeAction, type Rating } from '../app/actions/creatives';

/**
 * Barre d'actions d'une créa (Pubs / Image / Vidéo IA) : vrais boutons + raccourcis.
 * Ouvrir ⛶ · Télécharger ↗ · note de pertinence 👍/👎 (entraîne Jarvis) · Archiver ✕
 */
export function CreativeActions({ genId, rating: initial = null, onOpen, downloadUrl, onArchive, downloadName, archiveLabel = 'Archiver' }: {
  genId: string;
  rating?: Rating;
  onOpen?: () => void;
  downloadUrl?: string | null;
  onArchive?: () => void;
  downloadName?: string;
  archiveLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {onOpen && (
        <button type="button" onClick={onOpen} style={actBtn} title="Ouvrir en grand" aria-label="Ouvrir">
          <span aria-hidden style={{ fontSize: 14 }}>⛶</span>
        </button>
      )}
      {downloadUrl && (
        <a href={downloadUrl} download={downloadName} target="_blank" rel="noreferrer" style={{ ...actBtn, color: 'var(--accent-strong)', borderColor: 'rgba(254,44,85,.35)' }} title="Télécharger" aria-label="Télécharger">
          <span aria-hidden style={{ fontSize: 14 }}>↗</span>
        </a>
      )}

      <span style={{ flex: 1 }} />

      <RatingControl genId={genId} rating={initial} />

      {onArchive && (
        <button type="button" onClick={onArchive} style={{ ...actBtn, color: 'var(--muted)' }} title={archiveLabel} aria-label={archiveLabel}>
          <span aria-hidden style={{ fontSize: 13 }}>✕</span>
        </button>
      )}
    </div>
  );
}

/** Note de pertinence 👍/👎 · signal d'entraînement Jarvis (réutilisable). */
export function RatingControl({ genId, rating: initial = null, label }: { genId: string; rating?: Rating; label?: boolean }) {
  const [rating, setRating] = useState<Rating>(initial);
  const [, start] = useTransition();
  const rate = (next: Rating) => {
    const value = rating === next ? null : next; // re-cliquer = retirer la note
    setRating(value);
    start(async () => { await rateCreativeAction({ id: genId, rating: value }); });
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {label && <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>Pertinence</span>}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid var(--line-2)', borderRadius: 999, padding: 2 }} title="Pertinence pour ta marque · entraîne Jarvis">
        <button type="button" onClick={() => rate('up')} aria-label="Pertinent" title="Pertinent · Jarvis en tient compte" style={ratePill(rating === 'up', 'up')}><Thumb up /></button>
        <button type="button" onClick={() => rate('down')} aria-label="Pas pertinent" title="Pas pertinent · Jarvis en tient compte" style={ratePill(rating === 'down', 'down')}><Thumb /></button>
      </span>
    </span>
  );
}

const actBtn: CSSProperties = {
  width: 30, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9,
  border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)',
  cursor: 'pointer', textDecoration: 'none', flexShrink: 0, lineHeight: 1,
};

function ratePill(active: boolean, kind: 'up' | 'down'): CSSProperties {
  const on = kind === 'up' ? { c: '#18cc8c', bg: 'rgba(24,204,140,.16)' } : { c: '#ff6b81', bg: 'rgba(255,77,109,.16)' };
  return {
    width: 28, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999,
    border: 'none', background: active ? on.bg : 'transparent', color: active ? on.c : 'var(--muted)', cursor: 'pointer',
  };
}

function Thumb({ up = false }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: up ? 'none' : 'rotate(180deg)' }}>
      <path d="M7 10v11" />
      <path d="M7 10l4-7a2.5 2.5 0 0 1 3 2.4V9h4.3a2 2 0 0 1 2 2.4l-1.3 7a2 2 0 0 1-2 1.6H7" />
    </svg>
  );
}
