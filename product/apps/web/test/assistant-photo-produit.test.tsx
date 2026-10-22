// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { PhotoProduitAssistant } from '../components/studios/projet/PhotoProduitAssistant';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const h = vi.hoisted(() => ({ lire: vi.fn(), epingler: vi.fn(), importer: vi.fn() }));
vi.mock('../app/actions/studios/produit', () => ({ lireProduitProjet: h.lire, epinglerProduit: h.epingler }));
vi.mock('../components/studios/produit/ImportPhotoProduit', () => ({ ImportPhotoProduit: (p: { onReussi: (id: string) => void; peutModifier: boolean }) => <button disabled={!p.peutModifier} onClick={() => { h.importer(); p.onReussi('photo'); }}>Importer explicitement</button> }));
const vue = { projet: { id: 'proj', title: 'Projet', marque: 'Marque' }, version: { id: 'v1', n: 1 }, produits: [{ id: 'p1', nom: 'Produit réel', photos: [{ assetId: 'photo', apercu: '/photo', position: 1 }] }], epingle: null, peutModifier: true };
beforeEach(() => { vi.clearAllMocks(); h.lire.mockResolvedValue({ ok: true, vue }); });
async function monter(projectId: string | null = 'proj') {
 const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const cb = vi.fn();
 await act(async () => root.render(<PhotoProduitAssistant projectId={projectId} productId="p1" onChoisie={cb} />));
 return { host, cb, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const clic = async (e: Element | null) => { await act(async () => (e as HTMLElement).click()); };
it('sans projet, aucun catalogue ni import ; ouvrir un projet ne fait que lire', async () => {
 const sans = await monter(null); expect(h.lire).not.toHaveBeenCalled(); expect(sans.host.textContent).toContain('Enregistrez le brief'); await sans.close();
 const avec = await monter(); expect(h.lire).toHaveBeenCalledWith({ projectId: 'proj' }); expect(h.epingler).not.toHaveBeenCalled(); expect(h.importer).not.toHaveBeenCalled(); await avec.close();
});
it('la lecture seule interdit épinglage et import', async () => {
 h.lire.mockResolvedValue({ ok: true, vue: { ...vue, peutModifier: false } }); const x = await monter();
 const boutons = [...x.host.querySelectorAll('button')].filter((b) => /Épingler|Importer/.test(b.textContent!)); expect(boutons).toHaveLength(2); expect(boutons.every((b) => b.disabled)).toBe(true); await x.close();
});
it('un conflit ne notifie pas une photo épinglée ; relecture rétablit la version', async () => {
 const x = await monter(); h.epingler.mockResolvedValue({ ok: false, message: 'Version modifiée' });
 await clic([...x.host.querySelectorAll('button')].find((b) => b.textContent?.includes('Épingler'))!);
 expect(h.epingler).toHaveBeenCalledWith(expect.objectContaining({ baseVersionId: 'v1', productId: 'p1', photoId: 'photo' })); expect(x.cb).not.toHaveBeenCalled(); expect(x.host.textContent).toContain('Version modifiée');
 h.lire.mockResolvedValue({ ok: true, vue: { ...vue, version: { id: 'v2', n: 2 }, epingle: { productId: 'p1', photo: { assetId: 'photo' } } } });
 await clic(x.host.querySelector('button')); expect(x.cb).toHaveBeenCalledWith(expect.objectContaining({ version: { id: 'v2', n: 2 }, photo: expect.objectContaining({ assetId: 'photo' }) })); await x.close();
});
it('après import explicite, relit la version réelle avant de notifier', async () => {
 const x = await monter(); h.lire.mockResolvedValue({ ok: true, vue: { ...vue, version: { id: 'v3', n: 3 }, epingle: { productId: 'p1', photo: { assetId: 'photo' } } } });
 await clic([...x.host.querySelectorAll('button')].find((b) => b.textContent?.includes('Importer'))!);
 expect(h.importer).toHaveBeenCalledTimes(1); expect(h.epingler).not.toHaveBeenCalled(); expect(x.cb).toHaveBeenCalledWith(expect.objectContaining({ version: { id: 'v3', n: 3 } })); await x.close();
});
