import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deux manques d'accessibilité du composeur à plat, non couverts par une règle
 * globale · le nom accessible du champ Offre (un placeholder n'est pas un nom)
 * et l'annonce de l'échec de génération (un `<div>` muet ne prévient pas qui
 * vient de lancer le lot). L'assistant a déjà `role="alert"` (#525) · le
 * composeur à plat, non.
 *
 * Composant client volumineux à actions serveur · non rendable · garde par
 * adoption de la source. On lit un ATTRIBUT porté par un élément précis, pas la
 * présence d'un appel · un attribut absent du fichier est absent du rendu.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('AdsStudio · accessibilité du composeur à plat', () => {
  it('le champ Offre porte un nom accessible', () => {
    const i = src.indexOf('onChange={(e) => setOffer(e.target.value)}');
    expect(i, 'champ Offre introuvable').toBeGreaterThan(-1);
    // Le nom accessible est sur le même élément input · on lit la fenêtre autour.
    const autour = src.slice(i, i + 200);
    expect(autour, 'le champ Offre n’a pas de nom accessible (placeholder ≠ nom)')
      .toContain('aria-label="Offre"');
  });

  it('l’échec de génération est annoncé (role=alert)', () => {
    expect(src, 'la bannière d’erreur du composeur n’est pas annoncée')
      .toContain('{error && <div role="alert"');
  });
});
