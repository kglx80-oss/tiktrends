/**
 * Point d'entrée SERVEUR du noyau `packages/core/src/prompts/*`.
 *
 * Le noyau du registre n'est PAS réexporté par `@tiktrends/core` (son
 * `index.ts` est importé par des composants client) : `contrats.ts` tire Ajv,
 * qui génère du code avec `new Function` et pèse sur le bundle. On l'importe
 * donc par chemin profond, ICI seulement, et tout le serveur passe par ce
 * fichier. La garde `test/l2-frontiere-client.test.ts` échoue si un fichier
 * `'use client'` importe ce dossier.
 *
 * Pas de `import 'server-only'` : le script `scripts/importer-pack-prompts.ts`
 * (tsx, hors Next) doit pouvoir le charger.
 */

export * from '@tiktrends/core/src/prompts/types';
export * from '@tiktrends/core/src/prompts/empreinte';
export * from '@tiktrends/core/src/prompts/pack';
export * from '@tiktrends/core/src/prompts/contrats';
export * from '@tiktrends/core/src/prompts/semantique';
export * from '@tiktrends/core/src/prompts/compilation';
export * from '@tiktrends/core/src/prompts/contexte';
export * from '@tiktrends/core/src/prompts/resolution';
export * from '@tiktrends/core/src/prompts/release';
