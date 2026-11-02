// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Atelier vidéo des Studios (`/studio/projets/[id]/video`) · passe design, la
 * même que l'Export (#1024) et l'Éditeur d'image (#1027). On lit le DOM RENDU
 * (jsdom) · ce qu'un lecteur d'écran, un clavier ou un doigt rencontre :
 *
 *  - pendant une action serveur (geste du plan, enregistrer un changement,
 *    assembler, proposer un storyboard), le bouton pressé GARDE le focus
 *    (`aria-disabled` + `aria-busy`, jamais `disabled`) et ignore un second clic ;
 *  - quand le contrôle pressé disparaît (« Fermer » du geste, « Écarter »,
 *    « Recalculer l'aperçu », « Réessayer », « Recharger »), le focus va à ce
 *    qui le remplace, jamais au document ;
 *  - un contrôle fermé dit pourquoi, en toutes lettres à côté de lui (le `title`
 *    ne se lit ni au doigt ni au clavier) · leviers, MP4, bouton du geste ;
 *  - chaque tuile est une région nommée par son titre, le panneau du geste un
 *    groupe nommé ; les « Voir l'impact » répétés ont chacun un nom distinct ;
 *  - l'orbe « J » du bandeau n'est pas lu ; au téléphone, chaque champ du script
 *    garde un libellé visible (l'en-tête de colonnes est masqué).
 * 0 $ · les actions serveur sont simulées, rien ne part.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  appliquerOperationVideo: vi.fn(), planifierStoryboard: vi.fn(), compilerConsignePlan: vi.fn(), retenirConsignePlan: vi.fn(),
  demanderDevisKeyframe: vi.fn(), approuverEtLancerKeyframe: vi.fn(), demanderDevisClip: vi.fn(), approuverEtLancerClip: vi.fn(), assemblerVideoFinale: vi.fn(),
}));
const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/video', useRouter: () => nav }));
vi.mock('../app/actions/studios/video', () => m);

import { disponibiliteVideo, timelineDesPlans, segmentsPlans, prixImage, type ContenuVersion, type PlanStudio, type EntreeDisponibiliteVideo } from '@tiktrends/core';

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Video } = await import('../spatial/vues/projet/Video');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
type DonneesVideo = import('../lib/studios/video/lecture').VueVideo;
type KeyframeVue = import('../lib/studios/video/lecture').KeyframeVue;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 100, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const TOUT: EntreeDisponibiliteVideo = { peutGenerer: true, peutProposer: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, decodeurVideo: false, briefPresent: true };

const plan = (shotId: string, o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId, purpose: 'Accroche', subject: 'Léa devant le miroir', action: 'regarde son reflet', framing: 'plan rapproché', camera: 'travelling avant lent',
  lighting: 'matin', environment: 'salle de bain', referenceIds: [], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000, ...o,
});
function contenu(): ContenuVersion {
  const c: ContenuVersion = {
    brief: null, productRef: null, styleRef: null, characterRefs: {},
    shots: { order: ['s1', 's2', 's3'], byId: {
      s1: plan('s1', { narration: 'Tu en as marre des boutons ?', speechMode: 'voiceover', onScreenText: ['Marre des boutons ?'] }),
      s2: plan('s2', { purpose: 'Problème', subject: 'Léa touche sa joue', action: 'soupire', narration: 'Chaque matin, la même déception.', speechMode: 'voiceover' }),
      s3: plan('s3', { purpose: 'Appel à l’action', subject: 'le flacon', action: 'tourne', camera: 'fixe' }),
    } },
    document: null, timeline: null,
  };
  return { ...c, timeline: { ...timelineDesPlans(c, null), music: { assetId: 'a_musique', gainDb: -12 } } };
}
const kf = (o: Partial<KeyframeVue> = {}): KeyframeVue => ({ etat: 'a_produire', media: null, retenue: null, enAttente: null, devis: null, ...o });
const CONSIGNE = { runId: '11111111-1111-4111-8111-111111111111', instruction: 'Léa devant le miroir.', interdits: [], composants: [], compileeLe: '2026-10-08T10:00:00Z' };
const FINALE_POSSIBLE: DonneesVideo['videoFinale'] = { possible: true, raison: '', nonInclus: [], dureeMs: 9000, derniere: null };

function vue(o: Partial<DonneesVideo> = {}, dispo: EntreeDisponibiliteVideo = TOUT): DonneesVideo {
  const c = o.contenu ?? contenu();
  return {
    projet: { id: 'p1', titre: 'Sérum' }, version: { id: 'v3', n: 3 }, contenu: c, briefPresent: true, sansTexte: false,
    format: { largeur: 1080, hauteur: 1920, libelle: 'Vertical · 9:16', depuisBrief: false },
    segments: segmentsPlans(c).map((s) => ({ shotId: s.shotId, rang: s.rang + 1, debutMs: s.debutMs, dureeMs: s.dureeMs, estimee: true })),
    dureeTotaleMs: 9000,
    keyframes: {
      s1: kf({ etat: 'valide', media: { assetId: '22222222-2222-4222-8222-222222222222', url: '/api/studios/media/22222222-2222-4222-8222-222222222222' }, retenue: { ...CONSIGNE, verdict: { ok: true } } }),
      s2: kf({ enAttente: CONSIGNE }),
      s3: kf(),
    },
    mediasValides: ['keyframe:s1'], musiques: [{ assetId: 'a_musique', libelle: 'Piste 1' }],
    clips: {}, prixClip: { credits: 10, usdMicros: 600_000, dureeS: 5 },
    videoFinale: { possible: false, raison: 'Le plan 1 n’a pas de clip animé valide pour cette version · anime-le avant d’assembler.', nonInclus: [], dureeMs: 0, derniere: null },
    disponibilite: disponibiliteVideo(dispo), coutTexteUsd: 0.14, prix: prixImage(), jobs: [], ...o,
  };
}

let racine: Root | null = null;
let hote: HTMLDivElement;
const matchMediaAvant = window.matchMedia;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  nav.refresh.mockReset();
  try { window.sessionStorage.clear(); } catch { /* rien */ }
  hote = document.createElement('div');
  document.body.appendChild(hote);
  act(() => { racine = createRoot(hote); });
});
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); window.matchMedia = matchMediaAvant; });

const afficher = (v: DonneesVideo, planInitial?: string) => act(() => { racine!.render(<FournisseurSpatial value={CTX}><Video vue={v} marque="Éclat" variantesHref="/x" planInitial={planInitial} /></FournisseurSpatial>); });
const q = <T extends HTMLElement = HTMLElement>(s: string) => hote.querySelector(s) as T | null;
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement | undefined;
const levier = (cle: string) => q<HTMLButtonElement>(`[data-vlev="${cle}"]`)!;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'élément introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).focus(); (b as HTMLElement).click(); }); };
/** Laisse passer `rattraperFocus` (un `setTimeout` 0) et les promesses. */
const laisser = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const actif = () => document.activeElement as HTMLElement | null;
/** Le nom accessible · `aria-labelledby`, sinon `aria-label`, sinon `(sans nom)`. */
const nom = (el: Element | null | undefined) => {
  if (!el) return '(absent)';
  const ids = el.getAttribute('aria-labelledby');
  if (ids) return ids.split(' ').map((i) => document.getElementById(i)?.textContent ?? `(id ${i} introuvable)`).join(' ');
  return el.getAttribute('aria-label') ?? '(sans nom)';
};
const decrit = (el: Element | null | undefined) => {
  const id = el?.getAttribute('aria-describedby');
  return id ? document.getElementById(id) : null;
};
/** Une promesse que le test résout quand il veut · l'action serveur « travaille » entre-temps. */
function differee() {
  let finir: (r: unknown) => void = () => {};
  const p = new Promise((r) => { finir = r; });
  return { p, finir: (r: unknown) => act(async () => { finir(r); await p; }) };
}
/** Pressé pendant l'envoi · focalisable, occupé, sans `disabled`. */
const etatPresse = (b: HTMLButtonElement) => [b.disabled, b.getAttribute('aria-disabled'), b.getAttribute('aria-busy')];
const ouvrirScript = () => cliquer(bouton('Modifier le script'));
const telephone = () => {
  window.matchMedia = ((qm: string) => ({ matches: qm === '(max-width: 760px)', media: qm, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
};

describe('Vidéo · structure · régions et groupe nommés par leur titre', () => {
  it('chaque tuile est une région nommée par son titre visible', async () => {
    afficher(vue());
    expect([...hote.querySelectorAll('section.tile')].map(nom), 'une tuile n’est pas nommée par son titre')
      .toEqual(['Plans', 'Produire le plan 1', 'Montage · version 3', 'Plan 1 · Accroche', 'Vidéo finale', 'Générations']);
    await ouvrirScript();
    expect(nom(q('[data-zone="script"]'))).toBe('Script');
  });

  it('le panneau du geste est un groupe nommé par son libellé', async () => {
    afficher(vue());
    await cliquer(levier('devis'));
    expect(q('[data-geste="devis"]')?.getAttribute('role')).toBe('group');
    expect(nom(q('[data-geste="devis"]'))).toBe('Devis d’une variante · plan 1');
  });

  it('les « Voir l’impact » répétés ont chacun un nom distinct qui commence par le mot affiché', async () => {
    afficher(vue());
    await ouvrirScript();
    const voix = q<HTMLTextAreaElement>('[aria-label="Plan 2 · voix off"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(voix, 'Nouvelle voix.');
      voix.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const voir = [...hote.querySelectorAll('button')].filter((b) => b.textContent === 'Voir l’impact');
    expect(voir.map(nom), 'les « Voir l’impact » ne se distinguent pas').toEqual(['Voir l’impact du plan 2', 'Voir l’impact de la musique']);
  });
});

describe('Vidéo · le clavier garde sa place pendant une action serveur', () => {
  it('geste du plan · le bouton pressé garde le focus, ignore un second clic ; le geste suivant fermé dit pourquoi', async () => {
    const d = differee();
    m.demanderDevisKeyframe.mockReturnValue(d.p);
    afficher(vue());
    await cliquer(levier('devis'));
    const b = q<HTMLButtonElement>('[data-action="geste"]')!;
    await cliquer(b);
    expect(b.textContent).toBe('En cours…');
    expect(etatPresse(b), 'le bouton du geste pressé n’est pas focalisable ou ne dit pas qu’il travaille').toEqual([false, 'true', 'true']);
    expect(actif(), 'le focus a quitté le bouton du geste pendant l’envoi').toBe(b);
    await cliquer(b);
    expect(m.demanderDevisKeyframe, 'un second clic pendant l’envoi a relancé le devis').toHaveBeenCalledTimes(1);
    await d.finir({ ok: true });
    expect(actif()?.getAttribute('data-retour'), 'le message de retour n’a pas pris le focus').toBe('ok');
    // Le geste suivant (« Lancer ») s'ouvre avant la relecture · fermé mais focalisable, la raison écrite à côté.
    const lancer = q<HTMLButtonElement>('[data-action="geste"]')!;
    expect([lancer.disabled, lancer.getAttribute('aria-disabled'), lancer.style.opacity], 'fermé · focalisable, l’aspect de la maquette').toEqual([false, 'true', '0.5']);
    expect(q('[data-raison-ferme="geste"]')?.textContent).toBe('Demande d’abord un devis.');
    await cliquer(lancer);
    expect(m.approuverEtLancerKeyframe, 'un clic sur un geste fermé a lancé').not.toHaveBeenCalled();
  });

  it('consigne (appel payant) · le verrou de l’appel ne ferme pas le bouton pressé ni n’affiche de raison pendant son propre appel', async () => {
    const d = differee();
    m.compilerConsignePlan.mockReturnValue(d.p);
    afficher(vue(), 's3');
    await cliquer(levier('consigne'));
    const b = q<HTMLButtonElement>('[data-action="geste"]')!;
    await cliquer(b);
    expect(etatPresse(b), 'le verrou d’appel payant a fermé le bouton sous le focus').toEqual([false, 'true', 'true']);
    expect([b.textContent, b.style.opacity]).toEqual(['En cours…', '']);
    expect(actif()).toBe(b);
    expect(q('[data-raison-ferme="geste"]'), 'une raison de fermeture s’affiche pendant son propre appel').toBeNull();
    await cliquer(b);
    expect(m.compilerConsignePlan, 'un second clic a relancé un appel payant').toHaveBeenCalledTimes(1);
    await d.finir({ ok: true, statut: 'questions', questions: ['Quel décor ?'] });
  });

  it('« Enregistrer ce changement » garde le focus et ignore un second clic', async () => {
    const d = differee();
    m.appliquerOperationVideo.mockReturnValue(d.p);
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    const b = q<HTMLButtonElement>('[data-action="enregistrer-changement"]')!;
    await cliquer(b);
    expect(b.textContent).toBe('Enregistrement…');
    expect(etatPresse(b)).toEqual([false, 'true', 'true']);
    expect(actif()).toBe(b);
    await cliquer(b);
    expect(m.appliquerOperationVideo, 'un second clic a écrit deux fois').toHaveBeenCalledTimes(1);
    await d.finir({ ok: true, version: { id: 'v4', n: 4 }, inchange: false, deja: false, impact: { resume: 'ok' }, durees: { phrase: '' }, signalements: [] });
    expect(actif()?.getAttribute('data-retour')).toBe('ok');
  });

  it('« Assembler » garde le focus et ignore un second clic ; un autre bouton occupé ailleurs paraît fermé', async () => {
    const d = differee();
    m.assemblerVideoFinale.mockReturnValue(d.p);
    afficher(vue({ videoFinale: FINALE_POSSIBLE }));
    const b = q<HTMLButtonElement>('[data-action="assembler"]')!;
    await cliquer(b);
    expect(b.textContent).toBe('Assemblage…');
    expect(etatPresse(b)).toEqual([false, 'true', 'true']);
    expect(actif()).toBe(b);
    await cliquer(b);
    expect(m.assemblerVideoFinale).toHaveBeenCalledTimes(1);
    await cliquer(levier('devis'));
    const geste = q<HTMLButtonElement>('[data-action="geste"]');
    expect(geste, 'pendant l’assemblage, le levier est ouvert').toBeNull();
    await d.finir({ ok: true, video: { dureeMs: 9000 } });
    expect(actif()?.getAttribute('data-retour')).toBe('ok');
  });

  it('pendant l’assemblage, « Proposer un storyboard » paraît fermé, reste focalisable et ignore le clic', async () => {
    const d = differee();
    m.assemblerVideoFinale.mockReturnValue(d.p);
    afficher(vue({ videoFinale: FINALE_POSSIBLE }));
    await cliquer(q('[data-action="assembler"]'));
    await ouvrirScript();
    const b = q<HTMLButtonElement>('[data-action="proposer-storyboard"]')!;
    expect([b.disabled, b.getAttribute('aria-disabled'), b.hasAttribute('aria-busy'), b.style.opacity], 'occupé ailleurs · fermé, focalisable, l’aspect de la maquette').toEqual([false, 'true', false, '0.5']);
    expect(b.textContent).toBe('Proposer un storyboard depuis le brief');
    await cliquer(b);
    expect(m.planifierStoryboard, 'un clic pendant une autre action a lancé un appel payant').not.toHaveBeenCalled();
    await d.finir({ ok: true, video: { dureeMs: 9000 } });
  });

  it('« Proposer un storyboard » garde le focus et ignore un second clic', async () => {
    const d = differee();
    m.planifierStoryboard.mockReturnValue(d.p);
    afficher(vue());
    await ouvrirScript();
    const b = q<HTMLButtonElement>('[data-action="proposer-storyboard"]')!;
    await cliquer(b);
    expect(b.textContent).toBe('Rédaction…');
    expect(etatPresse(b)).toEqual([false, 'true', 'true']);
    expect(actif()).toBe(b);
    await cliquer(b);
    expect(m.planifierStoryboard, 'un second clic a lancé un second appel payant').toHaveBeenCalledTimes(1);
    await d.finir({ ok: true, statut: 'propose', plans: [plan('s9')], totalMs: 3000, avertissements: [] });
    expect(actif()?.getAttribute('data-retour')).toBe('ok');
  });
});

describe('Vidéo · un contrôle disparu rend le focus à ce qui le remplace', () => {
  it('« Fermer » le geste · le focus revient au levier', async () => {
    afficher(vue());
    await cliquer(levier('devis'));
    await cliquer(bouton('Fermer'));
    await laisser();
    expect(q('[data-geste]')).toBeNull();
    expect(actif(), 'le focus est tombé sur le document après « Fermer »').toBe(levier('devis'));
  });

  it('« Écarter » le storyboard · le focus revient à « Proposer un storyboard »', async () => {
    m.planifierStoryboard.mockResolvedValue({ ok: true, statut: 'propose', plans: [plan('s9')], totalMs: 3000, avertissements: [] });
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[data-action="proposer-storyboard"]'));
    await cliquer(bouton('Écarter'));
    await laisser();
    expect(q('[data-zone="storyboard-propose"]')).toBeNull();
    expect(actif(), 'le focus est tombé sur le document après « Écarter »').toBe(q('[data-action="proposer-storyboard"]'));
  });

  // Aucun rattrapage ici · les deux boutons occupent la même place, React garde le nœud (et son focus).
  it('« Recalculer l’aperçu » · le focus passe à « Enregistrer ce changement » qui le remplace', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    afficher(vue({ version: { id: 'v4', n: 4 } }));
    await cliquer(bouton('Recalculer l’aperçu'));
    await laisser();
    expect(actif(), 'le focus est tombé sur le document après « Recalculer »').toBe(q('[data-action="enregistrer-changement"]'));
  });

  it('« Réessayer » · le focus va au bouton qui travaille de nouveau, pas au document', async () => {
    const d = differee();
    m.appliquerOperationVideo.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockReturnValueOnce(d.p);
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    await cliquer(bouton('Enregistrer ce changement'));
    await laisser();
    expect(q('[data-retour="refus"] .pill')?.textContent, 'la pastille d’un envoi sans réponse').toBe('Hors ligne');
    await cliquer(q('[data-bouton="reessayer"]'));
    await laisser();
    const b = q<HTMLButtonElement>('[data-action="enregistrer-changement"]')!;
    expect(actif(), 'le focus est tombé sur le document pendant la relance').toBe(b);
    expect(etatPresse(b)).toEqual([false, 'true', 'true']);
    await d.finir({ ok: true, version: { id: 'v4', n: 4 }, inchange: false, deja: false, impact: { resume: 'ok' }, durees: { phrase: '' }, signalements: [] });
  });

  it('« Recharger la version courante » après un conflit sur l’aperçu · le focus revient au geste qui l’avait ouvert, rien ne le lui vole', async () => {
    m.appliquerOperationVideo.mockResolvedValue({ ok: false, code: 'VERSION_CONFLICT', status: 409, recoverable: true, targetIds: [], traceId: 't', message: 'Le projet a changé.' });
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    await cliquer(bouton('Enregistrer ce changement'));
    await cliquer(q('[data-bouton="recharger"]'));
    await laisser();
    expect(q('[data-zone="apercu-impact"]')).toBeNull();
    expect(actif(), 'le focus n’est pas revenu au geste « Reculer »').toBe(q('[aria-label="Reculer le plan 1"]'));
  });

  it('« Recharger la version courante » après un conflit sur un geste · le focus revient au levier', async () => {
    m.retenirConsignePlan.mockResolvedValue({ ok: false, code: 'VERSION_CONFLICT', status: 409, recoverable: true, targetIds: [], traceId: 't', message: 'Le projet a changé.' });
    afficher(vue(), 's2');
    await cliquer(levier('retenir'));
    await cliquer(q('[data-action="geste"]'));
    expect(q('[data-retour="refus"] .pill')?.textContent).toBe('Conflit de version');
    await cliquer(q('[data-bouton="recharger"]'));
    await laisser();
    expect(nav.refresh).toHaveBeenCalled();
    expect(actif(), 'le focus est tombé sur le document après « Recharger »').toBe(levier('retenir'));
  });
});

describe('Vidéo · un contrôle fermé dit pourquoi, à côté de lui', () => {
  it('leviers fermés · aucune infobulle, la raison écrite sous la grille (hors du levier estompé), reliée au levier', () => {
    afficher(vue(), 's3');
    for (const b of hote.querySelectorAll('[data-vlev]')) expect(b.hasAttribute('title'), `${b.getAttribute('data-vlev')} · raison en infobulle`).toBe(false);
    const fermes = [...hote.querySelectorAll<HTMLButtonElement>('[data-vlev]')].filter((b) => b.disabled);
    expect(fermes.map((b) => b.getAttribute('data-vlev'))).toEqual(['retenir', 'devis', 'lancer', 'devis-clip', 'lancer-clip']);
    for (const b of fermes) {
      const r = decrit(b);
      expect(r, `${b.getAttribute('data-vlev')} · aucune raison reliée`).not.toBeNull();
      expect(r!.closest('.vlev'), 'la raison est dans le levier estompé (opacité .45)').toBeNull();
      expect(r!.closest('[data-raisons-fermees]'), 'la raison n’est pas sous la grille').not.toBeNull();
      expect(r!.textContent, 'la raison ne nomme pas le levier').toContain(b.querySelector('strong')!.textContent!);
    }
    expect(decrit(levier('devis'))!.textContent).toBe('Devis de l’image clé · Retiens d’abord une consigne compilée pour ce plan.');
    expect(decrit(levier('lancer'))!.textContent).toBe('Lancer l’image clé · Demande d’abord un devis.');
    expect(decrit(levier('consigne')), 'un levier ouvert a une raison de fermeture').toBeNull();
  });

  it('une raison partagée n’est dite qu’une fois, pour tous ses leviers', () => {
    const v = vue({ clips: { s1: { etat: 'a_produire', media: null, keyframePrete: true, devis: { id: 'qc', inputHash: 'h'.repeat(64), credits: 10, usdMicros: 600_000, expiresAt: '2026-10-08T10:30:00Z' } } } }, { ...TOUT, decodeurVideo: true, fournisseurVideo: true });
    v.keyframes.s1 = { ...v.keyframes.s1!, devis: { id: 'q1', inputHash: 'h'.repeat(64), credits: 4, usdMicros: 80_000, expiresAt: '2026-10-08T10:30:00Z' } };
    v.disponibilite = { ...v.disponibilite, lancement: { disponible: false, raison: 'Les lancements sont suspendus.' } };
    afficher(v, 's1');
    expect(decrit(levier('lancer'))?.textContent).toBe('Lancer l’image clé, Animer le plan · Les lancements sont suspendus.');
    const lignes = [...hote.querySelectorAll('[data-raisons-fermees] li')].map((li) => li.textContent!.split(' · ').slice(1).join(' · '));
    expect(new Set(lignes).size, 'une même raison est répétée').toBe(lignes.length);
    expect(decrit(levier('lancer-clip')), 'les leviers d’une même raison ne partagent pas sa ligne').toBe(decrit(levier('lancer')));
  });

  it('MP4 fermé · aucune infobulle, la raison écrite sous les boutons, reliée', () => {
    afficher(vue());
    const mp4 = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'MP4')!;
    expect(mp4.disabled).toBe(true);
    expect(mp4.hasAttribute('title'), 'la raison ne vit que dans une infobulle').toBe(false);
    expect(decrit(mp4)?.getAttribute('data-raison-ferme')).toBe('mp4');
    expect(q('[data-raison-ferme="mp4"]')?.textContent).toBe('MP4 · aucune vidéo finale assemblée.');
  });

  it('MP4 · assemblage possible, la raison dit quoi faire ; vidéo finale présente, plus de raison', () => {
    afficher(vue({ videoFinale: FINALE_POSSIBLE }));
    expect(q('[data-raison-ferme="mp4"]')?.textContent).toBe('MP4 · aucune vidéo finale assemblée · assemble-la plus bas, 0 crédit.');
    afficher(vue({ videoFinale: { ...FINALE_POSSIBLE, derniere: { assetId: 'f', url: '/api/studios/media/f', dureeMs: 9000, creeLe: '2026-10-10T10:00:00Z' } } }));
    expect(q('[data-raison-ferme="mp4"]')).toBeNull();
    expect(q('a[download]')?.textContent).toBe('MP4');
  });
});

describe('Vidéo · bandeau, téléphone, champs obligatoires', () => {
  it('l’orbe « J » du bandeau d’appel payant est caché des lecteurs d’écran', () => {
    window.sessionStorage.setItem('tt-appel-payant:p1:storyboard', JSON.stringify({ etat: 'uncertain', token: 't' }));
    afficher(vue());
    const bandeau = q('.banner[role="status"]');
    expect(bandeau, 'bandeau absent').not.toBeNull();
    expect(bandeau!.querySelector('.orb')?.getAttribute('aria-hidden'), 'l’orbe « J » est lu au début de l’annonce').toBe('true');
  });

  it('téléphone · chaque champ du script porte un libellé visible (l’en-tête de colonnes est masqué) ; ordinateur · l’en-tête suffit', async () => {
    telephone();
    afficher(vue());
    await ouvrirScript();
    const rangees = [...hote.querySelectorAll('.vsc:not(.vsch)')];
    expect(rangees).toHaveLength(3);
    for (const r of rangees) {
      expect([...r.querySelectorAll('[data-libelle-champ]')].map((l) => l.textContent), 'un champ du script n’a pas de libellé visible au téléphone').toEqual(['Ce qu’on voit', 'Texte à l’écran', 'Voix off']);
      expect([...r.querySelectorAll('[data-libelle-champ]')].every((l) => l.getAttribute('aria-hidden') === 'true'), 'le libellé visible double le nom du champ').toBe(true);
    }
    act(() => racine!.unmount());
    window.matchMedia = matchMediaAvant;
    act(() => { racine = createRoot(hote); });
    afficher(vue());
    await ouvrirScript();
    expect(q('[data-libelle-champ]'), 'à l’ordinateur, l’en-tête de colonnes suffit').toBeNull();
  });

  it('plans écrits à la main · Sujet, Action et Caméra sont dits obligatoires au lecteur d’écran', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(bouton('Écrire les plans à la main'));
    const requis = (champ: string) => [...hote.querySelectorAll('label.field')].find((l) => l.textContent?.startsWith(`Plan 1 · ${champ}`))!.querySelector('input')!.getAttribute('aria-required');
    expect(['Fonction', 'Sujet *', 'Action *', 'Caméra *', 'Narration'].map(requis)).toEqual([null, 'true', 'true', 'true', null]);
  });
});
