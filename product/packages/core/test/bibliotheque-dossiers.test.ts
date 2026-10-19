import { describe, it, expect } from 'vitest';
import {
  DROITS_ASSET, DROITS_PUB_AUTORISES, droitAutorisePub, estDroitAsset, libelleDroit,
  validerNomDossier, LONGUEUR_MAX_NOM_DOSSIER, arbreDossiers, peutDeplacerDossier,
  type DossierPlat, type NoeudDossier,
} from '../src/index';

/**
 * Bibliothèque V5 · règles pures des dossiers et des droits, AU RÉSULTAT.
 *
 *  · les quatre droits de l'inventaire, libellés EXACTS, et la règle « passe en
 *    pub » (le non classé est admis, « À préciser » est refusé) ;
 *  · la validation de nom (vide, trop long, caractère de contrôle) ;
 *  · la projection en arbre (hiérarchie, orphelin remonté à la racine, cycle
 *    rompu, tri) et le déplacement sans cycle.
 */

describe('droits d’usage', () => {
  it('les quatre droits de l’inventaire, libellés EXACTS', () => {
    expect(DROITS_ASSET.map((d) => [d.cle, d.libelle])).toEqual([
      ['photo_marque', 'Photo de la marque'],
      ['ugc_accord', 'UGC avec accord'],
      ['banque_images', "Banque d'images"],
      ['a_preciser', 'À préciser'],
    ]);
    expect(libelleDroit('a_preciser')).toBe('À préciser');
  });

  it('estDroitAsset ne reconnaît que les quatre clés', () => {
    for (const d of DROITS_ASSET) expect(estDroitAsset(d.cle)).toBe(true);
    for (const x of ['', 'photo', 'À préciser', null, undefined, 42, {}]) expect(estDroitAsset(x)).toBe(false);
  });

  it('droitAutorisePub · non classé admis, trois droits autorisés, « À préciser » refusé, inconnu refusé', () => {
    // Non classé (null / vide) → OUI · non-régression : on ne retire pas les médias déjà là.
    expect(droitAutorisePub(null)).toBe(true);
    expect(droitAutorisePub(undefined)).toBe(true);
    expect(droitAutorisePub('')).toBe(true);
    // Droits explicitement autorisés.
    expect(droitAutorisePub('photo_marque')).toBe(true);
    expect(droitAutorisePub('ugc_accord')).toBe(true);
    expect(droitAutorisePub('banque_images')).toBe(true);
    // Posé à dessein comme incertain → NON.
    expect(droitAutorisePub('a_preciser')).toBe(false);
    // Valeur inconnue → NON (défensif).
    expect(droitAutorisePub('n_importe_quoi')).toBe(false);
  });

  it('DROITS_PUB_AUTORISES = exactement les droits dont autorisePub, et s’accorde avec droitAutorisePub', () => {
    expect([...DROITS_PUB_AUTORISES]).toEqual(['photo_marque', 'ugc_accord', 'banque_images']);
    for (const d of DROITS_ASSET) expect(droitAutorisePub(d.cle)).toBe(d.autorisePub);
    expect(DROITS_PUB_AUTORISES).not.toContain('a_preciser');
  });
});

describe('validation du nom de dossier', () => {
  it('accepte un nom propre (rogné)', () => {
    expect(validerNomDossier('  Photos produit  ')).toEqual({ ok: true, nom: 'Photos produit' });
  });
  it('refuse le vide, le trop long, le caractère de contrôle, le non-texte', () => {
    expect(validerNomDossier('').ok).toBe(false);
    expect(validerNomDossier('   ').ok).toBe(false);
    expect(validerNomDossier('a'.repeat(LONGUEUR_MAX_NOM_DOSSIER + 1)).ok).toBe(false);
    expect(validerNomDossier('a'.repeat(LONGUEUR_MAX_NOM_DOSSIER)).ok).toBe(true);
    expect(validerNomDossier('ligne1\nligne2').ok).toBe(false);
    expect(validerNomDossier(42 as unknown).ok).toBe(false);
  });
});

/** Aplatit l'arbre en « parent>enfant » pour un RÉSULTAT lisible. */
function aretes(ns: NoeudDossier[], parent = '∅'): string[] {
  return ns.flatMap((n) => [`${parent}>${n.id}`, ...aretes(n.enfants, n.id)]);
}
const d = (id: string, parentId: string | null): DossierPlat => ({ id, parentId, name: id, brandId: null, locked: false });

describe('projection en arbre', () => {
  it('hiérarchie correcte, enfants triés par nom', () => {
    const arbre = arbreDossiers([d('a', null), d('b', 'a'), d('c', 'a'), d('d', 'b')]);
    expect(arbre.map((n) => n.id)).toEqual(['a']);
    expect(arbre[0]!.enfants.map((n) => n.id)).toEqual(['b', 'c']); // ordre français
    expect(aretes(arbre).sort()).toEqual(['a>b', 'a>c', 'b>d', '∅>a'].sort());
  });

  it('un dossier dont le parent est absent devient une RACINE (il ne disparaît pas)', () => {
    const arbre = arbreDossiers([d('orphelin', 'parti'), d('a', null)]);
    expect(arbre.map((n) => n.id).sort()).toEqual(['a', 'orphelin']);
  });

  it('un cycle est ROMPU · tous les nœuds restent présents, sans boucle infinie', () => {
    const arbre = arbreDossiers([d('x', 'y'), d('y', 'x')]);
    // Les deux nœuds apparaissent, aucun n'est perdu.
    expect(aretes(arbre).filter((a) => a.includes('x') || a.includes('y')).length).toBeGreaterThanOrEqual(2);
    const ids = new Set<string>();
    const collecter = (ns: NoeudDossier[]) => ns.forEach((n) => { ids.add(n.id); collecter(n.enfants); });
    collecter(arbre);
    expect([...ids].sort()).toEqual(['x', 'y']);
  });
});

describe('déplacement sans cycle', () => {
  const liste = [d('a', null), d('b', 'a'), d('c', 'b'), d('autre', null)];
  it('vers la racine : toujours permis', () => {
    expect(peutDeplacerDossier(liste, 'b', null)).toEqual({ ok: true });
  });
  it('soi-même comme parent : refusé', () => {
    expect(peutDeplacerDossier(liste, 'a', 'a').ok).toBe(false);
  });
  it('parent introuvable : refusé', () => {
    expect(peutDeplacerDossier(liste, 'a', 'inconnu').ok).toBe(false);
  });
  it('dans son propre sous-arbre (cycle) : refusé', () => {
    expect(peutDeplacerDossier(liste, 'a', 'c').ok).toBe(false); // c est un descendant de a
  });
  it('vers un autre sous-arbre : permis', () => {
    expect(peutDeplacerDossier(liste, 'b', 'autre')).toEqual({ ok: true });
  });
});
