import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IMAGE_MODELS, type ConseilMoteur } from '@tiktrends/core';
import { SelecteurMoteur } from '../app/(app)/studio/ads/SelecteurMoteur';

/**
 * Ce que la grille de moteurs AFFICHE · pas ce que le fichier mentionne. On rend
 * le composant et on lit le HTML · un moteur oublié, une vignette manquante ou un
 * badge « recommandé » disparu se voient ici, pas dans un compteur d'appels.
 *
 * Le composant ne tire aucune action serveur (il pilote par rappels), donc il est
 * rendable ici · à la différence de l'écran de studio.
 */

const noop = () => {};

const conseilVide: ConseilMoteur = { recommande: null, deconseilles: [], lignes: {}, resume: '' };

function html(over: Partial<Parameters<typeof SelecteurMoteur>[0]> = {}): string {
  return renderToStaticMarkup(
    <SelecteurMoteur
      models={IMAGE_MODELS}
      valeur="nano"
      onChoisir={noop}
      recommande="nano"
      conseil={conseilVide}
      mesureActive={false}
      {...over}
    />,
  );
}

describe('la grille de moteurs se voit', () => {
  it('rend une carte par moteur du catalogue · avec nom et prix', () => {
    const out = html();
    for (const m of IMAGE_MODELS) {
      expect(out, `${m.key} · nom absent`).toContain(m.label);
    }
    // Le prix en crédits est lisible · deux repères aux extrémités du catalogue.
    expect(out).toContain('4 cr. par pub');
    expect(out).toContain('20 cr. par pub');
  });

  it('montre DEUX exemples visuels distincts · packshot et typographie', () => {
    // Tout l'intérêt de la grille : chaque famille a sa vignette. Si les deux
    // motifs ne cohabitent pas, c'est la même carte répétée.
    const out = html();
    expect(out, 'la vignette packshot (fidélité produit) doit être rendue').toContain('data-motif="produit"');
    expect(out, 'la vignette typographie (texte net) doit être rendue').toContain('data-motif="texte"');
    // La force nommée, posée sur l'exemple.
    expect(out).toContain('Fidélité produit');
    expect(out).toContain('Texte net');
  });

  it('marque le moteur recommandé, et un seul est sélectionné', () => {
    const out = html({ valeur: 'gpt2', recommande: 'gpt2' });
    expect(out, 'le recommandé porte son badge').toContain('recommandé');
    // Un seul aria-pressed="true" · exactement la carte choisie.
    expect(out.split('aria-pressed="true"').length - 1, 'une seule carte sélectionnée').toBe(1);
  });

  it('quand la mesure a parlé, elle s’affiche · ligne mesurée + « tient le mieux ta copie ici »', () => {
    const conseil: ConseilMoteur = {
      recommande: 'gpt2',
      deconseilles: [],
      lignes: { gpt2: { texte: '12 pubs · 4 % de réécriture', verdict: 'meilleur' } },
      resume: 'GPT Image 2 tient le mieux ta copie sur cette marque.',
    };
    const out = html({ conseil, recommande: 'nano', mesureActive: true });
    expect(out, 'la ligne mesurée est rendue').toContain('12 pubs · 4 % de réécriture');
    expect(out, 'le libellé honnête est rendu').toContain('tient le mieux ta copie ici');
    // Le bandeau « on a retenu ta mesure » apparaît quand la mesure contredit le
    // défaut ET que le mode la fait jouer.
    expect(out, 'le bandeau de mesure est rendu').toContain('On a retenu le moteur que ta mesure désigne');
  });

  it('sans mesure active, pas de bandeau · même si la mesure contredit', () => {
    const conseil: ConseilMoteur = {
      recommande: 'gpt2', deconseilles: [], lignes: {}, resume: 'x',
    };
    const out = html({ conseil, recommande: 'nano', mesureActive: false });
    expect(out).not.toContain('On a retenu le moteur que ta mesure désigne');
  });
});
