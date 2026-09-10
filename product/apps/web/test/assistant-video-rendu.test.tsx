import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantVideo } from '../app/(app)/studio/video/AssistantVideo';
import type { EtatAssistantVideo } from '@tiktrends/core';

/**
 * L'assistant Vidéo se VOIT · on rend et on lit le HTML. Il ne tire aucune
 * action serveur (il pilote l'état du studio par rappels), donc rendable ici.
 */

const noop = () => {};
const etat: EtatAssistantVideo = { mode: 'i2v', imagePrete: false, description: '', ratio: '9:16', duree: 5 };

function rendre(over: Partial<Parameters<typeof AssistantVideo>[0]> = {}) {
  return renderToStaticMarkup(
    <AssistantVideo
      ouvert etat={etat} onMode={noop} slotDepart={<div>DEPART_SLOT</div>} onDescription={noop}
      onRatio={noop} onDuree={noop} ratios={['9:16', '1:1']} durees={[5, 10]}
      coutParVideo={20} busy={false} onFermer={noop} onGenerer={noop}
      {...over}
    />,
  );
}

describe('l’assistant Vidéo guidé se rend', () => {
  it('fermé, il ne rend rien', () => {
    expect(rendre({ ouvert: false })).toBe('');
  });

  it('ouvert, il montre le fil des trois étapes et la première', () => {
    const html = rendre();
    expect(html).toContain('Le point de départ');
    expect(html).toContain('Le mouvement');
    expect(html).toContain('Format et durée');
    expect(html).toContain('DEPART_SLOT');
    expect(html).toContain('Suivant');
  });

  it('animer une image sans image dit ce qui manque', () => {
    expect(rendre()).toContain('Ajoute une image de départ');
  });
});
