// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Studios · mode « Pub entière » au HTML RENDU de l'atelier « Produit »
 * (`spatial/vues/projet/ParcoursImage.tsx`) :
 *
 *  · le choix « Textes en calques » (par défaut) / « Pub entière » est offert,
 *    chacun avec ce qu'il garantit et ce qu'il ne garantit pas ; fermé, il dit
 *    pourquoi à côté de lui ; les textes dessinés sont listés AVANT le clic ;
 *  · le choix part au serveur avec la compilation ;
 *  · consigne retenue en pub entière · prix catalogue annoncé, case du contrôle
 *    (visuel + relecture) COCHÉE par défaut avec son prix ;
 *  · un rendu relu « à reprendre » le dit, avec la raison, et rien n'est relancé.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = vi.hoisted(() => ({ lire: vi.fn(), compiler: vi.fn(), retenir: vi.fn(), devis: vi.fn(), lancer: vi.fn(), controler: vi.fn(), annuler: vi.fn(), trancher: vi.fn(), refresh: vi.fn(), accepter: vi.fn(), rejeter: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({
  lireParcoursImage: m.lire, compilerConsigneImage: m.compiler, retenirConsigneImage: m.retenir, demanderDevisImage: m.devis,
  approuverEtLancerImage: m.lancer, controlerMediaImage: m.controler,
}));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: m.annuler, accepterMedia: m.accepter, rejeterMedia: m.rejeter }));
vi.mock('../app/actions/studios/produit', () => ({ trancherComposants: m.trancher }));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/produit', useRouter: () => ({ refresh: m.refresh, push: () => {} }) }));

import { disponibiliteImage, type VerdictConsigne } from '@tiktrends/core';
import type { VueParcoursImage, JobImageVue, ConsigneVue } from '../lib/studios/image/parcours';
import { ParcoursImage } from '../spatial/vues/projet/ParcoursImage';
import { avecSpatial, CTX_TEST } from './spatial/fournisseur';

const TOUT = { peutGenerer: true, peutProposer: true, briefPresent: true, preparationOk: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true };
const COPIE = { headline: 'Tes lunettes tiennent enfin', subhead: null, benefits: [], cta: 'Je les essaie' };
const PE: NonNullable<VueParcoursImage['pubEntiere']> = {
  prix: { credits: 50, usdMicros: 49_000 }, motif: 'prix catalogue', libelleMoteur: 'GPT Image 2', borneControleParImageUsdMicros: 166_328,
  copie: COPIE, raisonSansCopie: null, ecartes: [{ texte: 'Voir', raison: 'un seul bouton par pub' }],
  formatServi: 'Format servi par le générateur · 3:4 (format du projet 4:5) · la pub n’est pas recadrée.',
};
const CONSIGNE: ConsigneVue = {
  runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene', libelleMode: 'Mise en scène générée',
  generationInstruction: 'Coureur portant les lunettes, piste au lever du jour.', negativeConstraints: [], protectedComponents: ['lunettes'], liaisons: [],
  format: { largeur: 1080, hauteur: 1350 }, compileeLe: '2026-11-16T10:00:00Z',
  typographie: 'entiere', libelleTypographie: 'Pub entière · le générateur dessine les textes et le logo', copie: COPIE,
  limitesPubEntiere: ['Non envoyé au générateur (au plus 3 : vues du produit puis logo) · sta_1 (rôle Style).', 'Format servi par le générateur · 3:4 (format du projet 4:5) · la pub n’est pas recadrée.'],
};
const OK: VerdictConsigne = { ok: true };
function vue(o: Partial<VueParcoursImage> = {}): VueParcoursImage {
  return {
    projet: { id: 'p1' }, version: { id: 'v3', n: 3 },
    modes: [{ mode: 'faithful_composite', libelle: 'Produit fidèle', pret: false }, { mode: 'generative_scene', libelle: 'Mise en scène générée', pret: true }],
    format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
    disponibilite: disponibiliteImage(TOUT), coutCompilationUsd: 0.14, prix: { credits: 40, usdMicros: 80_000 },
    enAttente: null, retenue: null, devis: null, jobs: [], composantsObligatoires: ['lunettes'], peutRelire: true,
    controleVision: { disponible: true, borneParImageUsdMicros: 147_024 }, pubEntiere: PE, ...o,
  };
}
const job = (o: Partial<JobImageVue> = {}): JobImageVue => ({
  id: 'j1', etat: 'completed', libelleEtat: 'Terminé', message: 'Terminé', raisonEchec: null, annulable: false, terminal: true,
  qualite: 'requires_review', libelleQualite: 'À relire · la relecture demande de reprendre la pub', creditsReserves: 50, creditsRendus: null,
  media: { assetId: 'a1', url: '/api/studios/media/a1', largeur: 1080, hauteur: 1350 }, creeLe: '2026-11-16T10:05:00Z', pubEntiere: true, relectureAuDevis: true,
  relecture: { statut: 'a_reprendre', libelle: 'À reprendre', raisons: ['accroche réécrit · lu « Tes lunettes tiennent » (mot manquant « enfin »)'], nonVerifie: [] }, ...o,
});

const montes: Array<{ racine: Root; d: HTMLDivElement }> = [];
afterEach(() => { for (const x of montes.splice(0)) { act(() => x.racine.unmount()); x.d.remove(); } vi.clearAllMocks(); });
function rendre(v: VueParcoursImage, regime?: 'v2') {
  const d = document.createElement('div');
  document.body.appendChild(d);
  const racine = createRoot(d);
  const ctx = regime ? { ...CTX_TEST, credits: { ...CTX_TEST.credits, regime } } : CTX_TEST;
  act(() => { racine.render(avecSpatial(<ParcoursImage projectId="p1" versionId="v3" initial={v} />, ctx)); });
  montes.push({ racine, d });
  return d;
}
const txt = (d: ParentNode, sel: string) => (d.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
const choix = (d: ParentNode, t: string) => d.querySelector<HTMLButtonElement>(`[data-typographie="${t}"]`)!;

describe('pub entière · au HTML rendu', () => {
  it('le choix est offert, « calques » par défaut, chacun dit sa portée ; pub entière liste les textes dessinés et son prix', () => {
    const d = rendre(vue());
    expect(choix(d, 'calques').getAttribute('aria-pressed')).toBe('true');
    expect(txt(d, '[data-typographie="calques"]')).toBe('Textes en calques · posés tels quels par-dessus l’image · par défaut');
    expect(txt(d, '[data-champ="portee-typographie"]')).toContain('Tes textes sont posés tels quels');
    expect(d.querySelector('[data-champ="copie-dessinee"]')).toBeNull();
    act(() => { choix(d, 'entiere').click(); });
    expect(choix(d, 'entiere').getAttribute('aria-pressed')).toBe('true');
    expect(txt(d, '[data-champ="portee-typographie"]')).toContain('chaque image est relue (mots, packaging, lisibilité, cohérence avec le produit)');
    expect(txt(d, '[data-champ="copie-dessinee"]')).toContain('Textes dessinés mot pour mot par le générateur (GPT Image 2) · une image · 50 crédits.');
    expect(txt(d, '[data-champ="copie"]')).toBe('Accroche · « Tes lunettes tiennent enfin »Bouton · « Je les essaie »');
    expect(txt(d, '[data-champ="textes-ecartes"]')).toBe('Hors de l’image · « Voir » (un seul bouton par pub)');
    expect(txt(d, '[data-champ="format-servi"]')).toBe('Format servi par le générateur · 3:4 (format du projet 4:5) · la pub n’est pas recadrée.');
  });

  it('le choix part avec la compilation (calques : aucun champ, le serveur garde son défaut)', async () => {
    m.compiler.mockResolvedValue({ ok: false, code: 'INVALID_SCHEMA', status: 422, message: 'x', targetIds: [], recoverable: true, traceId: '' });
    m.lire.mockResolvedValue({ ok: true, vue: vue() });
    const d = rendre(vue());
    act(() => { choix(d, 'entiere').click(); });
    act(() => { d.querySelector<HTMLButtonElement>('[data-bouton="compiler"]')!.click(); });
    await act(async () => { d.querySelector<HTMLButtonElement>('[data-bouton="confirmer-compiler"]')!.click(); });
    expect(m.compiler).toHaveBeenCalledWith({ projectId: 'p1', mode: 'generative_scene', typographie: 'entiere' });
  });

  it('pub entière fermée (aucune accroche) · le choix est fermé et la raison écrite à côté', () => {
    const d = rendre(vue({ pubEntiere: { ...PE, copie: null, raisonSansCopie: 'La pub entière dessine les textes de la carte · ajoute au moins une accroche (Hook) au projet.' } }));
    expect(choix(d, 'entiere').disabled).toBe(true);
    expect(txt(d, '[data-raison-ferme="typographie-entiere"]')).toBe('Indisponible · La pub entière dessine les textes de la carte · ajoute au moins une accroche (Hook) au projet.');
  });

  it('consigne retenue en pub entière · prix catalogue annoncé, case du contrôle et de la relecture cochée par défaut, prix dit', () => {
    const d = rendre(vue({ retenue: { ...CONSIGNE, verdict: OK } }));
    expect(txt(d, '[data-prix="annonce"]')).toBe('Une image · 50 crédits · pub entière, GPT Image 2, prix du catalogue.');
    const c = d.querySelector('[data-case="controle-vision"]')!;
    expect(c.getAttribute('aria-pressed')).toBe('true');
    expect(txt(d, '[data-case="controle-vision"]')).toBe('Contrôle visuel et relecture de la pub entière (mots, packaging, lisibilité) · inclus, aucun crédit débité · coché par défaut, décocher pour s’en passer');
    expect(txt(d, '[data-champ="typographie"]')).toBe('Textes · Pub entière · le générateur dessine les textes et le logo');
    expect(txt(d, '[data-champ="limites-pub-entiere"]')).toBe('Non envoyé au générateur (au plus 3 : vues du produit puis logo) · sta_1 (rôle Style). Format servi par le générateur · 3:4 (format du projet 4:5) · la pub n’est pas recadrée.');
  });

  it('régime V2 · la case est cochée d’office en pub entière (prix en crédits dit), décochée en calques comme avant', () => {
    const e = rendre(vue({ retenue: { ...CONSIGNE, verdict: OK } }), 'v2');
    expect(e.querySelector('[data-case="controle-vision"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(txt(e, '[data-case="controle-vision"]')).toBe('Contrôle visuel et relecture de la pub entière (mots, packaging, lisibilité) · 154 crédits au plus par image, ajoutés au devis · coché par défaut, décocher pour s’en passer');
    const c = rendre(vue({ retenue: { ...CONSIGNE, typographie: 'calques', libelleTypographie: 'Textes en calques', copie: null, verdict: OK } }), 'v2');
    expect(c.querySelector('[data-case="controle-vision"]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('rendu relu « à reprendre » · la raison est sur le rendu, aucune reprise automatique', () => {
    const d = rendre(vue({ retenue: { ...CONSIGNE, verdict: OK }, jobs: [job()] }));
    const r = d.querySelector('[data-relecture-pub="a_reprendre"]')!;
    expect(r.textContent).toContain('À reprendre');
    expect(txt(r, '[data-champ="raisons-relecture"]')).toBe('accroche réécrit · lu « Tes lunettes tiennent » (mot manquant « enfin »)');
    expect(r.textContent).toContain('Aucune reprise automatique · pour régénérer, redemande un prix');
    expect(m.lancer).not.toHaveBeenCalled();
    expect(m.devis).not.toHaveBeenCalled();
  });

  it('« à reprendre » n’est pas définitif · la personne tranche (accepter quand même, ou écarter)', async () => {
    m.accepter.mockResolvedValue({ ok: true, job: {}, qualite: 'passed' });
    m.rejeter.mockResolvedValue({ ok: true, job: {}, qualite: 'rejected' });
    m.lire.mockResolvedValue({ ok: true, vue: vue({ retenue: { ...CONSIGNE, verdict: OK }, jobs: [job()] }) });
    const d = rendre(vue({ retenue: { ...CONSIGNE, verdict: OK }, jobs: [job()] }));
    expect(txt(d, '[data-qualite="requires_review"]')).toBe('Qualité');
    await act(async () => { d.querySelector<HTMLButtonElement>('[data-bouton="accepter-pub"]')!.click(); });
    expect(m.accepter).toHaveBeenCalledWith({ jobId: 'j1', raison: 'Pub entière relue « à reprendre », acceptée par une personne' });
    await act(async () => { d.querySelector<HTMLButtonElement>('[data-bouton="ecarter-pub"]')!.click(); });
    expect(m.rejeter).toHaveBeenCalledWith({ jobId: 'j1', raison: 'Pub entière écartée après relecture' });
  });

  it('relecture absente ou non conclue · la VRAIE raison est dite (pas au devis, non enregistrée, plafond)', () => {
    const pasAuDevis = rendre(vue({ jobs: [job({ relecture: null, relectureAuDevis: false, qualite: 'requires_review' })] }));
    expect(txt(pasAuDevis, '[data-relecture-pub="aucune"]')).toBe('Pub entière · non relue (la relecture n’était pas au devis) · relis les textes toi-même.');
    const nonEnregistree = rendre(vue({ jobs: [job({ relecture: null, relectureAuDevis: true, qualite: 'requires_review' })] }));
    expect(txt(nonEnregistree, '[data-relecture-pub="aucune"]')).toBe('Pub entière · relecture au devis mais non enregistrée · relis les textes toi-même.');
    const plafond = rendre(vue({ jobs: [job({ relecture: { statut: 'non_conclue', libelle: 'Relecture non conclue · relis la pub toi-même', raisons: [], nonVerifie: ['mots, packaging et lisibilité non relus · le plafond de dépense est atteint'] } })] }));
    expect(txt(plafond, '[data-relecture-pub="non_conclue"]')).toContain('Non vérifié · mots, packaging et lisibilité non relus · le plafond de dépense est atteint');
  });

  it('calques · ni relecture ni case de relecture', () => {
    const d = rendre(vue({ retenue: { ...CONSIGNE, typographie: 'calques', libelleTypographie: 'Textes en calques', copie: null, verdict: OK }, jobs: [job({ pubEntiere: false, relecture: null, qualite: 'requires_review', libelleQualite: 'À relire' })] }));
    expect(d.querySelector('[data-relecture-pub]')).toBeNull();
    expect(txt(d, '[data-case="controle-vision"]')).toContain('Contrôle visuel de l’image livrée');
    expect(txt(d, '[data-prix="annonce"]')).toBe('Une image · 40 crédits · barème du produit.');
  });
});
