// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EtatNouveauProjet } from '@tiktrends/core';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Concept créatif VIVANT · PR3 + PR4, au DOM RENDU (jsdom). On REND les vrais
 * composants et on lit le résultat.
 *
 * GUARD #3 · anti double-envoi (écran Spatial, porté de la V5 en vague 2) · deux clics du MÊME tick ne démarrent qu'UN
 *   concept · `demarrerConcept` est appelé UNE fois, une SEULE navigation part.
 *   Mutation : retirer `verrouAction` du composeur fait partir deux démarrages.
 *
 * GUARD #5 (l'hôte V5 du concept, chat et créations côte à côte) est retiré avec
 *   la fiche V5 · le panneau Jarvis Spatial du projet (fil, coût du message,
 *   propositions dans « Brief & références ») est gardé par `spatial-projet-jarvis`.
 */

const replaceSpy = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/nouveau/concept', useRouter: () => ({ push: () => {}, replace: replaceSpy, refresh: () => {} }) }));
// Le démarrage réel est prouvé en base ailleurs (concept-conversation-vivante-db) ·
// ici on isole le VERROU · on compte les appels, on ne touche pas la base.
const demarrerSpy = vi.fn(async () => ({ ok: true as const, demarrage: { projectId: 'p-new', conversationId: 'c-new' } }));
vi.mock('../app/actions/studios/concept', () => ({ demarrerConcept: () => demarrerSpy() }));

import { NouveauConcept } from '../spatial/vues/studios/NouveauConcept';
import { avecSpatial } from './spatial/fournisseur';

const pret: EtatNouveauProjet = { etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau concept créatif' };

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); replaceSpy.mockClear(); demarrerSpy.mockClear(); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });

function taper(ta: HTMLTextAreaElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => { setter.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('GUARD #3 · le composeur ne démarre qu’UN concept même sur un double-clic', () => {
  it('deux clics synchrones · demarrerConcept une fois, une seule navigation vers le concept', async () => {
    const fetchSpy = vi.fn(async () => new Response('Voici une piste de concept.'));
    vi.stubGlobal('fetch', fetchSpy);
    act(() => { root!.render(avecSpatial(<NouveauConcept etat={pret} sous="Studios · Neva" />)); });
    const ta = el!.querySelector('[data-composeur] textarea') as HTMLTextAreaElement;
    taper(ta, 'Un concept de rentrée pour Neva');
    const envoi = el!.querySelector('[data-envoi="pret"]') as HTMLButtonElement;
    expect(envoi.disabled, 'l’envoi devrait être actif une fois la saisie remplie').toBe(false);

    // Deux clics dans le MÊME tick · le verrou (drapeau synchrone) arrête le second.
    await act(async () => { envoi.click(); envoi.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(demarrerSpy, 'le double-clic a démarré deux concepts (verrou absent ?)').toHaveBeenCalledTimes(1);
    expect(fetchSpy, 'le double-clic ne doit envoyer qu’un seul premier message').toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith('/studio/projets/p-new');
  });
});
