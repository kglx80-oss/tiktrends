import { describe, expect, it } from 'vitest';
import {
  bandeDe, contraste, grisVoile, luminance, seuilGris, voileNecessaire, voilesDe,
  CIBLE_CONTRASTE, VOILES_PAR_DEFAUT, GRIS_VOILE,
  type SceneLight,
} from '../src/scene-light';

const scene = (haut: number, bas: number): SceneLight => ({
  haut: { moyenne: haut, pic: haut },
  bas: { moyenne: bas, pic: bas },
});

/** Le contraste effectif du blanc sur une bande voilée. */
const tenue = (pic: number, alpha: number) => contraste(1, luminance(grisVoile(pic, alpha)));

describe('le seuil de gris', () => {
  it('rend exactement la cible visée', () => {
    const g = seuilGris(CIBLE_CONTRASTE);
    expect(tenue(g, 0)).toBeGreaterThanOrEqual(CIBLE_CONTRASTE - 0.01);
    // Juste au-dessus, ça ne tient plus · sinon le seuil serait pris trop bas et
    // on voilerait plus que nécessaire sans que rien ne le signale.
    expect(tenue(g + 0.02, 0)).toBeLessThan(CIBLE_CONTRASTE);
  });
});

describe('la garantie de lisibilité', () => {
  /**
   * LE test.
   *
   * Sur n'importe quelle scène, le point le plus TRANSPARENT du panneau doit
   * encore porter du blanc. C'est la seule promesse que la maquette fait, et
   * c'est celle qui casserait en silence : un voile trop mince ne plante pas,
   * il rend une accroche qu'on ne lit plus.
   */
  it('tient sur toute la plage de scènes', () => {
    for (let pic = 0; pic <= 1.0001; pic += 0.01) {
      const v = voilesDe(scene(pic, pic));
      expect(tenue(pic, v.basDoux), `bas · pic ${pic.toFixed(2)}`).toBeGreaterThanOrEqual(CIBLE_CONTRASTE - 0.05);
      expect(tenue(pic, v.basFort), `fort · pic ${pic.toFixed(2)}`).toBeGreaterThanOrEqual(CIBLE_CONTRASTE - 0.05);
      // Le bandeau du haut porte du texte plus petit mais rare · même exigence.
      expect(tenue(pic, v.haut), `haut · pic ${pic.toFixed(2)}`).toBeGreaterThanOrEqual(CIBLE_CONTRASTE - 0.05);
    }
  });

  it('le voile calculé est le plus mince qui tienne', () => {
    // Un point d'opacité en moins et ça ne passe plus · c'est ce qui interdit de
    // se rassurer en remontant le plancher « au cas où ».
    for (const pic of [0.5, 0.65, 0.8, 0.95]) {
      const a = voileNecessaire(pic);
      expect(tenue(pic, a)).toBeGreaterThanOrEqual(CIBLE_CONTRASTE - 0.05);
      expect(tenue(pic, Math.max(0, a - 0.05))).toBeLessThan(CIBLE_CONTRASTE);
    }
  });

  it('ne demande rien à une scène déjà assez sombre', () => {
    expect(voileNecessaire(0.2)).toBe(0);
    expect(voileNecessaire(GRIS_VOILE)).toBe(0);
  });
});

describe('le voile suit la scène', () => {
  it('monte avec la clarté, sans jamais redescendre', () => {
    let precedent = -1;
    for (let pic = 0; pic <= 1.0001; pic += 0.02) {
      const v = voilesDe(scene(pic, pic));
      expect(v.basDoux).toBeGreaterThanOrEqual(precedent);
      precedent = v.basDoux;
    }
  });

  it('rend la photo sur une scène sombre · le défaut de la maquette', () => {
    // C'est le gain qu'on cherche : la moitié basse cessait d'être une photo
    // pour devenir un rectangle noir, quelle que soit l'image.
    const sombre = voilesDe(scene(0.15, 0.18));
    expect(sombre.basFort).toBeLessThan(VOILES_PAR_DEFAUT.basFort - 0.2);
    expect(sombre.basDoux).toBeLessThan(VOILES_PAR_DEFAUT.basDoux);
    expect(sombre.haut).toBeLessThan(VOILES_PAR_DEFAUT.haut - 0.2);
  });

  it('serre sur une scène claire', () => {
    const clair = voilesDe(scene(0.92, 0.9));
    expect(clair.basFort).toBeGreaterThan(0.9);
    expect(clair.haut).toBeGreaterThan(0.55);
  });

  it('la base est toujours plus dense que le point tendre', () => {
    for (let pic = 0; pic <= 1.0001; pic += 0.05) {
      const v = voilesDe(scene(pic, pic));
      expect(v.basFort).toBeGreaterThanOrEqual(v.basDoux);
    }
  });
});

describe('une scène non mesurée', () => {
  it('garde exactement les voiles d’avant', () => {
    // Une publicité déjà composée ne doit pas changer d'allure sans qu'on ait
    // rien appris sur elle · et on ne voile pas moins que ce qu'on justifie.
    expect(voilesDe(null)).toEqual(VOILES_PAR_DEFAUT);
    expect(voilesDe(undefined)).toEqual(VOILES_PAR_DEFAUT);
  });
});

describe('la mesure d’une bande', () => {
  it('prend le neuvième décile, pas la moyenne', () => {
    // Neuf pixels noirs et un reflet blanc : la moyenne dit « tout va bien »,
    // et le mot qui traverse le reflet est illisible.
    const b = bandeDe([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(b.moyenne).toBeCloseTo(0.1, 5);
    expect(b.pic).toBe(1);
  });

  it('ne sort pas du tableau sur un échantillon court', () => {
    expect(bandeDe([0.4]).pic).toBe(0.4);
    expect(bandeDe([]).pic).toBe(0);
  });

  it('est insensible à l’ordre', () => {
    const a = bandeDe([0.9, 0.1, 0.5, 0.3]);
    const b = bandeDe([0.3, 0.5, 0.1, 0.9]);
    expect(a).toEqual(b);
  });
});
