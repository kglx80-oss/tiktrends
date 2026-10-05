// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 19C · le choix « Format » d'une carte · on le MONTE (jsdom) et on lit le
 * DOM · étiquette, 44 px, retour d'état honnête (« Enregistré » seulement sur
 * un oui du serveur ; un refus remet l'ancien choix et dit l'échec), focus
 * rendu au choix suivant quand l'annonce quitte la vue.
 */
const appel = vi.hoisted(() => ({ reponse: { ok: true, format: 'packshot', date: '2026-10-05T00:00:00Z' } as unknown, recu: [] as unknown[], refresh: 0 }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => { appel.refresh++; } }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('../app/actions/inspo', () => ({
  classerFormatSauvegarde: async (x: unknown) => { appel.recu.push(x); if (appel.reponse instanceof Error) throw appel.reponse; return appel.reponse; },
}));

import { FormatChoix } from '../app/(app)/saved/FormatChoix';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.recu = []; appel.refresh = 0; });
const monter = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(n); }); return el; };
const choisir = async (s: HTMLSelectElement, v: string) => {
  await act(async () => { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); });
};

describe('FormatChoix', () => {
  it('étiqueté, 44 px, non classé par défaut, liste filtrée par le média', async () => {
    const h = await monter(<FormatChoix platform="meta" externalId="e1" mediaType="image" initial={null} />);
    const s = h.querySelector('select')!;
    const label = h.querySelector('label')!;
    expect(label.textContent).toBe('Format');
    expect(label.htmlFor).toBe(s.id);
    expect(s.style.minHeight).toBe('44px');
    expect(s.value).toBe('non_classe');
    const valeurs = [...s.options].map((o) => o.value);
    expect(valeurs).toContain('packshot');
    expect(valeurs).not.toContain('face_camera');
  });

  it('succès · « Enregistré » annoncé, la définition suit, la page est rafraîchie', async () => {
    appel.reponse = { ok: true, format: 'packshot', date: '2026-10-05T00:00:00Z' };
    const h = await monter(<FormatChoix platform="meta" externalId="e1" mediaType="image" initial={null} />);
    const s = h.querySelector('select')!;
    await choisir(s, 'packshot');
    expect(appel.recu).toEqual([{ platform: 'meta', externalId: 'e1', format: 'packshot' }]);
    expect(h.querySelector('[role=status]')!.textContent).toBe('Enregistré · Packshot');
    expect(h.textContent).toContain('Le produit seul, fond neutre');
    expect(s.value).toBe('packshot');
    expect(appel.refresh).toBe(1);
  });

  it('refus du serveur · l’ancien choix revient et l’échec est dit', async () => {
    appel.reponse = { ok: false, error: 'Annonce introuvable dans ton espace · recharge la page.' };
    const h = await monter(<FormatChoix platform="meta" externalId="e1" mediaType="image" initial="callout" />);
    const s = h.querySelector('select')!;
    await choisir(s, 'packshot');
    expect(s.value, 'le choix refusé ne reste pas affiché').toBe('callout');
    expect(h.querySelector('[role=status]')!.textContent).toBe('Annonce introuvable dans ton espace · recharge la page.');
    expect(h.textContent).not.toContain('Enregistré');
    expect(appel.refresh).toBe(0);
  });

  it('panne réseau · même honnêteté', async () => {
    appel.reponse = new Error('réseau');
    const h = await monter(<FormatChoix platform="meta" externalId="e1" mediaType="image" initial={null} />);
    const s = h.querySelector('select')!;
    await choisir(s, 'packshot');
    expect(s.value).toBe('non_classe');
    expect(h.querySelector('[role=status]')!.textContent).toContain('Échec de l’enregistrement');
  });

  it('l’annonce quitte la vue · le focus passe au choix suivant', async () => {
    appel.reponse = { ok: true, format: 'packshot', date: null };
    const h = await monter(<>
      <FormatChoix platform="meta" externalId="e1" mediaType="image" initial={null} vue="non_classe" />
      <FormatChoix platform="meta" externalId="e2" mediaType="image" initial={null} vue="non_classe" />
    </>);
    const [s1, s2] = [...h.querySelectorAll('select')];
    s1!.focus();
    await choisir(s1!, 'packshot');
    expect(document.activeElement).toBe(s2);
  });
});
