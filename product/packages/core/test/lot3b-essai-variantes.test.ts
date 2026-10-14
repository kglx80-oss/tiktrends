import { describe, it, expect } from 'vitest';
import {
  validerSelectionEssai, facettesEssai, planLotEssai, planDeLOperation, VARIABLE_ADSMAP_ESSAI,
  lotTexte, vueVariantes,
  type VariantePourEssai, type DonneesVariantes, type VarianteLue,
} from '../src/studios/variantes';
import { hypotheseEssai } from '../src/essai';
import { contenuVide } from '../src/studios/document';
import { plan } from './studios-fixtures';

/**
 * Lot 3b · un lot d'essai préparé depuis les variantes d'un projet (règle pure).
 * La règle de contrôle est celle des anciens studios (`verifieEssai`) · on vérifie
 * ici ce que le PLAN dit, pas qu'une fonction est appelée.
 */

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BRIEF = {
  objective: 'Faire acheter le sérum', audience: 'Peaux mixtes 25-35', hypothesisId: null, testedVariable: 'hook',
  facts: [], invariants: [], variables: [], references: [], composition: 'flacon au centre', styleIntent: 'lumière douce du matin',
  texts: ['Hook (fr) · Marre des boutons ?', 'CTA (fr) · J’essaie'], formats: ['4:5'], exclusions: ['aucune promesse médicale'],
};
const contenu = (brief: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  ...contenuVide(), brief: { ...BRIEF, ...brief }, productRef: { productId: 'p_serum' },
  shots: { order: ['s_image'], byId: { s_image: plan('s_image', []) } }, ...extra,
});
const variante = (i: number, c: unknown, sha: string, test: VariantePourEssai['test'] = null): VariantePourEssai => ({
  variantId: U(i), libelle: `Image 1 du lot ${i}`, contenu: c, operation: 'keyframe:s_image', sha256: sha, test,
});

describe('saisie · une variable parmi trois, au moins deux variantes', () => {
  it('refuse une variable inconnue, une seule variante, un identifiant mal formé', () => {
    expect(validerSelectionEssai({ variable: 'offre', variantIds: [U(1), U(2)] })).toMatchObject({ ok: false, raison: expect.stringContaining('l’accroche, la mise en page ou l’ambiance') });
    expect(validerSelectionEssai({ variable: 'univers', variantIds: [U(1), U(1)] })).toMatchObject({ ok: false, raison: 'Un essai a besoin d’au moins deux variantes à comparer.' });
    expect(validerSelectionEssai({ variable: 'univers', variantIds: [U(1), 'x'] })).toMatchObject({ ok: false, raison: 'Variante inconnue.' });
    expect(validerSelectionEssai({ variable: 'univers', variantIds: [U(1), U(2).toUpperCase()] })).toEqual({ ok: true, selection: { variable: 'univers', variantIds: [U(1), U(2)] } });
  });
});

describe('facettes · ce que chaque essai compare dans une variante', () => {
  it('l’accroche lit les textes hors CTA, le texte écran du plan et les calques texte · le CTA est à part', () => {
    const doc = { width: 1080, height: 1350, colorSpace: 'sRGB', fonts: {}, layers: { l_t: { id: 'l_t', kind: 'text', x: 0, y: 0, text: 'Peau nette en 7 jours' } } };
    const a = facettesEssai(contenu({}, { document: doc }), 'keyframe:s_image', 'sha-a');
    const b = facettesEssai(contenu({}, { document: { ...doc, layers: { l_t: { ...doc.layers.l_t, text: 'Fini les boutons' } } } }), 'keyframe:s_image', 'sha-a');
    expect(a.accroche.lisible).toBe('Marre des boutons ?');
    expect(a.accroche.cle).not.toBe(b.accroche.cle);
    // Le texte d'un calque n'est PAS de la mise en page · seule l'accroche bouge.
    expect(a.miseEnPage.cle).toBe(b.miseEnPage.cle);
    expect(a.cta).not.toContain('marre');
    const c = facettesEssai(contenu({}, { document: { ...doc, layers: { l_t: { ...doc.layers.l_t, x: 40 } } } }), 'keyframe:s_image', 'sha-a');
    expect(c.miseEnPage.cle, 'déplacer un calque change la mise en page').not.toBe(a.miseEnPage.cle);
    expect(c.accroche.cle).toBe(a.accroche.cle);
  });

  it('le plan est celui de l’opération qui a livré le média', () => {
    const c = contenu({}, { shots: { order: ['s1', 's2'], byId: { s1: { ...plan('s1', []), lighting: 'nuit' }, s2: plan('s2', []) } } });
    expect(planDeLOperation(c, 'keyframe:s1')?.lighting).toBe('nuit');
    expect(planDeLOperation(c, 'keyframe:s9')).toBeNull();
    expect(facettesEssai(c, 'keyframe:s1', 'x').univers.cle).not.toBe(facettesEssai(c, 'keyframe:s2', 'y').univers.cle);
  });
});

describe('plan · l’essai des ambiances sur deux images déjà produites', () => {
  const lot = [
    variante(1, contenu({ styleIntent: 'lumière douce du matin' }), 'sha-1'),
    variante(2, contenu({ styleIntent: 'néon de nuit, contrasté' }), 'sha-2'),
  ];

  it('essai réel · hypothèse écrite, tenu dit, saisie préremplie pour le rattachement existant', () => {
    const p = planLotEssai(lot, 'univers', { adsmapAcces: true });
    expect(p.constat).toEqual({ ok: true, phrase: 'Essai réel · seule l’ambiance change d’une variante à l’autre.' });
    expect(p.hypothese).toBe(hypotheseEssai('univers', 2));
    expect(p.tenu).toEqual(['tous les textes', 'la mise en page']);
    expect(p.images).toBe(2);
    expect(p.generation).toContain('Aucune génération ici');
    expect(p.lignes.map((l) => l.saisie)).toEqual([
      { hypothese: hypotheseEssai('univers', 2), variable: 'opening_visual', valeurVariable: 'lumière douce du matin' },
      { hypothese: hypotheseEssai('univers', 2), variable: 'opening_visual', valeurVariable: 'néon de nuit, contrasté' },
    ]);
    expect(p.lienLots).toBe('/adsmap/lots');
  });

  it('un autre champ varie (le produit) · pas un essai, aucune saisie', () => {
    const casse = [lot[0]!, variante(2, { ...contenu({ styleIntent: 'néon de nuit, contrasté' }), productRef: { productId: 'p_autre' } }, 'sha-2')];
    const p = planLotEssai(casse, 'univers', { adsmapAcces: true });
    expect(p.constat).toEqual({ ok: false, probleme: 'le produit varie aussi dans ce lot · l’écart ne serait attribuable à rien.', conseil: null });
    expect(p.lignes.every((l) => l.saisie === null)).toBe(true);
    expect(p.lienLots).toBeNull();
    // Pas un essai · le coût ne le décrit pas comme tel.
    expect(p.generation).toBe('Aucune génération ici · rien n’est lancé, rien n’est débité.');
  });

  it('la même ambiance partout · rien à comparer, et la génération qu’il faudrait passe par le devis, dite', () => {
    const p = planLotEssai([variante(1, contenu(), 'sha-1'), variante(2, contenu(), 'sha-2')], 'univers', { adsmapAcces: true });
    expect(p.constat.ok).toBe(false);
    if (p.constat.ok) return;
    expect(p.constat.probleme).toContain('partagent les ambiances');
    expect(p.constat.conseil).toContain('son devis annonce le prix avant le clic. Rien n’est lancé ici.');
  });

  it('l’accroche change aussi · l’ambiance n’est pas isolée', () => {
    const p = planLotEssai([lot[0]!, variante(2, contenu({ styleIntent: 'néon', texts: ['Hook (fr) · Autre accroche', 'CTA (fr) · J’essaie'] }), 'sha-2')], 'univers', { adsmapAcces: true });
    expect(p.constat).toMatchObject({ ok: false, probleme: 'l’accroche varie aussi dans ce lot · l’écart ne serait attribuable à rien.' });
  });
});

describe('plan · accroches et mises en page se comparent sur la MÊME image', () => {
  it('deux images distinctes · la scène varie aussi, le conseil le dit', () => {
    const p = planLotEssai([variante(1, contenu(), 'sha-1'), variante(2, contenu({ texts: ['Hook (fr) · Fini les boutons', 'CTA (fr) · J’essaie'] }), 'sha-2')], 'accroche', { adsmapAcces: true });
    expect(p.constat).toMatchObject({ ok: false, probleme: 'la scène varie aussi dans ce lot · l’écart ne serait attribuable à rien.' });
    if (!p.constat.ok) expect(p.constat.conseil).toContain('ces variantes sont des images distinctes');
    expect(p.lignes.every((l) => l.saisie === null)).toBe(true);
  });

  it('même image, accroches différentes · essai réel, une seule image, saisie « l’accroche »', () => {
    const p = planLotEssai([variante(1, contenu(), 'sha-1'), variante(2, contenu({ texts: ['Hook (fr) · Fini les boutons', 'CTA (fr) · J’essaie'] }), 'sha-1')], 'accroche', { adsmapAcces: true });
    expect(p.constat.ok).toBe(true);
    expect(p.images).toBe(1);
    expect(p.generation).toBe('Aucune génération · cet essai se joue sur une seule image, déjà produite.');
    expect(p.lignes.map((l) => [l.valeur, l.saisie?.variable])).toEqual([['Marre des boutons ?', 'hook'], ['Fini les boutons', 'hook']]);
    expect(VARIABLE_ADSMAP_ESSAI.accroche).toBe('hook');
  });

  it('même image, le CTA change aussi · pas un essai d’accroches', () => {
    const p = planLotEssai([variante(1, contenu(), 'sha-1'), variante(2, contenu({ texts: ['Hook (fr) · Fini les boutons', 'CTA (fr) · Je commande'] }), 'sha-1')], 'accroche', { adsmapAcces: true });
    expect(p.constat).toMatchObject({ ok: false, probleme: 'le bouton varie aussi dans ce lot · l’écart ne serait attribuable à rien.' });
  });
});

describe('plan · l’état du test de chaque variante', () => {
  const lot = (t1: VariantePourEssai['test'], t2: VariantePourEssai['test']) => [
    variante(1, contenu({ styleIntent: 'matin' }), 'sha-1', t1),
    variante(2, contenu({ styleIntent: 'nuit' }), 'sha-2', t2),
  ];

  it('déjà en test · pas de saisie (un seul test ouvert), lien vers sa fiche ; test clos · saisie possible', () => {
    const p = planLotEssai(lot({ adsmapAdId: U(9), adStatus: 'live' }, { adsmapAdId: U(8), adStatus: 'done' }), 'univers', { adsmapAcces: true });
    expect(p.lignes[0]).toMatchObject({ etat: 'en_test', saisie: null, adsmapHref: `/adsmap?ad=${U(9)}&depuis=studio` });
    expect(p.lignes[0]!.etatTexte).toContain('Déjà en test');
    expect(p.lignes[1]).toMatchObject({ etat: 'test_clos' });
    expect(p.lignes[1]!.saisie).not.toBeNull();
  });

  it('sans accès Adsmap · le plan reste lisible, aucune saisie, l’offre requise est dite', () => {
    const p = planLotEssai(lot(null, null), 'univers', { adsmapAcces: false });
    expect(p.constat.ok).toBe(true);
    expect(p.lignes.every((l) => l.saisie === null)).toBe(true);
    expect(p.suite).toEqual(['Le rattachement à un test passe par Adsmap, disponible à partir de l’offre Plus.']);
    expect(p.lienLots).toBeNull();
  });
});

describe('suivi Adsmap · le lot et la validation du verdict, sans rien inventer', () => {
  it('lot connu ou absent, dit en mots', () => {
    expect(lotTexte({ numero: 3, statut: 'testing' })).toBe('Lot 3 · En test');
    expect(lotTexte(null)).toBe('Hors lot · la fiche n’est encore dans aucun lot de test.');
  });

  const donnees = (test: VarianteLue['test']): DonneesVariantes => ({
    projet: { id: 'p', titre: 'P', versionCouranteId: 'v1' }, versions: [{ id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01T00:00:00.000Z' }],
    lots: [{ jobId: 'j', lot: 1, versionId: 'v1', etat: 'completed', qualite: 'passed', creeLe: '2026-10-01T00:00:00.000Z', attendues: 1, sorties: [] }],
    variantes: [{
      id: 'va', assetId: 'a', versionId: 'v1', parentVariantId: null, jobId: 'j', lot: 1, position: 1, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64),
      hypothese: null, variable: null, qualite: 'passed', etatTechnique: 'completed', creeLe: '2026-10-01T00:00:00.000Z', test, lecture: null, relecture: null,
    }],
    adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] }, droits: { proposer: true },
    relecture: { disponible: false, raison: null, coutMaxUsd: null },
  });
  const test = (o: Partial<NonNullable<VarianteLue['test']>>): NonNullable<VarianteLue['test']> => ({
    linkId: 'l', adsmapAdId: U(5), adStatus: 'live', hypothese: 'h', variable: 'hook', valeurVariable: null, objectif: null, protocole: null,
    periode: null, metrique: null, isolation: null, verdict: null, ...o,
  });

  it('carte · lot en premier détail, verdict « à valider » tant qu’il n’est pas validé, « validé » sinon', () => {
    const c = vueVariantes(donnees(test({ lot: { numero: 2, statut: 'testing' }, verdict: { computed: 'winner', validated: null, comparable: true, failedStage: null, killFlag: null, computedAt: '2026-10-10T00:00:00.000Z' } }))).variantes[0]!.test!;
    expect(c.details[0]).toEqual({ libelle: 'Lot de test', valeur: 'Lot 2 · En test' });
    expect(c.verdict).toBe('Gagnante · à valider dans Résultats · calculé le 2026-10-10');
    const v = vueVariantes(donnees(test({ verdict: { computed: 'winner', validated: 'loser', comparable: true, failedStage: null, killFlag: null, computedAt: null } }))).variantes[0]!.test!;
    expect(v.verdict).toBe('Perdante · validé');
    expect(v.details[0]).toEqual({ libelle: 'Lot de test', valeur: 'Hors lot · la fiche n’est encore dans aucun lot de test.' });
    expect(vueVariantes(donnees(test({}))).variantes[0]!.test!.verdict).toBe('Pas encore de résultat mesuré.');
  });
});
