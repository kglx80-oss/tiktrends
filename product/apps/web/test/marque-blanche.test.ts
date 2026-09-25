import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  'app/(app)/studio/page.tsx',
  'app/(app)/studio/ads/AdsStudio.tsx',
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

/**
 * « Trendtrack » est un cas À PART · c'est le produit dont TikTrends est la marque
 * blanche, pas un simple moteur d'infra. La règle du dépôt est absolue : « jamais
 * à l'écran », SANS l'exemption des surfaces opérateur qui vaut pour les moteurs
 * (Fal, Higgsfield…). Le libellé « Bibliothèque pub · Trendtrack » des Réglages
 * l'exposait pourtant · ce garde balaie TOUT écran (client ET opérateur) et
 * tombe si « Trendtrack » reparaît hors commentaire.
 */
// Sensible à la casse · on vise le NOM PROPRE « Trendtrack » (majuscule) tel
// qu'il s'écrirait dans un libellé d'écran, pas l'identifiant interne de source
// de données `'trendtrack'` (minuscule) ni la variable d'env `TRENDTRACK_API_KEY`
// (pas de frontière de mot avant « _ »). Le premier atteint l'écran, pas les autres.
const TRENDTRACK = /\bTrendtrack\b/;
function tsxRecursif(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return e === 'node_modules' || e === '.next' ? [] : tsxRecursif(p);
    return p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });
}

describe('marque blanche · « Trendtrack » jamais à l’écran, même en surface opérateur', () => {
  const base = process.cwd();
  const fichiers = [...tsxRecursif(join(base, 'app')), ...tsxRecursif(join(base, 'components'))]
    .filter((p) => !p.includes('/test/'));

  it('a scanné un jeu d’écrans non vide', () => {
    expect(fichiers.length).toBeGreaterThan(30);
  });

  it('aucun fichier d’écran ne rend « Trendtrack » (hors commentaires)', () => {
    const fautifs: string[] = [];
    for (const f of fichiers) {
      if (TRENDTRACK.test(texteEcran(readFileSync(f, 'utf8')))) fautifs.push(f.slice(base.length + 1));
    }
    expect(fautifs, `« Trendtrack » atteint l’écran dans : ${fautifs.join(', ')}`).toEqual([]);
  });
});
