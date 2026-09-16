import { describe, expect, it } from 'vitest';
import {
  ESSAI_VARIABLES, ESSAI_LABEL, economieEssai, hypotheseEssai, imagesPourEssai,
  prixEssai, tenuDansEssai, verifieEssai, essaiVisibleEnMode, essaisPourMode, type EssaiVariable,
} from '../src/essai';
import type { DeclinaisonSnapshot } from '../src/studio-iterate';

const pub = (o: Partial<DeclinaisonSnapshot> = {}): DeclinaisonSnapshot => ({
  headline: 'Ton garage retrouve sa place', cta: 'J’en profite',
  subhead: 'Trois minutes.', kicker: 'NOUVEAU', badge: '-20%',
  sceneUrl: 'https://cdn.test/a.png', layout: 'immersif', universe: 'studio',
  ...o,
});

describe('tenir la scène rend le lot moins cher', () => {
  it('un essai d’accroches ou de mises en page ne produit qu’une image', () => {
    // C'est la conséquence inattendue : le lot le plus rigoureux est aussi le
    // moins cher, parce que ce qu'on payait en double c'était l'ambiguïté.
    expect(imagesPourEssai('accroche', 4)).toBe(1);
    expect(imagesPourEssai('mise_en_page', 4)).toBe(1);
  });

  it('un essai d’ambiances en produit une par publicité', () => {
    // L'ambiance EST l'image · la tenir constante n'aurait aucun sens.
    expect(imagesPourEssai('univers', 4)).toBe(4);
  });

  it('le prix suit les images réellement produites', () => {
    expect(prixEssai('accroche', 4, 4)).toBe(4);
    expect(prixEssai('univers', 4, 4)).toBe(16);
  });

  it('l’économie annoncée est celle qu’on fait vraiment', () => {
    expect(economieEssai('accroche', 4, 4)).toBe(12);
    expect(economieEssai('univers', 4, 4)).toBe(0);
  });

  it('ne descend jamais sous une image', () => {
    for (const v of ESSAI_VARIABLES) {
      expect(imagesPourEssai(v, 0)).toBeGreaterThanOrEqual(1);
      expect(imagesPourEssai(v, -3)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('l’hypothèse est écrite avant d’être payée', () => {
  it('chaque essai en a une, et elle dit combien', () => {
    for (const v of ESSAI_VARIABLES) {
      const h = hypotheseEssai(v, 4);
      expect(h, v).toContain('4');
      expect(h.length, v).toBeGreaterThan(30);
      expect(ESSAI_LABEL[v], v).toBeTruthy();
      expect(tenuDansEssai(v).length, v).toBeGreaterThanOrEqual(2);
    }
  });

  it('ne prétend jamais tenir ce qu’elle fait varier', () => {
    const nom: Record<EssaiVariable, string> = {
      accroche: 'l’accroche', mise_en_page: 'la mise en page', univers: 'l’ambiance',
    };
    for (const v of ESSAI_VARIABLES) {
      expect(tenuDansEssai(v), v).not.toContain(nom[v]);
    }
  });
});

describe('le contrôle du lot', () => {
  it('accepte un vrai essai d’accroches', () => {
    const lot = [pub({ headline: 'A' }), pub({ headline: 'B' }), pub({ headline: 'C' })];
    expect(verifieEssai(lot, 'accroche').ok).toBe(true);
  });

  it('accepte un vrai essai de mises en page', () => {
    const lot = [pub({ layout: 'immersif' }), pub({ layout: 'affiche' })];
    expect(verifieEssai(lot, 'mise_en_page').ok).toBe(true);
  });

  it('refuse deux publicités identiques sur la variable testée', () => {
    // Un modèle rend parfois deux fois la même accroche · il n'y a alors rien à
    // comparer entre ces deux-là.
    const lot = [pub({ headline: 'A' }), pub({ headline: '  a  ' })];
    const r = verifieEssai(lot, 'accroche');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.probleme).toContain('rien à comparer');
  });

  it('refuse un lot où DEUX choses varient', () => {
    // Le cas qui compte : une accroche trop longue fait changer la mise en page
    // d'une seule publicité, et le lot cesse d'être attribuable sans que rien
    // ne le signale.
    const lot = [pub({ headline: 'A' }), pub({ headline: 'B', layout: 'affiche' })];
    const r = verifieEssai(lot, 'accroche');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.probleme).toContain('mise en page');
  });

  it('refuse un essai de mises en page dont la scène a bougé', () => {
    const lot = [pub({ layout: 'immersif' }), pub({ layout: 'affiche', sceneUrl: 'https://cdn.test/b.png' })];
    expect(verifieEssai(lot, 'mise_en_page').ok).toBe(false);
  });

  it('exige au moins deux publicités', () => {
    expect(verifieEssai([pub()], 'accroche').ok).toBe(false);
    expect(verifieEssai([], 'accroche').ok).toBe(false);
  });

  it('un essai d’ambiances a le droit de changer de scène', () => {
    // Et lui seul · c'est la seule variable dont l'image EST le sujet.
    const lot = [
      pub({ universe: 'studio', sceneUrl: 'https://cdn.test/a.png' }),
      pub({ universe: 'nature', sceneUrl: 'https://cdn.test/b.png' }),
    ];
    expect(verifieEssai(lot, 'univers').ok).toBe(true);
  });

  it('refuse un lot où le bouton varie, quelle que soit la variable', () => {
    for (const v of ESSAI_VARIABLES) {
      const lot = [
        pub({ headline: 'A', layout: 'immersif', universe: 'studio', cta: 'Un' }),
        pub({ headline: 'B', layout: 'affiche', universe: 'nature', sceneUrl: 'https://cdn.test/b.png', cta: 'Deux' }),
      ];
      expect(verifieEssai(lot, v).ok, v).toBe(false);
    }
  });
});

describe('un essai n’a de sens que si sa variable est visible dans le mode', () => {
  // En composée le texte et la mise en page sont une COUCHE posée sur la scène ·
  // les trois essais varient quelque chose de visible. En entière, le modèle
  // cuit texte et disposition DANS l'image · tenir la scène rendrait N fois la
  // même image, et seul « les ambiances » (qui change l'image) reste un essai.
  it('en composée, les trois essais sont praticables', () => {
    for (const v of ESSAI_VARIABLES) {
      expect(essaiVisibleEnMode(v, 'composee'), v).toBe(true);
    }
    expect(essaisPourMode('composee')).toEqual(['accroche', 'mise_en_page', 'univers']);
  });

  it('en entière, seul l’essai d’ambiances varie quelque chose de visible', () => {
    // accroche/mise_en_page en entière = quatre fois la même image sous une
    // étiquette d'essai · le faux essai qu'on ferme.
    expect(essaiVisibleEnMode('accroche', 'entiere')).toBe(false);
    expect(essaiVisibleEnMode('mise_en_page', 'entiere')).toBe(false);
    expect(essaiVisibleEnMode('univers', 'entiere')).toBe(true);
    expect(essaisPourMode('entiere')).toEqual(['univers']);
  });

  it('« les ambiances » reste un essai réel dans les deux modes', () => {
    // Sa variable EST l'image · c'est la seule qui tient dans les deux.
    expect(essaiVisibleEnMode('univers', 'composee')).toBe(true);
    expect(essaiVisibleEnMode('univers', 'entiere')).toBe(true);
  });
});
