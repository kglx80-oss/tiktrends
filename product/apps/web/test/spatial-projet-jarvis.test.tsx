// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MENTION_COUT_MESSAGE_CONCEPT, actionsConceptResolues } from '@tiktrends/core';

/**
 * Spatial · fiche projet · le panneau Jarvis du projet, MONTÉ · les gardes du
 * concept V5 (`ActionsConcept`, `ConceptHote`, retirés avec la fiche V5),
 * portées sur `PanneauJarvis`. Les actions viennent de la MÊME règle du noyau
 * que la page (`actionsConceptResolues`).
 *
 *  A · ads · directions et accroches actives, scénario absent ; vidéo · le
 *      scénario est montré ; « Préparer la création » n'est actif que pour
 *      une image et mène au produit, sans appel ni coût.
 *  B · sans brief, les propositions sont grisées et la raison parle du brief.
 *  C · seul un bouton TYPÉ dépense · « directions » = UN `proposerPatch` borné
 *      à `/brief/styleIntent`, sur la version courante ; le TEXTE LIBRE du fil
 *      ne passe que par `/api/jarvis/chat`, jamais par `proposerPatch`.
 *  D · une réponse perdue ne promet ni absence de création ni absence de débit.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1', useRouter: () => nav }));
const a = vi.hoisted(() => ({
  proposerPatch: vi.fn(async (_e: { cible: string; allowedPaths: string[]; demande: string; baseVersionId: string }) => ({ ok: true, statut: 'proposee', projectId: 'p1', proposition: {}, runId: null })),
  chatThreadAction: vi.fn(async () => ({ thread: undefined })),
}));
vi.mock('../app/actions/studios/propositions', () => ({ proposerPatch: a.proposerPatch }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: a.chatThreadAction }));

const { PanneauJarvis } = await import('../spatial/vues/projet/PanneauJarvis');
const { avecSpatial } = await import('./spatial/fournisseur');
type PropsJarvisProjet = import('../spatial/vues/projet/types').PropsJarvisProjet;

function props(o: { kind?: string; briefPret?: boolean; generationImageActive?: boolean } = {}): PropsJarvisProjet {
  const actions = actionsConceptResolues({
    kind: o.kind ?? 'ads', peutProposer: true, briefPret: o.briefPret ?? true, jarvisDisponible: true, jarvisRaison: '',
    generationImageActive: o.generationImageActive ?? false, ancienneVersion: false,
  });
  return {
    projectId: 'p1', marque: 'Neva', sousTitre: 'Dans ce projet', message: 'Bonjour.', fil: { conversationId: 'c1', tours: [] }, erreurFil: null, suggestion: null,
    actions: actions.map((x) => ({ cle: x.def.key, libelle: x.def.label, etat: x.etat, raison: x.raison, effet: x.def.effet, genre: x.def.genre, cible: x.def.cibleBrief ?? null })),
    mentionCout: 'Appel texte payant · 0,13 $ au plus, imputé au plafond de dépense.', mentionConversation: MENTION_COUT_MESSAGE_CONCEPT,
    versionCourante: { id: 'v3', n: 3 }, preparerHref: '/studio/projets/p1/produit', conversationOuverte: true,
  };
}

let root: Root;
let hote: HTMLDivElement;
beforeEach(() => { a.proposerPatch.mockClear(); nav.push.mockClear(); hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); });
afterEach(() => { act(() => root.unmount()); hote.remove(); vi.unstubAllGlobals(); });
const monter = async (p: PropsJarvisProjet) => { await act(async () => { root.render(avecSpatial(<PanneauJarvis {...p} ouvrirBrief={() => {}} />)); }); };
const puce = (t: string) => [...hote.querySelectorAll<HTMLButtonElement>('button.chip')].find((b) => b.textContent === t);
const bouton = (t: string) => [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.endsWith(t));
const cliquer = async (b: HTMLElement | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { b!.click(); }); };

describe('A · visibilité et activité des actions typées', () => {
  it('ads · directions et accroches ACTIVES, scénario absent, préparer inactif avec sa raison', async () => {
    await monter(props());
    expect(puce('Proposer des directions visuelles')!.disabled).toBe(false);
    expect(puce('Proposer 3 accroches')!.disabled).toBe(false);
    expect(puce('Écrire le scénario')).toBeUndefined();
    expect(puce('Préparer la création')!.disabled).toBe(true);
    expect(hote.innerHTML).not.toContain('—');
  });
  it('vidéo · le scénario est montré et actif', async () => {
    await monter(props({ kind: 'video' }));
    expect(puce('Écrire le scénario')!.disabled).toBe(false);
  });
  it('image et génération active · « Préparer la création » mène au produit, sans appel ni coût', async () => {
    await monter(props({ kind: 'image', generationImageActive: true }));
    await cliquer(puce('Préparer la création'));
    expect(nav.push).toHaveBeenCalledWith('/studio/projets/p1/produit');
    expect(hote.querySelector('[data-confirmation]')).toBeNull();
    expect(a.proposerPatch).not.toHaveBeenCalled();
  });
});

describe('B · gating honnête', () => {
  it('sans brief · directions et accroches grisées, la raison parle du brief', async () => {
    await monter(props({ briefPret: false }));
    expect(puce('Proposer des directions visuelles')!.disabled).toBe(true);
    expect(puce('Proposer 3 accroches')!.disabled).toBe(true);
    expect(hote.textContent).toMatch(/brief/i);
  });
});

describe('C · seul un bouton TYPÉ dépense, jamais le texte libre', () => {
  it('« directions » · le prix avant, puis UN proposerPatch borné à /brief/styleIntent sur la version courante', async () => {
    await monter(props());
    await cliquer(puce('Proposer des directions visuelles'));
    expect(hote.querySelector('[data-confirmation] [data-cout]')?.textContent).toMatch(/payant/i);
    expect(a.proposerPatch).not.toHaveBeenCalled();
    await cliquer(bouton('Lancer la demande'));
    expect(a.proposerPatch).toHaveBeenCalledTimes(1);
    const e = a.proposerPatch.mock.calls[0]![0];
    expect(e.cible).toBe('brief');
    expect(e.allowedPaths).toEqual(['/brief/styleIntent']);
    expect(e.baseVersionId).toBe('v3');
    expect(e.demande).toMatch(/intention de style/i);
  });

  it('le TEXTE LIBRE du fil n’appelle jamais proposerPatch · seulement /api/jarvis/chat ; le coût du message est dit, jamais « gratuit »', async () => {
    const fetchSpy = vi.fn(async (_url?: string) => ({ ok: false, body: null, json: async () => ({ error: 'x' }) } as unknown as Response));
    vi.stubGlobal('fetch', fetchSpy);
    await monter(props());
    await cliquer(puce('Écrire à Jarvis'));
    expect(hote.querySelector('[data-cout-message]')?.textContent).toContain('plafond IA');
    expect(hote.querySelector('[data-cout-message]')?.textContent).not.toContain('gratuit');
    const ta = hote.querySelector('[data-fil="projet"] textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => { setter.call(ta, 'Je veux quelque chose de punchy'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await cliquer(bouton('Envoyer'));
    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/jarvis/chat');
    expect(a.proposerPatch, 'le texte libre ne doit JAMAIS proposer ni dépenser').not.toHaveBeenCalled();
  });
});

describe('D · réponse perdue', () => {
  it('une réponse perdue ne promet ni absence de création ni absence de débit', async () => {
    a.proposerPatch.mockRejectedValueOnce(new Error('network'));
    await monter(props());
    await cliquer(puce('Proposer des directions visuelles'));
    await cliquer(bouton('Lancer la demande'));
    expect(hote.querySelector('[role="alert"]')?.textContent).toContain('La réponse a été interrompue · le résultat de la demande est inconnu. Recharge la page avant toute nouvelle demande.');
    expect(hote.querySelector('[role="alert"]')?.textContent?.toLowerCase()).not.toMatch(/aucun débit|rien n’a été créé/);
    expect(a.proposerPatch).toHaveBeenCalledTimes(1);
  });
});
