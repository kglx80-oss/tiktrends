import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CouvertureMarche } from '../components/ContexteCreation';

/**
 * CDC v8 · F05 · le compteur de couverture doit distinguer les CRÉAS décrites des
 * CONCURRENTS qui les portent · afficher « 16 concurrents » là où il y a 16 créas
 * de 2 concurrents confond deux unités. On rend le HTML et on lit ce qui s'écrit.
 */
describe('F05 · couverture du marché · créas et concurrents, deux unités', () => {
  it('16 créas de 2 concurrents ne se dit pas « 16 concurrents »', () => {
    const h = renderToStaticMarkup(<CouvertureMarche described={16} advertisers={2} />);
    expect(h).toContain('16');
    expect(h).toContain('créa');
    expect(h).toContain('2');
    expect(h).toContain('concurrent');
    // Le défaut · « 16 concurrent(s) » · ne doit plus apparaître.
    expect(h).not.toMatch(/16<\/b>\s*créa[^<]*<\/[^>]*>\s*concurrent/);
    expect(h.replace(/<[^>]*>/g, '')).not.toContain('16 concurrent');
    expect(h.replace(/<[^>]*>/g, '')).toContain('2 concurrent');
  });

  it('un seul concurrent · singulier', () => {
    const t = renderToStaticMarkup(<CouvertureMarche described={4} advertisers={1} />).replace(/<[^>]*>/g, '');
    expect(t).toContain('4 créas décrites');
    expect(t).toContain('1 concurrent ');   // singulier · pas « concurrents »
  });

  it('sans concurrent identifié · on ne prétend rien', () => {
    const t = renderToStaticMarkup(<CouvertureMarche described={3} advertisers={0} />).replace(/<[^>]*>/g, '');
    expect(t).toContain('3 créas décrites');
    expect(t).not.toContain('concurrent');
  });
});
