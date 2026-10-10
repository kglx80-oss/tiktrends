import { describe, it, expect } from 'vitest';
import {
  verdictSortieLivree, lotsLivreurs, elementStudioBibliotheque, fusionnerBibliotheque, LIMITE_BIBLIOTHEQUE,
  type SortieStudioLue,
} from '../src/studios/bibliotheque';

/**
 * Studios · bibliothèque · quelles sorties `studio_assets` entrent dans `/assets`,
 * ce qu'on en affiche, et la fusion avec la liste historique.
 */

const livree: SortieStudioLue = {
  id: '11111111-1111-4111-8111-111111111111', projectId: '22222222-2222-4222-8222-222222222222',
  origin: 'generated', mime: 'image/png', storageState: 'stored', simule: false,
  lot: { state: 'completed', qualityStatus: 'passed' },
};

describe('verdictSortieLivree', () => {
  it('une génération stockée d’un lot terminé est livrée (qualité à relire comprise)', () => {
    expect(verdictSortieLivree(livree)).toEqual({ livree: true });
    expect(verdictSortieLivree({ ...livree, lot: { state: 'completed', qualityStatus: 'pending' } })).toEqual({ livree: true });
    expect(verdictSortieLivree({ ...livree, lot: { state: 'completed', qualityStatus: 'requires_review' } })).toEqual({ livree: true });
  });

  it('un export conservé (`render`) est livré sans lot', () => {
    expect(verdictSortieLivree({ ...livree, origin: 'render', mime: 'image/jpeg', lot: null })).toEqual({ livree: true });
  });

  const refus: Array<[string, Partial<SortieStudioLue>, string]> = [
    ['brouillon non stocké', { storageState: 'pending' }, 'octets non stockés'],
    ['échec de stockage', { storageState: 'failed' }, 'octets non stockés'],
    ['média retiré', { storageState: 'deleted' }, 'octets non stockés'],
    ['dépôt (masque, référence)', { origin: 'upload' }, 'entrée de travail, pas une sortie'],
    ['import', { origin: 'import' }, 'entrée de travail, pas une sortie'],
    ['ancien média', { origin: 'legacy' }, 'entrée de travail, pas une sortie'],
    ['sans projet', { projectId: null }, 'sans projet'],
    ['type non servi', { mime: 'audio/wav' }, 'type non servi'],
    ['SVG', { mime: 'image/svg+xml' }, 'type non servi'],
    ['simulé', { simule: true }, 'média simulé'],
    ['lot introuvable', { lot: null }, 'lot introuvable'],
    ['lot échoué', { lot: { state: 'failed', qualityStatus: 'pending' } }, 'lot non terminé'],
    ['lot en cours', { lot: { state: 'persisting', qualityStatus: 'pending' } }, 'lot non terminé'],
    ['écartée à la relecture', { lot: { state: 'completed', qualityStatus: 'rejected' } }, 'écartée à la relecture'],
  ];
  for (const [nom, delta, raison] of refus) {
    it(`refusée · ${nom}`, () => {
      expect(verdictSortieLivree({ ...livree, ...delta })).toEqual({ livree: false, raison });
    });
  }
});

describe('lotsLivreurs', () => {
  it('lit `result.assets`, défensivement', () => {
    const m = lotsLivreurs([
      { state: 'completed', qualityStatus: 'passed', result: { assets: { 'keyframe:s_image': 'a1', autre: 'a2' } } },
      { state: 'failed', qualityStatus: 'pending', result: { assets: { x: 'a1' } } },
      { state: 'completed', qualityStatus: 'passed', result: null },
      { state: 'completed', qualityStatus: 'passed', result: { assets: ['a3'] } },
      { state: 'completed', qualityStatus: 'passed', result: { assets: { y: 42 } } },
    ]);
    expect([...m.keys()].sort()).toEqual(['a1', 'a2']);
    expect(m.get('a1')).toEqual({ state: 'completed', qualityStatus: 'passed' });
  });
});

describe('elementStudioBibliotheque', () => {
  it('origine « Studios · <projet> », lien du projet, adresse gardée, nom selon l’origine', () => {
    const e = elementStudioBibliotheque({ id: 'abcdef12-0000-4000-8000-000000000000', projectId: 'p1', origin: 'generated', mime: 'image/webp', createdAt: new Date('2026-10-01T10:00:00Z') }, '  Lancement automne ');
    expect(e).toEqual({
      id: 'abcdef12-0000-4000-8000-000000000000', name: 'Média du studio · abcdef12', kind: 'image',
      url: '/api/studios/media/abcdef12-0000-4000-8000-000000000000', createdAt: '2026-10-01T10:00:00.000Z',
      studio: { projetId: 'p1', projetTitre: 'Lancement automne', libelle: 'Studios · Lancement automne', href: '/studio/projets/p1' },
    });
    const v = elementStudioBibliotheque({ id: 'x', projectId: 'p2', origin: 'render', mime: 'video/mp4', createdAt: '2026-10-01T10:00:00.000Z' }, null);
    expect(v.kind).toBe('video');
    expect(v.name).toBe('Rendu exporté · x');
    expect(v.studio.libelle).toBe('Studios · Projet sans titre');
  });
});

describe('fusionnerBibliotheque', () => {
  const e = (id: string, createdAt: string) => ({ id, createdAt });
  it('plus récent d’abord, égalités par identifiant, sans doublon, bornée', () => {
    const a = [e('h2', '2026-10-03T00:00:00Z'), e('h1', '2026-10-01T00:00:00Z')];
    const b = [e('s2', '2026-10-04T00:00:00Z'), e('s1', '2026-10-02T00:00:00Z'), e('h0', '2026-10-01T00:00:00Z'), e('h1', '2026-09-01T00:00:00Z')];
    expect(fusionnerBibliotheque(a, b).map((x) => x.id)).toEqual(['s2', 'h2', 's1', 'h0', 'h1']);
    expect(fusionnerBibliotheque(a, b, 2).map((x) => x.id)).toEqual(['s2', 'h2']);
  });
  it('la borne par défaut est celle de la liste historique', () => {
    const beaucoup = Array.from({ length: LIMITE_BIBLIOTHEQUE + 5 }, (_, i) => e(`h${String(i).padStart(4, '0')}`, new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString()));
    const r = fusionnerBibliotheque(beaucoup, [e('s', '2027-01-01T00:00:00Z')]);
    expect(r.length).toBe(LIMITE_BIBLIOTHEQUE);
    expect(r[0]!.id).toBe('s');
  });
});
