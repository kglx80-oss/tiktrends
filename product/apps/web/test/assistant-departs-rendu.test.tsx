// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
const api = vi.hoisted(() => ({ lister: vi.fn(), lire: vi.fn() }));
vi.mock('../app/actions/studios/departs-assistant', () => ({ listerDepartsAssistant: api.lister, lireDepartAssistant: api.lire }));
import { DepartDepuisSource } from '../components/studios/projet/DepartDepuisSource';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = ''; });

it('ouvre une liste sans sélection ni création, puis remet seulement le départ relu', async () => {
  api.lister.mockResolvedValue({ ok: true, choix: [{ id: 's1', titre: 'Annonce', detail: 'Observation', apercu: null }] });
  const depart = { origine: 'veille', id: 's1', titre: 'Titre relu', intention: '', sources: [{ type: 'sauvegarde', id: 's1' }], testId: null };
  api.lire.mockResolvedValue({ ok: true, depart });
  const onChoisir = vi.fn(); const onFermer = vi.fn();
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  await act(async () => { root.render(<DepartDepuisSource origine="veille" onChoisir={onChoisir} onFermer={onFermer} />); });
  expect(api.lire).not.toHaveBeenCalled(); expect(onChoisir).not.toHaveBeenCalled();
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Fermer le panneau');
  await act(async () => { (el.querySelector('[data-depart-id="s1"]') as HTMLButtonElement).click(); });
  expect(api.lire).toHaveBeenCalledWith('veille', 's1'); expect(onChoisir).toHaveBeenCalledWith(depart);
  await act(async () => root.unmount());
});

it('un refus de lecture conserve le panneau et ne transmet aucun contexte', async () => {
  api.lister.mockResolvedValue({ ok: true, choix: [{ id: 's1', titre: 'Test', detail: '', apercu: null }] });
  api.lire.mockResolvedValue({ ok: false, message: 'Verdict changé' });
  const onChoisir = vi.fn(); const onFermer = vi.fn();
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  await act(async () => { root.render(<DepartDepuisSource origine="iteration" onChoisir={onChoisir} onFermer={onFermer} />); });
  await act(async () => { (el.querySelector('[data-depart-id="s1"]') as HTMLButtonElement).click(); });
  expect(el.querySelector('[role="alert"]')?.textContent).toBe('Verdict changé'); expect(onChoisir).not.toHaveBeenCalled();
  await act(async () => { el.querySelector('section')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(onFermer).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
