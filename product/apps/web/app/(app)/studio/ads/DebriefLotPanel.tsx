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
 * ses intervalles. Ici on COMPTE ce lot-ci.
 *
 * ── Trois tons, parce qu'il y a trois issues ─────────────────────────────────
 *
 * VERT · rien d'éliminatoire n'a été vu ET le produit a pu être regardé (au
 * moins une photo de référence). C'est le seul cas où « tout bon » est une vraie
 * bonne nouvelle.
 *
 * NEUTRE · rien d'éliminatoire côté copie, mais AUCUNE photo produit · la
 * fidélité du packaging n'a pas pu être vérifiée. La règle `toutBon` reste vraie
 * « côté copie » (on n'invente pas un défaut qu'on n'a pas regardé), mais peindre
 * ça en vert avec une coche ferait croire que le produit est validé alors qu'on
 * ne l'a pas vu. On le dit d'un ton neutre, avec l'invitation à fournir la photo.
 *
 * AMBRE · un écart éliminatoire a été vu (accroche réécrite, produit modifié,
 * texte illisible). Il y a quelque chose à reprendre.
 *
 * `null` quand rien n'a été relu · lot composé, ou relecteur absent · et alors
 * rien ne s'affiche, parce qu'il n'y a rien à dire.
 *
 * Pur affichage · aucune règle métier, aucun appel serveur. Rendu et lu en test.
 */
export function DebriefLotPanel({ d, nCassees = 0, onReprendre }: {
  d: DebriefLot | null;
  /** Combien de pubs du lot portent un écart éliminatoire · pilote le bouton de reprise. */
  nCassees?: number;
  /** Ouvre la première pub cassée pour la reprendre · absent = pas de bouton. */
  onReprendre?: () => void;
}) {
  if (!d) return null;
  // Le produit n'est « bon » que s'il a pu être REGARDÉ · sans photo de
  // référence, la fidélité du packaging n'a pas été vérifiée.
  const produitVerifie = d.avecReference > 0;
  const vert = d.toutBon && produitVerifie;
  const neutre = d.toutBon && !produitVerifie;
  const ton = vert
    ? { bord: 'rgba(126,232,191,.35)', fond: 'rgba(126,232,191,.08)', fg: '#7ee8bf' }
    : neutre
      ? { bord: 'var(--line-2)', fond: 'var(--surface)', fg: 'var(--ink-2)' }
      : { bord: 'rgba(245,166,35,.4)', fond: 'rgba(245,166,35,.08)', fg: '#f5b043' };
  // Le débrief COMPTE les défauts · le rendre actionnable, c'est amener d'un clic
  // sur la première pub à reprendre, au lieu de la chercher à l'œil dans la grille.
  // On ne reprend que du cassé (écart éliminatoire) · jamais un lot neutre.
  const reprenable = !d.toutBon && nCassees > 0 && !!onReprendre;
  return (
    <div style={{
      margin: '0 0 14px', padding: '11px 14px', borderRadius: 12,
      border: `1px solid ${ton.bord}`,
      background: ton.fond,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 4 }}>
        DERNIER LOT · GÉNÉRÉ ENTIÈREMENT
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: ton.fg }}>
        {vert
          ? '✓ '
          : <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 4 }}><Icon name={neutre ? 'info' : 'alert'} size={13} /></span>}{d.resume}
      </div>
      {reprenable && (
        <button type="button" onClick={onReprendre} style={{
          marginTop: 9, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
          border: '1px solid rgba(245,166,35,.5)', background: 'transparent',
          color: '#f5b043', fontSize: 11.5, fontWeight: 800,
        }}>
          <Icon name="swap" size={13} /> Reprendre {nCassees} pub{nCassees > 1 ? 's' : ''} cassée{nCassees > 1 ? 's' : ''} ›
        </button>
      )}
    </div>
  );
}
