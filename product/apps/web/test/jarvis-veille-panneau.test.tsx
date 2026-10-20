// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
const charger = vi.hoisted(() => vi.fn());
vi.mock('../app/actions/jarvis-veille-panneau', () => ({ chargerPanneauVeille: charger }));
vi.mock('../app/(app)/jarvis/JarvisChat', () => ({ JarvisChat: ({ brandName, brouillonInitial }: { brandName: string; brouillonInitial: string }) => <div data-chat>{brandName} {brouillonInitial}</div> }));
import { JarvisVeillePanneau } from '../components/JarvisVeillePanneau';
describe('Tiroir Jarvis depuis une annonce', () => {
  it('charge le contexte sans appel IA, conserve la page et ferme au clavier', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    charger.mockResolvedValue({ ok: true, brandId: 'b', brandName: 'Neva', fiche: null, brouillon: 'Adapter cette source' });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<JarvisVeillePanneau href="/jarvis/veille?action=cloner&ref=source1" annonceur="Ploufy" extrait="Une annonce">Cloner</JarvisVeillePanneau>));
    const cta = host.querySelector('a')!; cta.focus();
    await act(async () => cta.click());
    expect(charger).toHaveBeenCalledWith({ action: 'cloner', ref: 'source1' });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Ploufy');
    expect(document.querySelector('[data-chat]')?.textContent).toContain('Neva');
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(cta);
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  });
  it('montre un refus sans monter le chat', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    charger.mockResolvedValue({ ok: false, message: 'Source hors espace' });
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<JarvisVeillePanneau href="/jarvis/veille?action=cloner&ref=x">Cloner</JarvisVeillePanneau>));
    await act(async () => host.querySelector('a')!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Source hors espace');
    expect(document.querySelector('[data-chat]')).toBeNull();
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  });
});
