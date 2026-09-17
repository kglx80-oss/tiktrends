import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DebriefLotPanel } from '../app/(app)/studio/ads/DebriefLotPanel';
import { CIBLE_TACTILE_MIN, type DebriefLot } from '@tiktrends/core';

/**
 * Le débrief du dernier lot est déjà transitoire (#481 · il ne se reconstruit
 * plus au rechargement). Restait un manque d'usabilité : rien pour l'ENLEVER
 * sans recharger · « pourquoi ce message reste ? ». On rend le panneau et on
 * lit le HTML · le bouton de fermeture doit être là quand on peut fermer.
 *
 * On ne teste pas la présence d'un handler · on lit l'affordance rendue.
 */
const d: DebriefLot = {
  n: 4, accrocheConforme: 4, accrocheMineure: 0, accrocheReecrite: 0,
  avecReference: 3, produitFidele: 3, produitInfidele: 1, sansReference: 0,
  texteIllisible: 0, toutBon: false,
  resume: '4 publicités relues · toutes les accroches sont conformes.',
};

const html = (over: Partial<Parameters<typeof DebriefLotPanel>[0]> = {}) =>
  renderToStaticMarkup(<DebriefLotPanel d={d} {...over} />);

describe('Le débrief du lot se ferme sans recharger', () => {
  it('rend un bouton de fermeture quand onClose est fourni', () => {
    const out = html({ onClose: () => {} });
    expect(out, 'l’affordance de fermeture manque').toContain('aria-label="Fermer le débrief"');
  });

  it('le bouton de fermeture atteint la cible tactile', () => {
    const out = html({ onClose: () => {} });
    // On isole le tag ouvrant du bouton de fermeture et on lit ses dimensions.
    const i = out.indexOf('aria-label="Fermer le débrief"');
    const debut = out.lastIndexOf('<button', i);
    const tag = out.slice(debut, out.indexOf('>', i));
    expect(tag, 'la croix de fermeture est sous la cible tactile').toContain(`width:${CIBLE_TACTILE_MIN}px`);
    expect(tag, 'la croix de fermeture est sous la cible tactile').toContain(`height:${CIBLE_TACTILE_MIN}px`);
  });

  it('pas de bouton de fermeture sans onClose (rien à câbler)', () => {
    const out = html();
    expect(out, 'un bouton de fermeture apparaît sans handler').not.toContain('Fermer le débrief');
  });

  it('sans débrief, aucun panneau (donc rien à fermer)', () => {
    const out = renderToStaticMarkup(<DebriefLotPanel d={null} onClose={() => {}} />);
    expect(out, 'un panneau s’affiche alors qu’il n’y a pas de lot').toBe('');
  });
});
