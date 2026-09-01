import { describe, it, expect } from 'vitest';
import { preflightLine, worthChecking, MIN_TEXT } from '../src/adsmap/preflight';
import type { PrelaunchBrief, PrelaunchFlag } from '../src/adsmap/prelaunch';

const flag = (kind: PrelaunchFlag['kind'], tone: PrelaunchFlag['tone'], message = `msg ${kind}`): PrelaunchFlag =>
  ({ kind, tone, message });

const brief = (flags: PrelaunchFlag[]): PrelaunchBrief => ({
  flags, recommendation: 'go', summary: '',
  score: { band: 'med', pHookOk: 0.4, pConclusiveWin: 0.3, drivers: [], thin: false },
});

describe('interrompre quelqu’un qui écrit se mérite', () => {
  /**
   * Une ligne qui apparaît à chaque frappe devient un bruit qu'on cesse de
   * lire · et la fois où elle compte vraiment, elle est déjà invisible.
   */
  it('un brief sans réserve ne dit rien', () => {
    expect(preflightLine(brief([flag('hook_proven', 'good')]))).toBeNull();
  });

  it('un brief vide ne dit rien non plus', () => {
    expect(preflightLine(brief([]))).toBeNull();
  });

  it('une accroche déjà réfutée passe devant tout', () => {
    const p = preflightLine(brief([flag('market_contradicts', 'warn'), flag('hook_refuted', 'stop', 'déjà perdu ici')]));
    expect(p).toEqual({ tone: 'stop', text: 'déjà perdu ici' });
  });

  it('une réserve explicite sort, en avertissement', () => {
    const p = preflightLine(brief([flag('market_contradicts', 'warn', 'le marché fait autrement')]));
    expect(p).toEqual({ tone: 'warn', text: 'le marché fait autrement' });
  });

  it('un « stop » qui n’est pas une accroche réfutée sort quand même en stop', () => {
    expect(preflightLine(brief([flag('market_contradicts', 'stop')]))?.tone).toBe('stop');
  });

  /**
   * Empiler trois réserves dans une barre de composition, c'est demander à
   * quelqu'un qui écrit de faire une revue de code.
   */
  it('une seule phrase sort, jamais deux', () => {
    const p = preflightLine(brief([flag('market_contradicts', 'warn'), flag('hook_refuted', 'stop')]));
    expect(typeof p!.text).toBe('string');
    expect(p!.text.split('\n')).toHaveLength(1);
  });
});

describe('on n’interroge pas la mémoire pour rien', () => {
  const assez = 'x'.repeat(MIN_TEXT);

  it('un texte trop court ne se compare à rien', () => {
    expect(worthChecking('trois mots', 40)).toBe(false);
    expect(worthChecking(assez, 40)).toBe(true);
  });

  it('les espaces ne comptent pas pour du texte', () => {
    expect(worthChecking(`  ${' '.repeat(MIN_TEXT)}  `, 40)).toBe(false);
  });

  /**
   * Sans tests mesurés, la mémoire n'a rien à confronter · l'appeler produirait
   * un silence coûteux à chaque frappe.
   */
  it('sans tests mesurés, on n’appelle pas', () => {
    expect(worthChecking(assez, 0)).toBe(false);
    expect(worthChecking(assez, 2)).toBe(false);
    expect(worthChecking(assez, 3)).toBe(true);
  });
});
