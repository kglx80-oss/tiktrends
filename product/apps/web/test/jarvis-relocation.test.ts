import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La relocalisation du détail de Jarvis · garde de SOURCE, comme les autres
 * invariants des pages liées au routeur et à la base (n08, rail-actif).
 *
 * Le repli global (DetailJarvis) était une transition · le détail vit désormais
 * à SA destination, la page `sources`. On vérifie deux choses complémentaires,
 * mutées de part et d'autre :
 *  1. la page de conversation ne porte plus le tableau de bord (elle est la
 *     conversation, plus un lien vers les sources) ;
 *  2. AUCUN bloc n'a été perdu au déménagement · chacun est présent dans
 *     `sources`.
 */
const jarvis = readFileSync(join(process.cwd(), 'app/(app)/jarvis/page.tsx'), 'utf8');
const sources = readFileSync(join(process.cwd(), 'app/(app)/jarvis/sources/page.tsx'), 'utf8');

describe('Jarvis · la conversation, seule ; le détail à sa destination', () => {
  it('la page de chat accueille la conversation et renvoie aux sources', () => {
    expect(jarvis).toContain('<JarvisChat />');
    expect(jarvis).toContain('href="/jarvis/sources"');
  });

  it('la page de chat ne porte plus le tableau de bord', () => {
    // Le repli de transition a disparu, et les blocs analytiques ne sont plus
    // rendus ici · ils ont déménagé.
    expect(jarvis, 'le repli de transition subsiste').not.toContain('DetailJarvis');
    expect(jarvis, 'un bloc analytique traîne encore sur la conversation').not.toContain('id="attribution"');
    expect(jarvis).not.toContain('MemoryBlock');
  });

  it('les huit blocs et les réglages sont bien à la destination, rien de perdu', () => {
    for (const marqueur of [
      'Ce qui tourne, en ce moment',        // état des couches
      'id="essais"',                         // lots d'essai
      'id="bilan-notes"',                    // score Jarvis
      'id="bilan-copie"',                    // relectures
      'id="attribution"',                    // attribution
      'Ce qu’il a appris de cette marque',   // mémoire mesurée
      'Les accroches, mot pour mot',         // accroches
      'Ce qu’on lui demande',                // actions
      'Réglages maison',                     // fondateur
      'Moteurs orchestrés',                  // fondateur
      'Ce que Jarvis coûte',                 // dépense (fondateur)
    ]) {
      expect(sources, `bloc manquant à la destination : ${marqueur}`).toContain(marqueur);
    }
  });

  it('les gardes d’accès survivent au déménagement · rien n’est élargi', () => {
    // La mémoire reste derrière l'offre, la dépense et les réglages derrière le
    // fondateur · exactement comme avant.
    expect(sources).toContain('voitMemoire');
    expect(sources).toContain('fondateur');
    expect(sources).toContain('isFounder');
  });
});
