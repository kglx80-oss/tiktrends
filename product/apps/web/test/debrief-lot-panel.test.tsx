import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { debriefLot, type RelecturePub } from '@tiktrends/core';
import { DebriefLotPanel } from '../app/(app)/studio/ads/DebriefLotPanel';

/**
 * Ce que le panneau AFFICHE · pas ce que le fichier mentionne.
 *
 * Même discipline que la fenêtre de l'assistant · on rend le composant et on
 * lit le HTML. Un débrief calculé mais posé dans un bloc mort ne produirait
 * aucun texte, et c'est précisément ce qu'un garde qui vérifie un APPEL ne
 * saurait pas voir.
 */

function relectures(o: Partial<RelecturePub>, n: number): RelecturePub[] {
  return Array.from({ length: n }, () => ({
    accrocheReecrite: o.accrocheReecrite ?? false,
    copieMineure: o.copieMineure ?? false,
    produitFidele: o.produitFidele === undefined ? true : o.produitFidele,
    texteLisible: o.texteLisible === undefined ? true : o.texteLisible,
  }));
}

function html(d: Parameters<typeof DebriefLotPanel>[0]['d']): string {
  return renderToStaticMarkup(<DebriefLotPanel d={d} />);
}

describe('le panneau montre le verdict du lot', () => {
  it('rien à relire · le panneau ne rend rien', () => {
    // Un lot composé ne porte aucune relecture · afficher « 0 conforme »
    // ferait lire un échec là où il n'y a eu aucune mesure.
    expect(html(null)).toBe('');
  });

  it('un lot propre affiche sa phrase, en vert', () => {
    const d = debriefLot(relectures({}, 6));
    const out = html(d);
    expect(out, 'la phrase du débrief doit être lisible dans le HTML').toContain('toutes les accroches sont conformes');
    expect(out).toContain('6 produits fidèles sur 6 avec photo');
    expect(out, 'un lot propre est marqué comme tel').toContain('✓');
  });

  it('un lot avec une accroche réécrite le dit, en alerte', () => {
    const d = debriefLot([...relectures({}, 5), ...relectures({ accrocheReecrite: true }, 1)]);
    const out = html(d);
    expect(out).toContain('5 accroches conformes, 1 réécrite');
    // Le signal d'alerte est l'icône `alert` du jeu · on lit son tracé dans le HTML.
    expect(out, 'un défaut éliminatoire est signalé').toContain('M10.3 3.9');
  });

  it('un texte illisible remonte dans le débrief', () => {
    const d = debriefLot([...relectures({}, 4), ...relectures({ texteLisible: false }, 2)]);
    const out = html(d);
    expect(out, 'la 3e question se lit dans le panneau').toContain('2 au texte illisible');
    expect(out).toContain('M10.3 3.9');
  });
});
