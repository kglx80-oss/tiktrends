import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette #106b · Analytics · l'encart Meta suit l'état RÉEL du connecteur.
 * Mesuré · Meta connecté mais pas synchronisé (Connexions · « Connecté · à
 * synchroniser »), Analytics invitait encore à « Connecter Meta Ads ».
 *
 * On REND la page (base simulée · la ligne de la marque varie) et on lit le HTML.
 */
let marque: Record<string, unknown> = {};
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid' } }) }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => ({ id: 'b', name: 'Neva' }) }));
vi.mock('../app/(app)/jarvis/sections/SectionAttribution', () => ({ SectionAttribution: () => null }));
vi.mock('../app/(app)/analytics/MetaKeyMetrics', () => ({ MetaKeyMetrics: () => <div data-kpi="meta">KPI Meta</div> }));
// Base factice · la requête qui lit la marque (champ `ads`) rend `marque`, les autres rien.
const requete = (champs: Record<string, unknown>) => {
  const b: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin', 'groupBy']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => ok('ads' in champs ? [marque] : []);
  return b;
};
vi.mock('@tiktrends/db', async (orig) => ({ ...(await orig<typeof import('@tiktrends/db')>()), db: { select: (champs: Record<string, unknown>) => requete(champs ?? {}) } }));

import AnalyticsPage from '../app/(app)/analytics/page';

const texte = async () => renderToStaticMarkup(await AnalyticsPage()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const insights = { window: { since: '2026-09-01', until: '2026-09-30' } };
beforeEach(() => { marque = {}; });

describe('Analytics · l’encart Meta suit la phase du connecteur', () => {
  it('non connecté · invite à connecter', async () => {
    marque = { token: null, ads: null };
    const t = await texte();
    expect(t).toContain('Branche Meta Ads pour tes vrais KPI');
    expect(t).toContain('Connecter Meta Ads ›');
  });
  it('connecté sans données · invite à synchroniser, jamais à connecter', async () => {
    marque = { token: 'jeton-factice', compte: 'act_1', ads: null, syncedAt: null };
    const t = await texte();
    expect(t, 'on invite à connecter un compte déjà connecté').not.toContain('Connecter Meta Ads');
    expect(t).toContain('première synchronisation en attente');
    expect(t).toContain('Synchroniser Meta Ads ›');
  });
  it('connecté, plusieurs comptes, aucun choisi · invite à choisir le compte', async () => {
    marque = { token: 'jeton-factice', compte: null, comptes: [{ id: 'act_1' }, { id: 'act_2' }], ads: null };
    const t = await texte();
    expect(t).toContain('choisis le compte pub');
    expect(t).not.toContain('Connecter Meta Ads');
  });
  it('avec données · les KPI, pas d’encart', async () => {
    marque = { token: 'jeton-factice', compte: 'act_1', ads: insights, syncedAt: new Date() };
    const t = await texte();
    expect(t).toContain('KPI Meta');
    expect(t).not.toMatch(/Connecter Meta Ads|Synchroniser Meta Ads|choisis le compte pub/);
  });
});
