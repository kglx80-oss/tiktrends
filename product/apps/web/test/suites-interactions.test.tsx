// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MODE_LABEL, MODE_HINT, VARIABLE_LABEL, iterationPlan } from '@tiktrends/core';
import type { IterationRow } from '../app/actions/adsmap-iterate';

/**
 * Recette #106 · Suites monté pour de vrai (jsdom, actions simulées) · on lit
 * l'URL, le focus et ce qui reste à l'écran après création.
 */
const lignes = (): IterationRow[] => iterationPlan([
  { adId: 'p1', label: 'Concept 1 · v1', verdict: 'winner', comparable: true, failedStage: null, spend: 100 },
  { adId: 'p2', label: 'Concept 2 · v2', verdict: 'loser', comparable: true, failedStage: 'click', spend: 80 },
]).map((t) => ({ ...t, modeLabel: MODE_LABEL[t.mode], modeHint: MODE_HINT[t.mode], variableLabel: VARIABLE_LABEL[t.changedVariable], stageLabel: null, freezeLabels: t.freeze.map((v) => VARIABLE_LABEL[v]), conceptTitle: t.label, parentVerdict: t.adId === 'p1' ? 'winner' : 'loser', parentComparable: true, parentEtapeLachee: t.adId === 'p2' ? 'le clic' : null }));
let plan = lignes();
vi.mock('../app/actions/adsmap-iterate', () => ({
  iterationPlanAction: async () => ({ view: { rows: plan, examined: 2, summary: 'résumé' } }),
  createIterationAction: async (i: { parentAdId: string }) => {
    plan = plan.filter((r) => r.adId !== i.parentAdId);
    // Ce que fait le routeur Next après une action qui revalide · l'URL est
    // réécrite sans nos paramètres, APRÈS la relecture du plan (mesuré).
    setTimeout(() => routeur?.reecrire(), 5);
    return { adId: 'enfant-9', asIteration: true };
  },
}));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: async () => ({ error: 'Plafond de dépense atteint.' }) }));
vi.mock('../components/DraftCard', () => ({ DraftCard: () => null }));
import { installerModeleRouteurNext } from './modele-routeur-next';
let routeur: ReturnType<typeof installerModeleRouteurNext> | null = null;
import { Suites } from '../app/(app)/adsmap/suites/Suites';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null; let el: HTMLDivElement | null = null;
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; plan = lignes(); window.history.replaceState(null, '', '/adsmap/suites'); });
const pause = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const monter = async () => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); await act(async () => { root!.render(<Suites />); }); await pause(); return el; };
const bouton = (h: HTMLElement, t: string) => [...h.querySelectorAll('button')].find((b) => (b.textContent || '').trim().startsWith(t)) as HTMLButtonElement;
const taper = async (t: HTMLTextAreaElement, v: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(t, v);
  t.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('Suites · filtre, formulaire, création', () => {
  it('le filtre de mode vit dans l’URL, sans empiler · relu au montage', async () => {
    const h = await monter();
    const avant = window.history.length;
    await act(async () => { bouton(h, MODE_LABEL.better).click(); });
    expect(window.location.search, 'le mode n’est pas dans l’URL').toBe('?mode=better');
    expect(window.history.length).toBe(avant);
    act(() => { root!.unmount(); }); el!.remove();
    const h2 = await monter();
    expect(bouton(h2, MODE_LABEL.better).getAttribute('aria-pressed'), 'le Retour perd le filtre').toBe('true');
  });

  it('changer de filtre ne change pas la carte ouverte ni n’efface l’hypothèse', async () => {
    const h = await monter();
    const cartes = () => [...h.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Créer la suite');
    const derniere = cartes()[cartes().length - 1]!;
    await act(async () => { derniere.click(); });
    const champ = h.querySelector('textarea') as HTMLTextAreaElement;
    await taper(champ, 'En changeant le CTA, j’attends plus de clics.');
    await act(async () => { bouton(h, MODE_LABEL.better).click(); });
    await act(async () => { bouton(h, 'Tous').click(); });
    expect((h.querySelector('textarea') as HTMLTextAreaElement | null)?.value, 'l’hypothèse saisie est perdue').toBe('En changeant le CTA, j’attends plus de clics.');
  });

  it('ouvert, le focus va au champ ; Échap referme et rend le focus au bouton', async () => {
    const h = await monter();
    const b = bouton(h, 'Créer la suite');
    await act(async () => { b.click(); });
    const champ = h.querySelector('textarea') as HTMLTextAreaElement;
    expect(document.activeElement, 'le champ n’a pas le focus').toBe(champ);
    await act(async () => { champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(h.querySelector('textarea'), 'Échap ne referme pas').toBeNull();
    expect(document.activeElement?.textContent?.trim(), 'le focus n’est pas rendu').toBe('Créer la suite');
  });

  it('après création, le parent quitte le plan · la confirmation et le lien vers SA fiche restent', async () => {
    const h = await monter();
    const libelle = h.querySelector('strong')!.textContent!;
    await act(async () => { bouton(h, 'Créer la suite').click(); });
    await taper(h.querySelector('textarea') as HTMLTextAreaElement, 'En changeant le visuel, j’attends un meilleur hook.');
    await act(async () => { bouton(h, 'Créer').click(); });
    await pause();
    const statut = h.querySelector('[role=status]');
    expect(statut?.textContent, 'la confirmation disparaît avec la carte').toContain(libelle);
    expect([...h.querySelectorAll('strong')].map((x) => x.textContent), 'le parent créé reste dans le plan (mock)').not.toContain(libelle);
    expect(statut!.querySelector('a')!.getAttribute('href'), 'le lien ne mène pas à la suite créée').toBe('/adsmap?ad=enfant-9');
  });

  it('après création (URL réécrite par le routeur Next), le filtre reste dans l’URL', async () => {
    window.history.replaceState({ __NA: true }, '', '/adsmap/suites');
    routeur = installerModeleRouteurNext();
    const h = await monter();
    await act(async () => { bouton(h, MODE_LABEL.better).click(); });
    await act(async () => { bouton(h, 'Créer la suite').click(); });
    await taper(h.querySelector('textarea') as HTMLTextAreaElement, 'En changeant le CTA, j’attends plus de clics.');
    await act(async () => { bouton(h, 'Créer').click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    routeur.desinstaller(); routeur = null;
    expect(window.location.search, 'le routeur ignore le filtre · sa réécriture l’efface (Retour → « Tous »)').toBe('?mode=better');
  });

  it('l’erreur de Jarvis s’affiche carte fermée', async () => {
    const h = await monter();
    await act(async () => { bouton(h, 'Demander le concept à Jarvis').click(); });
    await pause();
    expect(h.querySelector('[role=alert]')?.textContent, 'l’erreur reste invisible').toContain('Plafond');
  });
});
