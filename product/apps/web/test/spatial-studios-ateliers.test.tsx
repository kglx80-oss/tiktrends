// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spatial · vague 2 · Studios · les gestes de l'ancienne interface portés dans
 * Spatial, gardés au RENDU (jsdom) :
 *
 *  1. Liste · recherche, filtre « Archivés » (projets archivés relus, Restaurer
 *     appelle `restaurerProjet`), « Itérer » ouvre les variantes du projet ;
 *     ni « Dupliquer » ni « Supprimer définitivement » (aucun service).
 *  2. Créations · « Rattacher au test » ouvre le formulaire prérempli et
 *     l'envoie par `rattacherVarianteAuTest` ; « Préparer un lot d'essai »
 *     affiche le plan du serveur ; plus aucun renvoi vers l'ancienne interface.
 *  3. Ateliers · Produit (épingler, parcours image : le 1er clic d'un geste
 *     payant n'appelle RIEN et dit le prix, le 2e lance), Textes (même règle),
 *     Identités (résolution), Export (préflight).
 *  4. Nouveau concept · rien n'est créé au rendu, le 1er message démarre.
 *  5. Aucun lien `?ui=v5` dans l'arbre Spatial des Studios.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets', useRouter: () => nav }));
const a = vi.hoisted(() => ({
  supprimerProjet: vi.fn(async () => ({ ok: true })), restaurerProjet: vi.fn(async () => ({ ok: true })),
  creerVariante: vi.fn(), iterer: vi.fn(), relireApprentissage: vi.fn(),
  rattacherVarianteAuTest: vi.fn(async () => ({ ok: true, lien: {}, deja: false })),
  preparerLotEssai: vi.fn(async () => ({ ok: true, plan: {
    titre: 'Lot d’essai · accroche', constat: { ok: true, phrase: 'Une seule chose varie.' }, hypothese: 'Si la question, alors le CTR', tenu: ['mise en page', 'ambiance'],
    variableAdsmap: 'hook', generation: 'Aucune génération · 0 crédit', lignes: [{ variantId: 'va', libelle: 'Lot 1 · sortie 1', valeur: 'Question', etat: 'a_rattacher', etatTexte: 'À rattacher', saisie: { hypothese: 'H du plan', variable: 'hook', valeurVariable: 'Question' }, adsmapHref: null }],
    suite: ['Rattacher chaque variante'], lienLots: null,
  } })),
  epinglerProduit: vi.fn(async () => ({ ok: true })), associerReference: vi.fn(async () => ({ ok: true })), retirerReference: vi.fn(), importerPhotoProduit: vi.fn(), trancherComposants: vi.fn(),
  lireParcoursImage: vi.fn(), compilerConsigneImage: vi.fn(async () => ({ ok: true, statut: 'compilee' })), retenirConsigneImage: vi.fn(), demanderDevisImage: vi.fn(),
  approuverEtLancerImage: vi.fn(async () => ({ ok: true, job: {}, deja: false })), controlerMediaImage: vi.fn(), annulerJob: vi.fn(),
  ecrireTextes: vi.fn(async () => ({ ok: true, statut: 'variantes', variantes: [], ecartees: [] })), enregistrerTextes: vi.fn(), exporterTextes: vi.fn(), injecterTexte: vi.fn(),
  resoudreContradiction: vi.fn(async () => ({ ok: true, version: { n: 5 }, inchange: false })), enregistrerIdentite: vi.fn(), lierIdentite: vi.fn(), choisirModeParole: vi.fn(),
  exporterVersion: vi.fn(),
  demarrerConcept: vi.fn(async () => ({ ok: true, demarrage: { projectId: 'pc', conversationId: 'cc' } })),
}));
vi.mock('../app/actions/studios/archivage', () => a);
vi.mock('../app/actions/studios/variantes', () => a);
vi.mock('../app/actions/studios/tests', () => a);
vi.mock('../app/actions/studios/produit', () => a);
vi.mock('../app/actions/studios/image', () => a);
vi.mock('../app/actions/studios/execution', () => a);
vi.mock('../app/actions/studios/textes', () => a);
vi.mock('../app/actions/studios/identites', () => a);
vi.mock('../app/actions/studios/export', () => a);
vi.mock('../app/actions/studios/concept', () => a);
vi.mock('../lib/studios/produit/compression-photo', () => ({ compresserPhoto: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { GrilleProjets } = await import('../spatial/vues/studios/GrilleProjets');
const { OngletCreations } = await import('../spatial/vues/projet/OngletCreations');
const { Produit } = await import('../spatial/vues/projet/Produit');
const { ParcoursImage } = await import('../spatial/vues/projet/ParcoursImage');
const { Textes } = await import('../spatial/vues/projet/Textes');
const { Identites } = await import('../spatial/vues/projet/Identites');
const { Export } = await import('../spatial/vues/projet/Export');
const { NouveauConcept } = await import('../spatial/vues/studios/NouveauConcept');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
type ProjetSpatial = import('../spatial/vues/studios/GrilleProjets').ProjetSpatial;
type PropsCreationsProjet = import('../spatial/vues/projet/types').PropsCreationsProjet;
type VueProduit = import('../lib/studios/produit/vue').VueProduit;
type VueParcoursImage = import('../lib/studios/image/parcours').VueParcoursImage;
type VueTextes = import('../lib/studios/textes/textes').VueTextes;
type VueIdentites = import('../lib/studios/identites/commandes').VueIdentites;
type VueExport = import('../lib/studios/export/export').VueExport;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 200, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};

let racine: Root | null = null;
let hote: HTMLDivElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); vi.clearAllMocks(); try { sessionStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); });
const monter = (n: React.ReactNode) => { act(() => { racine = createRoot(hote); racine.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement | undefined;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const saisir = async (el: Element | null, valeur: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valeur); el!.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};

/* ───────────────────────────── 1 · Liste ───────────────────────────── */

const carte = (id: string, title: string, etape: ProjetSpatial['etape'] = 'production'): ProjetSpatial => ({
  id, href: `/studio/projets/${id}`, title, marque: 'Neutre', libelleType: 'Image', etape, couverture: [], version: 'V1',
  pastille: { libelle: 'En production', classe: 'c' }, segments: ['on', 'on', 'cur'], libelleStp: 'Neutre', reprise: '1 source',
});

describe('Spatial · Studios · la liste porte la recherche, les archivés et l’itération', () => {
  it('la recherche filtre les cartes chargées · aucune carte ne correspond, on le dit', async () => {
    monter(<GrilleProjets projets={[carte('p1', 'Rentrée des clubs'), carte('p2', 'Piscine été')]} archives={[]} nouveau={null} peutArchiver vide={null} />);
    await saisir(hote.querySelector('[data-recherche-projet]'), 'piscine');
    expect([...hote.querySelectorAll('.pcard h3')].map((h) => h.textContent)).toEqual(['Piscine été']);
    await saisir(hote.querySelector('[data-recherche-projet]'), 'zzz');
    expect(hote.textContent).toContain('Aucun projet ne correspond');
  });

  it('« Archivés · n » liste les projets archivés relus · « Restaurer » appelle restaurerProjet', async () => {
    monter(<GrilleProjets projets={[carte('p1', 'Actif')]} archives={[carte('p9', 'Ancien')]} nouveau={{ href: '/studio/projets/nouveau' }} peutArchiver vide={null} />);
    const filtre = hote.querySelector('[data-pf="archive"]');
    expect(filtre?.textContent).toBe('Archivés · 1');
    await cliquer(filtre);
    expect([...hote.querySelectorAll('.pcard h3')].map((h) => h.textContent)).toEqual(['Ancien']);
    expect(hote.querySelector('.dashnew')).toBeNull();
    await cliquer(hote.querySelector('[aria-label="Restaurer Ancien"]'));
    expect(a.restaurerProjet).toHaveBeenCalledWith({ projectId: 'p9' });
    expect(hote.querySelector('[data-pf="archive"]')?.textContent).toBe('Archivés · 0');
  });

  it('sans relecture des archivés, le filtre n’est pas proposé (aucun zéro inventé)', () => {
    monter(<GrilleProjets projets={[carte('p1', 'Actif')]} archives={null} nouveau={null} peutArchiver vide={null} />);
    expect(hote.querySelector('[data-pf="archive"]')).toBeNull();
  });

  it('une carte porte « Itérer » (variantes du projet) et « Archiver » · ni « Dupliquer » ni « Supprimer »', () => {
    monter(<GrilleProjets projets={[carte('p1', 'Actif')]} archives={[]} nouveau={null} peutArchiver vide={null} />);
    const pacts = hote.querySelector('.pacts')!;
    expect(pacts.querySelector('a[title="Itérer"]')?.getAttribute('href')).toBe('/studio/projets/p1#variantes');
    expect(pacts.querySelector('[title="Archiver"]')).toBeTruthy();
    expect(pacts.querySelector('[title="Dupliquer"], [title="Supprimer"]')).toBeNull();
  });
});

/* ───────────────────────────── 2 · Créations ───────────────────────────── */

function creations(o: Partial<PropsCreationsProjet> = {}): PropsCreationsProjet {
  const variante = (id: string, libelle: string) => ({
    id, libelle, apercu: null, version: 'Version 2', statut: 'Fichier enregistré · Accepté', hypothese: 'Si la question, alors le CTR', variable: 'Accroche', comparaison: 'Aucune',
    test: null, lienTest: null, lecture: null, gestes: { iterer: true, relire: false, rattacher: true }, rattachement: { hypothese: 'Hypothèse de la variante', variable: 'hook', aUnParent: false },
  });
  return {
    projectId: 'p1', versionCouranteId: 'v2', lots: [{ jobId: 'j1', titre: 'Lot 1', version: 'Version 2', etat: { libelle: 'Prête', classe: 'g', pret: true } as never, qualite: 'Accepté', message: null, sorties: [] }],
    messageVide: 'Aucune création.', editeurHref: null, preparerHref: null, videoHref: null,
    variantes: [variante('va', 'Lot 1 · sortie 1'), variante('vb', 'Lot 1 · sortie 2')], erreurVariantes: null,
    relecture: { disponible: false, mention: null, raison: null, coutMaxUsd: null }, taches: [], erreurTaches: null,
    peutProposer: true, adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] }, relire: false, ...o,
  };
}

describe('Spatial · Studios · « Rattacher au test » et lot d’essai dans les Créations', () => {
  it('le formulaire s’ouvre prérempli (hypothèse, variable, 7 jours) et part par rattacherVarianteAuTest', async () => {
    monter(<OngletCreations {...creations()} />);
    expect(hote.innerHTML).not.toContain('ui=v5');
    await cliquer(hote.querySelector('[data-variante="va"] [data-geste="rattacher"]'));
    const f = hote.querySelector('[data-formulaire-test="va"]') as HTMLFormElement;
    expect((f.querySelector('[name="hypothese"]') as HTMLTextAreaElement).value).toBe('Hypothèse de la variante');
    expect((f.querySelector('[name="variable"]') as HTMLSelectElement).value).toBe('hook');
    await saisir(f.querySelector('[name="objectif"]'), 'CPA sous 30 €');
    await act(async () => { f.requestSubmit(); });
    expect(a.rattacherVarianteAuTest).toHaveBeenCalledTimes(1);
    const e = (a.rattacherVarianteAuTest.mock.calls[0] as unknown as [{ variantId: string; saisie: { objectif: string; hypothese: string; periodeDebut: string; periodeFin: string } }])[0];
    expect(e.variantId).toBe('va');
    expect(e.saisie).toMatchObject({ objectif: 'CPA sous 30 €', hypothese: 'Hypothèse de la variante' });
    expect((Date.parse(e.saisie.periodeFin) - Date.parse(e.saisie.periodeDebut)) / 86_400_000).toBe(7);
    expect(hote.querySelector('[data-formulaire-test]')).toBeNull();
  });

  it('un refus garde les saisies et dit le champ fautif', async () => {
    a.rattacherVarianteAuTest.mockResolvedValueOnce({ ok: false, code: 'INVALID_SCHEMA', status: 422, message: 'Saisie à corriger.', targetIds: [], recoverable: true, traceId: 't-1', violations: [{ chemin: 'objectif', raison: 'L’objectif est requis.' }] } as never);
    monter(<OngletCreations {...creations()} />);
    await cliquer(hote.querySelector('[data-variante="va"] [data-geste="rattacher"]'));
    await saisir(hote.querySelector('[name="objectif"]'), 'x');
    await act(async () => { (hote.querySelector('[data-formulaire-test="va"]') as HTMLFormElement).requestSubmit(); });
    expect(hote.querySelector('[data-faute="objectif"]')?.textContent).toBe('L’objectif est requis.');
    expect(hote.textContent).toContain('identifiant support t-1');
    expect((hote.querySelector('[name="hypothese"]') as HTMLTextAreaElement).value).toBe('Hypothèse de la variante');
  });

  it('sans accès Adsmap, pas de bouton · la raison est dite', () => {
    monter(<OngletCreations {...creations({ adsmap: { acces: false, protocoleMarque: null, offres: [], pages: [] } })} />);
    expect(hote.querySelector('[data-geste="rattacher"]')).toBeNull();
    expect(hote.textContent).toContain('disponible à partir de l’offre Plus');
  });

  it('le lot d’essai demande le plan au serveur, puis « Rattacher avec ce plan » préremplit le formulaire', async () => {
    monter(<OngletCreations {...creations()} />);
    const preparer = bouton('Préparer le lot d’essai')!;
    expect(preparer.disabled).toBe(true);
    await cliquer(hote.querySelector('[data-essai-variable]'));
    await cliquer(hote.querySelector('[data-essai-variante="va"]'));
    await cliquer(hote.querySelector('[data-essai-variante="vb"]'));
    await cliquer(bouton('Préparer le lot d’essai'));
    expect(a.preparerLotEssai).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', variantIds: ['va', 'vb'] }));
    expect(hote.querySelector('[data-plan-essai="essai"]')?.textContent).toContain('Une seule chose varie.');
    Element.prototype.scrollIntoView = () => {};
    await cliquer(bouton('Rattacher avec ce plan'));
    expect((hote.querySelector('[data-formulaire-test="va"] [name="hypothese"]') as HTMLTextAreaElement).value).toBe('H du plan');
  });
});

/* ───────────────────────────── 3 · Ateliers ───────────────────────────── */

const ATELIER = [{ segment: 'produit', href: '/studio/projets/p1/produit' }, { segment: 'textes', href: '/studio/projets/p1/textes' }, { segment: 'video', href: null }];
const OUI = { disponible: true, raison: '' };

function vueProduit(o: Partial<VueProduit> = {}): VueProduit {
  return {
    projet: { id: 'p1', title: 'Rentrée', marque: 'Neutre' }, version: { id: 'v2', n: 2 }, briefPresent: true,
    produits: [{ id: 'pr1', nom: 'Bonnet', photos: [{ assetId: 'ph1', assetVersion: '1', sha256: 'a'.repeat(64), nature: 'octets' as never, position: 1, apercu: '/x.png' }, { assetId: 'ph2', assetVersion: '1', sha256: 'b'.repeat(64), nature: 'octets' as never, position: 2, apercu: '/y.png' }] }],
    epingle: null, produitSansPhoto: null, fichiers: [], associations: [],
    preparation: { faithful_composite: { ok: false, violations: [{ raison: 'Aucune photo épinglée.' }], composantsProteges: [], interditsTransfert: [], avertissements: [] } as never, generative_scene: { ok: true, violations: [], composantsProteges: [], interditsTransfert: [], avertissements: [] } as never },
    peutModifier: true, ...o,
  };
}

describe('Spatial · Studios · atelier Produit', () => {
  it('la sous-navigation ne montre que les ateliers actifs · « Épingler » attend une photo, puis appelle epinglerProduit', async () => {
    monter(<Produit vue={vueProduit()} atelier={ATELIER} />);
    expect([...hote.querySelectorAll('nav.subnav a')].map((x) => x.textContent)).toEqual(['Projet', 'Produit', 'Textes']);
    const epingler = hote.querySelector('[data-geste="epingler"]') as HTMLButtonElement;
    expect(epingler.disabled).toBe(true);
    expect(hote.querySelector('[data-raison="epinglage"]')?.textContent).not.toBe('Gratuit · aucune génération à cette étape.');
    await cliquer(hote.querySelector('[data-photo="2"] button'));
    expect(epingler.disabled).toBe(false);
    await cliquer(epingler);
    expect(a.epinglerProduit).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', baseVersionId: 'v2', productId: 'pr1', photoId: 'ph2' }));
  });

  it('le contrôle avant compilation dit prêt ou bloqué, par mode, avec sa raison', () => {
    monter(<Produit vue={vueProduit()} atelier={ATELIER} />);
    expect(hote.querySelector('[data-mode="faithful_composite"]')?.getAttribute('data-pret')).toBe('non');
    expect(hote.querySelector('[data-mode="faithful_composite"]')?.textContent).toContain('Aucune photo épinglée.');
    expect(hote.querySelector('[data-mode="generative_scene"]')?.getAttribute('data-pret')).toBe('oui');
  });

  // Planche finale · D3 · la carte produit disait « prêt » à côté de deux
  // contrôles « Bloqué », et affichait l'empreinte sha256 brute.
  const SHA = '4648864bdc1a6804'.padEnd(64, 'e');
  const epingle = {
    schema: 'x', productId: 'pr1', assetId: 'ph1', nom: 'Huile d’argan', faits: [], manques: [], photoDisponible: true, instantaneLe: '', variante: { libelle: 'Variante unique' },
    photo: { assetId: 'ph1', assetVersion: `sha256-${SHA.slice(0, 16)}`, sha256: SHA, nature: 'adresse', position: 1, total: 1 },
    composantsObligatoires: ['Flacon ambré'], attributsImmuables: [], transformationsAutorisees: [], provenanceFaits: {}, epingleLe: '',
    etat: 'presente', libelleEtat: 'Photo épinglée présente dans le catalogue', apercu: '/x.png',
  } as never;
  const bloque = { ok: false, violations: [{ chemin: '/brief/references', raison: 'la photo épinglée n’est pas la référence Produit du brief' }], composantsProteges: [], interditsTransfert: [], avertissements: [] } as never;
  const passe = { ok: true, violations: [], composantsProteges: [], interditsTransfert: [], avertissements: [] } as never;

  it('D3 · deux modes bloqués · la carte ne dit plus « prêt » et nomme le geste qui répare', async () => {
    a.lireParcoursImage.mockResolvedValue({ ok: true, vue: vueParcours() });
    monter(<Produit vue={vueProduit({ epingle, preparation: { faithful_composite: bloque, generative_scene: bloque } })} atelier={ATELIER} />);
    await act(async () => { await Promise.resolve(); });
    const carte = hote.querySelector('[data-zone="produit-epingle"]')!;
    expect([...hote.querySelectorAll('[data-zone="controle-compilation"] [data-mode]')].map((m) => m.getAttribute('data-pret'))).toEqual(['non', 'non']);
    expect(carte.querySelector('.lbl')?.textContent, 'la carte dit « prêt » à côté de deux « Bloqué »').toBe('Ton produit n’est pas encore prêt');
    expect(carte.querySelector('[data-remede="produit"]')?.textContent).toContain('« Utiliser cette photo et continuer »');
    expect(bouton('Utiliser cette photo et continuer'), 'le geste nommé existe à l’écran').toBeTruthy();
  });

  it('D3 · un mode passe le contrôle · « Ton produit est prêt », sans remède', async () => {
    a.lireParcoursImage.mockResolvedValue({ ok: true, vue: vueParcours() });
    monter(<Produit vue={vueProduit({ epingle, preparation: { faithful_composite: bloque, generative_scene: passe } })} atelier={ATELIER} />);
    await act(async () => { await Promise.resolve(); });
    const carte = hote.querySelector('[data-zone="produit-epingle"]')!;
    expect(carte.querySelector('.lbl')?.textContent).toBe('Ton produit est prêt');
    expect(carte.querySelector('[data-remede]')).toBeNull();
  });

  it('D3 · aucune empreinte brute à l’écran · la version de la photo est résumée en clair', async () => {
    a.lireParcoursImage.mockResolvedValue({ ok: true, vue: vueParcours() });
    monter(<Produit vue={vueProduit({ epingle })} atelier={ATELIER} />);
    await act(async () => { await Promise.resolve(); });
    const carte = hote.querySelector('[data-zone="produit-epingle"]')!;
    expect(carte.textContent, 'jargon technique à l’écran').not.toMatch(/sha256|empreinte|4648864b/i);
    expect(carte.querySelector('[data-champ="empreinte"]')?.textContent).toBe('Photo distante, figée à l’épinglage · suivie par son adresse, pas par son contenu');
  });

  it('D13 · la pastille d’état de la photo peut passer à la ligne (390 px) · jamais coupée au bord de la carte', async () => {
    a.lireParcoursImage.mockResolvedValue({ ok: true, vue: vueParcours() });
    monter(<Produit vue={vueProduit({ epingle })} atelier={ATELIER} />);
    await act(async () => { await Promise.resolve(); });
    const pastille = hote.querySelector<HTMLElement>('[data-etat-photo] .pill')!;
    expect(pastille.style.whiteSpace, '`.pill` est en nowrap dans la maquette').toBe('normal');
  });
});

function vueParcours(o: Partial<VueParcoursImage> = {}): VueParcoursImage {
  return {
    projet: { id: 'p1' }, version: { id: 'v2', n: 2 }, modes: [{ mode: 'generative_scene', libelle: 'Mise en scène', pret: true }],
    format: { largeur: 1080, hauteur: 1350, libelle: '4:5', depuisBrief: true },
    disponibilite: { compilation: OUI, retenir: OUI, devis: OUI, lancement: OUI }, coutCompilationUsd: 0.02, prix: { credits: 4, usdMicros: 40_000 },
    enAttente: null, retenue: null, devis: null, jobs: [], controleVision: { disponible: false, borneParImageUsdMicros: 0 }, composantsObligatoires: [], peutRelire: true, ...o,
  };
}

describe('Spatial · Studios · parcours image · le prix avant tout appel payant', () => {
  it('« Préparer mon visuel » · le 1er clic n’appelle rien et dit le coût · le 2e compile', async () => {
    a.lireParcoursImage.mockResolvedValue({ ok: true, vue: vueParcours() });
    monter(<ParcoursImage projectId="p1" versionId="v2" initial={vueParcours()} />);
    expect(hote.querySelector('[data-cout="compilation"]')?.textContent).toContain('0,02 $');
    await cliquer(hote.querySelector('[data-bouton="compiler"]'));
    expect(a.compilerConsigneImage).not.toHaveBeenCalled();
    expect(hote.querySelector('[data-confirmation="compiler"]')?.textContent).toContain('Appel texte payant');
    await cliquer(bouton('Confirmer la préparation'));
    expect(a.compilerConsigneImage).toHaveBeenCalledWith({ projectId: 'p1', mode: 'generative_scene' });
  });

  it('« Générer mon visuel » · le devis est affiché, le 1er clic arme, le 2e débite le montant annoncé avec une clé stable', async () => {
    const v = vueParcours({
      retenue: { runId: 'r1', mode: 'generative_scene', libelleMode: 'Mise en scène', generationInstruction: 'Consigne', negativeConstraints: [], protectedComponents: [], liaisons: [], format: { largeur: 1080, hauteur: 1350 }, compileeLe: '2026-10-27T10:00:00Z', verdict: { ok: true } } as never,
      devis: { id: 'q1', inputHash: 'h1', credits: 4, usdMicros: 40_000, expiresAt: '2026-10-27T11:00:00Z', qualification: 'maximum' as never, lignes: [] },
    });
    a.lireParcoursImage.mockResolvedValue({ ok: true, vue: v });
    monter(<ParcoursImage projectId="p1" versionId="v2" initial={v} />);
    expect(hote.querySelector('[data-prix="devis"]')?.textContent).toContain('4 crédits');
    await cliquer(hote.querySelector('[data-bouton="lancer"]'));
    expect(a.approuverEtLancerImage).not.toHaveBeenCalled();
    await cliquer(hote.querySelector('[data-confirmation="lancer"]'));
    expect(a.approuverEtLancerImage).toHaveBeenCalledTimes(1);
    const e = (a.approuverEtLancerImage.mock.calls[0] as unknown as [{ quoteId: string; creditsAnnonces: number; idempotencyKey: string }])[0];
    expect(e).toMatchObject({ quoteId: 'q1', creditsAnnonces: 4 });
    expect(e.idempotencyKey).toBe(sessionStorage.getItem('tt-studio-image-cle-q1'));
  });

  it('D3 · la pastille dit l’état, le message ne le répète pas (« Échec · Échec · », « Terminé · Terminé · »)', async () => {
    const j = (o: Record<string, unknown>) => ({ id: 'j', etat: 'failed', libelleEtat: 'Échec', message: '', raisonEchec: null, annulable: false, terminal: true, qualite: 'pending', libelleQualite: '', creditsReserves: 0, creditsRendus: null, media: null, creeLe: '2026-10-22T13:35:00Z', ...o });
    const v = vueParcours({ jobs: [
      j({ id: 'a', message: 'Échec · aucun crédit consommé en plus de ce qui est indiqué.' }),
      j({ id: 'b', etat: 'completed', qualite: 'passed', libelleEtat: 'Terminé', message: 'Terminé · fichier enregistré et accepté.' }),
      j({ id: 'c', etat: 'cancelled', libelleEtat: 'Annulé', message: 'Annulé.' }),
    ] as never });
    a.lireParcoursImage.mockResolvedValue({ ok: true, vue: v });
    monter(<ParcoursImage projectId="p1" versionId="v2" initial={v} />);
    const ligne = (id: string) => hote.querySelector(`[data-job="${id}"] strong`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(ligne('a')).toBe('Échec Aucun crédit consommé en plus de ce qui est indiqué.');
    expect(ligne('b')).toBe('Terminé Fichier enregistré et accepté.');
    expect(ligne('c')).toBe('Annulé');
  });

  it('génération coupée pour l’espace · un état, aucun geste payant', async () => {
    a.lireParcoursImage.mockResolvedValue({ ok: false, code: 'UNSUPPORTED_CAPABILITY', status: 409, message: 'Génération d’images non activée.', targetIds: ['generation_image'], recoverable: false, traceId: 't' });
    monter(<ParcoursImage projectId="p1" versionId="v2" />);
    await act(async () => { await Promise.resolve(); });
    const etat = hote.querySelector('[data-etat="non-active"]')!;
    expect(etat.querySelector('.lbl')?.textContent).toBe('Génération d’images · non activée pour cet espace');
    expect(etat.textContent).toContain('Génération d’images non activée.');
    expect(etat.querySelector('[role="alert"]'), 'un état, pas une erreur').toBeNull();
    expect(etat.querySelectorAll('button')).toHaveLength(0);
    expect(hote.querySelector('[data-bouton="compiler"]')).toBeNull();
  });
});

function vueTextes(o: Partial<VueTextes> = {}): VueTextes {
  return {
    projet: { id: 'p1', title: 'Rentrée', marque: 'Neutre' }, version: { id: 'v2', n: 2 },
    brief: { objectif: 'Objectif', audience: '', hypothese: 'H', variable: 'hook', faits: [], invariants: [], exclusions: [] }, briefIllisible: false,
    textes: [], calques: [], limites: [{ type: 'hook', libelle: 'Accroche', max: 40, mesuree: true }, { type: 'body', libelle: 'Corps', max: 200, mesuree: false }, { type: 'cta', libelle: 'CTA', max: 20, mesuree: false }, { type: 'script', libelle: 'Script', max: 600, mesuree: false }] as never,
    disponibilite: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.02 }, peutEcrire: true, peutExporter: true, ...o,
  };
}

describe('Spatial · Studios · atelier Textes', () => {
  it('le brief partagé dit la variable testée en clair (« l’accroche »), jamais le code Adsmap', () => {
    monter(<Textes vue={vueTextes()} atelier={ATELIER} />);
    const ligne = [...hote.querySelectorAll('.ev')].find((e) => e.textContent?.startsWith('Variable testée'));
    expect(ligne?.querySelector('small')?.textContent).toBe('l’accroche');
  });

  it('« Écrire » · le 1er clic n’appelle rien et dit le coût · le 2e appelle ecrireTextes', async () => {
    monter(<Textes vue={vueTextes()} atelier={ATELIER} />);
    expect(hote.querySelector('[data-cout="texte"]')?.textContent).toContain('0,02 $');
    await cliquer(hote.querySelector('[data-bouton="ecrire"]'));
    expect(a.ecrireTextes).not.toHaveBeenCalled();
    const conf = hote.querySelector('[data-confirmation="ecrire"]')!;
    expect(conf.textContent).toContain('imputé au plafond');
    await cliquer(conf.querySelector('.btn.pri'));
    expect(a.ecrireTextes).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', baseVersionId: 'v2', type: 'hook', maxCaracteres: 40 }));
  });

  it('IA indisponible · le bouton reste inactif, la raison est dite, l’écriture à la main reste ouverte', () => {
    monter(<Textes vue={vueTextes({ disponibilite: { disponible: false, motif: 'plafond' as never, raison: 'Plafond de dépense atteint.', coutMaxUsd: 0.02 } })} atelier={ATELIER} />);
    expect((hote.querySelector('[data-bouton="ecrire"]') as HTMLButtonElement).disabled).toBe(true);
    expect(hote.textContent).toContain('Plafond de dépense atteint.');
    expect(hote.querySelector('[data-zone="ecrire-main"] textarea')).toBeTruthy();
  });
});

describe('Spatial · Studios · atelier Identités et voix', () => {
  it('une contradiction bloque le devis · la résolution choisie part par resoudreContradiction', async () => {
    const vue = {
      projet: { id: 'p1', title: 'Rentrée', marque: 'Neutre', kind: 'video' }, version: { id: 'v2', n: 2 }, identites: [], couleurs: [], peutProposer: true,
      plans: [{ shotId: 's1', rang: 1, sujet: '', action: '', narration: '', mode: 'none', estimeMs: 3000, identites: [] }],
      contradictions: [{ id: 'c1', nature: 'couleur', shotId: 's1', identityId: 'i1', nomIdentite: 'Léa', message: 'Le plan 1 dit « veste jaune », la fiche dit verte.', resolutions: [{ type: 'plan', libelle: 'Corriger le plan' }, { type: 'identite', libelle: 'Changer la fiche', plansTouches: ['s1'], contradictionsApres: 0 }] }],
      voix: { capacites: { synthese: { disponible: false, raison: 'La synthèse vocale n’est pas disponible · aucun fournisseur.' } }, modes: [], plansLipsync: [], prises: {}, temps: { plans: [], depassementMs: 0, message: 'Dans la cible.' } },
    } as unknown as VueIdentites;
    monter(<Identites vue={vue} voixActive atelier={ATELIER} />);
    expect(hote.querySelector('[data-etat="devis-bloque"]')).toBeTruthy();
    await cliquer(hote.querySelector('[data-resolution="plan"]'));
    expect(a.resoudreContradiction).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v2', contradictionId: 'c1', choix: 'plan' });
  });
});

describe('Spatial · Studios · atelier Export', () => {
  const base: VueExport = {
    projet: { id: 'p1', title: 'Rentrée', marque: 'Neutre' }, version: { id: 'v2', n: 2, courante: true }, versions: [{ id: 'v2', n: 2, courante: true }],
    document: { largeur: 1080, hauteur: 1350, calques: 3 }, preflight: { ok: true, medias: 1, polices: 1 }, historique: [], peutExporter: true,
  };
  it('préflight en refus · aucun export possible, chaque point nommé', () => {
    monter(<Export vue={{ ...base, preflight: { ok: false, violations: [{ cause: 'media_absent', message: 'Le fond est introuvable.', cible: { type: 'calque', calqueId: 'fond' } } as never] } }} atelier={ATELIER} />);
    expect((hote.querySelector('[data-format="png"]') as HTMLButtonElement).disabled).toBe(true);
    expect(hote.querySelector('[data-cible="fond"]')?.textContent).toContain('Le fond est introuvable.');
  });
  it('préflight prêt · « Exporter en PNG » appelle exporterVersion sur la version affichée', async () => {
    a.exporterVersion.mockResolvedValueOnce({ ok: false, code: 'FORBIDDEN', status: 403, message: 'Refusé.', targetIds: [], recoverable: false, traceId: 't-2' });
    monter(<Export vue={base} atelier={ATELIER} />);
    await cliquer(hote.querySelector('[data-format="png"]'));
    expect(a.exporterVersion).toHaveBeenCalledWith({ projectId: 'p1', versionId: 'v2', format: 'png' });
    expect(hote.textContent).toContain('identifiant support t-2');
  });
});

/* ───────────────────────────── 4 · Nouveau concept ───────────────────────────── */

describe('Spatial · Studios · nouveau concept créatif', () => {
  it('rien n’est créé au rendu · le 1er message démarre le concept puis part vers Jarvis', async () => {
    const lecteur = { read: vi.fn(async () => ({ done: true })) };
    const f = vi.fn(async () => ({ ok: true, body: { getReader: () => lecteur } }));
    vi.stubGlobal('fetch', f);
    monter(<NouveauConcept etat={{ etat: 'pret', marque: { id: 'b1', nom: 'Neutre' } } as never} sous="Studios · Neutre" />);
    expect(a.demarrerConcept).not.toHaveBeenCalled();
    await saisir(hote.querySelector('textarea'), 'Une pub pour la rentrée');
    await cliquer(hote.querySelector('[data-envoi="pret"]'));
    expect(a.demarrerConcept).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('/api/jarvis/chat', expect.objectContaining({ method: 'POST' }));
    expect(nav.replace).toHaveBeenCalledWith('/studio/projets/pc');
    vi.unstubAllGlobals();
  });
});

/* ───────────────────────────── 5 · Plus de renvoi vers l'ancienne interface ───────────────────────────── */

describe('Spatial · Studios · aucun lien `?ui=v5` dans l’arbre Spatial de la rubrique', () => {
  it('ni les vues studios / projet, ni les pages `sp/studio` ne renvoient vers l’ancienne interface', () => {
    const WEB = join(__dirname, '..');
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? parcourir(p) : /\.tsx?$/.test(n) && fichiers.push(p); } };
    for (const d of ['spatial/vues/studios', 'spatial/vues/projet', 'app/(spatial)/sp/studio']) parcourir(join(WEB, d));
    const fautifs = fichiers.filter((f) => /ui=v5/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '')));
    expect(fautifs.map((f) => f.split('/apps/web/')[1])).toEqual([]);
  });
});
