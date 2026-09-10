import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageInfo } from '../components/PageInfo';

/**
 * Le mode d'emploi existait mais si discret que le proprio ne l'avait jamais vu.
 * On vérifie, dans le rendu, que le déclencheur est une pastille REPÉRABLE : un
 * « i » en accent, une bordure, et le libellé lisible · plus un texte gris plat.
 */
describe('le mode d’emploi est repérable', () => {
  const html = renderToStaticMarkup(<PageInfo title="chercher & sourcer des créas">Explication.</PageInfo>);

  it('porte un déclencheur bordé (pastille), pas un texte nu', () => {
    expect(html).toContain('border:1px solid var(--line-2)');
    expect(html).toContain('border-radius:999px');
  });

  it('le « i » est en accent, pas en gris muet', () => {
    expect(html, 'le repère d’aide n’attire plus l’œil').toContain('color:var(--accent-strong)');
  });

  it('le titre de la page reste affiché', () => {
    expect(html).toContain('chercher &amp; sourcer des créas');
  });
});
