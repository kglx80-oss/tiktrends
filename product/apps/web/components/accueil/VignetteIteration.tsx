'use client';

import { useState } from 'react';

/**
 * La vignette en tête d'une carte « Prochaines itérations » · la créative
 * gagnante RÉELLE (`adsmap_ads.asset_url` ou la miniature de sa créative),
 * servie telle quelle. Si l'image ne se charge pas (octets absents, hôte
 * bloqué), le cadre DISPARAÎT · jamais une icône brisée, jamais une image de
 * remplacement inventée (même parade que `ApercuReprise`).
 */
export function VignetteIteration({ src, titre }: { src: string; titre: string }) {
  const [erreur, setErreur] = useState(false);
  if (erreur) return null;
  return (
    <div data-vignette-iteration style={{ height: 132, borderRadius: 10, overflow: 'hidden', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <img
        src={src}
        alt={`Créative gagnante · ${titre}`}
        onError={() => setErreur(true)}
        ref={(el) => {
          // Rendue serveur, une image cassée échoue AVANT l'hydratation · on
          // rattrape l'état « déjà cassée » (même parade que HomeMarques).
          if (el && el.complete && el.naturalWidth === 0) setErreur(true);
        }}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
