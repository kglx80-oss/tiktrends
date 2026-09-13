import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { buildVisualDaSystem, buildVisualDaUserPrompt, extractVisualDa } from '../src/da-visuelle';

// Un client qui rend une sortie d'outil arbitraire · pour éprouver ce qu'on
// STOCKE, sans appeler le modèle.
const clientQuiRend = (input: unknown): Anthropic =>
  ({ messages: { create: async () => ({ content: [{ type: 'tool_use', input }] }) } } as unknown as Anthropic);

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

  // Le modèle enfreint parfois le schéma (aEviter en chaîne). On le RANGE propre
  // AVANT de stocker · sinon une DA malformée dans brandKit casse le rendu et la
  // génération. On éprouve ce qui ressort d'extractVisualDa.
  it('range une sortie malformée · aEviter toujours en tableau de chaînes', async () => {
    const da = await extractVisualDa(clientQuiRend({ style: '  net ', aEviter: 'surcharge, stock' }), { name: 'X' });
    expect(da.style, 'le style doit être rogné').toBe('net');
    expect(Array.isArray(da.aEviter), 'aEviter doit ressortir en tableau').toBe(true);
    expect(da.aEviter).toEqual(['surcharge', 'stock']);
  });

  it('range un champ non-chaîne · écarté, pas propagé', async () => {
    const da = await extractVisualDa(clientQuiRend({ style: 42, photo: 'lifestyle', aEviter: ['ok', 7, null] }), { name: 'X' });
    expect(da.style, 'un nombre n’est pas un style').toBeUndefined();
    expect(da.photo).toBe('lifestyle');
    expect(da.aEviter).toEqual(['ok']);
  });
});
