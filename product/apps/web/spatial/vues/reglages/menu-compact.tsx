'use client';

import { useId, useState } from 'react';
import { railCookieString } from '../../../lib/rail-preference';
import { useSpatial } from '../../coquille/contexte';

/**
 * Lot 13 bis V5 (CA P14) · « Menu compact sur ordinateur » dans Mon profil ·
 * UNE case native qui reflète et change l'état RÉEL du rail · le même que
 * « [ » et le bouton « Réduire le menu » (cookie `tt_rail`, `railCookieString`).
 *
 * Dans la coquille, la case lit l'état affiché du rail (`useSpatial().rail`,
 * lui-même lu au rendu serveur dans le cookie · le premier pixel est juste,
 * rien ne saute) et le bascule par la coquille · « [ » ailleurs, la case suit.
 * Hors coquille (rendu isolé), elle part de `initiale` (cookie lu par la page)
 * et n'écrit que le cookie.
 */
export function ChoixMenuCompact({ initiale }: { initiale: boolean }) {
  const id = useId();
  const { rail } = useSpatial();
  const [seul, setSeul] = useState(initiale);
  const [annonce, setAnnonce] = useState('');
  const compact = rail ? !rail.ouvert : seul;
  const changer = () => {
    let replie: boolean;
    if (rail) replie = !rail.basculer();
    else {
      replie = !seul;
      try { document.cookie = railCookieString(replie); } catch { /* cookie indisponible · l'état suit quand même */ }
      setSeul(replie);
    }
    setAnnonce(replie ? 'Menu compact · seules les icônes restent' : 'Menu déployé');
  };
  return (
    <div data-zone="menu-compact" style={{ display: 'grid', gap: 4 }}>
      <label className="member" htmlFor={`${id}-c`} style={{ minHeight: 44, cursor: 'pointer' }}>
        <span style={{ display: 'grid', gap: 2 }}>
          <strong>Menu compact sur ordinateur</strong>
          <small className="faint" id={`${id}-d`} style={{ fontSize: 12.5 }}>Le menu de gauche ne garde que ses icônes · comme la touche [ · gardé sur ce navigateur</small>
        </span>
        <input id={`${id}-c`} type="checkbox" data-menu-compact="" checked={compact} onChange={changer} aria-describedby={`${id}-d`}
          style={{ width: 22, height: 22, margin: '0 0 0 auto', flex: 'none', accentColor: 'var(--acc)', cursor: 'pointer' }} />
      </label>
      <span className="sr" role="status" aria-live="polite">{annonce}</span>
    </div>
  );
}
