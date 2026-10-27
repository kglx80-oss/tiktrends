'use client';

import { createContext, useContext } from 'react';

/**
 * Le contexte de la coquille Spatial · ce que les vues lisent pour leur
 * en-tête (crédits, avatar, notifications) et les surcouches qu'elles ouvrent.
 * Fourni par `Coquille` · en test, une vue se rend sous `FournisseurSpatial`
 * avec des valeurs explicites.
 */
export type PanneauSpatial = 'profil' | 'notifs' | 'marques' | 'modules' | null;

export interface CtxSpatial {
  utilisateur: { nom: string; initiales: string; email: string; role: string };
  credits: { solde: number; dotation: number; illimite: boolean };
  nonLues: number;
  ouvrirPalette: () => void;
  basculer: (p: Exclude<PanneauSpatial, null>) => void;
  toast: (message: string) => void;
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

