'use client';

import { decrireDifferences, type DifferenceVersion, type DocumentStudio, type ResultatReapplication } from '@tiktrends/core';
import { Modal } from '../../Modal';
import { bouton, boutonInactif, boutonPrimaire, legende } from './styles';

/**
 * Conflit 409 · une autre session a enregistré une version pendant l'édition.
 * Rien n'a été écrasé. On montre ce qui a changé de son côté, puis deux
 * choix : recharger la version courante (mes modifications restent dans la
 * copie de secours de l'appareil), ou recharger et réappliquer mes
 * modifications quand elles ne touchent pas les mêmes champs.
 */
export interface EtatConflit {
  differences: DifferenceVersion[];
  versionCouranteId: string;
  /** Version courante relue · `null` tant qu'elle charge. */
  courant: { version: { id: string; n: number }; document: DocumentStudio | null } | null;
  reapplication: ResultatReapplication | null;
  erreurRelecture: string | null;
}

export function DialogueConflit({
  ouvert, conflit, baseN, docs, onFermer, onRecharger, onReappliquer,
}: {
  ouvert: boolean;
  conflit: EtatConflit;
  baseN: number;
  docs: Array<DocumentStudio | null>;
  onFermer: () => void;
  onRecharger: () => void;
  onReappliquer: () => void;
}) {
  const phrases = decrireDifferences(conflit.differences, [conflit.courant?.document ?? null, ...docs]);
  const r = conflit.reapplication;
  const possible = !!r && r.ok;
  return (
    <Modal
      open={ouvert}
      onClose={onFermer}
      title="Conflit de version"
      subtitle={`Une autre session a enregistré ${conflit.courant ? `la version ${conflit.courant.version.n}` : 'une nouvelle version'} pendant que tu modifiais la version ${baseN}. Rien n’a été écrasé.`}
      maxWidth={560}
    >
      <div data-dialogue="conflit" style={{ display: 'grid', gap: 14 }}>
        <div>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Ce qui a changé de son côté</p>
          {phrases.length === 0
            ? <p style={legende}>Le détail n’est pas disponible · recharge pour voir la version courante.</p>
            : (
              <ul data-differences style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13, color: 'var(--ink-2)' }}>
                {phrases.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
        </div>

        {!conflit.courant && !conflit.erreurRelecture && <p role="status" style={legende}>Chargement de la version courante…</p>}
        {conflit.erreurRelecture && <p role="alert" style={{ ...legende, color: 'var(--err)' }}>{conflit.erreurRelecture}</p>}
        {r && !r.ok && (
          <p style={legende}>
            Tes modifications touchent les mêmes éléments que les siennes · elles ne peuvent pas être réappliquées sans en écraser une partie.
            Elles restent dans la copie de secours de cet appareil.
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={onRecharger} disabled={!conflit.courant} style={{ ...bouton, ...(!conflit.courant ? boutonInactif : {}) }}>
            Recharger la version courante
          </button>
          <button
            type="button"
            onClick={onReappliquer}
            disabled={!possible}
            aria-describedby="aide-reappliquer"
            style={{ ...boutonPrimaire, ...(!possible ? boutonInactif : {}) }}
          >
            Recharger et réappliquer mes modifications
          </button>
        </div>
        <p id="aide-reappliquer" style={legende}>
          « Recharger » abandonne tes modifications à l’écran (la copie de secours de cet appareil les garde).
          « Réappliquer » les rejoue sur la version courante ; tu enregistres ensuite toi-même.
        </p>
      </div>
    </Modal>
  );
}
