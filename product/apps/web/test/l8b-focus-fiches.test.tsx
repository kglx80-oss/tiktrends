// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * L8-B · UX-02 / UX-03 · identités (atelier Spatial, porté de la V5 en vague 2),
 * propositions, export du brief, MONTÉS (jsdom) · on lit où est le focus et ce qui reste à l'écran après un geste.
 *
 * Mesuré avant au navigateur (390 × 720, au clavier) : BODY après « Nouvelle
 * fiche », « Annuler », « Enregistrer la fiche » et « Proposer cette
 * modification » ; les onglets ignoraient les flèches ; l'export hors ligne
 * laissait ses trois boutons inactifs pour toujours.
 *
 * La fiche V5 est retirée · le focus des propositions est gardé sur l'écran
 * Spatial par `spatial-projet-propositions` ; l'export du brief, ici, sur
 * l'onglet « Brief & références » Spatial. Les onglets « Demander à Jarvis /
 * Modifier à la main » de Spatial sont deux boutons pressables (`.seg`),
 * chacun atteignable au Tab · pas une liste d'onglets à flèches.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ enregistrer: vi.fn(), lister: vi.fn(), manuelle: vi.fn(), exporter: vi.fn() }));
vi.mock('../app/actions/studios/identites', () => ({ enregistrerIdentite: m.enregistrer, lierIdentite: vi.fn(), resoudreContradiction: vi.fn(), choisirModeParole: vi.fn() }));
vi.mock('../app/actions/studios/propositions', () => ({
  listerPropositions: m.lister, proposerPatch: vi.fn(), proposerBrief: vi.fn(), creerPropositionManuelle: m.manuelle, appliquerProposition: vi.fn(), rejeterProposition: vi.fn(),
}));
vi.mock('../app/actions/studios/sources', () => ({ exporterBrief: m.exporter }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/identites', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { disponibiliteJarvis, messageHorsLigneStudio } from '@tiktrends/core';
import type { VueIdentites } from '../lib/studios/identites/commandes';
import type { ListePropositions } from '../lib/studios/propositions/types';
import { Identites } from '../spatial/vues/projet/Identites';
import { avecSpatial } from './spatial/fournisseur';
import { OngletBrief } from '../spatial/vues/projet/OngletBrief';

const VUE = {
  projet: { id: 'p1', title: 'Sérum', marque: 'Maison Ondine', kind: 'video' }, version: { id: 'v1', n: 1 },
  identites: [], plans: [], contradictions: [], couleurs: ['verte', 'jaune'], peutProposer: true,
  voix: {
    capacites: { synthese: { disponible: false, raison: 'La synthèse vocale n’est pas disponible · aucun fournisseur.' } },
    modes: [], plansLipsync: [], prises: {}, temps: { plans: [], depassementMs: 0, message: 'Dans la cible.' },
  },
} as unknown as VueIdentites;

const LISTE: { ok: true } & ListePropositions = {
  ok: true, projectId: 'p1', versionCourante: { id: 'v1', n: 1 }, propositions: [], peutProposer: true,
  jarvis: disponibiliteJarvis({ releasePubliee: false, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'claude-sonnet-5' }),
  cibles: [{ cible: 'brief', libelle: 'Brief', champs: [{ chemin: '/brief/objective', libelle: 'Objectif', forme: 'texte', valeur: 'Vérifier une accroche' }] }],
} as unknown as { ok: true } & ListePropositions;

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

describe('identités · le focus suit le formulaire et le message', () => {
  it('« Nouvelle fiche » met le focus dans le premier champ ; « Annuler » le rend à « Nouvelle fiche »', () => {
    monter(avecSpatial(<Identites vue={VUE} voixActive atelier={[]} />));
    act(() => { bouton('Nouvelle fiche').focus(); bouton('Nouvelle fiche').click(); });
    const nom = q('[data-zone="edition-fiche"] input')!;
    expect(actif(), 'le focus n’est pas entré dans le formulaire ouvert').toBe(nom);
    act(() => bouton('Annuler').click());
    expect(actif()?.textContent, 'refermé, le focus n’est pas revenu au geste d’ouverture').toBe('Nouvelle fiche');
  });

  it('hors ligne · « Hors ligne » dit ce qui n’a pas eu lieu, le focus va au message, la saisie reste', async () => {
    m.enregistrer.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    monter(avecSpatial(<Identites vue={VUE} voixActive atelier={[]} />));
    act(() => bouton('Nouvelle fiche').click());
    act(() => saisir(q('[data-zone="edition-fiche"] input') as HTMLInputElement, 'Léa'));
    await act(async () => bouton('Enregistrer la fiche').click());
    await flush();
    const r = q('[data-retour="refus"]')!;
    expect(r.textContent).toBe(`Hors ligne · ${messageHorsLigneStudio('enregistrement')}`);
    expect(actif()).toBe(r);
    expect((q('[data-zone="edition-fiche"] input') as HTMLInputElement).value).toBe('Léa');
  });
});

describe('export du brief · hors ligne, les boutons reviennent et le message le dit', () => {
  it('rejet réseau · « Hors ligne · … rien n’a été exporté », boutons actifs', async () => {
    m.exporter.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    monter(avecSpatial(<OngletBrief projectId="p1" versionId="v1" versionN={1} ancienne={false} titreBrief="Brief · version 1" etatBrief="ok" champs={[]} references={[]} produit={null}
      veilleHref={null} fiche={null} manques={[]} versions={[]} atelier={[]} exportBrief={{ autorise: true, possible: true }} propositions={{ initial: LISTE, versionCourante: { id: 'v1', n: 1 } }} />));
    await act(async () => bouton('Exporter le brief').click());
    await flush();
    // La pastille « Refusé » de la maquette précède le message.
    expect(q('[role="alert"]')!.textContent).toBe(`Refusé Hors ligne · ${messageHorsLigneStudio('export')}`);
    expect(bouton('Exporter le brief').disabled, 'les boutons restent figés').toBe(false);
  });
});
