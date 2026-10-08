'use client';

import { useState } from 'react';
import { FORMATS_DOCUMENT, ORDRE_FORMATS, PART_PRODUIT_INITIALE, type FormatDocument, type FormatPropose } from '@tiktrends/core';
import { Empty } from '../../Empty';
import { bouton, boutonInactif, boutonPrimaire, legende } from './styles';

/**
 * Aucun document image dans la version · le créer à partir du format du brief
 * (ou d'un défaut annoncé comme tel). Créer = enregistrer une version qui porte
 * un document vide (et la photo produit si on le demande) · aucune génération.
 */
export function DocumentVide({
  formatPropose, produitDisponible, peutEnregistrer, enCours, onCreer,
}: {
  formatPropose: FormatPropose;
  produitDisponible: boolean;
  peutEnregistrer: boolean;
  enCours: boolean;
  onCreer: (format: FormatDocument, avecProduit: boolean) => void;
}) {
  const [format, setFormat] = useState<FormatDocument>(formatPropose.format);
  const [avecProduit, setAvecProduit] = useState(produitDisponible);

  if (!peutEnregistrer) {
    return (
      <div data-etat="document-vide">
        <Empty tone="wait" icon="image" title="Ce projet n’a pas encore de document image" why="Ton rôle permet de consulter les projets, pas d’en créer le document. Demande à un membre de l’espace de le créer." />
      </div>
    );
  }
  return (
    <div data-etat="document-vide">
      <Empty
        tone="todo"
        icon="layers"
        title="Ce projet n’a pas encore de document image"
        why="Choisis un format pour créer le document à calques. Rien n’est généré : le document part vide, tu y poses ensuite textes, formes et médias du projet."
      >
        <div style={{ display: 'grid', gap: 12, maxWidth: 520, margin: '0 auto' }}>
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            <legend style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Format</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ORDRE_FORMATS.map((f) => (
                <label key={f} style={{ ...bouton, gap: 8, borderColor: format === f ? 'var(--accent-strong)' : 'var(--line-2)' }}>
                  <input type="radio" name="format-document" value={f} checked={format === f} onChange={() => setFormat(f)} style={{ width: 18, height: 18 }} />
                  {FORMATS_DOCUMENT[f].libelle}
                  <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{FORMATS_DOCUMENT[f].width} × {FORMATS_DOCUMENT[f].height}</span>
                </label>
              ))}
            </div>
            <p data-format-source style={legende}>
              {formatPropose.depuisBrief
                ? `Format lu dans le brief : « ${formatPropose.texte} ».`
                : `Le brief ne précise pas de format · ${FORMATS_DOCUMENT[formatPropose.format].libelle} proposé par défaut.`}
            </p>
          </fieldset>
          {produitDisponible && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={avecProduit} onChange={(e) => setAvecProduit(e.target.checked)} style={{ width: 20, height: 20 }} />
              Poser la photo produit du projet, centrée, à {Math.round(PART_PRODUIT_INITIALE * 100)} % de la largeur
            </label>
          )}
          <div>
            <button type="button" disabled={enCours} onClick={() => onCreer(format, produitDisponible && avecProduit)} style={{ ...boutonPrimaire, ...(enCours ? boutonInactif : {}) }}>
              {enCours ? 'Création…' : 'Créer le document'}
            </button>
          </div>
        </div>
      </Empty>
    </div>
  );
}
