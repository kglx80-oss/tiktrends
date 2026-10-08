// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * L6-A · l'écran vidéo au HTML RENDU.
 *
 *  · storyboard : chaque champ d'un plan dans SA case (sujet, action, caméra,
 *    narration dite, texte écran lu, durée estimée) ;
 *  · animation : « Vidéo indisponible · aucun décodeur vidéo », aucun bouton ;
 *  · prix d'une image clé annoncé AVANT le clic, en crédits ET en dollars ;
 *  · indisponibilités dites (sans release, sans fournisseur d'images, sans
 *    consigne) : bouton inactif + raison ;
 *  · chaque geste de montage montre son IMPACT avant tout envoi (VIDEO-05,
 *    08, 09, 10) ; l'enregistrement n'appelle qu'une action, jamais un devis ;
 *  · « Approuver et lancer » garde la même clé d'un clic à l'autre.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ appliquer: vi.fn(), storyboard: vi.fn(), compiler: vi.fn(), retenir: vi.fn(), devis: vi.fn(), lancer: vi.fn(), refresh: vi.fn() }));
vi.mock('../app/actions/studios/video', () => ({
  appliquerOperationVideo: m.appliquer, planifierStoryboard: m.storyboard, compilerConsignePlan: m.compiler, retenirConsignePlan: m.retenir,
  demanderDevisKeyframe: m.devis, approuverEtLancerKeyframe: m.lancer,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));

import {
  disponibiliteVideo, timelineDesPlans, segmentsPlans, verdictConsignePlan, prixImage, LIBELLE_ANIMATION_INDISPONIBLE,
  type ContenuVersion, type PlanStudio, type EntreeDisponibiliteVideo,
} from '@tiktrends/core';
import type { VueVideo as DonneesVideo, KeyframeVue } from '../lib/studios/video/lecture';
import { VueVideo, type ProprietesVueVideo } from '../components/studios/video/VueVideo';
import { EcranVideo } from '../components/studios/video/EcranVideo';

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
const CONSIGNE = { runId: '11111111-1111-4111-8111-111111111111', instruction: 'Léa en veste jaune devant le miroir.', interdits: ['Aucun texte dans l’image'], composants: [], compileeLe: '2026-10-08T10:00:00Z' };

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
    mediasValides: ['keyframe:s1'], musiques: [{ assetId: 'a_musique', libelle: 'Piste 1' }],
    disponibilite: disponibiliteVideo(dispo), coutTexteUsd: 0.14, prix: prixImage(), jobs: [], ...o,
  };
}

const rien = () => undefined;
const props = (v: DonneesVideo, o: Partial<ProprietesVueVideo> = {}): ProprietesVueVideo => ({
  vue: v, apercu: null, storyboard: null, questions: [], enCours: null, retour: null,
  surPrevoir: rien, surConfirmer: rien, surAbandonner: rien, surStoryboard: rien, surRetenirStoryboard: rien, surEcarterStoryboard: rien,
  surCompiler: rien, surRetenirConsigne: rien, surDevis: rien, surLancer: rien, ...o,
});
const html = (p: ProprietesVueVideo) => {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(<VueVideo {...p} />);
  return d;
};
const q = (d: ParentNode, s: string) => d.querySelector(s) as HTMLElement | null;

describe('rendu · storyboard, animation, prix, indisponibilités', () => {
  it('VIDEO-01 · chaque champ du plan dans sa case', () => {
    const d = html(props(vue()));
    const champs = [...q(d, '[data-champs-plan="s1"]')!.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling!.textContent]);
    expect(champs).toEqual([
      ['Sujet', 'Léa devant le miroir'], ['Action', 'regarde son reflet'], ['Cadrage', 'plan rapproché'], ['Caméra', 'travelling avant lent'],
      ['Lumière', 'matin'], ['Décor', 'salle de bain'], ['Narration (dite) · Voix off', 'Tu en as marre des boutons ?'], ['Texte écran (lu)', 'Marre des boutons ?'],
    ]);
    expect(q(d, '[data-plan="s2"] [data-champ="duree"]')!.textContent).toBe('3,0 s · estimée · de 3,0 s à 6,0 s');
  });

  it('animation · indisponible et dite, aucun bouton d’animation', () => {
    const d = html(props(vue()));
    expect(q(d, '[data-zone="animation"]')!.textContent).toContain(`${LIBELLE_ANIMATION_INDISPONIBLE}.`);
    expect(q(d, '[data-animation="s1"]')!.textContent).toBe('Animation · Vidéo indisponible · aucun décodeur vidéo. Aucun clip n’est proposé ni facturé pour ce plan.');
    expect([...d.querySelectorAll('button')].some((b) => /anim|clip/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('prix d’une image clé annoncé avant le clic · crédits et dollars ; devis et lancement séparés', () => {
    const d = html(props(vue()));
    expect(q(d, '[data-image-cle="s2"] [data-prix="annonce"]')!.textContent).toBe('Une image clé · 4 crédits · 0,08 $ au plus de coût fournisseur · Retiens d’abord une consigne compilée pour ce plan.');
    expect((q(d, '[data-bouton="devis-s2"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q(d, '[data-image-cle="s3"] [data-prix="devis"]')!.textContent).toMatch(/^Devis · 4 crédits · 0,08 \$ au plus de coût fournisseur · valable jusqu’à/);
    expect(q(d, '[data-bouton="lancer-s3"]')!.textContent).toBe('Approuver et lancer · 4 crédits');
    expect(q(d, '[data-cout="consigne"]')!.textContent).toBe('Appel texte payant · 0,14 $ au plus · aucun crédit, aucune image.');
    expect(q(d, '[data-bouton="devis-s1"]')!.textContent).toBe('Devis d’une nouvelle variante');
  });

  it('sans release · storyboard et consigne inactifs avec leur raison, chemin manuel ouvert', () => {
    const d = html(props(vue({}, { ...TOUT, releasePubliee: false })));
    expect((q(d, '[data-bouton="storyboard"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q(d, '[data-cout="storyboard"]')!.textContent).toBe('Aucune version des consignes n’est publiée : cette tâche n’est pas encore activée. Rien n’est facturé · le chemin manuel reste ouvert.');
    expect((q(d, '[data-bouton="compiler-s2"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q(d, '[data-bouton="manuel"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sans fournisseur d’images · « Approuver et lancer » inactif avec sa raison', () => {
    const d = html(props(vue({}, { ...TOUT, fournisseurImage: false })));
    expect((q(d, '[data-bouton="lancer-s3"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q(d, '[data-devis="q1"]')!.textContent).toContain('Le fournisseur d’images n’est pas branché sur ce serveur · aucun lancement possible, rien n’est débité.');
  });

  it('consigne périmée · le motif est dit, le devis reste inactif', () => {
    const verdict = verdictConsignePlan({ shotId: 's1', rang: 1, consigne: null, attestee: false, entreesCourantes: null, resolutions: new Map() });
    const v = vue();
    v.keyframes.s1 = kf({ etat: 'obsolete', retenue: { ...CONSIGNE, verdict: { ok: false, cause: 'perimee', code: 'VERSION_CONFLICT', cibles: ['keyframe:s1'], motif: 'Le plan 1, son style, son produit ou une fiche d’identité citée a changé depuis la compilation · recompile sa consigne.' } } });
    const d = html(props(v));
    expect(verdict.ok).toBe(false);
    expect(q(d, '[data-image-cle="s1"]')!.getAttribute('data-etat-image')).toBe('obsolete');
    expect(q(d, '[data-image-cle="s1"] [data-champ="verdict"]')!.textContent).toBe('Le plan 1, son style, son produit ou une fiche d’identité citée a changé depuis la compilation · recompile sa consigne.');
    expect((q(d, '[data-bouton="devis-s1"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('vidéo sans texte · état dit, aucun bouton pour retirer un texte qui n’existe plus', () => {
    const d = html(props(vue({ sansTexte: true })));
    expect(q(d, '[data-sans-texte="oui"]')!.textContent).toContain('aucune surimpression ni sous-titre ne sera posé');
    expect(q(d, '[data-bouton="sans-texte"]')).toBeNull();
  });

  it('lecteur · aucun geste de montage ni payant actif', () => {
    const d = html(props(vue({}, { ...TOUT, peutGenerer: false, peutProposer: false })));
    for (const b of ['monter-s2', 'descendre-s1', 'sans-texte', 'musique', 'storyboard', 'manuel', 'compiler-s1', 'devis-s3', 'lancer-s3']) {
      expect((q(d, `[data-bouton="${b}"]`) as HTMLButtonElement).disabled, b).toBe(true);
    }
  });

  it('texte hostile rendu comme texte', () => {
    const c = contenu();
    c.shots.byId.s1!.subject = '<img src=x onerror=alert(1)>';
    const d = html(props(vue({ contenu: c })));
    expect(d.querySelector('img[src="x"]')).toBeNull();
    expect(q(d, '[data-champs-plan="s1"]')!.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

/* ───────────────────────────── Interactions ──────────────────────────────── */

let racine: HTMLDivElement;
let root: Root;
beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.appliquer.mockResolvedValue({ ok: true, version: { id: 'v4' }, inchange: false, impact: { resume: 'ok' }, durees: { phrase: '' }, signalements: [] });
  m.lancer.mockResolvedValue({ ok: true, job: { id: 'j1' }, deja: false });
  racine = document.createElement('div');
  document.body.appendChild(racine);
  root = createRoot(racine);
  try { window.sessionStorage.clear(); } catch { /* rien */ }
});
afterEach(() => { act(() => root.unmount()); racine.remove(); });

const monter = async (v: DonneesVideo) => { await act(async () => { root.render(<EcranVideo vue={v} />); }); };
const clic = async (sel: string) => { await act(async () => { (q(racine, sel) as HTMLButtonElement).click(); }); };
const saisir = async (sel: string, valeur: string) => {
  await act(async () => {
    const el = q(racine, sel) as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, valeur);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('chaque geste montre son impact AVANT tout envoi', () => {
  it('à l’ouverture · aucune action appelée', async () => {
    await monter(vue());
    for (const f of [m.appliquer, m.storyboard, m.compiler, m.retenir, m.devis, m.lancer]) expect(f).not.toHaveBeenCalled();
  });

  it('VIDEO-08 · « Avancer » le plan 2 · aperçu sans génération, puis UNE action de montage, aucun devis', async () => {
    await monter(vue());
    await clic('[data-bouton="monter-s2"]');
    expect(m.appliquer).not.toHaveBeenCalled();
    expect(q(racine, '[data-apercu="resume"]')!.textContent).toBe('Aucune image, animation ni voix à refaire · seuls montage, mix audio, sous-titres, export sont recalculés, sans fournisseur payant.');
    // Le seul média produit (image clé du plan 1, désormais plan 2) est nommé conservé.
    expect(q(racine, '[data-apercu="conserve"]')!.textContent).toBe('Image clé · plan 2');
    await clic('[data-bouton="confirmer"]');
    expect(m.appliquer).toHaveBeenCalledTimes(1);
    expect(m.appliquer).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v3', operation: { type: 'ordre', ordre: ['s2', 's1', 's3'] } });
    expect(m.devis).not.toHaveBeenCalled();
    expect(m.lancer).not.toHaveBeenCalled();
    expect(q(racine, '[data-zone="apercu-impact"]')).toBeNull();
  });

  it('VIDEO-05 · narration du plan 2 · durée recalculée et dite avant l’envoi, images clés conservées', async () => {
    await monter(vue());
    await clic('[data-bouton="narration-s2"]');
    await saisir('[data-plan="s2"] textarea', 'Chaque matin, devant le miroir, la même déception, et ce bouton qui revient toujours.');
    await clic('[data-bouton="voir-narration-s2"]');
    expect(m.appliquer).not.toHaveBeenCalled();
    expect(q(racine, '[data-apercu="durees"]')!.textContent).toBe('Durée totale 9,0 s → 11,6 s (plan 2 : 3,0 s → 5,6 s).');
    expect(q(racine, '[data-apercu="refait"]')!.textContent).toContain('Voix · plan 2 · génération');
    expect(q(racine, '[data-apercu="refait"]')!.textContent).not.toContain('Image clé');
  });

  it('VIDEO-09 · sans texte · signalement de l’image déjà produite du plan 1, aucune génération', async () => {
    await monter(vue());
    await clic('[data-bouton="sans-texte"]');
    expect(q(racine, '[data-apercu="resume"]')!.textContent).toMatch(/^Aucune image, animation ni voix à refaire/);
    expect([...racine.querySelectorAll('[data-apercu="signalement"]')].map((e) => e.textContent)).toEqual(['Plan 1 : l’image déjà produite peut contenir du texte incrusté · contrôle-la. Il ne sera pas retiré sans retouche ou nouvelle image.']);
  });

  it('VIDEO-10 · musique · seuls le mix et l’export', async () => {
    await monter(vue());
    await saisir('[data-zone="timeline"] input[type="number"]', '-6');
    await clic('[data-bouton="musique"]');
    expect(q(racine, '[data-apercu="resume"]')!.textContent).toBe('Aucune image, animation ni voix à refaire · seuls mix audio, export sont recalculés, sans fournisseur payant.');
  });

  it('saisie incomplète · le refus du noyau est dit, rien n’est envoyé', async () => {
    await monter(vue());
    await clic('[data-bouton="manuel"]');
    await clic('[data-bouton="voir-scenario"]');
    expect(q(racine, '[data-apercu="refus"]')!.textContent).toContain('Le scénario n’est pas enregistré · complète les champs signalés.');
    expect((q(racine, '[data-bouton="confirmer"]') as HTMLButtonElement).disabled).toBe(true);
    expect(m.appliquer).not.toHaveBeenCalled();
  });

  it('COST-01 (écran) · deux clics « Approuver et lancer » ⇒ même clé d’idempotence', async () => {
    await monter(vue());
    await clic('[data-bouton="lancer-s3"]');
    await clic('[data-bouton="lancer-s3"]');
    expect(m.lancer).toHaveBeenCalledTimes(2);
    expect(m.lancer.mock.calls[0]![0].idempotencyKey).toBe(m.lancer.mock.calls[1]![0].idempotencyKey);
    expect(m.lancer.mock.calls[0]![0]).toMatchObject({ quoteId: 'q1', creditsAnnonces: 4 });
  });
});
