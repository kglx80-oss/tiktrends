import { describe, it, expect } from 'vitest';
import { AD_LAYOUTS } from '../src/ad-layouts';
import { sceneFraming } from '../src/scene-framing';

describe('chaque coquille demande son propre cadrage', () => {
  it('aucune n’est oubliée', () => {
    for (const l of AD_LAYOUTS) {
      expect(sceneFraming(l).length, l).toBeGreaterThan(120);
    }
  });

  it('les quatre consignes sont réellement différentes', () => {
    // Quatre consignes identiques feraient payer quatre images composées pour
    // la même page · c'est le défaut qu'on corrige, il ne doit pas revenir sous
    // forme de copier-coller.
    const vues = new Set(AD_LAYOUTS.map((l) => sceneFraming(l)));
    expect(vues.size).toBe(AD_LAYOUTS.length);
  });
});

describe('le tiers bas n’est réservé que là où il sert', () => {
  it('l’immersive le réserve · c’est la seule où le texte se pose dessus', () => {
    expect(sceneFraming('immersif')).toMatch(/lower third/i);
  });

  it('les trois autres ne le réservent pas', () => {
    // Le champ recadre en carte, la moitié/moitié jette le bas, l'affiche met
    // l'image sous le titre · réserver de la place pour un texte qui est
    // ailleurs gâche le cadre qu'on vient de payer.
    for (const l of ['champ', 'split', 'affiche'] as const) {
      expect(sceneFraming(l), l).not.toMatch(/lower third/i);
    }
  });

  it('elles disent à la place ce qui sera recadré', () => {
    expect(sceneFraming('champ')).toMatch(/cropped|cut/i);
    expect(sceneFraming('split')).toMatch(/cut away|top half/i);
    expect(sceneFraming('affiche')).toMatch(/bottom|band/i);
  });
});

describe('sans coquille connue, on garde l’immersive', () => {
  it('undefined et null donnent la consigne de l’immersive', () => {
    // Passerelles, clonage et créas d'avant reçoivent l'immersive · leur rendu
    // doit rester identique.
    expect(sceneFraming(undefined)).toBe(sceneFraming('immersif'));
    expect(sceneFraming(null)).toBe(sceneFraming('immersif'));
  });
});

describe('la consigne reste utilisable telle quelle', () => {
  it('elle dit toujours le rapport et la finition', () => {
    for (const l of [...AD_LAYOUTS, undefined]) {
      const t = sceneFraming(l);
      expect(t, String(l)).toContain('4:5');
      expect(t, String(l)).toMatch(/crisp focus/i);
    }
  });

  it('elle commence par « Composition: » · le prompt l’enchaîne sans couture', () => {
    for (const l of AD_LAYOUTS) expect(sceneFraming(l).startsWith('Composition: ')).toBe(true);
  });
});
