import { describe, expect, it } from 'vitest';
import { brouillonAEcrire, cleBrouillonIteration, cleMontageStudio, reprendreBrouillon, type ChampsIteration } from '../src/brouillon-iteration';

/**
 * I2 · retour Codex · les saisies d'un brief survivent à la navigation, et le
 * formulaire suit toujours le brief affiché. Défauts mesurés en recette réelle
 * au head 94d659b · saisies perdues au retour navigateur, et ?iter=A → ?iter=B
 * gardait les champs de A sous le brief de B.
 */
const prefill: ChampsIteration = { angle: 'Angle 1', personaId: 'p-sportifs' };
const personas = ['p-sportifs', 'p-parents'];

describe('clé de montage · le Studio se remonte quand le test change', () => {
  it('deux tests de la même marque → deux clés (le formulaire de A ne reste pas sous le brief de B)', () => {
    expect(cleMontageStudio('neva', 'A')).not.toBe(cleMontageStudio('neva', 'B'));
  });
  it('deux marques → deux clés (F01 tient toujours)', () => {
    expect(cleMontageStudio('neva', null)).not.toBe(cleMontageStudio('klorea', null));
    expect(cleMontageStudio('neva', 'A')).not.toBe(cleMontageStudio('klorea', 'A'));
  });
  it('même marque, même test → même clé (pas de remontage gratuit)', () => {
    expect(cleMontageStudio('neva', 'A')).toBe(cleMontageStudio('neva', 'A'));
  });
});

describe('ce qu’on garde dans l’onglet', () => {
  it('une saisie modifiée est gardée, angle ET audience', () => {
    const brut = brouillonAEcrire({ angle: 'Angle 1 · variante matin', personaId: 'p-parents' }, prefill);
    expect(brut).not.toBeNull();
    expect(reprendreBrouillon(brut, prefill, personas)).toEqual({ champs: { angle: 'Angle 1 · variante matin', personaId: 'p-parents' }, repris: true });
  });
  it('revenue au prérempli · rien n’est gardé (et donc rien n’est annoncé repris)', () => {
    expect(brouillonAEcrire(prefill, prefill)).toBeNull();
  });
  it('la clé isole marque et test', () => {
    expect(cleBrouillonIteration('neva', 'A')).not.toBe(cleBrouillonIteration('neva', 'B'));
    expect(cleBrouillonIteration('neva', 'A')).not.toBe(cleBrouillonIteration('klorea', 'A'));
  });
});

describe('reprise · au retour sur le même brief', () => {
  it('rien de gardé · le prérempli, sans annonce', () => {
    expect(reprendreBrouillon(null, prefill, personas)).toEqual({ champs: prefill, repris: false });
  });
  it('contenu illisible ou d’une autre version · le prérempli, sans annonce', () => {
    expect(reprendreBrouillon('{pas du json', prefill, personas).repris).toBe(false);
    expect(reprendreBrouillon(JSON.stringify({ v: 99, angle: 'x', personaId: '' }), prefill, personas).repris).toBe(false);
    expect(reprendreBrouillon(JSON.stringify({ v: 1, angle: 3, personaId: '' }), prefill, personas).repris).toBe(false);
  });
  it('une audience qui n’existe plus dans la marque n’est pas reprise · l’angle, si', () => {
    const brut = JSON.stringify({ v: 1, angle: 'Angle modifié', personaId: 'p-supprime' });
    expect(reprendreBrouillon(brut, prefill, personas)).toEqual({ champs: { angle: 'Angle modifié', personaId: 'p-sportifs' }, repris: true });
  });
  it('« Persona · auto » choisi explicitement est repris', () => {
    const brut = brouillonAEcrire({ angle: 'Angle 1', personaId: '' }, prefill);
    expect(reprendreBrouillon(brut, prefill, personas)).toEqual({ champs: { angle: 'Angle 1', personaId: '' }, repris: true });
  });
});
