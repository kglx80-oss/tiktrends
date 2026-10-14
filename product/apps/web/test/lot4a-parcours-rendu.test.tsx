import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { parcoursResultats, LIBELLE_NATURE, type CompteBoucle } from '@tiktrends/core';

/**
 * UX V2 · lot 4a · Veille et Résultats, parcours de la boucle (maquette § 7).
 *
 * On REND les vraies pages (serveur simulé · pas de base, pas de réseau, pas
 * de source, aucune écriture) et on lit le HTML :
 *  · Veille · source → analyse → projet, lu sur ce que la grille affiche ; les
 *    raccourcis Scale / Radar / Sauvegardes ne doublonnent plus les onglets ;
 *  · Résultats · hypothèse → lot → mesures → apprentissage, lu sur les comptes
 *    réels de la marque ; une étape vide le dit, avec un chemin que le RÔLE
 *    peut suivre ; la nature de chaque étape est affichée.
 */

const etat = {
  role: 'owner' as 'owner' | 'member',
  compte: null as CompteBoucle | null,
  lots: [] as Array<{ id: string; number: number; status: string; goal: string | null; launchedAt: string | null; ads: number }>,
};

vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }), usePathname: () => '/veille', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: etat.role, plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => true }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Neva' }) }));
vi.mock('../lib/veille-recette-base', () => ({ baseUrlRecette: () => undefined, cleEffective: () => undefined }));
vi.mock('next/link', () => ({ default: ({ href, children, prefetch: _p, ...p }: { href: string; children: ReactNode; prefetch?: unknown }) => <a data-lien-client href={href} {...p}>{children}</a> }));
vi.mock('../app/(app)/jarvis/sections/SectionMarche', () => ({ SectionMarche: () => null }));
vi.mock('../app/(app)/jarvis/sections/SectionEssais', () => ({ SectionEssais: () => <section id="appris" /> }));
vi.mock('../components/AdCard', () => ({
  AdCard: ({ ad }: { ad: { id: string; advertiserName?: string } }) => <article data-carte={ad.id}>{ad.advertiserName}</article>,
  compact: (n: number) => String(n),
}));
// Résultats · les comptes et les lots sont fournis par le test (aucune base).
vi.mock('../lib/boucle-resultats', () => ({ compterBoucle: async () => etat.compte }));
vi.mock('../app/actions/adsmap', () => ({ listBatchesAction: async () => etat.lots }));
vi.mock('../lib/adsmap-marque', () => ({ adsDeLaMarque: async () => new Map() }));
vi.mock('../app/(app)/adsmap/Views', () => ({ Views: () => <div data-vues="" /> }));
vi.mock('../app/(app)/adsmap/SyncButton', () => ({ SyncButton: () => null }));
vi.mock('../app/(app)/adsmap/ShareButton', () => ({ ShareButton: () => null }));

import InspoPage from '../app/(app)/veille/page';
import AdsMapPage from '../app/(app)/adsmap/page';

const veille = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await InspoPage({ searchParams: Promise.resolve(sp) }));
const resultats = async () => renderToStaticMarkup(await AdsMapPage({ searchParams: Promise.resolve({}) }));

/** Les étapes rendues du parcours · clé, atteinte, texte visible. */
function etapes(html: string) {
  const i = html.indexOf('data-zone="parcours-boucle"');
  if (i < 0) return [];
  const ol = html.slice(i, html.indexOf('</ol>', i));
  return [...ol.matchAll(/<li data-etape="([^"]+)" data-nature="([^"]+)" data-atteinte="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({
    cle: m[1]!, nature: m[2]!, atteinte: m[3]!, html: m[4]!,
    texte: m[4]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    hrefs: [...m[4]!.matchAll(/href="([^"]+)"/g)].map((h) => h[1]!),
  }));
}

const vide: CompteBoucle = { tests: 0, avecHypothese: 0, lots: 0, lotsLances: 0, lotsImportes: 0, mesures: 0, aArbitrer: 0, arbitres: 0, apprentissages: 0, derniereMesure: null };

beforeEach(() => { etat.role = 'owner'; etat.compte = null; etat.lots = []; });

describe('Veille · source → analyse → projet (page rendue, démonstration)', () => {
  it('trois étapes dans l’ordre, chacune avec sa nature affichée', async () => {
    const e = etapes(await veille());
    expect(e.map((x) => x.cle), 'le parcours de la Veille n’est pas rendu').toEqual(['source', 'analyse', 'projet']);
    expect(e[0]!.texte).toContain(LIBELLE_NATURE.observation);
    expect(e[2]!.texte).toContain(LIBELLE_NATURE.hypothese);
  });

  it('la source lit la grille réellement affichée · la démonstration est nommée', async () => {
    const html = await veille();
    const cartes = (html.match(/data-carte="/g) || []).length;
    expect(cartes).toBeGreaterThan(0);
    const source = etapes(html)[0]!;
    expect(source.atteinte).toBe('oui');
    expect(source.texte, 'le compte affiché n’est pas celui de la grille').toContain(`${cartes} annonce${cartes > 1 ? 's' : ''} d’échantillon (démonstration)`);
  });

  it('une recherche sans résultat · source et analyse se disent vides', async () => {
    const e = etapes(await veille({ q: 'zzzzzzzz' }));
    expect(e[0]!.atteinte).toBe('non');
    expect(e[0]!.texte).toContain('Aucune annonce affichée');
    expect(e[1]!.atteinte).toBe('non');
  });

  it('le projet n’invente pas d’état et mène aux projets Studios', async () => {
    const projet = etapes(await veille())[2]!;
    expect(projet.atteinte).toBe('inconnu');
    expect(projet.texte).toContain('Préparer une création');
    expect(projet.hrefs).toEqual(['/studio/projets']);
  });

  it('plus aucun raccourci doublon des onglets (Ce qui scale, Radar créatif, Sauvegardes)', async () => {
    const html = await veille();
    for (const h of ['/veille/scale', '/radar', '/saved']) expect(html, `raccourci ${h} encore dans la page`).not.toContain(`href="${h}"`);
    expect(html).toContain('Ouvrir mes tests dans Résultats');
  });
});

describe('Résultats · hypothèse → lot → mesures → apprentissage (page rendue)', () => {
  it('marque sans donnée · quatre étapes vides, l’avertissement le dit, la première est « à faire ensuite »', async () => {
    etat.compte = vide;
    const html = await resultats();
    const e = etapes(html);
    expect(e.map((x) => x.cle), 'la boucle n’est pas rendue').toEqual(['hypothese', 'lot', 'mesures', 'apprentissage']);
    expect(e.every((x) => x.atteinte === 'non'), 'une étape sans donnée se dit atteinte').toBe(true);
    expect(html).toContain('data-avertissement-boucle');
    expect(html).toContain('Aucun résultat mesuré pour cette marque');
    expect(e[0]!.texte).toContain('à faire ensuite');
    expect(e[1]!.texte).not.toContain('à faire ensuite');
  });

  it('hypothèse, organisation et résultat mesuré se lisent comme trois natures distinctes', async () => {
    etat.compte = vide;
    const e = etapes(await resultats());
    expect(e.map((x) => x.nature)).toEqual(['hypothese', 'organisation', 'mesure', 'apprentissage']);
    expect(e[0]!.texte).toContain(LIBELLE_NATURE.hypothese);
    expect(e[1]!.texte).toContain(LIBELLE_NATURE.organisation);
    expect(e[2]!.texte).toContain(LIBELLE_NATURE.mesure);
  });

  it('admin · les états vides offrent les chemins qui les remplissent', async () => {
    etat.compte = vide;
    const e = etapes(await resultats());
    expect(e[0]!.hrefs).toEqual(['/adsmap/radar', '/adsmap/import']);
    expect(e[1]!.hrefs).toContain('/adsmap/lots');
    expect(e[2]!.hrefs).toEqual(['/adsmap/import']);
    expect(e[3]!.hrefs).toContain('#appris');
  });

  it('membre · aucun lien vers un écran réservé aux admins, on lui dit qui agit', async () => {
    etat.role = 'member';
    etat.compte = vide;
    const html = await resultats();
    const tous = etapes(html).flatMap((x) => x.hrefs);
    for (const r of ['/adsmap/lots', '/adsmap/import', '/adsmap/radar']) expect(tous, `lien admin rendu à un membre · ${r}`).not.toContain(r);
    expect(html).toContain('Un admin de l’espace');
  });

  it('données réelles · les chiffres reçus sont ceux affichés, rien n’est annoncé gagnant', async () => {
    etat.compte = { tests: 6, avecHypothese: 5, lots: 3, lotsLances: 2, lotsImportes: 1, mesures: 4, aArbitrer: 3, arbitres: 1, apprentissages: 2, derniereMesure: '2026-10-09T08:00:00.000Z' };
    const html = await resultats();
    const e = etapes(html);
    expect(e.every((x) => x.atteinte === 'oui')).toBe(true);
    expect(e[0]!.texte).toContain('5 tests portent une hypothèse écrite · 1 test sans hypothèse.');
    expect(e[1]!.texte).toContain('3 lots · 2 lancés · 1 importé.');
    expect(e[2]!.texte).toContain('4 tests mesurés sur la diffusion réelle · 1 verdict arbitré · dernière mesure le 09/10/2026.');
    expect(e[2]!.hrefs).toEqual(['#tests']);
    expect(e[3]!.hrefs).toEqual(['/adsmap/suites', '#appris']);
    expect(html, 'avertissement « aucun résultat » alors que des mesures existent').not.toContain('data-avertissement-boucle');
    const boucle = e.map((x) => x.texte).join(' ').toLowerCase();
    expect(boucle).not.toMatch(/gagnant|vainqueur|winner/);
    // L'ancre des étapes existe · les tests sont dessous.
    expect(html).toMatch(/<div id="tests"[^>]*><div data-vues=""/);
  });

  it('les comptes viennent du chargeur, pas d’une valeur posée dans la page', async () => {
    etat.compte = { ...vide, tests: 2, avecHypothese: 1 };
    const a = etapes(await resultats())[0]!.texte;
    etat.compte = { ...vide, tests: 9, avecHypothese: 7 };
    const b = etapes(await resultats())[0]!.texte;
    expect(a).toContain('1 test porte une hypothèse écrite');
    expect(b).toContain('7 tests portent une hypothèse écrite');
  });

  it('sans base (chargeur nul) · pas de parcours à zéro qui dirait « rien n’a été fait »', async () => {
    etat.compte = null;
    const html = await resultats();
    expect(etapes(html)).toEqual([]);
    expect(html).not.toContain('data-avertissement-boucle');
    expect(html).toContain('data-vues');
  });
});

describe('Résultats · le chargeur est en lecture seule (source)', () => {
  it('aucune écriture ni appel externe dans `compterBoucle`', () => {
    const src = readFileSync(join(process.cwd(), 'lib/boucle-resultats.ts'), 'utf8');
    expect(src).not.toMatch(/\.(insert|update|delete)\(/);
    expect(src).not.toMatch(/fetch\(|@tiktrends\/ai|anthropic|\bfal\b/i);
    expect(src).toContain('compterLots(');
  });

  it('la règle d’affichage vient du noyau · la page n’en pose pas', () => {
    const page = readFileSync(join(process.cwd(), 'app/(app)/adsmap/page.tsx'), 'utf8');
    expect(page).toContain('parcoursResultats(compte, { peutAgir: peutMesurer })');
    // Le noyau, pour un membre, ne propose pas les lots.
    expect(parcoursResultats(vide, { peutAgir: false }).etapes.flatMap((e) => e.liens.map((l) => l.href))).not.toContain('/adsmap/lots');
  });
});
