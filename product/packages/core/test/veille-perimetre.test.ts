import { describe, expect, it } from 'vitest';
import { perimetreVeille, PERIMETRE_VEILLE_DEFAUT, filtresActifsVeille, videRechercheVeille, PERIMETRES_VEILLE, jargonTechnique } from '../src';

/**
 * Recette #106b · Veille · où l'on cherche · le défaut est celui de la source
 * (le connecteur Meta envoie `adCopy` quand `searchIn` est absent), les
 * valeurs par défaut ne comptent pas comme filtres, l'état vide nomme le
 * périmètre et propose « Marque ».
 */
describe('perimetreVeille · lien et formulaire ont le même sens', () => {
  it('absent ou inconnu → le défaut de la source (texte de l’annonce)', () => {
    expect(PERIMETRE_VEILLE_DEFAUT).toBe('ad_copy');
    expect(perimetreVeille(undefined), 'un lien sans searchIn ne veut pas dire la même chose que le formulaire').toBe(perimetreVeille('ad_copy'));
    expect(perimetreVeille('')).toBe('ad_copy');
    expect(perimetreVeille('partout')).toBe('ad_copy');
    expect(perimetreVeille('brand')).toBe('brand');
    expect(perimetreVeille('domain')).toBe('domain');
  });
});

describe('filtresActifsVeille · seul ce qui s’écarte du défaut compte', () => {
  it('le formulaire au défaut (texte + Récentes) ne compte rien', () => {
    expect(filtresActifsVeille({ searchIn: 'ad_copy' }, 'meta'), 'les valeurs par défaut comptent comme filtres').toEqual([]);
    expect(filtresActifsVeille({}, 'meta')).toEqual([]);
  });
  it('le tri n’est jamais un filtre', () => {
    expect(filtresActifsVeille({ searchIn: 'ad_copy', ...({ sort: 'reach' } as object) }, 'meta')).toEqual([]);
  });
  it('« Marque » compte, sur Meta seulement (ailleurs le périmètre est ignoré)', () => {
    expect(filtresActifsVeille({ searchIn: 'brand' }, 'meta')).toEqual([{ cle: 'searchIn', texte: 'Dans : Marque' }]);
    expect(filtresActifsVeille({ searchIn: 'brand' }, 'tiktok')).toEqual([]);
  });
  it('média, statut et pays comptent quand ils restreignent', () => {
    expect(filtresActifsVeille({ media: 'video', status: 'active', country: 'FR' }, 'meta').map((f) => f.texte)).toEqual(['Vidéo', 'Actives', 'Pays : FR']);
    expect(filtresActifsVeille({ status: 'all' }, 'meta')).toEqual([]);
  });
});

describe('videRechercheVeille · une marque introuvable ne ressemble pas à une panne', () => {
  it('nomme le périmètre et propose « Marque »', () => {
    const v = videRechercheVeille('neutrogena', 'ad_copy', true);
    expect(v.titre).toBe('Aucune annonce dont le texte de l’annonce contient « neutrogena ».');
    expect(v.pourquoi).toMatch(/« Marque »/);
    expect(v.essayerMarque).toBe(true);
  });
  it('déjà dans « Marque » · on ne la repropose pas', () => {
    expect(videRechercheVeille('x', 'brand', false).essayerMarque).toBe(false);
  });
  it('aucun jargon dans la copie', () => {
    for (const p of PERIMETRES_VEILLE) {
      const v = videRechercheVeille('x', p.v, true);
      expect(jargonTechnique(`${v.titre} ${v.pourquoi} ${p.libelle} ${p.exemple}`)).toEqual([]);
    }
  });
});
