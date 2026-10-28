// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { VueLotImages } from '../lib/studios/image/lot-images';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Spatial · « Nouveau projet » · les étapes de l'assistant, une par une, au
 * RÉSULTAT (HTML rendu). Gardes PORTÉES de l'assistant V5 retiré (vague 3) :
 *  · panneau de départ (ex-`assistant-departs-rendu`) · il LIT, puis remet
 *    seulement le départ relu au serveur ; un refus garde le panneau ;
 *  · confirmation d'un lot (ex-`confirmation-lot-images`) · total annoncé,
 *    rien lancé avant « J'ai vérifié », manifeste exact, refus montré, une
 *    réponse incertaine bloque toute seconde demande même après remontage ;
 *  · créations (ex-`assistant-creation-galerie`) · tâches demandées seules,
 *    aucun faux score, « Garder » crée une variante puis relit, doublons et
 *    lecture seule bloqués, réponse perdue sans relance.
 */

const api = vi.hoisted(() => ({
  lister: vi.fn(), lire: vi.fn(), approuver: vi.fn(), lireParcours: vi.fn(), listerVariantes: vi.fn(), garder: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/nouveau', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/actions/studios/departs-assistant', () => ({ listerDepartsAssistant: api.lister, lireDepartAssistant: api.lire }));
vi.mock('../app/actions/studios/lot-images', () => ({ approuverLotImages: api.approuver, preparerLotImages: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({ lireParcoursImage: api.lireParcours, approuverEtLancerImage: vi.fn() }));
vi.mock('../app/actions/studios/variantes', () => ({ listerVariantes: api.listerVariantes, creerVariante: api.garder }));
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: vi.fn(), lireProduitProjet: vi.fn(), importerPhotoProduit: vi.fn(), associerReference: vi.fn(), retirerReference: vi.fn(), trancherComposants: vi.fn() }));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { DepartDepuisSource } = await import('../spatial/vues/studios/assistant/Panneaux');
const { ConfirmationLot } = await import('../spatial/vues/studios/assistant/Confirmation');
const { Creations } = await import('../spatial/vues/studios/assistant/Creations');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 200, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks(); window.sessionStorage.clear();
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ''; });
const monter = async (n: ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); await act(async () => { await Promise.resolve(); }); };
const clic = async (e: Element | null | undefined) => { expect(e, 'élément introuvable').toBeTruthy(); await act(async () => { (e as HTMLElement).click(); }); await act(async () => { await Promise.resolve(); }); };
const boutons = (texte: string) => [...document.querySelectorAll('button')].filter((b) => b.textContent === texte);

describe('panneau de départ (Veille, test)', () => {
  it('ouvre une liste sans sélection ni création, puis remet seulement le départ relu', async () => {
    api.lister.mockResolvedValue({ ok: true, choix: [{ id: 's1', titre: 'Annonce', detail: 'Observation', apercu: null }] });
    const depart = { origine: 'veille', id: 's1', titre: 'Titre relu', intention: '', sources: [{ type: 'sauvegarde', id: 's1' }], testId: null };
    api.lire.mockResolvedValue({ ok: true, depart });
    const onChoisir = vi.fn(); const onFermer = vi.fn();
    await monter(<DepartDepuisSource origine="veille" onChoisir={onChoisir} onFermer={onFermer} />);
    expect(api.lister).toHaveBeenCalledWith('veille');
    expect(api.lire).not.toHaveBeenCalled(); expect(onChoisir).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Fermer le panneau');
    // Rendu dans `body` · le voile couvre l'écran entier, hors de la fenêtre `main.win`.
    expect(document.querySelector('.paywrap')!.parentElement).toBe(document.body);
    await clic(document.querySelector('[data-depart-id="s1"]'));
    expect(api.lire).toHaveBeenCalledWith('veille', 's1'); expect(onChoisir).toHaveBeenCalledWith(depart);
  });

  it('un refus de lecture conserve le panneau et ne transmet aucun contexte · Échap ferme', async () => {
    api.lister.mockResolvedValue({ ok: true, choix: [{ id: 's1', titre: 'Test', detail: '', apercu: null }] });
    api.lire.mockResolvedValue({ ok: false, message: 'Verdict changé' });
    const onChoisir = vi.fn(); const onFermer = vi.fn();
    const declencheur = document.createElement('button'); document.body.appendChild(declencheur); declencheur.focus();
    await monter(<DepartDepuisSource origine="iteration" onChoisir={onChoisir} onFermer={onFermer} />);
    expect(document.activeElement).not.toBe(declencheur);
    await clic(document.querySelector('[data-depart-id="s1"]'));
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Verdict changé'); expect(onChoisir).not.toHaveBeenCalled();
    await act(async () => { document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onFermer).toHaveBeenCalledTimes(1);
    // Fermé (démonté par le parent), le focus revient à l'élément d'origine.
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(declencheur);
  });

  it('une liste vide le dit · rien n’est inventé', async () => {
    api.lister.mockResolvedValue({ ok: true, choix: [] });
    await monter(<DepartDepuisSource origine="iteration" onChoisir={vi.fn()} onFermer={vi.fn()} />);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Aucun test éligible');
    expect(document.querySelector('[data-depart-id]')).toBeNull();
  });
});

describe('confirmation du lot réel', () => {
  const lot = { id: 'lot', projectId: 'projet', versionId: 'v1', nombre: 2, type: 'images-meme-consigne', devis: [], totalCredits: 30, totalUsdMicros: 600000, qualification: { nature: 'borne', libelle: 'Coût maximal', raison: null }, expiresAt: new Date('2099-01-01'), empreinte: 'empreinte' } as unknown as VueLotImages;
  const monterLot = async (onLance = vi.fn()) => { await monter(<ConfirmationLot lot={lot} onModifier={vi.fn()} onLance={onLance} />); return onLance; };
  const cocher = () => clic(document.querySelector('[data-champ="verifie"] input'));
  const lancer = () => clic(document.querySelector('[data-bouton="confirmer-lot"]'));

  it('annonce le total et ne lance rien avant confirmation, puis transmet le manifeste exact', async () => {
    api.approuver.mockResolvedValue({ ok: true, jobs: [{ id: 'j1' }, { id: 'j2' }], deja: false });
    const onLance = await monterLot();
    expect(document.body.textContent).toContain('2 images');
    expect(document.querySelector('[data-prix="lot"]')!.textContent).toMatch(/0,60/);
    await lancer(); expect(api.approuver).not.toHaveBeenCalled();
    await cocher(); await lancer();
    expect(api.approuver).toHaveBeenCalledTimes(1);
    expect(api.approuver).toHaveBeenCalledWith({ lotId: 'lot', empreinte: 'empreinte', creditsAnnonces: 30, usdMicrosAnnonces: 600000, confirme: true });
    expect(onLance).toHaveBeenCalledWith(['j1', 'j2']);
  });

  it('budget refusé : affiche le refus sans annoncer de création', async () => {
    api.approuver.mockResolvedValue({ ok: false, code: 'BUDGET_EXCEEDED', message: 'Budget insuffisant pour le lot' });
    const onLance = await monterLot(); await cocher(); await lancer();
    expect(document.body.textContent).toContain('Budget insuffisant pour le lot'); expect(onLance).not.toHaveBeenCalled();
  });

  it.each(['transport', 'serveur'])('incertitude %s : fermeture et remontage ne permettent pas une deuxième demande', async (mode) => {
    if (mode === 'transport') api.approuver.mockRejectedValue(new Error('offline'));
    else api.approuver.mockResolvedValue({ ok: false, code: 'PROVIDER_UNCERTAIN', message: 'Résultat incertain' });
    await monterLot(); await cocher(); await lancer();
    await act(async () => root.render(null));
    await monterLot(); await cocher(); await lancer();
    expect(api.approuver).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('incertain');
  });
});

describe('créations réelles de l’assistant', () => {
  const job = (id: string, qualite = 'passed') => ({ id, etat: 'completed', terminal: true, libelleEtat: 'Terminée', message: 'Fichier enregistré', qualite, libelleQualite: qualite === 'passed' ? 'Accepté' : 'Écarté', creditsReserves: 10, creditsRendus: 0, raisonEchec: null, media: { assetId: `asset-${id}`, url: `/media/${id}`, largeur: 1080, hauteur: 1350 } });
  const donnees = (assets: string[] = [], proposer = true) => ({ ok: true, donnees: { variantes: assets.map((assetId) => ({ assetId })), droits: { proposer } } });
  beforeEach(() => {
    api.lireParcours.mockResolvedValue({ ok: true, vue: { jobs: [job('j1'), job('j2')] } });
    api.listerVariantes.mockResolvedValue(donnees());
    api.garder.mockResolvedValue({ ok: true, deja: false });
  });
  const monterCreations = (ids = ['j1', 'j2']) => monter(<Creations projectId="p1" jobIds={ids} />);

  it('affiche les tâches demandées et leurs médias sans écriture ni faux score', async () => {
    await monterCreations();
    expect(api.lireParcours).toHaveBeenCalledWith({ projectId: 'p1', jobIds: ['j1', 'j2'] });
    expect(el.querySelectorAll('article')).toHaveLength(2);
    expect(el.querySelectorAll('article img')).toHaveLength(2);
    expect(el.textContent).toContain('4:5');
    expect(el.textContent).not.toContain('/100');
    expect(api.garder).not.toHaveBeenCalled();
  });

  it('« Garder » crée une variante puis relit, bloque les doublons et révèle le lot de test à deux variantes', async () => {
    await monterCreations();
    api.listerVariantes.mockResolvedValue(donnees(['asset-j1']));
    await clic(boutons('Garder')[0]);
    expect(api.garder).toHaveBeenCalledWith({ assetId: 'asset-j1' });
    expect(api.listerVariantes).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('Gardée');
    api.listerVariantes.mockResolvedValue(donnees(['asset-j1', 'asset-j2']));
    await clic(boutons('Garder')[0]);
    expect(document.querySelector('#orn a[href="/studio/projets/p1#variantes"]')).not.toBeNull();
    await clic(boutons('Gardée')[0]);
    expect(api.garder).toHaveBeenCalledTimes(2);
  });

  it('la lecture seule et un média écarté interdisent « Garder »', async () => {
    api.listerVariantes.mockResolvedValue(donnees([], false));
    await monterCreations();
    expect(boutons('Garder').every((b) => b.disabled)).toBe(true);
    await act(async () => root.render(null));
    api.listerVariantes.mockResolvedValue(donnees());
    api.lireParcours.mockResolvedValue({ ok: true, vue: { jobs: [job('j1', 'rejected')] } });
    await monterCreations(['j1']);
    expect(boutons('Garder')[0]!.disabled).toBe(true);
  });

  it('une réponse perdue ne relance pas « Garder » avant relecture', async () => {
    api.garder.mockRejectedValue(new Error('offline'));
    await monterCreations();
    await clic(boutons('Garder')[0]);
    expect(api.garder).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('résultat inconnu');
    expect(boutons('Garder').every((b) => b.disabled)).toBe(true);
  });

  it('une tâche manquante est signalée sans masquer les autres résultats', async () => {
    await monterCreations(['j1', 'absente']);
    expect(el.textContent).toContain('Certaines tâches');
    expect(el.querySelectorAll('article img')).toHaveLength(1);
  });
});
