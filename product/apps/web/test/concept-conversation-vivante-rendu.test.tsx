// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EtatNouveauProjet } from '@tiktrends/core';
import type { ChatThread } from '../app/actions/jarvis-chat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Concept créatif VIVANT · PR3 + PR4, au DOM RENDU (jsdom). On REND les vrais
 * composants et on lit le résultat.
 *
 * GUARD #3 · anti double-envoi · deux clics du MÊME tick ne démarrent qu'UN
 *   concept · `demarrerConcept` est appelé UNE fois, une SEULE navigation part.
 *   Mutation : retirer `verrouAction` du composeur fait partir deux démarrages.
 *
 * GUARD #5 · l'écran du concept rend le CHAT et la zone CRÉATIONS (le panneau de
 *   propositions existant) ; en mobile, deux ONGLETS (Conversation / Créations).
 */

const replaceSpy = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: replaceSpy, refresh: () => {} }) }));
// Le démarrage réel est prouvé en base ailleurs (concept-conversation-vivante-db) ·
// ici on isole le VERROU · on compte les appels, on ne touche pas la base.
const demarrerSpy = vi.fn(async () => ({ ok: true as const, demarrage: { projectId: 'p-new', conversationId: 'c-new' } }));
vi.mock('../app/actions/studios/concept', () => ({ demarrerConcept: () => demarrerSpy() }));

import { NouveauConcept } from '../components/studios/projet/NouveauConcept';
import { ConceptHote } from '../components/studios/projet/ConceptHote';

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
    act(() => { root!.render(<NouveauConcept etat={pret} />); });
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

/* ───────────────────────────── GUARD #5 · l'hôte ──────────────────────────── */

const thread: ChatThread = {
  turns: [
    { id: 't1', role: 'user', content: 'Un concept de rentrée', at: '2026-10-20T10:00:00Z' },
    { id: 't2', role: 'assistant', content: 'Voici une piste de concept.', at: '2026-10-20T10:00:05Z' },
  ],
  starters: [], measuredAds: 0, brandName: 'Neva',
  contexte: { brandId: 'b1', identity: null, rules: null, hooks: null, connaissances: null },
  conversationId: 'c-new', conversations: [],
};

describe('GUARD #5 · l’écran du concept héberge le chat À CÔTÉ des créations', () => {
  it('desktop · chat et zone créations (panneau de propositions) présents, pas d’onglets', () => {
    const d = document.createElement('div');
    d.innerHTML = renderToStaticMarkup(
      <ConceptHote projectId="p1" brandName="Neva" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} initialThread={thread} />,
    );
    expect(d.querySelector('[data-hote="concept"]'), 'hôte absent').not.toBeNull();
    // Le CHAT · le fil montre le message et la réponse.
    const chat = d.querySelector('[data-pane="conversation"]')!;
    expect(chat, 'colonne conversation absente').not.toBeNull();
    expect(chat.textContent).toContain('Un concept de rentrée');
    expect(chat.querySelector('textarea'), 'composeur du chat absent').not.toBeNull();
    // Coût annoncé AVANT l'envoi · la VÉRITÉ de la route (aucun crédit débité,
    // fournisseur IA sous plafond), jamais « N crédit » par message ni « gratuit ».
    const cout = chat.querySelector('[data-cout-message]');
    expect(cout?.textContent, 'coût du message non annoncé').toContain('plafond IA');
    expect(cout?.textContent, 'faux débit « N crédit » par message').not.toMatch(/coûte\s+\d+\s+crédit/i);
    expect(cout?.textContent, 'aucune promesse de gratuité').not.toContain('gratuit');
    // La zone CRÉATIONS · le panneau de propositions EXISTANT, pas une fausse carte.
    const creations = d.querySelector('[data-pane="creations"]')!;
    expect(creations, 'colonne créations absente').not.toBeNull();
    expect(creations.querySelector('[data-emplacement="propositions"] [data-panneau="propositions"]')?.textContent, 'panneau de propositions absent').toContain('Propositions');
    // Desktop · pas d’onglets (ceux-ci sont la vue mobile).
    expect(d.querySelector('[data-onglets]'), 'les onglets ne devraient apparaître qu’en mobile').toBeNull();
    expect(d.innerHTML, 'tiret cadratin à l’écran').not.toContain('—');
  });

  it('mobile · deux onglets Conversation / Créations', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    act(() => { root!.render(<ConceptHote projectId="p1" brandName="Neva" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} initialThread={thread} />); });
    const onglets = el!.querySelector('[data-onglets]');
    expect(onglets, 'les onglets mobiles sont absents').not.toBeNull();
    const tabs = [...el!.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.getAttribute('data-onglet'))).toEqual(['conversation', 'creations']);
    expect(tabs.map((t) => t.textContent)).toEqual(['Conversation', 'Créations']);
  });
});

it('panneau Jarvis compact conserve conversation, coût et propositions accessibles', () => {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(<ConceptHote compact projectId="p1" brandName="Neva" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} initialThread={thread} />);
  expect(d.querySelector('[data-pane="conversation"] textarea')).not.toBeNull();
  expect(d.querySelector('[data-cout-message]')?.textContent).toContain('plafond IA');
  expect(d.querySelector('details summary')?.textContent).toBe('Propositions et actions du projet');
  expect(d.querySelector('details [data-pane="creations"]')).not.toBeNull();
});
