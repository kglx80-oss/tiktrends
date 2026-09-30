// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * I1 · le panneau d'un test ouvert par lien profond (carte du Studio) doit
 * PRENDRE le focus · sinon, au clavier, Entrée sur « Voir le verdict » laisse le
 * focus derrière la modale. On monte le vrai panneau (actions serveur simulées)
 * et on lit `document.activeElement`.
 */
vi.mock('../app/actions/adsmap-verdict', () => ({
  adDetailAction: async () => ({ error: 'hors sujet pour ce test' }),
  validateVerdictAction: async () => ({}),
  createIterationAction: async () => ({}),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { AdDrawer } from '../app/(app)/adsmap/AdDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let desc: PropertyDescriptor | undefined;
beforeAll(() => {
  desc = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.parentNode as Element | null; } });
});
afterAll(() => { if (desc) Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', desc); });

describe('AdDrawer · le focus entre dans le panneau, Échap le referme une fois', () => {
  it('à l’ouverture, le focus est DANS le dialogue · Échap ferme une seule fois', async () => {
    vi.useFakeTimers();
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const onClose = vi.fn();
    const racine = createRoot(hote);
    await act(async () => {
      racine.render(<AdDrawer adId="3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f" onClose={onClose} onChanged={() => {}} retour={{ href: '/studio/ads', libelle: 'Retour au Studio' }} />);
    });
    await act(async () => { vi.advanceTimersByTime(50); });
    const dialogue = document.querySelector('[role="dialog"]');
    expect(dialogue, 'le panneau n’est pas monté').not.toBeNull();
    expect(dialogue!.contains(document.activeElement), 'le focus reste derrière la modale à l’ouverture').toBe(true);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose, 'Échap ne ferme pas, ou ferme deux fois').toHaveBeenCalledTimes(1);
    await act(async () => { racine.unmount(); });
    vi.useRealTimers();
  });
});
