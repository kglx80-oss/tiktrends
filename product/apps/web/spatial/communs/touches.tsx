'use client';

import { useId, type CSSProperties, type MouseEvent } from 'react';
import { PREFERENCES_TOUCHES_DEFAUT, toucheVisible, type GesteClavierLot, type ToucheVisible } from '@tiktrends/core';
import { useSpatial } from '../coquille/contexte';
import { Ic, Lien } from './base';

/**
 * Lot 13 ter V5 · les touches VISIBLES · à côté d'un geste qui a un raccourci,
 * un petit `<kbd>` discret, et `aria-keyshortcuts` sur le contrôle · tous deux
 * LUS dans la table (`toucheVisible`, noyau), jamais écrits à la main (la garde
 * `lot13t-raccourcis-visibles-rendu` refuse un `aria-keyshortcuts` littéral et
 * un `<kbd>` hors de ce module, de l'aide et de l'astuce de l'Accueil).
 *
 * La préférence et la plateforme viennent du contexte de la coquille (lues au
 * rendu serveur, suivies à chaque bascule) · coupés, une touche simple n'est
 * plus promise · ni `kbd` ni `aria-keyshortcuts`. Ctrl K / ⌘ K reste.
 */

/** La touche d'une entrée de la table, telle que l'écran doit la promettre · `null` · rien à promettre. */
export function useToucheVisible(id: string): ToucheVisible | null {
  const { touches } = useSpatial();
  return toucheVisible(id, touches ?? PREFERENCES_TOUCHES_DEFAUT);
}

/** Le style discret d'une touche posée à côté d'un libellé · jetons de couleur seulement. */
const STYLE_DISCRET: CSSProperties = {
  display: 'inline-block', minWidth: 18, marginLeft: 8, padding: '0 6px', borderRadius: 6, border: '1px solid var(--edge)',
  font: 'inherit', fontSize: 11.5, lineHeight: '18px', textAlign: 'center', color: 'var(--fg3)', fontWeight: 500,
};

/**
 * Le `<kbd>` d'une touche · masqué aux lecteurs d'écran (le contrôle porte
 * `aria-keyshortcuts`, qui le dit une fois) · `lue` · une touche dans une
 * phrase d'aide, sans contrôle qui la porte · le lecteur d'écran la lit.
 * `nu` · sans style en ligne (la feuille de la maquette le stylise déjà,
 * `.search kbd`). Rien quand `t` est nul.
 */
export function Touche({ t, nu = false, lue = false, style }: { t: ToucheVisible | null; nu?: boolean; lue?: boolean; style?: CSSProperties }) {
  if (!t) return null;
  return <kbd aria-hidden={lue ? undefined : 'true'} data-touche={t.id} style={nu ? style : { ...STYLE_DISCRET, ...style }}>{t.touches.join(' ')}</kbd>;
}

/**
 * Un geste qui a un raccourci, VISIBLE · ouvert, un vrai lien (la même
 * navigation que la touche) · fermé, un bouton `aria-disabled` qui dit sa
 * raison (texte à côté, et le toast au clic, comme la touche). La touche et
 * `aria-keyshortcuts` viennent de la table (`raccourci`) · rien quand les
 * raccourcis à une touche sont coupés. Cible de 44 px.
 */
export function GesteClavier({ raccourci, libelle, icone, geste, onActiver }: {
  /** L'entrée de la table (`RACCOURCIS`) que le geste porte. */
  raccourci: string;
  libelle: string;
  icone: string;
  geste: GesteClavierLot;
  /** Ouvert · ce que fait le clic à la place de la navigation par défaut (l'ancre d'une section · le focus y est posé). Fermé · dire la raison. */
  onActiver?: () => void;
}) {
  const t = useToucheVisible(raccourci);
  const id = useId();
  if (!geste.href) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn sm" data-geste-clavier={raccourci} data-ferme="" aria-disabled="true" aria-describedby={`${id}-r`} aria-keyshortcuts={t?.aria}
          onClick={onActiver} style={{ minHeight: 44, opacity: 0.55, cursor: 'default' }}>
          <Ic n={icone} />{libelle}<Touche t={t} />
        </button>
        <span className="faint" id={`${id}-r`} data-raison-ferme={raccourci} style={{ fontSize: 11.5, flex: '1 1 220px' }}>{geste.raison}</span>
      </span>
    );
  }
  const clic = onActiver ? (e: MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); onActiver(); } : undefined;
  return (
    <Lien className="btn sm" href={geste.href} data-geste-clavier={raccourci} aria-keyshortcuts={t?.aria} onClick={clic} style={{ minHeight: 44 }}>
      <Ic n={icone} />{libelle}<Touche t={t} />
    </Lien>
  );
}
