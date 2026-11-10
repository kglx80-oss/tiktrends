// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Parcours image · la COURSE du focus après « Valider et voir le prix ».
 *
 * Défaut (vu en CI, une fois sur deux runs du même commit) · `agir` replaçait
 * le focus par `setTimeout(0)` juste après avoir relu la vue · mais React,
 * hors `act`, rend la vue relue par son ordonnanceur (`setImmediate` sous
 * Node) · quand ce rendu arrive APRÈS le `setTimeout(0)`, le replacement voit
 * encore le bouton pressé (focus « pas perdu », il ne fait rien), puis le rendu
 * retire le bouton · le focus tombe sur `<body>`. Le même ordre peut se
 * produire dans un navigateur chargé.
 *
 * Cette garde rend la course CERTAINE · l'ordonnanceur de React est retardé
 * (`setImmediate` → 20 ms) AVANT que React soit chargé · le rendu de la vue
 * relue arrive donc toujours après le `setTimeout(0)`. Le correctif replace le
 * focus une fois la vue relue RENDUE (effet sur la vue), comme l'atelier Produit.
 */
vi.hoisted(() => {
  const g = globalThis as unknown as { setImmediate: (f: (...a: unknown[]) => void, ...a: unknown[]) => unknown };
  g.setImmediate = (f, ...a) => setTimeout(f, 20, ...a);
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  lire: vi.fn(), compiler: vi.fn(), retenir: vi.fn(), devis: vi.fn(), lancer: vi.fn(), controler: vi.fn(), annuler: vi.fn(), trancher: vi.fn(),
  epingler: vi.fn(), associer: vi.fn(), retirer: vi.fn(), importer: vi.fn(),
  ecrireTextes: vi.fn(), enregistrerTextes: vi.fn(), exporterTextes: vi.fn(), injecterTexte: vi.fn(),
  preparer: vi.fn(), rattacher: vi.fn(), relire: vi.fn(), creerVariante: vi.fn(), iterer: vi.fn(), refresh: vi.fn(),
}));
vi.mock('../app/actions/studios/image', () => ({ lireParcoursImage: m.lire, compilerConsigneImage: m.compiler, retenirConsigneImage: m.retenir, demanderDevisImage: m.devis, approuverEtLancerImage: m.lancer, controlerMediaImage: m.controler }));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: m.annuler }));
vi.mock('../app/actions/studios/produit', () => ({ trancherComposants: m.trancher, epinglerProduit: m.epingler, associerReference: m.associer, retirerReference: m.retirer, importerPhotoProduit: m.importer }));
vi.mock('../app/actions/studios/textes', () => ({ ecrireTextes: m.ecrireTextes, enregistrerTextes: m.enregistrerTextes, exporterTextes: m.exporterTextes, injecterTexte: m.injecterTexte }));
vi.mock('../app/actions/studios/tests', () => ({ preparerLotEssai: m.preparer, rattacherVarianteAuTest: m.rattacher, relireApprentissage: m.relire }));
vi.mock('../app/actions/studios/variantes', () => ({ creerVariante: m.creerVariante, iterer: m.iterer }));
vi.mock('../lib/studios/produit/compression-photo', () => ({ compresserPhoto: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1', useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: unknown }) => <a href={href} {...(r as object)}>{children as never}</a> }));

import { disponibiliteImage } from '@tiktrends/core';
import type { ConsigneVue, VueParcoursImage } from '../lib/studios/image/parcours';
import { ParcoursImage } from '../spatial/vues/projet/ParcoursImage';
import { avecSpatial } from './spatial/fournisseur';

// ── Montage, lecture ──────────────────────────────────────────────────────────
let hote: HTMLDivElement; let racine: Root;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  window.sessionStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true }); });
const monter = (n: ReactNode) => act(() => { racine.render(avecSpatial(n)); });
const q = <T extends HTMLElement = HTMLButtonElement>(s: string) => hote.querySelector<T>(s);
const cliquer = async (b: HTMLElement | null) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { b!.click(); }); };
const actif = () => document.activeElement;
/** Une promesse tenue en main · l'action reste « en cours » tant qu'on ne la résout pas. */
function differe<T>() { let resoudre!: (v: T) => void; let rejeter!: (e: unknown) => void; const p = new Promise<T>((a, b) => { resoudre = a; rejeter = b; }); return { p, resoudre, rejeter }; }

// ── Parcours image ────────────────────────────────────────────────────────────
const TOUT = { peutGenerer: true, peutProposer: true, briefPresent: true, preparationOk: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true };
const CONSIGNE: ConsigneVue = {
  runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene', libelleMode: 'Mise en scène générée',
  generationInstruction: 'Coureur portant les lunettes, piste au lever du jour.', negativeConstraints: [], protectedComponents: ['lunettes'], liaisons: [],
  format: { largeur: 1080, hauteur: 1350 }, compileeLe: '2026-10-08T10:00:00Z',
};
const DEVIS = { id: 'q1', credits: 4, inputHash: 'h', expiresAt: '2026-10-08T11:00:00Z', lignes: [] };
function vueImage(o: Partial<VueParcoursImage> = {}, dispo = TOUT): VueParcoursImage {
  return {
    projet: { id: 'p1' }, version: { id: 'v3', n: 3 },
    modes: [{ mode: 'faithful_composite', libelle: 'Produit fidèle', pret: false }, { mode: 'generative_scene', libelle: 'Mise en scène générée', pret: true }],
    format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
    disponibilite: disponibiliteImage(dispo), coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 80_000 },
    enAttente: null, retenue: null, devis: null, jobs: [], composantsObligatoires: ['lunettes'], peutRelire: true,
    controleVision: { disponible: false, borneParImageUsdMicros: 0 }, ...o,
  } as VueParcoursImage;
}
const RETENUE = { ...CONSIGNE, verdict: { ok: true } } as VueParcoursImage['retenue'];

describe('Parcours image · le focus survit à un rendu tardif de la vue relue', () => {
  it('après « Valider et voir le prix », le rendu de la vue relue arrive APRÈS le replacement · le focus rejoint « Générer », jamais <body>', async () => {
    const d = differe<unknown>();
    m.retenir.mockReturnValue(d.p);
    m.devis.mockResolvedValue({ ok: true });
    // La relecture répond par le réseau (une tâche plus tard) · hors de tout `act`, comme dans un navigateur.
    m.lire.mockImplementation(() => new Promise((r) => setTimeout(() => r({ ok: true, vue: vueImage({ retenue: RETENUE, devis: DEVIS as never }) }), 10)));
    monter(<ParcoursImage projectId="p1" versionId="v3" initial={vueImage({ enAttente: CONSIGNE })} />);
    const b = q('[data-bouton="retenir"]')!;
    b.focus();
    await cliquer(b);
    expect(actif(), 'le focus a quitté le bouton pressé').toBe(b);
    await act(async () => { d.resoudre({ ok: true }); await d.p; });
    // Hors `act` · la relecture (10 ms), le rendu retardé (20 ms) puis l'effet · on attend largement.
    await new Promise((r) => setTimeout(r, 120));
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(q('[data-bouton="retenir"]'), 'la proposition retenue devait disparaître').toBeNull();
    expect(actif(), 'le focus est tombé sur <body> quand la vue relue est rendue après le replacement').toBe(q('[data-bouton="lancer"]'));
  });
});
