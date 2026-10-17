import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { etatProchainesIterations, tuilesAccueil } from '@tiktrends/core';
import { ProchainesIterations } from '../components/accueil/ProchainesIterations';
import { TuilesAccueil } from '../components/accueil/TuilesAccueil';
import { ICON_PATHS } from '../components/Icon';

/**
 * Fidélité V5 · l'Accueil réel RENDU porte les signes de la maquette (2.webp),
 * ceux qui ne dépendent PAS de la donnée :
 *
 *  · l'en-tête « Prochaines itérations » est le carré magenta PLEIN au glyphe de
 *    relance blanc · `--grad-accent` + `--on-accent` + icône `refresh`, jamais
 *    le lavis `--accent-soft` + `--accent-strong` + `trend` (arbitrage tranché
 *    sur la maquette Accueil, aligné sur Studios) ;
 *  · chaque bouton « Itérer » porte le même glyphe de relance ;
 *  · les pastilles d'icône des tuiles d'action sont teintées d'accent
 *    (`--accent-soft`), pas un placeholder neutre (`--paper`).
 *
 * On LIT le HTML produit (pas « une fonction est appelée »). Chaque assertion a
 * été éprouvée par mutation (voir le bloc de doc de la PR).
 */

const iterations = etatProchainesIterations({
  refus: null, marqueActive: true, peutIterer: true,
  contexte: () => ({ metricsAgg: { ctr: 0.27, daysElapsed: 7 }, plateforme: 'meta', lot: { numero: 1, statut: 'analyzed' }, apprentissageValide: true }),
  lecture: { ok: true, rows: [
    { adId: '0f8e7a52-3c1d-4b6e-9a2f-1d2c3b4a5e6f', label: 'C · v1', conceptTitle: 'C', variableLabel: 'le format', freezeLabels: ['l’accroche'], rationale: 'r', edgeLegal: true, parentVerdict: 'winner', parentComparable: true },
  ] },
});
const iterHtml = renderToStaticMarkup(<ProchainesIterations etat={iterations} />);

const tuilesHtml = renderToStaticMarkup(<TuilesAccueil tuiles={tuilesAccueil({ nouveauProjet: '/studio/projets/nouveau', veille: true, jarvis: true, importer: true, fiche: { href: '/brands/b1', manques: ['le ton'] } })} />);

describe('fidélité V5 · l’Accueil rendu porte les signes de la maquette', () => {
  it('l’en-tête « Prochaines itérations » est le carré magenta plein au glyphe refresh', () => {
    // La pastille d'en-tête · la seule de 40 px.
    const chip = /<span aria-hidden="true" style="(width:40px;height:40px;[^"]*)">(.*?)<\/span>/s.exec(iterHtml);
    expect(chip, 'pastille d’en-tête 40px introuvable').not.toBeNull();
    expect(chip![1], 'le fond n’est pas le gradient d’accent plein').toContain('background:var(--grad-accent)');
    expect(chip![1], 'le glyphe n’est pas posé sur `--on-accent`').toContain('color:var(--on-accent)');
    expect(chip![1], 'le lavis `--accent-soft` subsiste en en-tête').not.toContain('var(--accent-soft)');
    expect(chip![2], 'le glyphe d’en-tête n’est pas l’icône refresh').toContain(`d="${ICON_PATHS.refresh}"`);
  });

  it('le bouton « Itérer » porte le glyphe de relance (refresh), pas trend', () => {
    const btn = /<a[^>]*data-iterer[^>]*>(.*?)<\/a>/s.exec(iterHtml);
    expect(btn, 'bouton Itérer introuvable').not.toBeNull();
    expect(btn![1], 'le bouton Itérer ne porte pas l’icône refresh').toContain(`d="${ICON_PATHS.refresh}"`);
    expect(btn![1], 'le bouton Itérer porte encore l’icône trend').not.toContain(`d="${ICON_PATHS.trend}"`);
  });

  it('les pastilles d’icône des tuiles sont teintées d’accent (--accent-soft), jamais --paper', () => {
    const chips = [...tuilesHtml.matchAll(/<span aria-hidden="true" style="(width:36px;height:36px;[^"]*)">/g)];
    expect(chips.length, 'aucune pastille de tuile rendue').toBeGreaterThanOrEqual(2);
    for (const c of chips) {
      expect(c[1], 'une pastille de tuile n’est pas teintée d’accent').toContain('background:var(--accent-soft)');
      expect(c[1], 'une pastille de tuile retombe sur le placeholder --paper').not.toContain('var(--paper)');
    }
  });
});
