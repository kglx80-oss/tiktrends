import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot V5 · A1 · un logo de marque ne représente qu'une connexion qui EXISTE.
 *
 * ── Ce qu'on empêche ────────────────────────────────────────────────────────
 *
 * Un logo officiel posé à côté d'un geste de connexion se lit « ce connecteur
 * existe ». Poser celui de TikTok, Slack ou Stripe là où rien n'est branché
 * ferait croire à un connecteur absent. On REND les vrais écrans qui
 * représentent une connexion (page Connexions, Analytics, Nouvelle marque,
 * fiche marque · Shopify, Assets · Google Drive, Key Metrics Meta) et on lit
 * le HTML ·
 *  · chaque `LogoMarque` rendu porte une clé de `CONNEXIONS_REELLES` ;
 *  · chaque écran montre bien le logo de SA connexion ;
 *  · la liste du noyau est celle que la page Connexions dit « disponible ».
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, notFound: () => { throw new Error('404'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../lib/ai-status', () => ({ anthropicConfigured: () => false }));
vi.mock('../components/BrandWizard', () => ({ BrandWizard: () => null }));
vi.mock('../app/actions/brands', () => ({ createBrandFromShopifyAction: async () => {} }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b', name: 'Neva' }) }));
vi.mock('../app/(app)/analytics/CreativeIntel', () => ({ CreativeIntel: () => null }));
vi.mock('../app/(app)/jarvis/sections/SectionAttribution', () => ({ SectionAttribution: () => null }));
const { stub } = vi.hoisted(() => ({ stub: (extra: Record<string, unknown> = {}) => new Proxy(extra, { has: (_t: object, k: string | symbol) => k !== 'then', get: (t: Record<string, unknown>, k: string | symbol) => (k === 'then' ? undefined : k === '__esModule' ? true : typeof k === 'string' && k in t ? t[k] : async () => ({})) }) }));
vi.mock('../app/actions/connections', () => stub({
  getConnectionState: async () => ({
    shopify: { connected: false, domain: null, insights: null, syncedAt: null },
    meta: { connected: false, adAccountId: null, insights: null, accounts: [], syncedAt: null },
    syncedAt: null,
  }),
}));
vi.mock('../app/actions/drive', () => stub());
vi.mock('../app/actions/assets', () => stub());
vi.mock('../app/actions/brand-detail', () => stub());

import { CONNECTEURS_DISPONIBLES, CONNEXIONS_REELLES, connecteursBranches, estConnexionReelle } from '@tiktrends/core';
import NouvelleMarque from '../app/(app)/brands/new/page';
import { VueAnalytics } from '../components/accueil/VueAnalytics';
import { MetaKeyMetrics } from '../app/(app)/analytics/MetaKeyMetrics';
import { ShopifyConnect } from '../app/(app)/brands/[id]/ShopifyConnect';
import { LogoMarque } from '../components/LogoMarque';
import { ToastProvider } from '../components/Toast';

/** Les clés de tous les `LogoMarque` d'un rendu, dans l'ordre. */
const logos = (html: string) => [...html.matchAll(/data-logo-marque="([^"]+)"/g)].map((m) => m[1]!);

const kpi = new Proxy({}, { get: () => 1 });
const ECRANS: Array<{ ecran: string; attendu: string[]; rendre: () => Promise<string> | string }> = [
  { ecran: 'Analytics sans compte', attendu: ['meta'], rendre: async () => renderToStaticMarkup(await VueAnalytics()) },
  { ecran: 'Nouvelle marque', attendu: ['shopify'], rendre: async () => renderToStaticMarkup(await NouvelleMarque({ searchParams: Promise.resolve({}) })) },
  {
    ecran: 'Key Metrics Meta', attendu: ['meta'],
    rendre: () => renderToStaticMarkup(<MetaKeyMetrics insights={{ accountName: 'Neva FR', currency: '€', window: kpi, previous: kpi, topAds: [], spend30d: 1, purchases30d: 1, revenue30d: 1, roas30d: 1 } as never} syncedAt={null} />),
  },
  { ecran: 'Fiche marque · Shopify', attendu: ['shopify'], rendre: () => renderToStaticMarkup(<ShopifyConnect brandId="b" initialDomain={null} />) },
  // Vague 2 · la Bibliothèque est servie par Spatial (logos d'outil `LogoApp`, hors `LogoMarque`).
];

describe('chaque logo de marque rendu correspond à une connexion réelle', () => {
  for (const e of ECRANS) {
    it(`${e.ecran} · ${e.attendu.join(', ')}`, async () => {
      const vus = logos(await e.rendre());
      for (const cle of vus) {
        expect(estConnexionReelle(cle), `${e.ecran} · le logo « ${cle} » représente un connecteur qui n’existe pas`).toBe(true);
      }
      expect(vus, `${e.ecran} · le logo de la connexion manque ou change`).toEqual(e.attendu);
    });
  }

  it('fiche marque · la bande « Connecté » ne montre que des connexions réelles', () => {
    const branches = connecteursBranches({ metaToken: 'x', shopifyToken: 'y' });
    const html = branches.map((b) => renderToStaticMarkup(<LogoMarque marque={b.key} taille="xs" decoratif />)).join('');
    expect(logos(html)).toEqual(['meta', 'shopify']);
    for (const cle of logos(html)) expect(estConnexionReelle(cle), `bande Connecté · « ${cle} » n’est pas une connexion réelle`).toBe(true);
  });
});

describe('la liste du noyau est celle des écrans', () => {
  it('CONNEXIONS_REELLES = ce que l’écran Connexions déclare branchable', () => {
    // Vague 2 · l'écran V5 est retiré · l'écran Spatial compte ses branchables sur CONNECTEURS_DISPONIBLES.
    expect(Object.values(CONNEXIONS_REELLES), 'le noyau et l’écran Connexions divergent sur les connexions réelles').toEqual([...CONNECTEURS_DISPONIBLES]);
  });

  it('aucun écran ne pose LogoMarque avec une clé écrite en dur hors des connexions réelles', () => {
    // Filet de source · un nouvel écran non rendu ci-dessus est vu ici.
    const fichiers: string[] = [];
    const parcourir = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (p.endsWith('.tsx')) fichiers.push(p);
      }
    };
    parcourir(join(process.cwd(), 'app'));
    parcourir(join(process.cwd(), 'components'));
    const poses = fichiers.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<LogoMarque\s+marque="([^"]+)"/g)].map((m) => ({ f, cle: m[1]! })));
    // Vague 2 · les écrans V5 retirés emportent leurs poses · il en reste (analytics, accueil) ; zéro = lecture cassée.
    expect(poses.length, 'aucune pose de LogoMarque trouvée · la lecture est cassée').toBeGreaterThan(0);
    for (const { f, cle } of poses) expect(estConnexionReelle(cle), `${f} · LogoMarque « ${cle} » n’est pas une connexion réelle`).toBe(true);
  });
});
