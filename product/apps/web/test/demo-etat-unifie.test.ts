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
    // Vague 4 · le Radar est servi par Spatial · sans créas synchronisées, aucun exemple, la porte « Brancher Meta Ads ».
    ['radar', 'spatial/vues/veille/Radar.tsx'],
    ['dashboard', 'components/ApercuExemple.tsx'],
    ['analytics', 'components/accueil/VueAnalytics.tsx'],
  ])('%s montre la porte vers /connections', (_n, p) => {
    expect(P(p), 'aucune sortie « brancher un compte » sur une page d’exemple').toContain('/connections');
  });
});

// Tagging · vague 4 · l'écran V5 est retiré · la garde (aucune porte vers
// /connections) est portée sur le rendu Spatial (`spatial-profil-tagging`).

// Vague 4 · les pages V5 de la Veille (`/veille`, `/veille/scale`) sont retirées · Spatial dit l'état
// (démonstration, erreur de la source) dans son sous-titre · la garde du Bandeau partagé est partie avec elles.
