// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L8-B · UX-03 · hors ligne au moment du geste, MONTÉ (jsdom).
 *
 * Mesuré avant au navigateur (Chromium hors ligne, 1280 et 390 × 720) :
 * « IA et Studios » · « Importer en brouillon » faisait tomber l'écran ENTIER
 * (« Application error »), saisies perdues. Le cas « Préparer une création »
 * (composant V5 retiré) est porté sur l'assistant Spatial
 * (`spatial-studios-assistant` · « créer hors ligne »).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ importer: vi.fn(), creerRelease: vi.fn() }));
vi.mock('../app/actions/studios/prompts', () => ({
  importerPackAction: m.importer, validerVersionAction: vi.fn(), evaluerReleaseAction: vi.fn(), retirerReleaseAction: vi.fn(), creerReleaseAction: m.creerRelease,
  publierReleaseAction: vi.fn(), rollbackReleaseAction: vi.fn(), revoquerReleaseAction: vi.fn(), enregistrerBrouillonAction: vi.fn(), approuverBenchmarkAction: vi.fn(),
  validerImportsAction: vi.fn(), approuverRecetteManuelleAction: vi.fn(),
}));
vi.mock('../lib/studios/benchmark/actions', () => ({ approuverBudgetBenchmarkAction: vi.fn(), joindreFichesBenchmarkAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { messageHorsLigneStudio } from '@tiktrends/core';
// Spatial · vague 3 · les gestes du registre vivent dans le « Registre IA » (l'écran V5 « IA et Studios » est retiré).
import { CommandeRegistre, NouvelleRelease } from '../spatial/vues/admin/registre-client';

let root: Root | null = null; let hote: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); hote?.remove(); root = null; hote = null; vi.clearAllMocks(); });
function monter(el: React.ReactElement) { hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); act(() => root!.render(el)); }
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const bouton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;
const actif = () => document.activeElement as HTMLElement | null;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
function saisir(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Registre IA · une commande hors ligne ne fait plus tomber l’écran', () => {
  it('« Importer en brouillon » hors ligne · refus lisible sous le bouton, aucune exception', async () => {
    m.importer.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    monter(<CommandeRegistre commande="importer" libelle="Importer en brouillon" succes="Importé." />);
    await act(async () => bouton('Importer en brouillon').click());
    await flush();
    expect(q('[role="alert"]')!.textContent).toBe(`Hors ligne · ${messageHorsLigneStudio('commande')}`);
    expect(actif(), 'le focus n’a pas suivi le refus').toBe(q('[role="alert"]'));
    expect(bouton('Importer en brouillon').disabled).toBe(false);
  });
  it('« Créer la release » hors ligne · le motif saisi reste', async () => {
    m.creerRelease.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    monter(<NouvelleRelease />);
    act(() => saisir(q('input') as HTMLInputElement, 'éclairage plus chaud'));
    await act(async () => bouton('Créer la release').click());
    await flush();
    expect(q('[role="alert"]')!.textContent).toContain('Connexion perdue');
    expect((q('input') as HTMLInputElement).value).toBe('éclairage plus chaud');
  });
});
