// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { appliquerOperationVideo as appliquerNoyau, contenuVide, MESSAGE_REPONSE_PERDUE_MONTAGE, type ContenuVersion, type PlanStudio } from '@tiktrends/core';

/**
 * Studio vidéo Spatial · confirmer un changement de montage après son aperçu.
 *
 * Le serveur est SIMULÉ avec son contrat réel (version attendue · une base qui
 * n'est pas la version courante est refusée en 409 ; l'opération est rejouée
 * par le noyau, « rien ne change » est refusé). La vue se relit pendant que
 * l'aperçu est ouvert, comme le fait la relecture des jobs toutes les 4 s.
 * On lit le RÉSULTAT : les écritures que le serveur a faites, et l'écran.
 *
 *  1. Réponse perdue puis relance · la vue s'est relue entre-temps (avec le
 *     changement d'un autre onglet) : la relance ne doit pas réécrire le geste
 *     une seconde fois par-dessus.
 *  2. Aperçu périmé · le projet a changé entre l'aperçu et la confirmation :
 *     la confirmation est refusée (message clair), l'aperçu se recalcule sur
 *     la version courante, puis s'enregistre sur ELLE.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface V { id: string; n: number; contenu: ContenuVersion }
const serveur = vi.hoisted(() => ({
  courante: null as unknown as { id: string; n: number; contenu: unknown },
  ecritures: [] as Array<{ par: string; base: string; vers: string }>,
  perdreLaReponse: false,
  /** Consigne du plan s1 compilée sur v3 (`runId`), et la version qui l'a retenue. */
  consigne: { runId: 'run-1', compileeSur: 'v3', retenueDans: null as string | null, parent: null as string | null },
}));

function ecrire(par: string, baseVersionId: string, operation: unknown) {
  const c = serveur.courante as V;
  if (baseVersionId !== c.id) {
    return { ok: false as const, code: 'VERSION_CONFLICT' as const, status: 409, recoverable: true, targetIds: [], traceId: 't', message: 'Ce projet a changé depuis ton ouverture · recharge-le, puis reporte tes modifications.' };
  }
  const r = appliquerNoyau(c.contenu, operation as never, { sortiesExistantes: [] });
  if (!r.ok) return { ok: false as const, code: 'INVALID_SCHEMA' as const, status: 422, recoverable: true, targetIds: [], traceId: 't', message: r.message };
  const nouvelle: V = { id: `v${c.n + 1}`, n: c.n + 1, contenu: r.contenu };
  serveur.courante = nouvelle;
  serveur.ecritures.push({ par, base: c.id, vers: nouvelle.id });
  return { ok: true as const, version: { id: nouvelle.id, n: nouvelle.n }, inchange: false, deja: false, impact: { resume: 'Montage seul.' }, durees: { phrase: '' }, signalements: [] };
}

const actions = vi.hoisted(() => ({
  appliquerOperationVideo: vi.fn(),
  planifierStoryboard: vi.fn(), compilerConsignePlan: vi.fn(), retenirConsignePlan: vi.fn(),
  demanderDevisKeyframe: vi.fn(), approuverEtLancerKeyframe: vi.fn(), demanderDevisClip: vi.fn(), approuverEtLancerClip: vi.fn(), assemblerVideoFinale: vi.fn(),
}));
const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/sp/studio/projets/p1/video', useRouter: () => nav }));
vi.mock('../app/actions/studios/video', () => actions);

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Video } = await import('../spatial/vues/projet/Video');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
type VueVideo = import('../lib/studios/video/lecture').VueVideo;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 100, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const OUI = { disponible: true, raison: '' };
const plan = (shotId: string, i: number): PlanStudio => ({
  shotId, purpose: `Fonction ${i}`, subject: `Sujet ${i}`, action: `Action ${i}`, framing: '', camera: 'fixe', lighting: '', environment: '', referenceIds: [],
  narration: `Narration ${i}`, onScreenText: [`Texte ${i}`], speechMode: 'voiceover', estimatedDurationMs: 3000,
});

/** La vue telle que la page la relit · la version COURANTE du serveur. */
function vueDuServeur(): VueVideo {
  const c = serveur.courante as V;
  const ids = c.contenu.shots.order;
  let debut = 0;
  const segments = ids.map((id, i) => { const s = { shotId: id, rang: i + 1, debutMs: debut, dureeMs: 3000, estimee: true }; debut += 3000; return s; });
  return {
    projet: { id: 'p1', titre: 'Projet vidéo' }, version: { id: c.id, n: c.n }, contenu: c.contenu, briefPresent: true, sansTexte: false,
    format: { largeur: 1080, hauteur: 1920, libelle: '9:16', depuisBrief: true }, segments, dureeTotaleMs: debut,
    keyframes: serveur.consigne.retenueDans === null && c.id === serveur.consigne.compileeSur
      ? { s1: { etat: 'a_produire', media: null, retenue: null, devis: null, enAttente: { runId: serveur.consigne.runId, instruction: 'Plan serré sur le flacon.', interdits: [], composants: [], compileeLe: '2026-10-28T10:00:00.000Z' } } }
      : {},
    clips: {}, mediasValides: [], musiques: [],
    disponibilite: { storyboard: OUI, montage: OUI, consigne: OUI, devis: OUI, lancement: OUI, animation: OUI },
    coutTexteUsd: 0.02, prix: { credits: 4, usdMicros: 40_000 }, prixClip: { credits: 40, usdMicros: 400_000, dureeS: 5 },
    videoFinale: { possible: false, raison: 'Aucun clip', nonInclus: [], dureeMs: debut, derniere: null },
    jobs: [],
  };
}

let racine: Root | null = null;
let hote: HTMLDivElement;
const afficher = () => act(() => { racine!.render(<FournisseurSpatial value={CTX}><Video vue={vueDuServeur()} marque="M" variantesHref="/x" /></FournisseurSpatial>); });
const bouton = (texte: string) => [...hote.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte) as HTMLButtonElement | undefined;
const cliquer = async (b: Element | null | undefined) => { expect(b, 'bouton introuvable').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const ecrituresDe = (par: string) => serveur.ecritures.filter((e) => e.par === par);

beforeEach(() => {
  const contenu: ContenuVersion = { ...contenuVide(), shots: { order: ['s1', 's2', 's3'], byId: { s1: plan('s1', 1), s2: plan('s2', 2), s3: plan('s3', 3) } } };
  serveur.courante = { id: 'v3', n: 3, contenu };
  serveur.ecritures = [];
  serveur.perdreLaReponse = false;
  serveur.consigne = { runId: 'run-1', compileeSur: 'v3', retenueDans: null, parent: null };
  // « Retenir la consigne » au contrat réel · version attendue, et une relance de
  // la MÊME demande déjà écrite (fille directe de la base, même auteur, même
  // compilation) rend la version écrite (`deja: true`) · tout autre écart est un 409.
  actions.retenirConsignePlan.mockImplementation(async (e: { baseVersionId: string; runId: string }) => {
    const c = serveur.courante as V;
    let r;
    if (e.baseVersionId === c.id) {
      const nouvelle: V = { id: `v${c.n + 1}`, n: c.n + 1, contenu: c.contenu };
      serveur.courante = nouvelle;
      serveur.consigne = { ...serveur.consigne, retenueDans: nouvelle.id, parent: c.id };
      serveur.ecritures.push({ par: 'moi', base: c.id, vers: nouvelle.id });
      r = { ok: true as const, version: { id: nouvelle.id, n: nouvelle.n }, inchange: false, deja: false };
    } else if (serveur.consigne.retenueDans === c.id && serveur.consigne.parent === e.baseVersionId && e.runId === serveur.consigne.runId) {
      r = { ok: true as const, version: { id: c.id, n: c.n }, inchange: true, deja: true };
    } else {
      r = { ok: false as const, code: 'VERSION_CONFLICT' as const, status: 409, recoverable: true, targetIds: [], traceId: 't', message: 'Ce projet a changé depuis ton ouverture · recharge-le, puis reporte tes modifications.' };
    }
    if (serveur.perdreLaReponse) { serveur.perdreLaReponse = false; throw new Error('réponse perdue'); }
    return r;
  });
  actions.appliquerOperationVideo.mockImplementation(async (e: { baseVersionId: string; operation: unknown }) => {
    const r = ecrire('moi', e.baseVersionId, e.operation);
    if (serveur.perdreLaReponse) { serveur.perdreLaReponse = false; throw new Error('réponse perdue'); }
    return r;
  });
  hote = document.createElement('div'); document.body.appendChild(hote);
  act(() => { racine = createRoot(hote); });
  afficher();
});
afterEach(() => { act(() => racine?.unmount()); racine = null; hote.remove(); vi.clearAllMocks(); });

/** « Modifier le script » puis « Reculer le plan 1 » · l'aperçu de l'ordre s2, s1, s3 s'ouvre. */
async function apercuReculerPlan1() {
  await cliquer(bouton('Modifier le script'));
  await cliquer(hote.querySelector('[aria-label="Reculer le plan 1"]'));
  expect(hote.querySelector('[data-zone="apercu-impact"]'), 'aperçu absent').not.toBeNull();
}

describe('Studio vidéo Spatial · relance après une réponse perdue', () => {
  it('la vue s’est relue entre-temps · la relance ne réécrit pas le geste par-dessus le changement d’un autre onglet', async () => {
    await apercuReculerPlan1();
    serveur.perdreLaReponse = true;
    await cliquer(bouton('Enregistrer ce changement'));
    expect(ecrituresDe('moi')).toHaveLength(1);
    const apresPerte = hote.textContent ?? '';
    // Relecture (jobs en cours) puis un autre onglet remet l'ordre d'origine, relu à son tour.
    afficher();
    expect(ecrire('autre onglet', (serveur.courante as V).id, { type: 'ordre', ordre: ['s1', 's2', 's3'] }).ok).toBe(true);
    afficher();
    // La personne relance son enregistrement si l'écran le lui permet.
    const relance = bouton('Enregistrer ce changement');
    if (relance && !relance.disabled) await cliquer(relance);
    expect(ecrituresDe('moi'), 'le même geste a été écrit deux fois').toHaveLength(1);
    expect((serveur.courante as V).contenu.shots.order).toEqual(['s1', 's2', 's3']);
    expect(hote.querySelector('[data-zone="apercu-impact"]')!.textContent).toContain('Le projet a changé depuis cet aperçu');
    // L'écran ne prétendait pas que rien n'avait été écrit · il ne le savait pas.
    expect(apresPerte).toContain(MESSAGE_REPONSE_PERDUE_MONTAGE);
    expect(apresPerte).not.toContain('rien n’a été enregistré');
  });
});

describe('Studio vidéo Spatial · aperçu périmé', () => {
  it('le projet change entre l’aperçu et la confirmation · refusée, aperçu à recalculer, puis enregistré sur la version courante', async () => {
    await apercuReculerPlan1();
    // Un autre onglet change la narration du plan 3 · la vue se relit, l'aperçu reste ouvert.
    expect(ecrire('autre onglet', 'v3', { type: 'narration', shotId: 's3', narration: 'Nouvelle voix.' }).ok).toBe(true);
    afficher();
    const zone = () => hote.querySelector('[data-zone="apercu-impact"]')!;
    const enregistrer = bouton('Enregistrer ce changement');
    if (enregistrer && !enregistrer.disabled) await cliquer(enregistrer);
    expect(ecrituresDe('moi'), 'un aperçu périmé a été confirmé').toHaveLength(0);
    expect(actions.appliquerOperationVideo).not.toHaveBeenCalled();
    expect(zone().textContent).toContain('Le projet a changé depuis cet aperçu');
    expect(zone().textContent).toContain('Aperçu calculé sur la version 3, le projet est en version 4.');
    // Recalculé sur la version 4 · l'enregistrement part sur ELLE.
    await cliquer(bouton('Recalculer l’aperçu'));
    expect(zone().textContent).not.toContain('Le projet a changé depuis cet aperçu');
    await cliquer(bouton('Enregistrer ce changement'));
    expect(ecrituresDe('moi')).toEqual([{ par: 'moi', base: 'v4', vers: 'v5' }]);
    expect((serveur.courante as V).contenu.shots.order).toEqual(['s2', 's1', 's3']);
    expect((serveur.courante as V).contenu.shots.byId.s3!.narration).toBe('Nouvelle voix.');
  });
});

describe('Studio vidéo Spatial · « Retenir la consigne » relancé après une réponse perdue', () => {
  it('le message ne prétend pas que rien n’a été écrit · « Réessayer » envoie la base de la compilation et reconnaît l’écriture déjà faite', async () => {
    await cliquer(hote.querySelector('[data-vlev="retenir"]'));
    serveur.perdreLaReponse = true;
    await cliquer(bouton('Retenir cette consigne'));
    expect(ecrituresDe('moi')).toEqual([{ par: 'moi', base: 'v3', vers: 'v4' }]);
    const apresPerte = hote.querySelector('[data-retour]')?.textContent ?? '';
    expect(apresPerte, 'l’écran affirme que rien n’a été enregistré alors que l’écriture a pu aboutir').not.toContain('rien n’a été enregistré');
    expect(apresPerte).toContain(MESSAGE_REPONSE_PERDUE_MONTAGE);
    // La vue se relit (jobs en cours) · la consigne n'est plus « en attente », la relance reste offerte.
    afficher();
    await cliquer(hote.querySelector('[data-bouton="reessayer"]'));
    expect(actions.retenirConsignePlan).toHaveBeenLastCalledWith({ projectId: 'p1', baseVersionId: 'v3', runId: 'run-1' });
    expect(ecrituresDe('moi'), 'la relance a écrit une seconde version').toHaveLength(1);
    const apresRelance = hote.querySelector('[data-retour]');
    expect(apresRelance?.getAttribute('data-retour'), apresRelance?.textContent ?? '').toBe('ok');
    expect(apresRelance?.textContent).toContain('déjà retenue');
  });
});
