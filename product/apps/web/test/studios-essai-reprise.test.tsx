// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
const h = vi.hoisted(() => ({ preparer: vi.fn() }));
vi.mock('../app/actions/studios/tests', () => ({ preparerLotEssai: h.preparer }));
import { PreparerEssai } from '../components/studios/variantes/PreparerEssai';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); el?.remove(); vi.resetAllMocks(); });
function monter() {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  act(() => root.render(<PreparerEssai projetId="projet" variantes={['a', 'b', 'c'].map(id => ({ id, libelle: id, versionTitre: 'V1' }))} horsLigne={false} ouvrirRattachement={() => {}} />));
  act(() => {
    el.querySelector<HTMLInputElement>('input[type=radio]')!.click();
    const cases = el.querySelectorAll<HTMLInputElement>('input[type=checkbox]'); cases[0]!.click(); cases[1]!.click();
  });
}
const bouton = () => el.querySelector<HTMLButtonElement>('button')!;
describe('Préparation d’essai · récupération et réponses périmées', () => {
  it('garde les choix après une erreur réseau et permet une nouvelle demande', async () => {
    h.preparer.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce({ ok: false, message: 'Variante à compléter' });
    monter();
    await act(async () => bouton().click());
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Tes choix sont conservés');
    expect(el.querySelectorAll('input[type=checkbox]:checked')).toHaveLength(2);
    expect(bouton().disabled).toBe(false);
    await act(async () => bouton().click());
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Variante à compléter');
    expect(h.preparer).toHaveBeenCalledTimes(2);
  });
  it('ignore une réponse reçue après modification de la sélection', async () => {
    let terminer!: (r: unknown) => void;
    h.preparer.mockImplementation(() => new Promise(r => { terminer = r; }));
    monter();
    act(() => bouton().click());
    act(() => el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[2]!.click());
    await act(async () => terminer({ ok: false, message: 'Ancienne sélection refusée' }));
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(el.querySelectorAll('input[type=checkbox]:checked')).toHaveLength(3);
    expect(bouton().disabled).toBe(false);
  });
});
