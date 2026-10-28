'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { partSolde } from '@tiktrends/core';
import { useSpatial } from '../coquille/contexte';
import { Anneau, Ic, Lien, formatNombre } from './base';

/**
 * Les briques communes INTERACTIVES · elles lisent le contexte de la coquille.
 * Un module client n'exporte que des composants, des hooks ou des types
 * (garde `spatial-fondation`) · une fonction exportée d'ici, appelée depuis
 * une page serveur, échouerait en production.
 */

/** La pastille de crédits de l'en-tête · anneau = solde / dotation. */
export function PastilleCredits() {
  const { credits } = useSpatial();
  return (
    <Lien className="credit" id="credit" href="/billing" title="Forfaits & crédits">
      <Anneau part={credits.illimite ? 100 : partSolde(credits.solde, credits.dotation)} taille={28} />
      {credits.illimite ? '∞' : formatNombre(credits.solde)}
    </Lien>
  );
}

/**
 * L'en-tête d'une vue (`header.top`) · titre, sous-titre, et les outils de la
 * maquette : recherche ⌘K, cloche, crédits, avatar. `outils="credits"` · la
 * variante courte de la maquette (Jarvis) : crédits et avatar seuls.
 */
export function EnTete({ titre, sous, outils = 'complets' }: { titre: ReactNode; sous?: ReactNode; outils?: 'complets' | 'credits' }) {
  const { utilisateur, nonLues, ouvrirPalette, basculer, panneau } = useSpatial();
  return (
    <header className="top">
      <div className="ttl">{sous != null && <small>{sous}</small>}<h1>{titre}</h1></div>
      <div className="tools">
        {outils === 'complets' ? (
          <>
            <button className="search" type="button" id="srch" onClick={ouvrirPalette}><Ic n="search" />Rechercher<kbd>⌘K</kbd></button>
            <button className="bell" id="bell" type="button" aria-haspopup="dialog" aria-expanded={panneau === 'notifs'} aria-label={nonLues ? `Notifications · ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'} onClick={() => basculer('notifs')}>
              <Ic n="bell" s={false} />{nonLues > 0 && <span className="nb">{nonLues > 99 ? '99+' : nonLues}</span>}
            </button>
            <PastilleCredits />
            <button className="me" id="me" type="button" aria-haspopup="dialog" aria-expanded={panneau === 'profil'} aria-label={`${utilisateur.nom || utilisateur.email}, profil`} onClick={() => basculer('profil')}>{utilisateur.initiales}</button>
          </>
        ) : (
          <>
            <PastilleCredits />
            <span className="me" aria-label={`${utilisateur.nom || utilisateur.email}, profil`}>{utilisateur.initiales}</span>
          </>
        )}
      </div>
    </header>
  );
}

/** Téléphone · le seuil de la maquette (`max-width:760px`). */
const MEDIA_TELEPHONE = '(max-width: 760px)';
function suivreTelephone(f: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MEDIA_TELEPHONE);
  mq.addEventListener('change', f);
  return () => mq.removeEventListener('change', f);
}
/**
 * Vrai sur un écran de téléphone · pour un geste que la feuille de la maquette
 * (intouchable) ne sait pas adapter. Le rendu serveur vaut ordinateur (donc la
 * parité avec la maquette), la lecture suit au montage et aux rotations.
 */
export function useTelephone(): boolean {
  return useSyncExternalStore(suivreTelephone, () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MEDIA_TELEPHONE).matches, () => false);
}
