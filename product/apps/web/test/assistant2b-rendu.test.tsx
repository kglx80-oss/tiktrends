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

const departSpy = vi.hoisted(() => ({ lire: vi.fn(), ajouter: vi.fn() }));
vi.mock('../app/actions/studios/departs-assistant', () => ({ lireDepartAssistant: departSpy.lire, listerDepartsAssistant: async () => ({ ok: true, choix: [{ id: 's1', titre: 'Référence test', detail: '', apercu: null }] }) }));
const epinglerSpy = vi.hoisted(() => vi.fn());
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: epinglerSpy }));

const h = vi.hoisted(() => ({
  navigation: [] as string[], refuserApplication: false, persisterDirection: false, jeterApplication:false, droitProposer:true,
  creer: [] as unknown[], propBrief: [] as unknown[], manuel: [] as unknown[], appliquer: [] as unknown[],
  rejeter: [] as unknown[], hypotheses: [] as unknown[], detailBrief: null as BriefCanonique | null,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: (path:string) => { h.navigation.push(path); }, refresh: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/studios/projets', () => ({
  creerProjet: async (e: unknown) => { h.creer.push(e); h.detailBrief = (e as { contenu: { brief: BriefCanonique } }).contenu.brief; return { ok: true, projet: { id: 'proj-1' }, version: { id: 'v1', n: 1 } }; },
}));
vi.mock('../app/actions/studios/sources', () => ({
  ajouterSourcesAuProjet: departSpy.ajouter,
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
    peutProposer: h.droitProposer, cibles: [],
  }),
  proposerBrief: async (e: unknown) => { h.propBrief.push(e); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: propProposed, runId: 'r' }; },
  creerPropositionManuelle: async (e: unknown) => { h.manuel.push(e); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: propProposed, runId: null }; },
  appliquerProposition: async (e: unknown) => { h.appliquer.push(e); if(h.jeterApplication)throw new Error('réseau'); if (h.refuserApplication) return { ok: false, message: 'Version modifiée ailleurs', traceId: 'conflit' }; if(h.persisterDirection && h.detailBrief){for(const ch of (h.manuel.at(-1) as {changes:{path:string;newValue:unknown}[]}).changes){(h.detailBrief as unknown as Record<string,unknown>)[ch.path.replace('/brief/','')]=ch.newValue;}} return { ok: true, projectId: 'proj-1', proposition: propProposed, version: { id: 'v2', n: 2 }, deja: false }; },
  rejeterProposition: async (e: unknown) => { h.rejeter.push(e); return { ok: true, projectId: 'proj-1', proposition: propRejected }; },
}));

import { PageAssistant } from '../components/studios/projet/PageAssistant';
import { AssistantProjet } from '../components/studios/projet/AssistantProjet';
import { EtapeDirection } from '../components/studios/projet/EtapeDirection';
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

beforeEach(() => { h.navigation=[]; h.refuserApplication = false; h.persisterDirection = false; h.jeterApplication=false; h.droitProposer=true; h.creer = []; h.propBrief = []; h.manuel = []; h.appliquer = []; h.rejeter = []; h.hypotheses = []; h.detailBrief = null; });
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
    expect(hote.querySelector('[data-bouton="ecrire-style"]')).toBeNull();
    expect(hote.querySelector('[data-bouton="autre-direction"]')).not.toBeNull();
    expect(hote.querySelector('[data-zone="propositions-brief"]')).not.toBeNull();

    // écrire le style → proposition manuelle sur /brief/styleIntent
    await saisir(hote.querySelector('[data-champ="style-libre"]'), 'Lumière douce, été');
    await clic(hote.querySelector('[data-bouton="vers-format"]'));
    await flush();
    expect((h.manuel.at(-1) as { changes: Array<{ path: string }> }).changes[0]!.path).toBe('/brief/styleIntent');

    // création reste « bientôt », non navigable, sans contrôle (format est câblé au Lot 2c)
    const liCreation = hote.querySelector('[data-rail-etape="creation"]');
    expect(liCreation!.getAttribute('data-bientot')).toBeNull();
    expect(liCreation!.querySelector('button, input, select, textarea, a')).toBeNull();
    expect(hote.querySelector('[data-zone="bientot-note"]')).toBeNull();
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
  await clic(hote.querySelector('[data-bouton="retour-brief"]'));
  expect((hote.querySelector('[data-champ="produit"] option[value=""]') as HTMLOptionElement).disabled).toBe(true);
  await fermer();
});

it('retour brief sans changement : aucune proposition, aucune version ni deuxième projet', async () => {
  const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'image', titre: 'Image', intention: 'Présenter le produit' }} personas={[]} />);
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="retour-brief"]'));
  expect((hote.querySelector('[data-champ="titre"]') as HTMLInputElement).disabled).toBe(true);
  expect((hote.querySelector('[data-champ="intention"]') as HTMLTextAreaElement).value).toBe('Vendre les lunettes aux parents');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(h.manuel).toHaveLength(0);
  expect(h.appliquer).toHaveLength(0);
  expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  await fermer();
});

it.each([false, true])('retour brief modifié : cycle manuel borné, refusApplication=%s', async (refuser) => {
  h.refuserApplication = refuser;
  const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'image', titre: 'Image', intention: 'Présenter le produit' }} personas={[]} />);
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="retour-brief"]'));
  await saisir(hote.querySelector('[data-champ="audience"]'), 'Familles');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(h.manuel).toHaveLength(1);
  expect(h.manuel[0]).toMatchObject({ projectId: 'proj-1', baseVersionId: 'v1', cible: 'brief', allowedPaths: ['/brief'], changes: [{ op: 'replace', path: '/brief', newValue: { audience: 'Familles', objective: 'Vendre les lunettes aux parents' } }] });
  expect(h.appliquer[0]).toMatchObject({ projectId: 'proj-1', baseVersionId: 'v1', proposalId: 'prop-1' });
  if (refuser) {
    expect(hote.querySelector('[data-zone="assistant-brief"]')).not.toBeNull();
    expect(hote.textContent).toContain('Version modifiée ailleurs');
  } else expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  await fermer();
});

it('source refusée après création : rester brief puis réessayer sans recréer le projet', async () => {
  departSpy.lire.mockResolvedValue({ ok: true, depart: { origine: 'veille', id: 's1', titre: 'Référence test', intention: '', sources: [{ type: 'sauvegarde', id: 's1' }], testId: null } });
  departSpy.ajouter.mockResolvedValueOnce({ ok: false, message: 'Source indisponible' }).mockResolvedValueOnce({ ok: true });
  const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'image', titre: 'Projet', intention: 'Montrer un produit' }} personas={[]} />);
  await clic([...hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Depuis la Veille'))!);
  expect(h.creer).toHaveLength(0);
  await clic([...hote.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.includes('Référence test'))!);
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(hote.textContent).toContain('Source indisponible');
  expect(hote.querySelector('[data-zone="assistant-projet"]')?.getAttribute('data-etape')).toBe('brief');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(departSpy.ajouter).toHaveBeenLastCalledWith({ projectId: 'proj-1', sources: [{ type: 'sauvegarde', id: 's1' }] });
  expect(hote.querySelector('[data-zone="assistant-projet"]')?.getAttribute('data-etape')).toBe('strategie');
  await fermer();
});

it('un verdict devenu inéligible bloque Continuer avant toute création', async () => {
  departSpy.lire.mockResolvedValueOnce({ ok: true, depart: { origine: 'iteration', id: 's1', titre: 'Test réel', intention: 'Reprendre un apprentissage validé', sources: [], testId: 's1' } }).mockResolvedValueOnce({ ok: false, message: 'Verdict modifié' });
  const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'image', titre: 'Projet', intention: 'Montrer un produit' }} personas={[]} />);
  await clic([...hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Itérer sur un test'))!);
  await clic([...hote.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.includes('Référence test'))!);
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(0);
  expect(hote.textContent).toContain('Verdict modifié');
  await fermer();
});


it('retour direction : conserve les textes ajoutés depuis la dernière lecture', async () => {
  const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'ads', titre: 'Projet · Neva', intention: '' }} personas={[]} />);
  await allerStrategie(hote);
  h.detailBrief = { ...h.detailBrief!, texts: ['Texte retenu entre les étapes'] };
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="cta-libre"]'), 'Découvrir');
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  expect(h.manuel.at(-1)).toMatchObject({ changes: [expect.objectContaining({ path: '/brief/texts', newValue: expect.arrayContaining(['Texte retenu entre les étapes']) })] });
  await fermer();
});

it('lecture du brief indisponible : reste à la stratégie sans édition périmée', async () => {
  const { hote, fermer } = await monter(<AssistantProjet etat={etatPret} initial={{ type: 'ads', titre: 'Projet · Neva', intention: '' }} personas={[]} />);
  await allerStrategie(hote);
  h.detailBrief = null;
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  expect(hote.querySelector('[data-zone="assistant-direction"]')).toBeNull();
  expect(h.manuel).toHaveLength(0);
  await fermer();
});

it.each(['normal', 'perimee', 'lecture', 'occupe'] as const)('cartes stratégie : changements entiers et garde %s', async (mode) => {
  const proposition = { ...propProposed, perimee: mode === 'perimee', changements: [...propProposed.changements,
    { op: 'replace', chemin: '/brief/concept', libelle: 'Concept', avant: 'Ancien concept', apres: 'Concept réellement proposé', raison: 'Lien avec l’angle' }] };
  const adopter = vi.fn(async () => {});
  const onApplied = vi.fn();
  const cycle: CyclePropositionsBrief = {
    liste: { ok: true, projectId: 'proj-1', versionCourante: { id: 'v1', n: 1 }, propositions: [proposition], jarvis: { disponible: true, mentionCout: 'Appel payant · 0,13 $ maximum' }, peutProposer: mode !== 'lecture', cibles: [] } as never,
    version: { id: 'v1', n: 1 }, occupe: mode === 'occupe' ? 'autre-proposition' : null, retour: null,
    recharger: async () => {}, demanderJarvis: async () => {}, adopter, rejeter: async () => {}, ecrireManuel: async () => {},
  };
  const brief = { objective: 'o', audience: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] } as unknown as BriefCanonique;
  const { hote, fermer } = await monter(<EtapeStrategie brief={brief} cycle={cycle} onApplied={onApplied} sources={[]} marqueId="b1" />);
  const carte = hote.querySelector('[data-proposition="prop-1"]')!;
  expect(hote.querySelectorAll('[data-proposition="prop-1"]')).toHaveLength(1);
  expect(carte.querySelector('h3')?.textContent).toBe('Le premier plongeon');
  expect(carte.textContent).toContain('Ancien concept');
  expect(carte.textContent).toContain('Concept réellement proposé');
  expect(carte.textContent).toContain('Avant');
  expect(carte.textContent).toContain('Après');
  expect(carte.querySelector('img')).toBeNull();
  expect(hote.textContent).not.toContain('Aucune proposition à trancher');
  expect(hote.querySelector('details[aria-label="Écrire mon angle"]')?.hasAttribute('open')).toBe(false);
  const bouton = [...carte.querySelectorAll('button')].find((b) => b.textContent?.includes('Appliquer'))!;
  expect(bouton.disabled).toBe(mode !== 'normal');
  await clic(bouton);
  if (mode === 'normal') expect(adopter).toHaveBeenCalledWith(proposition, onApplied);
  else expect(adopter).not.toHaveBeenCalled();
  expect(hote.textContent).toContain('Appel payant · 0,13 $ maximum');
  await fermer();
});

it.each([false,true])('quitter le brief par le rail sauvegarde avant navigation ; conflit=%s',async(refus)=>{
  const {hote,fermer}=await monter(<AssistantProjet etat={etatPret} initial={{type:'ads',titre:'Neva',intention:'Présenter les lunettes'}} personas={[]}/>);
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="retour-brief"]'));
  await saisir(hote.querySelector('[data-champ="intention"]'),'Nouvelle intention conservée');
  h.refuserApplication=refus;
  await clic(hote.querySelector('[data-rail-etape="direction"] button'));
  expect(h.manuel).toHaveLength(1);
  expect(JSON.stringify(h.manuel[0])).toContain('Nouvelle intention conservée');
  expect(hote.querySelector('[data-zone="assistant-projet"]')?.getAttribute('data-etape')).toBe(refus?'brief':'direction');
  if(refus)expect(hote.querySelector('[role="alert"]')?.textContent).toContain('Version modifiée');
  expect(h.creer).toHaveLength(1);
  await fermer();
});


describe('sections de validation sans proposition', () => {
  it.each(['strategie', 'direction'] as const)('%s masque le bloc vide mais conserve les erreurs et les indisponibilités', async (etape) => {
    const brief = { objective: 'o', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] } as BriefCanonique;
    const cycle: CyclePropositionsBrief = {
      liste: { ok: true, projectId: 'p', versionCourante: { id: 'v1', n: 1 }, propositions: [], jarvis: { disponible: false, raison: 'Suggestions temporairement indisponibles' }, peutProposer: true, cibles: [] } as never,
      version: { id: 'v1', n: 1 }, occupe: null, retour: {type:'err',message:'Enregistrement refusé'},
      recharger: async()=>{}, demanderJarvis: async()=>{}, adopter: async()=>{}, rejeter: async()=>{}, ecrireManuel: async()=>{},
    };
    const node = () => etape === 'strategie'
      ? <EtapeStrategie brief={brief} cycle={cycle} onApplied={()=>{}} sources={[]} marqueId="b1" />
      : <EtapeDirection brief={brief} cycle={cycle} onApplied={()=>{}} />;
    const {hote,fermer} = await monter(node());
    expect(hote.querySelector('[aria-label="Propositions à trancher"], [aria-label="Valider la direction"]')).toBeNull();
    expect(hote.querySelector('[data-etat="aucune-proposition"]')).toBeNull();
    expect(hote.querySelector('[role="alert"]')?.textContent).toBe('Enregistrement refusé');
    expect(hote.textContent).toContain('Suggestions temporairement indisponibles');
    await fermer();
    cycle.liste = {ok:false,message:'Lecture refusée'} as never;
    const renduErreur = await monter(node());
    expect(renduErreur.hote.textContent).toContain('Lecture refusée');
    await renduErreur.fermer();
  });
});


it.each(['continuer','quitter','rail'] as const)('direction modifiée : %s enregistre une seule proposition manuelle complète avant navigation',async(sortie)=>{
 const fermer=vi.fn();h.persisterDirection=true;
 const rendu=await monter(<AssistantProjet etat={etatPret} initial={{type:'ads',titre:'Projet',intention:''}} personas={[]} onFermer={fermer}/>);
 await allerStrategie(rendu.hote);await clic(rendu.hote.querySelector('[data-bouton="vers-direction"]'));
 await saisir(rendu.hote.querySelector('[data-champ="concept-libre"]'),'Un nouveau concept');
 await saisir(rendu.hote.querySelector('[data-champ="style-libre"]'),'Lumière douce');
 await saisir(rendu.hote.querySelector('[data-champ="accroche-libre"]'),'Découvrez notre produit');
 await saisir(rendu.hote.querySelector('[data-champ="cta-libre"]'),'Découvrir');
 if(sortie==='continuer') await clic(rendu.hote.querySelector('[data-bouton="vers-format"]'));
 else if(sortie==='rail') await clic(rendu.hote.querySelector('[data-rail-etape="brief"] button'));
 else await clic([...rendu.hote.querySelectorAll('button')].find(b=>b.textContent==='Enregistrer et quitter')!);
 expect(h.propBrief).toHaveLength(0);expect(h.manuel).toHaveLength(1);expect(h.appliquer).toHaveLength(1);
 const changes=(h.manuel[0] as {changes:{path:string;newValue:unknown}[]}).changes;
 expect(changes.map(c=>c.path)).toEqual(['/brief/concept','/brief/styleIntent','/brief/texts']);
 expect(JSON.stringify(changes)).toContain('Découvrez notre produit');expect(JSON.stringify(changes)).toContain('Découvrir');
 expect(h.detailBrief?.concept).toBe('Un nouveau concept');expect(h.detailBrief?.styleIntent).toBe('Lumière douce');
 if(sortie==='quitter')expect(fermer).toHaveBeenCalledTimes(1);
 else expect(rendu.hote.querySelector('[data-zone="assistant-projet"]')?.getAttribute('data-etape')).toBe(sortie==='rail'?'brief':'format');
 await rendu.fermer();
});
it.each(['continuer','quitter'] as const)('direction refusée : %s conserve la saisie et ne quitte pas',async(sortie)=>{
 const fermer=vi.fn();h.refuserApplication=true;
 const rendu=await monter(<AssistantProjet etat={etatPret} initial={{type:'ads',titre:'Projet',intention:''}} personas={[]} onFermer={fermer}/>);
 await allerStrategie(rendu.hote);await clic(rendu.hote.querySelector('[data-bouton="vers-direction"]'));
 await saisir(rendu.hote.querySelector('[data-champ="concept-libre"]'),'À conserver');
 await clic(sortie==='continuer'?rendu.hote.querySelector('[data-bouton="vers-format"]'):[...rendu.hote.querySelectorAll('button')].find(b=>b.textContent==='Enregistrer et quitter')!);
 expect(fermer).not.toHaveBeenCalled();expect(rendu.hote.querySelector('[data-zone="assistant-direction"]')).not.toBeNull();
 expect((rendu.hote.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('À conserver');
 expect(rendu.hote.textContent).toContain('Version modifiée ailleurs');await rendu.fermer();
});

it.each(['droits','reseau'] as const)('direction : %s bloque la navigation et ne relance pas une application incertaine',async(mode)=>{
 h.droitProposer=mode!=='droits';h.jeterApplication=mode==='reseau';const fermer=vi.fn();
 const rendu=await monter(<AssistantProjet etat={etatPret} initial={{type:'ads',titre:'Projet',intention:''}} personas={[]} onFermer={fermer}/>);
 await allerStrategie(rendu.hote);await clic(rendu.hote.querySelector('[data-bouton="vers-direction"]'));
 await saisir(rendu.hote.querySelector('[data-champ="concept-libre"]'),'Conserver mon concept');
 await clic(rendu.hote.querySelector('[data-bouton="vers-format"]'));await clic(rendu.hote.querySelector('[data-bouton="vers-format"]'));
 expect(rendu.hote.querySelector('[data-zone="assistant-direction"]')).not.toBeNull();expect(fermer).not.toHaveBeenCalled();
 expect(h.manuel).toHaveLength(mode==='droits'?0:1);expect(h.appliquer).toHaveLength(mode==='droits'?0:1);
 expect((rendu.hote.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('Conserver mon concept');
 await rendu.fermer();
});

it.each(['croix','echap'] as const)('fermeture %s : conserve direction modifiée jusqu’à annulation explicite',async(mode)=>{
 HTMLDialogElement.prototype.showModal=vi.fn();HTMLDialogElement.prototype.close=vi.fn();
 const rendu=await monter(<PageAssistant etat={etatPret} initial={{type:'ads',titre:'Projet',intention:''}} personas={[]}/>);
 await allerStrategie(document.body);await clic(document.querySelector('[data-bouton="vers-direction"]'));
 await saisir(document.querySelector('[data-champ="concept-libre"]'),'Mon concept en cours');
 const quitter=async()=>{if(mode==='croix')await clic(document.querySelector('button[aria-label="Fermer"]'));else await act(async()=>{document.querySelector('dialog')!.dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true}));});};
 await quitter();expect(h.navigation).toHaveLength(0);expect(document.body.textContent).toContain('annule tes modifications avant de fermer');
 expect((document.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('Mon concept en cours');expect(h.manuel).toHaveLength(0);
 await clic([...document.querySelectorAll('button')].find(b=>b.textContent==='Annuler mes modifications')!);
 await quitter();expect(h.navigation).toEqual(['/studio/projets']);expect(h.appliquer).toHaveLength(0);await rendu.fermer();
});
