import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GrilleMoteurs } from '../components/GrilleMoteurs';

/**
 * Ce que la grille légère de moteurs AFFICHE · on rend et on lit le HTML. Le
 * studio Image présentait ses modèles dans un menu déroulant · désormais une
 * grille de cartes, même langage que le studio Pubs IA. Un moteur oublié, une
 * vignette manquante ou un badge « recommandé » disparu se verraient ici.
 */
const noop = () => {};
const moteurs = [
  { key: 'nano', label: 'Nano Banana 2', recommended: true },
  { key: 'gpt2', label: 'GPT Image 2' },
];

function html(over: Partial<Parameters<typeof GrilleMoteurs>[0]> = {}): string {
  return renderToStaticMarkup(<GrilleMoteurs moteurs={moteurs} valeur="nano" onChoisir={noop} {...over} />);
}

describe('la grille légère de moteurs se voit', () => {
  it('une carte par moteur, avec son nom', () => {
    const out = html();
    expect(out).toContain('Nano Banana 2');
    expect(out).toContain('GPT Image 2');
  });

  it('chaque carte porte un exemple visuel dessiné', () => {
    const out = html();
    // Deux familles → deux motifs distincts, comme dans le studio Pubs IA.
    expect(out).toContain('data-motif="produit"');
    expect(out).toContain('data-motif="texte"');
  });

  it('le recommandé est marqué, et un seul moteur est sélectionné', () => {
    const out = html({ valeur: 'gpt2' });
    expect(out, 'le recommandé porte son badge').toContain('recommandé');
    expect(out.split('aria-pressed="true"').length - 1, 'une seule carte sélectionnée').toBe(1);
  });
});
