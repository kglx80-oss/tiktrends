// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { messageHorsLigneStudio, type CouloirSpatial, type NoeudSpatial } from '@tiktrends/core';
import type { ListePropositions, PropositionPresentee, ReponseProposition } from '../lib/studios/propositions/types';

/**
 * Fiche projet des Studios (`/studio/projets/[id]` · Canvas, Brief &
 * références, Créations, panneau Jarvis) · passe design, la même que l'Export
 * (#1024) et l'Éditeur (#1027). On lit le DOM RENDU (jsdom) · ce qu'un lecteur
 * d'écran, un clavier ou un doigt rencontre :
 *
 *  - une puce fermée du canvas ou du panneau Jarvis reste focalisable
 *    (`aria-disabled`, que la feuille atténue · `.chip[disabled]` n'y a aucun
 *    style), ignore le clic, et dit pourquoi EN TOUTES LETTRES à côté
 *    (`aria-describedby`) · le `title` ne se lit ni au doigt ni au clavier ;
 *  - pendant une action serveur (exporter le brief, demander à Jarvis,
 *    appliquer, lancer une demande, envoyer, retenir, itérer), le bouton pressé
 *    GARDE le focus (`aria-disabled` + `aria-busy`, jamais `disabled`) et
 *    ignore un second clic ;
 *  - quand le contrôle pressé disparaît (confirmation lancée ou annulée,
 *    changement d'onglet), le focus va à ce qui le remplace ;
 *  - chaque tuile est une région nommée par son titre ; les gestes répétés
 *    (Cibler Jarvis, Ouvrir, Consulter, Appliquer, Rejeter, Retenir, Itérer…)
 *    ont chacun un nom distinct qui commence par le mot affiché ;
 *  - une action sans réponse dit « Hors ligne », pas « Refusé » ;
 *  - l'orbe de Jarvis est un décor.
 * 0 $ · toutes les actions serveur sont simulées, rien ne part.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1', useRouter: () => nav }));
const m = vi.hoisted(() => ({
  listerPropositions: vi.fn(), proposerPatch: vi.fn(), proposerBrief: vi.fn(), creerPropositionManuelle: vi.fn(), appliquerProposition: vi.fn(), rejeterProposition: vi.fn(),
  chatThreadAction: vi.fn(async () => ({ thread: undefined })), exporterBrief: vi.fn(),
  creerVariante: vi.fn(), iterer: vi.fn(), rattacherVarianteAuTest: vi.fn(), relireApprentissage: vi.fn(), preparerLotEssai: vi.fn(),
}));
vi.mock('../app/actions/studios/propositions', () => m);
vi.mock('../app/actions/jarvis-chat', () => m);
vi.mock('../app/actions/studios/sources', () => m);
vi.mock('../app/actions/studios/variantes', () => m);
vi.mock('../app/actions/studios/tests', () => m);

const { Projet } = await import('../spatial/vues/projet/Projet');
const { OngletCreations } = await import('../spatial/vues/projet/OngletCreations');
const { avecSpatial } = await import('./spatial/fournisseur');
type PropsProjet = import('../spatial/vues/projet/types').PropsProjet;

/* ───────────────────────────── Jeux de props ───────────────────────────── */

const IMG = '/api/studios/media/0000';
const n = (x: Partial<NoeudSpatial> & Pick<NoeudSpatial, 'id' | 'etiquette'>): NoeudSpatial => ({
  classe: '', apercu: null, titre: null, texte: null, phrase: null, barres: [], pied: null, pastille: null, lien: null, perdant: false, ...x,
});
const COULOIRS = (perdant: boolean): CouloirSpatial[] => [
  { cle: 'contexte', titre: 'Contexte', noeuds: [n({ id: 'brief:v3', etiquette: 'BRIEF', titre: 'Brief · version 3', cible: { cible: 'brief', libelle: 'Brief' } })] },
  { cle: 'hypothese', titre: 'Hypothèse', noeuds: [n({ id: 'hypothese:v3', etiquette: 'HYPOTHÈSE', titre: 'Hypothèse · version 3', phrase: 'Si A, alors B.', cible: { cible: 'brief', libelle: 'Brief' } })] },
  { cle: 'creations', titre: 'Créations', noeuds: [n({ id: 'creation:a', etiquette: 'CRÉATION', titre: 'A', perdant })] },
  { cle: 'mesure', titre: 'Mesure', noeuds: [] },
  { cle: 'iteration', titre: 'Itération', noeuds: [] },
];
const ACTIONS = [
  { cle: 'directions', libelle: 'Proposer des directions visuelles', genre: 'proposition' as const, cible: { chemin: '/brief/styleIntent', nombre: 1 }, etat: 'actif' as const, raison: null },
  { cle: 'accroches', libelle: 'Proposer 3 accroches', genre: 'proposition' as const, cible: { chemin: '/brief/texts', nombre: 3 }, etat: 'desactive' as const, raison: 'Le brief doit être cadré avant de proposer des accroches.' },
].map((a) => ({ ...a, effet: `Effet de ${a.libelle}` }));

const T = '2026-10-14T10:00:00.000Z';
const proposition = (id: string): PropositionPresentee => ({
  id, projectId: 'p1', origine: 'jarvis', libelleOrigine: 'Jarvis', etat: 'proposed', libelleEtat: 'À trancher',
  cible: 'brief', libelleCible: 'Brief', baseVersion: { id: 'v3', n: 3 }, libelleCibleVersion: 'Brief · version 3', perimee: false,
  changements: [{ op: 'replace', chemin: '/brief/objective', libelle: 'Objectif', avant: 'A', apres: 'B', raison: '' }],
  explication: '', sources: [], impact: null, creeLe: T, expireLe: null, decideLe: null, versionAppliquee: null,
} as PropositionPresentee);
const LISTE = (propositions: PropositionPresentee[] = []): ReponseProposition<ListePropositions> => ({
  ok: true, projectId: 'p1', versionCourante: { id: 'v3', n: 3 }, propositions, peutProposer: true,
  jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.02, mentionCout: 'Appel texte payant · 0,02 $ au plus.' },
  cibles: [{ cible: 'brief', libelle: 'Brief', champs: [{ chemin: '/brief/objective', libelle: 'Objectif', forme: 'texte', valeur: 'A' }] }],
} as ReponseProposition<ListePropositions>);

function props(o: Partial<PropsProjet> = {}): PropsProjet {
  return {
    projet: { id: 'p1', titre: 'Titre du projet', sousTitre: 'Marque · Publicité · V3', kind: 'ads' },
    pastille: { classe: 'c', libelle: 'Enregistré · version 3', icone: 'check' },
    exporterHref: '/studio/projets/p1/export',
    generer: { href: '/studio/projets/p1/produit', libelle: 'Préparer l’image…', raison: null },
    couloirs: COULOIRS(true),
    aideCanvas: '3 nœuds · la lignée réelle du projet',
    jarvis: {
      projectId: 'p1', marque: 'Neva', sousTitre: 'Dans ce projet', message: 'Bonjour.', fil: { conversationId: 'c1', tours: [] }, erreurFil: null,
      suggestion: { id: 'pr1', libelle: 'Brief', texte: 'Objectif · « B »', apercu: null },
      actions: ACTIONS, mentionCout: 'Appel texte payant · 0,02 $ au plus.', mentionConversation: 'Aucun crédit débité · coût IA sous le plafond IA.',
      versionCourante: { id: 'v3', n: 3 }, preparerHref: '/studio/projets/p1/produit', conversationOuverte: true,
    },
    brief: {
      projectId: 'p1', versionId: 'v3', versionN: 3, ancienne: false, titreBrief: 'Brief · version 3', etatBrief: 'ok',
      champs: [{ libelle: 'Objectif', valeurs: ['Clics'], options: false }],
      references: [
        { id: 's1', titre: 'Pub Meta 1', detail: 'Veille', apercu: null, href: '/veille/1', libelleLien: 'Voir la source' },
        { id: 's2', titre: 'Pub Meta 2', detail: 'Veille', apercu: null, href: '/veille/2', libelleLien: 'Voir la source' },
      ],
      produit: null, veilleHref: null, fiche: { score: 72, texte: 'Ton complice', href: '/brands/b1' }, manques: [],
      versions: [
        { id: 'v3', n: 3, date: '27/10/2026', raison: null, courante: true, vue: true, href: '/studio/projets/p1' },
        { id: 'v2', n: 2, date: '26/10/2026', raison: null, courante: false, vue: false, href: '/studio/projets/p1?version=v2' },
        { id: 'v1', n: 1, date: '25/10/2026', raison: null, courante: false, vue: false, href: '/studio/projets/p1?version=v1' },
      ],
      atelier: [
        { segment: 'produit', libelle: 'Produit', href: '/studio/projets/p1/produit', mention: null },
        { segment: 'textes', libelle: 'Textes', href: '/studio/projets/p1/textes', mention: null },
      ],
      exportBrief: { autorise: true, possible: true }, propositions: { initial: LISTE([proposition('pr1'), proposition('pr2')]), versionCourante: { id: 'v3', n: 3 } },
    },
    creations: {
      projectId: 'p1', versionCouranteId: 'v3', messageVide: 'Aucun lot.', editeurHref: '/studio/projets/p1/image', preparerHref: null, videoHref: null,
      lots: [{ jobId: 'j1', titre: 'Lot 1', version: 'V3', etat: { libelle: 'Prête', classe: 'g', pret: true, actif: false } as never, qualite: null, message: null, sorties: [
        { assetId: 'a1', libelle: 'Lot 1 · 1', apercu: IMG, detail: '', choisir: true, raison: null, varianteId: null },
        { assetId: 'a2', libelle: 'Lot 1 · 2', apercu: IMG, detail: '', choisir: true, raison: null, varianteId: null },
      ] }],
      variantes: ['x', 'y'].map((id) => ({
        id, libelle: `Variante ${id}`, apercu: null, version: 'V3', statut: 'Retenue', hypothese: 'H', variable: 'accroche', comparaison: '',
        test: { href: `/adsmap/${id}`, resume: 'Lot 3', verdict: 'À valider' }, lienTest: `lien-${id}`, lecture: null,
        gestes: { iterer: true, relire: true, rattacher: false }, rattachement: { hypothese: 'H', variable: 'accroche', aUnParent: false },
      })),
      erreurVariantes: null, relecture: { disponible: true, mention: '0,02 $ au plus', raison: null, coutMaxUsd: 0.02 }, taches: [], erreurTaches: null,
      peutProposer: false, adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] }, relire: false,
    },
    ...o,
  };
}

/* ───────────────────────────── Montage et lecture ───────────────────────────── */

let hote: HTMLDivElement;
let racine: Root | null = null;
beforeEach(() => { for (const f of Object.values(m)) f.mockReset(); m.chatThreadAction.mockResolvedValue({ thread: undefined }); nav.push.mockReset(); hote = document.createElement('div'); document.body.appendChild(hote); });
afterEach(() => { if (racine) act(() => racine!.unmount()); racine = null; document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const monter = (p: PropsProjet) => act(() => { racine = createRoot(hote); racine.render(avecSpatial(<Projet {...p} />)); });
const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const tous = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const bouton = (texte: string) => tous('button').find((b) => b.textContent === texte) as HTMLButtonElement | undefined;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'élément introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).focus(); (b as HTMLElement).click(); }); };
/** Laisse passer `focaliserApres` (un `setTimeout` 0) et les promesses. */
const laisser = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
/** Le nom accessible · `aria-labelledby`, sinon `aria-label`, sinon le texte. */
const nom = (el: Element | null | undefined) => {
  if (!el) return '(absent)';
  const ids = el.getAttribute('aria-labelledby');
  if (ids) return ids.split(' ').map((i) => document.getElementById(i)?.textContent ?? `(id ${i} introuvable)`).join(' ');
  return el.getAttribute('aria-label') ?? el.textContent ?? '';
};
/** La description · le texte des éléments désignés par `aria-describedby`. */
const description = (el: Element | null | undefined) => (el?.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((i) => document.getElementById(i)?.textContent ?? `(id ${i} introuvable)`).join(' ');
/** Bouton pressé · [disabled natif, aria-disabled, aria-busy]. */
const etat = (b: Element | null | undefined) => [(b as HTMLButtonElement).disabled, b!.getAttribute('aria-disabled'), b!.getAttribute('aria-busy')];
const enAttente = () => { let finir: (r: unknown) => void = () => {}; const p = new Promise((r) => { finir = r; }); return { p, finir: (r: unknown) => finir(r) }; };
const ouvrirOnglet = async (cle: 'brief' | 'canvas' | 'crea') => { await cliquer(q(`[data-ptab="${cle}"]`)); };

/* ───────────────────────────── 1 · Structure ───────────────────────────── */

describe('Fiche projet · régions nommées par leur titre, orbe décoratif', () => {
  it('« Brief & références » · chaque tuile est une région nommée par son titre', async () => {
    monter(props());
    await ouvrirOnglet('brief');
    expect(tous('section.tile').map(nom), 'une tuile du brief n’est pas nommée par son titre').toEqual([
      'Brief · version 3', 'Références', 'Fiche marque', 'Ce qui manque', 'Ateliers du projet', 'Propositions', 'Historique des versions', 'Produire ailleurs',
    ]);
  });

  it('« Créations » · les tuiles Variantes et tests, Tâches sont des régions nommées', async () => {
    monter(props());
    await ouvrirOnglet('crea');
    expect(tous('section.tile').map(nom), 'une tuile des créations n’est pas nommée par son titre').toEqual(['Variantes et tests', 'Tâches']);
  });

  it('l’orbe « J » du panneau Jarvis est un décor · le nom est écrit à côté', () => {
    monter(props());
    expect(q('aside.jpanel .orb').getAttribute('aria-hidden'), 'l’orbe est lu « J » avant « Jarvis »').toBe('true');
  });
});

/* ───────────────────────────── 2 · Contrôles fermés ───────────────────────────── */

describe('Canvas · une puce fermée reste focalisable, ignore le clic et dit pourquoi à côté', () => {
  const fermes = () => props({
    generer: { href: null, libelle: 'Préparer l’image…', raison: 'Cadre le brief avant de préparer une image.' },
    couloirs: COULOIRS(false),
    libre: { ok: false, raison: 'La disposition libre n’est pas activée pour cet espace.' },
  });

  it('Générer, Replier, Disposition libre · `aria-disabled` (atténué par la feuille), jamais `disabled`, raison écrite et reliée, pas en `title`', () => {
    monter(fermes());
    const puces = { generer: q('[data-puce="generer"]'), replier: q('[data-fold]'), libre: q('[data-disposition-libre]') };
    for (const [cle, b] of Object.entries(puces)) {
      expect([(b as HTMLButtonElement).disabled, b.getAttribute('aria-disabled')], `« ${cle} » fermé n’est pas focalisable ou ne se dit pas fermé`).toEqual([false, 'true']);
      expect(b.hasAttribute('title'), `« ${cle} » fermé ne dit sa raison qu’au survol`).toBe(false);
    }
    expect(description(puces.generer)).toBe('Cadre le brief avant de préparer une image.');
    expect(description(puces.replier)).toBe('Aucune création battue par une mesure · rien à replier.');
    expect(description(puces.libre)).toBe('La disposition libre n’est pas activée pour cet espace.');
    // Écrite en toutes lettres, visible sous la barre · pas une région cachée.
    for (const b of Object.values(puces)) expect(document.getElementById(b.getAttribute('aria-describedby')!)!.closest('.board'), 'la raison n’est pas dans le canvas').toBeTruthy();
  });

  it('un clic sur une puce fermée ne fait rien · ni navigation, ni repli, ni bascule', async () => {
    monter(fermes());
    await cliquer(q('[data-puce="generer"]'));
    await cliquer(q('[data-fold]'));
    await cliquer(q('[data-disposition-libre]'));
    expect(nav.push, 'Générer fermé a navigué').not.toHaveBeenCalled();
    expect(q('[data-fold]').getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-disposition-libre]').getAttribute('aria-pressed')).toBe('false');
    expect(q('.lanes'), 'la disposition a basculé').not.toBeNull();
    // Le clic ignoré n'a rien laissé en mémoire · quand une mesure fait un perdant (rafraîchissement), rien ne se replie seul.
    act(() => { racine!.render(avecSpatial(<Projet {...fermes()} couloirs={COULOIRS(true)} />)); });
    expect(q('[data-fold]').getAttribute('aria-pressed'), 'un clic sur « Replier » fermé a été retenu').toBe('false');
    expect(tous('[data-noeud^="creation:"]')).toHaveLength(1);
  });

  it('ouvertes · ni `aria-disabled`, ni raison, l’aide reste au survol', () => {
    monter(props());
    const g = q('[data-puce="generer"]');
    expect([g.getAttribute('aria-disabled'), g.getAttribute('aria-describedby'), g.getAttribute('title')]).toEqual([null, null, 'Ouvre la préparation · le devis est montré avant tout lancement']);
    expect(q('[data-raison-ferme]')).toBeNull();
  });
});

describe('Panneau Jarvis · puces fermées', () => {
  it('une action inactive reste focalisable, ignore le clic, sa raison est écrite et reliée', async () => {
    monter(props());
    const b = q('[data-puce="accroches"]');
    expect([(b as HTMLButtonElement).disabled, b.getAttribute('aria-disabled')]).toEqual([false, 'true']);
    expect(description(b)).toBe('Le brief doit être cadré avant de proposer des accroches.');
    await cliquer(b);
    expect(q('[data-confirmation]'), 'une action inactive a ouvert sa confirmation').toBeNull();
  });

  it('conversation fermée · « Écrire à Jarvis » dit pourquoi à côté, pas en `title`', async () => {
    const p = props();
    monter({ ...p, jarvis: { ...p.jarvis, conversationOuverte: false, erreurFil: 'Jarvis n’est pas inclus dans ton offre.' } });
    const b = q('[data-puce="ecrire"]');
    expect([(b as HTMLButtonElement).disabled, b.getAttribute('aria-disabled'), b.hasAttribute('title')]).toEqual([false, 'true', false]);
    expect(description(b)).toBe('Jarvis n’est pas inclus dans ton offre.');
    await cliquer(b);
    expect(q('[data-fil="projet"]'), 'la conversation fermée s’est ouverte').toBeNull();
  });
});

/* ───────────────────────────── 3 · Noms distincts ───────────────────────────── */

describe('Fiche projet · un geste répété a un nom distinct qui commence par le mot affiché', () => {
  const distincts = (els: HTMLElement[], mot: string, quoi: string) => {
    const noms = els.map(nom);
    expect(noms.length, `aucun « ${mot} »`).toBeGreaterThan(1);
    expect(new Set(noms).size, `les « ${mot} » ${quoi} ne se distinguent pas · ${noms.join(' | ')}`).toBe(noms.length);
    for (const x of noms) expect(x.startsWith(mot), `« ${x} » ne commence pas par le mot affiché`).toBe(true);
    for (const e of els) expect(e.textContent).toBe(mot);
  };

  it('Canvas · « Cibler Jarvis » de chaque nœud', () => {
    monter(props());
    distincts(tous('[data-cibler-jarvis]'), 'Cibler Jarvis', 'des nœuds');
  });

  it('Brief · ateliers, versions, références, Appliquer et Rejeter de chaque proposition', async () => {
    monter(props());
    await ouvrirOnglet('brief');
    distincts(tous('[data-atelier] a'), 'Ouvrir', 'des ateliers');
    distincts(tous('[data-version-n] a').filter((a) => a.textContent === 'Consulter'), 'Consulter', 'des versions');
    distincts(tous('[data-source] a'), 'Voir la source', 'des références');
    distincts(tous('[data-geste="appliquer"]'), 'Appliquer', 'des propositions');
    distincts(tous('[data-geste="rejeter"]'), 'Rejeter', 'des propositions');
    expect(['Copier le brief', 'Exporter en JSON'].map((t) => !!bouton(t)), '« Copier » / « JSON » seuls ne disent pas leur geste').toEqual([true, true]);
  });

  it('Créations · Ouvrir et Retenir de chaque sortie, Itérer, Relire et Adsmap de chaque variante', async () => {
    monter(props());
    await ouvrirOnglet('crea');
    distincts(tous('[data-ouvrir-image]'), 'Ouvrir', 'des sorties');
    distincts(tous('[data-geste="retenir"]'), 'Retenir', 'des sorties');
    distincts(tous('[data-geste="iterer"]'), 'Itérer', 'des variantes');
    distincts(tous('[data-variante] button').filter((b) => b.textContent === 'Relire'), 'Relire', 'des variantes');
    distincts(tous('[data-variante] a'), 'Adsmap', 'des variantes');
  });
});

/* ───────────────────────────── 4 · Le clavier garde sa place ───────────────────────────── */

describe('Brief · exporter le brief garde le focus', () => {
  it('pendant la lecture, le bouton pressé garde le focus et ignore un second clic ; les deux autres sont fermés', async () => {
    const r = enAttente();
    m.exporterBrief.mockReturnValue(r.p);
    monter(props());
    await ouvrirOnglet('brief');
    const b = q('[data-export-brief="markdown"]');
    await cliquer(b);
    expect(b.textContent).toBe('Export…');
    expect(etat(b), 'le bouton pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(document.activeElement, 'le focus a quitté « Exporter le brief »').toBe(b);
    expect([q<HTMLButtonElement>('[data-export-brief="copie"]').disabled, q<HTMLButtonElement>('[data-export-brief="json"]').disabled]).toEqual([true, true]);
    await cliquer(b);
    expect(m.exporterBrief, 'un second clic a relancé l’export').toHaveBeenCalledTimes(1);
    await act(async () => { r.finir({ ok: false, code: 'FORBIDDEN', message: 'Accès refusé.', traceId: 't1' }); });
    expect(etat(b)).toEqual([false, null, null]);
    expect(document.activeElement).toBe(b);
    expect(q('[aria-labelledby] [role="alert"] .pill')?.textContent, 'un refus du serveur garde « Refusé »').toBe('Refusé');
  });

  it('sans réponse · la pastille dit « Hors ligne », pas « Refusé »', async () => {
    m.exporterBrief.mockRejectedValue(new TypeError('Failed to fetch'));
    monter(props());
    await ouvrirOnglet('brief');
    await cliquer(q('[data-export-brief="json"]'));
    expect(q('[role="alert"]')?.textContent).toBe(`Hors ligne ${messageHorsLigneStudio('export')}`);
  });
});

describe('Brief · propositions · le clavier ne perd pas sa place', () => {
  const saisir = (el: HTMLTextAreaElement, v: string) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  it('« Demander à Jarvis » · pendant la demande, il garde le focus et ignore un second clic ; la réponse prend le focus', async () => {
    const r = enAttente();
    m.proposerBrief.mockReturnValue(r.p);
    m.listerPropositions.mockResolvedValue(LISTE());
    monter(props());
    await ouvrirOnglet('brief');
    saisir(q('[data-champ="demande-jarvis"]'), 'Plus court');
    const b = q('[data-geste="demander-jarvis"]');
    await cliquer(b);
    expect(b.textContent).toBe('Jarvis prépare…');
    expect(etat(b), '« Demander à Jarvis » pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(b);
    await cliquer(b);
    expect(m.proposerBrief, 'un second clic a payé une seconde demande').toHaveBeenCalledTimes(1);
    await act(async () => { r.finir({ ok: true, statut: 'proposee', projectId: 'p1', proposition: {}, runId: null }); });
    await laisser();
    expect(document.activeElement, 'le focus est tombé sur le document après la réponse').toBe(q('[data-retour="succes"]'));
  });

  it('« Appliquer » · pendant l’application, il garde le focus, les autres gestes sont fermés, un second clic est ignoré', async () => {
    const r = enAttente();
    m.appliquerProposition.mockReturnValue(r.p);
    monter(props());
    await ouvrirOnglet('brief');
    const b = tous('[data-geste="appliquer"]')[0]!;
    await cliquer(b);
    expect(b.textContent).toBe('Application…');
    expect(nom(b), 'le nom ne suit pas le mot affiché').toMatch(/^Application… · proposition 1/);
    expect(etat(b)).toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(b);
    expect(tous('[data-geste="rejeter"]').map((x) => (x as HTMLButtonElement).disabled), 'un autre geste reste ouvert pendant l’application').toEqual([true, true]);
    await cliquer(b);
    expect(m.appliquerProposition).toHaveBeenCalledTimes(1);
    await act(async () => { r.finir({ ok: false, code: 'FORBIDDEN', message: 'Refusé.', traceId: 't' }); });
  });

  it('sans réponse · la pastille dit « Hors ligne »', async () => {
    m.rejeterProposition.mockRejectedValue(new Error('réseau'));
    monter(props());
    await ouvrirOnglet('brief');
    await cliquer(tous('[data-geste="rejeter"]')[1]);
    expect(q('[data-retour="refus"] [role="alert"] .pill')?.textContent).toBe('Hors ligne');
  });
});

describe('Panneau Jarvis · le clavier ne perd pas sa place', () => {
  it('« Lancer la demande » garde le focus pendant la demande ; lancée, le focus revient à la puce', async () => {
    const r = enAttente();
    m.proposerPatch.mockReturnValue(r.p);
    monter(props());
    await cliquer(q('[data-puce="directions"]'));
    const b = q('[data-geste="lancer-demande"]');
    await cliquer(b);
    expect(etat(b), '« Lancer la demande » pressé est `disabled` ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(b);
    expect(bouton('Annuler')!.disabled).toBe(true);
    await cliquer(b);
    expect(m.proposerPatch, 'un second clic a payé une seconde demande').toHaveBeenCalledTimes(1);
    await act(async () => { r.finir({ ok: true, statut: 'proposee', projectId: 'p1', proposition: {}, runId: null }); });
    await laisser();
    expect(q('[data-confirmation]')).toBeNull();
    expect(document.activeElement, 'le focus est tombé sur le document après la demande').toBe(q('[data-puce="directions"]'));
  });

  it('« Annuler » referme la confirmation · le focus revient à la puce qui l’avait ouverte', async () => {
    monter(props());
    await cliquer(q('[data-puce="directions"]'));
    await cliquer(bouton('Annuler'));
    await laisser();
    expect(q('[data-confirmation]')).toBeNull();
    expect(document.activeElement, 'le focus est tombé sur le document après « Annuler »').toBe(q('[data-puce="directions"]'));
  });

  it('une demande sans réponse · la pastille dit « Hors ligne »', async () => {
    m.proposerPatch.mockRejectedValue(new Error('réseau'));
    monter(props());
    await cliquer(q('[data-puce="directions"]'));
    await cliquer(q('[data-geste="lancer-demande"]'));
    expect(q('aside.jpanel [role="alert"] .pill')?.textContent).toBe('Hors ligne');
  });

  it('« Relire et décider » change d’onglet · le focus passe à la tuile des propositions', async () => {
    monter(props());
    await cliquer(bouton('Relire et décider'));
    await laisser();
    expect(q('aside.jpanel'), 'le panneau est resté').toBeNull();
    expect(document.activeElement, 'le focus est tombé sur le document après le changement d’onglet').toBe(q('#propositions'));
  });

  it('envoyer un message · Entrée garde le focus dans le champ ; « Envoyer » vidé reste focalisable et ignore le clic', async () => {
    const r = enAttente();
    const fetchSpy = vi.fn(() => r.p);
    vi.stubGlobal('fetch', fetchSpy);
    monter(props());
    await cliquer(q('[data-puce="ecrire"]'));
    const ta = q<HTMLTextAreaElement>('[data-fil="projet"] textarea');
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'Plus punchy'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    ta.focus();
    await act(async () => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ta.disabled, 'le champ est `disabled` pendant l’envoi · Entrée rend le focus au document').toBe(false);
    expect(document.activeElement, 'le focus a quitté le champ pendant l’envoi').toBe(ta);
    const envoyer = q('[data-geste="envoyer"]');
    expect(etat(envoyer), '« Envoyer » pendant l’envoi').toEqual([false, 'true', 'true']);
    await cliquer(envoyer);
    expect(fetchSpy, 'un clic pendant l’envoi a renvoyé').toHaveBeenCalledTimes(1);
    await act(async () => { r.finir({ ok: false, body: null, json: async () => ({ error: 'x' }) }); });
    expect([etat(envoyer), (envoyer as HTMLButtonElement).style.opacity], 'vide · fermé mais focalisable, l’aspect de la maquette').toEqual([[false, 'true', null], '0.5']);
  });
});

describe('Créations · Retenir et Itérer gardent le focus', () => {
  it('« Retenir » · pendant l’enregistrement, il garde le focus, l’autre sortie est fermée, un second clic est ignoré', async () => {
    const r = enAttente();
    m.creerVariante.mockReturnValue(r.p);
    monter(props());
    await ouvrirOnglet('crea');
    const [b, autre] = tous('[data-geste="retenir"]');
    await cliquer(b);
    expect(b!.textContent).toBe('Enregistrement…');
    expect(etat(b)).toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(b);
    expect((autre as HTMLButtonElement).disabled).toBe(true);
    await cliquer(b);
    expect(m.creerVariante).toHaveBeenCalledTimes(1);
    await act(async () => { r.finir({ ok: false, message: 'Refusé.' }); });
    expect(document.activeElement).toBe(b);
  });

  it('« Itérer » · même règle ; une réponse perdue dit « Hors ligne »', async () => {
    const r = enAttente();
    m.iterer.mockReturnValue(r.p);
    monter(props());
    await ouvrirOnglet('crea');
    const b = tous('[data-geste="iterer"]')[1]!;
    await cliquer(b);
    expect(etat(b)).toEqual([false, 'true', 'true']);
    expect(document.activeElement).toBe(b);
    await cliquer(b);
    expect(m.iterer).toHaveBeenCalledTimes(1);
    await act(async () => { r.finir(Promise.reject(new Error('réseau'))); });
    await laisser();
    expect(q('.sec [role="alert"] .pill')?.textContent).toBe('Hors ligne');
  });

  it('l’onglet monté seul · les régions restent nommées (aucune dépendance au parent)', () => {
    act(() => { racine = createRoot(hote); racine.render(avecSpatial(<OngletCreations {...props().creations} lots={[]} />)); });
    expect(tous('section.tile').map(nom)).toEqual(['Créations', 'Variantes et tests', 'Tâches']);
  });
});
