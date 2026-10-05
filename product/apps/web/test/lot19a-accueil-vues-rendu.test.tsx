import { describe, expect, it, vi, beforeEach } from 'vitest';
import { prerender } from 'react-dom/static';
import type { ReactNode } from 'react';
import { journey } from '@tiktrends/core';

/**
 * Lot 19A · l'Accueil réunit le Pilotage · garde de RENDU.
 *
 * On REND la vraie page `/dashboard` (session simulée, ni base ni réseau) et on
 * lit le HTML :
 *  - le sélecteur de vue existe pour un rôle qui ouvre Analytics, avec de vrais
 *    liens et `aria-current` ; il n'existe PAS pour un rôle qui ne l'ouvre pas ;
 *  - `?vue=analytics` rend l'Analytics COMPLET · le HTML de la vue montée par
 *    l'Accueil est OCTET POUR OCTET celui du composant partagé (aucune copie),
 *    ancre `#attribution` comprise ;
 *  - les paramètres traversent les onglets ;
 *  - l'ancienne route `/analytics` redirige, paramètres préservés.
 */

type Session = {
  workspaceId: string; workspaceName: string; role: 'owner' | 'admin' | 'member' | 'client_viewer'; plan: 'business';
  user: { id: string; email: string; name: string };
  equipe?: { role: 'membre' | 'lecture'; matrice: Record<string, never> };
};
const etat: { session: Session } = { session: null as unknown as Session };
const proprietaire = (): Session => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid', name: 'Camille' } });
// Un membre de l'équipe plateforme au rôle « membre » · sa matrice par défaut
// n'ouvre PAS la rubrique Analytics (le rail la lui tait).
const sansAnalytics = (): Session => ({ ...proprietaire(), role: 'member', equipe: { role: 'membre', matrice: {} } });

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Neva' }), listBrands: async () => [{ id: 'b1', name: 'Neva' }] }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => false }));
vi.mock('../lib/founder', () => ({ isFounder: () => false }));
vi.mock('../lib/ai-status', () => ({ anthropicConfigured: () => false }));
vi.mock('../lib/onboarding-state', () => ({ onboardingState: async () => ({ journey: journey(new Set(['brand', 'products', 'connect', 'generate', 'track', 'verdict']), { canAdmin: true }), relance: null }) }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
// Le bilan avancé (attribution) est rendu POUR DE VRAI · seules ses lectures
// en base sont simulées · on prouve ainsi que l'ancre `#attribution` existe.
vi.mock('../app/actions/adsmap-attribution', () => ({ attributionViewAction: async () => ({}), creativeTrendAction: async () => ({}) }));

import Dashboard from '../app/(app)/dashboard/page';
import AnalyticsPage from '../app/(app)/analytics/page';
import { VueAnalytics } from '../components/accueil/VueAnalytics';

/** Rend un arbre serveur (composants asynchrones compris) en HTML. */
async function html(n: ReactNode): Promise<string> {
  const { prelude } = await prerender(<>{n}</>);
  return new Response(prelude).text();
}
const accueil = async (params?: Record<string, string | string[]>) =>
  html(await Dashboard({ searchParams: Promise.resolve(params ?? {}) }));
const nav = (h: string) => {
  const i = h.indexOf('aria-label="Vues de l’accueil"');
  return i < 0 ? null : h.slice(h.lastIndexOf('<nav', i), h.indexOf('</nav>', i) + 6);
};
const liens = (h: string) => [...h.matchAll(/<a [^>]*?href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ href: m[1]!.replace(/&amp;/g, '&'), texte: m[2]!, actif: m[0].includes('aria-current="page"') }));

beforeEach(() => { etat.session = proprietaire(); });

describe('Accueil · le sélecteur de vue suit le rôle', () => {
  it('propriétaire · deux onglets, vrais liens, l’Accueil actif par défaut, 44 px', async () => {
    const h = await accueil();
    const n = nav(h);
    expect(n, 'le sélecteur de vue est absent de l’Accueil').not.toBeNull();
    expect(liens(n!), 'liens du sélecteur faux ou onglet actif non annoncé (aria-current)').toEqual([
      { href: '/dashboard', texte: 'Accueil', actif: true },
      { href: '/dashboard?vue=analytics', texte: 'Analytics', actif: false },
    ]);
    expect(n!, 'cible tactile sous 44 px').toContain('min-height:44px');
    // Le reste de l'Accueil est inchangé · la salutation et le bandeau sont là.
    expect(h).toContain('Bonjour');
    expect(h, 'la vue Analytics fuit sur l’Accueil par défaut').not.toContain('data-vue="analytics"');
  });

  it('rôle sans droit Analytics · aucun onglet, Accueil identique à avant', async () => {
    etat.session = sansAnalytics();
    const h = await accueil();
    expect(nav(h), 'un onglet Analytics est proposé à un rôle qui ne l’ouvre pas').toBeNull();
    expect(h).not.toContain('?vue=analytics');
    expect(h).toContain('Bonjour');
  });
});

describe('Accueil · ?vue=analytics rend l’Analytics complet, sans copie', () => {
  it('les blocs d’Analytics, et l’onglet Analytics actif', async () => {
    const h = await accueil({ vue: 'analytics' });
    for (const bloc of ['>Analytics</h1>', 'Aperçu créas', 'Répartition Radar', 'Dépense par plateforme', 'Top créas par ROAS', 'Branche Meta Ads pour tes vrais KPI', 'Bilan avancé · Jarvis']) {
      expect(h, `bloc Analytics manquant · ${bloc}`).toContain(bloc);
    }
    expect(liens(nav(h)!).map((l) => [l.texte, l.actif]), 'l’onglet Analytics n’est pas annoncé actif (aria-current)').toEqual([['Accueil', false], ['Analytics', true]]);
    expect(h, 'l’Accueil se rend sous la vue Analytics').not.toContain('Bonjour');
  });

  it('le HTML de la vue est celui du composant partagé, octet pour octet', async () => {
    const h = await accueil({ vue: 'analytics' });
    const seule = await html(await VueAnalytics());
    expect(seule.length).toBeGreaterThan(2000);
    expect(h.includes(seule), 'la vue montée par l’Accueil diverge du composant partagé').toBe(true);
  });

  it('l’ancre #attribution existe sur la nouvelle adresse', async () => {
    expect(await accueil({ vue: 'analytics' })).toContain('id="attribution"');
  });

  it('les paramètres traversent les onglets', async () => {
    const h = await accueil({ vue: 'analytics', periode: '7j', tag: ['a', 'b'] });
    expect(liens(nav(h)!).map((l) => l.href)).toEqual(['/dashboard?periode=7j&tag=a&tag=b', '/dashboard?vue=analytics&periode=7j&tag=a&tag=b']);
  });

  it('rôle sans droit · ?vue=analytics rend ce que /analytics rendait (la vue, sans onglet)', async () => {
    etat.session = sansAnalytics();
    const h = await accueil({ vue: 'analytics' });
    expect(nav(h)).toBeNull();
    expect(h).toContain(await html(await VueAnalytics()));
  });

  it('une valeur de vue inconnue retombe sur l’Accueil', async () => {
    const h = await accueil({ vue: 'pilotage' });
    expect(h).toContain('Bonjour');
    expect(h).not.toContain('data-vue="analytics"');
  });
});

describe('/analytics · route historique, redirigée sans perte', () => {
  const cible = async (params: Record<string, string | string[]>) => {
    try { await AnalyticsPage({ searchParams: Promise.resolve(params) }); } catch (e) { return String((e as Error).message); }
    return 'aucune redirection';
  };
  it('sans paramètre', async () => {
    expect(await cible({})).toBe('REDIRECT:/dashboard?vue=analytics');
  });
  it('chaque paramètre, dans l’ordre, valeurs répétées comprises', async () => {
    expect(await cible({ periode: '7j', marque: 'b1', tag: ['été', 'a&b'] }))
      .toBe('REDIRECT:/dashboard?vue=analytics&periode=7j&marque=b1&tag=%C3%A9t%C3%A9&tag=a%26b');
  });
  it('une `vue` étrangère ne détourne pas la cible, et n’est pas doublée', async () => {
    expect(await cible({ vue: 'accueil', a: '1' })).toBe('REDIRECT:/dashboard?vue=analytics&a=1');
  });
});
