'use client';

import { useState } from 'react';

/**
 * L'aperçu d'une pub dans une vignette Spatial · l'image, ou le repli
 * « Aperçu indisponible » de la V5 quand l'URL manque ou que l'image ne charge
 * pas (lien expiré, CDN qui refuse). Sans repli, la case restait vide.
 *
 * L'image peut échouer AVANT l'hydratation (rendu serveur) · son `error` est
 * alors perdu ; au montage, une image terminée sans pixel (`complete`,
 * `naturalWidth === 0`) bascule aussi sur le repli. L'échec est retenu POUR
 * cette URL · une nouvelle URL retente l'image.
 *
 * `alt` vide par défaut · la vignette est posée à côté du nom de l'annonceur,
 * l'image ne dit rien de plus. Le repli est un texte lu tel quel.
 */
export function ImageApercu({ src, alt = '', lazy = true }: { src: string | null | undefined; alt?: string; lazy?: boolean }) {
  const [echec, setEchec] = useState<string | null>(null);
  if (!src || echec === src) {
    return (
      <span className="muted" data-apercu="indisponible" style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, textAlign: 'center',
        background: 'var(--ink)', fontSize: 'clamp(8px, 7cqi, 12px)', lineHeight: 1.2, fontWeight: 500,
      }}>Aperçu indisponible</span>
    );
  }
  return (
    <img src={src} alt={alt} loading={lazy ? 'lazy' : undefined} referrerPolicy="no-referrer" onError={() => setEchec(src)}
      ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setEchec(src); }} />
  );
}
