import { describe, expect, it } from 'vitest';
import {
  normaliserBrief, champsManquants, briefPret, CHAMPS_REQUIS_BRIEF,
  exigeNouvelleVersion, briefFige, type BriefIteration,
} from '../src/brief-iteration';

/**
 * CDC v6 · R13 · le BRIEF D'ITÉRATION · contrat pur de la boucle Analyse →
 * Itération → Création. Deux règles protègent la comparaison · un invariant qui
 * bouge est une NOUVELLE expérience, et un brief lié à un résultat MESURÉ est
 * immuable. Ce test vérifie les RÉSULTATS de ces règles, pas la présence d'un
 * appel. La persistance et le câblage des studios s'appuieront dessus (tranches
 * suivantes) · ici, rien que le noyau.
 */

const plein = (o: Partial<BriefIteration> = {}): BriefIteration => ({
  sources: ['veille · concurrent X'],
  hypothese: 'une accroche courte convertit mieux',
  variable: 'longueur de l’accroche',
  invariants: ['même packaging', 'même prix affiché'],
  produit: 'crème hydratante 50 ml',
  audience: 'femmes 25-40 peau sèche',
  offre: '-20 % première commande',
  kpiCible: 'CPA sous 15 €',
  ...o,
});

describe('un brief prêt à produire ne manque de rien', () => {
  it('le brief complet est prêt · rien ne manque', () => {
    expect(champsManquants(plein())).toEqual([]);
    expect(briefPret(plein())).toBe(true);
  });

  it('chaque champ requis manquant est signalé, dans l’ordre', () => {
    // Le vide se lit champ par champ · c'est ce qui guide la complétion à l'écran.
    expect(champsManquants({})).toEqual([...CHAMPS_REQUIS_BRIEF]);
    expect(briefPret({})).toBe(false);
  });

  it('un invariant vide compte comme manquant · pas juste une chaîne', () => {
    // La comparaison n'a aucun sens sans éléments tenus fixes · un tableau vide
    // n'est pas un brief prêt.
    expect(champsManquants(plein({ invariants: [] }))).toEqual(['invariants']);
    expect(briefPret(plein({ invariants: [] }))).toBe(false);
  });

  it('les sources ne bloquent pas la production · recommandées, pas requises', () => {
    // Traçabilité idéale, mais on produit sans · le contraire figerait l'outil.
    expect(champsManquants(plein({ sources: [] }))).toEqual([]);
    expect(briefPret(plein({ sources: [] }))).toBe(true);
  });
});

describe('un changement d’invariant est une NOUVELLE expérience', () => {
  it('changer le produit exige une nouvelle version', () => {
    expect(exigeNouvelleVersion(plein(), plein({ produit: 'sérum 30 ml' }))).toBe(true);
  });

  it('changer l’audience exige une nouvelle version', () => {
    expect(exigeNouvelleVersion(plein(), plein({ audience: 'hommes 30-50' }))).toBe(true);
  });

  it('changer l’offre exige une nouvelle version', () => {
    expect(exigeNouvelleVersion(plein(), plein({ offre: 'livraison offerte' }))).toBe(true);
  });

  it('changer les éléments tenus fixes exige une nouvelle version', () => {
    // Ce qu'on tient constant DÉFINIT ce qu'on mesure · le toucher invalide la
    // comparaison d'avant.
    expect(exigeNouvelleVersion(plein(), plein({ invariants: ['même packaging'] }))).toBe(true);
  });

  it('reformuler l’hypothèse ou la variable ne l’exige PAS · même expérience qui s’affine', () => {
    // Le piège inverse · si affiner le libellé forçait une version, on perdrait
    // le fil de l'expérience à chaque retouche. C'est la même expérience.
    expect(exigeNouvelleVersion(
      plein(),
      plein({ hypothese: 'une accroche très courte convertit mieux', variable: 'accroche 3 mots max' }),
    )).toBe(false);
  });

  it('les éléments fixes se comparent comme un ENSEMBLE · l’ordre et la casse ne comptent pas', () => {
    // Réordonner ou recapitaliser la même liste n'est pas un changement · sinon
    // un tri d'affichage déclencherait de fausses versions.
    expect(exigeNouvelleVersion(
      plein({ invariants: ['Même packaging', 'même prix affiché'] }),
      plein({ invariants: ['même prix affiché', 'MÊME PACKAGING'] }),
    )).toBe(false);
  });
});

describe('un brief lié à une création MESURÉE est figé', () => {
  it('mesuré → figé · on ne réécrit jamais le contexte d’un résultat déjà tombé', () => {
    expect(briefFige({ aUneCreationMesuree: true })).toBe(true);
  });

  it('pas encore mesuré → éditable', () => {
    expect(briefFige({ aUneCreationMesuree: false })).toBe(false);
  });
});

describe('le brief se nettoie avant d’être lu · il vient d’un jsonb', () => {
  it('tolère une forme cassée sans exploser', () => {
    // Sans ce filtre, un .map/.trim sur la mauvaise forme casserait le studio.
    const n = normaliserBrief({ sources: 'une seule source' as unknown as string[], hypothese: 42 as unknown as string });
    expect(n.sources).toEqual(['une seule source']);
    expect(n.hypothese).toBe('');
    expect(n.invariants).toEqual([]);
  });

  it('tolère null et undefined · rend une forme sûre', () => {
    expect(normaliserBrief(null).produit).toBe('');
    expect(normaliserBrief(undefined).invariants).toEqual([]);
  });

  it('rogne les blancs et écarte les entrées vides des listes', () => {
    const n = normaliserBrief({ produit: '  crème  ', invariants: ['  a ', '', '   ', 'b'] });
    expect(n.produit).toBe('crème');
    expect(n.invariants).toEqual(['a', 'b']);
  });
});
