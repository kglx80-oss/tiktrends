import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // `server-only` (garde de bundle Next.js) n'a pas de sens sous vitest ·
      // on le neutralise pour pouvoir tester le RÉSULTAT d'un lib serveur
      // (ex : `lib/digest.ts`) contre une base pglite. Inerte pour les tests
      // qui n'importent pas de code server-only.
      'server-only': fileURLToPath(new URL('./test/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
});
