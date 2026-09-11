'use client';

import type { DebriefLot } from '@tiktrends/core';
import { Icon } from '../../../../components/Icon';

/**
 * Ce que le dernier lot entière vaut, dit d'un coup, au-dessus de la grille.
 *
 * ── Pourquoi ici, et pas seulement carte par carte ───────────────────────────
 *
 * Chaque carte porte déjà son constat de relecture · mais lire « ce lot est-il
 * bon » carte par carte est justement le coût qu'on veut supprimer sur le
 * premier lot de contrôle. Le débrief l'additionne : combien tiennent nos mots,
 * combien gardent le produit, en une phrase.
 *
 * ── Ce qu'il ne fait pas ─────────────────────────────────────────────────────
 *
 * Il ne conclut pas sur un moteur · c'est le rôle du cumul, dans Jarvis, avec
 * ses intervalles. Ici on COMPTE ce lot-ci. La couleur suit le seul verdict
 * qu'un lot mérite : vert quand rien d'éliminatoire n'a été vu, ambre sinon.
 *
 * `null` quand rien n'a été relu · lot composé, ou relecteur absent · et alors
 * rien ne s'affiche, parce qu'il n'y a rien à dire.
 *
 * Pur affichage · aucune règle, aucun appel serveur. Rendu et lu en test.
 */
export function DebriefLotPanel({ d }: { d: DebriefLot | null }) {
  if (!d) return null;
  const vert = d.toutBon;
  return (
    <div style={{
      margin: '0 0 14px', padding: '11px 14px', borderRadius: 12,
      border: `1px solid ${vert ? 'rgba(126,232,191,.35)' : 'rgba(245,166,35,.4)'}`,
      background: vert ? 'rgba(126,232,191,.08)' : 'rgba(245,166,35,.08)',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 4 }}>
        DERNIER LOT · GÉNÉRÉ ENTIÈREMENT
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: vert ? '#7ee8bf' : '#f5b043' }}>
        {vert ? '✓ ' : <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4 }}><Icon name="alert" size={13} /></span>}{d.resume}
      </div>
    </div>
  );
}
