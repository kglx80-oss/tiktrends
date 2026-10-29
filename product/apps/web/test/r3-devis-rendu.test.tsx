// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * R3 · un devis ne dit « au plus » que si TOUTES ses lignes sont des bornes.
 *
 * On REND le composant (parcours image Spatial · porté de la V5 en vague 2,
 * formulaire de budget du benchmark) et on lit le HTML : la phrase du coût, les lignes et leur nature,
 * la case du contrôle visuel (prix dit AVANT le clic, cochée par défaut,
 * décochable), et ce que le geste « Demander un devis » envoie.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/p1/produit', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
const a = vi.hoisted(() => ({ devis: vi.fn(async () => ({ ok: true })), lire: vi.fn() }));
vi.mock('../app/actions/studios/image', () => ({ lireParcoursImage: a.lire, compilerConsigneImage: vi.fn(), retenirConsigneImage: vi.fn(), demanderDevisImage: a.devis, approuverEtLancerImage: vi.fn(), controlerMediaImage: vi.fn() }));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));
vi.mock('../app/actions/studios/produit', () => ({ trancherComposants: vi.fn() }));

import {
  disponibiliteImage, qualifierDevis, vueLignesDevis, borneControleVisionParImageMicros, avecControleVision,
  type LigneDevis, type VerdictConsigne,
} from '@tiktrends/core';
import type { VueParcoursImage, ConsigneVue } from '../lib/studios/image/parcours';
import { ParcoursImage } from '../spatial/vues/projet/ParcoursImage';
import { avecSpatial } from './spatial/fournisseur';
// Spatial · vague 3 · le formulaire vit dans le « Registre IA » (l'écran V5 « IA et Studios » est retiré).
import { BudgetBenchmark } from '../spatial/vues/admin/registre-client';

const TOUT = { peutGenerer: true, peutProposer: true, briefPresent: true, preparationOk: true, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true };
const CONSIGNE: ConsigneVue = {
  runId: '11111111-1111-4111-8111-111111111111', mode: 'generative_scene', libelleMode: 'Mise en scène générée',
  generationInstruction: 'Coureur portant les lunettes.', negativeConstraints: [], protectedComponents: ['lunettes'],
  liaisons: [], format: { largeur: 1080, hauteur: 1350 }, compileeLe: '2026-10-08T10:00:00Z',
};
const OK: VerdictConsigne = { ok: true };
const IMAGE: LigneDevis = { operation: 'keyframe:s_image', nature: 'generation', profil: 'image_generation', unites: 1, credits: 4, usdMicros: 80_000, inclus: false, natureCout: 'borne', motifEstimation: null };
const ANIMATION: LigneDevis = { operation: 'clip:s1', nature: 'generation', profil: 'animation', unites: 1, credits: 10, usdMicros: 600_000, inclus: false, natureCout: 'estimation', motifEstimation: 'forfait vidéo · le prix réel dépend de la durée et du modèle' };
const BORNE_VISION = borneControleVisionParImageMicros('claude-sonnet-5');

function vue(lignes: LigneDevis[] | null, controleVision = { disponible: true, borneParImageUsdMicros: BORNE_VISION }): VueParcoursImage {
  const total = (lignes ?? []).reduce((s, l) => s + l.usdMicros * l.unites, 0);
  return {
    projet: { id: 'p1' }, version: { id: 'v3', n: 3 },
    modes: [{ mode: 'generative_scene', libelle: 'Mise en scène générée', pret: true }],
    format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: false },
    disponibilite: disponibiliteImage(TOUT), coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 80_000 },
    enAttente: null, retenue: { ...CONSIGNE, verdict: OK }, jobs: [], composantsObligatoires: ['lunettes'], peutRelire: true, controleVision,
    devis: lignes ? { id: 'q1', inputHash: 'h'.repeat(64), credits: 4, usdMicros: total, expiresAt: '2026-10-08T10:30:00Z', qualification: qualifierDevis(lignes), lignes: vueLignesDevis(lignes) } : null,
  };
}
const montes: Array<{ racine: Root; d: HTMLDivElement }> = [];
afterEach(() => { for (const x of montes.splice(0)) { act(() => x.racine.unmount()); x.d.remove(); } });
function rendre(v: VueParcoursImage) {
  const d = document.createElement('div');
  document.body.appendChild(d);
  const racine = createRoot(d);
  act(() => { racine.render(avecSpatial(<ParcoursImage projectId="p1" versionId="v3" initial={v} />)); });
  montes.push({ racine, d });
  return d;
}
const txt = (d: ParentNode, sel: string) => (d.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('devis du parcours image · le client lit des CRÉDITS (décision du 29/10)', () => {
  // Le coût fournisseur (borne ou estimation, en dollars) reste au serveur et à
  // l'Admin · le client lit les crédits réservés, et ce qu'ils deviennent.
  it('image + contrôle visuel · crédits du devis, lignes en crédits, aucun dollar', () => {
    const { lignes } = avecControleVision([IMAGE], { modele: 'claude-sonnet-5' });
    const d = rendre(vue(lignes));
    expect(txt(d, '[data-prix="devis"]')).toBe('Devis · 4 crédits · Réservés à l’approbation, rendus s’ils ne sont pas consommés · valable jusqu’à 12:30.');
    expect([...d.querySelectorAll('[data-lignes="devis"] li')].map((l) => [l.getAttribute('data-ligne-nature'), l.textContent])).toEqual([
      ['borne', 'Image · keyframe:s_image · 4 crédits'],
      ['borne', 'Contrôle visuel · 1 image · Inclus · aucun crédit débité'],
    ]);
    expect(d.textContent).not.toMatch(/\$|€/);
  });

  it('une ligne estimée (animation) · les crédits réservés, jamais un montant en dollars', () => {
    const d = rendre(vue([IMAGE, ANIMATION]));
    expect(txt(d, '[data-prix="devis"]')).toBe('Devis · 4 crédits · Réservés à l’approbation, rendus s’ils ne sont pas consommés · valable jusqu’à 12:30.');
    expect(d.querySelector('[data-ligne-nature="estimation"]')?.textContent).toMatch(/^Animation · clip:s1 · /);
    expect(d.textContent).not.toMatch(/\$|€/);
  });

  it('devis écrit avant R3 (lignes sans nature) · aucun dollar', () => {
    const ancien = [{ ...IMAGE, natureCout: undefined, motifEstimation: undefined }];
    expect(rendre(vue(ancien)).textContent).not.toMatch(/\$|€/);
  });
});

describe('case « contrôle visuel » · prix avant le clic, cochée par défaut, décochable', () => {
  it('disponible ⇒ cochée, le prix est dit (inclus, régime actuel) ; indisponible ⇒ absente (rien d’annoncé)', () => {
    const d = rendre(vue(null));
    const c = d.querySelector<HTMLButtonElement>('[data-case="controle-vision"]');
    expect(c?.getAttribute('aria-pressed')).toBe('true');
    expect(txt(d, '[data-case="controle-vision"]')).toBe('Contrôle visuel de l’image livrée · inclus, aucun crédit débité · décocher pour s’en passer');
    expect(rendre(vue(null, { disponible: false, borneParImageUsdMicros: BORNE_VISION })).querySelector('[data-case="controle-vision"]')).toBeNull();
  });

  it('le geste « Demander un devis » envoie la case : cochée ⇒ true ; décochée ⇒ false', async () => {
    a.lire.mockResolvedValue({ ok: true, vue: vue(null) });
    const hote = rendre(vue(null));
    await act(async () => { hote.querySelector<HTMLButtonElement>('[data-bouton="devis"]')!.click(); });
    expect(a.devis).toHaveBeenLastCalledWith({ projectId: 'p1', controleVision: true });
    await act(async () => { hote.querySelector<HTMLButtonElement>('[data-case="controle-vision"]')!.click(); });
    await act(async () => { hote.querySelector<HTMLButtonElement>('[data-bouton="devis"]')!.click(); });
    expect(a.devis, 'la case décochée n’est pas transmise · le contrôle visuel serait devisé malgré tout').toHaveBeenLastCalledWith({ projectId: 'p1', controleVision: false });
  });
});

describe('budget du benchmark · « au plus » seulement pour une borne', () => {
  it('estimation ⇒ « · estimation, maximum non garanti » ; borne ⇒ « au plus »', () => {
    const r = (m: boolean) => renderToStaticMarkup(<BudgetBenchmark releases={[{ id: 'r1', libelle: 'R1' }]} devisLisible="9,925 $" devisUsd={9.925} devisMaximum={m} />);
    expect(r(false)).toContain('Devis du benchmark complet · <b>9,925 $</b> · estimation, maximum non garanti.');
    expect(r(false)).not.toContain('au plus');
    expect(r(true)).toContain('Devis du benchmark complet · <b>9,925 $</b> au plus.');
  });
});
