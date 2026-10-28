import { describe, it, expect } from 'vitest';
import { CAPACITES_STUDIOS } from '@tiktrends/core';
import { ROUTES, ROUTES_HISTORIQUES, CAPACITE_DES_ROUTES, capaciteDeRoute, liensAtelierProjet } from '../lib/navigation';
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
 *    les anciennes adresses sont cachées de la carte (jamais dans un fil) ;
 *  · l'atelier d'un projet ne produit jamais de lien vers un écran coupé.
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
    expect(historiques.filter((c) => capaciteDeRoute(c) !== null)).toEqual([]);
    expect(ROUTES.filter((r) => CAPACITE_DES_ROUTES[r.path] && !r.path.startsWith('/studio/projets')).map((r) => r.path)).toEqual([]);
  });

  it('la page ADMIN est déclarée dans la carte (fil d’Ariane, section Plateforme)', () => {
    expect(ROUTES.find((r) => r.path === '/admin/studios-interrupteurs')).toMatchObject({ parent: '/admin', section: 'Plateforme' });
  });

  it('les anciennes adresses de création sont des redirections cachées, jamais une destination', () => {
    for (const a of ANCIENNES_ADRESSES_STUDIO) expect(ROUTES.find((r) => r.path === a), a).toMatchObject({ hidden: true });
  });
});

describe('atelier · aucun lien mort', () => {
  it('une capacité coupée ⇒ pas d’adresse, une mention ; active ⇒ l’adresse de l’écran', () => {
    const l = liensAtelierProjet('p1', (c) => c !== 'video');
    expect(l.map((x) => [x.segment, x.href, x.mention])).toEqual([
      ['image', '/studio/projets/p1/image', null],
      ['produit', '/studio/projets/p1/produit', null],
      ['textes', '/studio/projets/p1/textes', null],
      ['video', null, 'non activé pour cet espace'],
      ['identites', '/studio/projets/p1/identites', null],
      ['export', '/studio/projets/p1/export', null],
    ]);
  });
});
