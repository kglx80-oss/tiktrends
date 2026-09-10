import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { journey, relance } from '@tiktrends/core';
import { JourneyPanel } from '../components/JourneyPanel';

/**
 * La relance douce se VOIT dans le panneau, pas seulement dans la logique.
 *
 * Le décrochage type · une marque posée, aucune créa générée depuis des jours.
 * Le panneau montrait la même prochaine étape du même ton le 1er comme le 15e
 * jour. On rend le panneau et on lit le HTML · le message d'encouragement est
 * là quand il doit l'être, absent sinon.
 */

// Compte à l'étape « generate » · marque + identité faites, rien de généré.
const j = journey(new Set(['brand', 'identity']));

describe('le panneau affiche la relance quand elle existe', () => {
  const r = relance(j, { joursDepuisMarque: 5 });
  const html = renderToStaticMarkup(<JourneyPanel j={j} firstName="Kévin" relance={r} />);

  it('la logique produit bien une relance sur ce compte', () => {
    expect(r).not.toBeNull();
  });

  it('le titre et le corps de la relance sont rendus', () => {
    expect(html).toContain('il ne manque que ta première pub');
    expect(html).toContain('brief parfait');
  });
});

describe('sans relance, rien ne s’ajoute', () => {
  const html = renderToStaticMarkup(<JourneyPanel j={j} firstName="Kévin" relance={null} />);
  it('le panneau ne fabrique pas d’encouragement de lui-même', () => {
    expect(html).not.toContain('il ne manque que ta première pub');
  });
  it('mais la prochaine étape reste, elle', () => {
    expect(html).toContain('Prochaine étape');
  });
});
