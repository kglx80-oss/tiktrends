import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VerdictBadge } from '../components/VerdictBadge';
import { VERDICT_CARTE } from '@tiktrends/core';

/**
 * Le verdict du marché doit se LIRE sur la carte · on rend le badge et on lit le
 * HTML, pas seulement la présence d'un appel. Le libellé vient du noyau (règle
 * pure déjà testée) · ici on prouve qu'il arrive à l'écran, et que rien ne
 * s'affiche quand il n'y a rien à dire.
 */
describe('VerdictBadge · le résultat payé, ramené sur la carte', () => {
  it('une gagnante affiche « A gagné »', () => {
    const html = renderToStaticMarkup(<VerdictBadge etat="gagnante" />);
    expect(html).toContain(VERDICT_CARTE.gagnante.court);
    expect(html).toContain('A gagné');
  });

  it('« en mesure » s’affiche pour une créa suivie sans verdict', () => {
    expect(renderToStaticMarkup(<VerdictBadge etat="en_mesure" />)).toContain('En mesure');
  });

  it('une perdante le dit', () => {
    expect(renderToStaticMarkup(<VerdictBadge etat="perdante" />)).toContain('A perdu');
  });

  it('rien à dire (créa non suivie) → aucun rendu, pas un badge vide', () => {
    expect(renderToStaticMarkup(<VerdictBadge etat={null} />)).toBe('');
    expect(renderToStaticMarkup(<VerdictBadge />)).toBe('');
  });

  it('le mode surimpression se positionne en coin, l’inline non', () => {
    expect(renderToStaticMarkup(<VerdictBadge etat="gagnante" overlay />)).toContain('absolute');
    expect(renderToStaticMarkup(<VerdictBadge etat="gagnante" />)).not.toContain('absolute');
  });
});
