// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 19C · message 55 (a) · `saveAd` peut répondre `ok:false` (droit Veille,
 * annonce déjà gardée pour une autre marque). Le ★ est le SEUL appelant de
 * `saveAd` (`git grep` · `components/InspoButtons.tsx`), monté par `AdCard`
 * (Veille, fiche annonceur, Nouveautés, Découverte, Sauvegardes, Formats) et par
 * le swipe file de Scale. On MONTE le bouton (jsdom) avec la vraie pile de
 * retours (`ToastProvider`) et on lit le DOM après le clic · aucun « sauvegardé »
 * (★ plein, `aria-pressed="true"`) ne doit survivre à un refus, et le refus est dit.
 *
 * Mesuré avant correction · le ★ restait plein et `aria-pressed="true"` après
 * un `{ ok: false }` (seule une exception remettait l'état).
 */
const appel = vi.hoisted(() => ({ reponse: { ok: true } as unknown, recu: [] as unknown[] }));
vi.mock('../app/actions/inspo', () => ({
  saveAd: async (x: unknown) => { appel.recu.push(x); if (appel.reponse instanceof Error) throw appel.reponse; return appel.reponse; },
  unsaveAd: async () => {},
  followBrand: async () => {},
  unfollowBrand: async () => {},
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { SaveButton } from '../components/InspoButtons';
import { ToastProvider } from '../components/Toast';
import type { InspoAd } from '@tiktrends/integrations';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.recu = []; });

const ad = { id: 'e1', platform: 'meta', status: 'active', daysRunning: 3, mediaType: 'image', advertiserName: 'Marque' } as InspoAd;
async function cliquer(avecPile = true) {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const bouton = <SaveButton ad={ad} initialSaved={false} />;
  await act(async () => { root!.render(avecPile ? <ToastProvider>{bouton}</ToastProvider> : bouton); });
  const b = el.querySelector('button')!;
  await act(async () => { b.click(); });
  await act(async () => { await Promise.resolve(); });
  return { b, h: el };
}

describe('★ Sauvegarder · aucun faux succès', () => {
  it('oui du serveur · ★ plein, rien d’autre', async () => {
    appel.reponse = { ok: true };
    const { b } = await cliquer();
    expect(appel.recu).toHaveLength(1);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.textContent).toBe('★');
  });

  it('refus du serveur (ok:false) · le ★ redevient vide et le refus est dit', async () => {
    appel.reponse = { ok: false, error: 'La Veille est incluse dès l’offre Core · un propriétaire de l’espace peut changer d’offre dans Réglages.' };
    const { b, h } = await cliquer();
    expect(appel.recu).toHaveLength(1);
    expect(b.getAttribute('aria-pressed'), 'refusée, l’annonce est affichée comme sauvegardée').toBe('false');
    expect(b.textContent, 'refusée, le ★ reste plein').toBe('☆');
    expect(h.textContent, 'le refus n’est pas dit').toContain('La Veille est incluse dès l’offre Core');
    expect(b.disabled, 'le bouton reste bloqué après un refus').toBe(false);
  });

  it('refus sans pile de retours (rendu isolé) · le ★ redevient vide, sans lever', async () => {
    appel.reponse = { ok: false, error: 'Refus.' };
    const { b } = await cliquer(false);
    expect(b.getAttribute('aria-pressed')).toBe('false');
  });

  it('panne réseau · même honnêteté', async () => {
    appel.reponse = new Error('réseau');
    const { b } = await cliquer();
    expect(b.getAttribute('aria-pressed')).toBe('false');
  });
});
