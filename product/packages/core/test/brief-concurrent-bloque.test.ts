import { describe, expect, it } from 'vitest';
import { briefConcurrentBloque } from '../src/brief-concurrent';

/**
 * La règle anti-double-lancement d'un brief concurrent · une seule, partagée par
 * le garde du gestionnaire et le `disabled` du bouton pour qu'ils ne divergent
 * jamais.
 */
describe('briefConcurrentBloque · un seul brief à la fois', () => {
  it('bloque une AUTRE marque pendant qu’un brief tourne', () => {
    expect(briefConcurrentBloque({ enCours: true, ouvert: 'a', cible: 'b' })).toBe(true);
  });

  it('n’a jamais rien à bloquer au repos', () => {
    expect(briefConcurrentBloque({ enCours: false, ouvert: 'a', cible: 'b' })).toBe(false);
    expect(briefConcurrentBloque({ enCours: false, ouvert: null, cible: 'b' })).toBe(false);
  });

  it('laisse agir sur la puce DÉJÀ ouverte (la fermer), même en cours', () => {
    // Fermer celle qu'on analyse ne lance pas un second brief · on ne la bloque pas.
    expect(briefConcurrentBloque({ enCours: true, ouvert: 'a', cible: 'a' })).toBe(false);
  });
});
