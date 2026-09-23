// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Modal } from '../components/Modal';

/**
 * La modale doit ÉCHAPPER au contexte d'empilement de l'endroit d'où on
 * l'ouvre · défaut réel signalé (« premier clic, c'est bug ») : ouverte depuis
 * le tableau de bord (ancêtre transformé) ou le rail, la fenêtre « Nouvelle
 * marque » n'avait plus de voile couvrant, et le chrome de page (bouton
 * « équipe & invitations », cartes) passait PAR-DESSUS.
 *
 * ── Ce qu'on vérifie · un RÉSULTAT de DOM, pas la présence d'un appel ─────────
 *
 * Un `position: fixed` sous un ancêtre `transform` n'est plus relatif à l'écran
 * mais à cet ancêtre · son overlay ne couvre plus la page. La correction monte
 * la modale via un PORTAIL sur `<body>`. On monte donc la VRAIE `Modal` DANS un
 * ancêtre transformé et on lit l'arbre : le dialogue ne doit PAS rester
 * descendant du piège · il doit être rattaché à `<body>`.
 *
 * Mutation-preuve : retirer `createPortal` (rendre le JSX en place) remet le
 * dialogue SOUS le piège transformé · `piege.contains(dialog)` repasse à `true`
 * et ce test échoue. C'est exactement le défaut qu'on corrige.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let piege: HTMLDivElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  piege.remove();
});

function monterDansPiege(node: Parameters<Root['render']>[0]) {
  // L'ancêtre transformé · c'est lui qui capturait un descendant `position:fixed`
  // (le tableau de bord réel a un ancêtre transformé/animé, le rail un
  // `translateX`). Sans portail, l'overlay de la modale y serait confiné.
  piege = document.createElement('div');
  piege.style.transform = 'translateZ(0)';
  document.body.appendChild(piege);
  root = createRoot(piege);
  act(() => root.render(node));
}

describe('Modal · échappe au piège d’empilement (portail vers <body>)', () => {
  it('rendue sous un ancêtre transformé, la fenêtre atterrit sur <body>, hors du piège', () => {
    monterDansPiege(
      <Modal open onClose={() => {}} title="Nouvelle marque" subtitle="test">
        <button type="button">Créer</button>
      </Modal>,
    );

    const dialog = document.querySelector('[role="dialog"][aria-label="Nouvelle marque"]');
    expect(dialog, 'la modale doit être rendue quand open').not.toBeNull();

    // Le RÉSULTAT · le dialogue n'est PAS descendant de l'ancêtre transformé.
    expect(
      piege.contains(dialog),
      'la modale ne doit PAS rester piégée dans l’ancêtre transformé',
    ).toBe(false);

    // Et il EST rattaché à <body> · son overlay `fixed` couvre donc l'écran et
    // son z-index s'évalue au niveau racine, au-dessus du chrome de page.
    const overlay = dialog!.parentElement;
    expect(overlay?.parentElement, 'le voile de la modale doit être monté sur <body>').toBe(document.body);
  });

  it('fermée (open=false), rien n’est rendu sur <body>', () => {
    monterDansPiege(
      <Modal open={false} onClose={() => {}} title="Nouvelle marque">
        <button type="button">Créer</button>
      </Modal>,
    );
    expect(document.querySelector('[role="dialog"][aria-label="Nouvelle marque"]')).toBeNull();
  });
});
