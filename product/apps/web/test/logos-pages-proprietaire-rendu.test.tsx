import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot A (#120) · patch propriétaire, partie Réglages abandonnée (arbitrage
 * Codex · « Services activés » ne nomme aucun fournisseur). Les outils PROPOSÉS
 * à l'utilisateur portent leur vrai logo · Shopify dans « Nouvelle marque »,
 * Meta dans l'encart Analytics sans compte branché.
 *
 * On REND chaque page (session simulée, aucune base, aucun réseau) et on lit le
 * HTML · le logo officiel est dans le bloc, l'icône générique n'y est plus.
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../lib/ai-status', () => ({ anthropicConfigured: () => false }));
vi.mock('../components/BrandWizard', () => ({ BrandWizard: () => null }));
vi.mock('../app/actions/brands', () => ({ createBrandFromShopifyAction: async () => {} }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b', name: 'Neva' }) }));
vi.mock('../app/(app)/analytics/CreativeIntel', () => ({ CreativeIntel: () => null }));
vi.mock('../app/(app)/jarvis/sections/SectionAttribution', () => ({ SectionAttribution: () => null }));

import NouvelleMarque from '../app/(app)/brands/new/page';
import AnalyticsPage from '../app/(app)/analytics/page';
import { ShopifyIcon } from '../components/BrandIcons';

/** Le bloc qui contient `titre`, du plus proche conteneur ouvrant au titre. */
function bloc(html: string, titre: string, ouvrant: RegExp): string {
  const i = html.indexOf(titre);
  expect(i, `« ${titre} » absent`).toBeGreaterThan(-1);
  const avant = html.slice(0, i);
  const debuts = [...avant.matchAll(ouvrant)];
  expect(debuts.length, `pas de conteneur avant « ${titre} »`).toBeGreaterThan(0);
  return html.slice(debuts[debuts.length - 1]!.index!, i + titre.length);
}

describe('Lot A · vrais logos des outils proposés', () => {
  it('Nouvelle marque · la carte Shopify porte le logo Shopify, plus l’icône générique', async () => {
    const html = renderToStaticMarkup(await NouvelleMarque({ searchParams: Promise.resolve({}) }));
    const carte = bloc(html, 'Connecter une boutique Shopify', /<form\b/g);
    expect(carte, 'logo Shopify absent de la carte').toContain(renderToStaticMarkup(<ShopifyIcon size={18} />));
  });

  it('Analytics sans compte · l’encart Meta porte la pastille officielle Meta', async () => {
    const html = renderToStaticMarkup(await AnalyticsPage());
    const encart = bloc(html, 'Branche Meta Ads pour tes vrais KPI', /<div style="border:1px solid var\(--accent-strong\)/g);
    expect(encart, 'pastille Meta officielle absente').toMatch(/data-logo="officiel" data-outil="meta"/);
  });
});
