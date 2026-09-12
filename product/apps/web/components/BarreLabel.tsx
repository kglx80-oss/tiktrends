import type { ReactNode } from 'react';
import { partDeMax } from '@tiktrends/core';
import { BarreValeur } from './BarreValeur';

/**
 * Une ligne « libellé · valeur · barre » · le motif qui revient dès qu'on classe
 * des choses par un compte (media mix, CTA, landing pages, plateformes…).
 *
 * Il vivait recopié à la main, chaque fois avec sa propre barre nue
 * (`<div style={{ width: N% }}>`) · muette pour l'assistive, et menteuse sur les
 * petites parts. On le rend une fois, sur `BarreValeur` (progressbar + filet
 * minimal) et `partDeMax` (part bornée, sûre) · la barre parle et ne ment plus.
 *
 * `valeur` est ce qu'on lit à droite du libellé · un compte brut (`n`) ou un
 * pourcentage déjà formaté, au choix de l'appelant · c'est du texte, pas la part.
 */
export function BarreLabel({ label, n, max, valeur, hauteur = 6, tronque = false }: {
  label: ReactNode;
  /** La valeur de cette ligne · numérateur de la part. */
  n: number;
  /** Le maximum du groupe · dénominateur de la part. */
  max: number;
  /** Ce qui s'affiche à droite (compte, pourcentage formaté…). Défaut : `n`. */
  valeur?: ReactNode;
  hauteur?: number;
  /** Coupe un libellé trop long (domaine, CTA verbeux) sur une ligne. */
  tronque?: boolean;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-2)', marginBottom: 4 }}>
        <span style={tronque
          ? { maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
          : { textTransform: 'capitalize' }}>{label}</span>
        <span>{valeur ?? n}</span>
      </div>
      <BarreValeur part={partDeMax(n, max)} hauteur={hauteur} />
    </div>
  );
}
