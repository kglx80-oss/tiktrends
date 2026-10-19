// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { disponibiliteJarvis } from '@tiktrends/core';
import type { ListePropositions, ReponseProposition } from '../lib/studios/propositions/types';
const actions = vi.hoisted(() => ({ listerPropositions: vi.fn(), proposerPatch: vi.fn(), proposerBrief: vi.fn(), creerPropositionManuelle: vi.fn(), appliquerProposition: vi.fn(), rejeterProposition: vi.fn() }));
vi.mock('../app/actions/studios/propositions', () => actions);
import { PanneauPropositions } from '../components/studios/PanneauPropositions';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let el: HTMLDivElement;
const liste = (projectId = 'projet-a'): ReponseProposition<ListePropositions> => ({
  ok: true, projectId, versionCourante: { id: 'version-a', n: 1 }, propositions: [], cibles: [], peutProposer: false,
  jarvis: disponibiliteJarvis({ releasePubliee: false, fournisseurConfigure: false, plafondAtteint: false, peutProposer: false, modele: 'test' }),
});
beforeEach(() => { Object.values(actions).forEach((f) => f.mockReset()); el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el); });
afterEach(() => { act(() => root.unmount()); el.remove(); });
const monter = async (projectId = 'projet-a') => { await act(async () => { root.render(<PanneauPropositions projectId={projectId} versionCourante={{ id: 'version-a', n: 1 }} />); }); };
describe('audit 17 octobre · récupération après erreur réseau', () => {
  it('le premier chargement échoué affiche une erreur et une reprise en lecture, pas un chargement infini', async () => {
    actions.listerPropositions.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(liste());
    await monter();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Connexion perdue');
    expect(el.querySelector('[aria-busy="true"]')).toBeNull();
    const retry = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Actualiser les propositions');
    expect(retry).toBeDefined();
    await act(async () => { retry!.click(); });
    expect(el.textContent).toContain('Aucune proposition pour ce projet');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(actions.listerPropositions).toHaveBeenCalledTimes(2);
    expect(actions.proposerBrief).not.toHaveBeenCalled();
    expect(actions.appliquerProposition).not.toHaveBeenCalled();
  });
  it('une erreur tardive de l’ancien projet ne masque pas le projet ouvert ensuite', async () => {
    let rejeter!: (error: Error) => void;
    actions.listerPropositions.mockReturnValueOnce(new Promise((_resolve, reject) => { rejeter = reject; })).mockResolvedValueOnce(liste('projet-b'));
    await monter(); await monter('projet-b');
    await act(async () => { rejeter(new Error('offline')); });
    expect(el.textContent).toContain('Aucune proposition pour ce projet');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
