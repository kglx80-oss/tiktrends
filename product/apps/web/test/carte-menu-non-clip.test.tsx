// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteCreative } from '../components/CarteCreative';

/**
 * Le menu d'actions (« … ») d'une carte NE DOIT PAS être rogné par la carte.
 *
 * ── Le défaut, mesuré au vrai navigateur ─────────────────────────────────────
 *
 * La carte portait `overflow: hidden` (pour arrondir les coins du média). Le
 * menu, plus large que la carte, débordait de ~26 px et se faisait COUPER au
 * bord (icônes tranchées) · confirmé au layout réel (`elementFromPoint` sur la
 * zone débordante renvoyait le fond, pas le menu). Correction : l'arrondi et le
 * clip passent sur le CONTENEUR MÉDIA · la carte ne clippe plus, le menu déborde
 * librement.
 *
 * jsdom ne calcule pas le clip (pas de layout) · on garde donc la STRUCTURE qui
 * porte le correctif, lue sur le rendu réel : l'`<article>` de la carte ne porte
 * pas `overflow: hidden`, et le conteneur média le porte (l'arrondi reste). Un
 * retour de `overflow: hidden` sur la carte — qui rouvrirait le clip — fait
 * tomber ce garde.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let hote: HTMLDivElement;
let root: Root;
afterEach(() => { act(() => root.unmount()); hote.remove(); });

function monter() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  act(() => root.render(
    <CarteCreative
      media={{ url: 'data:image/png;base64,AA==', isVideo: false, aspect: '1 / 1', fit: 'contain' } as never}
      titre="Carte de contrôle"
      actionPrincipale={{ cle: 'ouvrir', label: 'Ouvrir', onClick: () => {} }}
      actionsSecondaires={[
        { cle: 'dl', label: 'Télécharger en haute définition', onClick: () => {} },
        { cle: 'arch', label: 'Archiver cette création', onClick: () => {} },
      ] as never}
      initial={{ menu: true }}
    />,
  ));
}

describe('carte · le menu d’actions n’est pas rogné par la carte', () => {
  it('l’<article> de la carte ne porte pas overflow:hidden (le menu peut déborder)', () => {
    monter();
    const article = hote.querySelector('article');
    expect(article, 'la carte doit être rendue').not.toBeNull();
    expect(article!.style.overflow, 'la carte ne doit pas clipper (sinon le menu est coupé)').not.toBe('hidden');
    // Le menu est bien ouvert et présent (sinon le test ne prouverait rien).
    expect(hote.querySelector('[role="menu"]'), 'le menu d’actions doit être ouvert').not.toBeNull();
  });

  it('le conteneur média porte le clip + l’arrondi (les coins restent arrondis)', () => {
    monter();
    const article = hote.querySelector('article')!;
    const media = Array.from(article.querySelectorAll<HTMLElement>('div'))
      .find((d) => d.style.overflow === 'hidden' && d.style.borderTopLeftRadius);
    expect(media, 'un conteneur média doit porter overflow:hidden + arrondi haut').toBeTruthy();
    expect(media!.style.borderTopLeftRadius).toBe('14px');
    expect(media!.style.borderTopRightRadius).toBe('14px');
  });
});
