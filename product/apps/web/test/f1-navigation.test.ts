import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CAPACITES_STUDIOS } from '@tiktrends/core';
import { ROUTES, ROUTES_HISTORIQUES, CAPACITE_DES_ROUTES, capaciteDeRoute, liensAtelierProjet, ALTERNATIVE_HISTORIQUE } from '../lib/navigation';

/**
 * F1 · la carte des écrans et leurs capacités (cahier 01 §14).
 *
 *  · chaque PAGE du nouveau Studio (`app/(app)/studio/projets/**`) dépend
 *    d'une capacité déclarée ; une page ajoutée sans capacité fait tomber ce
 *    test ;
 *  · aucun écran de l'ANCIENNE expérience (Studio, Pubs IA, Image/Vidéo/Textes
 *    IA, Veille) n'a de capacité : aucun interrupteur ne le coupe ;
 *  · l'atelier d'un projet ne produit jamais de lien vers un écran coupé.
 */

const RACINE = join(__dirname, '../app/(app)');
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pages(p);
    return n === 'page.tsx' ? ['/' + relative(RACINE, dir).split('\\').join('/')] : [];
  });
}

describe('carte · écrans du nouveau Studio et capacités', () => {
  it('chaque page sous /studio/projets a sa capacité', () => {
    const studio = pages(join(RACINE, 'studio/projets'));
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

  it('les alternatives historiques proposées existent dans la carte', () => {
    for (const a of Object.values(ALTERNATIVE_HISTORIQUE)) expect(ROUTES.some((r) => r.path === a!.href), a!.href).toBe(true);
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
