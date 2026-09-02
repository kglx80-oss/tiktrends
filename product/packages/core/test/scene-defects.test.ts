import { describe, expect, it } from 'vitest';
import {
  SCENE_DEFECTS, DEFECT_LABEL, DEFECT_FIX, defautsConnus, estRedhibitoire,
  plafonner, verdictDefauts, PLAFOND_SI_GRAVE,
} from '../src/scene-defects';

describe('le vocabulaire est fermé et complet', () => {
  it('chaque raté a un libellé ET une action', () => {
    // Nommer un problème sans dire quoi faire, c'est le signaler deux fois.
    for (const d of SCENE_DEFECTS) {
      expect(DEFECT_LABEL[d], d).toBeTruthy();
      expect(DEFECT_FIX[d], d).toBeTruthy();
    }
  });

  it('tous ne sont pas rédhibitoires', () => {
    // Si tout est grave, plus rien ne l'est et l'écran redevient décoratif.
    const graves = SCENE_DEFECTS.filter(estRedhibitoire);
    expect(graves.length).toBeGreaterThan(0);
    expect(graves.length).toBeLessThan(SCENE_DEFECTS.length);
  });
});

describe('ce que le modèle rend est filtré', () => {
  it('écarte ce qu’on ne sait pas nommer', () => {
    expect(defautsConnus(['texte_incruste', 'couleurs_moches', 42, null])).toEqual(['texte_incruste']);
  });

  it('supporte l’absence de réponse', () => {
    expect(defautsConnus(null)).toEqual([]);
    expect(defautsConnus(undefined)).toEqual([]);
    expect(defautsConnus('texte_incruste' as unknown as string[])).toEqual([]);
  });

  it('dédoublonne et garde un ordre stable', () => {
    // Deux appels sur la même image doivent rendre la même liste, sinon on ne
    // peut pas comparer deux mois de générations.
    const a = defautsConnus(['anatomie', 'texte_incruste', 'anatomie']);
    const b = defautsConnus(['texte_incruste', 'anatomie']);
    expect(a).toEqual(b);
    expect(a.length).toBe(2);
  });
});

describe('le verdict', () => {
  it('se tait quand il n’y a rien à dire', () => {
    const v = verdictDefauts([]);
    expect(v.grave).toBe(false);
    expect(v.resume).toBe('');
  });

  it('distingue « à refaire » de « utilisable mais »', () => {
    expect(verdictDefauts(['texte_incruste']).grave).toBe(true);
    expect(verdictDefauts(['produit_deforme']).grave).toBe(false);
    expect(verdictDefauts(['produit_deforme']).resume).toContain('utilisable');
  });

  it('un seul raté grave suffit', () => {
    expect(verdictDefauts(['produit_deforme', 'anatomie', 'illisible']).grave).toBe(true);
  });
});

describe('la note ne contredit pas ce qui est écrit dessous', () => {
  it('plafonne quand un raté est rédhibitoire', () => {
    // 68 sur 100 avec une fausse accroche cuite dans l'image, c'est publier la
    // note et enterrer le constat.
    expect(plafonner(68, true)).toBe(PLAFOND_SI_GRAVE);
    expect(plafonner(90, true)).toBe(PLAFOND_SI_GRAVE);
  });

  it('ne remonte jamais une note basse', () => {
    expect(plafonner(12, true)).toBe(12);
    expect(plafonner(12, false)).toBe(12);
  });

  it('ne touche à rien sans raté grave', () => {
    expect(plafonner(82, false)).toBe(82);
  });

  it('borne les valeurs aberrantes', () => {
    expect(plafonner(-5, false)).toBe(0);
    expect(plafonner(140, false)).toBe(100);
    expect(plafonner(NaN, false)).toBe(0);
  });
});
