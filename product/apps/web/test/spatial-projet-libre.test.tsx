// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { deriverCanvas, positionAuto, type DispositionCanvas } from '@tiktrends/core';
import { contenuVideo } from '../../../packages/core/test/studios-fixtures';

/**
 * Spatial · fiche projet · la DISPOSITION LIBRE du canvas, au RÉSULTAT (HTML
 * rendu, jsdom). Décision du chef de projet · le canevas libre de la V5 est
 * porté, les couloirs fixes de la maquette restent le défaut.
 *
 *  1. Par défaut · les couloirs, le contrôle « Disposition libre » non pressé.
 *  2. `?disposition=libre` · les positions DÉJÀ enregistrées sont relues telles
 *     quelles (style et attributs de la carte).
 *  3. Bascule · le mode vit dans l'adresse, `version` est gardé.
 *  4. Clavier · une flèche sur une carte déplace CETTE carte d'un pas, une
 *     écriture (la seule position de cette carte, révision attendue),
 *     l'annonce `aria-live` dit le sens et la position atteinte.
 *  5. Consulter (ajuster, zoomer, choisir, centrer) n'écrit rien.
 *  6. Réinitialiser · inactif sans position, une écriture explicite sinon,
 *     les cartes reprennent leur place automatique.
 *  7. Refus de lecture · le contrôle reste visible, inactif, avec sa raison.
 *  8. « Cibler Jarvis » depuis une carte de plan · la cible est choisie dans
 *     les propositions, rien n'est envoyé.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1', useRouter: () => nav }));
const appels = vi.hoisted(() => ({ enregistrer: [] as Array<{ projectId: string; disposition: DispositionCanvas; rev: number }>, reinitialiser: [] as Array<{ projectId: string; rev: number }>, conflit: false }));
vi.mock('../app/actions/studios/canvas', () => ({
  enregistrerDispositionCanvas: async (e: { projectId: string; disposition: DispositionCanvas; rev: number }) => {
    appels.enregistrer.push(e);
    return appels.conflit
      ? { ok: false, code: 'VERSION_CONFLICT', message: 'Ta disposition a changé dans un autre onglet (révision 9) · recharge la page pour reprendre la plus récente.', traceId: 't' }
      : { ok: true, disposition: e.disposition, rev: e.rev + 1 };
  },
  reinitialiserDispositionCanvas: async (e: { projectId: string; rev: number }) => { appels.reinitialiser.push(e); return { ok: true, disposition: { positions: {} }, rev: e.rev + 1 }; },
  lireCanvasProjet: async () => { throw new Error('non utilisé · la page lit côté serveur'); },
}));
const actions = vi.hoisted(() => ({
  proposerPatch: vi.fn(), proposerBrief: vi.fn(), creerPropositionManuelle: vi.fn(), appliquerProposition: vi.fn(), rejeterProposition: vi.fn(),
  listerPropositions: vi.fn(), inspecterProposition: vi.fn(), chatThreadAction: vi.fn(async () => ({ thread: undefined })), exporterBrief: vi.fn(),
  creerVariante: vi.fn(), iterer: vi.fn(), relireApprentissage: vi.fn(),
}));
vi.mock('../app/actions/studios/propositions', () => actions);
vi.mock('../app/actions/jarvis-chat', () => actions);
vi.mock('../app/actions/studios/sources', () => actions);
vi.mock('../app/actions/studios/variantes', () => actions);
vi.mock('../app/actions/studios/tests', () => actions);
vi.mock('../app/actions/studios/projets', () => actions);

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Projet } = await import('../spatial/vues/projet/Projet');
type PropsProjet = import('../spatial/vues/projet/types').PropsProjet;
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'K', initiales: 'K', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};

const modele = deriverCanvas(contenuVideo());
const PLAN = modele.cartes.find((c) => c.cibleJarvis?.startsWith('shot:'))!;
const AUTRE = modele.cartes.find((c) => c.id !== PLAN.id && c.nature === 'calcul')!;
const DIM = Object.fromEntries(modele.cartes.map((c) => [c.id, { w: 220, h: 160 }]));
const auto = (id: string) => positionAuto({ ...modele, dimensions: DIM }, id)!;

const liste = {
  ok: true as const, projectId: 'p1', versionCourante: { id: 'v3', n: 3 }, propositions: [], peutProposer: true,
  jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.02, mentionCout: 'Appel texte payant · 0,02 $ au plus.' },
  cibles: [{ cible: PLAN.cibleJarvis!, libelle: PLAN.libelleCibleJarvis!, champs: [] }, { cible: 'brief', libelle: 'Brief', champs: [] }],
};

function props(o: Partial<PropsProjet> & { positions?: DispositionCanvas['positions']; rev?: number } = {}): PropsProjet {
  const { positions = {}, rev = 4, ...reste } = o;
  return {
    projet: { id: 'p1', titre: 'Projet', sousTitre: 'Marque · Vidéo · V3', kind: 'video' },
    pastille: { classe: 'c', libelle: 'Enregistré · version 3', icone: 'check' },
    exporterHref: null,
    generer: { href: null, libelle: 'Préparer la vidéo…', raison: 'Non activé' },
    couloirs: [{ cle: 'contexte', titre: 'Contexte', noeuds: [] }],
    aideCanvas: '1 nœud',
    jarvis: {
      projectId: 'p1', marque: 'Marque', sousTitre: 'Dans ce projet', message: 'Bonjour', fil: null, erreurFil: null, suggestion: null, actions: [],
      mentionCout: null, mentionConversation: 'Aucun crédit.', versionCourante: { id: 'v3', n: 3 }, preparerHref: null, conversationOuverte: false,
    },
    brief: {
      projectId: 'p1', versionId: 'v3', versionN: 3, ancienne: false, titreBrief: 'Brief · version 3', etatBrief: 'vide', champs: [], references: [], produit: null,
      veilleHref: null, fiche: null, manques: [], versions: [], atelier: [], exportBrief: { autorise: false, possible: false },
      propositions: { initial: liste as never, versionCourante: { id: 'v3', n: 3 } },
    },
    creations: {
      projectId: 'p1', versionCouranteId: 'v3', lots: [], messageVide: 'Aucun lot.', editeurHref: null, preparerHref: null, videoHref: null, variantes: [],
      erreurVariantes: null, relecture: { disponible: false, mention: null, raison: null, coutMaxUsd: null }, taches: [], erreurTaches: null, peutProposer: false, adsmap: null, relire: false,
    },
    libre: { ok: true, canvas: { projectId: 'p1', version: { id: 'v3', n: 3, courante: true }, modele, apercus: {}, disposition: { positions }, rev } },
    ...reste,
  };
}

let root: Root;
let hote: HTMLDivElement;
beforeEach(() => {
  appels.enregistrer.length = 0; appels.reinitialiser.length = 0; appels.conflit = false;
  window.history.replaceState(null, '', '/studio/projets/p1?version=v3');
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
});
afterEach(() => { act(() => root.unmount()); hote.remove(); document.body.innerHTML = ''; });

const monter = (p: PropsProjet) => act(() => root.render(<FournisseurSpatial value={CTX}><Projet {...p} /></FournisseurSpatial>));
const q = <T extends Element = HTMLElement>(s: string) => hote.querySelector<T & HTMLElement>(s);
const chip = (texte: string) => [...hote.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte || b.getAttribute('aria-label') === texte);
const cliquer = async (b: HTMLElement | null | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { b!.click(); }); };
const touche = async (el: HTMLElement, key: string, shiftKey = false) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })); }); };
const carte = (id: string) => q<HTMLButtonElement>(`[data-carte="${CSS.escape(id)}"]`)!;
const vider = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });

describe('Spatial · fiche projet · disposition libre', () => {
  it('par défaut · les couloirs de la maquette, « Disposition libre » offert et non pressé', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Projet {...props()} /></FournisseurSpatial>);
    expect(html).toContain('class="lanes"');
    expect(html).not.toContain('data-canvas-libre');
    expect(html).toMatch(/data-disposition-libre="" aria-pressed="false"[^>]*>.*Disposition libre/);
  });

  it('`?disposition=libre` · les positions DÉJÀ enregistrées sont relues telles quelles, les autres cartes à leur place automatique', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Projet {...props({ dispositionInitiale: 'libre', positions: { [PLAN.id]: { x: 1234, y: -56 } } })} /></FournisseurSpatial>);
    expect(html).not.toContain('class="lanes"');
    expect(html).toContain('data-canvas-libre="p1"');
    expect(html).toMatch(new RegExp(`data-carte="${PLAN.id}"[^>]*data-x="1234" data-y="-56"[^>]*style="position:absolute;left:1234px;top:-56px`));
    const a = auto(AUTRE.id);
    expect(html).toMatch(new RegExp(`data-carte="${AUTRE.id}"[^>]*data-x="${a.x}" data-y="${a.y}"`));
    // Une carte par carte du modèle, chacune un `.node` de la maquette.
    expect(html.match(/class="node[^"]*" data-carte=/g)).toHaveLength(modele.cartes.length);
    expect(html).toContain('1 placée à la main');
  });

  it('la bascule vit dans l’adresse · `disposition=libre` posé puis retiré, `version` gardé, rien d’écrit', async () => {
    monter(props());
    await cliquer(chip('Disposition libre'));
    expect(window.location.search).toBe('?version=v3&disposition=libre');
    expect(q('[data-canvas-libre]')).not.toBeNull();
    expect(q('.lanes')).toBeNull();
    expect(chip('Disposition libre')!.getAttribute('aria-pressed')).toBe('true');
    await cliquer(chip('Disposition libre'));
    expect(window.location.search).toBe('?version=v3');
    expect(q('.lanes')).not.toBeNull();
    expect(appels.enregistrer).toHaveLength(0);
  });

  it('clavier · une flèche déplace la carte qui a le focus, UNE écriture (cette seule position, révision attendue), annonce aria-live', async () => {
    monter(props({ dispositionInitiale: 'libre', positions: { [PLAN.id]: { x: 100, y: 200 } }, rev: 4 }));
    const k = carte(PLAN.id);
    k.focus();
    // Avant la réponse du serveur · l'annonce et « Enregistrement… ».
    act(() => { k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    const live = q('[data-canvas-message]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe(`« ${PLAN.titre} » déplacée à droite · position 116, 200. Enregistrement de ta disposition…`);
    await vider();
    expect(live.textContent).toBe(`« ${PLAN.titre} » déplacée à droite · position 116, 200. Position enregistrée pour toi · l’ordre et les dépendances n’ont pas changé.`);
    expect(appels.enregistrer).toHaveLength(1);
    expect(appels.enregistrer[0]).toEqual({ projectId: 'p1', disposition: { positions: { [PLAN.id]: { x: 116, y: 200 } } }, rev: 4 });
    expect(carte(PLAN.id).style.left).toBe('116px');
    // Maj · grand pas, la révision suit la réponse du serveur.
    await touche(carte(PLAN.id), 'ArrowDown', true);
    await vider();
    expect(appels.enregistrer[1]).toEqual({ projectId: 'p1', disposition: { positions: { [PLAN.id]: { x: 116, y: 264 } } }, rev: 5 });
  });

  it('consulter n’écrit rien · ajuster, zoomer, choisir, centrer, touches du fond', async () => {
    monter(props({ dispositionInitiale: 'libre' }));
    await cliquer(chip('Ajuster'));
    await cliquer(chip('Zoom avant'));
    await cliquer(chip('Zoom arrière'));
    await cliquer(carte(PLAN.id));
    expect(q(`[data-detail-carte="${CSS.escape(PLAN.id)}"]`)).not.toBeNull();
    await cliquer(chip('Centrer la sélection'));
    await touche(q('[data-canvas-zone]')!, '+');
    await touche(q('[data-canvas-zone]')!, '0');
    await vider();
    expect(appels.enregistrer).toHaveLength(0);
    expect(appels.reinitialiser).toHaveLength(0);
  });

  it('réinitialiser · inactif sans position ; sinon une écriture explicite, les cartes reprennent leur place automatique', async () => {
    monter(props({ dispositionInitiale: 'libre' }));
    expect(chip('Réinitialiser la disposition')!.disabled).toBe(true);
    act(() => root.unmount());
    root = createRoot(hote);
    monter(props({ dispositionInitiale: 'libre', positions: { [PLAN.id]: { x: 999, y: 999 } }, rev: 7 }));
    expect(carte(PLAN.id).style.left).toBe('999px');
    await cliquer(chip('Réinitialiser la disposition'));
    await vider();
    expect(appels.reinitialiser).toEqual([{ projectId: 'p1', rev: 7 }]);
    expect(appels.enregistrer).toHaveLength(0);
    const a = auto(PLAN.id);
    expect(carte(PLAN.id).style.left).toBe(`${a.x}px`);
    expect(q('[data-canvas-message]')!.textContent).toContain('Disposition réinitialisée');
  });

  it('conflit de révision · rien d’écrasé, l’écran le dit et garde les positions', async () => {
    appels.conflit = true;
    monter(props({ dispositionInitiale: 'libre' }));
    await touche(carte(PLAN.id), 'ArrowLeft');
    await vider();
    expect(q('[data-canvas-message]')!.textContent).toMatch(/déplacée à gauche · position \d+, \d+\. Attention · Ta disposition a changé dans un autre onglet.*Tes positions restent affichées ici\.$/);
    expect(q('[data-canvas-message]')!.dataset.canvasMessage).toBe('err');
    expect(carte(PLAN.id).style.left).toBe(`${auto(PLAN.id).x - 16}px`);
  });

  it('lecture refusée · le contrôle reste visible, inactif, avec sa raison ; `?disposition=libre` garde les couloirs', () => {
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Projet {...props({ dispositionInitiale: 'libre', libre: { ok: false, raison: 'La disposition libre n’est pas activée pour cet espace.' } })} /></FournisseurSpatial>);
    expect(html).toContain('class="lanes"');
    expect(html).toMatch(/data-disposition-libre="" aria-pressed="false" disabled=""/);
    expect(html).toMatch(/<p [^>]*data-libre-raison=""[^>]*>La disposition libre n’est pas activée pour cet espace\.<\/p>/);
  });

  it('« Cibler Jarvis » depuis une carte de plan · la cible est choisie dans les propositions, rien n’est envoyé', async () => {
    monter(props({ dispositionInitiale: 'libre' }));
    await cliquer(carte(PLAN.id));
    await cliquer(q(`[data-detail-carte] [data-cibler-jarvis="${CSS.escape(PLAN.cibleJarvis!)}"]`));
    expect((q('#propositions select') as HTMLSelectElement).value).toBe(PLAN.cibleJarvis);
    expect(q('#propositions')!.textContent).toContain(`Cible « ${PLAN.libelleCibleJarvis} » choisie`);
    expect(actions.proposerPatch).not.toHaveBeenCalled();
    expect(actions.proposerBrief).not.toHaveBeenCalled();
  });
});

describe('Spatial · fiche projet · « Ouvrir l’image » (galerie de la fiche V5)', () => {
  it('une sortie livrée s’ouvre en grand dans un nouvel onglet · une sortie sans média n’offre pas le geste', () => {
    const base = props();
    const lot = { jobId: 'j1', titre: 'Lot 1', version: 'Version 3', etat: { libelle: 'Prête', classe: 'g', pret: true } as never, qualite: 'Contrôlée', message: null };
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Projet {...props({ ongletInitial: 'crea', creations: { ...base.creations, lots: [{ ...lot, sorties: [
      { assetId: 'a1', libelle: 'Lot 1 · 1', apercu: '/api/studios/media/a1', detail: '1080 × 1350', choisir: false, raison: null, varianteId: null },
      { assetId: 'a2', libelle: 'Lot 1 · 2', apercu: null, detail: '', choisir: false, raison: null, varianteId: null },
    ] }] } })} /></FournisseurSpatial>);
    expect(html.match(/data-ouvrir-image/g)).toHaveLength(1);
    expect(html).toMatch(/<a class="btn sm" href="\/api\/studios\/media\/a1" target="_blank" rel="noopener noreferrer" data-ouvrir-image="">/);
  });
});

describe('Spatial · fiche projet · « Revenir à la recherche de Veille » (fiche V5, lot 18B)', () => {
  it('un projet né d’une carte de Veille ramène à la recherche, terme dit · sans contexte, rien', () => {
    const avec = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Projet {...props({ retourVeille: { href: '/veille?q=routine#ad-meta-1', terme: 'routine' } })} /></FournisseurSpatial>);
    expect(avec).toMatch(/<a class="btn sm" data-retour-veille="" href="\/veille\?q=routine#ad-meta-1">.*Revenir à la recherche de Veille · « routine »<\/a>/);
    const sans = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Projet {...props()} /></FournisseurSpatial>);
    expect(sans).not.toContain('data-retour-veille');
  });
});

describe('Spatial · fiche projet · provenance des références (fiche V5)', () => {
  it('chaque référence dit son statut, son droit, ses ressources ; une source retirée s’ouvre d’office et n’a plus de lien ; les illisibles sont comptées', () => {
    const base = props();
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}><Projet {...props({ ongletInitial: 'brief', brief: { ...base.brief, sourcesIllisibles: '1 référence de source illisible · ignorée.', references: [
      { id: 's1', titre: 'Lumière', detail: 'Annonce observée en Veille · meta', apercu: null, href: '/veille?q=serum', libelleLien: 'Voir la source dans la Veille', provenance: { statut: 'active', etat: 'Accessible', lignes: ['Droit · observation publique, structure seulement · empreinte abc', 'Ressources · aucune'] } },
      { id: 's2', titre: 'Retirée', detail: 'Annonce sauvegardée · meta · plus accessible', apercu: null, href: null, libelleLien: 'Voir la sauvegarde', provenance: { statut: 'supprimee', etat: 'Source retirée · depuis le 20/10/2026 · observations conservées', lignes: ['La source n’est plus accessible · aucun lien.'] } },
    ] } })} /></FournisseurSpatial>);
    expect(html).toMatch(/data-source="s1" data-statut="active">.*<details style="font-size:11.5px"><summary class="faint">Accessible<\/summary>.*Droit · observation publique.*Voir la source dans la Veille/);
    expect(html).toMatch(/data-source="s2" data-statut="supprimee">.*<details style="font-size:11.5px" open=""><summary class="faint">Source retirée · depuis le 20\/10\/2026 · observations conservées<\/summary>.*La source n’est plus accessible · aucun lien\./);
    expect(html).toMatch(/data-sources-illisibles="">1 référence de source illisible · ignorée\./);
  });
});

describe('Spatial · disposition libre · cartes, liens et miniatures (porté de L8-D)', () => {
  it('toutes les cartes du modèle, dans son ordre ; autant de liens que de dépendances ; l’état du média écrit', () => {
    monter(props({ dispositionInitiale: 'libre' }));
    expect([...hote.querySelectorAll<HTMLElement>('[data-canvas-zone] [data-carte]')].map((e) => e.dataset.carte)).toEqual(modele.cartes.map((c) => c.id));
    expect(hote.querySelectorAll('[data-liens-canvas] polyline')).toHaveLength(modele.liens.length);
    expect(carte('keyframe:s_produit').textContent).toContain('Pas encore produit');
  });

  it('les liens vivent dans la zone rognée · le détail est hors de la zone', async () => {
    monter(props({ dispositionInitiale: 'libre' }));
    const zone = q('[data-canvas-zone]')!;
    expect(zone.style.overflow).toBe('hidden');
    expect(zone.contains(q('[data-liens-canvas]'))).toBe(true);
    await cliquer(carte(PLAN.id));
    const detail = q('[data-detail-carte]')!;
    expect(detail).not.toBeNull();
    expect(zone.contains(detail), 'le détail est DANS la zone du canvas').toBe(false);
  });

  it('miniatures · seulement les aperçus fournis ; une image qui ne se charge pas est masquée, la carte garde son titre', () => {
    const base = props({ dispositionInitiale: 'libre' });
    const c = (base.libre as { ok: true; canvas: import('../spatial/vues/projet/types').CanevasLibre }).canvas;
    monter({ ...base, libre: { ok: true, canvas: { ...c, apercus: { 'keyframe:s_produit': '/api/studios/media/image-attachee' } } } });
    const k = carte('keyframe:s_produit');
    expect(k.querySelector('img')?.getAttribute('src')).toBe('/api/studios/media/image-attachee');
    expect(hote.querySelectorAll('[data-canvas-zone] img')).toHaveLength(1);
    act(() => k.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(k.querySelector('img')!.hidden).toBe(true);
    expect(k.textContent).toContain('Image clé');
    expect(appels.enregistrer).toEqual([]);
  });
});

describe('Spatial · fiche projet · une ancre ouvre l’onglet qui la porte (fiche V5 · liens de tâches et de variantes)', () => {
  afterEach(() => { window.location.hash = ''; });
  it('#variantes et #taches ouvrent « Créations », #propositions ouvre « Brief & références »', () => {
    window.location.hash = '#variantes';
    monter(props());
    expect(q('[data-ptab="crea"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('#variantes')).not.toBeNull();
    act(() => { window.location.hash = '#propositions'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(q('[data-ptab="brief"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
