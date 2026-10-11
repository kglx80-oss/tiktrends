'use client';

import { createContext, useContext } from 'react';

/**
 * UX V2 · lot 2 · l'état de l'espace de création, partagé entre la coquille
 * (qui l'applique · rail et barre du haut masqués en focus) et la barre de
 * projet (qui le pilote · « Mode focus », « Masquer Jarvis »). Les règles
 * vivent dans le noyau (`espace-creation.ts`) · ici, seulement le câblage.
 *
 * Hors coquille (rendu isolé d'un composant), l'état par défaut est neutre ·
 * pas de focus, Jarvis visible, et les commandes ne font rien.
 */
export interface EtatEspaceCreation {
  /** Le mode focus est proposé ici (une page de projet). */
  focusDisponible: boolean;
  focus: boolean;
  basculerFocus: () => void;
  jarvisMasque: boolean;
  basculerJarvis: () => void;
}

const NEUTRE: EtatEspaceCreation = { focusDisponible: false, focus: false, basculerFocus: () => {}, jarvisMasque: false, basculerJarvis: () => {} };

const Contexte = createContext<EtatEspaceCreation>(NEUTRE);

export const FournisseurEspaceCreation = Contexte.Provider;

export const useEspaceCreation = (): EtatEspaceCreation => useContext(Contexte);
