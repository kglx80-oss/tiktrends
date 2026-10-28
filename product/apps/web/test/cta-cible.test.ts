import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LIEN_NOUVEAU_PROJET, LIEN_TOUS_PROJETS, raccourcisAccueil } from '@tiktrends/core';

/**
 * Un CTA qui promet une action doit MENER à cette action.
 *
 * Les cartes de l'accueil (« Générer des hooks », « Écrire un script »)
 * pointaient vers `/studio` · or `/studio` est le hub d'orientation, une page à
 * quatre cartes qui ne lit AUCUN paramètre. Le clic « marchait » mais déposait
 * l'utilisateur sur un choix de plus, pas sur l'écran qui écrit. Le studio qui
 * rend du texte est `/studio/textes`. Vague 2 Spatial v4 · l'Accueil est servi
 * par Spatial · on lit les destinations RENDUES par la règle de ses raccourcis
 * (`raccourcisAccueil`, tous ouverts) et le lien « Tous les projets », et on
 * vérifie qu'aucune ne retombe sur le hub nu, et que la cible existe.
 *
 * Même classe de défaut que le CTA Radar → `?inspo=` : un geste qui a l'air de
 * marcher sans rien armer. On le mesure sur le RÉSULTAT (la destination écrite),
 * pas sur la présence d'un lien.
 */
describe('les cartes de l’accueil mènent à un écran qui agit, pas au hub nu', () => {
  const destinations = [
    ...raccourcisAccueil({ nouveauProjet: LIEN_NOUVEAU_PROJET.href, formats: true, forfaits: true, importer: true, fiche: { href: '/brands/b1?tab=overview#profil', manques: [] } }).map((r) => r.href),
    LIEN_TOUS_PROJETS.href.split('?')[0]!,
  ];

  it('aucune carte ne pointe vers le hub `/studio` nu · il ne lit aucun intent', () => {
    const versHub = destinations.filter((h) => h === '/studio');
    expect(versHub, `Carte(s) menant au hub d'orientation au lieu d'un studio précis : ${versHub.length}`)
      .toEqual([]);
  });

  it('les cartes de création mènent aux Studios (préparer, reprendre), jamais à une ancienne adresse ; les cibles existent', () => {
    expect(destinations).toContain('/studio/projets/nouveau');
    expect(destinations).toContain('/studio/projets');
    expect(destinations.filter((h) => /^\/studio\/(ads|image|video|textes)\b/.test(h)), 'carte vers un ancien studio retiré').toEqual([]);
    expect(existsSync(join(process.cwd(), 'app', '(spatial)', 'sp', 'studio', 'projets', 'nouveau', 'page.tsx'))).toBe(true);
  });
});
