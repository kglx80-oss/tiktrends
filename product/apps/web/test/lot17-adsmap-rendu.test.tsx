// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Lot 17 · trois ruptures de reprise et d'itération Adsmap, gardées par ce
 * qu'on VOIT (mesures au navigateur · MATRICE-lot17).
 */
const actions = vi.hoisted(() => ({ detail: vi.fn(), candidats: vi.fn() }));
vi.mock('../app/actions/adsmap-batch', () => ({
  batchDetailAction: actions.detail, candidatesAction: actions.candidats,
  createBatchAction: vi.fn(), setBatchAdAction: vi.fn(), prepareBatchAction: vi.fn(), launchBatchAction: vi.fn(),
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast() {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const { Lots } = await import('../app/(app)/adsmap/lots/Lots');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); Object.values(actions).forEach((f) => f.mockReset()); sessionStorage.clear(); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });
const attendre = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (n: React.ReactNode) => { act(() => { root!.render(n); }); await attendre(); };

describe('Lots › vivier · ce qui manque se lit à l’écran (lot 17)', () => {
  it('« incomplète » dit QUOI manque, sans survol', async () => {
    actions.detail.mockResolvedValue({ detail: { id: 'b', number: 9002, goal: null, status: 'planned', launchedAt: null, ads: [], brief: { campaignName: 'C', structure: 'ABO', dailyBudgetPerAd: 20, durationDays: 7, audienceRule: 'broad', totalBudget: 0, conclusiveness: 'Au rythme prévu, chaque ad atteint le seuil.' } } });
    actions.candidats.mockResolvedValue({ rows: [
      { id: 'a2', concept: 'Concept 1', variantCode: 'v32', status: 'draft', blocking: 'Il manque l’offre et la page de destination…', manques: ['l’offre', 'la page de destination'] },
    ] });
    await monter(<Lots batches={[{ id: 'b', number: 9002, status: 'planned', goal: null, launchedAt: null, ads: 0 }]} brandName="Neva" />);
    const ligne = [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('v32'));
    expect(ligne?.textContent, 'le détail n’est qu’en infobulle').toContain('manque l’offre et la page de destination');
  });
});
