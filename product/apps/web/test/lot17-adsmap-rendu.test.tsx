// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { CLE_ITERATION_EN_COURS, FILIATION_NON_ENREGISTREE } from '@tiktrends/core';

/**
 * Lot 17 · trois ruptures de reprise et d'itération Adsmap, gardées par ce
 * qu'on VOIT (mesures au navigateur · MATRICE-lot17).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = vi.hoisted(() => ({ track: vi.fn(), detail: vi.fn(), candidats: vi.fn() }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackGeneratedAdAction: actions.track }));
vi.mock('../app/actions/creatives', () => ({ rateCreativeAction: vi.fn() }));
vi.mock('../app/actions/adsmap-batch', () => ({
  batchDetailAction: actions.detail, candidatesAction: actions.candidats,
  createBatchAction: vi.fn(), setBatchAdAction: vi.fn(), prepareBatchAction: vi.fn(), launchBatchAction: vi.fn(),
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast() {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const { CreativeActions } = await import('../components/CreativeActions');
const { Lots } = await import('../app/(app)/adsmap/lots/Lots');
const { RepriseIteration, MemoIteration } = await import('../app/(app)/studio/ads/RepriseIteration');
const { PanneauIteration } = await import('../app/(app)/studio/ads/PanneauIteration');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); Object.values(actions).forEach((f) => f.mockReset()); sessionStorage.clear(); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; });
const attendre = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (n: React.ReactNode) => { act(() => { root!.render(n); }); await attendre(); };

// La passerelle réelle compare l'id à une colonne uuid · tout autre format échoue.
const serveur = (id: string) => (UUID.test(id) ? { ok: true as const, adId: 'ada00000-0000-4000-8000-0000000000f9', prelaunch: 'À compléter avant le lancement.' } : { error: 'Le rattachement à la carte n’a pas abouti. Réessaie.' });
const G = 'f1700000-0000-4000-8000-0000000000a2';
const suivre = () => document.querySelector<HTMLButtonElement>('button[aria-label="Suivre dans Adsmap"]');

describe('Studio Image › « Suivre dans Adsmap » · identifiant composite (lot 17)', () => {
  it('carte `génération:url` · suivie, la fiche se lit et s’ouvre à l’écran, focus sur le lien', async () => {
    actions.track.mockImplementation(async (id: string) => serveur(id));
    await monter(<CreativeActions genId={`${G}:data:image/svg+xml;base64,AAA`} trackable />);
    await act(async () => { suivre()!.click(); }); await attendre();
    const statut = document.querySelector('[role=status]');
    expect(statut?.textContent, 'échec · l’id composite part tel quel vers une colonne uuid').toContain('Suivie dans Adsmap');
    const lien = statut!.querySelector('a');
    expect(lien?.getAttribute('href')).toBe('/adsmap?ad=ada00000-0000-4000-8000-0000000000f9&depuis=studio');
    expect(document.activeElement, 'le focus tombe sur <body>').toBe(lien);
  });

  it('échec · le message se lit À L’ÉCRAN (pas seulement en infobulle) et le focus revient au bouton', async () => {
    actions.track.mockResolvedValue({ error: 'Créa introuvable dans cette marque.' });
    await monter(<CreativeActions genId={G} trackable />);
    await act(async () => { suivre()!.focus(); suivre()!.click(); }); await attendre();
    expect(document.querySelector('[role=alert]')?.textContent).toBe('Créa introuvable dans cette marque.');
    expect(document.activeElement).toBe(suivre());
  });

  it('image fraîche sans génération connue (`new-…`) · pas de bouton qui échouerait', async () => {
    await monter(<CreativeActions genId="new-0-https://exemple.test/a.png" trackable />);
    expect(suivre()).toBeNull();
    expect(actions.track).not.toHaveBeenCalled();
  });
});

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

describe('Brief d’itération · reprise après un changement d’onglet, filiation dite (lot 17)', () => {
  const memo = { brandId: 'b1', adId: 'ada00000-0000-4000-8000-000000000002', titre: 'v2 · Concept 2' };

  it('le panneau retient le brief ouvert · revenu sans `?iter`, la reprise rétablit le brief', async () => {
    await monter(<MemoIteration {...memo} />);
    expect(JSON.parse(sessionStorage.getItem(CLE_ITERATION_EN_COURS) ?? 'null')).toEqual(memo);
    await monter(<main><h1>Pubs IA</h1><RepriseIteration brandId="b1" /></main>);
    const lien = [...document.querySelectorAll('a')].find((a) => /Reprendre le brief/.test(a.textContent ?? ''));
    expect(lien?.getAttribute('href'), 'aucune reprise · le brief et la saisie restent invisibles').toBe('/studio/ads?iter=ada00000-0000-4000-8000-000000000002');
    // Ignorer · la proposition disparaît, la mémoire aussi, le focus va au titre.
    await act(async () => { [...document.querySelectorAll('button')].find((b) => b.textContent === 'Ignorer')!.click(); });
    expect(document.querySelector('[role=status]')).toBeNull();
    expect(sessionStorage.getItem(CLE_ITERATION_EN_COURS)).toBeNull();
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('une autre marque · aucune reprise proposée', async () => {
    sessionStorage.setItem(CLE_ITERATION_EN_COURS, JSON.stringify(memo));
    await monter(<RepriseIteration brandId="b2" />);
    expect(document.querySelector('[role=status]')).toBeNull();
  });

  it('le brief dit que la pub créée n’est pas rattachée au test source', () => {
    const it0 = {
      etat: 'ok' as const, adId: memo.adId, eligible: true as const,
      provenance: { titre: 'v2 · Concept 2', verdict: 'Gagnante', chiffres: [], variableTestee: null },
      apprentissages: [{ texte: 'La preuve sociale retient', confiance: 4 }],
      champs: { angle: { valeur: 'Preuve sociale' }, audience: null, hypothese: { valeur: 'h' }, variableSuivante: { valeur: 'accroche' } },
      prefill: { angle: 'Preuve sociale', personaId: null },
    } as unknown as Parameters<typeof PanneauIteration>[0]['it'];
    const html = renderToStaticMarkup(<PanneauIteration it={it0} marque="Neva" brandId="b1" />);
    expect(html, 'la filiation absente n’est pas dite').toContain(FILIATION_NON_ENREGISTREE.replace(/’/g, '’'));
  });
});
