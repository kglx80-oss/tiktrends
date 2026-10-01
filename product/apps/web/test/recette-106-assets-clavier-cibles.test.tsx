// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Recette #106 · lot B · la bibliothèque d'assets, montée pour de vrai (jsdom).
 *
 * Mesuré en local avant correctif (1280) · puces de filtre 35 px sans état
 * annoncé, boutons d'action 42 px, actions de carte 17 px (Template, Suppr.,
 * ouvrir), case « IA » 13 px ; les panneaux « Google Drive » et « Importer par
 * lien » ne disaient pas leur état et Échap ne les fermait pas.
 *
 * On lit le DOM rendu · l'état pressé des puces, `aria-expanded`, la hauteur
 * minimale posée sur chaque cible, et `document.activeElement` après Échap.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: async () => ({}), importAssetAction: async () => ({}),
  deleteAssetAction: async () => ({}), toggleAssetAiAction: async () => ({}),
  basculerTemplateAction: async () => ({}), presignAssetUploadAction: async () => ({}),
  registerUploadedAssetAction: async () => ({}), tagAssetAction: async () => ({}),
  tagUntaggedImagesAction: async () => ({}),
}));

import { AssetsLibrary } from '../app/(app)/assets/AssetsLibrary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const asset = (over: Record<string, unknown> = {}) => ({
  id: 'a1', name: 'Packshot sérum', kind: 'image', source: 'upload',
  url: 'data:image/png;base64,AAAA', thumbUrl: null, brandId: null,
  useForAi: true, sizeBytes: 1000, tags: [], isTemplate: false,
  createdAt: new Date().toISOString(), ...over,
});

let root: Root | null = null; let hote: HTMLDivElement | null = null;
const monter = async () => {
  hote = document.createElement('div'); document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => {
    root!.render(<AssetsLibrary initial={[asset() as never, asset({ id: 'a2', name: 'Rush 01', kind: 'video', source: 'url', url: 'https://exemple.invalid/r.mp4' }) as never]} brandName="Neva" storageEnabled={false} isAdmin />);
  });
  return hote;
};
afterEach(() => { act(() => root?.unmount()); hote?.remove(); root = null; hote = null; });

const bouton = (h: HTMLElement, t: string) => [...h.querySelectorAll('button')].find((b) => (b.textContent || '').trim().startsWith(t)) as HTMLButtonElement;
const echap = (el: Element) => act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

describe('Recette #106 · Assets · puces de filtre', () => {
  it('chaque puce annonce son état pressé, et il suit le clic', async () => {
    const h = await monter();
    expect(bouton(h, 'Tous').getAttribute('aria-pressed')).toBe('true');
    expect(bouton(h, 'Vidéos').getAttribute('aria-pressed')).toBe('false');
    await act(async () => { bouton(h, 'Vidéos').click(); });
    expect(bouton(h, 'Vidéos').getAttribute('aria-pressed'), 'la puce cliquée ne se dit pas pressée').toBe('true');
    expect(bouton(h, 'Tous').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Recette #106 · Assets · cibles de 44 px', () => {
  it('puces, boutons d’action, recherche et actions de carte ont une hauteur minimale de 44 px', async () => {
    const h = await monter();
    const cibles: Array<[string, HTMLElement]> = [
      ...['Tous', 'Images', 'Vidéos', 'Audio', 'Autres', 'Téléverser', 'Google Drive', 'Importer par lien', 'Template', 'Suppr.', 'Analyser (1 cr.)'].map((t) => [t, bouton(h, t)] as [string, HTMLElement]),
      ['recherche', h.querySelector('input[aria-label^="Rechercher"]') as HTMLElement],
      ['ouvrir ↗', [...h.querySelectorAll('a')].find((a) => a.textContent?.includes('ouvrir')) as HTMLElement],
      ['case IA', [...h.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'IA') as HTMLElement],
      ['Commun à l’espace', [...h.querySelectorAll('label')].find((l) => l.textContent?.includes('Commun')) as HTMLElement],
    ];
    for (const [nom, el] of cibles) {
      expect(el, `cible introuvable : ${nom}`).toBeTruthy();
      expect(el.style.minHeight, `« ${nom} » n’a pas de hauteur minimale de 44 px`).toBe('44px');
    }
  });
});

describe('Recette #106 · Assets · panneaux d’import · état et Échap', () => {
  for (const [nom, champ] of [['Google Drive', 'textarea'], ['Importer par lien', 'input[placeholder="https://…"]']] as const) {
    it(`« ${nom} » · aria-expanded suit l’ouverture, Échap ferme et rend le focus au bouton`, async () => {
      const h = await monter();
      const b = bouton(h, nom);
      expect(b.getAttribute('aria-expanded')).toBe('false');
      await act(async () => { b.click(); });
      expect(b.getAttribute('aria-expanded'), 'l’ouverture n’est pas annoncée').toBe('true');
      const c = h.querySelector(champ) as HTMLElement;
      expect(c, 'le panneau ne s’est pas ouvert').toBeTruthy();
      c.focus();
      await echap(c);
      expect(h.querySelector(champ), 'Échap ne ferme pas le panneau').toBeNull();
      expect(b.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement, 'le focus n’est pas rendu au bouton qui a ouvert le panneau').toBe(b);
    });
  }
});
