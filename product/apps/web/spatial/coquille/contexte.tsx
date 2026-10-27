'use client';

import { createContext, useContext } from 'react';

/**
 * Le contexte de la coquille Spatial · ce que les vues lisent pour leur
 * en-tête (crédits, avatar, notifications) et les surcouches qu'elles ouvrent.
 * Fourni par `Coquille` · en test, une vue se rend sous `FournisseurSpatial`
 * avec des valeurs explicites.
 */
export type PanneauSpatial = 'profil' | 'notifs' | 'marques' | 'modules' | 'jarvis' | null;

export interface CtxSpatial {
  utilisateur: { nom: string; initiales: string; email: string; role: string };
  credits: { solde: number; dotation: number; illimite: boolean };
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

