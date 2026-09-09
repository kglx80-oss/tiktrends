import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  demarrerGeneration, terminerGeneration, generationsActives, nbVisuelsEnCours, sabonnerGenerations,
} from '../lib/generation-store';

/**
 * L'indicateur « ça tourne » survit à la navigation · le store vit au niveau
 * module. On teste sa logique de données (déclarer / retirer / compter /
 * notifier), pas le rendu.
 */

describe('generation-store · le compte des lots en cours', () => {
  it('déclarer ajoute un lot et compte les visuels', () => {
    const base = nbVisuelsEnCours();
    const id = demarrerGeneration(3, 'Pubs IA');
    expect(nbVisuelsEnCours()).toBe(base + 3);
    expect(generationsActives().some((j) => j.id === id && j.count === 3)).toBe(true);
    terminerGeneration(id);
    expect(nbVisuelsEnCours()).toBe(base);
  });

  it('un compte < 1 est ramené à 1 · on montre toujours au moins un visuel', () => {
    const id = demarrerGeneration(0, 'x');
    expect(generationsActives().find((j) => j.id === id)!.count).toBe(1);
    terminerGeneration(id);
  });

  it('terminer un id inconnu ne casse rien', () => {
    const avant = nbVisuelsEnCours();
    terminerGeneration(999999);
    expect(nbVisuelsEnCours()).toBe(avant);
  });

  it('notifie les abonnés au changement', () => {
    let n = 0;
    const off = sabonnerGenerations(() => { n += 1; });
    const id = demarrerGeneration(1, 'x');
    terminerGeneration(id);
    off();
    expect(n).toBe(2); // un départ, une fin
  });
});

const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
const LAYOUT = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');

describe('l’indicateur est branché de bout en bout', () => {
  it('le studio déclare au départ et retire dans le finally', () => {
    expect(STUDIO).toMatch(/demarrerGeneration\(/);
    // Le retrait vit dans le finally · c'est ce qui survit au démontage.
    const bloc = STUDIO.slice(STUDIO.indexOf('} finally {'), STUDIO.indexOf('} finally {') + 120);
    expect(bloc).toMatch(/terminerGeneration\(jobId\)/);
  });
  it('le shell de l’app monte l’indicateur, persistant à la navigation', () => {
    expect(LAYOUT).toMatch(/<IndicateurGenerations \/>/);
  });
});
