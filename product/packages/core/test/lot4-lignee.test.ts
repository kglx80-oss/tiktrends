import { describe, it, expect } from 'vitest';
import {
  projeterLignee,
  type EntreeLignee, type ModeleLignee, type LienLignee,
  type DonneesVariantes, type VarianteLue, type Lecture, type VerdictLu,
} from '../src/index';

/**
 * Lot 4a · PROJECTION DE LIGNÉE (noyau pur, lecture seule).
 *
 * On vérifie un RÉSULTAT : le graphe RÉELLEMENT projeté depuis des données
 * existantes relie
 *  · les références (`sourceRefs`) au brief,
 *  · l'hypothèse (`brief.hypothesisId`) au brief,
 *  · les variantes à leurs créations groupées par lot,
 *  · le test (`studio_test_links` + verdict Adsmap) au résultat, et le gagnant,
 *  · le résultat à l'apprentissage (`relireApprentissage`),
 *  · la version enfant à sa parente (`parentId`) par un nœud d'itération ;
 * sans cycle (chaque lien va strictement vers la droite) et de façon
 * déterministe. Casser l'un de ces liens fait TOMBER le test.
 */

const verdict = (validated: VerdictLu['validated']): VerdictLu => ({
  computed: validated, validated, comparable: true, failedStage: null, killFlag: null, computedAt: '2026-10-10',
});
const lecture = (eff: Lecture['verdictEffectif']): Lecture => ({
  conclusion: 'soutenue', motif: 'tient_les_reperes', phrase: 'Hypothèse soutenue · gagnante au protocole.',
  verdictEffectif: eff, reference: 'reperes_marque', variableSuivante: 'hook', garderVariable: false,
  prudence: 'Résultat mesuré, pas une preuve de cause.',
});

const variante = (o: Partial<VarianteLue> & Pick<VarianteLue, 'id' | 'versionId' | 'jobId' | 'lot' | 'position'>): VarianteLue => ({
  assetId: `a_${o.id}`, parentVariantId: null, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64),
  hypothese: null, variable: null, qualite: 'passed', etatTechnique: 'completed', creeLe: '2026-10-05',
  test: null, lecture: null, relecture: null, ...o,
});

function entree(): EntreeLignee {
  const donnees: DonneesVariantes = {
    projet: { id: 'p1', titre: 'Sérum éclat', versionCouranteId: 'v2' },
    versions: [
      { id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' },
      { id: 'v2', n: 2, parentId: 'v1', creeLe: '2026-10-06' },
    ],
    lots: [
      { jobId: 'j1', lot: 1, versionId: 'v1', etat: 'completed', qualite: 'passed', creeLe: '2026-10-02', attendues: 2, sorties: [] },
      { jobId: 'j2', lot: 2, versionId: 'v2', etat: 'completed', qualite: 'passed', creeLe: '2026-10-07', attendues: 1, sorties: [] },
    ],
    variantes: [
      variante({
        id: 'va1', versionId: 'v1', jobId: 'j1', lot: 1, position: 1, hypothese: 'Accroche produit visible',
        test: { linkId: 'tl1', adsmapAdId: 'ad1', adStatus: 'live', hypothese: 'Accroche produit visible', variable: 'hook', valeurVariable: null, objectif: null, protocole: null, periode: null, metrique: null, isolation: null, verdict: verdict('winner'), lot: null },
        lecture: lecture('winner'),
        relecture: { conclusion: 'soutenue', apprentissage: 'Le produit en gros plan gagne.', variableSuivante: 'opening_visual', ecart: null, le: '2026-10-09' },
      }),
      variante({ id: 'va2', versionId: 'v1', jobId: 'j1', lot: 1, position: 2 }),
      variante({
        id: 'va3', versionId: 'v2', jobId: 'j2', lot: 2, position: 1, parentVariantId: 'va1',
        test: { linkId: 'tl3', adsmapAdId: 'ad3', adStatus: 'live', hypothese: 'x', variable: 'opening_visual', valeurVariable: null, objectif: null, protocole: null, periode: null, metrique: null, isolation: null, verdict: verdict('loser'), lot: null },
        lecture: lecture('loser'),
      }),
    ],
    adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] },
    droits: { proposer: true },
    relecture: { disponible: false, raison: null, coutMaxUsd: null },
  };
  return {
    projet: { id: 'p1', titre: 'Sérum éclat', marque: 'Neva' },
    sources: [{ sourceId: 'src1', titre: 'Annonce concurrente', presentation: 'Annonce Meta observée.', lien: '/veille' }],
    briefs: {
      v1: { objectif: 'Faire connaître le sérum', hypothese: 'Montrer le produit en gros plan convertit mieux', hypotheseId: 'hyp_1', variable: 'hook', direction: 'Lumineux, fond pastel' },
      v2: { objectif: 'Tester le visuel d’ouverture', hypothese: 'Un plan macro accroche', hypotheseId: 'hyp_2', variable: 'opening_visual', direction: null },
    },
    donnees,
  };
}

const lien = (m: ModeleLignee, de: string, vers: string): LienLignee | undefined => m.liens.find((l) => l.de === de && l.vers === vers);

describe('Lot 4a · projection de lignée · ce que le graphe relie', () => {
  const m = projeterLignee(entree());
  const ids = new Set(m.noeuds.map((n) => n.id));

  it('les nœuds de lignée attendus sont présents, avec leur vraie donnée', () => {
    for (const id of ['marque', 'reference:src1', 'brief:v1', 'brief:v2', 'hypothese:v1', 'direction:v1', 'iteration:v2', 'groupe:j1', 'groupe:j2', 'creation:va1', 'creation:va2', 'creation:va3', 'resultat:va1', 'resultat:va3', 'apprentissage:va1']) {
      expect(ids.has(id), `nœud ${id} attendu`).toBe(true);
    }
    expect(m.noeuds.find((n) => n.id === 'marque')!.titre).toContain('Neva');
    expect(m.noeuds.find((n) => n.id === 'hypothese:v1')!.resume).toContain('gros plan');
    expect(m.noeuds.find((n) => n.id === 'direction:v1')!.resume).toContain('pastel');
  });

  it('références et hypothèse rattachées au brief (contexte)', () => {
    expect(lien(m, 'reference:src1', 'brief:v1')?.categorie).toBe('contexte');
    expect(lien(m, 'marque', 'brief:v1')?.categorie).toBe('contexte');
    expect(lien(m, 'brief:v1', 'hypothese:v1')?.categorie).toBe('contexte');
    expect(lien(m, 'brief:v1', 'direction:v1')?.categorie).toBe('contexte');
  });

  it('variantes rattachées à leur lot (création), lot rattaché au brief de sa version', () => {
    expect(lien(m, 'groupe:j1', 'creation:va1')?.categorie).toBe('visuel');
    expect(lien(m, 'groupe:j1', 'creation:va2')?.categorie).toBe('visuel');
    expect(lien(m, 'groupe:j2', 'creation:va3')?.categorie).toBe('visuel');
    expect(lien(m, 'brief:v1', 'groupe:j1')?.categorie).toBe('visuel');
  });

  it('test + verdict → résultat, et le gagnant porte sa pastille', () => {
    expect(lien(m, 'creation:va1', 'resultat:va1')?.categorie).toBe('mesure');
    expect(m.noeuds.find((n) => n.id === 'resultat:va1')!.badge).toBe('Gagnant');
    // Une variante sans verdict gagnant n'invente pas de pastille.
    expect(m.noeuds.find((n) => n.id === 'resultat:va3')!.badge).toBeNull();
    // Une variante sans test n'a pas de résultat.
    expect(ids.has('resultat:va2')).toBe(false);
  });

  it('résultat → apprentissage (relecture)', () => {
    expect(lien(m, 'resultat:va1', 'apprentissage:va1')?.categorie).toBe('mesure');
    expect(m.noeuds.find((n) => n.id === 'apprentissage:va1')!.resume).toContain('gros plan');
  });

  it('itération · version enfant vient de sa parente (parentId)', () => {
    expect(lien(m, 'brief:v1', 'iteration:v2')?.categorie).toBe('iteration');
    expect(lien(m, 'iteration:v2', 'brief:v2')?.categorie).toBe('iteration');
    // v1 est la racine : pas de nœud d'itération pour elle.
    expect(ids.has('iteration:v1')).toBe(false);
  });

  it('pas de cycle · chaque lien va STRICTEMENT vers la droite', () => {
    expect(m.liens.length).toBeGreaterThan(0);
    for (const l of m.liens) {
      const cde = m.grille[l.de]!.colonne;
      const cvers = m.grille[l.vers]!.colonne;
      expect(cde, `${l.de} → ${l.vers} doit aller vers la droite`).toBeLessThan(cvers);
    }
  });

  it('déterministe · même entrée, même empreinte et même modèle', () => {
    const a = projeterLignee(entree());
    const b = projeterLignee(entree());
    expect(a.empreinte).toBe(b.empreinte);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.empreinte).toMatch(/^[a-f0-9]{64}$/);
  });

  it('données nouvelles (note, fiche marque) classées « à venir », jamais fabriquées', () => {
    const elements = m.aVenir.map((a) => a.element);
    expect(elements).toContain('Note');
    expect(elements).toContain('Fiche marque');
    expect(ids.has('note')).toBe(false);
  });
});
