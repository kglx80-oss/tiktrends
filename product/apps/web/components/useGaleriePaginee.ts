'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Une galerie paginée CÔTÉ SERVEUR · lot 13 (voir core/galerie-pagination).
 *
 * L'état tient UNE page (jamais toute la population) et sa borne de
 * consultation · changer de page relit cette page sous la même borne (ordre
 * stable, ni doublon ni perte) ; une réponse arrivée après une demande plus
 * récente est ignorée (clics rapides). `depuisLeDebut` relit la première page
 * sous une nouvelle borne fixée par le SERVEUR (après une génération) ;
 * `recharger` relit la page courante (après un archivage).
 */
export function useGaleriePaginee<T, P extends { items: T[]; page: number; jusqua: string }>(
  initial: P,
  charger: (q: { page: number; jusqua?: string }) => Promise<P>,
) {
  const [etat, setEtat] = useState<P>(initial);
  const [chargement, setChargement] = useState(false);
  const seq = useRef(0);
  const borne = useRef(initial.jusqua);
  borne.current = etat.jusqua;

  const lire = useCallback(async (page: number, jusqua: string | undefined) => {
    const n = ++seq.current;
    setChargement(true);
    try {
      const r = await charger({ page, jusqua });
      if (n === seq.current) setEtat(r);
    } finally {
      if (n === seq.current) setChargement(false);
    }
  }, [charger]);

  return {
    etat,
    chargement,
    aller: (page: number) => lire(page, borne.current),
    recharger: () => lire(etat.page, borne.current),
    depuisLeDebut: () => lire(0, undefined),
    setItems: (f: (l: T[]) => T[]) => setEtat((e) => ({ ...e, items: f(e.items) })),
  };
}
