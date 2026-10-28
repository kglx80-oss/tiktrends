/**
 * Les types du registre partagés avec des composants CLIENT · aucun import,
 * aucune logique (le registre lui-même reste `server-only`, garde PROMPT-12).
 */
export interface ChampEditable { champ: string; libelle: string; valeur: string; liste?: boolean }
