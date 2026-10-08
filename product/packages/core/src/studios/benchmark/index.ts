export * from './cas';
export * from './plan';
export * from './devis';
export * from './rubrique';
export * from './oracles';
export * from './reel';
export * from './rapport';
export * from './raster';
export * from './evaluation';
// Règle pure du routage vision (lot F-D) · elle vit avec le registre
// (`prompts/vision.ts`, sans Ajv) et sort par ce dossier : l'index du noyau
// n'admet qu'une ligne par lot, et `apps/web` n'importe le registre par chemin
// profond que depuis `noyau.ts` (garde `l2-regles-pures`).
export * from '../../prompts/vision';
