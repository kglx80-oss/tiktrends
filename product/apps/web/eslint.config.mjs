import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';
import tiktrends from './eslint-rules/face-equipe.mjs';

/**
 * Configuration ESLint · flat config (ESLint 9).
 *
 * Le lint n'a jamais tourné sur ce projet : `next lint` ouvrait un prompt
 * interactif faute de configuration, donc il échouait silencieusement en CI.
 * On repart de `next/core-web-vitals`, qui apporte les règles React/hooks et les
 * garde-fous Next (images, liens, imports serveur dans un composant client).
 *
 * Les règles activées en plus visent ce qu'on corrige à la main depuis des
 * semaines : imports morts et variables inutilisées après un remaniement.
 */
const ICI = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: ICI });

/**
 * Face équipe (suite de #1117 et #1119) · seul `effectiveAccess` construit un
 * `Access`. Deux fichiers ont le droit d'en forcer un · la construction de
 * production (exemptée de `face-equipe-forcee` SEULEMENT · ni import de test ni
 * `@ts-ignore` n'y sont permis) et le helper des tests de `rbac`. Voir
 * eslint-rules/face-equipe.mjs pour ce que la règle attrape et ce qu'elle laisse
 * passer. Elle protège contre une erreur, pas contre la malveillance.
 */
const CONSTRUCTION_PRODUCTION = 'lib/access.ts';
const HELPER_TEST = 'test/helpers/face-equipe.ts';
const TESTS = ['test/**', '**/*.test.*'];

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals'),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Imports et variables morts : erreur, c'est le motif le plus fréquent.
      // Un argument ou une variable préfixée d'un « _ » reste volontairement ignorée.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none', // `catch (e)` sans usage est un motif courant et lisible ici
      }],
    },
  },
  {
    // Informations de type (compilateur) · la règle face équipe en a besoin pour
    // voir à travers alias, `Access['equipe']`, `import()` et génériques.
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: ICI } },
    plugins: { tiktrends },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: TESTS,
    rules: {
      'tiktrends/pas-de-test-en-production': 'error',
      // Un `@ts-expect-error` poserait une session brute dans `equipe` sans cast · aucun en production.
      'tiktrends/pas-de-ts-ignore': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [CONSTRUCTION_PRODUCTION, ...TESTS],
    rules: { 'tiktrends/face-equipe-forcee': 'error' },
  },
  {
    // Les tests de rbac éprouvent la face CLIENT par `{ role, plan } as Access` · permis, sans equipe.
    files: ['test/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    ignores: [HELPER_TEST],
    rules: { 'tiktrends/face-equipe-forcee': ['error', { accesSansEquipe: true }] },
  },
  {
    rules: {
      // Le produit est 100 % en styles inline et sert des images distantes (Fal,
      // Drive, Shopify) : <img> est un choix assumé, pas un oubli.
      '@next/next/no-img-element': 'off',
      // L'interface est entièrement en français : une apostrophe dans du texte JSX
      // est correcte et lisible. Escaper « l'espace » en « l&apos;espace » dans
      // chaque libellé rendrait le code illisible pour zéro bénéfice.
      'react/no-unescaped-entities': 'off',
      // Les fichiers de configuration exportent légitimement un littéral.
      'import/no-anonymous-default-export': 'off',
    },
  },
];
