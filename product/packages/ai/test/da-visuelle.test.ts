import { describe, expect, it } from 'vitest';
import { buildVisualDaSystem, buildVisualDaUserPrompt } from '../src/da-visuelle';

/**
 * L'extraction de DA visuelle doit être GROUNDÉE sur les vrais signaux du site
 * (nom, couleurs, contenu) · sinon elle redevient générique. Et elle décrit un
 * STYLE, jamais une scène (le décor varie, le style tient). On éprouve le
 * RÉSULTAT des deux prompts purs · l'appel modèle, lui, n'est pas testable hors
 * ligne.
 */
describe('extraction DA · le prompt est grounder sur le site, et cadré sur le style', () => {
  it('le prompt utilisateur porte le nom, la palette et le contenu du site', () => {
    const p = buildVisualDaUserPrompt({
      name: 'Neva', url: 'https://neva.fr',
      colors: ['#E6007E', '#7828C8'], siteText: 'Focus sans caféine ni crash.',
    });
    expect(p).toContain('Neva');
    expect(p, 'la palette réelle du site n’est pas transmise').toContain('#E6007E');
    expect(p, 'le contenu réel du site n’est pas transmis').toContain('Focus sans caféine');
  });

  it('sans contenu, le prompt le dit au lieu d’inventer en silence', () => {
    const p = buildVisualDaUserPrompt({ name: 'Neva' });
    expect(p).toContain('Aucun contenu de site fourni');
  });

  it('le système cadre sur le STYLE, jamais une scène imposée', () => {
    const s = buildVisualDaSystem();
    expect(s, 'le cadrage « style, pas scène » a disparu').toContain('jamais une scène');
    expect(s).toContain('return_visual_da');
  });
});
