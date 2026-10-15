// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Sécurité · marques suivies · `followBrand` / `unfollowBrand` disent désormais
 * NON par une valeur (droit Veille) au lieu de réussir en silence. L'écran doit
 * le montrer · on MONTE les vrais boutons sous la vraie pile de retours, l'action
 * répond « refusé », et on lit le bouton · jamais « ✓ Suivi » sur un non, la
 * marque retirée réapparaît, et le refus se lit.
 */
const appel = vi.hoisted(() => ({ reponse: { ok: false, error: 'La Veille est incluse dès l’offre Core.' } as unknown, refresh: 0 }));
vi.mock('../app/actions/inspo', () => ({
  saveAd: async () => ({ ok: true }), unsaveAd: async () => ({ ok: true }),
  followBrand: async () => appel.reponse, unfollowBrand: async () => appel.reponse,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => { appel.refresh++; } }) }));

import { FollowButton, BrandRemoveButton } from '../components/InspoButtons';
import { ToastProvider } from '../components/Toast';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });

const ad = { id: 'e1', platform: 'meta', status: 'active', daysRunning: 3, mediaType: 'image', advertiserName: 'Concurrent' } as InspoAd;

async function monter(noeud: React.ReactNode) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<ToastProvider>{noeud}</ToastProvider>); });
  return el;
}
async function cliquer(b: HTMLButtonElement) {
  await act(async () => { b.click(); });
  await act(async () => { await Promise.resolve(); });
}

describe('Suivre · un refus de l’action se voit', () => {
  it('« + Suivre » refusé · le bouton revient à « + Suivre » et le refus se lit', async () => {
    appel.reponse = { ok: false, error: 'La Veille est incluse dès l’offre Core.' };
    const racine = await monter(<FollowButton ad={ad} initialFollowing={false} />);
    const b = racine.querySelector('button[aria-pressed]') as HTMLButtonElement;
    await cliquer(b);
    expect(b.getAttribute('aria-pressed'), 'FollowButton · « ✓ Suivi » affiché malgré le refus').toBe('false');
    expect(b.textContent).toContain('+ Suivre');
    expect(racine.textContent, 'FollowButton · le refus n’est pas dit').toContain('offre Core');
  });

  it('« + Suivre » accepté · « ✓ Suivi »', async () => {
    appel.reponse = { ok: true };
    const racine = await monter(<FollowButton ad={ad} initialFollowing={false} />);
    const b = racine.querySelector('button[aria-pressed]') as HTMLButtonElement;
    await cliquer(b);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.textContent).toContain('Suivi');
  });

  it('✕ refusé · la marque reste à l’écran, sans rafraîchissement', async () => {
    appel.reponse = { ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille.' }; appel.refresh = 0;
    const retraits: string[] = [];
    const racine = await monter(<BrandRemoveButton platform="meta" name="Concurrent" onRetrait={(e) => retraits.push(e)} />);
    await cliquer(racine.querySelector('button') as HTMLButtonElement);
    expect(racine.querySelector('button'), 'BrandRemoveButton · la marque disparaît malgré le refus').not.toBeNull();
    expect(retraits).toEqual(['retire', 'annule']);
    expect(appel.refresh).toBe(0);
    expect(racine.textContent, 'BrandRemoveButton · le refus n’est pas dit').toContain('Ton rôle ne permet pas d’utiliser la Veille');
  });

  it('✕ accepté · la marque disparaît', async () => {
    appel.reponse = { ok: true }; appel.refresh = 0;
    const racine = await monter(<BrandRemoveButton platform="meta" name="Concurrent" />);
    await cliquer(racine.querySelector('button') as HTMLButtonElement);
    expect(racine.querySelector('button')).toBeNull();
    expect(appel.refresh).toBe(1);
  });
});
