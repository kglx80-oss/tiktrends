import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadgeEvenement } from '../components/TrackerFeed';
import { EVENEMENT_LABEL, EVENEMENT_RAISON } from '@tiktrends/core';

/**
 * CDC v7 · N10 · le fil « Nouveautés des concurrents » ne se résume plus à un
 * badge « NOUVEAU ». On RÉINDE le badge et on lit le HTML · le libellé et sa
 * raison (infobulle) sont bien là, pas seulement appelés quelque part.
 */
describe('N10 · badge d\'événement de veille · résultat visible', () => {
  it('rend le libellé et la raison de chaque nature', () => {
    for (const ev of ['diffusion_durable', 'croissance', 'nouveaute'] as const) {
      const html = renderToStaticMarkup(<BadgeEvenement evenement={ev} />);
      expect(html).toContain(EVENEMENT_LABEL[ev]);
      expect(html).toContain(`title="${EVENEMENT_RAISON[ev]}"`);
    }
  });

  it('la diffusion durable est accentuée, la nouveauté reste neutre', () => {
    const durable = renderToStaticMarkup(<BadgeEvenement evenement="diffusion_durable" />);
    const nouveaute = renderToStaticMarkup(<BadgeEvenement evenement="nouveaute" />);
    expect(durable).toContain('var(--grad-accent)');
    expect(nouveaute).toContain('var(--ink-2)');
  });
});

/**
 * Le fil CÂBLE bien la taxonomie · il dérive les événements de l'instantané et
 * n'affiche plus un « NOUVEAU » codé en dur.
 */
describe('N10 · TrackerFeed câble la taxonomie', () => {
  const src = readFileSync(join(process.cwd(), 'components/TrackerFeed.tsx'), 'utf8');
  it('dérive les événements par pub via evenementsConcurrent', () => {
    expect(src).toMatch(/evenementsConcurrent\(e\.ad, \{ nouveau: e\.unseen \}\)/);
    expect(src).toMatch(/evenements\.map\(\(ev\) => <BadgeEvenement/);
  });
  it('plus de badge « NOUVEAU » codé en dur', () => {
    expect(src, 'l’ancien badge unique « NOUVEAU » subsiste').not.toContain('>NOUVEAU<');
  });
});
