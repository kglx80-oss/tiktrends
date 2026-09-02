import { describe, expect, it } from 'vitest';
import {
  STUDIO_VARIABLES, DECLINAISONS_DISPONIBLES, declinaisonsPour, empechement, universSuivant, CHANGE, lignee, miseSuivante, prixDeclinaison, rang,
  reutiliseScene, tenuConstant, verifieDeclinaison,
  type DeclinaisonSnapshot, type Maillon, type StudioVariable,
} from '../src/studio-iterate';
import { AD_LAYOUTS, type AdLayout } from '../src/ad-layouts';
import { HEADLINE_CHARS } from '../src/copy-budget';

const parent = (o: Partial<DeclinaisonSnapshot> = {}): DeclinaisonSnapshot => ({
  headline: 'Ton garage retrouve sa place',
  cta: 'J’en profite', subhead: 'Trois minutes.', kicker: 'NOUVEAU', badge: '-20%',
  sceneUrl: 'https://cdn.test/a.png', layout: 'immersif', universe: 'studio',
  ...o,
});

describe('le prix suit ce qui est réellement refait', () => {
  it('changer de mise en page ne coûte rien', () => {
    // La composition est un calcul, pas un achat · c'est le gain principal.
    expect(prixDeclinaison('mise_en_page', 4, 1)).toBe(0);
  });

  it('réécrire un texte coûte un texte, pas une image', () => {
    expect(prixDeclinaison('accroche', 4, 1)).toBe(1);
    expect(prixDeclinaison('offre', 8, 1)).toBe(1);
  });

  it('refaire la scène coûte le moteur choisi', () => {
    expect(prixDeclinaison('scene', 4, 1)).toBe(4);
    expect(prixDeclinaison('univers', 12, 1)).toBe(12);
  });

  it('rien n’est facturé plus cher qu’un lot entier', () => {
    for (const v of STUDIO_VARIABLES) {
      expect(prixDeclinaison(v, 4, 1)).toBeLessThanOrEqual(4);
    }
  });
});

describe('chaque variable est décrite entièrement', () => {
  it('a un libellé, un changement et une liste de ce qui est tenu', () => {
    for (const v of STUDIO_VARIABLES) {
      expect(CHANGE[v], v).toBeTruthy();
      expect(tenuConstant(v).length, v).toBeGreaterThanOrEqual(2);
    }
  });

  it('ne prétend jamais tenir ce qu’elle change', () => {
    // Un contrat qui se contredit se lit et ne se respecte pas · c'est pire
    // qu'un contrat absent, parce qu'on lui fait confiance.
    for (const v of STUDIO_VARIABLES) {
      for (const tenu of tenuConstant(v)) {
        expect(CHANGE[v].includes(tenu), `${v} prétend tenir « ${tenu} » alors qu’elle change « ${CHANGE[v]} »`).toBe(false);
      }
    }
  });
});

describe('le contrôle de déclinaison', () => {
  it('accepte une déclinaison qui change exactement sa variable', () => {
    const p = parent();
    expect(verifieDeclinaison(p, { ...p, headline: 'Ton garage respire enfin' }, 'accroche').ok).toBe(true);
    expect(verifieDeclinaison(p, { ...p, cta: 'Je teste' }, 'offre').ok).toBe(true);
    expect(verifieDeclinaison(p, { ...p, layout: 'affiche' }, 'mise_en_page').ok).toBe(true);
    expect(verifieDeclinaison(p, { ...p, sceneUrl: 'https://cdn.test/b.png' }, 'scene').ok).toBe(true);
    expect(verifieDeclinaison(p, { ...p, sceneUrl: 'https://cdn.test/b.png', universe: 'nature' }, 'univers').ok).toBe(true);
  });

  it('refuse une copie déguisée en variante', () => {
    // Un modèle à qui on demande une autre accroche rend parfois la même, à la
    // ponctuation près · sans ce refus on facture un doublon.
    const p = parent();
    const r = verifieDeclinaison(p, { ...p, headline: '  Ton Garage Retrouve Sa Place  ' }, 'accroche');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.probleme).toContain('copie');
  });

  it('refuse une déclinaison qui change deux choses', () => {
    // C'est LE cas qui a l'air d'un progrès et ne prouve rien.
    const p = parent();
    const r = verifieDeclinaison(p, { ...p, headline: 'Autre chose', layout: 'affiche' }, 'accroche');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.probleme).toContain('mise en page');
  });

  it('refuse une nouvelle scène quand la scène devait être tenue', () => {
    const p = parent();
    const r = verifieDeclinaison(p, { ...p, headline: 'Autre chose', sceneUrl: 'https://cdn.test/b.png' }, 'accroche');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.probleme).toContain('scène');
  });

  it('l’offre accepte la pastille comme le bouton', () => {
    const p = parent();
    expect(verifieDeclinaison(p, { ...p, badge: '-40%' }, 'offre').ok).toBe(true);
  });

  it('l’ambiance exige que la scène ET l’ambiance changent', () => {
    // Rendre la même ambiance avec une autre image, c'est une déclinaison de
    // scène qu'on facture sous un autre nom.
    const p = parent();
    const r = verifieDeclinaison(p, { ...p, sceneUrl: 'https://cdn.test/b.png' }, 'univers');
    expect(r.ok).toBe(false);
  });

  it('toute variable a un cas refusé ET un cas accepté', () => {
    // Un contrôle qui accepte tout est un commentaire.
    for (const v of STUDIO_VARIABLES as readonly StudioVariable[]) {
      const p = parent();
      expect(verifieDeclinaison(p, p, v).ok, `${v} accepte une copie parfaite`).toBe(false);
    }
  });
});

describe('la mise en page suivante', () => {
  it('n’est jamais celle qu’on quitte', () => {
    for (const l of AD_LAYOUTS) {
      expect(miseSuivante(l, 'Court')).not.toBe(l);
    }
  });

  it('parcourt les coquilles au lieu de rebondir entre deux', () => {
    let cur: AdLayout = AD_LAYOUTS[0]!;
    const vus = new Set<string>([cur]);
    for (let i = 0; i < AD_LAYOUTS.length - 1; i++) {
      cur = miseSuivante(cur, 'Court')!;
      vus.add(cur);
    }
    expect(vus.size).toBe(AD_LAYOUTS.length);
  });

  it('écarte les coquilles trop étroites pour l’accroche', () => {
    // Proposer une coquille qui se rabattra sur l'immersive ferait une
    // déclinaison qui ne décline rien · et le contrôle la refuserait ensuite.
    const etroite = AD_LAYOUTS.reduce((a, b) => (HEADLINE_CHARS[a] <= HEADLINE_CHARS[b] ? a : b));
    const longue = 'x'.repeat(HEADLINE_CHARS[etroite] + 1);
    for (const l of AD_LAYOUTS) {
      expect(miseSuivante(l, longue)).not.toBe(etroite);
    }
  });

  it('rend `null` quand aucune coquille ne tient l’accroche', () => {
    const tresLongue = 'x'.repeat(Math.max(...AD_LAYOUTS.map((l) => HEADLINE_CHARS[l])) + 1);
    expect(miseSuivante('immersif', tresLongue)).toBeNull();
  });

  it('respecte un vivier restreint', () => {
    expect(miseSuivante('immersif', 'Court', ['immersif', 'affiche'])).toBe('affiche');
  });
});

describe('la lignée', () => {
  const chaine: Maillon[] = [
    { id: 'a', parentId: null, variable: null },
    { id: 'b', parentId: 'a', variable: 'accroche' },
    { id: 'c', parentId: 'b', variable: 'mise_en_page' },
  ];

  it('remonte jusqu’à la racine, dans l’ordre', () => {
    expect(lignee('c', chaine).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(rang('c', chaine)).toBe(3);
    expect(rang('a', chaine)).toBe(1);
  });

  it('ne boucle pas sur une filiation abîmée', () => {
    // Une donnée circulaire ne doit pas figer le serveur · elle arrive.
    const cycle: Maillon[] = [
      { id: 'x', parentId: 'y', variable: 'scene' },
      { id: 'y', parentId: 'x', variable: 'scene' },
    ];
    expect(lignee('x', cycle).length).toBeLessThanOrEqual(2);
  });

  it('rend au moins la publicité elle-même quand le parent est absent', () => {
    expect(rang('z', chaine)).toBe(1);
  });
});

describe('la scène réutilisée', () => {
  it('est ce qui décide du prix', () => {
    for (const v of STUDIO_VARIABLES) {
      const gratuitOuTexte = prixDeclinaison(v, 99, 1) <= 1;
      expect(reutiliseScene(v), `${v}`).toBe(gratuitOuTexte);
    }
  });
});

describe('ce qu’on propose réellement', () => {
  it('ne propose que des déclinaisons qui réutilisent la scène payée', () => {
    // C'est la définition de « décliner sans repayer le lot ». Une variable qui
    // regénère l'image n'a rien à faire dans cette liste tant qu'elle s'appelle
    // comme ça.
    for (const v of DECLINAISONS_DISPONIBLES) {
      expect(reutiliseScene(v), v).toBe(true);
      expect(prixDeclinaison(v, 4, 1), v).toBeLessThanOrEqual(1);
    }
  });

  it('ne propose que des variables connues', () => {
    for (const v of DECLINAISONS_DISPONIBLES) {
      expect(STUDIO_VARIABLES).toContain(v);
    }
  });
});

describe('ce qui est faisable pour CETTE publicité', () => {
  it('ouvre tout quand le brief de la scène existe', () => {
    expect(declinaisonsPour(true)).toEqual(STUDIO_VARIABLES);
  });

  it('se limite aux trois quand il manque', () => {
    // Rien ne permet de reconstruire un brief · redemander au modèle donnerait
    // une autre scène d'un autre concept, donc une créa de plus.
    expect(declinaisonsPour(false)).toEqual(DECLINAISONS_DISPONIBLES);
  });

  it('explique l’empêchement, et seulement quand il y en a un', () => {
    expect(empechement('scene', false)).toBeTruthy();
    expect(empechement('scene', true)).toBe('');
    // Celles qui réutilisent la scène ne sont jamais empêchées.
    for (const v of DECLINAISONS_DISPONIBLES) {
      expect(empechement(v, false), v).toBe('');
    }
  });
});

describe('l’ambiance suivante', () => {
  const cles = ['studio', 'nature', 'urbain'];

  it('n’est jamais celle qu’on quitte', () => {
    for (const k of cles) expect(universSuivant(k, cles)).not.toBe(k);
  });

  it('parcourt la liste', () => {
    expect(universSuivant('studio', cles)).toBe('nature');
    expect(universSuivant('urbain', cles)).toBe('studio');
  });

  it('part du début quand l’ambiance actuelle est inconnue', () => {
    expect(universSuivant(null, cles)).toBe('studio');
    expect(universSuivant('inexistant', cles)).toBe('studio');
  });

  it('rend `null` quand il n’y a nulle part où aller', () => {
    expect(universSuivant('studio', ['studio'])).toBeNull();
    expect(universSuivant('studio', [])).toBeNull();
    // « auto » n'est pas une ambiance, c'est le refus d'en choisir une.
    expect(universSuivant('studio', ['auto'])).toBeNull();
  });
});
