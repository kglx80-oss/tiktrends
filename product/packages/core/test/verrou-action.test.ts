import { describe, expect, it } from 'vitest';
import { verrouAction } from '../src/verrou-action';

/**
 * Le verrou anti-double-clic · on éprouve le RÉSULTAT du contrat : une seule
 * prise à la fois, relâche qui rouvre, relâche idempotente.
 */
describe('verrouAction · une seule action à la fois', () => {
  it('tenter() ne réussit qu’une fois tant qu’on n’a pas relâché', () => {
    const v = verrouAction();
    expect(v.tenter()).toBe(true);   // libre → pris
    expect(v.tenter()).toBe(false);  // déjà pris → refusé (le 2e clic du tick)
    expect(v.tenter()).toBe(false);
    expect(v.occupe).toBe(true);
  });

  it('relacher() rouvre · l’action suivante repasse', () => {
    const v = verrouAction();
    v.tenter();
    v.relacher();
    expect(v.occupe).toBe(false);
    expect(v.tenter()).toBe(true);   // de nouveau prenable
  });

  it('relacher() est idempotent · le rappeler ne casse rien', () => {
    const v = verrouAction();
    v.tenter();
    v.relacher();
    v.relacher();
    expect(v.tenter()).toBe(true);
  });

  it('deux verrous sont indépendants', () => {
    const a = verrouAction();
    const b = verrouAction();
    expect(a.tenter()).toBe(true);
    expect(b.tenter()).toBe(true); // b n’est pas affecté par a
  });
});
