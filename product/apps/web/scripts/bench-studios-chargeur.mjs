/**
 * Chargeur du script `bench-studios.ts` hors de Next.
 *
 * `server-only` est une garde de BUNDLE : Next la résout lui-même et le
 * paquet n'est pas installé. Hors de Next, son import échouerait. Ce crochet
 * de résolution la remplace par un module vide pour ce processus seulement,
 * exactement comme l'alias de `vitest.config.mts` le fait pour les tests.
 */
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
  return next(specifier, context);
}`));
