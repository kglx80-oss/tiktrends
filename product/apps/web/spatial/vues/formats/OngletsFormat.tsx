'use client';

import { useState, type ReactNode } from 'react';

/**
 * Les onglets de la page d'un style (`div.seg.sec`, maquette `data-ftab`) · un
 * état d'écran, sans aller-retour serveur · chaque contenu est rendu par la page.
 */
export function OngletsFormat({ onglets }: { onglets: ReadonlyArray<{ cle: string; libelle: string; contenu: ReactNode }> }) {
  const [actif, setActif] = useState(onglets[0]?.cle ?? '');
  const courant = onglets.find((o) => o.cle === actif) ?? onglets[0];
  return (
    <>
      <div className="seg sec" role="group" aria-label="Bibliothèque du format" style={{ marginBottom: 16 }}>
        {onglets.map((o) => <button key={o.cle} type="button" aria-pressed={o.cle === courant?.cle} onClick={() => setActif(o.cle)}>{o.libelle}</button>)}
      </div>
      {courant?.contenu}
    </>
  );
}
