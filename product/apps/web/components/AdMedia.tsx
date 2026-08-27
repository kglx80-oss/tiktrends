'use client';

import { useState } from 'react';

/** Zone média d'une créa : miniature cliquable → lecture vidéo en direct. */
export function AdMedia({ mediaUrl, thumbnailUrl, isVideo, daysRunning, aspect = '1/1' }: {
  mediaUrl?: string; thumbnailUrl?: string; isVideo?: boolean; daysRunning?: number; aspect?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const canPlay = isVideo && !!mediaUrl;

  if (playing && mediaUrl) {
    return (
      <div style={{ position: 'relative', aspectRatio: aspect, background: '#000' }}>
        <video src={mediaUrl} poster={thumbnailUrl} controls autoPlay playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  const inner = (
    <>
      {thumbnailUrl
         
        ? <img src={thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 12 }}>Aperçu indisponible</div>}
      {daysRunning != null && <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(0,0,0,.65)', color: '#fff' }}>{daysRunning} j actifs</span>}
      {canPlay && (
        <span style={{ position: 'absolute', inset: 0, margin: 'auto', width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,.55)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
    </>
  );

  // Vidéo : lecture en place. Sinon (image) : ouvre le média en grand dans un onglet.
  if (canPlay) {
    return (
      <button type="button" onClick={() => setPlaying(true)} aria-label="Lire la vidéo"
        style={{ position: 'relative', aspectRatio: aspect, display: 'block', width: '100%', padding: 0, border: 'none', cursor: 'pointer', background: 'var(--paper)' }}>
        {inner}
      </button>
    );
  }
  return (
    <a href={mediaUrl || thumbnailUrl || '#'} target="_blank" rel="noreferrer"
      style={{ position: 'relative', aspectRatio: aspect, display: 'block', background: 'var(--paper)' }}>
      {inner}
    </a>
  );
}
