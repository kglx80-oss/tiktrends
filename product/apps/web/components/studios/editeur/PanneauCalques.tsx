'use client';

import { calquesParZ, type DocumentStudio } from '@tiktrends/core';
import { Icon } from '../../Icon';
import { bouton, LIBELLE_TYPE, legende, panneau, titrePanneau } from './styles';

/**
 * Le panneau des calques · du premier plan vers l'arrière-plan (comme on les
 * voit). Choisir un calque, le masquer ou le verrouiller se fait ici, au
 * clavier comme au doigt ; ajouter un texte, une forme ou un média du projet
 * aussi. Un nom long est tronqué à l'écran, entier dans l'infobulle et pour le
 * lecteur d'écran.
 */
export function PanneauCalques({
  doc, selection, editable, onChoisir, onVisibilite, onVerrou, onAjouterTexte, onAjouterForme, onAjouterMedia,
}: {
  doc: DocumentStudio;
  selection: string | null;
  editable: boolean;
  onChoisir: (id: string, declencheur: HTMLElement) => void;
  onVisibilite: (id: string, visible: boolean) => void;
  onVerrou: (id: string, locked: boolean) => void;
  onAjouterTexte: () => void;
  onAjouterForme: (forme: 'rect' | 'ellipse') => void;
  onAjouterMedia: () => void;
}) {
  const pile = calquesParZ(doc).reverse();
  return (
    <section aria-labelledby="titre-calques" data-panneau="calques" style={{ ...panneau, display: 'grid', gap: 12, alignContent: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="titre-calques" style={titrePanneau}>Calques</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{pile.length}</span>
      </div>

      {editable && (
        <div role="group" aria-label="Ajouter un calque" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" onClick={onAjouterTexte} style={bouton}><Icon name="plus" size={14} />Texte</button>
          <button type="button" onClick={() => onAjouterForme('rect')} style={bouton}><Icon name="plus" size={14} />Rectangle</button>
          <button type="button" onClick={() => onAjouterForme('ellipse')} style={bouton}><Icon name="plus" size={14} />Ellipse</button>
          <button type="button" onClick={onAjouterMedia} style={bouton}><Icon name="image" size={14} />Média</button>
        </div>
      )}

      {pile.length === 0 ? (
        <p style={legende}>Aucun calque · {editable ? 'ajoute un texte, une forme ou un média du projet.' : 'ce document est vide.'}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {pile.map((c) => {
            const choisi = c.id === selection;
            const etat = [!c.visible ? 'masqué' : null, c.locked ? 'verrouillé' : null].filter(Boolean).join(', ');
            return (
              <li key={c.id} data-ligne-calque={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 12, background: choisi ? 'var(--accent-soft)' : 'transparent' }}>
                <button
                  type="button"
                  aria-pressed={choisi}
                  aria-label={`${LIBELLE_TYPE[c.kind]} · ${c.name}${etat ? ` · ${etat}` : ''}`}
                  title={c.name}
                  onClick={(e) => onChoisir(c.id, e.currentTarget)}
                  style={{
                    ...bouton, flex: 1, minWidth: 0, justifyContent: 'flex-start', border: '1px solid transparent',
                    color: c.visible ? 'var(--ink)' : 'var(--muted)', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>{LIBELLE_TYPE[c.kind]}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.name}</span>
                  {!c.visible && <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>masqué</span>}
                </button>
                {editable && (
                  <>
                    <button
                      type="button"
                      aria-pressed={!c.visible}
                      aria-label={c.visible ? `Masquer « ${c.name} »` : `Afficher « ${c.name} »`}
                      title={c.visible ? 'Masquer' : 'Afficher'}
                      onClick={() => onVisibilite(c.id, !c.visible)}
                      style={{ ...bouton, padding: '6px 8px', fontSize: 12, color: c.visible ? 'var(--ink-2)' : 'var(--warn)' }}
                    >{c.visible ? 'Masquer' : 'Afficher'}</button>
                    <button
                      type="button"
                      aria-pressed={c.locked}
                      aria-label={c.locked ? `Déverrouiller « ${c.name} »` : `Verrouiller « ${c.name} »`}
                      title={c.locked ? 'Déverrouiller' : 'Verrouiller'}
                      onClick={() => onVerrou(c.id, !c.locked)}
                      style={{ ...bouton, padding: 6, color: c.locked ? 'var(--accent-strong)' : 'var(--muted)', borderColor: c.locked ? 'var(--accent-strong)' : 'var(--line-2)' }}
                    ><Icon name="lock" size={15} /></button>
                  </>
                )}
                {!editable && c.locked && <span style={{ color: 'var(--muted)', padding: '0 8px' }} aria-hidden><Icon name="lock" size={14} /></span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
