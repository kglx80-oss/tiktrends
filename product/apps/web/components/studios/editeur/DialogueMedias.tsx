'use client';

import { useState } from 'react';
import { Modal } from '../../Modal';
import type { MediaEditeur } from '../../../lib/studios/editeur/types';
import { bouton, legende, tuileMedia } from './styles';

/**
 * Poser un média DU PROJET comme calque · image ou logo. Le média est
 * référencé par son identifiant, jamais copié ni modifié ; aucune génération.
 */
export function DialogueMedias({
  ouvert, medias, apercus, onFermer, onChoisir,
}: {
  ouvert: boolean;
  medias: MediaEditeur[];
  apercus: Record<string, string>;
  onFermer: () => void;
  onChoisir: (m: MediaEditeur, kind: 'image' | 'logo') => void;
}) {
  const [kind, setKind] = useState<'image' | 'logo'>('image');
  return (
    <Modal open={ouvert} onClose={onFermer} title="Poser un média du projet" subtitle="Le fichier n’est ni copié ni modifié · aucune génération." maxWidth={560}>
      {medias.length === 0 ? (
        <p data-medias="vide" style={legende}>Aucune image dans ce projet pour l’instant · les images importées ou produites pour ce projet apparaîtront ici.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <legend style={{ ...legende, marginBottom: 6 }}>Poser comme</legend>
            {(['image', 'logo'] as const).map((k) => (
              <label key={k} style={{ ...bouton, gap: 8, borderColor: kind === k ? 'var(--accent-strong)' : 'var(--line-2)' }}>
                <input type="radio" name="kind-media" value={k} checked={kind === k} onChange={() => setKind(k)} style={{ width: 18, height: 18 }} />
                {k === 'image' ? 'Image (entière dans le document)' : 'Logo (20 % de la largeur)'}
              </label>
            ))}
          </fieldset>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))', gap: 8 }}>
            {medias.map((m) => (
              <li key={m.assetId}>
                <button type="button" onClick={() => onChoisir(m, kind)} style={tuileMedia} aria-label={`Poser ${m.nom}`}>
                  <span aria-hidden style={{ display: 'block', width: '100%', aspectRatio: `${m.width} / ${m.height}`, maxHeight: 120, background: 'var(--paper)', overflow: 'hidden', borderRadius: 8 }}>
                    {apercus[m.assetId]
                      ? <img src={apercus[m.assetId]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                      : null}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{m.nom}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
