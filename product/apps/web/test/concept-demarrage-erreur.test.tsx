// @vitest-environment jsdom
// Premier message du concept (écran Spatial, porté de la V5 en vague 2) · refus, réseau, succès.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ start: vi.fn(), replace: vi.fn() }));
vi.mock('../app/actions/studios/concept', () => ({ demarrerConcept: mocks.start }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/nouveau/concept', useRouter: () => ({ replace: mocks.replace, push: () => {}, refresh: () => {} }) }));
import { NouveauConcept } from '../spatial/vues/studios/NouveauConcept';
import { avecSpatial } from './spatial/fournisseur';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it.each(['refus', 'reseau', 'succes'])('premier message : %s conserve le concept sans nouvelle création', async (cas) => {
  mocks.start.mockResolvedValue({ ok: true, demarrage: { projectId: 'p1', conversationId: 'c1' } });
  const fetcher = vi.fn(async () => {
    if (cas === 'reseau') throw new Error('network');
    return cas === 'refus' ? new Response(JSON.stringify({ error: 'Plafond atteint' }), { status: 429 }) : new Response('Proposition prête');
  });
  vi.stubGlobal('fetch', fetcher);
  const el = document.createElement('div'); document.body.append(el);
  const root = createRoot(el);
  try {
    await act(async () => { root.render(avecSpatial(<NouveauConcept etat={{ etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau concept créatif' }} sous="Studios · Neva" />)); });
    const ta = el.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'Une publicité image');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { (el.querySelector('[data-envoi]') as HTMLButtonElement).click(); });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    if (cas === 'succes') expect(mocks.replace).toHaveBeenCalledWith('/studio/projets/p1');
    else {
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(el.querySelector('[role="alert"]')?.textContent).toContain(cas === 'refus' ? 'Plafond atteint' : 'connexion');
      expect(el.querySelector('a[href="/studio/projets/p1"]')?.textContent, 'aucun chemin vers le concept créé').toContain('Ouvrir le concept créé');
      expect((el.querySelector('[data-envoi]') as HTMLButtonElement).disabled).toBe(true);
      await act(async () => { (el.querySelector('[data-envoi]') as HTMLButtonElement).click(); });
      expect(mocks.start).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  } finally { await act(async () => root.unmount()); el.remove(); }
});
