// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { EtatNouveauProjet, BriefCanonique } from '@tiktrends/core';
import type { CyclePropositionsBrief } from '../lib/studios/propositions/use-propositions-brief';

/**
 * Spatial · « Nouveau projet » · le PARCOURS de l'assistant après création
 * (stratégie, style, retours au brief, réponses perdues), au RÉSULTAT.
 * Gardes PORTÉES de l'assistant V5 retiré (ex-`assistant2b-rendu`) sur la vue
 * Spatial, mêmes scénarios, mêmes appels attendus :
 *  · après la création, la stratégie rend ses vrais contrôles ; une
 *    proposition relue s'adopte PAR UN GESTE, la rejetée n'a pas de bouton ;
 *  · un retour au brief ne réécrit QUE les champs changés (proposition
 *    manuelle bornée au brief), sans recréer le projet ; un refus garde le brief ;
 *  · une source ou un verdict refusés bloquent sans recréer ni inventer ;
 *  · la direction s'enregistre en UNE proposition complète avant toute
 *    navigation ; refusée ou incertaine, la saisie reste et rien n'est rejoué.
 *
 * Écart assumé avec la V5 : l'assistant n'est plus une fenêtre (croix, Échap)
 * mais un écran · « Enregistrer et quitter » ouvre le projet.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const departSpy = vi.hoisted(() => ({ lire: vi.fn(), ajouter: vi.fn() }));
vi.mock('../app/actions/studios/departs-assistant', () => ({ lireDepartAssistant: departSpy.lire, listerDepartsAssistant: async () => ({ ok: true, choix: [{ id: 's1', titre: 'Référence test', detail: '', apercu: null }] }) }));
const epinglerSpy = vi.hoisted(() => vi.fn());
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: epinglerSpy, lireProduitProjet: vi.fn(), importerPhotoProduit: vi.fn(), associerReference: vi.fn(), retirerReference: vi.fn(), trancherComposants: vi.fn() }));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({ lireParcoursImage: vi.fn(async () => ({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'coupée', targetIds: ['generation_image'] })), compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), demanderDevisImage: vi.fn(), approuverEtLancerImage: vi.fn() }));
vi.mock('../app/actions/studios/lot-formats', () => ({ preparerLotFormats: vi.fn() }));
vi.mock('../app/actions/studios/lot-images', () => ({ preparerLotImages: vi.fn(), approuverLotImages: vi.fn() }));
vi.mock('../app/actions/studios/variantes', () => ({ listerVariantes: vi.fn(), creerVariante: vi.fn() }));

const h = vi.hoisted(() => ({
  lectureRefusee: false, refuserLectureApresApplication: false, inspectEtat: 'approved', inspections: [] as unknown[], jeterCreation: false, navigation: [] as string[], refuserApplication: false, persisterDirection: false, jeterApplication: false, droitProposer: true,
  creer: [] as unknown[], propBrief: [] as unknown[], manuel: [] as unknown[], appliquer: [] as unknown[],
  rejeter: [] as unknown[], hypotheses: [] as unknown[], detailBrief: null as BriefCanonique | null,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/nouveau', useRouter: () => ({ push: (path: string) => { h.navigation.push(path); }, refresh: () => {}, replace: () => {} }) }));
vi.mock('../app/actions/studios/projets', () => ({
  creerProjet: async (e: unknown) => { h.creer.push(e); h.detailBrief = (e as { contenu: { brief: BriefCanonique } }).contenu.brief; return { ok: true, projet: { id: 'proj-1' }, version: { id: 'v1', n: 1 } }; },
}));
vi.mock('../app/actions/studios/sources', () => ({
  ajouterSourcesAuProjet: departSpy.ajouter,
  lireProjetDetail: async () => (h.lectureRefusee ? { ok: false, message: 'Relecture indisponible' } : ({ ok: true, detail: { brief: h.detailBrief, briefIllisible: false, version: { id: 'v1', n: 1 }, sources: [] } })),
  preparerCreation: async () => ({ ok: true, ia: { disponible: true, raison: null, plafondUsd: 0.13 } }),
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
  inspecterProposition: async (e: unknown) => { h.inspections.push(e); return { ok: true, proposition: { ...propProposed, etat: h.inspectEtat, versionAppliquee: h.inspectEtat === 'approved' ? { id: 'v2', n: 2 } : null }, versionCourante: { id: 'v2', n: 2 } }; },
  listerPropositions: async () => ({
    ok: true, projectId: 'proj-1', versionCourante: { id: 'v1', n: 1 }, propositions: [propProposed, propRejected],
    jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.13, mentionCout: 'Appel texte payant · 0,13 $ au plus' },
    peutProposer: h.droitProposer, cibles: [],
  }),
  proposerBrief: async (e: unknown) => { h.propBrief.push(e); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: propProposed, runId: 'r' }; },
  creerPropositionManuelle: async (e: unknown) => { h.manuel.push(e); if (h.jeterCreation) throw new Error('création interrompue'); return { ok: true, statut: 'proposee', projectId: 'proj-1', proposition: propProposed, runId: null }; },
  appliquerProposition: async (e: unknown) => {
    h.appliquer.push(e);
    if (h.jeterApplication) throw new Error('réseau');
    if (h.refuserApplication) return { ok: false, message: 'Version modifiée ailleurs', traceId: 'conflit' };
    if (h.refuserLectureApresApplication) h.lectureRefusee = true;
    // Une NOUVELLE version du brief côté serveur (jamais l'objet que l'écran tient déjà) · seule une relecture la montre.
    if (h.persisterDirection && h.detailBrief) h.detailBrief = { ...h.detailBrief, ...Object.fromEntries((h.manuel.at(-1) as { changes: { path: string; newValue: unknown }[] }).changes.map((ch) => [ch.path.replace('/brief/', ''), ch.newValue])) };
    return { ok: true, projectId: 'proj-1', proposition: propProposed, version: { id: 'v2', n: 2 }, deja: false };
  },
  rejeterProposition: async (e: unknown) => { h.rejeter.push(e); return { ok: true, projectId: 'proj-1', proposition: propRejected }; },
}));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { NouveauProjet } = await import('../spatial/vues/studios/NouveauProjet');
const { Strategie } = await import('../spatial/vues/studios/assistant/Strategie');
const { Direction } = await import('../spatial/vues/studios/assistant/Direction');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
type Props = Parameters<typeof NouveauProjet>[0];
const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 200, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const etatPret: EtatNouveauProjet = { etat: 'pret', marque: { id: 'b1', nom: 'Neva' }, libelle: 'Nouveau projet' };
const assistant = (o: { type?: Props['initial']['type']; titre?: string; intention?: string; produits?: Props['produits'] } = {}) => (
  <NouveauProjet sous="Studios · Neva" etat={etatPret} marques={[{ id: 'b1', nom: 'Neva', active: true }]} ajouterMarque={null}
    initial={{ type: o.type ?? 'ads', titre: o.titre ?? 'Projet · Neva', intention: o.intention ?? '', etape: 'start' }}
    titresParDefaut={{ ads: 'Projet · Neva', image: 'Image', video: 'Vidéo', text: 'Textes' }} personas={[]} produits={o.produits ?? []}
    contexte={{ depart: null, references: [], notes: [], repris: [], retourVeille: null }} />
);

async function monter(node: ReactNode) {
  const el = document.createElement('div'); document.body.appendChild(el);
  const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
  const racine = createRoot(el);
  await act(async () => { racine.render(<FournisseurSpatial value={CTX}>{node}</FournisseurSpatial>); });
  await flush();
  return { hote: document.body, fermer: async () => { await act(async () => { racine.unmount(); }); } };
}
const flush = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const clic = async (el: Element | null | undefined) => { expect(el).toBeTruthy(); await act(async () => { (el as HTMLElement).click(); await Promise.resolve(); }); await flush(); };
const saisir = async (el: Element | null, valeur: string) => {
  expect(el).not.toBeNull();
  const champ = el as HTMLInputElement | HTMLTextAreaElement;
  const proto = champ instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(champ, valeur);
  await act(async () => { champ.dispatchEvent(new Event('input', { bubbles: true })); });
};
const choisir = async (el: Element | null, valeur: string) => { const s = el as HTMLSelectElement; await act(async () => { s.value = valeur; s.dispatchEvent(new Event('change', { bubbles: true })); }); };
const etape = () => document.querySelector('nav.steps')?.getAttribute('data-etape');
const quitter = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer et quitter')!;

beforeEach(() => { h.lectureRefusee = false; h.refuserLectureApresApplication = false; h.inspectEtat = 'approved'; h.inspections = []; h.jeterCreation = false; h.navigation = []; h.refuserApplication = false; h.persisterDirection = false; h.jeterApplication = false; h.droitProposer = true; h.creer = []; h.propBrief = []; h.manuel = []; h.appliquer = []; h.rejeter = []; h.hypotheses = []; h.detailBrief = null; departSpy.lire.mockReset(); departSpy.ajouter.mockReset(); epinglerSpy.mockReset(); window.sessionStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

async function allerStrategie(hote: ParentNode) {
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  await saisir(hote.querySelector('[data-champ="intention"]'), 'Vendre les lunettes aux parents');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
}

describe('création puis étape STRATÉGIE câblée', () => {
  it('après la création, l’étape stratégie rend ses vrais contrôles', async () => {
    const { hote, fermer } = await monter(assistant());
    expect(h.creer).toHaveLength(0);
    await allerStrategie(hote);
    expect(h.creer).toHaveLength(1);
    expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
    for (const s of ['[data-champ="chaine"]', '[data-champ="angle-libre"]', '[data-bouton="ecrire-angle"]', '[data-bouton="proposer-angles"]']) expect(hote.querySelector(s), s).not.toBeNull();
    expect(hote.querySelector('[data-champ="hypotheses"] [data-etat="sans-source"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="proposer-hypotheses"]')).toBeNull();
    await fermer();
  });

  it('une proposition relue s’adopte PAR UN GESTE · la rejetée n’a pas de bouton', async () => {
    const { hote, fermer } = await monter(assistant());
    await allerStrategie(hote);
    const proposee = hote.querySelector('[data-proposition="prop-1"]');
    expect(proposee).not.toBeNull();
    expect(hote.querySelector('[data-proposition="prop-2"]')?.querySelector('button') ?? null).toBeNull();
    await clic([...proposee!.querySelectorAll('button')].find((b) => b.textContent?.includes('Appliquer')));
    expect(h.appliquer).toEqual([{ proposalId: 'prop-1', projectId: 'proj-1', baseVersionId: 'v1' }]);
    await fermer();
  });

  it('« Enregistrer mon angle » crée une proposition manuelle bornée au brief ; « Proposer d’autres angles » appelle Jarvis', async () => {
    const { hote, fermer } = await monter(assistant());
    await allerStrategie(hote);
    await saisir(hote.querySelector('[data-champ="angle-libre"]'), 'Le premier plongeon');
    await clic(hote.querySelector('[data-bouton="ecrire-angle"]'));
    expect(h.manuel).toHaveLength(1);
    expect(h.manuel[0]).toMatchObject({ projectId: 'proj-1', cible: 'brief' });
    expect((h.manuel[0] as { changes: Array<{ path: string }> }).changes[0]!.path).toBe('/brief/angle');
    await clic(hote.querySelector('[data-bouton="proposer-angles"]'));
    expect(h.propBrief).toHaveLength(1);
    expect(h.propBrief[0]).toMatchObject({ projectId: 'proj-1' });
    await fermer();
  });

  it('« Continuer vers le style » rend la direction, et « Valider la direction » écrit l’intention de style', async () => {
    const { hote, fermer } = await monter(assistant());
    await allerStrategie(hote);
    await clic(hote.querySelector('[data-bouton="vers-direction"]'));
    expect(hote.querySelector('[data-zone="assistant-direction"]')).not.toBeNull();
    expect(hote.querySelector('[data-champ="style-libre"]')).not.toBeNull();
    expect(hote.querySelector('[data-bouton="ecrire-style"]')).toBeNull();
    expect(hote.querySelector('[data-bouton="autre-direction"]')).not.toBeNull();
    expect(hote.querySelector('[data-zone="propositions-brief"]')).not.toBeNull();
    await saisir(hote.querySelector('[data-champ="style-libre"]'), 'Lumière douce, été');
    await clic(hote.querySelector('[data-bouton="vers-format"]'));
    expect((h.manuel.at(-1) as { changes: Array<{ path: string }> }).changes[0]!.path).toBe('/brief/styleIntent');
    await fermer();
  });
});

describe('stratégie · suggestions d’hypothèses avec des sources', () => {
  it('le bouton appelle proposerHypotheses et « Retenir » écrit via une proposition relue', async () => {
    const appels = { manuel: [] as unknown[] };
    const cycle: CyclePropositionsBrief = {
      liste: { ok: true, projectId: 'proj-1', versionCourante: { id: 'v1', n: 1 }, propositions: [], jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.13, mentionCout: 'Appel texte payant' }, peutProposer: true, cibles: [] } as never,
      version: { id: 'v1', n: 1 }, occupe: null, retour: null,
      recharger: async () => {}, demanderJarvis: async () => {}, adopter: async () => {}, rejeter: async () => {}, ecrireManuel: async (ch) => { appels.manuel.push(ch); },
    };
    const brief = { objective: 'o', audience: 'a', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] } as BriefCanonique;
    const { hote, fermer } = await monter(<Strategie projectId="proj-1" brief={brief} cycle={cycle} onApplied={() => {}} sources={['ref-1']} marqueId="b1" />);
    expect(hote.querySelector('[data-etat="sans-source"]')).toBeNull();
    await clic(hote.querySelector('[data-bouton="proposer-hypotheses"]'));
    expect(h.hypotheses).toHaveLength(1);
    expect(h.hypotheses[0]).toMatchObject({ sources: ['ref-1'], brandId: 'b1' });
    await clic(hote.querySelector('[data-hypothese="hyp_1"] [data-bouton="retenir-hypothese"]'));
    expect(appels.manuel).toHaveLength(1);
    expect((appels.manuel[0] as { path: string }).path).toBe('/brief');
    await fermer();
  });

  it.each(['normal', 'perimee', 'lecture', 'occupe'] as const)('cartes d’angle : changements entiers et garde %s', async (mode) => {
    const proposition = { ...propProposed, perimee: mode === 'perimee', changements: [...propProposed.changements, { op: 'replace', chemin: '/brief/concept', libelle: 'Concept', avant: 'Ancien concept', apres: 'Concept réellement proposé', raison: 'Lien avec l’angle' }] };
    const adopter = vi.fn(async () => {});
    const onApplied = vi.fn();
    const cycle: CyclePropositionsBrief = {
      liste: { ok: true, projectId: 'proj-1', versionCourante: { id: 'v1', n: 1 }, propositions: [proposition], jarvis: { disponible: true, mentionCout: 'Appel payant · 0,13 $ maximum' }, peutProposer: mode !== 'lecture', cibles: [] } as never,
      version: { id: 'v1', n: 1 }, occupe: mode === 'occupe' ? 'autre-proposition' : null, retour: null,
      recharger: async () => {}, demanderJarvis: async () => {}, adopter, rejeter: async () => {}, ecrireManuel: async () => {},
    };
    const brief = { objective: 'o', audience: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] } as unknown as BriefCanonique;
    const { hote, fermer } = await monter(<Strategie projectId="proj-1" brief={brief} cycle={cycle} onApplied={onApplied} sources={[]} marqueId="b1" />);
    expect(hote.querySelectorAll('[data-proposition="prop-1"]')).toHaveLength(1);
    const carte = hote.querySelector('[data-proposition="prop-1"]')!;
    expect(carte.querySelector('strong')?.textContent).toBe('Le premier plongeon');
    for (const t of ['Ancien concept', 'Concept réellement proposé', 'Avant', 'Après']) expect(carte.textContent).toContain(t);
    expect(carte.querySelector('img')).toBeNull();
    const bouton = [...carte.querySelectorAll('button')].find((b) => b.textContent?.includes('Appliquer'))!;
    expect(bouton.disabled).toBe(mode !== 'normal');
    await clic(bouton);
    if (mode === 'normal') expect(adopter).toHaveBeenCalledWith(proposition, onApplied);
    else expect(adopter).not.toHaveBeenCalled();
    expect(hote.textContent).toContain('Appel payant · 0,13 $ maximum');
    await fermer();
  });

  it.each(['strategie', 'direction'] as const)('%s garde les erreurs et les indisponibilités visibles', async (quelle) => {
    const brief = { objective: 'o', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] } as BriefCanonique;
    const cycle: CyclePropositionsBrief = {
      liste: { ok: true, projectId: 'p', versionCourante: { id: 'v1', n: 1 }, propositions: [], jarvis: { disponible: false, raison: 'Suggestions temporairement indisponibles' }, peutProposer: true, cibles: [] } as never,
      version: { id: 'v1', n: 1 }, occupe: null, retour: { type: 'err', message: 'Enregistrement refusé' },
      recharger: async () => {}, demanderJarvis: async () => {}, adopter: async () => {}, rejeter: async () => {}, ecrireManuel: async () => {},
    };
    const node = () => (quelle === 'strategie' ? <Strategie projectId="p" brief={brief} cycle={cycle} onApplied={() => {}} sources={[]} marqueId="b1" /> : <Direction brief={brief} cycle={cycle} onApplied={() => {}} />);
    const a = await monter(node());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Enregistrement refusé');
    expect(document.body.textContent).toContain('Suggestions temporairement indisponibles');
    await a.fermer(); document.body.innerHTML = '';
    cycle.liste = { ok: false, message: 'Lecture refusée' } as never;
    const b = await monter(node());
    expect(document.body.textContent).toContain('Lecture refusée');
    await b.fermer();
  });
});

it('choisit explicitement la photo et ne recrée pas le projet après un refus d’épinglage', async () => {
  epinglerSpy.mockResolvedValueOnce({ ok: false, message: 'Photo indisponible', traceId: 't1' }).mockResolvedValueOnce({ ok: true, version: { id: 'v2', n: 2 } });
  const { hote, fermer } = await monter(assistant({ type: 'image', titre: 'Image produit', intention: 'Présenter le produit', produits: [{ id: 'prod1', nom: 'Nigella', photos: [{ assetId: 'photo1', apercu: '/photo-test.png', position: 1 }] }] }));
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  expect((hote.querySelector('[data-champ="produit"]') as HTMLSelectElement).value).toBe('');
  await choisir(hote.querySelector('[data-champ="produit"]'), 'prod1');
  expect((hote.querySelector('[data-champ="photo-produit"]') as HTMLSelectElement).value).toBe('');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(0);
  await choisir(hote.querySelector('[data-champ="photo-produit"]'), 'photo1');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(hote.textContent).toContain('Photo indisponible');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(epinglerSpy).toHaveBeenLastCalledWith({ projectId: 'proj-1', baseVersionId: 'v1', productId: 'prod1', photoId: 'photo1' });
  expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  await clic(hote.querySelector('[data-bouton="retour"]'));
  expect((hote.querySelector('[data-champ="produit"] option[value=""]') as HTMLOptionElement).disabled).toBe(true);
  await fermer();
});

it('retour au brief sans changement : aucune proposition, aucune version ni deuxième projet', async () => {
  const { hote, fermer } = await monter(assistant({ type: 'image', titre: 'Image', intention: 'Présenter le produit' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="retour"]'));
  expect((hote.querySelector('[data-champ="titre"]') as HTMLInputElement).disabled).toBe(true);
  expect((hote.querySelector('[data-champ="intention"]') as HTMLTextAreaElement).value).toBe('Vendre les lunettes aux parents');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1); expect(h.manuel).toHaveLength(0); expect(h.appliquer).toHaveLength(0);
  expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  await fermer();
});

it.each([false, true])('retour au brief modifié : cycle manuel borné, refus d’application=%s', async (refuser) => {
  h.refuserApplication = refuser;
  const { hote, fermer } = await monter(assistant({ type: 'image', titre: 'Image', intention: 'Présenter le produit' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="retour"]'));
  await saisir(hote.querySelector('[data-champ="audience"]'), 'Familles');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1); expect(h.manuel).toHaveLength(1);
  expect(h.manuel[0]).toMatchObject({ projectId: 'proj-1', baseVersionId: 'v1', cible: 'brief', allowedPaths: ['/brief'], changes: [{ op: 'replace', path: '/brief', newValue: { audience: 'Familles', objective: 'Vendre les lunettes aux parents' } }] });
  expect(h.appliquer[0]).toMatchObject({ projectId: 'proj-1', baseVersionId: 'v1', proposalId: 'prop-1' });
  if (refuser) { expect(hote.querySelector('[data-zone="assistant-brief"]')).not.toBeNull(); expect(hote.textContent).toContain('Version modifiée ailleurs'); }
  else expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  await fermer();
});

it('source refusée après création : rester au brief puis réessayer sans recréer le projet', async () => {
  departSpy.lire.mockResolvedValue({ ok: true, depart: { origine: 'veille', id: 's1', titre: 'Référence test', intention: '', sources: [{ type: 'sauvegarde', id: 's1' }], testId: null } });
  departSpy.ajouter.mockResolvedValueOnce({ ok: false, message: 'Source indisponible' }).mockResolvedValueOnce({ ok: true });
  const { hote, fermer } = await monter(assistant({ type: 'image', titre: 'Projet', intention: 'Montrer un produit' }));
  await clic(hote.querySelector('[data-wfrom="veille"]'));
  expect(h.creer).toHaveLength(0);
  await clic([...hote.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.includes('Référence test')));
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(hote.textContent).toContain('Source indisponible');
  expect(etape()).toBe('brief');
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(1);
  expect(departSpy.ajouter).toHaveBeenLastCalledWith({ projectId: 'proj-1', sources: [{ type: 'sauvegarde', id: 's1' }] });
  expect(etape()).toBe('strategie');
  await fermer();
});

it('un verdict devenu inéligible bloque « Continuer » avant toute création', async () => {
  departSpy.lire.mockResolvedValueOnce({ ok: true, depart: { origine: 'iteration', id: 's1', titre: 'Test réel', intention: 'Reprendre un apprentissage validé', sources: [], testId: 's1' } }).mockResolvedValueOnce({ ok: false, message: 'Verdict modifié' });
  const { hote, fermer } = await monter(assistant({ type: 'image', titre: 'Projet', intention: 'Montrer un produit' }));
  await clic(hote.querySelector('[data-wfrom="test"]'));
  await clic([...hote.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent?.includes('Référence test')));
  await clic(hote.querySelector('[data-bouton="vers-brief"]'));
  await clic(hote.querySelector('[data-bouton="creer-projet"]'));
  expect(h.creer).toHaveLength(0);
  expect(hote.textContent).toContain('Verdict modifié');
  await fermer();
});

it('retour au style : conserve les textes ajoutés depuis la dernière lecture', async () => {
  const { hote, fermer } = await monter(assistant());
  await allerStrategie(hote);
  h.detailBrief = { ...h.detailBrief!, texts: ['Texte retenu entre les étapes'] };
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="cta-libre"]'), 'Découvrir');
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  expect(h.manuel.at(-1)).toMatchObject({ changes: [expect.objectContaining({ path: '/brief/texts', newValue: expect.arrayContaining(['Texte retenu entre les étapes']) })] });
  await fermer();
});

it('lecture du brief indisponible : reste à la stratégie sans édition périmée', async () => {
  const { hote, fermer } = await monter(assistant());
  await allerStrategie(hote);
  h.detailBrief = null;
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  expect(hote.querySelector('[data-zone="assistant-strategie"]')).not.toBeNull();
  expect(hote.querySelector('[data-zone="assistant-direction"]')).toBeNull();
  expect(h.manuel).toHaveLength(0);
  await fermer();
});

it.each([false, true])('quitter le brief par les étapes enregistre avant de naviguer ; conflit=%s', async (refus) => {
  const { hote, fermer } = await monter(assistant({ intention: 'Présenter les lunettes' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="retour"]'));
  await saisir(hote.querySelector('[data-champ="intention"]'), 'Nouvelle intention conservée');
  h.refuserApplication = refus;
  await clic(hote.querySelector('nav.steps [data-aller="strategie"]'));
  expect(h.manuel).toHaveLength(1);
  expect(JSON.stringify(h.manuel[0])).toContain('Nouvelle intention conservée');
  expect(etape()).toBe(refus ? 'brief' : 'strategie');
  if (refus) expect(hote.querySelector('[role="alert"]')?.textContent).toContain('Version modifiée');
  expect(h.creer).toHaveLength(1);
  await fermer();
});

it.each(['continuer', 'quitter', 'etapes'] as const)('style modifié : %s enregistre une seule proposition manuelle complète avant de naviguer', async (sortie) => {
  h.persisterDirection = true;
  const { hote, fermer } = await monter(assistant({ titre: 'Projet' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="concept-libre"]'), 'Un nouveau concept');
  await saisir(hote.querySelector('[data-champ="style-libre"]'), 'Lumière douce');
  await saisir(hote.querySelector('[data-champ="accroche-libre"]'), 'Découvrez notre produit');
  await saisir(hote.querySelector('[data-champ="cta-libre"]'), 'Découvrir');
  if (sortie === 'continuer') await clic(hote.querySelector('[data-bouton="vers-format"]'));
  else if (sortie === 'etapes') await clic(hote.querySelector('nav.steps [data-aller="brief"]'));
  else await clic(quitter());
  expect(h.propBrief).toHaveLength(0); expect(h.manuel).toHaveLength(1); expect(h.appliquer).toHaveLength(1);
  const changes = (h.manuel[0] as { changes: { path: string; newValue: unknown }[] }).changes;
  expect(changes.map((c) => c.path)).toEqual(['/brief/concept', '/brief/styleIntent', '/brief/texts']);
  expect(JSON.stringify(changes)).toContain('Découvrez notre produit'); expect(JSON.stringify(changes)).toContain('Découvrir');
  expect(h.detailBrief?.concept).toBe('Un nouveau concept'); expect(h.detailBrief?.styleIntent).toBe('Lumière douce');
  if (sortie === 'quitter') expect(h.navigation).toEqual(['/studio/projets/proj-1']);
  else expect(etape()).toBe(sortie === 'etapes' ? 'brief' : 'format');
  await fermer();
});

it.each(['continuer', 'quitter'] as const)('style refusé : %s conserve la saisie et ne quitte pas', async (sortie) => {
  h.refuserApplication = true;
  const { hote, fermer } = await monter(assistant({ titre: 'Projet' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="concept-libre"]'), 'À conserver');
  await clic(sortie === 'continuer' ? hote.querySelector('[data-bouton="vers-format"]') : quitter());
  expect(h.navigation).toHaveLength(0);
  expect(hote.querySelector('[data-zone="assistant-direction"]')).not.toBeNull();
  expect((hote.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('À conserver');
  expect(hote.textContent).toContain('Version modifiée ailleurs');
  await fermer();
});

it.each(['droits', 'reseau'] as const)('style : %s bloque la navigation et ne relance pas une application incertaine', async (mode) => {
  h.droitProposer = mode !== 'droits'; h.jeterApplication = mode === 'reseau';
  const { hote, fermer } = await monter(assistant({ titre: 'Projet' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="concept-libre"]'), 'Conserver mon concept');
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  expect(hote.querySelector('[data-zone="assistant-direction"]')).not.toBeNull();
  expect(h.navigation).toHaveLength(0);
  expect(h.manuel).toHaveLength(mode === 'droits' ? 0 : 1); expect(h.appliquer).toHaveLength(mode === 'droits' ? 0 : 1);
  expect((hote.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('Conserver mon concept');
  await fermer();
});

it('style appliqué puis relecture refusée : une nouvelle validation relit sans nouvelle proposition', async () => {
  h.refuserLectureApresApplication = true; h.persisterDirection = true;
  const { hote, fermer } = await monter(assistant({ titre: 'Projet' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="concept-libre"]'), 'Concept sauvegardé');
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  expect(h.manuel).toHaveLength(1); expect(h.appliquer).toHaveLength(1);
  expect(hote.textContent).toContain('Relecture indisponible');
  expect((hote.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('Concept sauvegardé');
  h.lectureRefusee = false;
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  expect(h.manuel).toHaveLength(1); expect(h.appliquer).toHaveLength(1);
  expect(etape()).toBe('format');
  await fermer();
});

it.each(['approved', 'proposed'])('réponse d’application perdue : relecture %s sans nouvelle écriture', async (etatInspecte) => {
  h.jeterApplication = true; h.inspectEtat = etatInspecte;
  const { hote, fermer } = await monter(assistant({ titre: 'Projet' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="concept-libre"]'), 'Saisie conservée');
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  if (etatInspecte === 'approved') h.detailBrief = { ...h.detailBrief!, concept: 'Saisie conservée' };
  await clic([...hote.querySelectorAll('button')].find((b) => b.textContent === 'Relire l’enregistrement · sans modification'));
  expect(h.inspections).toHaveLength(1); expect(h.manuel).toHaveLength(1); expect(h.appliquer).toHaveLength(1);
  expect((hote.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('Saisie conservée');
  h.jeterApplication = false;
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  expect(h.manuel).toHaveLength(1); expect(h.appliquer).toHaveLength(etatInspecte === 'approved' ? 1 : 2);
  await fermer();
});

it('réponse de création perdue : consulter puis annuler explicitement sans appliquer ni relancer', async () => {
  h.jeterCreation = true;
  const { hote, fermer } = await monter(assistant({ titre: 'Projet' }));
  await allerStrategie(hote);
  await clic(hote.querySelector('[data-bouton="vers-direction"]'));
  await saisir(hote.querySelector('[data-champ="concept-libre"]'), 'Saisie conservée');
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  await clic([...hote.querySelectorAll('button')].find((b) => b.textContent === 'Relire l’enregistrement · sans modification'));
  expect(h.manuel).toHaveLength(1); expect(h.appliquer).toHaveLength(0);
  expect((hote.querySelector('[data-champ="concept-libre"]') as HTMLInputElement).value).toBe('Saisie conservée');
  await clic([...hote.querySelectorAll('button')].find((b) => b.textContent === 'Annuler mes modifications'));
  await clic(hote.querySelector('[data-bouton="vers-format"]'));
  expect(h.manuel).toHaveLength(1); expect(h.appliquer).toHaveLength(0);
  await fermer();
});
