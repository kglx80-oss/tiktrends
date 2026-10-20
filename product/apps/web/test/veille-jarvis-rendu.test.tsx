// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollTo = () => {};
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../app/actions/jarvis-chat', () => ({
  chatThreadAction: vi.fn(async () => ({ thread: { turns: [], conversations: [], conversationId: null, measuredAds: 0 } })),
  clearChatAction: vi.fn(),
}));
vi.mock('../app/actions/jarvis-conversations', () => ({ creerConversationAction: vi.fn(), renommerConversationAction: vi.fn() }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: vi.fn() }));
vi.mock('../app/(app)/jarvis/JarvisColonne', () => ({ JarvisColonne: () => null }));
vi.mock('../app/(app)/jarvis/JarvisAccueilV5', () => ({ JarvisAccueilV5: () => null }));
vi.mock('../components/useIsMobile', () => ({ useIsMobile: () => false }));
const { JarvisChat } = await import('../app/(app)/jarvis/JarvisChat');
afterEach(() => { vi.unstubAllGlobals(); });

describe('Brouillon contextualisé, relu avant la dépense', () => {
  it('rend demande et coût, sans POST avant le clic explicite', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, body: null, json: async () => ({ error: 'Test interrompu' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const el = document.createElement('div'); document.body.append(el);
    const root = createRoot(el);
    try {
      await act(async () => { root.render(<JarvisChat fiche={null} brandId="brand" brandName="Cible" projets={[]} kpiSource={null} brouillonInitial="Analyser le texte observé, pas la vidéo." />); });
      const textarea = el.querySelector('textarea')!;
      expect(textarea.value).toContain('Analyser le texte observé');
      expect(textarea.rows).toBe(8);
      expect(el.textContent).toContain('Coût IA fournisseur variable');
      expect(el.textContent).not.toContain('gratuit');
      expect(fetchMock).not.toHaveBeenCalled();
      await act(async () => { (el.querySelector('[aria-label="Envoyer le message à Jarvis"]') as HTMLButtonElement).click(); });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
      expect(body.message).toBe('Analyser le texte observé, pas la vidéo.');
    } finally { act(() => root.unmount()); el.remove(); }
  });
});
