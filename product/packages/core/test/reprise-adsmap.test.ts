import { describe, it, expect } from 'vitest';
import {
  idGenerationSuivable, manquesAvantTest, listeManques, texteAdIncomplete, COMPLETUDE_HORS_OUTIL,
  repriseIteration, FILIATION_NON_ENREGISTREE, presentationTest, PREPARER_UN_TEST, DEJA_SUIVIE,
} from '../src';

const G = 'f1700000-0000-4000-8000-0000000000a2';

describe('Studio Image › Suivre dans Adsmap · l’identifiant de génération (lot 17)', () => {
  it('extrait la génération d’une carte composite `génération:url`, data URI comprise', () => {
    expect(idGenerationSuivable(`${G}:https://cdn.exemple.test/a.png`)).toBe(G);
    expect(idGenerationSuivable(`${G}:data:image/svg+xml;base64,AAA`)).toBe(G);
    expect(idGenerationSuivable(G)).toBe(G);
  });
  it('une image déjà suivie (même génération) le dit · jamais « Ajoutée »', () => {
    expect(DEJA_SUIVIE).toMatch(/^Déjà suivie/);
    expect(DEJA_SUIVIE).not.toMatch(/Ajoutée/);
  });
  it('rien à suivre sans identifiant de génération (image fraîche `new-…`, vidéo `tmp-…`)', () => {
    expect(idGenerationSuivable('new-0-https://cdn.exemple.test/a.png')).toBeNull();
    expect(idGenerationSuivable('tmp-job-42')).toBeNull();
    expect(idGenerationSuivable('')).toBeNull();
    expect(idGenerationSuivable(null)).toBeNull();
  });
});

describe('Ad incomplète · ce qui manque, et que l’outil ne permet pas encore de le saisir (lot 17)', () => {
  it('liste les quatre manques d’une ad vide, dans l’ordre de la règle de préparation', () => {
    expect(manquesAvantTest({ adType: 'ideation' })).toEqual(['l’hypothèse testée', 'la variable testée', 'l’offre', 'la page de destination']);
  });
  it('hypothèse et variable posées · restent l’offre et la page', () => {
    expect(manquesAvantTest({ adType: 'ideation', hypothesis: 'Avant / après réduit le CPA', testedVariable: 'hook' })).toEqual(['l’offre', 'la page de destination']);
  });
  it('variable « témoin » = pas de variable', () => {
    expect(manquesAvantTest({ adType: 'ideation', hypothesis: 'h', testedVariable: 'none_control', offerId: 'o', landingPageId: 'l' })).toEqual(['la variable testée']);
  });
  it('complète · rien ne manque', () => {
    expect(manquesAvantTest({ adType: 'ideation', hypothesis: 'h', testedVariable: 'hook', offerId: 'o', landingPageId: 'l' })).toEqual([]);
  });
  it('le texte dit quoi compléter et que ça ne se saisit pas dans l’outil', () => {
    expect(listeManques(['l’offre', 'la page de destination'])).toBe('l’offre et la page de destination');
    expect(texteAdIncomplete(['l’offre'])).toBe(`À compléter avant tout test · l’offre. ${COMPLETUDE_HORS_OUTIL}`);
  });
  it('la fiche ne renvoie plus vers « Préparer un test » quand l’ad est incomplète (boucle)', () => {
    const base = { status: 'draft', launchedAt: null, computed: null, verdictStatus: null, batchNumber: null, apprentissages: 0 } as const;
    const bloque = presentationTest({ ...base, manques: ['l’offre', 'la page de destination'] }, { peutPreparer: true, peutMesurer: true });
    expect(bloque.prochaineEtape?.lien).toBeNull();
    expect(bloque.prochaineEtape?.texte).toContain('l’offre et la page de destination');
    // Complète · le lien vers les Lots reste la bonne prochaine étape.
    const pret = presentationTest({ ...base, manques: [] }, { peutPreparer: true, peutMesurer: true });
    expect(pret.prochaineEtape?.lien).toEqual(PREPARER_UN_TEST);
  });
});

describe('Brief d’itération · reprise après un changement d’onglet (lot 17)', () => {
  const memo = { brandId: 'b1', adId: 'ada00000-0000-4000-8000-000000000002', titre: 'v2 · Concept 2' };
  it('propose la reprise sur Pubs IA sans `?iter`, dans la même marque', () => {
    expect(repriseIteration(memo, { brandId: 'b1', iterDansUrl: false })).toEqual({ href: '/studio/ads?iter=ada00000-0000-4000-8000-000000000002', titre: 'v2 · Concept 2' });
  });
  it('rien quand l’URL porte déjà un brief, ou dans une autre marque, ou sans mémoire valide', () => {
    expect(repriseIteration(memo, { brandId: 'b1', iterDansUrl: true })).toBeNull();
    expect(repriseIteration(memo, { brandId: 'b2', iterDansUrl: false })).toBeNull();
    expect(repriseIteration(null, { brandId: 'b1', iterDansUrl: false })).toBeNull();
    expect(repriseIteration({ ...memo, adId: 'javascript:alert(1)' }, { brandId: 'b1', iterDansUrl: false })).toBeNull();
    expect(repriseIteration(memo, { brandId: null, iterDansUrl: false })).toBeNull();
  });
  it('le brief dit que la créa produite n’est pas rattachée au test source', () => {
    expect(FILIATION_NON_ENREGISTREE).toMatch(/pas rattachée/);
    expect(FILIATION_NON_ENREGISTREE).toContain('Vient de');
  });
});
