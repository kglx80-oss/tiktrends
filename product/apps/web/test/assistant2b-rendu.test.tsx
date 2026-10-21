// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { EtatNouveauProjet, BriefCanonique } from '@tiktrends/core';
import type { CyclePropositionsBrief } from '../components/studios/projet/usePropositionsBrief';

/**
 * Raccord V5 · Lot 2b · les étapes STRATÉGIE et DIRECTION, au RÉSULTAT (HTML).
 *
 * On monte les VRAIS composants (jsdom) et on LIT ce qu'on voit : après la
 * création, l'assistant passe à la stratégie puis à la direction, chacune rend
 * ses contrôles RÉELS (écrire / Jarvis / propositions), une proposition relue
 * s'adopte PAR UN GESTE (`appliquerProposition`), et format/création restent
 * « bientôt ». On vérifie des RÉSULTATS et les appels réellement déclenchés.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const epinglerSpy = vi.hoisted(() => vi.fn());
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: epinglerSpy }));

const h = vi.hoisted(() => ({
  creer: [] as unknown[], propBrief: [] as unknown[], manuel: [] as unknown[], appliquer: [] as unknown[],
  rejeter: [] as unknown[], hypotheses: [] as unknown[], detailBrief: null as BriefCanonique | null,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/studios/projets', () => ({
  creerProjet: async (e: unknown) => { h.creer.push(e); return { ok: true, projet: { id: 'proj-1' }, version: { id: 'v1', n: 1 } }; },
}));
vi.mock('../app/actions/studios/sources', () => ({
  lireProjetDetail: async () => ({ ok: true, detail: { brief: h.detailBrief, briefIllisible: false, version: { id: 'v1', n: 1 }, sources: [] } }),
  proposerHypotheses: async (e: unknown) => { h.hypotheses.push(e); return { ok: true, brandId: 'b1', hypotheses: [{ id: 'hyp_1', statement: 'Montrer le plongeon augmente le clic', sourceIds: ['s1'], variable: 'accroche', control: 'a', treatment: 'b', invariants: [], metric: 'CTR', decisionRule: 'garder si +10%', limitations: [] }], jeton: 'j', runId: 'r', avertissements: [] }; },
}));
const propProposed = {
  id: 'prop-1', projectId: 'proj-1', origine: 'jarvis', libelleOrigine: 'Jarvis', etat: 'proposed', libelleEtat: 'À trancher',
  cible: 'brief', libelleCible: 'Brief', baseVersion: { id: 'v1', n: 1 }, libelleCibleVersion: 'Brief · version 1', perimee: false,
  changements: [{ op: 'replace', chemin: '/brief/angle', libelle: 'Angle', avant: '(vide)', apres: 'Le premier plongeon', raison: 'Angle proposé' }],
  explication: 'Un angle émotionnel', sources: [], impact: null, creeLe: '2026-10-17T10:00:00Z', expireLe: null, decideLe: null, versionAppliquee: null,
};
const propRejected = { ...propProposed, id: 'prop-2', etat: 'rejected', libelleEtat: 'Rejetée', decideLe: '2026-10-17T11:00:00Z' };
vi.mock('../app/actions/studios/propositions', () => ({
  listerPropositions: async () => ({
    ok: true, projectId: 'proj-1', versionCourante: { id: 'v1', n: 1 }, propositions: [propProposed, propRejected],
    jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.13, mentionCout: 'Appel texte payant · 0,13 $ au plus' },
    peutProposer: true, cibles: [],
  }),
  proposerBrief: async (e: unknown) => { h.propBrief.push(e); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: propProposed, runId: 'r' }; },
  creerPropositionManuelle: async (e: unknown) => { h.manuel.push(e); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: propProposed, runId: null }; },
  appliquerProposition: async (e: unknown) => { h.appliquer.push(e); return { ok: true, projectId: 'proj-1', proposition: propProposed, version: { id: 'v2', n: 2 }, deja: false }; },
  rejeterProposition: async (e: unknown) => { h.rejeter.push(e); return { ok: true, projectId: 'proj-1', proposition: propRejected }; },
}));

import { AssistantProjet } from '../components/studios/projet/AssistantProjet';
import { EtapeStrategie } from '../components/studios/projet/EtapeStrategie';

const etatPret: EtatNouveauProjet = { etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau projet' };

async function monter(node: React.ReactElement) {
  const hote = document.createElement('div');
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  await act(async () => { racine.render(node); });
  return { hote, fermer: async () => { await act(async () => { racine.unmount(); }); hote.remove(); } };
}
const clic = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click(); await Promise.resolve(); }); };
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const saisir = async (el: Element | null, valeur: string) => {
  expect(el).not.toBeNull();
  const champ = el as HTMLInputElement | HTMLTextAreaElement;
  const proto = champ instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(champ, valeur);
  await act(async () => { champ.dispatchEvent(new Event('input', { bubbles: true })); });
};

beforeEach(() => { h.creer = []; h.propBrief = []; h.manuel = []; h.appliquer = []; h.rejeter = []; h.hypotheses = []; h.detailBrief = null; });
afterEach(() => { document.body.innerHTML = ''; });

async function allerStrategie(hote: HTMLElement) {
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  await saisir(hote.querySelector('[data-champ="intention"]'), 'Vendre les lunettes aux parents');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  await flush();
}

describe('assistant V5 · création puis étape STRATÉGIE câblée', () => {
  it('après « Créer le projet », l’étape stratégie rend ses vrais contrôles', async () => {
    const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'ads', titre: 'Projet · Neva', intention: '' }} personas={[]} />);
    expect(h.creer).toHaveLength(0);
    await allerStrategie(hote);

    expect(h.creer, 'le projet n’a pas été créé').toHaveLength(1);
    expect(hote.querySelector('[data-zone="assistant-strategie"]'), 'étape stratégie non rendue').not.toBeNull();
    expect(hote.querySelector('[data-champ="chaine"]')).not.toBeNull();
    expect(hote.querySelector('[data-champ="angle-libre"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="ecrire-angle"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="proposer-angles"]')).not.toBeNull();
    // les hypothèses sont honnêtement inactives (pas de source · pas de bouton mort)
    expect(hote.querySelector('[data-champ="hypotheses"] [data-etat="sans-source"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="proposer-hypotheses"]')).toBeNull();
    await fermer();
  });

  it('une proposition relue s’adopte PAR UN GESTE · le rejeté n’a pas de bouton Appliquer', async () => {
    const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'ads', titre: 'Projet · Neva', intention: '' }} personas={[]} />);
    await allerStrategie(hote);

    const proposee = hote.querySelector('[data-proposition="prop-1"]');
    const rejetee = hote.querySelector('[data-proposition="prop-2"]');
    expect(proposee, 'proposition proposée absente').not.toBeNull();
    expect(rejetee!.querySelector('button'), 'une proposition rejetée ne doit pas offrir Appliquer').toBeNull();

    const appliquer = [...proposee!.querySelectorAll('button')].find((b) => b.textContent?.includes('Appliquer'));
    expect(appliquer, 'bouton Appliquer absent de la proposition à trancher').toBeTruthy();
    await clic(appliquer!);
    await flush();
    expect(h.appliquer, 'adopter n’a pas appelé appliquerProposition').toEqual([{ proposalId: 'prop-1', projectId: 'proj-1', baseVersionId: 'v1' }]);
    await fermer();
  });

  it('« Écrire mon angle » crée une proposition manuelle bornée au brief ; « Proposer d’autres angles » appelle Jarvis', async () => {
    const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'ads', titre: 'Projet · Neva', intention: '' }} personas={[]} />);
    await allerStrategie(hote);

    await saisir(hote.querySelector('[data-champ="angle-libre"]'), 'Le premier plongeon');
    await clic(hote.querySelector('[data-bouton="ecrire-angle"]'));
    await flush();
    expect(h.manuel).toHaveLength(1);
    expect(h.manuel[0]).toMatchObject({ projectId: 'proj-1', cible: 'brief' });
    expect((h.manuel[0] as { changes: Array<{ path: string }> }).changes[0]!.path).toBe('/brief/angle');

    await clic(hote.querySelector('[data-bouton="proposer-angles"]'));
    await flush();
    expect(h.propBrief).toHaveLength(1);
    expect(h.propBrief[0]).toMatchObject({ projectId: 'proj-1' });
    await fermer();
  });
});

describe('assistant V5 · étape DIRECTION câblée + format/création « bientôt »', () => {
  it('« Continuer vers la direction » rend les contrôles de direction et le cycle de validation', async () => {
    const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'ads', titre: 'Projet · Neva', intention: '' }} personas={[]} />);
    await allerStrategie(hote);
    await clic(hote.querySelector('[data-bouton="vers-direction"]'));
    await flush();

    expect(hote.querySelector('[data-zone="assistant-direction"]'), 'étape direction non rendue').not.toBeNull();
    expect(hote.querySelector('[data-champ="style-libre"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="ecrire-style"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="autre-direction"]')).not.toBeNull();
    expect(hote.querySelector('[data-zone="propositions-brief"]')).not.toBeNull();

    // écrire le style → proposition manuelle sur /brief/styleIntent
    await saisir(hote.querySelector('[data-champ="style-libre"]'), 'Lumière douce, été');
    await clic(hote.querySelector('[data-bouton="ecrire-style"]'));
    await flush();
    expect((h.manuel.at(-1) as { changes: Array<{ path: string }> }).changes[0]!.path).toBe('/brief/styleIntent');

    // création reste « bientôt », non navigable, sans contrôle (format est câblé au Lot 2c)
    const liCreation = hote.querySelector('[data-rail-etape="creation"]');
    expect(liCreation!.getAttribute('data-bientot')).toBe('true');
    expect(liCreation!.querySelector('button, input, select, textarea, a')).toBeNull();
    expect(hote.querySelector('[data-zone="bientot-note"]')).not.toBeNull();
    await fermer();
  });
});

describe('étape STRATÉGIE · suggestions d’hypothèses quand des sources existent (wiring réel)', () => {
  it('avec des sources, le bouton appelle proposerHypotheses et « Retenir » écrit via une proposition relue', async () => {
    const appels = { manuel: [] as unknown[] };
    const cycle: CyclePropositionsBrief = {
      liste: { ok: true, projectId: 'proj-1', versionCourante: { id: 'v1', n: 1 }, propositions: [], jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.13, mentionCout: 'Appel texte payant' }, peutProposer: true, cibles: [] } as never,
      version: { id: 'v1', n: 1 }, occupe: null, retour: null,
      recharger: async () => {}, demanderJarvis: async () => {}, adopter: async () => {}, rejeter: async () => {},
      ecrireManuel: async (ch) => { appels.manuel.push(ch); },
    };
    const brief = { objective: 'o', audience: 'a', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] } as BriefCanonique;
    const { hote, fermer } = await monter(<EtapeStrategie brief={brief} cycle={cycle} onApplied={() => {}} sources={['ref-1']} marqueId="b1" />);

    const bouton = hote.querySelector('[data-bouton="proposer-hypotheses"]');
    expect(bouton, 'bouton hypothèses absent alors qu’il y a des sources').not.toBeNull();
    expect(hote.querySelector('[data-etat="sans-source"]')).toBeNull();
    await clic(bouton);
    await flush();
    expect(h.hypotheses, 'proposerHypotheses non appelé').toHaveLength(1);
    expect(h.hypotheses[0]).toMatchObject({ sources: ['ref-1'], brandId: 'b1' });

    const retenir = hote.querySelector('[data-hypothese="hyp_1"] [data-bouton="retenir-hypothese"]');
    expect(retenir, 'hypothèse ou bouton « Retenir » non rendu').not.toBeNull();
    await clic(retenir);
    await flush();
    expect(appels.manuel, 'retenir n’a pas écrit via une proposition (relue avant application)').toHaveLength(1);
    expect((appels.manuel[0] as { path: string }).path).toBe('/brief');
    await fermer();
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · onClick d'« Appliquer » ne passant pas par appliquerProposition → « adopte par un geste » tombe.
 *  · CarteProposition rendant les boutons pour un état non 'proposed' → « le rejeté n’a pas Appliquer » tombe.
 *  · EtapeStrategie affichant le bouton hypothèses sans source → « honnêtement inactives » tombe.
 *  · « Retenir » appelant appliquer directement (sans proposition) → « relue avant application » tombe.
 */

it('choisit explicitement la photo et ne recrée pas le projet après un refus d’épinglage', async () => {
  epinglerSpy.mockResolvedValueOnce({ ok: false, message: 'Photo indisponible', traceId: 't1' }).mockResolvedValueOnce({ ok: true, version: { id: 'v2', n: 2 } });
  const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'image', titre: 'Image produit', intention: 'Présenter le produit' }} personas={[]} produits={[{ id: 'prod1', nom: 'Nigella', photos: [{ assetId: 'photo1', apercu: '/photo-test.png', position: 1 }] }]} />);
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  const produit = hote.querySelector('[data-champ="produit"]') as HTMLSelectElement;
  expect(produit.value).toBe('');
  await act(async () => { produit.value = 'prod1'; produit.dispatchEvent(new Event('change', { bubbles: true })); });
  const photo = hote.querySelector('[data-champ="photo-produit"]') as HTMLSelectElement;
  expect(photo.value).toBe('');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(0);
  await act(async () => { photo.value = 'photo1'; photo.dispatchEvent(new Event('change', { bubbles: true })); });
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(hote.textContent).toContain('Photo indisponible');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(epinglerSpy).toHaveBeenLastCalledWith({ projectId: 'proj-1', baseVersionId: 'v1', productId: 'prod1', photoId: 'photo1' });
  expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  await fermer();
});
