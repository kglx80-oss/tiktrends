// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { contenuVide, largeurMinFrise, type ContenuVersion, type CouloirSpatial, type DocumentStudio, type NoeudSpatial, type PlanStudio } from '@tiktrends/core';
import { parite, squelette } from './spatial/parite';

/**
 * Spatial · rubrique D2 « projet, éditeur, vidéo » · gardes au RENDU.
 *
 *  1. Parité de structure · chaque écran, rendu avec un jeu de props aux
 *     MÊMES nombres d'éléments que le fragment de la maquette, reproduit son
 *     squelette (`docs/spatial/reference/{projet,editeur,video}.html`).
 *  2. La garde voit un écart · une classe retirée la fait tomber.
 *  3. Argent · une action payante n'appelle RIEN au premier clic : elle ouvre
 *     sa confirmation avec le coût annoncé, l'appel ne part qu'au second clic.
 *  4. Comportements · onglets, repli des perdants, édition d'un calque puis
 *     enregistrement par le patch du noyau.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1', useRouter: () => nav }));
const actions = vi.hoisted(() => ({
  proposerPatch: vi.fn(async () => ({ ok: true, statut: 'proposee', projectId: 'p1', proposition: {}, runId: null })),
  proposerBrief: vi.fn(), creerPropositionManuelle: vi.fn(), appliquerProposition: vi.fn(), rejeterProposition: vi.fn(),
  listerPropositions: vi.fn(), inspecterProposition: vi.fn(),
  chatThreadAction: vi.fn(async () => ({ thread: undefined })),
  exporterBrief: vi.fn(),
  creerVariante: vi.fn(), iterer: vi.fn(), relireApprentissage: vi.fn(),
  enregistrerDocument: vi.fn(async () => ({ ok: true, version: { id: 'v4', n: 4 }, inchange: false })),
  relireDocumentEditeur: vi.fn(), listerVersionsDocument: vi.fn(), restaurerVersionDocument: vi.fn(), apercuVersionDocument: vi.fn(),
  appliquerOperationVideo: vi.fn(), planifierStoryboard: vi.fn(), compilerConsignePlan: vi.fn(), retenirConsignePlan: vi.fn(),
  demanderDevisKeyframe: vi.fn(), approuverEtLancerKeyframe: vi.fn(async () => ({ ok: true, job: {}, deja: false })),
  demanderDevisClip: vi.fn(), approuverEtLancerClip: vi.fn(), assemblerVideoFinale: vi.fn(),
}));
vi.mock('../app/actions/studios/propositions', () => actions);
vi.mock('../app/actions/jarvis-chat', () => actions);
vi.mock('../app/actions/studios/sources', () => actions);
vi.mock('../app/actions/studios/variantes', () => actions);
vi.mock('../app/actions/studios/tests', () => actions);
vi.mock('../app/actions/studios/projets', () => actions);
vi.mock('../app/actions/studios/video', () => actions);
vi.mock('../lib/studios/editeur/actions', () => actions);

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Projet } = await import('../spatial/vues/projet/Projet');
const { Editeur } = await import('../spatial/vues/projet/Editeur');
const { Video } = await import('../spatial/vues/projet/Video');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
type PropsProjet = import('../spatial/vues/projet/types').PropsProjet;
type PropsEditeur = import('../spatial/vues/projet/Editeur').PropsEditeur;
type VueVideo = import('../lib/studios/video/lecture').VueVideo;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
// React 19 hisse en tête du rendu serveur un `<link rel="preload" as="image">` par image · ce n'est pas du DOM de la vue.
const rendre = (n: React.ReactNode, ctx: CtxSpatial = CTX) => renderToStaticMarkup(<FournisseurSpatial value={ctx}>{n}</FournisseurSpatial>).replace(/^(<link [^>]*>)+/, '');

/* ───────────────────────────── Jeux de props ───────────────────────────── */

const IMG = '/api/studios/media/0000';
const n = (x: Partial<NoeudSpatial> & Pick<NoeudSpatial, 'id' | 'etiquette'>): NoeudSpatial => ({
  classe: '', apercu: null, titre: null, texte: null, phrase: null, barres: [], pied: null, pastille: null, lien: null, perdant: false, ...x,
});

/** Les cinq couloirs aux mêmes nœuds (et mêmes parties) que le fragment. */
const COULOIRS_MAQUETTE: CouloirSpatial[] = [
  { cle: 'contexte', titre: 'Contexte', noeuds: [
    n({ id: 'brief:v3', etiquette: 'BRIEF', titre: 'Brief · version 3', texte: 'Objectif lu au brief.' }),
    n({ id: 'marque', etiquette: 'FICHE MARQUE', titre: 'Marque · 72 %', texte: 'Ton lu en fiche' }),
    n({ id: 'reference:s1', etiquette: 'RÉFÉRENCE VEILLE', titre: 'Source', apercu: { src: IMG, bandeau: ' ', classe: '' } }),
    n({ id: 'produit', etiquette: 'ASSET', titre: 'Produit', texte: '3 faits' }),
  ] },
  { cle: 'hypothese', titre: 'Hypothèse', noeuds: [
    n({ id: 'hypothese:v3', etiquette: 'HYPOTHÈSE', classe: 'sel', titre: 'Hypothèse · version 3', phrase: 'Si l’accroche pose une question, alors la rétention monte.', pastille: { classe: 'c', libelle: 'Rétention' } }),
    n({ id: 'direction:v3', etiquette: 'DIRECTION CRÉATIVE', titre: 'Direction', texte: 'Intention de style', pastille: { classe: 'g', libelle: 'Retenue' } }),
  ] },
  { cle: 'creations', titre: 'Créations', noeuds: [
    n({ id: 'creation:a', etiquette: 'CRÉATION', titre: 'A', apercu: { src: IMG, bandeau: '', classe: '' }, perdant: true }),
    n({ id: 'creation:b', etiquette: 'CRÉATION', classe: 'wn', titre: 'B', apercu: { src: IMG, bandeau: '', classe: 'won' }, pastille: { classe: 'g', libelle: 'Gagnant' } }),
    n({ id: 'creation:c', etiquette: 'CRÉATION', titre: 'C', apercu: { src: IMG, bandeau: '', classe: '' }, perdant: true }),
  ] },
  { cle: 'mesure', titre: 'Mesure', noeuds: [
    n({ id: 'resultat:b', etiquette: 'RÉSULTAT', titre: 'Lot 1', barres: [['A', 70, false], ['B', 90, true], ['C', 80, false]].map(([l, p, g]) => ({ libelle: l as string, part: p as number, valeur: `${p} %`, gagnant: g as boolean })), pied: 'Mesure importée' }),
    n({ id: 'apprentissage:b', etiquette: 'APPRENTISSAGE', titre: 'Apprentissage', texte: 'Phrase de lecture', pastille: { classe: 'w', libelle: 'À valider' } }),
  ] },
  { cle: 'iteration', titre: 'Itération', noeuds: [
    n({ id: 'iteration:v3', etiquette: 'ITÉRATION', classe: 'sel', titre: 'Itération', apercu: { src: IMG, bandeau: 'x', classe: 'v' }, phrase: 'Version itérée', lien: { href: '/studio/projets/p1?version=v3', libelle: 'Ouvrir', forme: 'bouton' } }),
    n({ id: 'iteration:v2', etiquette: 'ITÉRATION', titre: 'Itération', lien: { href: '/studio/projets/p1?version=v2', libelle: 'Ouvrir cette version', forme: 'pastille' } }),
    n({ id: 'note', etiquette: 'NOTE', texte: 'Une note' }),
  ] },
];

const ACTIONS = [
  { cle: 'directions', libelle: 'Proposer des directions visuelles', genre: 'proposition' as const, cible: { chemin: '/brief/styleIntent', nombre: 1 } },
  { cle: 'accroches', libelle: 'Proposer 3 accroches', genre: 'proposition' as const, cible: { chemin: '/brief/texts', nombre: 3 } },
  { cle: 'preparer', libelle: 'Préparer la création', genre: 'preparation' as const, cible: null },
].map((a) => ({ ...a, etat: 'actif' as const, raison: null, effet: `Effet de ${a.libelle}` }));

function propsProjet(o: Partial<PropsProjet> = {}): PropsProjet {
  return {
    projet: { id: 'p1', titre: 'Titre du projet', sousTitre: 'Marque · Publicité · V3', kind: 'ads' },
    pastille: { classe: 'c', libelle: 'Enregistré · version 3', icone: 'check' },
    exporterHref: '/studio/projets/p1/export',
    generer: { href: '/studio/projets/p1/produit', libelle: 'Préparer l’image…', raison: null },
    couloirs: COULOIRS_MAQUETTE,
    aideCanvas: '13 nœuds · la lignée réelle du projet',
    jarvis: {
      projectId: 'p1', marque: 'Marque', sousTitre: 'Dans ce projet · fiche Marque 72 %', message: 'Dernière réponse de Jarvis.',
      fil: null, erreurFil: null,
      suggestion: { id: 'pr1', libelle: 'Brief', texte: 'Textes · « Accroche plus courte »', apercu: { src: IMG, bandeau: '' } },
      actions: ACTIONS, mentionCout: 'Appel texte payant · 0,02 $ au plus, imputé au plafond de dépense.', mentionConversation: 'Aucun crédit débité pour la conversation.',
      versionCourante: { id: 'v3', n: 3 }, preparerHref: '/studio/projets/p1/produit', conversationOuverte: true,
    },
    brief: {
      projectId: 'p1', versionId: 'v3', versionN: 3, ancienne: false, titreBrief: 'Brief · version 3', etatBrief: 'ok',
      champs: [{ libelle: 'Objectif', valeurs: ['Clics'], options: true }, { libelle: 'Cible', valeurs: ['Parents'], options: false }],
      references: [], produit: null, veilleHref: '/veille', fiche: { score: 72, texte: 'Ton complice', href: '/brands/b1' },
      manques: [], versions: [{ id: 'v3', n: 3, date: '27/10/2026', raison: null, courante: true, vue: true, href: '/studio/projets/p1' }],
      atelier: [{ segment: 'textes', libelle: 'Textes', href: '/studio/projets/p1/textes', mention: null }],
      exportBrief: { autorise: true, possible: true }, propositions: { initial: null, versionCourante: { id: 'v3', n: 3 } },
    },
    creations: {
      projectId: 'p1', versionCouranteId: 'v3', lots: [], messageVide: 'Aucun lot.', editeurHref: '/studio/projets/p1/image', preparerHref: null, videoHref: null,
      variantes: [], erreurVariantes: null, relecture: { disponible: false, mention: null, raison: null, coutMaxUsd: null }, taches: [], erreurTaches: null,
      peutProposer: true, adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] }, relire: false,
    },
    ...o,
  };
}

/** Le document de la maquette · fond, produit verrouillé, accroche (choisie), badge. */
const DOC: DocumentStudio = {
  width: 1080, height: 1350, colorSpace: 'sRGB', fonts: { sans: { family: 'Liberation Sans', assetId: null } },
  layers: {
    fond: { id: 'fond', kind: 'image', name: 'Fond', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 0, assetId: 'a-fond', sourceWidth: 1080, sourceHeight: 1350, mask: null },
    produit: { id: 'produit', kind: 'image', name: 'Produit', visible: true, locked: true, x: 200, y: 300, width: 600, height: 600, rotationDeg: 0, opacity: 1, z: 1, assetId: 'a-prod', sourceWidth: 600, sourceHeight: 600, mask: null },
    accroche: { id: 'accroche', kind: 'text', name: 'Accroche', visible: true, locked: false, x: 60, y: 1100, width: 960, height: 200, rotationDeg: 0, opacity: 1, z: 2, text: 'Une accroche réelle', fontId: 'sans', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.2 },
    badge: { id: 'badge', kind: 'shape', name: 'Badge', visible: true, locked: false, x: 800, y: 60, width: 200, height: 200, rotationDeg: 0, opacity: 1, z: 3, shape: 'ellipse', fill: '#ffffff' },
  },
};

function propsEditeur(o: Partial<PropsEditeur> = {}): PropsEditeur {
  return {
    projet: { id: 'p1', titre: 'Titre du projet', marque: 'Marque' }, version: { id: 'v3', n: 3 }, contenu: { ...contenuVide(), document: DOC },
    document: DOC, formatPropose: { format: '4:5', depuisBrief: false, texte: null }, produit: null, medias: [], apercus: { 'a-fond': IMG, 'a-prod': IMG },
    peutEnregistrer: true, couleursMarque: ['#c4e6ef', '#f4b6c8'], exporterHref: '/studio/projets/p1/export', variantesHref: '/studio/projets/p1#variantes',
    selectionInitiale: 'accroche', ...o,
  };
}

const plan = (shotId: string, i: number): PlanStudio => ({
  shotId, purpose: `Fonction ${i}`, subject: `Sujet ${i}`, action: `Action ${i}`, framing: '', camera: 'fixe', lighting: '', environment: '', referenceIds: [],
  narration: `Narration ${i}`, onScreenText: [`Texte ${i}`], speechMode: 'voiceover', estimatedDurationMs: 3000 + i * 500,
});
const OUI = { disponible: true, raison: '' };

function vueVideo(nbPlans: number): VueVideo {
  const ids = Array.from({ length: nbPlans }, (_, i) => `s${i + 1}`);
  const contenu: ContenuVersion = { ...contenuVide(), shots: { order: ids, byId: Object.fromEntries(ids.map((id, i) => [id, plan(id, i + 1)])) } };
  let debut = 0;
  const segments = ids.map((id, i) => { const d = contenu.shots.byId[id]!.estimatedDurationMs; const s = { shotId: id, rang: i + 1, debutMs: debut, dureeMs: d, estimee: true }; debut += d; return s; });
  return {
    projet: { id: 'p1', titre: 'Projet vidéo' }, version: { id: 'v3', n: 3 }, contenu, briefPresent: true, sansTexte: false,
    format: { largeur: 1080, hauteur: 1920, libelle: '9:16', depuisBrief: true }, segments, dureeTotaleMs: debut,
    keyframes: Object.fromEntries(ids.map((id) => [id, { etat: 'valide' as const, media: { assetId: `k-${id}`, url: IMG }, retenue: { runId: 'r', instruction: 'Consigne', interdits: [], composants: [], compileeLe: '', verdict: { ok: true } } as never, enAttente: null, devis: null }])),
    clips: {}, mediasValides: [], musiques: [],
    disponibilite: { storyboard: OUI, montage: OUI, consigne: OUI, devis: OUI, lancement: OUI, animation: OUI },
    coutTexteUsd: 0.02, prix: { credits: 4, usdMicros: 40_000 }, prixClip: { credits: 40, usdMicros: 400_000, dureeS: 5 },
    videoFinale: { possible: true, raison: '', nonInclus: [], dureeMs: debut, derniere: { assetId: 'f1', url: '/api/studios/media/f1', dureeMs: debut, creeLe: '2026-10-27T10:00:00Z' } },
    jobs: [],
  };
}

/* ───────────────────────────── 1 · Parité ───────────────────────────── */

// La vignette de la référence de Veille porte, dans la maquette, une image
// d'exemple (blob) avec un filtre décoratif · ici, la vraie vignette de la
// source, sans filtre. Seul l'intérieur de son `.ph` est retiré des deux côtés.
const IGNORER_PROJET = ['.lane:first-child > div:nth-of-type(3) .ph'];

describe('Spatial · D2 · parité de structure avec la maquette', () => {
  it('« projet » (onglet Canvas) reproduit la maquette · en-tête, couloirs, nœuds, panneau Jarvis', () => {
    const p = parite(rendre(<Projet {...propsProjet()} />), 'projet', { ignorer: IGNORER_PROJET });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« éditeur » reproduit la maquette · calques, format, inspecteur de l’accroche', () => {
    const html = rendre(<Editeur {...propsEditeur()} />);
    // La composition de la maquette (une image d'exemple et un bandeau) est remplacée par le document réel à calques.
    const studio = parite(html, 'editeur', { selecteur: '.studio', ignorer: ['#art'] });
    expect(studio.rendu).toEqual(studio.reference);
    const entete = parite(html, 'editeur', { selecteur: 'header.top' });
    expect(entete.rendu).toEqual(entete.reference);
  });

  it('« vidéo » reproduit la maquette · lecteur, plans et gestes (3 lignes), montage (4 scènes)', () => {
    // La maquette montre 3 variantes ET 4 scènes · ici les deux sont des PLANS réels, chaque bloc est comparé
    // avec le nombre de la maquette. Le lecteur lit la vraie vidéo finale (`video`) au lieu d'une image d'exemple.
    const a = rendre(<Video vue={vueVideo(3)} marque="Marque" variantesHref="/studio/projets/p1#variantes" />);
    const haut = parite(a, 'video', { selecteur: '.vstudio', ignorer: ['.vplayer .ph'] });
    expect(haut.rendu).toEqual(haut.reference);
    const entete = parite(a, 'video', { selecteur: 'header.top' });
    expect(entete.rendu).toEqual(entete.reference);
    const b = rendre(<Video vue={vueVideo(4)} marque="Marque" variantesHref="/studio/projets/p1#variantes" />);
    const montage = parite(b, 'video', { selecteur: 'section.tile.sec' });
    expect(sansFriseDefilante(montage.rendu)).toEqual(montage.reference);
  });
});

/**
 * Planche v4 · G3 · seul ajout HORS maquette dans le montage · la frise défile
 * dans son cadre au téléphone (`.vtl` · `styleTableDefilante(largeurMinFrise)`)
 * et ses cinq pistes ne s'élargissent pas au texte de la voix (`minWidth: 0`).
 * On retire ces propriétés de style · et seulement si elles sont TOUTES là.
 */
function sansFriseDefilante(rendu: string[]): string[] {
  const vtl = rendu.filter((l) => l.trim() === 'div.vtl[style:grid-template-columns,overflow-x]').length;
  const pistes = rendu.filter((l) => /^\s*div(\.vticks)?\[style:min-width\]$/.test(l)).length;
  if (vtl !== 1 || pistes !== 5) return rendu;
  return rendu.map((l) => l.replace('div.vtl[style:grid-template-columns,overflow-x]', 'div.vtl').replace(/^(\s*div(\.vticks)?)\[style:min-width\]$/, '$1'));
}

/* ───────────────────────────── 2 · La garde voit un écart ───────────────────────────── */

describe('Spatial · D2 · la garde de parité tombe sur un écart', () => {
  it('une classe retirée (couloirs, calques, pistes) la fait tomber', () => {
    const projet = rendre(<Projet {...propsProjet()} />);
    expect(squelette(projet.replace('class="lanes"', 'class="x"'), { ignorer: IGNORER_PROJET })).not.toEqual(parite(projet, 'projet', { ignorer: IGNORER_PROJET }).reference);
    const ed = rendre(<Editeur {...propsEditeur()} />);
    expect(squelette(ed.replace('class="tile layers"', 'class="tile"'), { selecteur: '.studio', ignorer: ['#art'] })).not.toEqual(parite(ed, 'editeur', { selecteur: '.studio', ignorer: ['#art'] }).reference);
    const vi4 = rendre(<Video vue={vueVideo(4)} marque="M" variantesHref="/x" />);
    expect(squelette(vi4.replace('class="vtl"', 'class="v"'), { selecteur: 'section.tile.sec' })).not.toEqual(parite(vi4, 'video', { selecteur: 'section.tile.sec' }).reference);
  });

  it('un nœud de moins dans un couloir la fait tomber', () => {
    const moins = COULOIRS_MAQUETTE.map((c) => (c.cle === 'mesure' ? { ...c, noeuds: c.noeuds.slice(0, 1) } : c));
    const p = parite(rendre(<Projet {...propsProjet({ couloirs: moins })} />), 'projet', { ignorer: IGNORER_PROJET });
    expect(p.rendu).not.toEqual(p.reference);
  });
});

/* ───────────────────────────── 3 · Argent · prix avant le clic ───────────────────────────── */

let racine: Root | null = null;
let hote: HTMLDivElement;
beforeEach(() => { hote = document.createElement('div'); document.body.appendChild(hote); vi.clearAllMocks(); });
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); });
const monter = (n: React.ReactNode) => { act(() => { racine = createRoot(hote); racine.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement | undefined;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };

describe('Spatial · D2 · une action payante annonce son prix AVANT tout appel', () => {
  it('« Proposer 3 accroches » · le 1er clic ouvre la confirmation (coût, 3 appels), rien n’est appelé · le 2e lance 3 demandes bornées', async () => {
    monter(<Projet {...propsProjet()} />);
    await cliquer(bouton('Proposer 3 accroches'));
    expect(actions.proposerPatch).not.toHaveBeenCalled();
    const conf = hote.querySelector('[data-confirmation="accroches"]');
    expect(conf?.textContent).toContain('0,02 $ au plus');
    expect(conf?.textContent).toContain('3 appels');
    await cliquer(bouton('Lancer la demande'));
    expect(actions.proposerPatch).toHaveBeenCalledTimes(3);
    expect(actions.proposerPatch.mock.calls.every((c) => (c as unknown as [{ allowedPaths: string[] }])[0].allowedPaths[0] === '/brief/texts')).toBe(true);
  });

  it('vidéo · « Lancer l’image clé » ne lance rien au 1er clic · le prix du devis est dit, l’approbation part au 2e', async () => {
    const v = vueVideo(3);
    v.keyframes.s1 = { ...v.keyframes.s1!, devis: { id: 'q1', inputHash: 'h', credits: 4, usdMicros: 40_000, expiresAt: '2026-10-27T11:00:00Z' } };
    monter(<Video vue={v} marque="M" variantesHref="/x" />);
    await cliquer(hote.querySelector('[data-vlev="lancer"]'));
    expect(actions.approuverEtLancerKeyframe).not.toHaveBeenCalled();
    expect(hote.querySelector('[data-geste="lancer"]')?.textContent).toContain('4 crédits');
    await cliquer(bouton('Approuver et lancer · 4 crédits'));
    expect(actions.approuverEtLancerKeyframe).toHaveBeenCalledTimes(1);
    expect((actions.approuverEtLancerKeyframe.mock.calls[0] as unknown as [{ quoteId: string; creditsAnnonces: number }])[0]).toMatchObject({ quoteId: 'q1', creditsAnnonces: 4 });
  });
});

/* ───────────────────────────── 4 · Comportements ───────────────────────────── */

describe('Spatial · D2 · comportements', () => {
  it('les onglets · « Brief & références » montre le brief réel, « Créations » l’état vide honnête', async () => {
    monter(<Projet {...propsProjet()} />);
    expect(hote.querySelector('.lanes')).toBeTruthy();
    await cliquer(bouton('Brief & références'));
    expect(hote.querySelector('.lanes')).toBeNull();
    expect(hote.querySelector('dl.kv2')?.textContent).toContain('Parents');
    await cliquer(bouton('Créations'));
    expect(hote.textContent).toContain('Aucun lot.');
  });

  it('« Replier les perdants » masque les créations battues, garde la gagnante', async () => {
    monter(<Projet {...propsProjet()} />);
    expect(hote.querySelectorAll('[data-noeud^="creation:"]').length).toBe(3);
    await cliquer(bouton('Replier les perdants'));
    expect([...hote.querySelectorAll('[data-noeud^="creation:"]')].map((e) => e.getAttribute('data-noeud'))).toEqual(['creation:b']);
  });

  it('éditeur · modifier l’accroche puis enregistrer envoie le patch du noyau sur la version de base', async () => {
    monter(<Editeur {...propsEditeur()} />);
    const ta = hote.querySelector('#stext') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(ta, 'Nouvelle accroche'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { ta.focus(); ta.blur(); });
    expect(hote.querySelector('[data-calque="accroche"]')?.textContent).toBe('Nouvelle accroche');
    expect(hote.querySelector('#scount')?.textContent).toBe('17 caractères');
    await cliquer(bouton('Enregistrer'));
    expect(actions.enregistrerDocument).toHaveBeenCalledTimes(1);
    const e = (actions.enregistrerDocument.mock.calls[0] as unknown as [{ baseVersionId: string; changes: Array<{ path: string; newValue: unknown }> }])[0];
    expect(e.baseVersionId).toBe('v3');
    expect(e.changes).toEqual([expect.objectContaining({ path: '/document/layers/accroche/text', newValue: 'Nouvelle accroche' })]);
  });

  it('éditeur · un calque verrouillé ne se modifie pas · le produit garde son cadenas', () => {
    const html = rendre(<Editeur {...propsEditeur({ selectionInitiale: 'produit' })} />);
    expect(html).toContain('Le produit est verrouillé');
    expect(html).not.toContain('id="stext"');
  });

  it('vidéo · la barre flottante (`#orn`) dit les plans RÉELLEMENT animés et mène aux variantes', async () => {
    const orn = document.createElement('div');
    orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
    const v = vueVideo(3);
    v.clips = { s1: { etat: 'valide', media: { assetId: 'c1', url: IMG }, keyframePrete: true, devis: null }, s2: { etat: 'obsolete', media: null, keyframePrete: true, devis: null } };
    monter(<Video vue={v} marque="M" variantesHref="/studio/projets/p1#variantes" />);
    await act(async () => { await Promise.resolve(); });
    expect(orn.hidden).toBe(false);
    expect(orn.querySelector('[data-orn-video]')?.textContent).toBe('1 / 3 plans animés');
    expect([...orn.querySelectorAll('a')].map((x) => x.getAttribute('href'))).toEqual(['/studio/projets/p1', '/studio/projets/p1#variantes']);
    act(() => racine?.unmount()); racine = null;
    expect(orn.hidden).toBe(true);
    orn.remove();
  });

  it('vidéo · sans vidéo finale, le lecteur dit l’état réel au lieu d’un rendu simulé', () => {
    const v = vueVideo(2);
    v.videoFinale = { ...v.videoFinale, derniere: null };
    v.jobs = [{ id: 'j1', operation: 'keyframe:s1', etat: 'running', libelleEtat: 'En cours', message: '', raisonEchec: null, qualite: 'pending', libelleQualite: '', creditsReserves: 4, creeLe: '2026-10-27T10:00:00Z' }];
    const html = rendre(<Video vue={v} marque="M" variantesHref="/x" />);
    expect(html).toContain('class="vrend"');
    expect(html).toContain('En cours');
    expect(html).not.toContain('class="vpbtn"');
  });
});

describe('Spatial · atelier Vidéo au téléphone (planche v4 · G2 · G3)', () => {
  const lire = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

  it('G3 · la frise du montage défile dans son cadre, une largeur par scène, sans s’élargir au texte de la voix', () => {
    const d = lire(rendre(<Video vue={vueVideo(3)} marque="M" variantesHref="/x" />));
    const frise = d.querySelector('.vtl') as HTMLElement;
    expect(frise.style.overflowX, 'la frise ne défile pas · la 3e scène et 0:15 sortent du cadre, rognés').toBe('auto');
    // La largeur suit la part de la scène la plus courte (noyau `largeurMinFrise`), lue ici sur les scènes rendues.
    const parts = [...frise.querySelectorAll('.vtr:first-child b')].map((b) => ({ flex: Number.parseFloat((b as HTMLElement).style.flex) }));
    expect(parts).toHaveLength(3);
    const min = largeurMinFrise(parts);
    expect(min).toBeGreaterThan(294);
    expect(frise.style.gridTemplateColumns).toBe(`minmax(${min}px, 1fr)`);
    const pistes = [...frise.querySelectorAll(':scope > .vtr > div')] as HTMLElement[];
    expect(pistes).toHaveLength(5);
    for (const p of pistes) expect(p.style.minWidth, 'une piste s’élargit au texte entier de la voix').toBe('0px');
  });

  it('G2 · au téléphone, les boutons de l’aperçu passent AU-DESSUS du lecteur, hors des barres flottantes', () => {
    const avant = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(max-width: 760px)', media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      monter(<Video vue={vueVideo(3)} marque="M" variantesHref="/x" />);
      const colonne = hote.querySelector('.vstudio > div')!;
      const enfants = [...colonne.children];
      const actions = colonne.querySelector('[data-actions-apercu]')!;
      expect(actions.getAttribute('data-actions-apercu')).toBe('haut');
      expect(enfants.indexOf(actions), 'les boutons de l’aperçu restent sous le lecteur · masqués par les barres').toBeLessThan(enfants.indexOf(colonne.querySelector('.vplayer')!));
      expect(colonne.querySelectorAll('[data-actions-apercu]')).toHaveLength(1);
      expect(actions.textContent).toContain('MP4');
      expect(actions.textContent).toContain('Tester les variantes');
    } finally { window.matchMedia = avant; }
  });

  it('G2 (planche finale) · au téléphone, aucune barre flottante posée sur la navigation · « Projet » et « Tester les variantes » restent au-dessus du lecteur', async () => {
    const avant = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(max-width: 760px)', media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    const orn = document.createElement('div');
    orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
    try {
      monter(<Video vue={vueVideo(3)} marque="M" variantesHref="/studio/projets/p1#variantes" />);
      await act(async () => { await Promise.resolve(); });
      expect(orn.hidden, 'la barre flottante s’affiche · posée sur la barre de navigation mobile').toBe(true);
      expect(orn.childElementCount).toBe(0);
      const actions = hote.querySelector('[data-actions-apercu="haut"]')!;
      expect([...actions.querySelectorAll('a:not([download])')].map((x) => [x.textContent, x.getAttribute('href')]), 'un geste de la barre flottante n’a plus d’équivalent à l’écran').toEqual([
        ['Projet', '/studio/projets/p1'], ['Tester les variantes', '/studio/projets/p1#variantes'],
      ]);
    } finally { window.matchMedia = avant; orn.remove(); }
  });

  it('G2 · à l’ordinateur (et au rendu serveur), l’ordre de la maquette · lecteur, puis ses boutons', () => {
    const d = lire(rendre(<Video vue={vueVideo(3)} marque="M" variantesHref="/x" />));
    const colonne = d.querySelector('.vstudio > div')!;
    const enfants = [...colonne.children];
    expect(enfants.indexOf(colonne.querySelector('[data-actions-apercu="bas"]')!)).toBeGreaterThan(enfants.indexOf(colonne.querySelector('.vplayer')!));
  });
});

describe('Spatial · D2 · « Cibler Jarvis » depuis un nœud des couloirs', () => {
  const liste = (peutProposer = true) => ({
    ok: true as const, projectId: 'p1', versionCourante: { id: 'v3', n: 3 }, propositions: [], peutProposer,
    jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.02, mentionCout: 'Appel texte payant · 0,02 $ au plus.' },
    cibles: [{ cible: 'shot:s1', libelle: 'Plan 1', champs: [] }, { cible: 'brief', libelle: 'Brief', champs: [] }],
  });
  const avecCible = (peutProposer = true) => {
    const base = propsProjet();
    const couloirs = COULOIRS_MAQUETTE.map((c) => ({ ...c, noeuds: c.noeuds.map((x) => (x.id === 'brief:v3' || x.id === 'hypothese:v3' ? { ...x, cible: { cible: 'brief', libelle: 'Brief' } } : x)) }));
    return propsProjet({ couloirs, brief: { ...base.brief, propositions: { initial: liste(peutProposer) as never, versionCourante: { id: 'v3', n: 3 } } } });
  };

  it('le nœud du brief porte « Cibler Jarvis » · le clic ouvre les propositions, cible choisie, focus dans la demande, RIEN d’envoyé', async () => {
    monter(<Projet {...avecCible()} />);
    expect(hote.querySelectorAll('[data-cibler-jarvis]')).toHaveLength(2);
    expect(hote.querySelector('[data-noeud="creation:b"] [data-cibler-jarvis]')).toBeNull();
    await cliquer(hote.querySelector('[data-noeud="hypothese:v3"] [data-cibler-jarvis]'));
    expect(hote.querySelector('#propositions')).not.toBeNull();
    expect((hote.querySelector('#propositions select') as HTMLSelectElement).value).toBe('brief');
    expect([...hote.querySelectorAll('#propositions .seg button')].find((b) => b.textContent === 'Demander à Jarvis')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(hote.querySelector('[data-champ="demande-jarvis"]'));
    expect(hote.querySelector('#propositions')!.textContent).toMatch(/Cible « Brief » choisie.*Rien n’est envoyé/);
    expect(actions.proposerBrief).not.toHaveBeenCalled();
    expect(actions.proposerPatch).not.toHaveBeenCalled();
  });

  it('sans droit de proposer, le ciblage le dit et ne place rien · aucun envoi', async () => {
    monter(<Projet {...avecCible(false)} />);
    await cliquer(hote.querySelector('[data-noeud="brief:v3"] [data-cibler-jarvis]'));
    expect(hote.querySelector('#propositions')!.textContent).toMatch(/ne proposent pas « Brief »/);
    expect(hote.querySelector('[data-champ="demande-jarvis"]')).toBeNull();
    expect(actions.proposerBrief).not.toHaveBeenCalled();
  });

  it('un nœud sans cible (parité, autre version) n’offre pas le geste', () => {
    monter(<Projet {...propsProjet()} />);
    expect(hote.querySelector('[data-cibler-jarvis]')).toBeNull();
  });
});
