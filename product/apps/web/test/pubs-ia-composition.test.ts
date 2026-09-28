import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pubs IA · composition premium & responsive (lot Codex 28/09). L'écran tirait
 * un GROS bandeau marketing (« DÉMARRAGE RAPIDE », dégradé) et une pastille
 * « CONCEPT · SCÈNE · DESIGN » qui repoussaient la galerie hors du premier
 * écran ; la grille était figée à ~4 colonnes à 240px et les filtres s'étalaient
 * tous en ligne. On cloue au RÉSULTAT de source (l'écran tire le graphe serveur,
 * il n'est pas rendable en test). Chaque assertion tombe si le défaut revient.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const page = read('app/(app)/studio/ads/page.tsx');
const studio = read('app/(app)/studio/ads/AdsStudio.tsx');
const barre = read('components/BarreFiltresGalerie.tsx');

describe('Pubs IA · en-tête court, sans bandeau marketing', () => {
  it('titre court + explication « prochain test », pas de pastille marketing', () => {
    expect(page).toContain('Crée les variantes de ton prochain test');
    expect(page, 'la pastille marketing subsiste').not.toContain('CONCEPT · SCÈNE · DESIGN');
  });
  it('le contenu principal est borné à 1200, centré', () => {
    expect(page).toContain('maxWidth: 1200');
  });
  it('le GROS bandeau héros « DÉMARRAGE RAPIDE » a disparu (galerie dans le premier écran)', () => {
    // Mutation : réintroduire le hero (le libellé ou son dégradé) fait tomber.
    expect(studio, 'le bandeau DÉMARRAGE RAPIDE subsiste').not.toContain('DÉMARRAGE RAPIDE');
    expect(studio, 'le dégradé marketing du hero subsiste').not.toContain('linear-gradient(120deg, rgba(255,60,120,.16)');
  });
  it('une action dominante de création + un clone secondaire subsistent', () => {
    expect(studio).toContain('Créer des pubs');
    expect(studio).toContain('Cloner une pub qui tient');
  });
});

describe('Pubs IA · galerie premium responsive', () => {
  it('grille fluide bornée à la largeur dispo (4/3/2/1 selon la taille)', () => {
    // Mutation : remettre une piste fixe non bornée (ex. minmax(240px, 1fr))
    // fait retomber la responsivité et cette assertion.
    expect(studio).toContain('repeat(auto-fill, minmax(min(260px, 100%), 1fr))');
  });
});

describe('Pubs IA · une barre, filtres à la demande', () => {
  it('un panneau de filtres révélé par un bouton (aria-expanded), pas étalé', () => {
    expect(barre).toContain('aria-expanded={ouvert}');
    expect(barre).toContain('aria-controls={panneauId}');
    // Le panneau est masqué par défaut (display piloté par l'état, pas `hidden`
    // écrasé par un display inline).
    expect(barre).toContain("display: ouvert ? 'flex' : 'none'");
  });
  it('tous les filtres restent présents (format, qualité, performance) + tri', () => {
    for (const l of ['label="Format"', 'label="Qualité"', 'label="Performance"', 'label="Tri"']) {
      expect(barre, `filtre manquant : ${l}`).toContain(l);
    }
  });
});
