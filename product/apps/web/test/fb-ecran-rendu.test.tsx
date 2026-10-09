// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * F-B · l'écran du parcours image au HTML RENDU.
 *
 *  · chaque état se lit en MOTS : indisponible (sans release, sans
 *    fournisseur d'images, lecteur), consigne compilée en attente, retenue
 *    prête ou bloquée, devis avec son prix en crédits ET en dollars AVANT le
 *    clic, job en file / en cours / réconciliation / échec avec raison /
 *    terminé avec média et statut qualité ;
 *  · compiler, retenir, devis, lancer : quatre boutons distincts, jamais un
 *    bouton actif pour une capacité absente ;
 *  · au montage, l'écran LIT seulement ; le clic « Approuver et lancer »
 *    garde la même clé d'idempotence d'un clic à l'autre (aucun second débit) ;
 *    un média livré en `pending` part au contrôle des composants une fois.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({
  lire: vi.fn(), compiler: vi.fn(), retenir: vi.fn(), devis: vi.fn(), lancer: vi.fn(), controler: vi.fn(), annuler: vi.fn(), trancher: vi.fn(), refresh: vi.fn(),
}));
vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: m.lire, compilerConsigneImage: m.compiler, retenirConsigneImage: m.retenir, demanderDevisImage: m.devis,
  approuverEtLancerImage: m.lancer, controlerMediaImage: m.controler,
}));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: m.annuler }));
vi.mock('../app/actions/studios/produit', () => ({ trancherComposants: m.trancher }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));

import { disponibiliteImage, verdictConsigne, qualifierDevis, type VerdictConsigne } from '@tiktrends/core';
import type { VueParcoursImage, JobImageVue, ConsigneVue } from '../lib/studios/image/parcours';
import { VueParcours, type ProprietesVueParcours } from '../components/studios/image/VueParcours';
import { ParcoursImage } from '../components/studios/image/ParcoursImage';

const TOUT = { peutGenerer: true, peutProposer: true, briefPresent: true, preparationOk: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true };
const CONSIGNE: ConsigneVue = {
  runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene', libelleMode: 'Mise en scène générée',
  generationInstruction: 'Coureur portant les lunettes et le bandeau, piste au lever du jour.', negativeConstraints: ['Pas de texte dans l’image'],
  protectedComponents: ['lunettes', 'bandeau'], liaisons: [{ referenceId: 'pph_0123456789abcdef01234567', libelle: 'Lunettes Sport Bandeau · photo 5', role: 'product', scope: 'product' }],
  format: { largeur: 1080, hauteur: 1350 }, compileeLe: '2026-10-08T10:00:00Z',
};
const OK: VerdictConsigne = { ok: true };
/** R3 · un devis d'une image (prix fixe connu) : une ligne, une BORNE · « au plus » reste vrai. */
const DEVIS_R3 = { qualification: qualifierDevis([{ operation: 'keyframe:s_image', profil: 'image_generation', unites: 1, usdMicros: 80_000, natureCout: 'borne' }]), lignes: [{ libelle: 'Image · keyframe:s_image', usdMicros: 80_000, natureCout: 'borne' as const, motifEstimation: null }] };
const job = (o: Partial<JobImageVue> = {}): JobImageVue => ({
  id: 'j1', etat: 'queued', libelleEtat: 'En file', message: 'En file · rien n’est encore envoyé au fournisseur.', raisonEchec: null, annulable: true, terminal: false,
  qualite: 'pending', libelleQualite: 'Aucun média livré pour l’instant', creditsReserves: 4, creditsRendus: null, media: null, creeLe: '2026-10-08T10:05:00Z', ...o,
});
function vue(o: Partial<VueParcoursImage> = {}, dispo = TOUT): VueParcoursImage {
  return {
    projet: { id: 'p1' }, version: { id: 'v3', n: 3 },
    modes: [{ mode: 'faithful_composite', libelle: 'Produit fidèle', pret: false }, { mode: 'generative_scene', libelle: 'Mise en scène générée', pret: true }],
    format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
    disponibilite: disponibiliteImage(dispo), coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 80_000 },
    enAttente: null, retenue: null, devis: null, jobs: [], composantsObligatoires: ['lunettes', 'bandeau'], peutRelire: dispo.peutProposer,
    controleVision: { disponible: false, borneParImageUsdMicros: 0 }, ...o,
  };
}
const gestes = () => ({ surMode: vi.fn(), surCompiler: vi.fn(), surRetenir: vi.fn(), surDevis: vi.fn(), surLancer: vi.fn(), surAnnuler: vi.fn(), surRelire: vi.fn() });
function rendre(v: VueParcoursImage, o: Partial<ProprietesVueParcours> = {}) {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(<VueParcours vue={v} mode="generative_scene" enCours={null} retour={null} questions={[]} {...gestes()} {...o} />);
  return d;
}
const bouton = (d: ParentNode, nom: string) => d.querySelector<HTMLButtonElement>(`[data-bouton="${nom}"]`);
const txt = (d: ParentNode, sel: string) => (d.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('états de l’écran · au HTML rendu', () => {
  it('sans release ni fournisseur d’images · compilation et lancement indisponibles, DITS, coût annoncé quand même', () => {
    const d = rendre(vue({}, { ...TOUT, releasePubliee: false, fournisseurImage: false }));
    expect(bouton(d, 'compiler')!.disabled).toBe(true);
    expect(txt(d, '[data-indisponible="compilation"]')).toBe('Indisponible · La compilation de la consigne image n’est pas encore activée : aucune version des consignes n’est publiée. Rien n’est facturé.');
    expect(txt(d, '[data-cout="compilation"]')).toBe('Appel texte payant · environ 0,14 $ (estimation) · borne exacte réservée avant l’envoi, sous le plafond · aucun crédit débité, aucun média produit.');
    expect(txt(d, '[data-indisponible="lancement"]')).toContain('Le fournisseur d’images n’est pas branché sur ce serveur');
    expect(bouton(d, 'devis')!.disabled).toBe(true);
    expect(bouton(d, 'lancer')).toBeNull();
    expect(txt(d, '[data-consigne="aucune"]')).toBe('Aucune consigne retenue pour ce projet.');
    expect(txt(d, '[data-etat="sans-job"]')).toBe('Aucune génération lancée pour ce projet.');
    // Un mode bloqué par le contrôle n'est pas choisissable.
    expect(d.querySelector<HTMLButtonElement>('[data-mode="faithful_composite"]')!.disabled).toBe(true);
    expect(txt(d, '[data-mode="faithful_composite"]')).toContain('bloqué par le contrôle');
  });

  it('consigne compilée, pas retenue · on la LIT (instruction, protégés, interdits, fichiers transmis) avant de la retenir', () => {
    const d = rendre(vue({ enAttente: CONSIGNE }));
    const c = d.querySelector('[data-consigne="en-attente"]')!;
    expect(txt(c, '[data-champ="instruction"]')).toBe(CONSIGNE.generationInstruction);
    expect(txt(c, '[data-champ="proteges"]')).toBe('Composants protégés : lunettes, bandeau.');
    expect(txt(c, '[data-champ="interdits"]')).toBe('Pas de texte dans l’image');
    expect(txt(c, '[data-champ="liaisons"]')).toBe('Fichiers transmis au fournisseur : Lunettes Sport Bandeau · photo 5 (rôle Produit, portée Produit).');
    expect(bouton(d, 'retenir')!.disabled).toBe(false);
    expect(c.textContent).toContain('Crée une nouvelle version du projet · aucun appel, aucun coût.');
    expect(bouton(d, 'devis')!.disabled).toBe(true);
    expect(d.textContent).toContain('Retiens d’abord une consigne compilée.');
  });

  it('consigne retenue bloquée (liaison concurrente) · le motif est écrit, le devis n’est pas proposé', () => {
    const v = verdictConsigne({ consigne: null, attestee: false, entreesCourantes: '', resolutions: new Map() });
    const bloquee: VerdictConsigne = { ok: false, cause: 'non_transmissible', code: 'UNSUPPORTED_CAPABILITY', cibles: ['src_1'], motif: 'La consigne lie src_1 (annonce concurrente ou source sans média) : le fournisseur d’images ne reçoit pas ce fichier.' };
    expect(v.ok).toBe(false);
    const d = rendre(vue({ retenue: { ...CONSIGNE, verdict: bloquee } }));
    expect(d.querySelector('[data-consigne="retenue"]')!.getAttribute('data-pret')).toBe('non');
    expect(txt(d, '[data-champ="verdict"]')).toBe(bloquee.motif);
    expect(bouton(d, 'devis')!.disabled).toBe(true);
  });

  it('devis · prix AVANT le clic en crédits et en dollars, puis « Approuver et lancer » séparé et explicite', () => {
    const d0 = rendre(vue({ retenue: { ...CONSIGNE, verdict: OK } }));
    expect(txt(d0, '[data-prix="annonce"]')).toBe('Une image · 4 crédits · 0,08 $ au plus de coût fournisseur · barème du produit.');
    expect(bouton(d0, 'devis')!.disabled).toBe(false);
    expect(d0.textContent).toContain('Le devis ne débite rien · il fige le prix pendant 30 minutes.');
    expect(bouton(d0, 'lancer')).toBeNull();
    const d = rendre(vue({ retenue: { ...CONSIGNE, verdict: OK }, devis: { id: 'q1', inputHash: 'h'.repeat(64), credits: 4, usdMicros: 80_000, expiresAt: '2026-10-08T10:30:00Z', ...DEVIS_R3 } }));
    expect(txt(d, '[data-prix="devis"]')).toBe('Devis · 4 crédits · 0,08 $ au plus de coût fournisseur · valable jusqu’à 12:30.');
    expect(bouton(d, 'lancer')!.textContent).toBe('Approuver et lancer · 4 crédits');
    expect(bouton(d, 'lancer')!.disabled).toBe(false);
    expect(d.textContent).toContain('Débite 4 crédits maintenant · rendus si aucune image n’est livrée.');
    // Fournisseur d'images absent : le bouton reste visible, inactif, avec sa raison.
    const d2 = rendre(vue({ retenue: { ...CONSIGNE, verdict: OK }, devis: { id: 'q1', inputHash: 'h', credits: 4, usdMicros: 80_000, expiresAt: '2026-10-08T10:30:00Z', ...DEVIS_R3 } }, { ...TOUT, fournisseurImage: false }));
    expect(bouton(d2, 'lancer')!.disabled).toBe(true);
    expect(d2.querySelector('[data-devis]')!.textContent).toContain('Le fournisseur d’images n’est pas branché sur ce serveur · aucun lancement possible, rien n’est débité.');
  });

  it('jobs en mots · en file, en cours, réconciliation, échec avec raison, terminé avec média et revue', () => {
    const d = rendre(vue({
      jobs: [
        job({ id: 'a' }),
        job({ id: 'b', etat: 'running', libelleEtat: 'En cours', message: 'En cours chez le fournisseur · tu peux fermer cette page, le travail continue.' }),
        job({ id: 'c', etat: 'reconciliation_required', libelleEtat: 'Réconciliation', message: 'Vérification en cours chez le fournisseur · rien n’est relancé, le coût sera réconcilié.', annulable: false }),
        job({ id: 'd', etat: 'failed', libelleEtat: 'Échec', message: 'Échec · 4 crédits rendus.', raisonEchec: 'Une référence a disparu ou changé avant l’envoi · rien n’a été envoyé au fournisseur, aucune substitution.', annulable: false, terminal: true, creditsRendus: 4 }),
        job({ id: 'e', etat: 'completed', libelleEtat: 'Terminé', message: 'Terminé · fichier enregistré, à relire avant usage.', annulable: false, terminal: true, qualite: 'requires_review', libelleQualite: 'À relire · aucun contrôle visuel automatique n’a confirmé les composants', media: { assetId: 'm1', url: '/api/studios/media/m1', largeur: 1080, hauteur: 1350 } }),
      ],
    }));
    const etats = [...d.querySelectorAll('[data-etat-job]')].map((x) => [x.getAttribute('data-etat-job'), txt(x, '[data-champ="message"]')]);
    expect(etats.map((e) => e[0])).toEqual(['queued', 'running', 'reconciliation_required', 'failed', 'completed']);
    expect(etats[0]![1]).toBe('En file · rien n’est encore envoyé au fournisseur.');
    expect(txt(d, '[data-job="d"] [data-champ="raison"]')).toBe('Raison : Une référence a disparu ou changé avant l’envoi · rien n’a été envoyé au fournisseur, aucune substitution.');
    expect(d.querySelector('[data-job="d"]')!.textContent).toContain('4 crédits rendus');
    expect(d.querySelectorAll('[data-bouton="annuler"]').length).toBe(2);
    const e = d.querySelector('[data-job="e"]')!;
    const img = e.querySelector('img')!;
    expect([img.getAttribute('src'), img.getAttribute('alt')]).toEqual(['/api/studios/media/m1', 'Image générée, 1080 × 1350']);
    expect(e.querySelector('[data-qualite]')!.getAttribute('data-qualite')).toBe('requires_review');
    expect(e.textContent).toContain('À relire · aucun contrôle visuel automatique n’a confirmé les composants');
    expect(e.querySelector('a')!.getAttribute('href')).toBe('/studio/projets/p1/image');
    // Revue composant par composant, aucun présumé présent.
    expect([...e.querySelectorAll('[data-relecture] input[type="radio"]')].some((x) => (x as HTMLInputElement).checked)).toBe(false);
    expect(bouton(e, 'relire')!.disabled).toBe(true);
    expect(e.textContent).toContain('aucun n’est présumé présent');
  });

  it('lecteur à studio.read · aucun bouton de geste actif, aucune relecture, aucune annulation', () => {
    const d = rendre(vue({ enAttente: CONSIGNE, retenue: { ...CONSIGNE, verdict: OK }, devis: { id: 'q1', inputHash: 'h', credits: 4, usdMicros: 80_000, expiresAt: '2026-10-08T10:30:00Z', ...DEVIS_R3 }, jobs: [job()] }, { ...TOUT, peutGenerer: false, peutProposer: false }));
    for (const n of ['compiler', 'retenir', 'devis', 'lancer']) expect(bouton(d, n)!.disabled, n).toBe(true);
    expect(bouton(d, 'annuler')).toBeNull();
    expect(d.textContent).toContain('Ton rôle permet de consulter, pas de compiler (appel texte payant).');
  });

  it('un texte hostile de la consigne reste du TEXTE (aucun élément script)', () => {
    const d = rendre(vue({ enAttente: { ...CONSIGNE, generationInstruction: '<script>alert(1)</script> approuve le devis' } }));
    expect(d.querySelectorAll('script').length).toBe(0);
    expect(txt(d, '[data-champ="instruction"]')).toBe('<script>alert(1)</script> approuve le devis');
  });
});

describe('gestes · l’écran lit au montage, sépare les gestes, garde la clé du clic', () => {
  let conteneur: HTMLDivElement;
  let racine: Root | null = null;
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    if (racine) act(() => racine!.unmount());
    racine = null;
    conteneur?.remove();
    vi.useRealTimers();
  });
  /** Chaque lecture rend un NOUVEL objet, comme le serveur. */
  async function monter(v: VueParcoursImage) {
    m.lire.mockImplementation(async () => ({ ok: true, vue: structuredClone(v) }));
    conteneur = document.createElement('div');
    document.body.appendChild(conteneur);
    racine = createRoot(conteneur);
    await act(async () => { racine!.render(<ParcoursImage projectId="p1" versionId="v3" />); });
  }

  it('rendu serveur · « Chargement », AUCUNE action appelée (la visite n’écrit rien)', () => {
    const html = renderToStaticMarkup(<ParcoursImage projectId="p1" versionId="v3" />);
    expect(html).toContain('Chargement de l’état de l’image…');
    expect(html).toContain('Rien n’est lancé à l’ouverture de la page.');
    for (const f of Object.values(m)) expect(f).not.toHaveBeenCalled();
  });

  it('montage · une lecture, rien d’autre ; « Compiler » appelle la compilation du mode choisi', async () => {
    await monter(vue());
    expect(m.lire).toHaveBeenCalledTimes(1);
    for (const f of [m.compiler, m.retenir, m.devis, m.lancer, m.controler]) expect(f).not.toHaveBeenCalled();
    m.compiler.mockResolvedValue({ ok: true, statut: 'questions', questions: ['Quel décor ?'], runId: null, projectVersionId: 'v3', preparation: {} });
    await act(async () => { bouton(conteneur, 'compiler')!.click(); });
    expect(m.compiler).toHaveBeenCalledWith({ projectId: 'p1', mode: 'generative_scene' });
    expect(txt(conteneur, '[data-champ="questions"]')).toContain('Quel décor ?');
    expect(m.lancer).not.toHaveBeenCalled();
  });

  it('mode proposé · celui de la consigne retenue, pas le premier de la liste', async () => {
    const deuxPrets = vue({ retenue: { ...CONSIGNE, verdict: OK } });
    deuxPrets.modes = deuxPrets.modes.map((x) => ({ ...x, pret: true }));
    await monter(deuxPrets);
    expect(conteneur.querySelector('[data-mode="generative_scene"]')!.getAttribute('aria-checked')).toBe('true');
    expect(conteneur.querySelector('[data-mode="faithful_composite"]')!.getAttribute('aria-checked')).toBe('false');
  });

  it('« Approuver et lancer » · devis affiché transmis tel quel, même clé d’un clic à l’autre (aucun second débit)', async () => {
    await monter(vue({ retenue: { ...CONSIGNE, verdict: OK }, devis: { id: 'q1', inputHash: 'h'.repeat(64), credits: 4, usdMicros: 80_000, expiresAt: '2026-10-08T10:30:00Z', ...DEVIS_R3 } }));
    m.lancer.mockResolvedValue({ ok: false, code: 'BUDGET_EXCEEDED', status: 402, message: 'Crédits insuffisants', targetIds: [], recoverable: false, traceId: 't' });
    await act(async () => { bouton(conteneur, 'lancer')!.click(); });
    await act(async () => { bouton(conteneur, 'lancer')!.click(); });
    expect(m.lancer).toHaveBeenCalledTimes(2);
    const [a, b] = m.lancer.mock.calls.map((c) => c[0] as { quoteId: string; inputHash: string; creditsAnnonces: number; idempotencyKey: string });
    expect(a).toMatchObject({ quoteId: 'q1', inputHash: 'h'.repeat(64), creditsAnnonces: 4 });
    expect(a!.idempotencyKey).toMatch(/^img-/);
    expect(b!.idempotencyKey).toBe(a!.idempotencyKey);
    expect(txt(conteneur, '[data-retour]')).toBe('Refusé · Crédits insuffisants');
    expect(m.devis).not.toHaveBeenCalled();
  });

  it('média livré en `pending` · contrôle des composants demandé UNE fois, puis relecture', async () => {
    const livre = job({ id: 'j9', etat: 'completed', terminal: true, annulable: false, media: { assetId: 'm1', url: '/api/studios/media/m1', largeur: 8, hauteur: 8 } });
    // Borné à 3 réponses : un écran qui redemanderait en boucle s'arrête et se compte.
    let n = 0;
    m.controler.mockImplementation(() => (++n <= 3 ? Promise.resolve({ ok: true, qualite: 'requires_review' }) : new Promise(() => {})));
    await monter(vue({ jobs: [livre] }));
    // Chaque relecture rend un NOUVEL objet (comme le serveur) : l'écran ne redemande pas le contrôle pour autant.
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // Après le contrôle, l'écran s'est relu ; le nouvel état (toujours `pending` ici) ne redéclenche rien.
    expect(m.lire.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(m.controler).toHaveBeenCalledTimes(1);
    expect(m.controler).toHaveBeenCalledWith({ jobId: 'j9' });
  });

  it('raccord E2 · contrôle visuel REFUSÉ (issue incertaine à réconcilier) ⇒ le refus est DIT, pas avalé', async () => {
    const livre = job({ id: 'j7', etat: 'completed', terminal: true, annulable: false, media: { assetId: 'm1', url: '/api/studios/media/m1', largeur: 8, hauteur: 8 } });
    m.controler.mockResolvedValue({ ok: false, code: 'PROVIDER_UNCERTAIN', message: 'Contrôle visuel précédent incertain · rapproche-le de la facture avant toute relance.', traceId: 't1' });
    await monter(vue({ jobs: [livre] }));
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(txt(conteneur, '[data-retour]'), 'le refus du contrôle visuel est avalé').toBe('Refusé · Contrôle visuel précédent incertain · rapproche-le de la facture avant toute relance.');
  });

  it('job non terminé · l’état se relit toutes les 4 s, sans autre geste', async () => {
    vi.useFakeTimers();
    await monter(vue({ jobs: [job({ etat: 'running', libelleEtat: 'En cours' })] }));
    expect(m.lire).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
    expect(m.lire).toHaveBeenCalledTimes(2);
    for (const f of [m.compiler, m.retenir, m.devis, m.lancer]) expect(f).not.toHaveBeenCalled();
  });
});
