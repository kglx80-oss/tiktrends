import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Spatial · Accueil · la vue Analytics (`/dashboard?vue=analytics`) et le
 * sélecteur Accueil · Analytics, portés de l'ancien Accueil (gardes de
 * `lot19a-analytics-droits`, `lot19a-accueil-vues-rendu` et
 * `analytics-encart-meta-rendu`, désormais lues sur la VRAIE page Spatial).
 *
 * On rend la page serveur (session simulée, base factice NOTÉE) et on lit :
 *  - le refus · rendu AVANT toute lecture (ni marque, ni base, ni bilan) ;
 *  - les parcours autorisés · les lectures ont bien lieu (la sonde regarde la
 *    bonne chose), encart Meta selon la phase réelle du connecteur, KPI Meta
 *    et diversité calculés sur les lignes lues, bilan avancé sous son droit ;
 *  - le sélecteur · deux onglets au propriétaire, aucun au rôle sans Analytics.
 */
type Session = {
  workspaceId: string; workspaceName: string; role: 'owner' | 'admin' | 'member' | 'client_viewer'; plan: 'starter' | 'core' | 'plus' | 'business';
  user: { id: string; email: string; name: string };
  equipe?: { role: 'membre' | 'lecture' | 'freelance' | 'manager'; matrice: Record<string, never> } | null;
};
const etat = vi.hoisted(() => ({
  session: null as unknown,
  lectures: [] as string[],
  base: false,
  marque: {} as Record<string, unknown>,
  generations: [] as Array<{ input: unknown }>,
  assets: [] as Array<{ tags: string[] | null }>,
}));
const proprietaire = (): Session => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid', name: 'Camille' }, equipe: null });

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));
// La base · chaque accès est NOTÉ · `null` (rien ne s'exécute) ou une base factice qui rend les lignes du test par champ lu.
const requete = (champs: Record<string, unknown>) => {
  const b: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin', 'groupBy']) b[m] = () => b;
  b.then = (ok: (v: unknown) => unknown) => ok('ads' in champs ? [etat.marque] : 'input' in champs ? etat.generations : 'tags' in champs ? etat.assets : []);
  return b;
};
vi.mock('@tiktrends/db', async (orig) => {
  const actual = await orig<typeof import('@tiktrends/db')>();
  return { ...actual, get db() { etat.lectures.push('db'); return etat.base ? { select: (c: Record<string, unknown>) => requete(c ?? {}) } : null; } };
});
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => { etat.lectures.push('marque active'); return { id: 'b1', name: 'Neva' }; }, listBrands: async () => [] }));
vi.mock('../app/actions/adsmap-attribution', () => ({
  attributionViewAction: async () => { etat.lectures.push('bilan'); return {}; },
  creativeTrendAction: async () => { etat.lectures.push('tendance'); return {}; },
}));

import AccueilSpatial from '../app/(spatial)/sp/dashboard/page';

const rendre = async (params: Record<string, string> = {}) => renderToStaticMarkup(await AccueilSpatial({ searchParams: Promise.resolve(params) }));
const texte = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const onglets = (h: string) => {
  const n = /<nav class="seg subnav"[^>]*>([\s\S]*?)<\/nav>/.exec(h)?.[1];
  return n == null ? null : [...n.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map((m) => [/href="([^"]+)"/.exec(m[1]!)![1]!.replace(/&amp;/g, '&'), m[2], m[1]!.includes('aria-current="page"')]);
};
const KPI = { spend: 1200, cpa: 20, roas: 2.5, revenue: 3000, aov: 50, cpcAll: 1, cpcLink: 1.5, cpm: 10 };
const PREC = { spend: 1000, cpa: 25, roas: 2, revenue: 2000, aov: 50, cpcAll: 1, cpcLink: 1.5, cpm: 8 };

beforeEach(() => {
  etat.session = proprietaire(); etat.lectures = []; etat.base = false; etat.marque = {}; etat.generations = []; etat.assets = [];
});

describe('Spatial · Analytics · refus serveur, aucune lecture', () => {
  const refuses: Array<[string, () => Session]> = [
    ['membre d’équipe « membre » (matrice sans Analytics)', () => ({ ...proprietaire(), role: 'member', equipe: { role: 'membre', matrice: {} } })],
    ['membre d’équipe « freelance » (matrice sans Analytics)', () => ({ ...proprietaire(), role: 'member', equipe: { role: 'freelance', matrice: {} } })],
  ];
  for (const [nom, session] of refuses) {
    it(nom, async () => {
      etat.session = session();
      const h = await rendre({ vue: 'analytics' });
      expect(h, 'l’écran de refus n’est pas rendu').toContain('data-vue="analytics-refusee"');
      expect(h).toContain('Ton rôle ne donne pas accès à Analytics');
      for (const b of ['data-vue="analytics"', 'Branche Meta Ads', 'Key Metrics', 'Diversité créative', 'id="attribution"', 'Bilan avancé']) expect(h, `donnée d’Analytics servie malgré le refus · ${b}`).not.toContain(b);
      expect(etat.lectures, 'une lecture a eu lieu avant le refus').toEqual([]);
      expect(onglets(h), 'un onglet Analytics proposé à un rôle qui ne l’ouvre pas').toBeNull();
    });
  }
});

describe('Spatial · Analytics · parcours autorisés', () => {
  const autorises: Array<[string, () => Session]> = [
    ['propriétaire', proprietaire],
    ['lecteur client, offre Starter (rôle et offre minimum de la matrice)', () => ({ ...proprietaire(), role: 'client_viewer', plan: 'starter' })],
    ['membre d’équipe « lecture » (sa matrice ouvre Analytics)', () => ({ ...proprietaire(), role: 'member', equipe: { role: 'lecture', matrice: {} } })],
  ];
  for (const [nom, session] of autorises) {
    it(nom, async () => {
      etat.session = session();
      const h = await rendre({ vue: 'analytics' });
      expect(h).not.toContain('analytics-refusee');
      expect(h).toContain('data-vue="analytics"');
      expect(h, 'sans base, l’encart de la phase « à brancher »').toContain('Meta Ads non connecté');
      expect(etat.lectures, 'la vue autorisée ne lit plus ses données').toEqual(expect.arrayContaining(['marque active', 'db']));
      expect(h, 'l’Accueil se rend sous la vue Analytics').not.toContain('Bonjour');
    });
  }
  it('propriétaire · le bilan avancé (gardé par son propre droit Adsmap) est là, ancre comprise · le lecteur Starter ne le lit pas', async () => {
    const h = await rendre({ vue: 'analytics' });
    expect(h).toContain('id="attribution"');
    expect(h).toContain('Bilan avancé · Jarvis');
    expect(etat.lectures).toEqual(expect.arrayContaining(['bilan', 'tendance']));
    etat.session = { ...proprietaire(), role: 'client_viewer', plan: 'starter' }; etat.lectures = [];
    const l = await rendre({ vue: 'analytics' });
    expect(l).not.toContain('id="attribution"');
    expect(etat.lectures).not.toContain('bilan');
  });
});

describe('Spatial · Analytics · l’encart Meta suit la phase réelle du connecteur', () => {
  beforeEach(() => { etat.base = true; });
  it('non connecté · invite à connecter', async () => {
    etat.marque = { token: null, ads: null };
    const t = texte(await rendre({ vue: 'analytics' }));
    expect(t).toContain('Meta Ads non connecté');
    expect(t).toContain('Connecter Meta Ads');
  });
  it('connecté sans données · invite à synchroniser, jamais à connecter', async () => {
    etat.marque = { token: 'jeton-factice', compte: 'act_1', ads: null, syncedAt: null };
    const t = texte(await rendre({ vue: 'analytics' }));
    expect(t, 'on invite à connecter un compte déjà connecté').not.toContain('Connecter Meta Ads');
    expect(t).toContain('première synchronisation en attente');
    expect(t).toContain('Synchroniser Meta Ads');
  });
  it('connecté, plusieurs comptes, aucun choisi · invite à choisir le compte', async () => {
    etat.marque = { token: 'jeton-factice', compte: null, comptes: [{ id: 'act_1' }, { id: 'act_2' }], ads: null };
    const t = texte(await rendre({ vue: 'analytics' }));
    expect(t).toContain('Meta Ads connecté · compte pub à choisir');
    expect(t).toContain('Choisir le compte pub');
    expect(t).not.toContain('Connecter Meta Ads');
  });
  it('avec données · les KPI Meta lus (valeur, variation, top créas), pas d’encart · aucune démo', async () => {
    etat.marque = { token: 'jeton-factice', compte: 'act_1', syncedAt: new Date(2026, 9, 20), ads: {
      accountName: 'Compte Neva', currency: '€', window: KPI, previous: PREC,
      topAds: [{ name: 'Plongeon', spend: 400, roas: 3.2, cpa: 12, purchases: 30 }],
      breakdowns: { platform: [{ key: 'instagram', spend: 800, roas: 2.4, purchases: 1 }], ageGender: [] },
    } };
    const h = await rendre({ vue: 'analytics' });
    const t = texte(h);
    expect(t).not.toMatch(/Connecter Meta Ads|Synchroniser Meta Ads|compte pub à choisir|en attente|DÉMO|démonstration/);
    // Les chiffres clés · LA règle partagée (`chiffresClesMeta`, D2), la même phrase de source que l'Accueil, Jarvis et le Radar.
    expect(t).toContain('Chiffres clés D’après ton compte publicitaire Meta · 30 jours au 20 oct.');
    expect(t, 'la dépense et sa variation (+20 %)').toMatch(/Dépense 1 ?200 € ▲ \+20,0 %/);
    expect(t, 'un CPA qui baisse est une bonne nouvelle').toContain('CPA 20,00 € ▼ −20,0 %');
    expect(h, 'la baisse du CPA se colore en bien').toMatch(/<span class="d" style="color:var\(--good\)">▼ −20,0 %<\/span>/);
    // Les autres indicateurs, que seul le compte porte · datés de leur relevé.
    expect(t).toContain('Autres indicateurs du compte');
    expect(t).toMatch(/Meta Ads · synchronisé [^·]+ · 30 j vs 30 j précédents · Compte Neva · KPI du 20 oct\./);
    expect(t).toContain('Par plateforme');
    expect(t).toContain('Plongeon 3,2× 12,00 € 400,00 €');
  });
  it('diversité créative · calculée sur les générations et les tags lus', async () => {
    etat.marque = { token: null, ads: null };
    etat.generations = [{ input: { template: 'ugc', headline: 'A' } }, { input: { template: 'ugc', headline: 'B' } }, { input: { template: 'offer', headline: 'A' } }];
    etat.assets = [{ tags: ['Plage', 'été'] }, { tags: ['plage'] }];
    const t = texte(await rendre({ vue: 'analytics' }));
    expect(t).toContain('Diversité créative');
    expect(t).toContain('3 créa(s) analysée(s)');
    expect(t).toContain('UGC 2');
    expect(t).toContain('plage 2');
  });
});

describe('Spatial · Accueil · le sélecteur de vue suit le rôle', () => {
  it('propriétaire · deux onglets, vrais liens, l’Accueil actif par défaut, Analytics actif sur la vue', async () => {
    expect(onglets(await rendre())).toEqual([['/dashboard', 'Accueil', true], ['/dashboard?vue=analytics', 'Analytics', false]]);
    expect(onglets(await rendre({ vue: 'analytics' }))).toEqual([['/dashboard', 'Accueil', false], ['/dashboard?vue=analytics', 'Analytics', true]]);
  });
  it('rôle sans droit Analytics · aucun onglet, aucun lien vers la vue', async () => {
    etat.session = { ...proprietaire(), role: 'member', equipe: { role: 'freelance', matrice: {} } };
    const h = await rendre();
    expect(onglets(h)).toBeNull();
    expect(h).not.toContain('?vue=analytics');
    expect(h).toContain('Bonjour');
  });
});
