// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_VERDICT_CONFIG } from '@tiktrends/core';

/**
 * Recette #106 · sous-pages Adsmap (Lots, Protocole, Tri, Import) montées pour
 * de vrai (jsdom, actions simulées) · on lit le DOM, le focus et l'état du
 * formulaire, pas la présence d'un appel.
 */
const LONG = 'Concept au titre très long · routine du soir en trois gestes testée vingt-huit jours sur peaux sensibles';
vi.mock('../app/actions/adsmap-batch', () => ({
  batchDetailAction: async () => ({ detail: {
    id: 'l1', number: 7, goal: 'Tester l’ouverture', status: 'planned', launchedAt: null,
    ads: [{ id: 'a1', concept: LONG, variantCode: 'v1', status: 'draft', format: 'video', testedVariable: null, hypothesis: null, blocking: null, generatedName: null, adsetName: 'AS1', prelaunch: null }],
    brief: { campaignName: 'NEVA_7', structure: 'abo', dailyBudgetPerAd: 10, durationDays: 7, audienceRule: 'Large', totalBudget: 70, conclusiveness: 'ok' },
    protocolSummary: null,
  } }),
  candidatesAction: async () => ({ ads: [] }),
  createBatchAction: async () => ({}), setBatchAdAction: async () => ({}),
  prepareBatchAction: async () => ({}), launchBatchAction: async () => ({}),
}));
let suggestion: unknown = null;
vi.mock('../app/actions/adsmap-protocol', () => ({
  saveSettingsAction: async () => ({}),
  suggestSettingsAction: async () => ({ suggestion }),
}));
vi.mock('../app/actions/adsmap-curation', () => ({
  curationViewAction: async () => ({ view: { nodes: [], counts: { persona: 0, desire: 0, angle: 0, concept: 0 }, matched: { persona: 0, desire: 0, angle: 0, concept: 0 }, q: '', limit: 20 } }),
  validateNodeAction: async () => ({}), rejectNodeAction: async () => ({}), validateManyAction: async () => ({}),
  mergeCandidatesAction: async () => ({ personas: [{ id: 'p1', name: 'Femme 30-45', status: 'validated', desires: 2 }, { id: 'p2', name: 'Maman pressée', status: 'proposed', desires: 1 }] }),
  mergePlanAction: async () => ({}), mergePersonasAction: async () => ({}),
}));
vi.mock('../app/actions/adsmap-import', () => ({ previewImportAction: async () => ({}), applyImportAction: async () => ({}) }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { Lots } from '../app/(app)/adsmap/lots/Lots';
import { ProtocolForm } from '../app/(app)/adsmap/protocole/ProtocolForm';
import { Curation } from '../app/(app)/adsmap/tri/Curation';
import { ImportPanel } from '../app/(app)/adsmap/import/ImportPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; });
const pause = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const monter = async (n: React.ReactNode) => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(n); }); await pause(); return el; };
const bouton = (h: HTMLElement, t: string) => [...h.querySelectorAll('button')].find((b) => (b.textContent || '').trim().startsWith(t)) as HTMLButtonElement;

describe('Lots · lancer, noms longs, lien vers la variante', () => {
  it('ad non prête · « Marquer comme lancé » inactif, la raison est À L’ÉCRAN', async () => {
    const h = await monter(<Lots batches={[{ id: 'l1', number: 7, status: 'planned', goal: 'Tester l’ouverture', launchedAt: null, ads: 1 }]} brandName="Neva" />);
    const b = bouton(h, 'Marquer comme lancé');
    expect(b.disabled, 'lançable avant « Préparer »').toBe(true);
    const raison = document.getElementById(b.getAttribute('aria-describedby') ?? 'x');
    expect(raison?.textContent, 'la raison n’est dite qu’au survol').toContain('pas encore prête');
  });
  it('concept long · coupé mais complet au survol ; la ligne mène à la fiche de l’ad', async () => {
    const h = await monter(<Lots batches={[{ id: 'l1', number: 7, status: 'planned', goal: null, launchedAt: null, ads: 1 }]} brandName="Neva" />);
    const c = [...h.querySelectorAll('span')].find((s) => s.textContent === LONG) as HTMLElement;
    expect(c.getAttribute('title'), 'concept long sans nom complet').toBe(LONG);
    expect([...h.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/adsmap?ad=a1'), 'aucun lien vers la fiche de la variante').toBe(true);
  });
});

describe('Protocole · « Proposer des seuils » ne touche qu’aux seuils', () => {
  const initial = {
    protocol: { structure: 'abo_single_adset' as const, dailyBudgetPerAd: 12, durationDays: 10, audienceRule: 'Large FR 25-45', campaignNamePattern: 'NEVA_{lot}', budgetVarianceTolerance: 0.1 },
    verdict: { ...DEFAULT_VERDICT_CONFIG, targetCpa: 22 }, namingPattern: 'x', isDefault: false,
  };
  it('lecture seule · pas de bouton pour proposer ce qu’on ne peut pas enregistrer', async () => {
    const h = await monter(<ProtocolForm initial={initial} canEdit={false} />);
    expect(bouton(h, 'Proposer des seuils'), 'bouton visible en lecture seule').toBeUndefined();
  });
  it('sans donnée réelle · le nom de campagne et le CPA saisis survivent', async () => {
    suggestion = { fromRealData: false, notes: ['Aucune donnée'], protocol: { ...initial.protocol, campaignNamePattern: '{brand}_{date}', dailyBudgetPerAd: 20 }, verdict: DEFAULT_VERDICT_CONFIG };
    const h = await monter(<ProtocolForm initial={initial} canEdit />);
    await act(async () => { bouton(h, 'Proposer des seuils').click(); });
    await pause();
    const valeurs = [...h.querySelectorAll('input')].map((i) => i.value);
    expect(valeurs, 'le nom de campagne saisi est écrasé').toContain('NEVA_{lot}');
    expect(valeurs, 'le CPA saisi est écrasé').toContain('22');
  });
});

describe('Tri · Fusion · état annoncé, champs nommés, Échap', () => {
  it('aria-expanded, libellés des deux listes, Échap referme et rend le focus', async () => {
    const h = await monter(<Curation />);
    const ouvrir = bouton(h, 'Fusionner deux personas');
    expect(ouvrir.getAttribute('aria-expanded'), 'ouverture non annoncée').toBe('false');
    await act(async () => { ouvrir.click(); });
    await pause();
    const selects = [...h.querySelectorAll('select')];
    expect(selects.map((s) => s.getAttribute('aria-label')), 'listes sans nom accessible').toEqual(['Persona qui disparaît (archivé)', 'Persona qui reçoit ses désirs']);
    selects[0]!.focus();
    await act(async () => { selects[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(h.querySelector('select'), 'Échap ne referme pas').toBeNull();
    expect(document.activeElement?.textContent, 'le focus n’est pas rendu au bouton').toBe('Fusionner deux personas');
  });
});

describe('Import · fichier au clavier, copie fidèle', () => {
  it('le champ fichier est dans l’ordre de tabulation (pas display:none)', async () => {
    const h = await monter(<ImportPanel brandName="Neva" />);
    const f = h.querySelector('input[type=file]') as HTMLInputElement;
    expect(f.style.display, 'champ fichier inatteignable au clavier').not.toBe('none');
    f.focus();
    expect(document.activeElement, 'le champ fichier ne prend pas le focus').toBe(f);
  });
});

describe('Copie et liens rendus après une action (source · l’état exige un fichier ou une trouvaille)', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const src = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');
  it('Import · plus de « tout arrive proposé » · verdicts repris, non comparables · sortie vers le Tri', () => {
    const s = src('app/(app)/adsmap/import/ImportPanel.tsx');
    expect(s, 'la copie contredit l’écriture (verdicts validés)').not.toContain('Tout arrive « proposé »');
    expect(s).toContain('marqués NON comparables');
    expect(s).toContain('href="/adsmap/tri"');
  });
  it('Radar · le concept posé ouvre SA fiche, plus /adsmap nu', () => {
    expect(src('app/(app)/adsmap/radar/Radar.tsx')).toContain('href={posee ? lienFicheAdsmap(posee) : \'/adsmap\'}');
  });
});
