import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantImage } from '../app/(app)/studio/image/AssistantImage';
import type { EtatAssistantImage } from '@tiktrends/core';

/**
 * L'assistant Image se VOIT · on rend le composant et on lit le HTML, pas la
 * seule présence d'un appel. Il ne tire aucune action serveur (il pilote l'état
 * du studio par rappels), donc il est rendable ici · à la différence du studio.
 *
 * Ce qu'on vérifie · le fil des étapes est rendu, la première étape s'affiche
 * avec son titre, et le bouton d'avancement porte le bon libellé.
 */

const noop = () => {};
const etat: EtatAssistantImage = {
  mode: 'i2i', aPhotoProduit: false, description: '', direction: '', ratio: '1:1', nombre: 1, moteur: 'nano',
};

function rendre(over: Partial<Parameters<typeof AssistantImage>[0]> = {}) {
  return renderToStaticMarkup(
    <AssistantImage
      ouvert etat={etat} produits={[]} productId="" aiReady
      onMode={noop} onProduit={noop} slotPhoto={<div>PHOTO_SLOT</div>} onDescription={noop}
      onDirection={noop} onRatio={noop} onNombre={noop} onMoteur={noop}
      ratios={['1:1', '9:16']} moteurs={[{ key: 'nano', label: 'Nano Banana', recommended: true }]}
      directions={[{ key: 'studio', label: 'Studio packshot', hint: 'Fond uni.' }]}
      coutParVisuel={2} duree="30 s à 1 min" busy={false} onFermer={noop} onGenerer={noop}
      {...over}
    />,
  );
}

describe('l’assistant Image guidé se rend', () => {
  it('fermé, il ne rend rien', () => {
    expect(rendre({ ouvert: false })).toBe('');
  });

  it('ouvert, il montre le fil des quatre étapes et la première', () => {
    const html = rendre();
    expect(html).toContain('Le produit');
    expect(html).toContain('La scène');
    expect(html).toContain('La direction artistique');
    // L'étape courante (produit) rend son slot photo réutilisé du studio.
    expect(html).toContain('PHOTO_SLOT');
    // On ne saute pas · le bouton avance d'un cran.
    expect(html).toContain('Suivant');
  });

  it('la mise en scène sans photo dit ce qui manque, sous le bouton', () => {
    const html = rendre();
    expect(html).toContain('Ajoute une photo de ton produit');
  });
});
