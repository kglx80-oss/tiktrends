import { describe, expect, it } from 'vitest';
import { policeTechnique } from '../src/polices';

/**
 * S04 · une fonte d'icônes ne doit jamais être proposée comme police de texte
 * d'une marque. On juge sur le NOM · on vérifie le RÉSULTAT : les librairies
 * d'icônes courantes et les marqueurs génériques sont reconnus, une vraie
 * police de texte ne l'est pas.
 */
describe('S04 · policeTechnique · reconnaître une fonte d’icônes', () => {
  it('reconnaît les librairies d’icônes courantes', () => {
    for (const nom of [
      'FontAwesome', 'Font Awesome 6 Free', 'Material Icons', 'Material Symbols Outlined',
      'IcoMoon', 'Fontello', 'Ionicons', 'themify', 'dashicons', 'bootstrap-icons',
      'Feather', 'glyphicons-halflings', 'my-icons-webfont',
    ]) {
      expect(policeTechnique(nom), `${nom} devrait être technique`).toBe(true);
    }
  });

  it('laisse passer les vraies polices de texte', () => {
    for (const nom of ['Inter', 'Poppins', 'Montserrat', 'Playfair Display', 'Georgia', 'Times New Roman', 'DM Sans']) {
      expect(policeTechnique(nom), `${nom} ne devrait pas être technique`).toBe(false);
    }
  });

  it('tolère les entrées vides ou nulles sans les compter comme techniques', () => {
    expect(policeTechnique('')).toBe(false);
    // @ts-expect-error · robustesse à l'entrée non-chaîne
    expect(policeTechnique(null)).toBe(false);
    // @ts-expect-error · robustesse à l'entrée non-chaîne
    expect(policeTechnique(undefined)).toBe(false);
  });
});
