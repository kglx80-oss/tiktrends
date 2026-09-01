import { describe, it, expect } from 'vitest';
import { VISUAL_UNIVERSES } from '@tiktrends/ai';
import {
  UNIVERSE_AUTO, UNIVERSE_FAMILIES, UNIVERSE_FAMILY, UNIVERSE_HINT, UNIVERSE_SWATCH,
  filterUniverses, familyOf,
} from '@tiktrends/core';

/**
 * Le catalogue vit dans `@tiktrends/ai`, son classement dans `@tiktrends/core`.
 *
 * Les deux paquets ne se dépendent pas · ce test est le seul endroit qui voit
 * les deux. Sans lui, un univers ajouté côté IA n'aurait ni famille, ni phrase,
 * ni dégradé : il resterait atteignable par « Tous » et disparaîtrait de tous
 * les filtres. C'est la pire des absences, celle qui ne se remarque pas.
 */
describe('chaque univers est classé, décrit et illustré', () => {
  it('a une famille', () => {
    for (const u of VISUAL_UNIVERSES) {
      expect(familyOf(u.key), `« ${u.key} » n’a pas de famille`).toBeTruthy();
    }
  });

  it('a une phrase en français', () => {
    for (const u of VISUAL_UNIVERSES) {
      expect(UNIVERSE_HINT[u.key]?.length, `« ${u.key} » n’a pas de description`).toBeGreaterThan(15);
    }
  });

  it('a un dégradé d’aperçu', () => {
    // C'est ce qui s'affiche tant que la marque n'a pas de créa dans cet
    // univers · sans lui, la vignette serait une case vide.
    for (const u of VISUAL_UNIVERSES) {
      expect(UNIVERSE_SWATCH[u.key], `« ${u.key} » n’a pas de dégradé`).toBeTruthy();
    }
  });

  it('les familles déclarées sont toutes utilisées', () => {
    // Un filtre qui ne ramène jamais rien est un bouton qui ment.
    const utilisees = new Set(Object.values(UNIVERSE_FAMILY));
    for (const f of UNIVERSE_FAMILIES) {
      expect(utilisees.has(f.key), `la famille « ${f.key} » ne contient aucun univers`).toBe(true);
    }
  });

  it('aucune famille ne ramasse tout', () => {
    // Un filtre qui ramène les huit ne filtre rien.
    for (const f of UNIVERSE_FAMILIES) {
      const n = VISUAL_UNIVERSES.filter((u) => UNIVERSE_FAMILY[u.key] === f.key).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(VISUAL_UNIVERSES.length);
    }
  });
});

describe('« Varié (auto) » traverse les filtres', () => {
  const options = [{ key: UNIVERSE_AUTO }, ...VISUAL_UNIVERSES];

  it('reste visible sous chaque famille', () => {
    // Ce n'est pas un univers, c'est le refus d'en choisir un · le cacher
    // obligerait à revenir sur « Tous » pour renoncer.
    for (const f of UNIVERSE_FAMILIES) {
      expect(filterUniverses(options, f.key).map((u) => u.key)).toContain(UNIVERSE_AUTO);
    }
  });

  it('sans famille, tout est là', () => {
    expect(filterUniverses(options, null)).toHaveLength(options.length);
  });

  it('un filtre réduit vraiment la liste', () => {
    for (const f of UNIVERSE_FAMILIES) {
      expect(filterUniverses(options, f.key).length).toBeLessThan(options.length);
    }
  });
});
