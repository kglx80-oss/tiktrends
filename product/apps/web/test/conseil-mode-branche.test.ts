import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le mode mesuré arrive jusqu'au défaut de fabrication, et se dit.
 *
 * Le moteur suit déjà la mesure. Le MODE partait toujours d'« entière » en dur ·
 * une marque dont l'entière échoue mesurément part désormais en composée. Comme
 * pour le moteur : le mesuré fixe l'état INITIAL une fois, l'écran l'ANNONCE, et
 * le clic reste seul à changer ensuite.
 */

const PAGE = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/page.tsx'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('le conseil de mode traverse jusqu’à l’écran', () => {
  it('la page le calcule depuis le MÊME bilan que le moteur · une seule lecture', () => {
    expect(PAGE).toMatch(/const bilanCopie = /);
    expect(PAGE).toMatch(/conseilMode\(\{/);
    expect(PAGE, 'le mode est passé à l’écran').toMatch(/conseilModes=\{conseilModes\}/);
  });
});

describe('le mesuré devient le défaut de mode, sans se cacher', () => {
  it('le défaut de fabrication est le mode conseillé', () => {
    // C'est le cœur du changement · l'état INITIAL du mode suit la mesure, et
    // retombe sur l'entière (défaut viable) quand rien n'a tranché.
    expect(STUDIO).toMatch(/useState<ProductionMode>\(conseilModes\.defaut\)/);
  });

  it('l’adoption est annoncée, jamais silencieuse', () => {
    // Un défaut qui suit la mesure sans le dire se lit comme un bug · l'écran
    // montre le motif tant que le mode conseillé est en place.
    expect(STUDIO).toMatch(/conseilModes\.mesure && fabrication === conseilModes\.defaut/);
    expect(STUDIO).toMatch(/\{conseilModes\.motif\}/);
  });

  it('aucun override réactif · le défaut se pose une fois, le clic seul change ensuite', () => {
    // Le seul changement de mode admis est le clic (`setFabrication` dans un
    // onClick) · un effet réactif écraserait le choix de l'utilisateur.
    expect(STUDIO).toMatch(/onClick=\{\(\) => setFabrication\(m\)\}/);
  });
});
