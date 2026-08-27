import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

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
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

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
