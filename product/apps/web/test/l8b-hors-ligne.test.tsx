// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L8-B · UX-03 · hors ligne au moment du geste, MONTÉ (jsdom).
 *
 * Mesuré avant au navigateur (Chromium hors ligne, 1280 et 390 × 720) :
 *  · « Préparer une création » · « Créer le projet » restait figé sur
 *    « Création… », sans message, à vie ;
 *  · « IA et Studios » · « Importer en brouillon » faisait tomber l'écran
 *    ENTIER (« Application error »), saisies perdues.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ preparer: vi.fn(), creer: vi.fn(), importer: vi.fn(), creerRelease: vi.fn() }));
vi.mock('../app/actions/studios/sources', () => ({ preparerCreation: m.preparer, proposerHypotheses: vi.fn(), creerProjetDepuisSources: m.creer }));
vi.mock('../app/actions/studios/prompts', () => ({
  importerPackAction: m.importer, validerVersionAction: vi.fn(), evaluerReleaseAction: vi.fn(), retirerReleaseAction: vi.fn(), creerReleaseAction: m.creerRelease,
  publierReleaseAction: vi.fn(), rollbackReleaseAction: vi.fn(), revoquerReleaseAction: vi.fn(), enregistrerBrouillonAction: vi.fn(), approuverBenchmarkAction: vi.fn(),
}));
vi.mock('../lib/studios/benchmark/actions', () => ({ approuverBudgetBenchmarkAction: vi.fn(), joindreFichesBenchmarkAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { annonceObservee, referenceSource, faitsProduit, messageHorsLigneStudio } from '@tiktrends/core';
import { PreparerCreation } from '../components/studios/PreparerCreation';
import { BoutonCommande, FormulaireRelease } from '../app/(app)/admin/ia-studios/Commandes';

const ANNONCE = { id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux.', callToAction: 'Acheter', landingDomain: 'lb.fr' };
const source = referenceSource({ type: 'veille_ad', annonce: annonceObservee(ANNONCE)!, savedAdId: null, portee: { workspaceId: 'ws', brandId: null }, observeLe: new Date('2026-10-01T09:00:00Z'), format: null, retourVeille: 'q=serum' });
const PREP = {
  ok: true, brandId: 'b1', marques: [{ id: 'b1', nom: 'Maison Ondine' }], sources: [source],
  produits: [{ id: 'p1', nom: 'Crème Douce', ...faitsProduit({ id: 'p1', name: 'Crème Douce', description: null, usp: null, price: null, url: null, imageUrl: null, imageUrls: null }), photoDisponible: false }],
  ia: { disponible: false, raison: 'Indisponible ici.', plafondUsd: 0.14, modele: 'x' }, metriques: ['Taux de clic (CTR)'],
};

let root: Root | null = null; let hote: HTMLDivElement | null = null;
afterEach(() => { act(() => root?.unmount()); hote?.remove(); root = null; hote = null; vi.clearAllMocks(); });
function monter(el: React.ReactElement) { hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); act(() => root!.render(el)); }
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const bouton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t)) as HTMLButtonElement;
const actif = () => document.activeElement as HTMLElement | null;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
function saisir(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Préparer une création · hors ligne', () => {
  it('créer hors ligne · message « Hors ligne », bouton rendu, saisie conservée, focus sur le message ; le réessai garde la même clé', async () => {
    m.preparer.mockResolvedValue(PREP);
    m.creer.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ ok: true, projet: { id: 'p_cree' }, versionId: 'v1', deja: false });
    monter(<PreparerCreation annonce={ANNONCE} retour="q=serum#ad-meta-9001" />);
    await act(async () => bouton('Préparer une création').click());
    await flush();
    const radios = [...document.querySelectorAll('[role="radiogroup"][aria-label="Hypothèse retenue"] input')] as HTMLInputElement[];
    act(() => radios[radios.length - 1]!.click());
    act(() => saisir(q('#pc-s-enonce') as HTMLTextAreaElement, 'Une accroche chiffrée augmente le clic'));
    act(() => saisir(q('#pc-s-variable') as HTMLInputElement, 'accroche'));
    await act(async () => bouton('Créer le projet').click());
    await flush();
    const alerte = q('[role="dialog"] [data-erreur="hors-ligne"]')!;
    expect(alerte.textContent).toBe(`Hors ligne · ${messageHorsLigneStudio('creation')}`);
    expect(actif(), 'le focus n’est pas sur le message d’échec').toBe(alerte);
    expect(bouton('Créer le projet pour Maison Ondine'), 'le bouton est resté figé sur « Création… »').toBeTruthy();
    expect(bouton('Créer le projet pour Maison Ondine').disabled).toBe(false);
    expect((q('#pc-s-enonce') as HTMLTextAreaElement).value).toBe('Une accroche chiffrée augmente le clic');
    await act(async () => bouton('Créer le projet').click());
    await flush();
    expect(m.creer.mock.calls[1]![0].cleClic, 'le réessai doit garder la clé de clic (pas de doublon)').toBe(m.creer.mock.calls[0]![0].cleClic);
    expect(q('[role="dialog"] [data-creation="ok"]')).not.toBeNull();
  });

  it('ouvrir hors ligne · plus de « Chargement… » à vie : message et « Réessayer »', async () => {
    m.preparer.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(PREP);
    monter(<PreparerCreation annonce={ANNONCE} retour="q=serum" />);
    await act(async () => bouton('Préparer une création').click());
    await flush();
    expect(q('[role="dialog"] [data-erreur="hors-ligne"]')!.textContent).toContain(messageHorsLigneStudio('chargement'));
    expect(document.body.textContent).not.toContain('Chargement de la source');
    await act(async () => bouton('Réessayer').click());
    await flush();
    expect(q('#pc-marque-choix')).not.toBeNull();
  });
});

describe('IA et Studios · une commande hors ligne ne fait plus tomber l’écran', () => {
  it('« Importer en brouillon » hors ligne · refus lisible sous le bouton, aucune exception', async () => {
    m.importer.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    monter(<BoutonCommande commande="importer" libelle="Importer en brouillon" succes="Importé." />);
    await act(async () => bouton('Importer en brouillon').click());
    await flush();
    expect(q('[role="alert"]')!.textContent).toBe(`Hors ligne · ${messageHorsLigneStudio('commande')}`);
    expect(actif(), 'le focus n’a pas suivi le refus').toBe(q('[role="alert"]'));
    expect(bouton('Importer en brouillon').disabled).toBe(false);
  });
  it('« Créer la release » hors ligne · le motif saisi reste', async () => {
    m.creerRelease.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    monter(<FormulaireRelease />);
    act(() => saisir(q('input') as HTMLInputElement, 'éclairage plus chaud'));
    await act(async () => bouton('Créer la release').click());
    await flush();
    expect(q('[role="alert"]')!.textContent).toContain('Connexion perdue');
    expect((q('input') as HTMLInputElement).value).toBe('éclairage plus chaud');
  });
});
