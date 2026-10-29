// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sousNavResultats } from '@tiktrends/core';

vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { VueEnsemble } from '../spatial/vues/resultats/VueEnsemble';
import { Lot } from '../spatial/vues/resultats/Lot';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const IMG = 'https://cdn.exemple.test/v.jpg';
const NAV = sousNavResultats({ admin: true });

/*
 * Planche finale · D4 · lot #3 à 4 variantes · la 4e passait seule à la ligne
 * (grille de 3 de la maquette), sa barre 350 px plus bas · le graphique ne se
 * lisait plus comme une comparaison. On lit le HTML rendu · la grille porte
 * autant de colonnes que de variantes, toutes enfants directs d'UNE rangée.
 */
describe('Spatial · Résultats · N variantes sur une rangée (D4)', () => {
  const dom = (html: string) => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
  const vedette = (n: number) => ({
    statut: { libelle: 'À conclure', classe: 'g' as const }, meta: 'Lot #3', titre: 'Format 9:16 contre 4:5',
    variantes: 'ABCDEF'.slice(0, n).split('').map((v, i) => ({ id: v, texte: 'x', image: IMG, variante: v, categorie: 'Format', gagnante: i === 0, barre: { libelle: `${10 + i} €`, part: 100 - i * 10 } })),
    note: 'n', passe: 'p', retient: { texte: 'r', niveau: 3 as const, detail: 'Mesuré' }, ensuite: 'e',
    suite: { libelle: 'Préparer la suite', href: '/adsmap/suites' }, lot: { libelle: 'Conclure le lot #3', href: '/adsmap/lots/l3' },
  });
  const ensemble = (n: number) => dom(rendre(<VueEnsemble sousNav={NAV} sous="s" accroche={{ avant: '', fort: '', apres: '' }} kpis={[]} vedette={vedette(n)} autres={[]} commencer={{ libelle: 'x', href: '/adsmap/lots' }} />));
  const fiche = (n: number) => dom(rendre(<Lot sous="s" titre="t" verdict={{ gagnant: true, titre: 'A', phrase: 'p', niveau: 3 }}
    variantes={'ABCDEF'.slice(0, n).split('').map((v, i) => ({ id: v, texte: 'x', image: IMG, tag: `${v} · gagnante`, gagnante: i === 0, barre: { libelle: '1 €', part: 50 } }))}
    controles={[]} coach={{ avant: '', fort: '', apres: '' }} />));

  for (const n of [4, 5, 6]) {
    it(`${n} variantes · « Vue d’ensemble » et fiche du lot · une colonne par variante, une seule rangée`, () => {
      const rvfs = ensemble(n).querySelector<HTMLElement>('.rvfs')!;
      expect(rvfs.querySelectorAll(':scope > figure.rvf')).toHaveLength(n);
      expect(rvfs.style.gridTemplateColumns, 'la grille de 3 de la maquette renvoie la 4e à la ligne').toBe(`repeat(${n}, minmax(64px, 1fr))`);
      expect(rvfs.style.overflowX, 'trop étroit (390 px) · la rangée défile au lieu de casser').toBe('auto');
      expect(rvfs.style.padding, 'la zone défilante rogne l’anneau de la gagnante (2 px hors du cadre)').toBe('2px');
      expect([rvfs.getAttribute('tabindex'), rvfs.getAttribute('role'), rvfs.getAttribute('aria-label')]).toEqual(['0', 'region', `Les ${n} variantes du lot, côte à côte`]);
      const lot = fiche(n).querySelector<HTMLElement>('.lotgrid')!;
      expect(lot.querySelectorAll(':scope > figure')).toHaveLength(n);
      expect(lot.style.gridTemplateColumns).toBe(`repeat(${n}, minmax(120px, 1fr))`);
    });
  }

  it('jusqu’à 3 variantes · la grille de la maquette, sans style ni zone défilante ajoutés', () => {
    for (const n of [2, 3]) {
      expect(ensemble(n).querySelector('.rvfs')!.hasAttribute('style')).toBe(false);
      expect(ensemble(n).querySelector('.rvfs')!.hasAttribute('tabindex')).toBe(false);
      expect(fiche(n).querySelector('.lotgrid')!.hasAttribute('style')).toBe(false);
    }
  });
});
