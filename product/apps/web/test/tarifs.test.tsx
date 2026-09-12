import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TarifsPage from '../app/tarifs/page';
import { PLAN_PRICE, PLAN_CREDITS, type Plan } from '../lib/rbac';

/**
 * La page tarifs AFFICHE la source de vérité, elle ne la recopie pas de tête.
 * On rend la page et on lit le HTML · les prix et le volume de crédits doivent
 * être ceux de lib/rbac (si le catalogue change, la page suit ; si elle se fige
 * sur une valeur écrite en dur, ce test tombe).
 */

const html = renderToStaticMarkup(<TarifsPage />);
const flat = html.replace(/[\s  ]/g, '');
const PLANS: Plan[] = ['starter', 'core', 'plus', 'business'];

describe('tarifs · branché sur la source de vérité (rbac)', () => {
  it('affiche les prix mensuels réels des quatre offres', () => {
    for (const p of PLANS) {
      expect(flat, `le prix ${PLAN_PRICE[p]}€ de ${p} est absent`).toContain(`${PLAN_PRICE[p]}€`);
    }
  });

  it('affiche le volume de crédits réel de chaque offre', () => {
    for (const p of PLANS) {
      expect(flat, `le volume ${PLAN_CREDITS[p]} crédits de ${p} est absent`).toContain(String(PLAN_CREDITS[p]));
    }
  });
});

describe('tarifs · structure de la page', () => {
  it('propose la bascule mensuel / annuel', () => {
    expect(html, 'la bascule est absente').toContain('2 mois offerts');
    expect(html).toContain('Annuel');
    expect(html).toContain('Mensuel');
  });

  it('offre un tableau comparatif des fonctionnalités', () => {
    expect(html, 'titre du comparatif absent').toContain('Comparer les offres');
    expect(html, 'ligne Adsmap absente').toContain('Adsmap');
    expect(html, 'ligne Studio IA absente').toContain('Studio IA');
  });

  it('reprend le menu déroulant « Ressources »', () => {
    expect(html).toContain('Ressources');
    expect(html).toContain('lp-dd-panel');
  });
});

describe('tarifs · règles d’interface du dépôt', () => {
  it('aucun tiret cadratin, pas de « Trendtrack », Adsmap bien écrit', () => {
    expect(html, 'un tiret cadratin (—) s’est glissé').not.toContain('—');
    expect(html, '« Trendtrack » à l’écran').not.toMatch(/Trendtrack/i);
    expect(html, 'ADSMAP en capitales').not.toContain('ADSMAP');
  });
});
