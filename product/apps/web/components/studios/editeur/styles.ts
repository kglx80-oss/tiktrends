import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { surface, tuile } from '../../ui';

/**
 * Styles en ligne de l'éditeur de calques · charte Jarvis (tokens existants),
 * cibles de 44 px, champs de 16 px (pas de zoom forcé sur téléphone).
 */

export const panneau: CSSProperties = { ...surface, background: 'var(--surface)', padding: 14, minWidth: 0 };
export const bloc: CSSProperties = { ...tuile, background: 'var(--paper)', padding: 12, display: 'grid', gap: 10 };

export const titrePanneau: CSSProperties = { margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' };
export const legende: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 };
export const etiquette: CSSProperties = { display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 };

export const champ: CSSProperties = {
  width: '100%', minHeight: CIBLE_TACTILE_MIN, boxSizing: 'border-box', padding: '8px 10px', borderRadius: 12,
  border: '1px solid var(--line-2)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 16, cursor: 'text',
};

export const bouton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  minHeight: CIBLE_TACTILE_MIN, minWidth: CIBLE_TACTILE_MIN, padding: '8px 12px', borderRadius: 12,
  border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
};
export const boutonPrimaire: CSSProperties = {
  ...bouton, border: 'none', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, padding: '8px 18px',
};
export const boutonInactif: CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };

/** Couleurs de statut · toujours doublées d'un mot (le statut n'est jamais porté par la seule couleur). */
export const COULEUR_ETAT: Readonly<Record<string, string>> = {
  vide: 'var(--muted)', enregistre: 'var(--ok)', modifie: 'var(--warn)', enregistrement: 'var(--info)', conflit: 'var(--err)', erreur: 'var(--err)',
};

export const LIBELLE_TYPE: Readonly<Record<string, string>> = { text: 'Texte', shape: 'Forme', image: 'Image', logo: 'Logo' };

export const tuileMedia: CSSProperties = {
  ...bouton, width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: 8, textAlign: 'left',
};
