'use client';

import { createContext, useContext } from 'react';
import type { PorteeRaccourci, PreferencesTouches, RegimeTarifaire } from '@tiktrends/core';

/**
 * Le contexte de la coquille Spatial · ce que les vues lisent pour leur
 * en-tête (crédits, avatar, notifications) et les surcouches qu'elles ouvrent.
 * Fourni par `Coquille` · en test, une vue se rend sous `FournisseurSpatial`
 * avec des valeurs explicites.
 */
/** `raccourcis` · la fenêtre d'aide des raccourcis clavier (lot 13). */
export type PanneauSpatial = 'profil' | 'notifs' | 'marques' | 'modules' | 'jarvis' | 'raccourcis' | null;

export interface CtxSpatial {
  utilisateur: { nom: string; initiales: string; email: string; role: string };
  /** `regime` · régime tarifaire de l'espace (`regimeTarifaire`) · absent = `actuel` (tests, hors coquille). */
  credits: { solde: number; dotation: number; illimite: boolean; regime?: RegimeTarifaire };
  nonLues: number;
  ouvrirPalette: () => void;
  basculer: (p: Exclude<PanneauSpatial, null>) => void;
  toast: (message: string) => void;
  /** La surcouche ouverte · l'en-tête en tire `aria-expanded` (cloche, avatar). */
  panneau?: PanneauSpatial;
  /**
   * Ouvre le tiroir Jarvis · `brouillon` PRÉREMPLIT le champ, rien n'est envoyé
   * (l'envoi reste un clic, coût annoncé). Absent hors coquille.
   */
  ouvrirJarvis?: (brouillon?: string) => void;
  /**
   * Lot 13 bis (PC D16) · ouvre l'aide des raccourcis, FILTRÉE sur ces portées
   * (absentes · l'aide entière) · le focus reviendra au bouton. Absent hors coquille.
   */
  ouvrirRaccourcis?: (portees?: readonly PorteeRaccourci[]) => void;
  /**
   * Lot 13 bis (CA P14) · le rail de la coquille · `ouvert` est l'état AFFICHÉ
   * (lu au rendu serveur dans le cookie `tt_rail`), `basculer` le change comme
   * « [ » et le bouton du rail (cookie compris) et rend le nouvel état. Absent hors coquille.
   */
  rail?: { ouvert: boolean; basculer: () => boolean };
  /**
   * Lot 13 ter · ce qu'il faut pour DESSINER une touche à côté d'un geste ·
   * la préférence « Raccourcis à une touche » (cookie `tt_raccourcis`, lue au
   * rendu serveur puis suivie à chaque bascule) et la plateforme (⌘ ou Ctrl).
   * Absent hors coquille · `PREFERENCES_TOUCHES_DEFAUT` (actifs, Ctrl).
   */
  touches?: PreferencesTouches;
}

const DEFAUT: CtxSpatial = {
  utilisateur: { nom: '', initiales: '', email: '', role: '' },
  credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0,
  ouvrirPalette: () => {},
  basculer: () => {},
  toast: () => {},
};

export const SpatialCtx = createContext<CtxSpatial>(DEFAUT);
export const FournisseurSpatial = SpatialCtx.Provider;
export const useSpatial = () => useContext(SpatialCtx);


/** Le régime tarifaire de l'espace · `actuel` hors coquille. */
export const useRegime = (): RegimeTarifaire => useContext(SpatialCtx).credits.regime ?? 'actuel';
