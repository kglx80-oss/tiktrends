import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Le Studio Textes s'affichait en split 2 colonnes (`minmax(300px,380px) 1fr`)
 * qui ne s'effondrait jamais · sur un téléphone le brief + les résultats
 * débordaient à l'horizontale. On empile en mobile via useIsMobile (même patron
 * que la coquille). On rend le composant dans les DEUX états et on lit la grille.
 */
const setMobile = vi.fn(() => false);
vi.mock('../components/useIsMobile', () => ({ useIsMobile: () => setMobile() }));
vi.mock('../app/actions/studio', () => ({ generateAction: async () => ({}) }));

import { StudioClient } from '../app/(app)/studio/textes/StudioClient';

describe('Studio Textes · le split s’empile en mobile', () => {
  it('desktop · deux colonnes (brief étroit, résultats larges)', () => {
    setMobile.mockReturnValue(false);
    const out = renderToStaticMarkup(<StudioClient hasKey />);
    expect(out, 'le desktop perd son split 2 colonnes').toContain('grid-template-columns:minmax(300px, 380px) 1fr');
  });

  it('mobile · une seule colonne, plus de débordement', () => {
    setMobile.mockReturnValue(true);
    const out = renderToStaticMarkup(<StudioClient hasKey />);
    expect(out, 'le mobile ne s’empile pas en une colonne').toContain('grid-template-columns:1fr');
    expect(out, 'le split 2 colonnes subsiste en mobile').not.toContain('minmax(300px, 380px)');
  });
});
