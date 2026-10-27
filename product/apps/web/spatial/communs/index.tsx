/**
 * Point d'entrée des briques communes Spatial · `base` (sans état, serveur ou
 * client) et `client` (interactives, contexte de la coquille). Ré-exports
 * NOMMÉS · Next ne connaît les exports d'un module client que par leur nom.
 */
export { Ic, Vue, Lien, Anneau, SousNav, formatNombre } from './base';
export { EnTete, PastilleCredits } from './client';
