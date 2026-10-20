// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InspoAd } from '@tiktrends/integrations';
vi.mock('../app/actions/jarvis-veille-panneau', () => ({ chargerPanneauVeille: vi.fn() }));
vi.mock('../app/(app)/jarvis/JarvisChat', () => ({ JarvisChat: () => null }));
vi.mock('../components/studios/PreparerCreation', () => ({ PreparerCreation: () => <button>Créer</button> }));
vi.mock('../components/InspoButtons', () => ({ FollowButton: () => <button>Suivre</button> }));
import { ActionsVeille } from '../components/ActionsVeille';
const ad = { id: 'pub1', platform: 'meta', advertiserName: 'Marque très longue', body: 'Une accroche réelle', mainCountry: 'FR' } as InspoAd;
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });
describe('Actions Veille', () => {
  it('ouvre sans appel IA, transmet la source et rend le focus à Échap', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const requete = vi.fn(); vi.stubGlobal('fetch', requete);
    const conteneur = document.createElement('div'); document.body.append(conteneur);
    const root = createRoot(conteneur);
    await act(async () => root.render(<ActionsVeille ad={ad} following={false} retour="/veille?q=peau" annonceur="/veille?q=marque" />));
    const bouton = [...conteneur.querySelectorAll('button')].find((b) => b.textContent?.includes('Actions'))!;
    bouton.focus();
    await act(async () => bouton.click());
    const panneau = document.querySelector('[role="dialog"]')!;
    expect(panneau).toBeTruthy(); expect(conteneur.contains(panneau)).toBe(false);
    const liens = [...panneau.querySelectorAll('a')];
    const accroche = liens.find((a) => a.textContent?.includes('Analyser l’accroche'))!;
    const url = new URL(accroche.href);
    expect(url.pathname).toBe('/jarvis/veille'); expect(url.searchParams.get('action')).toBe('accroche');
    expect(decodeURIComponent(accroche.href)).toContain('pub1');
    const exportTexte = liens.find((a) => a.hasAttribute('download'))!;
    expect(decodeURIComponent(exportTexte.href)).toContain(ad.body);
    expect(panneau.textContent).toContain('Transcription audio non raccordée');
    expect(requete).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(bouton);
    await act(async () => root.unmount());
  });
});
