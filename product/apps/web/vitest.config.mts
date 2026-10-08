import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    // Les tests du registre importent tout le pack (33 versions), valident,
    // créent et évaluent une release sur pglite : ~1,5 s seuls, au-delà de
    // 5 s (la limite par défaut) sur une machine chargée · constaté le 8
    // octobre (l2-jarvis-route). Limites explicites, mesurées avec marge.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
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
