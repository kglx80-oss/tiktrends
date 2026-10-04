// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 17 · trois ruptures de reprise et d'itération Adsmap, gardées par ce
 * qu'on VOIT (mesures au navigateur · MATRICE-lot17).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = vi.hoisted(() => ({ track: vi.fn(), detail: vi.fn(), candidats: vi.fn() }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackGeneratedAdAction: actions.track }));
vi.mock('../app/actions/creatives', () => ({ rateCreativeAction: vi.fn() }));
vi.mock('../app/actions/adsmap-batch', () => ({
  batchDetailAction: actions.detail, candidatesAction: actions.candidats,
  createBatchAction: vi.fn(), setBatchAdAction: vi.fn(), prepareBatchAction: vi.fn(), launchBatchAction: vi.fn(),
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast() {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const { CreativeActions } = await import('../components/CreativeActions');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); Object.values(actions).forEach((f) => f.mockReset()); sessionStorage.clear(); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });
const attendre = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (n: React.ReactNode) => { act(() => { root!.render(n); }); await attendre(); };

// La passerelle réelle compare l'id à une colonne uuid · tout autre format échoue.
const serveur = (id: string) => (UUID.test(id) ? { ok: true as const, adId: 'ada00000-0000-4000-8000-0000000000f9', prelaunch: 'À compléter avant le lancement.' } : { error: 'Le rattachement à la carte n’a pas abouti. Réessaie.' });
const G = 'f1700000-0000-4000-8000-0000000000a2';
const suivre = () => document.querySelector<HTMLButtonElement>('button[aria-label="Suivre dans Adsmap"]');

describe('Studio Image › « Suivre dans Adsmap » · identifiant composite (lot 17)', () => {
  it('carte `génération:url` · suivie, la fiche se lit et s’ouvre à l’écran, focus sur le lien', async () => {
    actions.track.mockImplementation(async (id: string) => serveur(id));
    await monter(<CreativeActions genId={`${G}:data:image/svg+xml;base64,AAA`} trackable />);
    await act(async () => { suivre()!.click(); }); await attendre();
    const statut = document.querySelector('[role=status]');
    expect(statut?.textContent, 'échec · l’id composite part tel quel vers une colonne uuid').toContain('Suivie dans Adsmap');
    const lien = statut!.querySelector('a');
    expect(lien?.getAttribute('href')).toBe('/adsmap?ad=ada00000-0000-4000-8000-0000000000f9&depuis=studio');
    expect(document.activeElement, 'le focus tombe sur <body>').toBe(lien);
  });

  it('échec · le message se lit À L’ÉCRAN (pas seulement en infobulle) et le focus revient au bouton', async () => {
    actions.track.mockResolvedValue({ error: 'Créa introuvable dans cette marque.' });
    await monter(<CreativeActions genId={G} trackable />);
    await act(async () => { suivre()!.focus(); suivre()!.click(); }); await attendre();
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Créa introuvable dans cette marque.');
    expect(document.activeElement).toBe(suivre());
  });

  it('image fraîche sans génération connue (`new-…`) · pas de bouton qui échouerait', async () => {
    await monter(<CreativeActions genId="new-0-https://exemple.test/a.png" trackable />);
    expect(suivre()).toBeNull();
    expect(actions.track).not.toHaveBeenCalled();
  });
});
