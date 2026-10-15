'use client';

import { useState } from 'react';

/**
 * L'aperçu du projet repris · une SORTIE LIVRÉE réelle, servie par la route
 * gardée (`/api/studios/media/:id`). Si l'image ne se charge pas (octets
 * absents du stockage, session changée), le cadre DISPARAÎT · jamais une icône
 * brisée, jamais une image de remplacement inventée.
 *
 * `vignette` · le format de la rangée « Reprendre » (V5) · un carré de 56 px.
 */
export function ApercuReprise({ src, titre, vignette = false }: { src: string; titre: string; vignette?: boolean }) {
  const [erreur, setErreur] = useState(false);
  if (erreur) return null;
  const cadre = vignette
    ? { width: 56, height: 56, flexShrink: 0, borderRadius: 10 }
    : { flex: '1 1 300px', minWidth: 0, minHeight: 180, maxHeight: 300 };
  return (
    <div data-apercu-reprise style={{ ...cadre, background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <img
        src={src}
        alt={`Dernière création livrée · ${titre}`}
        onError={() => setErreur(true)}
        ref={(el) => {
          // Rendue serveur, une image cassée échoue AVANT l'hydratation · on
          // rattrape l'état « déjà cassée » (même parade que HomeMarques).
          if (el && el.complete && el.naturalWidth === 0) setErreur(true);
        }}
        style={vignette
          ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }
          : { width: '100%', height: '100%', maxHeight: 300, objectFit: 'contain', display: 'block' }}
      />
    </div>
  );
}
