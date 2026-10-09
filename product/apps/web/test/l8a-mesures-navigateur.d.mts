export interface MesurePage {
  largeur: number;
  sw: number;
  cw: number;
  deborde: boolean;
  fautifs: Array<{ el: string; gauche: number; droite: number }>;
  cibles: Array<{ el: string; largeur: number; hauteur: number; enLigne: boolean }>;
  champs: Array<{ el: string; taille: number }>;
  contrastes: Array<{ el: string; ratio: number; seuil: number; couleur: string; taille: number }>;
  collisions: string[];
}

export type FocusDecrit =
  | { perdu: true }
  | {
    perdu: false; horsZone: boolean; tag: string; texte: string; dansDialogue: boolean;
    haut: number; gauche: number; hauteur: number; visible: boolean; recouvert: boolean; dansFenetre: boolean;
  };

export function mesurerPage(selecteur?: string): MesurePage;
export function decrireFocus(selecteur?: string): FocusDecrit;
