// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { AssistantImage } from '../app/(app)/studio/image/AssistantImage';
import { AssistantVideo } from '../app/(app)/studio/video/AssistantVideo';

/**
 * Lot 11 · cibles des assistants guidés, à TOUTES les étapes. Mesuré au
 * navigateur · l'assistant Vidéo n'avait aucun bouton à 44 px (la croix
 * « Fermer » faisait 20 px, les onglets d'étape 29 px), alors que l'Image les
 * avait tous. On monte chaque assistant, on ouvre chaque étape par son onglet,
 * et on lit le style de chaque bouton rendu.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); document.body.innerHTML = ''; root = null; el = null; });
const noop = () => {};
const atteint = (b: HTMLElement) => {
  const s = b.style; const n = (v: string) => parseFloat(v) || 0;
  return Math.max(n(s.minHeight), n(s.height)) >= CIBLE_TACTILE_MIN;
};
function sousCible(n: React.ReactNode, etapes: number) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => { root!.render(n); });
  const fautifs = new Set<string>();
  for (let i = 0; i < etapes; i++) {
    const dlg = document.querySelector('[role=dialog]')!;
    const onglets = [...dlg.querySelectorAll('button')].slice(0, etapes);
    act(() => { onglets[i]!.click(); });
    for (const b of document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')) {
      if (!atteint(b)) fautifs.add(`${(b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 24)}`);
    }
  }
  return [...fautifs];
}

describe('Assistants guidés · chaque bouton atteint 44 px, à chaque étape', () => {
  it('Vidéo', () => {
    expect(sousCible(<AssistantVideo ouvert onFermer={noop} etat={{ mode: 't2v', imagePrete: false, description: 'Exemple', ratio: '9:16', duree: 5 }}
      onMode={noop} slotDepart={null} onDescription={noop} onSuggest={noop} directions={[{ key: 'orbite', label: 'Orbite', hint: 'h' }]} onDirection={noop}
      onRatio={noop} onDuree={noop} ratios={['9:16', '1:1']} durees={[5, 10]} coutParVideo={20} busy={false} onGenerer={noop} />, 3), 'boutons sous 44 px').toEqual([]);
  });
  it('Image', () => {
    expect(sousCible(<AssistantImage ouvert onFermer={noop} etat={{ mode: 't2i', aPhotoProduit: false, description: 'Exemple', direction: '', ratio: '1:1', nombre: 1, moteur: 'm' }}
      produits={[]} productId="" aiReady onMode={noop} onProduit={noop} slotPhoto={null} onDescription={noop} onSuggest={noop} onDirection={noop}
      onRatio={noop} onNombre={noop} onMoteur={noop} ratios={['1:1', '9:16']} moteurs={[{ key: 'm', label: 'Moteur' }]} directions={[{ key: 'd', label: 'Studio', hint: 'h' }]}
      coutParVisuel={4} duree="quelques secondes" busy={false} onGenerer={noop} />, 4), 'boutons sous 44 px').toEqual([]);
  });
});

describe('Assistants guidés · « Retour » à la première étape garde le focus dans la fenêtre', () => {
  const cas: Array<[string, React.ReactNode]> = [
    ['Vidéo', <AssistantVideo key="v" ouvert onFermer={noop} etat={{ mode: 't2v', imagePrete: false, description: 'Exemple', ratio: '9:16', duree: 5 }}
      onMode={noop} slotDepart={null} onDescription={noop} onRatio={noop} onDuree={noop} ratios={['9:16']} durees={[5]} coutParVideo={20} busy={false} onGenerer={noop} />],
    ['Image', <AssistantImage key="i" ouvert onFermer={noop} etat={{ mode: 't2i', aPhotoProduit: false, description: 'Exemple', direction: '', ratio: '1:1', nombre: 1, moteur: 'm' }}
      produits={[]} productId="" aiReady onMode={noop} onProduit={noop} slotPhoto={null} onDescription={noop} onDirection={noop}
      onRatio={noop} onNombre={noop} onMoteur={noop} ratios={['1:1']} moteurs={[{ key: 'm', label: 'Moteur' }]} directions={[]}
      coutParVisuel={4} duree="quelques secondes" busy={false} onGenerer={noop} />],
  ];
  for (const [nom, n] of cas) {
    it(nom, () => {
      el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
      act(() => { root!.render(n); });
      const bouton = (re: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find((b) => re.test(b.textContent || ''))!;
      act(() => { bouton(/Suivant/).click(); });
      const retour = bouton(/Retour/);
      expect(retour.disabled).toBe(false);
      retour.focus();
      act(() => { retour.click(); });
      const a = document.activeElement as HTMLButtonElement;
      expect(document.querySelector('[role=dialog]')!.contains(a), 'focus hors de la fenêtre').toBe(true);
      expect(a.disabled, 'focus laissé sur un bouton désactivé').toBeFalsy();
    });
  }
});
