// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { documentStudio, contenuVideo } from '../../../packages/core/test/studios-fixtures';

/**
 * Atelier Spatial « Éditeur d'image » (`/studio/projets/[id]/image`) · passe
 * design, la même que l'Export (#1024). On lit le DOM RENDU (jsdom) · ce qu'un
 * lecteur d'écran, un clavier ou un doigt rencontre :
 *
 *  - pendant une action serveur (enregistrer, créer le document, restaurer),
 *    le bouton pressé GARDE le focus (`aria-disabled` + `aria-busy`, jamais
 *    `disabled`) et ignore un second clic ; « Enregistrer » fermé reste
 *    focalisable ;
 *  - quand le contrôle pressé disparaît (création, restauration, média posé,
 *    relecture), le focus va à l'élément qui le remplace, jamais au document ;
 *  - un contrôle fermé dit pourquoi, en toutes lettres à côté de lui (le
 *    `title` ne se lit ni au doigt ni au clavier) ;
 *  - chaque tuile est une région nommée par son titre, chaque rangée de puces
 *    un groupe nommé par son libellé ;
 *  - les « Aperçu » / « Fermer » répétés des versions ont chacun un nom distinct ;
 *  - une lecture des versions sans réponse dit « Hors ligne » (rien n'a été
 *    refusé) et propose « Réessayer ».
 * 0 $ · les actions serveur sont simulées, rien ne part.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ enregistrer: vi.fn(), relire: vi.fn(), lister: vi.fn(), apercu: vi.fn(), restaurer: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/image', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/actions/studios/projets', () => ({ enregistrerDocument: m.enregistrer }));
vi.mock('../lib/studios/editeur/actions', () => ({ relireDocumentEditeur: m.relire, listerVersionsDocument: m.lister, apercuVersionDocument: m.apercu, restaurerVersionDocument: m.restaurer }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Editeur } = await import('../spatial/vues/projet/Editeur');
type PropsEditeur = import('../spatial/vues/projet/Editeur').PropsEditeur;
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const PROPS = (o: Partial<PropsEditeur> = {}): PropsEditeur => ({
  projet: { id: 'p1', titre: 'Sérum · visuel', marque: 'Marque A1' }, version: { id: 'v4', n: 4 }, contenu: contenuVideo(),
  document: documentStudio(), formatPropose: { format: '4:5', depuisBrief: false, texte: null }, produit: null, medias: [], apercus: {},
  peutEnregistrer: true, couleursMarque: [], exporterHref: null, variantesHref: '/studio/projets/p1#variantes', ...o,
});
const LISTE = [
  { id: 'v4', n: 4, creeLe: '2026-10-20T10:00:00Z', auteur: 'Kevin', raison: 'Éditeur de calques · Déplacer', courante: true },
  { id: 'v2', n: 2, creeLe: '2026-10-18T10:00:00Z', auteur: 'Léa', raison: 'Éditeur de calques · Création du document', courante: false },
];
const APERCU_V2 = { version: { id: 'v2', n: 2 }, courante: { id: 'v4', n: 4 }, document: documentStudio(), documentIllisible: false, apercus: {}, comparaison: { phrases: ['Calque « Titre » · position horizontale : 300 px → 60 px'], tronquee: false } };

let hote: HTMLDivElement;
let racine: Root | null = null;
const matchMediaAvant = window.matchMedia;
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); window.localStorage.clear(); hote = document.createElement('div'); document.body.appendChild(hote); });
afterEach(() => { if (racine) act(() => racine!.unmount()); racine = null; document.body.innerHTML = ''; window.matchMedia = matchMediaAvant; });
const monter = (p: PropsEditeur) => act(() => { racine = createRoot(hote); racine.render(<FournisseurSpatial value={CTX}><Editeur {...p} /></FournisseurSpatial>); });
const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const cliquer = async (b: Element | null) => { expect(b, 'élément introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).focus(); (b as HTMLElement).click(); }); };
/** Laisse passer `focaliserApres` (un `setTimeout` 0) et les promesses. */
const laisser = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
/** Le nom accessible d'un élément · `aria-labelledby`, sinon `aria-label`, sinon son texte. */
const nom = (el: Element | null) => {
  if (!el) return '(absent)';
  const ids = el.getAttribute('aria-labelledby');
  if (ids) return ids.split(' ').map((i) => document.getElementById(i)?.textContent ?? `(id ${i} introuvable)`).join(' ');
  return el.getAttribute('aria-label') ?? '(sans nom)';
};
const deplacerTitre = async () => {
  await cliquer(q('[data-layer="l_titre"]'));
  act(() => { q('#art .ad').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
};
const ouvrirVersions = async () => { await cliquer(q('[data-action="versions"]')); await laisser(); };
const telephone = () => {
  window.matchMedia = ((qm: string) => ({ matches: qm === '(max-width: 760px)', media: qm, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
};

describe('Éditeur · structure · régions et groupes nommés par leur titre', () => {
  it('les deux panneaux latéraux et les deux tuiles sont des régions nommées', () => {
    monter(PROPS());
    expect(nom(q('aside.layers')), 'le panneau des calques n’est pas nommé').toBe('Calques');
    expect(nom(q('aside.insp')), 'le panneau des propriétés n’est pas nommé').toBe('Propriétés du calque');
    expect([...document.querySelectorAll('section.tile')].map(nom), 'une tuile n’est pas nommée par son titre').toEqual(['Gestes du calque', 'Versions']);
  });

  it('les puces « Gauche… », « Monter… » et les couleurs vivent dans un groupe nommé par leur libellé', async () => {
    monter(PROPS());
    await cliquer(q('[data-layer="l_titre"]'));
    const groupes = [...document.querySelectorAll('[role="group"]')].map(nom);
    expect(groupes, 'une rangée de contrôles n’est pas un groupe nommé').toEqual(expect.arrayContaining(['Couleur du texte', 'Aligner', 'Ordre']));
    const gauche = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Gauche')!;
    expect(nom(gauche.closest('[role="group"]')), '« Gauche » est hors de son groupe').toBe('Aligner');
    const monterBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Monter')!;
    expect(nom(monterBtn.closest('[role="group"]')), '« Monter » est hors de son groupe').toBe('Ordre');
  });
});

describe('Éditeur · « Enregistrer » · le clavier ne perd pas sa place', () => {
  it('fermé, il reste focalisable et le dit ; pendant l’envoi, il garde le focus et ignore un second clic ; enregistré, il garde le focus', async () => {
    let finir: (r: unknown) => void = () => {};
    m.enregistrer.mockImplementation(() => new Promise((r) => { finir = r; }));
    monter(PROPS());
    const b = q<HTMLButtonElement>('[data-action="enregistrer"]');
    expect([b.disabled, b.getAttribute('aria-disabled'), b.style.opacity], 'rien à enregistrer · fermé mais focalisable, l’aspect de la maquette').toEqual([false, 'true', '0.5']);
    await cliquer(b);
    expect(m.enregistrer, 'un clic sur « Enregistrer » fermé a envoyé').not.toHaveBeenCalled();

    await deplacerTitre();
    expect([b.getAttribute('aria-disabled'), b.style.opacity], 'modifié · ouvert').toEqual([null, '']);
    await cliquer(b);
    expect(b.textContent).toBe('Enregistrement…');
    expect(b.disabled, 'le bouton pressé est `disabled` · il rend le focus au document').toBe(false);
    expect([b.getAttribute('aria-disabled'), b.getAttribute('aria-busy')], 'le bouton pressé ne dit pas qu’il travaille').toEqual(['true', 'true']);
    expect(document.activeElement, 'le focus a quitté « Enregistrer » pendant l’envoi').toBe(b);
    await cliquer(b);
    expect(m.enregistrer, 'un second clic pendant l’envoi a relancé l’enregistrement').toHaveBeenCalledTimes(1);

    await act(async () => { finir({ ok: true, inchange: false, version: { id: 'v5', n: 5 } }); });
    expect([b.disabled, b.getAttribute('aria-disabled'), b.hasAttribute('aria-busy')], 'enregistré · fermé sans quitter la tabulation').toEqual([false, 'true', false]);
    expect(document.activeElement, 'le focus a quitté « Enregistrer » une fois la version créée').toBe(b);
  });
});

describe('Éditeur · créer le document · le focus passe à la surface', () => {
  it('pendant la création, le bouton garde le focus ; créé, le focus est sur l’aperçu du document', async () => {
    let finir: (r: unknown) => void = () => {};
    m.enregistrer.mockImplementation(() => new Promise((r) => { finir = r; }));
    monter(PROPS({ document: null }));
    const b = q<HTMLButtonElement>('[data-action="creer-document"]');
    await cliquer(b);
    expect([b.disabled, b.getAttribute('aria-disabled'), b.getAttribute('aria-busy')], 'le bouton « Créer » pressé n’est pas focalisable ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(b);
    await cliquer(b);
    expect(m.enregistrer, 'un second clic a créé deux documents').toHaveBeenCalledTimes(1);
    await act(async () => { finir({ ok: true, inchange: false, version: { id: 'v5', n: 5 } }); });
    await laisser();
    expect(document.activeElement, 'le focus est tombé sur le document après la création').toBe(q('#art .ad[role="group"]'));
  });
});

describe('Éditeur · versions · restaurer garde la place du clavier', () => {
  it('pendant la restauration, « Restaurer » garde le focus et n’affiche pas de refus ; restaurée, le focus revient au bouton de la tuile', async () => {
    let finir: (r: unknown) => void = () => {};
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    m.restaurer.mockImplementation(() => new Promise((r) => { finir = r; }));
    monter(PROPS());
    await ouvrirVersions();
    await cliquer(q('[data-comparer="2"]'));
    await laisser();
    const b = q<HTMLButtonElement>('[data-action="restaurer"]');
    await cliquer(b);
    expect(b.textContent).toBe('Restauration…');
    expect([b.disabled, b.getAttribute('aria-disabled'), b.getAttribute('aria-busy')], '« Restaurer » pressé n’est pas focalisable ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(b);
    expect(q('[data-refus-restauration]'), 'un refus s’affiche pendant sa propre restauration').toBeNull();
    await cliquer(b);
    expect(m.restaurer, 'un second clic a restauré deux fois').toHaveBeenCalledTimes(1);
    await act(async () => { finir({ ok: true, version: { id: 'v5', n: 5 }, restauree: { id: 'v2', n: 2 }, contenu: contenuVideo(), document: documentStudio() }); });
    await laisser();
    expect(document.activeElement, 'le focus est tombé sur le document après la restauration').toBe(q('[data-action="versions"]'));
  });

  it('les « Aperçu » et « Fermer » de chaque version ont un nom distinct qui commence par le mot affiché', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockResolvedValue({ ok: true, apercu: APERCU_V2 });
    monter(PROPS());
    await ouvrirVersions();
    const noms = () => [...document.querySelectorAll('[data-comparer]')].map((b) => [b.textContent, nom(b)]);
    expect(noms(), 'les boutons des versions ne se distinguent pas').toEqual([['Aperçu', 'Aperçu de la version 4'], ['Aperçu et comparaison', 'Aperçu et comparaison de la version 2']]);
    await cliquer(q('[data-comparer="2"]'));
    await laisser();
    expect(noms()[1]).toEqual(['Fermer', 'Fermer l’aperçu de la version 2']);
  });

  it('liste sans réponse · « Hors ligne », pas « Refusé » ; « Réessayer » relit et rend le focus au bouton de la tuile', async () => {
    m.lister.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce({ ok: true, versions: LISTE });
    monter(PROPS());
    await ouvrirVersions();
    expect(q('[data-panneau="versions"] [role="alert"] .pill')?.textContent, 'la pastille d’une lecture sans réponse').toBe('Hors ligne');
    await cliquer(q('[data-action="relire-versions"]'));
    await laisser();
    expect(m.lister).toHaveBeenCalledTimes(2);
    expect(q('[data-version-n="2"]'), 'la relecture n’a pas affiché la liste').not.toBeNull();
    expect(document.activeElement, 'le focus est tombé sur le document après « Réessayer »').toBe(q('[data-action="versions"]'));
  });

  it('liste refusée par le serveur · la pastille garde « Refusé »', async () => {
    m.lister.mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: 'Accès refusé.', traceId: 't1' });
    monter(PROPS());
    await ouvrirVersions();
    expect(q('[data-panneau="versions"] [role="alert"] .pill')?.textContent).toBe('Refusé');
  });

  it('aperçu sans réponse · « Hors ligne » et « Réessayer », le focus revient au bouton de la version', async () => {
    m.lister.mockResolvedValue({ ok: true, versions: LISTE });
    m.apercu.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce({ ok: true, apercu: APERCU_V2 });
    monter(PROPS());
    await ouvrirVersions();
    await cliquer(q('[data-comparer="2"]'));
    await laisser();
    expect(q('[data-detail-version="2"] [role="alert"] .pill')?.textContent).toBe('Hors ligne');
    await cliquer(q('[data-action="relire-apercu"]'));
    await laisser();
    expect(m.apercu).toHaveBeenCalledTimes(2);
    expect(q('[data-comparaison]'), 'la relecture n’a pas affiché la comparaison').not.toBeNull();
    expect(document.activeElement).toBe(q('[data-comparer="2"]'));
  });
});

describe('Éditeur · un contrôle fermé dit pourquoi, à côté de lui', () => {
  it('« Exporter » fermé · la raison est écrite, pas cachée dans un `title`', () => {
    monter(PROPS({ exporterHref: null }));
    const b = [...document.querySelectorAll('aside.insp button')].find((x) => x.textContent === 'Exporter') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.hasAttribute('title'), 'la raison ne vit que dans une infobulle').toBe(false);
    expect(q('[data-raison-ferme="exporter"]')?.textContent).toBe('L’export n’est pas ouvert pour ton rôle ou ton espace.');
  });

  it('aucun média · la raison est écrite sous « Média du projet »', () => {
    monter(PROPS());
    expect(q<HTMLButtonElement>('[data-ajouter="media"]').disabled).toBe(true);
    expect(q('[data-raison-ferme="media"]')?.textContent).toBe('Aucun média du projet à poser.');
  });

  it('média posé · la liste se referme, le focus revient à « Média du projet »', async () => {
    monter(PROPS({ medias: [{ assetId: 'a_m1', nom: 'Flacon', width: 800, height: 800 }] as PropsEditeur['medias'] }));
    expect(q('[data-raison-ferme="media"]'), 'des médias existent · aucune raison à écrire').toBeNull();
    await cliquer(q('[data-ajouter="media"]'));
    await cliquer([...document.querySelectorAll('button.prow')][0]!);
    await laisser();
    expect(document.activeElement, 'le focus est tombé sur le document après la pose').toBe(q('[data-ajouter="media"]'));
  });

  it('téléphone · « Propriétés » fermé dit qu’il faut choisir un calque, la raison part une fois le calque choisi', async () => {
    telephone();
    monter(PROPS());
    expect(q<HTMLButtonElement>('[data-ouvrir-panneau="proprietes"]').disabled).toBe(true);
    expect(q('[data-raison-ferme="proprietes"]')?.textContent).toBe('Choisis d’abord un calque.');
    await cliquer(q('[data-ouvrir-panneau="calques"]'));
    await cliquer(q('[data-panneau-mobile="calques"] [data-layer="l_titre"]'));
    expect(q('[data-raison-ferme="proprietes"]')).toBeNull();
  });
});

describe('Éditeur · bandeau · l’annonce ne lit pas l’orbe décoratif', () => {
  it('l’orbe « J » d’un bandeau d’alerte est caché des lecteurs d’écran', async () => {
    m.enregistrer.mockRejectedValueOnce(new Error('réseau'));
    monter(PROPS());
    await deplacerTitre();
    await cliquer(q('[data-action="enregistrer"]'));
    const alerte = q('.banner[role="alert"]');
    expect(alerte?.textContent).toContain('Le serveur ne répond pas');
    expect(alerte.querySelector('.orb')?.getAttribute('aria-hidden'), 'l’orbe « J » est lu au début de l’alerte').toBe('true');
  });
});
