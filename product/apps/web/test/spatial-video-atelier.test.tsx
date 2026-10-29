// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Atelier vidéo Spatial (`spatial/vues/projet/Video.tsx`) · les comportements
 * que gardaient les écrans V5 retirés (`EcranVideo`, `VueVideo`,
 * `VideoAssistant` · tests `l6a-ecran-rendu`, `l8b-focus-video`,
 * `livrables-prototype-rendu`), PORTÉS sur la vue Spatial, lus dans le DOM
 * monté (jsdom) :
 *
 *  · valeurs · chaque champ du plan choisi dans SA case, clip livré lisible,
 *    texte hostile rendu comme texte ;
 *  · prix avant le clic · image clé (crédits ET dollars), consigne, clip ;
 *  · refus et droits · indisponibilités dites (sans release, sans fournisseur
 *    d'images ou d'animation, consigne périmée, lecteur), aucun geste actif
 *    qui ne mènerait nulle part ;
 *  · chaque geste de montage montre son impact AVANT tout envoi, puis UNE
 *    action ; storyboard relu avant d'être retenu ; verrou d'appel payant ;
 *  · focus · l'aperçu qui s'ouvre le prend, Échap = « Ne rien changer »,
 *    refermé il revient au geste, le message de retour le prend ;
 *  · conflit et hors ligne disent un MOT et donnent le geste suivant.
 * La relance après réponse perdue et l'aperçu périmé sont gardés par
 * `spatial-video-confirmation.test.tsx` et `l6a-video-db.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  appliquerOperationVideo: vi.fn(), planifierStoryboard: vi.fn(), compilerConsignePlan: vi.fn(), retenirConsignePlan: vi.fn(),
  demanderDevisKeyframe: vi.fn(), approuverEtLancerKeyframe: vi.fn(), demanderDevisClip: vi.fn(), approuverEtLancerClip: vi.fn(), assemblerVideoFinale: vi.fn(),
}));
const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/sp/studio/projets/p1/video', useRouter: () => nav }));
vi.mock('../app/actions/studios/video', () => m);

import {
  disponibiliteVideo, timelineDesPlans, segmentsPlans, prixImage, messageHorsLigneStudio, libelleAnimationIndisponible, LIBELLE_ANIMATION_SANS_FOURNISSEUR,
  MESSAGE_REPONSE_PERDUE_MONTAGE, gesteVideoReessayable,
  type ContenuVersion, type PlanStudio, type EntreeDisponibiliteVideo,
} from '@tiktrends/core';

import { MESSAGE_APPEL_PAYANT } from '../lib/studios/appel-payant';

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Video } = await import('../spatial/vues/projet/Video');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
type DonneesVideo = import('../lib/studios/video/lecture').VueVideo;
type KeyframeVue = import('../lib/studios/video/lecture').KeyframeVue;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 100, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};

const TOUT: EntreeDisponibiliteVideo = { peutGenerer: true, peutProposer: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, decodeurVideo: false, briefPresent: true };

const plan = (shotId: string, o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId, purpose: 'Accroche', subject: 'Léa devant le miroir', action: 'regarde son reflet', framing: 'plan rapproché', camera: 'travelling avant lent',
  lighting: 'matin', environment: 'salle de bain', referenceIds: ['c_lea'], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000, ...o,
});

function contenu(): ContenuVersion {
  const c: ContenuVersion = {
    brief: null, productRef: null, styleRef: null, characterRefs: { c_lea: { tenue: 'veste jaune' } },
    shots: { order: ['s1', 's2', 's3'], byId: {
      s1: plan('s1', { narration: 'Tu en as marre des boutons ?', speechMode: 'voiceover', onScreenText: ['Marre des boutons ?'] }),
      s2: plan('s2', { purpose: 'Problème', subject: 'Léa touche sa joue', action: 'soupire', narration: 'Chaque matin, la même déception.', speechMode: 'voiceover' }),
      s3: plan('s3', { purpose: 'Appel à l’action', subject: 'le flacon', action: 'tourne', camera: 'fixe', referenceIds: [] }),
    } },
    document: null, timeline: null,
  };
  return { ...c, timeline: { ...timelineDesPlans(c, null), music: { assetId: 'a_musique', gainDb: -12 } } };
}

const kf = (o: Partial<KeyframeVue> = {}): KeyframeVue => ({ etat: 'a_produire', media: null, retenue: null, enAttente: null, devis: null, ...o });
const CONSIGNE = { runId: '11111111-1111-4111-8111-111111111111', instruction: 'Léa en veste jaune devant le miroir.', interdits: ['Aucun texte dans l’image : les textes sont posés au montage.'], composants: [], compileeLe: '2026-10-08T10:00:00Z' };

function vue(o: Partial<DonneesVideo> = {}, dispo: EntreeDisponibiliteVideo = TOUT): DonneesVideo {
  const c = o.contenu ?? contenu();
  return {
    projet: { id: 'p1', titre: 'Sérum' }, version: { id: 'v3', n: 3 }, contenu: c, briefPresent: true, sansTexte: false,
    format: { largeur: 1080, hauteur: 1920, libelle: 'Vertical · 9:16', depuisBrief: false },
    segments: segmentsPlans(c).map((s) => ({ shotId: s.shotId, rang: s.rang + 1, debutMs: s.debutMs, dureeMs: s.dureeMs, estimee: true })),
    dureeTotaleMs: 9000,
    keyframes: {
      s1: kf({ etat: 'valide', media: { assetId: '22222222-2222-4222-8222-222222222222', url: '/api/studios/media/22222222-2222-4222-8222-222222222222' }, retenue: { ...CONSIGNE, verdict: { ok: true } } }),
      s2: kf(),
      s3: kf({ retenue: { ...CONSIGNE, verdict: { ok: true } }, devis: { id: 'q1', inputHash: 'h'.repeat(64), credits: 4, usdMicros: 80_000, expiresAt: '2026-10-08T10:30:00Z' } }),
    },
    mediasValides: ['keyframe:s1'], musiques: [{ assetId: 'a_musique', libelle: 'Piste 1' }, { assetId: 'a_autre', libelle: 'Piste 2' }],
    clips: {}, prixClip: { credits: 10, usdMicros: 600_000, dureeS: 5 },
    videoFinale: { possible: false, raison: 'Le plan 1 n’a pas de clip animé valide pour cette version · anime-le avant d’assembler.', nonInclus: [], dureeMs: 0, derniere: null },
    disponibilite: disponibiliteVideo(dispo), coutTexteUsd: 0.14, prix: prixImage(), jobs: [], ...o,
  };
}

let racine: Root | null = null;
let hote: HTMLDivElement;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  nav.refresh.mockReset();
  m.appliquerOperationVideo.mockResolvedValue({ ok: true, version: { id: 'v4', n: 4 }, inchange: false, deja: false, impact: { resume: 'ok' }, durees: { phrase: '' }, signalements: [] });
  m.approuverEtLancerKeyframe.mockResolvedValue({ ok: true, job: { id: 'j1' }, deja: false });
  try { window.sessionStorage.clear(); } catch { /* rien */ }
  hote = document.createElement('div');
  document.body.appendChild(hote);
  act(() => { racine = createRoot(hote); });
});
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); });

const afficher = (v: DonneesVideo, planInitial?: string) => act(() => { racine!.render(<FournisseurSpatial value={CTX}><Video vue={v} marque="Éclat" variantesHref="/x" planInitial={planInitial} /></FournisseurSpatial>); });
const q = (s: string) => hote.querySelector(s) as HTMLElement | null;
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement | undefined;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).focus(); (b as HTMLElement).click(); }); };
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const actif = () => document.activeElement as HTMLElement | null;
const levier = (cle: string) => q(`[data-vlev="${cle}"]`) as HTMLButtonElement;
const saisir = async (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, valeur: string) => {
  await act(async () => {
    if (el instanceof HTMLSelectElement) { el.value = valeur; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, valeur);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const ouvrirScript = () => cliquer(bouton('Modifier le script'));

/* ───────────────────────────── Valeurs ───────────────────────────── */

describe('valeurs · le plan choisi, le clip, le texte', () => {
  it('VIDEO-01 · chaque champ du plan dans sa case, durée et intervalle dits', () => {
    afficher(vue());
    const champs = [...q('[data-champs-plan="s1"]')!.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling!.textContent]);
    expect(champs).toEqual([
      ['Sujet', 'Léa devant le miroir'], ['Action', 'regarde son reflet'], ['Cadrage', 'plan rapproché'], ['Caméra', 'travelling avant lent'],
      ['Lumière', 'matin'], ['Décor', 'salle de bain'], ['Narration (dite) · Voix off', 'Tu en as marre des boutons ?'], ['Texte écran (lu)', 'Marre des boutons ?'],
      ['Durée', '3,0 s · estimée · de 0,0 s à 3,0 s'],
    ]);
  });

  it('choisir le plan 2 montre SES champs', async () => {
    afficher(vue());
    await cliquer(q('[data-vsel="s2"]'));
    expect(q('[data-champs-plan="s2"]')!.textContent).toContain('Léa touche sa joue');
    expect(q('[data-champs-plan="s1"]')).toBeNull();
  });

  it('clip livré ⇒ lecteur vidéo du média, « Clip animé valide »', () => {
    afficher(vue({ clips: { s1: { etat: 'valide', keyframePrete: true, devis: null, media: { assetId: 'a', url: '/api/studios/media/a' } } } }, { ...TOUT, decodeurVideo: true, fournisseurVideo: true }));
    expect(q('[data-clip="s1"] video')?.getAttribute('src')).toBe('/api/studios/media/a');
    expect(q('[data-clip="s1"]')!.textContent).toContain('Clip animé valide');
  });

  it('texte hostile rendu comme texte', () => {
    const c = contenu();
    c.shots.byId.s1!.subject = '<img src=x onerror=alert(1)>';
    afficher(vue({ contenu: c }));
    expect(hote.querySelector('img[src="x"]')).toBeNull();
    expect(q('[data-champs-plan="s1"]')!.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

/* ───────────────────────────── Prix avant le clic ───────────────────────────── */

describe('prix annoncé AVANT le clic', () => {
  it('image clé · crédits ET dollars au devis, devis et lancement séparés, coût de la consigne dit', async () => {
    afficher(vue(), 's3');
    expect(levier('devis').textContent).toContain('40 cr.');
    await cliquer(levier('lancer'));
    expect(m.approuverEtLancerKeyframe).not.toHaveBeenCalled();
    expect(q('[data-geste="lancer"]')!.textContent).toMatch(/^Lancer l’image clé · plan 3Devis · 4 crédits · valable jusqu’à/);  // en crédits (29/10) · jamais un montant en argent
    expect(bouton('Approuver et lancer · 4 crédits')).toBeTruthy();
    await cliquer(levier('consigne'));
    expect(q('[data-geste="consigne"]')!.textContent).toContain('Appel IA · inclus · aucun crédit débité');  // en crédits (29/10)
    expect(m.compilerConsignePlan).not.toHaveBeenCalled();
  });

  it('consigne retenue · l’interdit du serveur n’a pas de point doublé', async () => {
    afficher(vue());
    await cliquer(levier('devis'));
    expect(q('[data-geste="devis"]')!.textContent).toContain('à éviter : Aucun texte dans l’image : les textes sont posés au montage');
    expect(q('[data-geste="devis"]')!.textContent).not.toContain('montage..');
  });

  it('sans consigne retenue · devis inactif, la raison est dite', () => {
    afficher(vue(), 's2');
    expect(levier('devis').disabled).toBe(true);
    expect(levier('devis').title).toBe('Retiens d’abord une consigne compilée pour ce plan.');
  });

  it('COST-01 · deux clics « Approuver et lancer » ⇒ même clé d’idempotence', async () => {
    afficher(vue(), 's3');
    await cliquer(levier('lancer'));
    await cliquer(bouton('Approuver et lancer · 4 crédits'));
    await flush();
    await cliquer(levier('lancer'));
    await cliquer(bouton('Approuver et lancer · 4 crédits'));
    await flush();
    expect(m.approuverEtLancerKeyframe).toHaveBeenCalledTimes(2);
    expect(m.approuverEtLancerKeyframe.mock.calls[0]![0].idempotencyKey).toBe(m.approuverEtLancerKeyframe.mock.calls[1]![0].idempotencyKey);
    expect(m.approuverEtLancerKeyframe.mock.calls[0]![0]).toMatchObject({ quoteId: 'q1', creditsAnnonces: 4 });
  });
});

/* ───────────────────────────── Refus et droits ───────────────────────────── */

describe('indisponibilités dites, aucun geste actif qui ne mène nulle part', () => {
  it('animation · sans décodeur, la cause est dite et aucun geste de clip n’est actif', () => {
    afficher(vue());
    expect(hote.textContent).toContain(`Animation · ${libelleAnimationIndisponible(disponibiliteVideo(TOUT).animation)}. Aucun clip n’est proposé ni facturé.`);
    expect(levier('devis-clip').disabled).toBe(true);
    expect(levier('lancer-clip').disabled).toBe(true);
  });

  it('raccord vague 7 · décodeur sondé, aucun fournisseur ⇒ le libellé dit la vraie cause, pas « aucun décodeur »', () => {
    afficher(vue({}, { ...TOUT, decodeurVideo: true }));
    expect(hote.textContent).toContain(`Animation · ${LIBELLE_ANIMATION_SANS_FOURNISSEUR}.`);
    expect(hote.textContent).not.toContain('aucun décodeur');
    expect(levier('devis-clip').disabled).toBe(true);
  });

  it('animation possible · image clé pas produite ⇒ devis du clip inactif, raison et prix ; image clé prête et devis ⇒ « Approuver et animer · 20 crédits »', async () => {
    const ANIME = { ...TOUT, decodeurVideo: true, fournisseurVideo: true };
    afficher(vue({ clips: { s2: { etat: 'a_produire', media: null, keyframePrete: false, devis: null } } }, ANIME), 's2');
    expect(levier('devis-clip').disabled).toBe(true);
    expect(levier('devis-clip').title).toBe('Produis d’abord l’image clé de ce plan : le clip part d’elle.');
    expect(levier('devis-clip').textContent).toContain('10 cr.');
    afficher(vue({ clips: { s1: { etat: 'a_produire', media: null, keyframePrete: true, devis: { id: 'qc', inputHash: 'h'.repeat(64), credits: 20, usdMicros: 600_000, expiresAt: '2026-10-08T10:30:00Z' } } } }, ANIME), 's1');
    await cliquer(q('[data-vsel="s1"]'));
    expect(levier('devis-clip').disabled).toBe(false);
    await cliquer(levier('lancer-clip'));
    expect(q('[data-geste="lancer-clip"]')!.textContent).toContain('Devis du clip · 20 crédits · valable jusqu’à'); expect(q('[data-geste="lancer-clip"]')!.textContent).not.toContain('$');  // en crédits (29/10) · jamais un montant en argent
    expect(bouton('Approuver et animer · 20 crédits')?.disabled).toBe(false);
    expect(m.approuverEtLancerClip).not.toHaveBeenCalled();
  });

  it('sans release · storyboard et consigne inactifs avec leur raison, chemin manuel ouvert', async () => {
    afficher(vue({}, { ...TOUT, releasePubliee: false }));
    expect(levier('consigne').disabled).toBe(true);
    expect(levier('consigne').title).toContain('Aucune version des consignes n’est publiée');
    await ouvrirScript();
    expect(bouton('Proposer un storyboard depuis le brief')?.disabled).toBe(true);
    expect(q('[data-cout="storyboard"]')!.textContent).toContain('Aucune version des consignes n’est publiée');
    expect(bouton('Écrire les plans à la main')?.disabled).toBe(false);
  });

  it('sans fournisseur d’images · « Lancer l’image clé » inactif avec sa raison', () => {
    afficher(vue({}, { ...TOUT, fournisseurImage: false }), 's3');
    expect(levier('lancer').disabled).toBe(true);
    expect(levier('lancer').title).toContain('Le fournisseur d’images n’est pas branché');
  });

  it('consigne périmée · le motif est dit, le devis reste inactif', () => {
    const v = vue();
    const motif = 'Le plan 1, son style, son produit ou une fiche d’identité citée a changé depuis la compilation · recompile sa consigne.';
    v.keyframes.s1 = kf({ etat: 'obsolete', retenue: { ...CONSIGNE, verdict: { ok: false, cause: 'perimee', code: 'VERSION_CONFLICT', cibles: ['keyframe:s1'], motif } } as KeyframeVue['retenue'] });
    afficher(v);
    expect(levier('devis').disabled).toBe(true);
    expect(levier('devis').title).toBe(motif);
  });

  it('vidéo sans texte · état dit, aucun bouton pour retirer un texte qui n’existe plus', async () => {
    afficher(vue({ sansTexte: true }));
    await ouvrirScript();
    expect(hote.textContent).toContain('Vidéo sans texte · aucune surimpression ni sous-titre ne sera posé.');
    expect(bouton('Retirer texte écran et sous-titres')).toBeUndefined();
  });

  it('lecteur · aucun geste de montage ni payant actif', async () => {
    afficher(vue({}, { ...TOUT, peutGenerer: false, peutProposer: false }), 's3');
    for (const cle of ['consigne', 'retenir', 'devis', 'lancer', 'devis-clip', 'lancer-clip']) expect(levier(cle).disabled, cle).toBe(true);
    await ouvrirScript();
    for (const b of ['Avancer le plan 2', 'Reculer le plan 1']) expect((q(`[aria-label="${b}"]`) as HTMLButtonElement).disabled, b).toBe(true);
    for (const t of ['Retirer texte écran et sous-titres', 'Voir l’impact', 'Proposer un storyboard depuis le brief', 'Écrire les plans à la main']) expect(bouton(t)?.disabled, t).toBe(true);
  });
});

/* ───────────────────────────── Vidéo finale ───────────────────────────── */

describe('vidéo finale', () => {
  const NON_INCLUS = ['Voix · aucun fournisseur de voix n’est branché, la narration n’est pas dite (plan 1, plan 2).', 'Texte écran · non incrusté (plan 3).'];
  const finale = (o: Partial<DonneesVideo['videoFinale']> = {}): DonneesVideo['videoFinale'] => ({ possible: true, raison: '', nonInclus: NON_INCLUS, dureeMs: 9000, derniere: null, ...o });

  it('un plan sans clip ⇒ bouton inactif, la raison nomme le plan', () => {
    afficher(vue());
    expect(bouton('Assembler la vidéo finale · 0 crédit')?.disabled).toBe(true);
    expect(q('[data-zone="video-finale"]')!.textContent).toContain('Le plan 1 n’a pas de clip animé valide pour cette version · anime-le avant d’assembler.');
  });

  it('tous les clips ⇒ ce qui n’est pas inclus est dit AVANT le clic, gratuit dit, un clic = une action d’assemblage', async () => {
    m.assemblerVideoFinale.mockResolvedValue({ ok: true, video: { assetId: 'a', url: '/api/studios/media/a', dureeMs: 9009, largeur: 1080, hauteur: 1920, nonInclus: [] } });
    afficher(vue({ videoFinale: finale() }));
    const zone = q('[data-zone="video-finale"]')!;
    for (const n of NON_INCLUS) expect(zone.textContent).toContain(n);
    expect(zone.textContent).toContain('aucun crédit, aucun coût fournisseur');
    expect(m.assemblerVideoFinale).not.toHaveBeenCalled();
    await cliquer(bouton('Assembler la vidéo finale · 0 crédit'));
    expect(m.assemblerVideoFinale).toHaveBeenCalledTimes(1);
    expect(m.assemblerVideoFinale).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(m.demanderDevisKeyframe).not.toHaveBeenCalled();
    expect(m.approuverEtLancerKeyframe).not.toHaveBeenCalled();
  });

  it('rôle sans export ⇒ bouton inactif, la raison lue au serveur est dite', () => {
    afficher(vue({ videoFinale: finale({ possible: false, raison: 'Ton rôle ne permet pas d’exporter.' }) }));
    expect(bouton('Assembler la vidéo finale · 0 crédit')?.disabled).toBe(true);
    expect(q('[data-zone="video-finale"]')!.textContent).toContain('Ton rôle ne permet pas d’exporter.');
  });

  it('dernière vidéo ⇒ lecteur et téléchargement du média, « Assembler à nouveau »', () => {
    const url = '/api/studios/media/33333333-3333-4333-8333-333333333333';
    afficher(vue({ videoFinale: finale({ derniere: { assetId: '33333333-3333-4333-8333-333333333333', url, dureeMs: 9009, creeLe: '2026-10-10T10:00:00Z' } }) }));
    expect(q('.vplayer video')?.getAttribute('src')).toBe(url);
    const lien = q('a[download]');
    expect(lien?.getAttribute('href')).toBe(url);
    expect(bouton('Assembler à nouveau · 0 crédit')).toBeTruthy();
  });
});

/* ───────────────────────────── Impact avant tout envoi ───────────────────────────── */

describe('chaque geste de montage montre son impact AVANT tout envoi', () => {
  it('à l’ouverture · aucune action appelée', () => {
    afficher(vue());
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });

  it('VIDEO-08 · « Avancer » le plan 2 · aperçu sans génération, puis UNE action de montage sur la version de l’aperçu, aucun devis', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Avancer le plan 2"]'));
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
    const zone = q('[data-zone="apercu-impact"]')!;
    expect(zone.textContent).toContain('Aucune image, animation ni voix à refaire · seuls montage, mix audio, sous-titres, export sont recalculés, sans fournisseur payant.');
    expect(zone.textContent).toContain('Médias conservés · Image clé · plan 2');
    await cliquer(bouton('Enregistrer ce changement'));
    expect(m.appliquerOperationVideo).toHaveBeenCalledTimes(1);
    expect(m.appliquerOperationVideo).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v3', operation: { type: 'ordre', ordre: ['s2', 's1', 's3'] } });
    expect(m.demanderDevisKeyframe).not.toHaveBeenCalled();
    expect(m.approuverEtLancerKeyframe).not.toHaveBeenCalled();
    expect(q('[data-zone="apercu-impact"]')).toBeNull();
  });

  it('VIDEO-05 · narration du plan 2 · durée recalculée et dite avant l’envoi, images clés conservées', async () => {
    afficher(vue());
    await ouvrirScript();
    await saisir(q('[aria-label="Plan 2 · voix off"]') as HTMLTextAreaElement, 'Chaque matin, devant le miroir, la même déception, et ce bouton qui revient toujours.');
    await cliquer(bouton('Voir l’impact'));
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
    const zone = q('[data-zone="apercu-impact"]')!;
    expect(zone.textContent).toContain('Durée totale 9,0 s → 11,6 s (plan 2 : 3,0 s → 5,6 s).');
    const refait = [...zone.querySelectorAll('p')].find((p) => p.textContent?.startsWith('Sera refait'))!.textContent!;
    expect(refait).toContain('Voix · plan 2 (génération');
    expect(refait).not.toContain('Image clé');
  });

  it('VIDEO-09 · sans texte · signalement de l’image déjà produite du plan 1, aucune génération', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(bouton('Retirer texte écran et sous-titres'));
    const zone = q('[data-zone="apercu-impact"]')!;
    expect(zone.textContent).toContain('Aucune image, animation ni voix à refaire');
    expect(zone.textContent).toContain('Plan 1 : l’image déjà produite peut contenir du texte incrusté · contrôle-la. Il ne sera pas retiré sans retouche ou nouvelle image.');
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
    await cliquer(bouton('Enregistrer ce changement'));
    expect(m.appliquerOperationVideo).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v3', operation: { type: 'sans_texte' } });
    expect(m.planifierStoryboard).not.toHaveBeenCalled();
  });

  it('VIDEO-10 · musique · choix local puis impact (mix et export seuls), seule la confirmation écrit', async () => {
    afficher(vue());
    await ouvrirScript();
    const choix = [...hote.querySelectorAll('label.field')].find((l) => l.textContent?.startsWith('Piste musicale'))!.querySelector('select')!;
    await saisir(choix, 'a_autre');
    await saisir([...hote.querySelectorAll('label.field')].find((l) => l.textContent?.startsWith('Gain'))!.querySelector('input')!, '-6');
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
    await cliquer(bouton('Voir l’impact'));
    expect(q('[data-zone="apercu-impact"]')!.textContent).toContain('Aucune image, animation ni voix à refaire · seuls mix audio, export sont recalculés, sans fournisseur payant.');
    await cliquer(bouton('Enregistrer ce changement'));
    expect(m.appliquerOperationVideo).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v3', operation: { type: 'musique', musique: { assetId: 'a_autre', gainDb: -6 } } });
    expect(m.planifierStoryboard).not.toHaveBeenCalled();
  });

  it('saisie incomplète · le refus du noyau est dit, rien n’est envoyé', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(bouton('Écrire les plans à la main'));
    await cliquer(bouton('Voir l’impact du scénario'));
    expect(q('[data-zone="apercu-impact"]')!.textContent).toContain('Le scénario n’est pas enregistré · complète les champs signalés.');
    expect(bouton('Enregistrer ce changement')?.disabled).toBe(true);
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
  });

  it('storyboard · le prix est dit avant le clic, la proposition est relue, retenue seulement après son aperçu', async () => {
    const propose = plan('s9', { purpose: 'Produit', subject: 'Flacon', action: 'Tourne', referenceIds: [] });
    m.planifierStoryboard.mockResolvedValue({ ok: true, statut: 'propose', plans: [propose], totalMs: 3000, avertissements: [] });
    afficher(vue());
    await ouvrirScript();
    expect(q('[data-cout="storyboard"]')!.textContent).toContain('Appel IA · inclus');  // en crédits (29/10) · jamais un montant en argent
    expect(m.planifierStoryboard).not.toHaveBeenCalled();
    await cliquer(bouton('Proposer un storyboard depuis le brief'));
    expect(m.planifierStoryboard).toHaveBeenCalledWith({ projectId: 'p1', nbPlans: 3, dureeCibleMs: 9000, speechMode: 'voiceover' });
    expect(q('[data-zone="storyboard-propose"]')!.textContent).toContain('Flacon');
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
    await cliquer(bouton('Voir l’impact et retenir'));
    await cliquer(bouton('Enregistrer ce changement'));
    expect(m.appliquerOperationVideo).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v3', operation: { type: 'scenario', plans: [propose] } });
  });

  it('storyboard · sans droit de montage, la proposition ne peut pas être enregistrée', async () => {
    m.planifierStoryboard.mockResolvedValue({ ok: true, statut: 'propose', plans: [plan('s9')], totalMs: 3000, avertissements: [] });
    afficher(vue({}, { ...TOUT, peutProposer: false }));
    await ouvrirScript();
    await cliquer(bouton('Proposer un storyboard depuis le brief'));
    await cliquer(bouton('Voir l’impact et retenir'));
    expect(bouton('Enregistrer ce changement')?.disabled).toBe(true);
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
  });

  it('storyboard · réponse incertaine (PROVIDER_UNCERTAIN) · verrou maintenu après remontage, aucun second appel payant', async () => {
    m.planifierStoryboard.mockResolvedValue({ ok: false, code: 'PROVIDER_UNCERTAIN', status: 409, message: 'Fournisseur incertain', targetIds: [], recoverable: true, traceId: 't' });
    afficher(vue());
    await ouvrirScript();
    await cliquer(bouton('Proposer un storyboard depuis le brief'));
    act(() => racine!.unmount());
    act(() => { racine = createRoot(hote); });
    afficher(vue());
    expect(hote.textContent).toContain(MESSAGE_APPEL_PAYANT);
    await ouvrirScript();
    expect(bouton('Proposer un storyboard depuis le brief')?.disabled).toBe(true);
    expect(m.planifierStoryboard).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem('tt-appel-payant:p1:storyboard')!)).toMatchObject({ etat: 'uncertain' });
  });
});

/* ───────────────────────────── Focus ───────────────────────────── */

describe('UX-02 · le focus suit le geste', () => {
  it('l’aperçu qui s’ouvre prend le focus · refermé sans rien, le focus revient au bouton du geste', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    expect(actif()?.getAttribute('data-zone'), 'le focus n’est pas sur l’aperçu qui vient de s’afficher').toBe('apercu-impact');
    await cliquer(bouton('Ne rien changer'));
    expect(q('[data-zone="apercu-impact"]')).toBeNull();
    expect(actif(), 'refermé sans rien, le focus n’est pas revenu au geste').toBe(q('[aria-label="Reculer le plan 1"]'));
  });

  it('Échap sur l’aperçu équivaut à « Ne rien changer »', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    act(() => { q('[data-zone="apercu-impact"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(q('[data-zone="apercu-impact"]')).toBeNull();
    expect(m.appliquerOperationVideo).not.toHaveBeenCalled();
  });

  it('le message de retour prend le focus, et son statut est un MOT', async () => {
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    await cliquer(bouton('Enregistrer ce changement'));
    expect(actif()?.getAttribute('data-retour')).toBe('ok');
    expect(actif()!.textContent).toMatch(/^Fait · Ordre des plans/);
  });
});

/* ───────────────────────────── Conflit et hors ligne ───────────────────────────── */

describe('UX-03 · conflit et hors ligne disent un mot et donnent le geste suivant', () => {
  it('conflit de version · « Recharger la version courante » relit la page et referme l’aperçu', async () => {
    m.appliquerOperationVideo.mockResolvedValue({ ok: false, code: 'VERSION_CONFLICT', status: 409, recoverable: true, targetIds: [], traceId: 't', message: 'Le projet a changé depuis cet aperçu · recalcule l’aperçu avant d’enregistrer, rien n’a été écrit.' });
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    await cliquer(bouton('Enregistrer ce changement'));
    expect(q('[data-retour="refus"]')!.textContent).toMatch(/^Conflit de version · Le projet a changé/);
    expect(q('[data-bouton="reessayer"]')).toBeNull();
    nav.refresh.mockClear();
    await cliquer(bouton('Recharger la version courante'));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(q('[data-zone="apercu-impact"]')).toBeNull();
  });

  it('enregistrer hors ligne · « Hors ligne », aperçu GARDÉ, focus sur le message ; « Réessayer » rejoue la même opération sur la même base', async () => {
    m.appliquerOperationVideo.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    afficher(vue());
    await ouvrirScript();
    await cliquer(q('[aria-label="Reculer le plan 1"]'));
    await cliquer(bouton('Enregistrer ce changement'));
    await flush();
    const r = q('[data-retour="refus"]')!;
    expect(r.textContent).toBe(`Hors ligne · ${MESSAGE_REPONSE_PERDUE_MONTAGE}Réessayer`);
    expect(actif(), 'le focus n’est pas sur le message d’échec').toBe(r);
    expect(q('[data-zone="apercu-impact"]'), 'l’aperçu (la décision en cours) a été perdu').not.toBeNull();
    await cliquer(bouton('Réessayer'));
    await flush();
    expect(m.appliquerOperationVideo).toHaveBeenCalledTimes(2);
    expect(m.appliquerOperationVideo.mock.calls[1]![0]).toEqual(m.appliquerOperationVideo.mock.calls[0]![0]);
    expect(q('[data-retour="ok"]')).not.toBeNull();
  });

  it('un appel payant hors ligne ne se rejoue pas par « Réessayer »', async () => {
    m.demanderDevisKeyframe.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    m.compilerConsignePlan.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    afficher(vue(), 's2');
    await cliquer(levier('consigne'));
    await cliquer(bouton('Compiler la consigne'));
    await flush();
    expect(q('[data-retour="refus"]')!.textContent).toContain(MESSAGE_APPEL_PAYANT);
    expect(q('[data-bouton="reessayer"]'), 'un appel payant ne se rejoue pas par « Réessayer »').toBeNull();
    expect(gesteVideoReessayable('confirmer')).toBe(true);
    expect(gesteVideoReessayable('devis:s1')).toBe(true);
    expect(gesteVideoReessayable('storyboard')).toBe(false);
    expect(gesteVideoReessayable('compiler:s1')).toBe(false);
    expect(gesteVideoReessayable('lancer:s1')).toBe(false);
    expect(messageHorsLigneStudio('enregistrement')).toContain('Connexion perdue');
  });
});
