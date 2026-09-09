'use client';

import { useGenerationsActives } from '../lib/generation-store';

/**
 * L'indicateur « ça tourne », visible PARTOUT dans l'app.
 *
 * Lit le store de générations (niveau module · survit à la navigation) et
 * s'affiche tant qu'au moins un lot est en cours · flottant, discret, en bas à
 * droite. Rien à l'écran quand rien ne tourne.
 */
export function IndicateurGenerations() {
  const jobs = useGenerationsActives();
  if (!jobs.length) return null;
  const visuels = jobs.reduce((n, j) => n + j.count, 0);
  return (
    <a
      href="/studio/ads"
      title="Des créas sont en cours de génération · clique pour revenir au studio"
      style={{
        position: 'fixed', right: 18, bottom: 18, zIndex: 60,
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', borderRadius: 999, textDecoration: 'none',
        background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13,
        boxShadow: '0 6px 20px rgba(0,0,0,.35)',
      }}
    >
      <span aria-hidden style={{
        width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(13,7,12,.35)',
        borderTopColor: '#0d070c', display: 'inline-block', animation: 'ig-spin 0.8s linear infinite',
      }} />
      {visuels} visuel{visuels > 1 ? 's' : ''} en cours…
      <style>{'@keyframes ig-spin{to{transform:rotate(360deg)}}'}</style>
    </a>
  );
}
