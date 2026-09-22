import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CDC v8 · F08 · l'étape de démarrage des concurrents dit « renseigner », pas
 * « suivre ». Saisir un nom dans le profil RENSEIGNE un concurrent (situer la
 * catégorie) · le suivi ACTIF se met en place depuis la Veille et se compte au
 * Radar. « Suivre les concurrents · Fait » prétendait un suivi actif que le Radar
 * contredisait (0 suivi).
 *
 * L'étape vit dans le composant serveur `brands/[id]/page.tsx` (imports
 * `server-only`), non montable en test · on lit donc sa DÉFINITION dans la
 * source, comme l'adoption d'une clé de marque ailleurs. Ce qu'on vérifie n'est
 * pas un rendu mais le CONTRAT de l'étape · son libellé et son cta.
 */
describe('F08 · l’étape de démarrage « concurrents » ne prétend pas un suivi actif', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const page = readFileSync(join(here, '../app/(app)/brands/[id]/page.tsx'), 'utf8');
  // La ligne de l'étape `concurrents`.
  const ligne = page.split('\n').find((l) => l.includes("key: 'concurrents'")) ?? '';

  it('l’étape porte « Renseigner les concurrents » et le cta « Renseigner »', () => {
    expect(ligne, 'l’étape concurrents doit exister').not.toBe('');
    expect(ligne).toContain("label: 'Renseigner les concurrents'");
    expect(ligne).toContain("cta: 'Renseigner'");
  });

  it('l’étape ne prétend plus « Suivre » (ni label ni cta)', () => {
    expect(ligne).not.toContain("label: 'Suivre les concurrents'");
    expect(ligne).not.toContain("cta: 'Suivre'");
  });
});
