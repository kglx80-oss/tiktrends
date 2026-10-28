import { describe, expect, it } from 'vitest';
import {
  cartesFiltreesSpatial, cleBrouillonTextes, ecranSpatial, ECRANS_SPATIAUX, filtresProjetsSpatial, gestesCarteSpatiale, infoOrnementVideo, libelleAttributIdentite,
  sousNavAtelier, valeursRattachement, variablesRattachement,
} from '../src';

/** Spatial · vague 2 · Studios · les règles des gestes portés (liste, ateliers, rattachement, barre vidéo). */

const c = (title: string, etape: 'brief_a_completer' | 'brief_pret' | 'production') => ({ title, etape, marque: 'Neutre', libelleType: 'Image' });

describe('Spatial · Studios · liste · archivés, recherche, gestes de carte', () => {
  it('« Archivés · n » suit les étapes, seulement quand les archivés ont été relus', () => {
    expect(filtresProjetsSpatial([c('a', 'production')], 2).at(-1)).toEqual({ cle: 'archive', libelle: 'Archivés · 2' });
    expect(filtresProjetsSpatial([c('a', 'production')], 0).at(-1)).toEqual({ cle: 'archive', libelle: 'Archivés · 0' });
    expect(filtresProjetsSpatial([c('a', 'production')]).map((f) => f.cle)).not.toContain('archive');
  });
  it('la recherche porte sur les actifs, ou sur les archivés dans « Archivés » (sans filtre d’étape)', () => {
    const actifs = [c('Rentrée', 'production'), c('Piscine', 'brief_pret')];
    const archives = [c('Piscine 2025', 'production')];
    expect(cartesFiltreesSpatial(actifs, archives, { cle: 'tous', recherche: 'piscine' }).map((x) => x.title)).toEqual(['Piscine']);
    expect(cartesFiltreesSpatial(actifs, archives, { cle: 'archive', recherche: 'piscine' }).map((x) => x.title)).toEqual(['Piscine 2025']);
    expect(cartesFiltreesSpatial(actifs, archives, { cle: 'production', recherche: '' }).map((x) => x.title)).toEqual(['Rentrée']);
  });
  it('les gestes de carte · Itérer mène aux variantes, Archiver/Restaurer selon le statut et le droit, jamais Dupliquer ni Supprimer', () => {
    expect(gestesCarteSpatiale({ id: 'p1', archive: false }, true)).toEqual([{ cle: 'iterer', href: '/studio/projets/p1#variantes' }, { cle: 'archiver' }]);
    expect(gestesCarteSpatiale({ id: 'p1', archive: true }, true)).toEqual([{ cle: 'restaurer' }]);
    expect(gestesCarteSpatiale({ id: 'p1', archive: false }, false)).toEqual([{ cle: 'iterer', href: '/studio/projets/p1#variantes' }]);
  });
});

describe('Spatial · Studios · ateliers', () => {
  it('la sous-navigation · la fiche puis les ateliers ACTIFS seulement, libellés courts', () => {
    expect(sousNavAtelier('p 1', [{ segment: 'image', href: '/i' }, { segment: 'video', href: null }, { segment: 'identites', href: '/id' }])).toEqual([
      { href: '/studio/projets/p%201', libelle: 'Projet' }, { href: '/i', libelle: 'Image' }, { href: '/id', libelle: 'Identités et voix' },
    ]);
  });
  it('le brouillon des textes garde la clé de la V5 (un brouillon rangé par une interface est rendu par l’autre)', () => {
    expect(cleBrouillonTextes('p1')).toBe('tt-studio-textes-brouillon-p1');
  });
  it('un attribut d’identité ne répète pas sa catégorie', () => {
    expect(libelleAttributIdentite({ libelleCategorie: 'Tenue', libelle: 'veste verte' })).toBe('Tenue · veste verte');
    expect(libelleAttributIdentite({ libelleCategorie: 'Cheveux', libelle: 'cheveux bruns' })).toBe('Cheveux bruns');
  });
});

describe('Spatial · Studios · rattacher une variante à un test', () => {
  it('les valeurs de départ · hypothèse et variable reprises, période de 7 jours, protocole de la marque ou défaut', () => {
    expect(valeursRattachement({ hypothese: 'H', variable: 'hook', protocole: null, aujourdHui: '2026-10-27' })).toEqual({
      hypothese: 'H', variable: 'hook', valeurVariable: '', objectif: '', protocole: 'abo_one_adset_per_ad', periodeDebut: '2026-10-27', periodeFin: '2026-11-03', metrique: 'cpa', offreId: '', pageId: '',
    });
    expect(valeursRattachement({ variable: 'inconnue', protocole: null, aujourdHui: '2026-12-29' })).toMatchObject({ variable: '', periodeFin: '2027-01-05' });
  });
  it('une variante issue d’une autre ne peut pas être le témoin', () => {
    expect(variablesRattachement(false)).toContain('none_control');
    expect(variablesRattachement(true)).not.toContain('none_control');
  });
});

describe('Spatial · Studios · barre de la vidéo', () => {
  it('dit les plans réellement animés, jamais plus que les plans', () => {
    expect(infoOrnementVideo(3, 1)).toBe('1 / 3 plans animés');
    expect(infoOrnementVideo(1, 1)).toBe('1 / 1 plan animé');
    expect(infoOrnementVideo(2, 5)).toBe('2 / 2 plans animés');
    expect(infoOrnementVideo(0, 0)).toBe('Aucun plan · le storyboard d’abord');
  });
});

describe('Spatial · Studios · écrans portés et ordre des motifs', () => {
  it('les ateliers et le nouveau concept sont portés · `nouveau` n’est jamais lu comme un identifiant de projet', () => {
    for (const ch of ['/studio/projets/p1/produit', '/studio/projets/p1/textes', '/studio/projets/p1/identites', '/studio/projets/p1/export', '/studio/projets/nouveau/concept']) {
      expect(ecranSpatial(ch), ch).toMatchObject({ interne: `/sp${ch}`, section: 'studios' });
    }
    // Le premier motif qui correspond décide · le segment fixe passe avant `[id]`.
    const premier = ECRANS_SPATIAUX.find((e) => e.chemin === '/studio/projets/nouveau' || e.chemin === '/studio/projets/[id]');
    expect(premier?.chemin).toBe('/studio/projets/nouveau');
    // Le sous-chemin d'un fichier produit n'est pas un écran (il reste servi par sa route).
    expect(ecranSpatial('/studio/projets/p1/produit/fichier/a1')).toBeNull();
  });
});
