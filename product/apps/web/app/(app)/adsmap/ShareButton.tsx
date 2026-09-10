'use client';

import { useEffect, useState } from 'react';
import { SharePanel } from './SharePanel';
import { OUVRIR_PARTAGE } from './PartageGagnante';

/** Ouvre le panneau de partage · le panneau lui-même n'est monté qu'à l'ouverture. */
export function ShareButton() {
  const [open, setOpen] = useState(false);

  // Le panneau d'arbitrage d'une créa gagnante peut demander l'ouverture · un
  // événement suffit et garde les deux composants découplés (pas d'état remonté).
  useEffect(() => {
    const ouvrir = () => setOpen(true);
    window.addEventListener(OUVRIR_PARTAGE, ouvrir);
    return () => window.removeEventListener(OUVRIR_PARTAGE, ouvrir);
  }, []);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{
        padding: '8px 16px', borderRadius: 999, border: '1px solid var(--line-2)',
        background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
      }}>
        Partager au client
      </button>
      <SharePanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
