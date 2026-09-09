import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Marque blanche · aucun nom de fournisseur tiers à l'écran, côté client.
 *
 * ── Règle du dépôt ───────────────────────────────────────────────────────────
 *
 * « Produit en marque blanche : « Trendtrack » n'apparaît jamais à l'écran. »
 * Les écrans vus par un membre/client ne doivent pas non plus exposer le MOTEUR
 * (Fal, Flux, Ideogram, Kontext, Kling, Higgsfield) · on parle capacité (« moteur
 * d'image / vidéo », « bibliothèque de pubs »), jamais fournisseur.
 *
 * Les surfaces OPÉRATEUR (Réglages · intégrations serveur, admin · intelligence
 * marché) nomment légitimement les fournisseurs pour la configuration · elles ne
 * sont PAS couvertes ici. Ce garde vise les écrans client.
 *
 * On teste le RÉSULTAT · le texte source des écrans client, pas un appel.
 */

const CLIENT = [
  'components/TrackerFeed.tsx',
  'components/AssistantHome.tsx',
  'app/(app)/studio/image/page.tsx',
  'app/(app)/studio/image/ImageStudio.tsx',
  'app/(app)/studio/video/page.tsx',
  'app/(app)/studio/video/VideoStudioFull.tsx',
];

// Fournisseurs à ne jamais montrer côté client · en MOTS entiers (les frontières
// de mot évitent d'attraper un identifiant de code comme le type `FalAspect`).
const INTERDITS = [/\bTrendtrack\b/i, /\bFlux\b/i, /\bIdeogram\b/i, /\bKontext\b/i, /\bKling\b/i, /\bHiggsfield\b/i, /\bFal\b/i];

/** Retire imports, commentaires ligne et bloc · on ne juge que ce qui peut atteindre l'écran. */
function texteEcran(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[\s\S]*?;$/gm, '');
}

describe('marque blanche · écrans client sans nom de fournisseur', () => {
  for (const rel of CLIENT) {
    it(`${rel} n'expose aucun fournisseur tiers`, () => {
      const src = texteEcran(readFileSync(join(process.cwd(), rel), 'utf8'));
      for (const re of INTERDITS) {
        expect(src, `${re} réapparaît à l'écran dans ${rel}`).not.toMatch(re);
      }
    });
  }
});
