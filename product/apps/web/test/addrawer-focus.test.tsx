// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { AdDetail } from '../app/actions/adsmap-verdict';

/**
 * I1 · le panneau d'un test, monté pour de vrai (jsdom, actions serveur simulées).
 * On lit `document.activeElement` et le texte rendu · focus à l'ouverture, focus
 * rendu à la fermeture, et ce que chaque section dit selon l'état RÉEL du test
 * (recette I1 #1 · un test à lancer n'est ni invité à « Mesurer maintenant », ni
 * présenté avec un arbitrage vide et une règle gagnante/perdante).
 */
let reponse: { detail?: AdDetail; error?: string } = { error: 'Chargement impossible · réessaie dans un instant.' };
vi.mock('../app/actions/adsmap-verdict', () => ({
  adDetailAction: async () => reponse,
  validateVerdictAction: async () => ({}),
  createIterationAction: async () => ({}),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { AdDrawer } from '../app/(app)/adsmap/AdDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let desc: PropertyDescriptor | undefined;
beforeAll(() => {
  desc = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.parentNode as Element | null; } });
});
afterAll(() => { if (desc) Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', desc); });

const detail = (o: Partial<AdDetail> = {}): AdDetail => ({
  id: 'a', concept: 'Concept 1', conceptId: 'c', angle: 'Angle 1', desire: null, persona: null, personaId: null, variantCode: 'v1',
  status: 'draft', adType: 'ideation', format: 'static', hypothesis: 'Une preuve chiffrée fait cliquer.', testedVariable: null, variableValue: null,
  launchedAt: null, batchNumber: null, protocolSummary: null, computed: null, validated: null, verdictStatus: null, comparable: true,
  failedStage: null, killFlag: null, reason: null, computedAt: null,
  metrics: { spend: null, impressions: null, purchases: null, cpa: null, cpaHi: null, hookRate: null, holdRate: null, ctr: null },
  learnings: [], parent: null, children: [], sourceVeille: null, ...o,
});

// Nettoyage quelle que soit l'issue du test · un panneau resté monté après un
// échec contaminerait les tests suivants (deux dialogues dans le document).
const montes: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (montes.length) await montes.pop()!();
  vi.useRealTimers();
});

async function ouvrir(peutPartager = true) {
  vi.useFakeTimers();
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const onClose = vi.fn();
  const racine = createRoot(hote);
  await act(async () => {
    racine.render(<AdDrawer adId="3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f" onClose={onClose} onChanged={() => {}} peutPartager={peutPartager} retour={{ href: '/studio/ads', libelle: 'Retour au Studio' }} />);
  });
  await act(async () => { vi.advanceTimersByTime(50); });
  const dialogue = document.querySelector('[role="dialog"]') as HTMLElement;
  let ferme = false;
  const fermer = async () => { if (ferme) return; ferme = true; await act(async () => { racine.unmount(); }); hote.remove(); };
  montes.push(fermer);
  return { dialogue, onClose, fermer };
}

describe('AdDrawer · focus', () => {
  it('à l’ouverture, le focus est DANS le dialogue · Échap ferme une seule fois', async () => {
    const { dialogue, onClose, fermer } = await ouvrir();
    expect(dialogue, 'le panneau n’est pas monté').not.toBeNull();
    expect(dialogue.contains(document.activeElement), 'le focus reste derrière la modale à l’ouverture').toBe(true);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose, 'Échap ne ferme pas, ou ferme deux fois').toHaveBeenCalledTimes(1);
    await fermer();
  });

  it('à la fermeture, le focus revient au déclencheur', async () => {
    const declencheur = document.createElement('button');
    document.body.appendChild(declencheur);
    declencheur.focus();
    const { fermer } = await ouvrir();
    await fermer();
    expect(document.activeElement, 'le focus n’est pas rendu au déclencheur').toBe(declencheur);
    declencheur.remove();
  });

  it('erreur de chargement · le message et le retour Studio restent, le focus aussi', async () => {
    reponse = { error: 'Chargement impossible · réessaie dans un instant.' };
    const { dialogue, fermer } = await ouvrir();
    expect(dialogue.textContent).toContain('Chargement impossible');
    expect(dialogue.querySelector('a[href="/studio/ads"]'), 'l’erreur coupe le chemin de retour').not.toBeNull();
    expect(dialogue.contains(document.activeElement)).toBe(true);
    await fermer();
  });
});

describe('AdDrawer · ce que dit le panneau selon l’état RÉEL du test', () => {
  it('à lancer · pas de « Mesurer maintenant », pas d’arbitrage vide, pas de règle gagnante/perdante, prochaine étape existante', async () => {
    reponse = { detail: detail() };
    const { dialogue, fermer } = await ouvrir();
    const t = dialogue.textContent ?? '';
    expect(t).toContain('Pas encore lancée');
    expect(t, 'un test jamais diffusé est invité à « Mesurer maintenant »').not.toContain('Mesurer maintenant');
    expect(t, 'la section d’arbitrage vide s’affiche').not.toContain('Arbitrer ce test');
    expect([...dialogue.querySelectorAll('h3')].map((h) => h.textContent), 'une section vide s’affiche pour un test à lancer').toEqual(['Ce que le test a donné', 'La suite']);
    expect(t, 'la règle gagnante/perdante s’affiche sans verdict').not.toContain('On n’itère');
    expect(t).toContain('rien à décider tant que le test n’a pas tourné');
    expect(dialogue.querySelector('a[href="/adsmap/lots"]')?.textContent, 'la prochaine étape existante n’est pas offerte').toContain('Préparer un test');
    expect(t, 'l’hypothèse du test a disparu').toContain('Une preuve chiffrée');
    await fermer();
  });

  it('à lancer, sans droit de préparer · pas de lien vers les lots', async () => {
    reponse = { detail: detail() };
    const { dialogue, fermer } = await ouvrir(false);
    expect(dialogue.querySelector('a[href="/adsmap/lots"]'), 'un lien vers un écran réservé est offert').toBeNull();
    expect(dialogue.textContent).toContain('administrateur');
    await fermer();
  });

  it('lancée sans verdict · en mesure, sans arbitrage vide', async () => {
    reponse = { detail: detail({ status: 'live', launchedAt: '2026-09-20T00:00:00Z' }) };
    const { dialogue, fermer } = await ouvrir();
    const t = dialogue.textContent ?? '';
    expect(t).toContain('Lancée · pas encore de verdict calculé');
    expect([...dialogue.querySelectorAll('h3')].map((h) => h.textContent), 'une section vide s’affiche pour un test en mesure').toEqual(['Ce que le test a donné', 'La suite']);
    expect(t).not.toContain('On n’itère');
    await fermer();
  });

  it('verdict calculé · panneau complet inchangé (arbitrage + règle d’itération)', async () => {
    reponse = { detail: detail({ status: 'live', launchedAt: '2026-09-20T00:00:00Z', computed: 'loser', verdictStatus: 'computed' }) };
    const { dialogue, fermer } = await ouvrir();
    const t = dialogue.textContent ?? '';
    expect(t).toContain('Arbitrer ce test');
    expect(t).toContain('On n’itère');
    expect(t).not.toContain('Pas encore lancée');
    // Une perdante mène au Studio, l'angle du test en amorce (sortie de la boucle intacte).
    expect(dialogue.querySelector('a[href="/studio/ads?angle=Angle%201"]'), 'la perdante ne mène plus au Studio').not.toBeNull();
    await fermer();
  });
});

describe('AdDrawer · I2 · une gagnante arbitrée avec apprentissage ouvre le brief d’itération au Studio', () => {
  const gagnante = { status: 'live', launchedAt: '2026-09-20T00:00:00Z', computed: 'winner' as const, validated: 'winner' as const, verdictStatus: 'validated' as const, comparable: true };
  it('gagnante arbitrée + apprentissage → « Préparer l’itération dans le Studio »', async () => {
    reponse = { detail: detail({ ...gagnante, learnings: [{ id: 'l1', statement: 'Le chiffré tient mieux.', confidence: 4, status: 'validated', scope: 'ad' }] }) };
    const { dialogue, fermer } = await ouvrir();
    expect(dialogue.querySelector('a[href="/studio/ads?iter=a"]')?.textContent, 'le lien vers le brief d’itération manque').toContain('Préparer l’itération dans le Studio');
    await fermer();
  });
  it('gagnante SANS apprentissage · pas de lien (aucune fausse itération)', async () => {
    reponse = { detail: detail({ ...gagnante, learnings: [] }) };
    const { dialogue, fermer } = await ouvrir();
    expect(dialogue.querySelector('a[href^="/studio/ads?iter="]'), 'une gagnante sans apprentissage ouvre un brief').toBeNull();
    await fermer();
  });
});

