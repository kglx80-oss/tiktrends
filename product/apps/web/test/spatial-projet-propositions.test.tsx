// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { disponibiliteJarvis, erreurStudio } from '@tiktrends/core';
import type { ListePropositions, PropositionPresentee, ReponseProposition } from '../lib/studios/propositions/types';

/**
 * Spatial · fiche projet · propositions MONTÉES (jsdom) · les comportements
 * que gardaient les tests du panneau V5 retiré, portés sur l'écran Spatial :
 *
 *  · audit 17 · une lecture échouée dit l'erreur et offre « Réessayer », qui
 *    relit (et seulement relit) ;
 *  · L8-B · le retour d'un geste prend le focus ;
 *  · FLOW-06 · un 409 montre ce qui a changé depuis la base, n'écrase rien,
 *    et propose de relire la version courante ;
 *  · A2 · la prose de Jarvis est affichée sans tiret cadratin, l'avant / après
 *    (la valeur appliquée) jamais réécrit, une saisie humaine jamais réécrite.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const actions = vi.hoisted(() => ({
  listerPropositions: vi.fn(), proposerPatch: vi.fn(), proposerBrief: vi.fn(), creerPropositionManuelle: vi.fn(), appliquerProposition: vi.fn(), rejeterProposition: vi.fn(),
}));
vi.mock('../app/actions/studios/propositions', () => actions);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/studio/projets/p1' }));

const { Propositions } = await import('../spatial/vues/projet/Propositions');
const { avecSpatial } = await import('./spatial/fournisseur');

const T = '2026-10-14T10:00:00.000Z';
const PROPOSITION: PropositionPresentee = {
  id: 'pr1', projectId: 'p1', origine: 'jarvis', libelleOrigine: 'Jarvis', etat: 'proposed', libelleEtat: 'À trancher',
  cible: 'shot:s1', libelleCible: 'Plan 1', baseVersion: { id: 'v1', n: 1 }, libelleCibleVersion: 'Plan 1 · version 1', perimee: false,
  changements: [{ op: 'replace', chemin: '/shots/byId/s1/onScreenText', libelle: 'Texte à l’écran', avant: 'Avant — ancien', apres: 'Après — nouveau', raison: 'Plus net — plus court' }],
  explication: 'Le hook porte — on serre le texte.', sources: ['Annonce 9001'], impact: null,
  creeLe: T, expireLe: null, decideLe: null, versionAppliquee: null,
};
const liste = (o: Partial<ListePropositions> = {}): ReponseProposition<ListePropositions> => ({
  ok: true, projectId: 'p1', versionCourante: { id: 'v1', n: 1 }, propositions: [], peutProposer: true,
  jarvis: disponibiliteJarvis({ releasePubliee: false, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'claude-sonnet-5' }),
  cibles: [{ cible: 'brief', libelle: 'Brief', champs: [{ chemin: '/brief/objective', libelle: 'Objectif', forme: 'texte', valeur: 'Vérifier une accroche' }] }],
  ...o,
} as ReponseProposition<ListePropositions>);

let root: Root;
let hote: HTMLDivElement;
beforeEach(() => { Object.values(actions).forEach((f) => f.mockReset()); hote = document.createElement('div'); document.body.appendChild(hote); root = createRoot(hote); });
afterEach(() => { act(() => root.unmount()); hote.remove(); });
const monter = async (initial: ReponseProposition<ListePropositions> | null) => { await act(async () => { root.render(avecSpatial(<Propositions projectId="p1" versionCourante={{ id: 'v1', n: 1 }} initial={initial} />)); }); };
const bouton = (t: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent === t || b.textContent?.endsWith(t)) as HTMLButtonElement | undefined;
const cliquer = async (b: HTMLElement | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { b!.click(); }); };
const lu = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent ?? ''; };
function saisir(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('audit 17 · reprise après une lecture échouée', () => {
  it('lecture absente · erreur dite et « Réessayer » ; un échec réseau le dit, la reprise relit sans rien écrire', async () => {
    actions.listerPropositions.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(liste());
    await monter(null);
    expect(hote.textContent).toContain('Les propositions n’ont pas pu être lues');
    await cliquer(bouton('Réessayer'));
    expect(hote.querySelector('[role="alert"]')?.textContent).toContain('Le serveur ne répond pas');
    await cliquer(bouton('Réessayer'));
    expect(hote.textContent).toContain('Aucune proposition pour l’instant');
    expect(hote.querySelector('[role="alert"]')).toBeNull();
    expect(actions.listerPropositions).toHaveBeenCalledTimes(2);
    expect(actions.proposerBrief).not.toHaveBeenCalled();
    expect(actions.appliquerProposition).not.toHaveBeenCalled();
  });

  it('erreur récupérable du serveur · « Réessayer » relit la liste', async () => {
    actions.listerPropositions.mockResolvedValueOnce(liste());
    await monter(erreurStudio('PERSISTENCE_FAILED', { traceId: 'st_x' }) as never);
    await cliquer(bouton('Réessayer'));
    expect(hote.textContent).toContain('Aucune proposition pour l’instant');
  });
});

describe('L8-B · le retour d’un geste prend le focus', () => {
  it('« Proposer cette modification » · le message de succès reçoit le focus', async () => {
    actions.creerPropositionManuelle.mockResolvedValueOnce({ ok: true, projectId: 'p1', statut: 'proposee', proposition: { libelleCibleVersion: 'Brief · version 1' } });
    actions.listerPropositions.mockResolvedValue(liste());
    await monter(liste());
    await cliquer(bouton('Modifier à la main'));
    act(() => saisir(hote.querySelectorAll('textarea')[0] as HTMLTextAreaElement, 'Vérifier une accroche chiffrée'));
    await cliquer(bouton('Proposer cette modification'));
    expect((document.activeElement as HTMLElement).getAttribute('data-retour'), 'le focus n’a pas suivi le message').toBe('succes');
    expect(document.activeElement!.textContent).toContain('Proposition enregistrée');
  });
});

describe('FLOW-06 · conflit de version · rien d’écrasé, ce qui a changé, relire', () => {
  it('Appliquer sur une base périmée · différences base → courante, « Relire la version courante », identifiant support, focus', async () => {
    actions.appliquerProposition.mockResolvedValueOnce({
      ...erreurStudio('VERSION_CONFLICT', { traceId: 'st_conflit', message: 'Le projet a changé depuis cette proposition.' }),
      conflit: { versionCouranteId: 'v2', differences: [{ chemin: '/shots/byId/s_produit/narration', base: 'Voici le sérum.', courant: 'Onglet 1' }] },
    });
    await monter(liste({ propositions: [PROPOSITION] }));
    await cliquer(bouton('Appliquer'));
    const r = hote.querySelector('[data-retour="refus"]')!;
    expect(r.textContent).toContain('Conflit de version · rien n’a été écrasé. Le projet a changé depuis cette proposition.');
    expect(r.textContent).toContain('/shots/byId/s_produit/narration · Voici le sérum. → Onglet 1');
    expect(r.textContent).toContain('Identifiant support · st_conflit');
    expect([...r.querySelectorAll('button')].map((b) => b.textContent)).toContain('Relire la version courante');
    expect(document.activeElement).toBe(r);
  });
});

describe('A2 · la carte d’une proposition, sans tiret cadratin dans la prose de Jarvis', () => {
  const rendre = (p: PropositionPresentee) => lu(renderToStaticMarkup(avecSpatial(<Propositions projectId="p1" versionCourante={{ id: 'v1', n: 1 }} initial={liste({ propositions: [p] })} />)));
  it('Jarvis · explication et raison réécrites, avant/après INTACTS (valeur appliquée), sources citées', () => {
    const t = rendre(PROPOSITION);
    expect(t, 'explication de Jarvis encore en « — »').toContain('Le hook porte · on serre le texte.');
    expect(t).toContain('Raison · Plus net · plus court');
    expect(t, 'la valeur qui sera appliquée a été réécrite').toContain('Après · Après — nouveau');
    expect(t).toContain('Avant · Avant — ancien');
    expect(t).toContain('Sources citées · Annonce 9001');
  });
  it('saisie humaine · rien n’est réécrit', () => {
    const t = rendre({ ...PROPOSITION, origine: 'human', libelleOrigine: 'Saisie' });
    expect(t).toContain('Le hook porte — on serre le texte.');
    expect(t).toContain('Raison · Plus net — plus court');
  });
});
