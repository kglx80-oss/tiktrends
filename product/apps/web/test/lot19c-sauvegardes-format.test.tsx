// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { lireFormatCreatif } from '@tiktrends/core';

/**
 * Lot 19C · le choix « Format » sur CHAQUE carte de Sauvegardes. On monte
 * `SavedBoards` (jsdom) et on lit le DOM · un choix par carte, étiqueté, à la
 * valeur enregistrée lue au noyau, liste filtrée par le média de la carte ; puis
 * on enregistre depuis une carte et on vérifie l'identité ÉCRITE (plateforme,
 * external_id de CETTE carte) et le retour affiché. L'écriture en base, l'espace
 * et le contrôle Veille sont prouvés sur pglite (`lot19c-formats-db`).
 */
const appel = vi.hoisted(() => ({ recu: [] as unknown[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));
vi.mock('../app/actions/inspo', () => ({
  setSavedAdFolder: async () => ({}),
  classerFormatSauvegarde: async (x: { format: string }) => { appel.recu.push(x); return { ok: true, format: x.format, date: '2026-10-05T00:00:00Z' }; },
}));
vi.mock('../components/AdCard', () => ({ AdCard: () => <div data-adcard /> }));

import { SavedBoards, type SavedItem } from '../components/SavedBoards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; appel.recu = []; window.history.replaceState(null, '', '/saved'); });
const monter = async (n: React.ReactNode) => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(n); }); return el;
};

const item = (n: string, mediaType: string, snapshot: Record<string, unknown> = {}): SavedItem => {
  const ad = { id: n, platform: 'meta', status: 'active', daysRunning: 3, mediaType, advertiserName: 'Marque ' + n, ...snapshot } as unknown as SavedItem['ad'];
  return { id: 's-' + n, externalId: n, platform: 'meta', folder: null, ad, format: lireFormatCreatif(ad) };
};
const items = [
  item('img-classee', 'image', { formatCreatif: { id: 'packshot', version: 1 } }),
  item('video-libre', 'video'),
  item('valeur-inconnue', 'image', { formatCreatif: { id: 'nimporte' } }),
];

describe('Sauvegardes · un choix « Format » par carte', () => {
  it('chaque carte porte son choix, étiqueté, à la valeur enregistrée, filtré par média', async () => {
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    const selects = [...h.querySelectorAll('select')];
    expect(selects, 'un choix par carte').toHaveLength(3);
    for (const s of selects) expect(h.querySelector(`label[for="${s.id}"]`)?.textContent).toBe('Format');
    expect(selects.map((s) => s.value)).toEqual(['packshot', 'non_classe', 'non_classe']);
    const video = [...selects[1]!.options].map((o) => o.value);
    expect(video).not.toContain('packshot');
    expect(video).toContain('face_camera');
  });

  it('enregistrer depuis une carte écrit CETTE annonce et le dit', async () => {
    const h = await monter(<SavedBoards items={items} followKeys={[]} />);
    const s = h.querySelectorAll('select')[1]!;
    await act(async () => { s.value = 'deballage'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(appel.recu, 'changer n’écrit rien').toEqual([]);
    const b = [...s.parentElement!.querySelectorAll('button')].find((x) => x.textContent === 'Enregistrer')!;
    await act(async () => { b.click(); });
    expect(appel.recu).toEqual([{ platform: 'meta', externalId: 'video-libre', format: 'deballage' }]);
    expect(s.closest('div[style*="grid"]')!.parentElement!.textContent).toContain('Enregistré · Déballage');
  });

  it('sans droit (raison transmise par le serveur) · désactivé dès la carte, raison dite, rien à enregistrer', async () => {
    const h = await monter(<SavedBoards items={items} followKeys={[]} formatIndisponible="Classement réservé à la Veille · offre Core." />);
    const selects = [...h.querySelectorAll('select')];
    expect(selects.every((s) => s.disabled)).toBe(true);
    expect(selects[0]!.getAttribute('aria-describedby')).toMatch(/-indispo /);
    expect(h.querySelectorAll('[data-format-indisponible]')).toHaveLength(3);
    expect(h.textContent).toContain('Classement réservé à la Veille · offre Core.');
    expect([...h.querySelectorAll('button')].some((b) => b.textContent === 'Enregistrer')).toBe(false);
  });
});
