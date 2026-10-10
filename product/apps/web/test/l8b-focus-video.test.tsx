// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L8-B · UX-02 / UX-03 · studio vidéo d'un projet, MONTÉ (jsdom) · on lit où
 * est le focus et ce qui est écrit, après chaque geste.
 *
 * Mesuré avant au navigateur (390 × 720, au clavier) : après « Voir l'impact »,
 * « Enregistrer ce changement » ou « Reculer », le focus tombait sur BODY et
 * l'aperçu ou le message s'affichait hors de la vue ; un conflit disait
 * « recharge-le » sans bouton ; hors ligne, le message disait « Refusé ».
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ appliquer: vi.fn(), refresh: vi.fn() }));
vi.mock('../app/actions/studios/video', () => ({
  appliquerOperationVideo: m.appliquer, planifierStoryboard: vi.fn(), compilerConsignePlan: vi.fn(), retenirConsignePlan: vi.fn(),
  demanderDevisKeyframe: vi.fn(), approuverEtLancerKeyframe: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));

import { disponibiliteVideo, timelineDesPlans, segmentsPlans, prixImage, messageHorsLigneStudio, type ContenuVersion, type PlanStudio } from '@tiktrends/core';
import type { VueVideo as DonneesVideo } from '../lib/studios/video/lecture';
import { VueVideo, type ProprietesVueVideo, type ApercuGeste } from '../components/studios/video/VueVideo';
import { EcranVideo, gesteVideoReessayable } from '../components/studios/video/EcranVideo';

const plan = (shotId: string, o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId, purpose: 'Accroche', subject: 'Léa', action: 'court', framing: 'plan moyen', camera: 'fixe', lighting: 'matin', environment: 'quai',
  referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000, ...o,
});
function contenu(): ContenuVersion {
  const c: ContenuVersion = { brief: null, productRef: null, styleRef: null, characterRefs: {}, shots: { order: ['s1', 's2'], byId: { s1: plan('s1'), s2: plan('s2', { purpose: 'Appel' }) } }, document: null, timeline: null };
  return { ...c, timeline: timelineDesPlans(c, null) };
}
function vue(): DonneesVideo {
  const c = contenu();
  return {
    projet: { id: 'p1', titre: 'Sérum' }, version: { id: 'v1', n: 1 }, contenu: c, briefPresent: true, sansTexte: false,
    format: { largeur: 1080, hauteur: 1920, libelle: 'Vertical · 9:16', depuisBrief: false },
    segments: segmentsPlans(c).map((s) => ({ shotId: s.shotId, rang: s.rang + 1, debutMs: s.debutMs, dureeMs: s.dureeMs, estimee: true })),
    dureeTotaleMs: 6000, keyframes: {}, mediasValides: [], musiques: [],
    disponibilite: disponibiliteVideo({ peutGenerer: true, peutProposer: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, decodeurVideo: false, briefPresent: true }),
    coutTexteUsd: 0.14, prix: prixImage(), jobs: [], clips: {}, prixClip: { credits: 10, usdMicros: 600_000, dureeS: 5 },
  };
}
const rien = () => undefined;
const props = (o: Partial<ProprietesVueVideo> = {}): ProprietesVueVideo => ({
  vue: vue(), apercu: null, storyboard: null, questions: [], enCours: null, retour: null,
  surPrevoir: rien, surConfirmer: rien, surAbandonner: rien, surStoryboard: rien, surRetenirStoryboard: rien, surEcarterStoryboard: rien,
  surCompiler: rien, surRetenirConsigne: rien, surDevis: rien, surLancer: rien, ...o,
});
const APERCU: ApercuGeste = { operation: { type: 'ordre', ordre: ['s2', 's1'] }, libelle: 'Ordre des plans', impact: null, durees: null, signalements: [], refus: null };

let root: Root | null = null; let hote: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); hote?.remove(); root = null; hote = null; m.appliquer.mockReset(); m.refresh.mockReset(); });
function monter(el: React.ReactElement) { hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); act(() => root!.render(el)); }
const rendre = (el: React.ReactElement) => act(() => root!.render(el));
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const actif = () => document.activeElement as HTMLElement | null;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe('UX-02 · le focus suit le geste dans le studio vidéo', () => {
  it('l’aperçu d’impact qui apparaît prend le focus · refermé sans rien, le focus revient au bouton du geste', () => {
    monter(<VueVideo {...props()} />);
    const reculer = q('[data-bouton="descendre-s1"]')!;
    act(() => reculer.focus());
    rendre(<VueVideo {...props({ apercu: APERCU })} />);
    expect(actif()?.getAttribute('data-zone'), 'le focus n’est pas sur l’aperçu qui vient de s’afficher').toBe('apercu-impact');
    rendre(<VueVideo {...props()} />);
    expect(actif(), 'refermé sans rien, le focus n’est pas revenu au geste').toBe(q('[data-bouton="descendre-s1"]'));
  });

  it('Échap sur l’aperçu équivaut à « Ne rien changer »', () => {
    const abandon = vi.fn();
    monter(<VueVideo {...props({ apercu: APERCU, surAbandonner: abandon })} />);
    act(() => { q('[data-zone="apercu-impact"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(abandon).toHaveBeenCalledTimes(1);
    expect(q('[data-bouton="abandonner"]')!.textContent).toBe('Ne rien changer');
  });

  it('un nouveau message de retour prend le focus, et son statut est un MOT', () => {
    monter(<VueVideo {...props({ apercu: APERCU })} />);
    rendre(<VueVideo {...props({ retour: { ok: true, texte: 'Ordre des plans · nouvelle version.' } })} />);
    expect(actif()?.getAttribute('data-retour')).toBe('ok');
    expect(actif()!.textContent).toBe('Fait · Ordre des plans · nouvelle version.');
  });
});

describe('UX-03 · conflit et hors ligne disent un mot et donnent le geste suivant', () => {
  it('conflit de version · « Recharger la version courante » est un bouton qui recharge', () => {
    const recharger = vi.fn();
    monter(<VueVideo {...props({ surRecharger: recharger, retour: { ok: false, code: 'VERSION_CONFLICT', texte: 'Ce projet a changé depuis ton ouverture · recharge-le, puis reporte tes modifications.' } })} />);
    const r = q('[data-retour="refus"]')!;
    expect(r.textContent).toMatch(/^Conflit de version · Ce projet a changé/);
    const b = q('[data-bouton="recharger"]') as HTMLButtonElement;
    expect(b?.textContent).toBe('Recharger la version courante');
    act(() => b.click());
    expect(recharger).toHaveBeenCalledTimes(1);
  });

  it('hors ligne · « Hors ligne » + « Réessayer » seulement quand rejouer ne coûte rien', () => {
    const texte = messageHorsLigneStudio('enregistrement');
    monter(<VueVideo {...props({ surReessayer: rien, retour: { ok: false, code: 'NETWORK', reessayable: true, texte } })} />);
    expect(q('[data-retour="refus"]')!.textContent).toMatch(/^Hors ligne · Connexion perdue · rien n’a été enregistré/);
    expect(q('[data-bouton="reessayer"]')?.textContent).toBe('Réessayer');
    rendre(<VueVideo {...props({ surReessayer: rien, retour: { ok: false, code: 'NETWORK', reessayable: false, texte } })} />);
    expect(q('[data-bouton="reessayer"]'), 'un appel payant ne se rejoue pas par « Réessayer »').toBeNull();
    expect(gesteVideoReessayable('confirmer')).toBe(true);
    expect(gesteVideoReessayable('storyboard')).toBe(false);
    expect(gesteVideoReessayable('compiler:s1')).toBe(false);
    expect(gesteVideoReessayable('lancer:s1')).toBe(false);
  });

  it('EcranVideo · enregistrer hors ligne : message, aperçu GARDÉ, focus sur le message ; « Réessayer » rejoue la même opération', async () => {
    m.appliquer.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ ok: true, impact: { resume: '' }, durees: { phrase: '' } });
    monter(<EcranVideo vue={vue()} />);
    act(() => (q('[data-bouton="descendre-s1"]') as HTMLButtonElement).click());
    expect(actif()?.getAttribute('data-zone')).toBe('apercu-impact');
    await act(async () => (q('[data-bouton="confirmer"]') as HTMLButtonElement).click());
    await flush();
    const r = q('[data-retour="refus"]')!;
    expect(r.textContent).toBe(`Hors ligne · ${messageHorsLigneStudio('enregistrement')}Réessayer`);
    expect(actif(), 'le focus n’est pas sur le message d’échec').toBe(r);
    expect(q('[data-zone="apercu-impact"]'), 'l’aperçu (la décision en cours) a été perdu').not.toBeNull();
    await act(async () => (q('[data-bouton="reessayer"]') as HTMLButtonElement).click());
    await flush();
    expect(m.appliquer).toHaveBeenCalledTimes(2);
    expect(m.appliquer.mock.calls[1]![0]).toEqual(m.appliquer.mock.calls[0]![0]);
    expect(q('[data-retour="ok"]')).not.toBeNull();
  });
});
