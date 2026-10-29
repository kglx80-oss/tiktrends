import { describe, it, expect } from 'vitest';
import { CAPACITES_STUDIOS } from '@tiktrends/core';
import { ROUTES_HISTORIQUES, CAPACITE_DES_ROUTES, liensAtelierProjet } from '../lib/navigation';
import { ANCIENNES_ADRESSES_STUDIO } from '@tiktrends/core';
import { cheminsSpatiauxServis } from './spatial/servie';

/**
 * F1 · la carte des écrans et leurs capacités (cahier 01 §14).
 *
 *  · chaque PAGE du nouveau Studio (écrans Spatiaux `/studio/projets/**`) dépend
 *    d'une capacité déclarée ; une page ajoutée sans capacité fait tomber ce
 *    test ;
 *  · aucune ancienne adresse (Studio, Pubs IA, Image/Vidéo/Textes IA, retirés
 *    le 10/10, qui ne font plus que rediriger) ni la Veille n'a de capacité ;
 *  · l'atelier d'un projet ne produit jamais de lien vers un écran coupé, et
 *    chaque écran y porte son libellé (la carte `ROUTES` qui les portait est
 *    retirée · les libellés vivent dans `ATELIER`).
 */

describe('carte · écrans du nouveau Studio et capacités', () => {
  it('chaque page sous /studio/projets a sa capacité', () => {
    // L'ancienne interface est retirée · les pages du Studio sont ses écrans Spatiaux.
    const studio = cheminsSpatiauxServis().filter((c) => c.startsWith('/studio/projets'));
    expect(studio.length).toBeGreaterThanOrEqual(8);
    expect(studio.filter((p) => !CAPACITE_DES_ROUTES[p]), 'page du nouveau Studio sans capacité').toEqual([]);
    expect(Object.values(CAPACITE_DES_ROUTES).every((c) => (CAPACITES_STUDIOS as readonly string[]).includes(c))).toBe(true);
  });

  it('aucun écran de l’ancienne expérience ne dépend d’une capacité', () => {
    const historiques = [...ROUTES_HISTORIQUES.map((r) => r.chemin).filter((c) => !c.startsWith('/studio/projets')), '/studio/ads', '/studio/image', '/studio/video', '/studio/textes', '/studio'];
    expect(historiques.filter((c) => CAPACITE_DES_ROUTES[c] !== undefined)).toEqual([]);
    expect(Object.keys(CAPACITE_DES_ROUTES).filter((c) => !c.startsWith('/studio/projets') || (ANCIENNES_ADRESSES_STUDIO as readonly string[]).includes(c))).toEqual([]);
  });
});

describe('atelier · aucun lien mort', () => {
  it('une capacité coupée ⇒ pas d’adresse, une mention ; active ⇒ l’adresse de l’écran', () => {
    const l = liensAtelierProjet('p1', (c) => c !== 'video');
    expect(l.map((x) => [x.segment, x.libelle, x.href, x.mention])).toEqual([
      ['image', 'Éditer l’image', '/studio/projets/p1/image', null],
      ['produit', 'Produit et références', '/studio/projets/p1/produit', null],
      ['textes', 'Textes liés au brief', '/studio/projets/p1/textes', null],
      ['video', 'Vidéo · storyboard et montage', null, 'non activé pour cet espace'],
      ['identites', 'Identités et voix', '/studio/projets/p1/identites', null],
      ['export', 'Exporter l’image', '/studio/projets/p1/export', null],
    ]);
  });
});
