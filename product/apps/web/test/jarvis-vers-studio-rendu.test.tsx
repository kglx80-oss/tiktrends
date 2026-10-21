// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ create: vi.fn(), push: vi.fn() }));
vi.mock('../app/actions/jarvis-veille-studio', () => ({ creerStudioDepuisJarvis: m.create }));
vi.mock('../app/actions/studios/sources', () => ({ preparerCreation: async () => ({ ok: true, produits: [{ id: 'prod1', nom: 'Produit Neva' }] }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
import { JarvisVersStudio } from '../components/JarvisVersStudio';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('relit avant création, garde la clé en reprise réseau et bloque le double clic', async () => {
 const el=document.createElement('div'); document.body.append(el); const root=createRoot(el);
 m.create.mockRejectedValueOnce(new Error('network')).mockResolvedValue({ok:true,projet:{id:'p1'}});
 try {
  await act(async()=>root.render(<JarvisVersStudio params={{action:'cloner',ref:'s1'}} brandId="b1" proposition="Garder la composition, adapter le produit." />));
  expect(m.create).not.toHaveBeenCalled();
  await act(async()=> (el.querySelector('button') as HTMLButtonElement).click());
  expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toContain('composition');
  expect(m.create).not.toHaveBeenCalled();
  await act(async()=> { (el.querySelector('button') as HTMLButtonElement).click(); (el.querySelector('button') as HTMLButtonElement).click(); });
  expect(m.create).toHaveBeenCalledTimes(1);
  expect(m.create.mock.calls[0]![0].directionVisuelle).toEqual({composition: "Garder la composition, adapter le produit.", styleIntent: "", formats: ["1:1"]});
  expect(m.push).not.toHaveBeenCalled();
  expect(el.querySelector('[role="alert"]')?.textContent).toContain('Connexion');
  expect((el.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
  await act(async()=> (el.querySelector('button') as HTMLButtonElement).click());
  expect(m.create).toHaveBeenCalledTimes(2);
  expect(m.create.mock.calls[1]![0].cleClic).toBe(m.create.mock.calls[0]![0].cleClic);
  expect(m.push).toHaveBeenCalledWith('/studio/projets/p1');
 } finally { await act(async()=>root.unmount()); el.remove(); }
});
