// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ChatThread } from '../app/actions/jarvis-chat';
import type { ListePropositions, ReponseProposition } from '../lib/studios/propositions/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Concept créatif V5 · PR6 · les ACTIONS TYPÉES, au DOM RENDU (jsdom). On REND
 * le vrai composant et on lit le HTML + le comportement.
 *
 * GUARD A · les actions raccordées s'affichent ACTIVES et choisissables ; une
 *   action non raccordée (« Préparer la création ») n'affiche PAS de bouton
 *   actif ; le scénario n'apparaît que pour une vidéo.
 *   Mutation : rendre « preparer » active ⇒ la garde tombe.
 * GUARD B · le prix est ANNONCÉ avant le clic ; sans brief, les propositions
 *   sont grisées avec la raison.
 * GUARD C · cliquer une action TYPÉE déclenche un `proposerPatch` BORNÉ au bon
 *   chemin du brief (3 appels pour « 3 accroches ») ; le texte libre du fil, lui,
 *   n'appelle JAMAIS `proposerPatch` · il ne passe que par `/api/jarvis/chat`.
 *   Mutation : router le texte libre vers `proposerPatch` ⇒ la garde tombe.
 */

const listerSpy = vi.fn(async (): Promise<ReponseProposition<ListePropositions>> => liste({ briefPret: true, jarvis: true, peutProposer: true }));
const proposerSpy = vi.fn(async (_e?: { cible: string; allowedPaths: string[]; demande: string; baseVersionId: string }) => ({ ok: true as const, statut: 'proposee' as const, projectId: 'p1', proposition: { id: 'prop1' } as never, runId: 'r1' }));
vi.mock('../app/actions/studios/propositions', () => ({
  listerPropositions: () => listerSpy(),
  proposerPatch: (e: unknown) => proposerSpy(e as { cible: string; allowedPaths: string[]; demande: string; baseVersionId: string }),
  // Les autres commandes sont importées par PanneauPropositions (hors scope ici).
  proposerBrief: vi.fn(), creerPropositionManuelle: vi.fn(), appliquerProposition: vi.fn(), rejeterProposition: vi.fn(), inspecterProposition: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

import { ActionsConcept } from '../components/studios/projet/ActionsConcept';
import { ConceptHote } from '../components/studios/projet/ConceptHote';

function liste(o: { briefPret: boolean; jarvis: boolean; peutProposer: boolean }): ReponseProposition<ListePropositions> {
  const champsBrief = o.briefPret
    ? [{ chemin: '/brief/styleIntent', libelle: 'Intention de style', forme: 'texte' as const, valeur: '' },
       { chemin: '/brief/texts', libelle: 'Textes', forme: 'lignes' as const, valeur: '' },
       { chemin: '/brief/composition', libelle: 'Composition', forme: 'texte' as const, valeur: '' }]
    : [{ chemin: '/brief', libelle: 'Objectif du brief', forme: 'objectif-brief' as const, valeur: '' }];
  return {
    ok: true, projectId: 'p1', versionCourante: { id: 'v3', n: 3 }, propositions: [],
    peutProposer: o.peutProposer,
    jarvis: { disponible: o.jarvis, motif: o.jarvis ? null : 'PLAFOND_ATTEINT', raison: o.jarvis ? '' : 'Le plafond de dépense est atteint.', coutMaxUsd: 0.13, mentionCout: 'Appel texte payant · 0,13 $ au plus, imputé au plafond de dépense.' },
    cibles: [{ cible: 'brief', libelle: 'Brief', champs: champsBrief }],
  };
}

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => { el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); listerSpy.mockReset(); proposerSpy.mockClear(); });
afterEach(() => { act(() => { root?.unmount(); }); el?.remove(); root = null; el = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });

async function rendre(node: React.ReactElement) {
  await act(async () => { root!.render(node); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
const bouton = (k: string) => el!.querySelector(`[data-action="${k}"]`) as HTMLButtonElement | null;

describe('GUARD A · visibilité et activité des actions typées', () => {
  it('ads · directions et accroches ACTIVES, scénario absent, préparer grisée', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: true }));
    await rendre(<ActionsConcept projectId="p1" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);

    expect(bouton('directions')?.textContent).toBe('Proposer des directions visuelles');
    expect(bouton('directions')?.disabled, 'directions devrait être active').toBe(false);
    expect(bouton('accroches')?.textContent).toBe('Proposer 3 accroches');
    expect(bouton('accroches')?.disabled).toBe(false);
    expect(bouton('scenario'), 'le scénario ne s’affiche que pour une vidéo').toBeNull();
    const prep = bouton('preparer');
    expect(prep, 'préparer devrait être montrée').not.toBeNull();
    expect(prep!.disabled, 'préparer ne doit JAMAIS être un bouton actif en PR6').toBe(true);
    expect(el!.innerHTML).not.toContain('—');
  });

  it('video · le scénario est montré et actif', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: true }));
    await rendre(<ActionsConcept projectId="p1" kind="video" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);
    expect(bouton('scenario')?.textContent).toBe('Écrire le scénario');
    expect(bouton('scenario')?.disabled).toBe(false);
  });
});

describe('GUARD B · prix annoncé, gating honnête', () => {
  it('le coût est écrit AVANT le clic quand une action est active', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: true }));
    await rendre(<ActionsConcept projectId="p1" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);
    expect(el!.querySelector('[data-cout]')?.textContent, 'le prix doit être annoncé avant le clic').toMatch(/payant/i);
  });

  it('sans brief · directions et accroches grisées, la raison parle du brief', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: false, jarvis: true, peutProposer: true }));
    await rendre(<ActionsConcept projectId="p1" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);
    expect(bouton('directions')?.disabled).toBe(true);
    expect(bouton('accroches')?.disabled).toBe(true);
    expect([...el!.querySelectorAll('[data-raison]')].map((n) => n.textContent).join(' ')).toMatch(/brief/i);
  });
});

describe('GUARD C · seul un bouton TYPÉ dépense, jamais le texte libre', () => {
  it('cliquer « directions » déclenche UN proposerPatch borné à /brief/styleIntent', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: true }));
    const onPropose = vi.fn();
    await rendre(<ActionsConcept projectId="p1" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} onPropose={onPropose} />);
    await act(async () => { bouton('directions')!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(proposerSpy).toHaveBeenCalledTimes(1);
    const arg = proposerSpy.mock.calls[0]![0]!;
    expect(arg.cible).toBe('brief');
    expect(arg.allowedPaths).toEqual(['/brief/styleIntent']);
    expect(arg.baseVersionId).toBe('v3');
    expect(arg.demande).toMatch(/intention de style/i);
    expect(onPropose, 'l’hôte doit être prévenu pour recharger les cartes').toHaveBeenCalled();
  });

  it('cliquer « 3 accroches » déclenche 3 propositions concurrentes sur /brief/texts', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: true }));
    await rendre(<ActionsConcept projectId="p1" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);
    await act(async () => { bouton('accroches')!.click(); });
    await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });
    expect(proposerSpy).toHaveBeenCalledTimes(3);
    for (const call of proposerSpy.mock.calls) {
      expect(call[0]!.allowedPaths).toEqual(['/brief/texts']);
    }
  });

  it('le TEXTE LIBRE du fil n’appelle jamais proposerPatch · seulement /api/jarvis/chat', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: true }));
    const fetchSpy = vi.fn(async (_url?: string) => ({ ok: true, body: null } as unknown as Response));
    vi.stubGlobal('fetch', fetchSpy);
    const thread: ChatThread = {
      turns: [], starters: [], measuredAds: 0, brandName: 'Neva',
      contexte: { brandId: 'b1', identity: null, rules: null, hooks: null, connaissances: null },
      conversationId: 'c1', conversations: [],
    };
    await rendre(<ConceptHote projectId="p1" brandName="Neva" kind="ads" generationImageActive={false} versionCourante={{ id: 'v3', n: 3 }} initialThread={thread} />);
    const ta = el!.querySelector('[data-pane="conversation"] textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => { setter.call(ta, 'Je veux quelque chose de punchy'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    const envoi = el!.querySelector('[data-pane="conversation"] [data-cadre="controle"] button') as HTMLButtonElement;
    await act(async () => { envoi.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/jarvis/chat');
    expect(proposerSpy, 'le texte libre ne doit JAMAIS proposer ni dépenser').not.toHaveBeenCalled();
  });
});

describe('préparation image raccordée au parcours produit', () => {
  it('ouvre le produit sans modèle ni mention de coût quand Jarvis est indisponible', async () => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: false, peutProposer: true }));
    await rendre(<ActionsConcept projectId="p1" kind="image" generationImageActive versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);
    const lien = el!.querySelector('a[data-action="preparer"]')!;
    expect(lien.getAttribute('href')).toBe('/studio/projets/p1/produit');
    expect(el!.querySelector('[data-cout]')).toBeNull();
    lien.addEventListener('click', (e) => e.preventDefault());
    await act(async () => { lien.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(proposerSpy).not.toHaveBeenCalled();
  });
  it.each(['inactive', 'lecture', 'historique', 'video', 'ads', 'text'])('%s ne donne pas de lien de fabrication image', async (cas) => {
    listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: cas !== 'lecture' }));
    await rendre(<ActionsConcept projectId="p1" kind={['video', 'ads', 'text'].includes(cas) ? cas : 'image'} generationImageActive={cas !== 'inactive'} ancienneVersion={cas === 'historique'} versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);
    expect(el!.querySelector('a[data-action="preparer"]')).toBeNull();
    expect(proposerSpy).not.toHaveBeenCalled();
  });
});

it('une réponse perdue ne promet ni absence de création ni absence de débit', async () => {
  listerSpy.mockResolvedValue(liste({ briefPret: true, jarvis: true, peutProposer: true }));
  proposerSpy.mockRejectedValueOnce(new Error('network'));
  await rendre(<ActionsConcept projectId="p1" kind="image" generationImageActive versionCourante={{ id: 'v3', n: 3 }} onPropose={() => {}} />);
  await act(async () => { bouton('directions')!.click(); });
  expect(el!.querySelector('[role="alert"]')?.textContent).toBe('La réponse a été interrompue · le résultat de la demande est inconnu. Recharge les cartes avant toute nouvelle demande.');
  expect(proposerSpy).toHaveBeenCalledTimes(1);
});
