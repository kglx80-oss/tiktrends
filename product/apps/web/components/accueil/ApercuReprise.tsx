'use client';

import { useState } from 'react';

/**
 * L'aperçu du projet repris · une SORTIE LIVRÉE réelle, servie par la route
 * gardée (`/api/studios/media/:id`). Si l'image ne se charge pas (octets
 * absents du stockage, session changée), le cadre DISPARAÎT · jamais une icône
 * brisée, jamais une image de remplacement inventée.
 */
export function ApercuReprise({ src, titre }: { src: string; titre: string }) {
  const [erreur, setErreur] = useState(false);
  if (erreur) return null;
  return (
    <div data-apercu-reprise style={{ flex: '1 1 300px', minWidth: 0, minHeight: 180, maxHeight: 300, background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <img
        src={src}
        alt={`Dernière création livrée · ${titre}`}
        onError={() => setErreur(true)}
        ref={(el) => {
          // Rendue serveur, une image cassée échoue AVANT l'hydratation · on
          // rattrape l'état « déjà cassée » (même parade que HomeMarques).
          if (el && el.complete && el.naturalWidth === 0) setErreur(true);
        }}
        style={{ width: '100%', height: '100%', maxHeight: 300, objectFit: 'contain', display: 'block' }}
      />
    </div>
  );
}
