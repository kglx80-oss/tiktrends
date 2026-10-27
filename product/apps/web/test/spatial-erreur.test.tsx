// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap/lots' }));
import ErreurSpatial from '../app/(spatial)/sp/error';

describe('Spatial · filet d’erreur', () => {
  it('dit l’échec, réessaie sur demande, et ouvre le MÊME écran dans l’ancienne interface', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const reset = vi.fn();
    const hote = document.createElement('div'); document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(<ErreurSpatial error={Object.assign(new Error('x'), { digest: 'd1' })} reset={reset} />); });
    expect(hote.querySelector('[role="alert"] h2')?.textContent).toBe('Cet écran n’a pas pu s’afficher');
    expect(hote.textContent).toContain('Référence : d1.');
    expect(hote.querySelector('a.btn')?.getAttribute('href')).toBe('/adsmap/lots?ui=v5');
    await act(async () => { (hote.querySelector('button.btn.pri') as HTMLButtonElement).click(); });
    expect(reset).toHaveBeenCalledTimes(1);
    await act(async () => racine.unmount());
  });
});
