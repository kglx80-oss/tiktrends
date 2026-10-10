'use client';

import {
  descendantsDeCarte, entreesDeCarte, sortiesDeCarte, LIBELLES_ETAPE_CANVAS, LIBELLES_NATURE_CANVAS,
  type CarteCanvas, type ModeCanvas, type ModeleCanvas,
} from '@tiktrends/core';
import { tuile } from '../../ui';
import { bouton, boutonPrimaire, etiquette, mini, pastilleNature, rangee, texte } from './styles';

/**
 * Détail d'une carte · le MÊME en vue liste et en vue canvas (mêmes actions).
 * Ce que la carte lit, ce qu'elle alimente, ce qui serait à refaire si elle
 * change, et la cible Jarvis explicite. Aucune action ici ne génère ni ne
 * dépense ; seuls les boutons de déplacement écrivent (la disposition
 * personnelle, jamais le projet).
 */

export const LIBELLE_MEDIA: Readonly<Record<CarteCanvas['media'], string | null>> = {
  lie: 'Média lié à cette version',
  absent: 'Pas encore produit',
  sans_objet: null,
};

export interface PropsDetail {
  modele: ModeleCanvas;
  carte: CarteCanvas;
  mode: ModeCanvas;
  versionCourante: boolean;
  messageJarvis: string | null;
  onChoisir: (id: string) => void;
  onCiblerJarvis: (carte: CarteCanvas) => void;
  onVoirSurCanvas: (id: string) => void;
  onDeplacer: (id: string, dx: number, dy: number) => void;
  pas: number;
}

function ListeLiens({ titre, cartes, vide, onChoisir }: { titre: string; cartes: CarteCanvas[]; vide: string; onChoisir: (id: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <span style={etiquette}>{titre}</span>
      {cartes.length === 0 ? <p style={mini}>{vide}</p> : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {cartes.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChoisir(c.id)} style={{ ...bouton, fontSize: 13, padding: '6px 10px' }}>{c.titre}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DetailCarte({ modele, carte, mode, versionCourante, messageJarvis, onChoisir, onCiblerJarvis, onVoirSurCanvas, onDeplacer, pas }: PropsDetail) {
  const lit = entreesDeCarte(modele, carte.id);
  const alimente = sortiesDeCarte(modele, carte.id);
  const aval = [...descendantsDeCarte(modele, carte.id)].map((id) => modele.cartes.find((c) => c.id === id)!).filter(Boolean);
  const generations = aval.filter((c) => c.nature === 'generation').length;
  const calculs = aval.filter((c) => c.nature === 'calcul').length;
  const media = LIBELLE_MEDIA[carte.media];

  return (
    <div data-detail-carte={carte.id} style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={rangee}>
          <span style={pastilleNature}>{LIBELLES_NATURE_CANVAS[carte.nature]}</span>
          <span style={mini}>{LIBELLES_ETAPE_CANVAS[carte.etape]}</span>
        </div>
        <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{carte.titre}</p>
        <p style={texte}>{carte.resume}</p>
        {media && <p style={mini}>{media}</p>}
      </div>

      <ListeLiens titre="Lit" cartes={lit} vide="Aucune dépendance · c’est un point de départ." onChoisir={onChoisir} />
      <ListeLiens titre="Alimente" cartes={alimente} vide="Rien ne la lit." onChoisir={onChoisir} />
      <p style={mini}>
        {aval.length === 0
          ? 'La modifier ne rend aucune autre sortie obsolète.'
          : `La modifier rendrait obsolètes ${generations} génération${generations > 1 ? 's' : ''} et ${calculs} calcul${calculs > 1 ? 's' : ''} en aval · rien n’est refait sans ton accord.`}
      </p>

      <div data-cible-jarvis={carte.cibleJarvis ?? ''} style={{ ...tuile, display: 'grid', gap: 8, padding: 12, background: 'var(--rail)' }}>
        <span style={etiquette}>Jarvis</span>
        {carte.cibleJarvis ? (
          versionCourante ? (
            <>
              <p style={texte}>Cible Jarvis · <b style={{ color: 'var(--ink)' }}>{carte.libelleCibleJarvis}</b> sur la version courante.</p>
              <div>
                <button type="button" style={boutonPrimaire} onClick={() => onCiblerJarvis(carte)}>
                  Préparer une demande à Jarvis · {carte.libelleCibleJarvis}
                </button>
              </div>
              <p style={mini}>Choisit la cible dans le panneau Jarvis du projet · rien n’est envoyé, rien n’est dépensé. Le coût s’affiche avant l’envoi.</p>
            </>
          ) : (
            <p style={texte}>Cible Jarvis · {carte.libelleCibleJarvis}. Jarvis propose sur la version courante · ouvre-la pour lui demander une proposition.</p>
          )
        ) : (
          <p style={texte}>{carte.nature === 'entree'
            ? 'Cette entrée se règle dans son atelier (produit, image ou vidéo) · Jarvis propose sur un plan, une identité ou le brief.'
            : 'Cette carte se recalcule depuis ce qu’elle lit · pour la faire changer, demande à Jarvis sur une carte qu’elle lit (plan, identité ou brief).'}</p>
        )}
        <p role="status" aria-live="polite" style={{ ...mini, minHeight: 0 }}>{messageJarvis ?? ''}</p>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {mode === 'liste' ? (
          <div><button type="button" style={bouton} onClick={() => onVoirSurCanvas(carte.id)}>Voir sur le canvas</button></div>
        ) : (
          <>
            <div><button type="button" style={bouton} onClick={() => onVoirSurCanvas(carte.id)}>Centrer sur cette carte</button></div>
            <div role="group" aria-label={`Déplacer ${carte.titre}`} style={rangee}>
              <button type="button" style={bouton} aria-label="Déplacer à gauche" onClick={() => onDeplacer(carte.id, -pas, 0)}>←</button>
              <button type="button" style={bouton} aria-label="Déplacer vers le haut" onClick={() => onDeplacer(carte.id, 0, -pas)}>↑</button>
              <button type="button" style={bouton} aria-label="Déplacer vers le bas" onClick={() => onDeplacer(carte.id, 0, pas)}>↓</button>
              <button type="button" style={bouton} aria-label="Déplacer à droite" onClick={() => onDeplacer(carte.id, pas, 0)}>→</button>
            </div>
            <p style={mini}>Déplacer une carte range ta vue · ni l’ordre, ni les dépendances, ni la version ne changent.</p>
          </>
        )}
      </div>
    </div>
  );
}
