'use client';

import { useState } from 'react';
import { FORMATS_DOCUMENT, ORDRE_FORMATS, PART_PRODUIT_INITIALE, type FormatDocument, type FormatPropose } from '@tiktrends/core';
import type { MediaEditeur } from '../../../lib/studios/editeur/types';
import { lireLigneTexte } from '@tiktrends/core';
import { Empty } from '../../Empty';
import { bouton, boutonInactif, boutonPrimaire, legende } from './styles';

/**
 * Aucun document image dans la version · le créer à partir du format du brief
 * (ou d'un défaut annoncé comme tel). Créer = enregistrer une version qui porte
 * un document vide (et la photo produit si on le demande) · aucune génération.
 */
export function DocumentVide({
  formatPropose, produitDisponible, peutEnregistrer, enCours, onCreer, medias = [], apercus = {}, textes = [],
}: {
  medias?: MediaEditeur[];
  apercus?: Record<string, string>;
  textes?: string[];
  formatPropose: FormatPropose;
  produitDisponible: boolean;
  peutEnregistrer: boolean;
  enCours: boolean;
  onCreer: (format: FormatDocument, avecProduit: boolean, mediaId?: string, textes?: string[]) => void;
}) {
  const [format, setFormat] = useState<FormatDocument>(formatPropose.format);
  const [avecProduit, setAvecProduit] = useState(produitDisponible);

  const [mediaId, setMediaId] = useState(medias[0]?.assetId ?? '');
  const [copie, setCopie] = useState(textes.map((t) => lireLigneTexte(t).texte).join('\n'));

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
        title={medias.length ? "Finaliser votre création" : "Créer votre composition"}
        why={medias.length ? "Choisissez votre visuel et relisez les textes. Ils seront ajoutés en calques modifiables, sans appel IA." : "Choisissez un format pour ajouter vos textes, formes et médias."}
      >
        <div style={{ display: 'grid', gap: 12, maxWidth: 520, margin: '0 auto' }}>
          {medias.length > 0 && <>
            <label style={{ display: 'grid', gap: 8 }}>Visuel de départ
              <select value={mediaId} onChange={(e) => setMediaId(e.target.value)} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)' }}>
                <option value="">Composition vide</option>
                {medias.map((m, i) => <option key={m.assetId} value={m.assetId}>{m.nom} · {i + 1}</option>)}
              </select>
            </label>
            {mediaId && apercus[mediaId] && <img src={apercus[mediaId]} alt="Visuel choisi pour la composition" style={{ maxWidth: '100%', height: 120, objectFit: 'contain' }} />}
            {mediaId && <label style={{ display: 'grid', gap: 8 }}>Textes sur le visuel · un bloc par ligne
              <textarea value={copie} onChange={(e) => setCopie(e.target.value)} rows={3} style={{ padding: 12, borderRadius: 12, border: '1px solid var(--line-2)', font: 'inherit', resize: 'vertical' }} maxLength={50000} placeholder="Votre titre, votre sous-titre…" />
              <span style={legende}>Mise en page ajustable dans l’éditeur. Aucun texte n’est inventé.</span>
            </label>}
          </>}
          <details open={!medias.length}>
            <summary style={{ ...legende, cursor: 'pointer', minHeight: 44, paddingTop: 12 }}>Format · {FORMATS_DOCUMENT[format].libelle}</summary>
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
          </details>
          {produitDisponible && !mediaId && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={avecProduit} onChange={(e) => setAvecProduit(e.target.checked)} style={{ width: 20, height: 20 }} />
              Poser la photo produit du projet, centrée, à {Math.round(PART_PRODUIT_INITIALE * 100)} % de la largeur
            </label>
          )}
          <div>
            <button type="button" disabled={enCours} onClick={() => onCreer(format, !mediaId && produitDisponible && avecProduit, mediaId || undefined, copie.split('\n').filter((t) => t.trim()))} style={{ ...boutonPrimaire, ...(enCours ? boutonInactif : {}) }}>
              {enCours ? 'Création…' : mediaId ? 'Ouvrir ma création dans l’éditeur' : 'Créer le document'}
            </button>
          </div>
        </div>
      </Empty>
    </div>
  );
}
