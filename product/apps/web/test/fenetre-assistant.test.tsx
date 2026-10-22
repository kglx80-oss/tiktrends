// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { FenetreAssistant } from '../components/studios/projet/FenetreAssistant';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.innerHTML = ''; document.body.style.overflow = ''; vi.restoreAllMocks(); });
describe('Fenêtre de création', () => {
  it('se rend côté serveur sans accès document ni portail prématuré', () => {
    expect(renderToString(<FenetreAssistant onFermer={() => {}}>Brief</FenetreAssistant>)).toBe('');
  });
  it('ouvre un dialogue modal, ferme par Échap, puis restaure le focus et le défilement', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value() {} });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, writable: true, value() {} });
    const open = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const fermer = vi.fn();
    await act(async () => root.render(<FenetreAssistant onFermer={fermer}><input aria-label="Intention" /></FenetreAssistant>));
    expect(open).toHaveBeenCalledOnce(); expect(document.body.style.overflow).toBe('hidden');
    const modal = document.querySelector('dialog')!; expect(modal.open).toBe(true);
    const event = new Event('cancel', { cancelable: true });
    await act(async () => { modal.dispatchEvent(event); });
    expect(fermer).toHaveBeenCalledOnce(); expect(event.defaultPrevented).toBe(true);
    await act(async () => root.unmount());
    expect(document.body.style.overflow).toBe(''); expect(document.activeElement).toBe(trigger);
  });
});
