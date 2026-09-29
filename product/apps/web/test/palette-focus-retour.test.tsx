// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPalette, CMDK_EVENT } from '../components/CommandPalette';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Kevin, 29/09 · la recherche globale a quitté le rail pour la barre commune ·
 * son accessibilité clavier compte. Après Échap, le focus doit REVENIR au
 * lanceur qui a ouvert la palette · sinon il retombe sur <body> et la
 * navigation clavier repart du haut de page. On rend, on ouvre, on ferme, on lit
 * `document.activeElement` · pas un appel, un RÉSULTAT.
 */
describe('CommandPalette · le focus revient au lanceur après fermeture', () => {
  it('ouvrir depuis un bouton, fermer par Échap → le focus revient au bouton', async () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<><button id="lanceur">Rechercher</button>
        <CommandPalette commands={[{ id: 'a', label: 'Accueil', group: 'x', href: '/dashboard' }]} /></>);
    });
    const lanceur = document.getElementById('lanceur') as HTMLButtonElement;
    lanceur.focus();
    expect(document.activeElement, 'le lanceur ne part pas focalisé').toBe(lanceur);

    // Ouvrir la palette (même événement que le clic du lanceur).
    await act(async () => { window.dispatchEvent(new Event(CMDK_EVENT)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    // La palette est portalisée sur <body> · on la cherche dans le document.
    const input = document.querySelector('[role="dialog"] input') as HTMLInputElement;
    expect(input, 'la palette n’a pas de champ').toBeTruthy();
    expect(document.activeElement, 'le champ ne prend pas le focus à l’ouverture').toBe(input);

    // Fermer par Échap · le focus doit revenir au lanceur.
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(document.activeElement, 'le focus n’est pas revenu au lanceur').toBe(lanceur);

    await act(async () => { root.unmount(); });
    host.remove();
  });
});
