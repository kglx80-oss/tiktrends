import { describe, expect, it } from 'vitest';
import type { InspoAd } from '@tiktrends/integrations';
import { studioDepuisVeille } from '../lib/veille-link';

/**
 * Le pont veille → Pubs IA.
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * Le bouton « Générer une variante » pointait vers `/studio` (le hub des hooks),
 * pas vers les Pubs IA, avec `?brand=` et `?inspo=` que la page ne lit pas · un
 * clic sans suite. Et il passait la copy concurrente MOT POUR MOT. On vérifie
 * ici l'URL produite, pas qu'une fonction est appelée · c'est le RÉSULTAT qui
 * décide si le pont mène quelque part.
 */

const ad = (o: Partial<InspoAd>): InspoAd => ({
  id: 'x', platform: 'meta', status: 'active', daysRunning: 0, ...o,
} as InspoAd);

function angleDe(url: string): string {
  const q = url.split('?')[1] ?? '';
  const m = new URLSearchParams(q).get('angle');
  return m ?? '';
}

describe('le pont mène aux Pubs IA, armé', () => {
  it('vise /studio/ads, jamais le hub /studio', () => {
    const url = studioDepuisVeille(ad({ body: 'La crème qui tient 24 h', daysRunning: 40 }));
    expect(url.startsWith('/studio/ads')).toBe(true);
    // Le bug exact · le hub au lieu des Pubs IA.
    expect(url.startsWith('/studio?')).toBe(false);
  });

  it('porte le brief distillé, pas la copy brute', () => {
    const url = studioDepuisVeille(ad({ body: 'La crème qui tient 24 h', callToAction: 'Shop Now', daysRunning: 40 }));
    const angle = angleDe(url);
    expect(angle, 'l’angle éprouvé est transmis').toContain('éprouvée');
    expect(angle, 'l’instruction d’adaptation survit').toContain('nos mots');
  });

  it('sans matière, pointe quand même vers le bon écran, à vide', () => {
    expect(studioDepuisVeille(ad({}))).toBe('/studio/ads');
  });

  it('avec une pub sauvegardée en référence, ouvre le clone · angle ET structure', () => {
    const url = studioDepuisVeille(ad({ body: 'La crème qui tient 24 h', daysRunning: 40 }), { ref: 'saved-123' });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('mode'), 'la référence force le mode clone').toBe('clone');
    expect(q.get('ref')).toBe('saved-123');
    expect(q.get('angle'), 'le brief accompagne la structure').toContain('éprouvée');
  });

  it('sans référence, reste en mode marque · l’angle seul', () => {
    const url = studioDepuisVeille(ad({ body: 'x', daysRunning: 40 }));
    expect(new URLSearchParams(url.split('?')[1]).get('mode'), 'pas de clone sans référence').toBeNull();
  });
});
