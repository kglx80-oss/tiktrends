import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'état « données d'exemple » avait quatre dessins · #326 a posé le Bandeau
 * partagé, cette passe finit la migration. Deux invariants, lus à la source (ces
 * pages sont des composants serveur, illisibles en rendu) :
 *
 *  1. une page de démo CONNECTABLE (ses données viennent d'un compte à brancher)
 *     doit offrir une sortie vers le réel · sinon c'est un cul-de-sac de chiffres
 *     faux. La Veille fait exception · sa démo tient à une source NON configurée
 *     côté serveur, pas à un compte de l'utilisateur · on ne lui promet donc pas
 *     une porte qui ne mène nulle part.
 *  2. plus aucun filet `banner()` local là où le Bandeau partagé doit servir.
 */
const P = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('toute page de démo connectable offre une sortie vers le réel', () => {
  it.each([
    ['tags', 'app/(app)/tags/page.tsx'],
    ['radar', 'app/(app)/radar/page.tsx'],
    ['dashboard', 'app/(app)/dashboard/page.tsx'],
    ['analytics', 'app/(app)/analytics/page.tsx'],
  ])('%s montre la porte vers /connections', (_n, p) => {
    expect(P(p), 'aucune sortie « brancher un compte » sur une page d’exemple').toContain('/connections');
  });
});

describe('les bandeaux d’état sont unifiés · fin du filet local', () => {
  it.each([
    'app/(app)/veille/page.tsx',
    'app/(app)/veille/scale/page.tsx',
  ])('%s utilise le Bandeau partagé', (p) => {
    const s = P(p);
    expect(s, 'la page n’adopte pas le Bandeau partagé').toContain('<Bandeau');
    expect(s, 'un helper banner() local subsiste').not.toMatch(/const banner = /);
  });
});
