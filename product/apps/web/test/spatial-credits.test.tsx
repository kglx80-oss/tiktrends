// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { COST_MODEL, CREDIT_COSTS, LARGEUR_MIN_TABLE_TELEPHONE, ecranSpatial } from '@tiktrends/core';

/**
 * Vague 4 · « Crédits & marges » (`/credits`) · écran V5 du personnel de la
 * plateforme, sans fragment de maquette, porté dans le Tour de contrôle et
 * EXCLUSIF (page V5 retirée). On REND la vraie page serveur (base pglite,
 * session simulée) et on lit le HTML.
 *
 * Gardes V5 PORTÉES ici (leurs fichiers ou cas V5 sont retirés) :
 *  · recette #106 (`compte-support-recette`) · pas de report de 25 % promis,
 *    consommé borné (« Sans objet » quand il ne se mesure pas), illimité = ∞,
 *    actions et motifs en clair (jamais une clé brute) ;
 *  · `empty-adoption` · l'historique vide invite à générer (Studios) ;
 *  · `credits-sans-emoji` · aucun pictogramme ;
 *  · `conso-barres` · aucune barre écrite à la main (l'écran Spatial n'en a plus).
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), vide: randomUUID(), user: randomUUID() };
});
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown>, illimite: false }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => etat.illimite }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(), usePathname: () => '/credits',
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_noStore: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));

import { db, schema } from '@tiktrends/db';
import CreditsMargesSpatial from '../app/(spatial)/sp/credits/page';

const FONDATEUR = 'kguilbaux@agence-glx.fr';
const session = (o: Record<string, unknown> = {}) => ({
  user: { id: ids.user, email: FONDATEUR, name: 'K' }, workspaceId: ids.ws, workspaceName: 'Agence', role: 'owner', plan: 'core', equipe: null, ...o,
});

beforeAll(async () => {
  const dans2Jours = new Date(Date.now() + 2 * 86_400_000 - 60_000);
  await db!.insert(schema.workspaces).values([
    { id: ids.ws, name: 'Agence', plan: 'core', creditsBalance: 15000, trialEndsAt: dans2Jours, accountKind: 'beta' },
    { id: ids.vide, name: 'Vide', plan: 'core', creditsBalance: 2000 },
  ]);
  await db!.insert(schema.users).values({ id: ids.user, email: FONDATEUR, name: 'K' });
  await db!.insert(schema.creditLedger).values([
    { workspaceId: ids.ws, delta: 500, reason: 'topup', createdAt: new Date('2026-10-20T09:00:00Z') },
    { workspaceId: ids.ws, delta: -4, reason: 'adsmap:propose:abc', createdAt: new Date('2026-10-21T09:00:00Z') },
  ]);
});
beforeEach(() => { etat.session = session(); etat.illimite = false; });

const page = async () => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(await CreditsMargesSpatial()); return d; };
const zone = (d: HTMLElement, g: string) => d.querySelector(`[data-geste="${g}"]`)!;
const plat = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

describe('Spatial · Crédits & marges · servi par Spatial, dans le Tour de contrôle', () => {
  it('servi par Spatial, section Admin', () => {
    expect(ecranSpatial('/credits')).toEqual({ interne: '/sp/credits', section: 'admin' });
  });
  it('la sous-navigation l’affiche, onglet courant', async () => {
    const courant = (await page()).querySelector('nav.subnav a[aria-current="page"]');
    expect(courant?.getAttribute('href')).toBe('/credits');
  });
});

describe('Spatial · Crédits & marges · mêmes portes que la V5', () => {
  it('sans session · connexion', async () => {
    etat.session = null;
    await expect(page()).rejects.toThrow('redirect /login');
  });
  it('membre · retour à l’accueil', async () => {
    etat.session = session({ role: 'member' });
    await expect(page()).rejects.toThrow('redirect /dashboard');
  });
  it('administrateur hors personnel de la plateforme · son abonnement, jamais les marges', async () => {
    etat.session = session({ user: { id: ids.user, email: 'client@agence.test', name: 'C' } });
    await expect(page()).rejects.toThrow('redirect /billing');
  });
});

describe('Spatial · Crédits & marges · le compte de l’espace', () => {
  it('solde, allocation de la formule et consommé du cycle · réels', async () => {
    const t = plat(zone(await page(), 'compte').textContent).replace(/ | /g, ' ');
    expect(t).toContain('15 000');
    expect(t).toContain('Allocation · Core');
    expect(t).toContain('20 000');
    expect(t, '(20 000 − 15 000) / 20 000 · nouvelle unité').toContain('25 %');
  });
  it('#106 · illimité = ∞, consommé « Sans objet », jamais un 100 % fantôme', async () => {
    etat.illimite = true;
    const t = plat(zone(await page(), 'compte').textContent);
    expect(t).toContain('∞');
    expect(t).toContain('Sans objet');
    expect(t).not.toMatch(/100 %/);
  });
  it('période d’essai · jours restants, alerte sous 3 jours', async () => {
    const e = zone(await page(), 'essai');
    expect(plat(e.textContent)).toContain('Compte de test / beta · 2 jours restants');
    expect(e.getAttribute('role')).toBe('alert');
  });
  it('historique · motifs en clair, crédit et débit distingués', async () => {
    const lignes = [...zone(await page(), 'historique').querySelectorAll('.atr')].map((l) => [plat(l.querySelector('b')?.textContent), plat(l.querySelector('.pill')?.textContent), l.querySelector('.pill')?.className]);
    expect(lignes[0]).toEqual(['Adsmap · propositions de concepts', '-4', 'pill r']);
    expect(lignes[1]![1]).toBe('+500');
    expect(lignes[1]![2]).toBe('pill g');
  });
  it('historique vide · illimité, aucune dépense promise ; invite à générer', async () => {
    etat.session = session({ workspaceId: ids.vide }); etat.illimite = true;
    const h = zone(await page(), 'historique');
    expect(h.textContent).toContain('tes générations ne débitent pas de crédits');
    expect(h.textContent).not.toContain('se dépensent à chaque génération');
    expect(h.querySelector('a')?.getAttribute('href')).toBe('/studio/projets');
  });
});

describe('Spatial · Crédits & marges · le modèle économique', () => {
  it('une ligne par action du modèle de coûts · libellés en clair', async () => {
    const d = await page();
    const ops = zone(d, 'operations').querySelectorAll('[data-action]');
    expect(ops.length).toBe(COST_MODEL.length);
    const bareme = [...zone(d, 'bareme').querySelectorAll('.atr')];
    expect(bareme.length).toBe(Object.keys(CREDIT_COSTS).length);
    const texteBareme = plat(zone(d, 'bareme').textContent);
    for (const cle of ['asset_analysis', 'map_proposal', 'tag_video']) expect(texteBareme, `clé brute ${cle}`).not.toContain(cle);
  });
  it('marge nette · les formules PAYANTES seulement (Starter absente)', async () => {
    const t = plat(zone(await page(), 'nets').textContent);
    for (const f of ['Core', 'Plus', 'Business']) expect(t).toContain(f);
    expect(t).not.toContain('Starter');
  });
  it('pire cas · une ligne par formule payante, la lecture tirée des chiffres', async () => {
    const d = await page();
    const r = zone(d, 'risques');
    expect([...r.querySelectorAll('[data-forfait]')].map((x) => x.getAttribute('data-forfait'))).toEqual(['Core', 'Plus', 'Business']);
    const lecture = plat(zone(d, 'lecture').textContent);
    const fragiles = [...r.querySelectorAll('[data-forfait]')].filter((x) => x.querySelector('.pill')?.className !== 'pill g');
    if (fragiles.length) expect(lecture).toMatch(/formules? sous 70 % au pire cas/);
    else expect(lecture).toContain('tiennent 70 %');
  });
  it('#106 · aucun report de 25 % promis · aucun pictogramme', async () => {
    const t = (await page()).querySelector('.view')!.textContent ?? '';
    expect(t).not.toContain('Report partiel de 25');
    const ecran = t.slice(t.indexOf('Crédits & marges'));
    expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2728}\u{2726}\u{FE0F}]/u.test(ecran)).toBe(false);
  });
  it('les gestes de pilotage restent dans « Forfaits »', async () => {
    expect((await page()).querySelector('a[href="/admin/plans"]')).not.toBeNull();
  });
});

describe('Spatial · Crédits & marges · au téléphone, aucune valeur rognée (planche v4 · G4)', () => {
  // Sans largeur minimale, les quatre tables se partageaient ~294 px à 390 · 51 textes rognés (« 0,… € », « Anthr… »).
  // Chacune défile désormais dans son cadre à une largeur MESURÉE au banc ; ses lignes gardent leurs propres colonnes.
  it.each([
    ['operations', LARGEUR_MIN_TABLE_TELEPHONE.operationsCredits],
    ['nets', LARGEUR_MIN_TABLE_TELEPHONE.netsCredits],
    ['risques', LARGEUR_MIN_TABLE_TELEPHONE.risquesCredits],
    ['corrections', LARGEUR_MIN_TABLE_TELEPHONE.correctionsCredits],
  ] as const)('« %s » défile à %i px au moins', async (table, min) => {
    const t = (await page()).querySelector(`.atable[data-table="${table}"]`) as HTMLElement | null;
    expect(t, `table ${table} absente`).toBeTruthy();
    expect(t!.style.overflowX, `${table} · la table ne défile pas, ses cellules seront rognées`).toBe('auto');
    expect(t!.style.gridTemplateColumns).toBe(`minmax(${min}px, 1fr)`);
    const lignes = [...t!.querySelectorAll('.atr')] as HTMLElement[];
    expect(lignes.length).toBeGreaterThan(1);
    for (const l of lignes) expect(l.style.gridTemplateColumns.split(/\s+/).length, `${table} · une ligne sans colonnes propres s'empilerait`).toBeGreaterThan(3);
  });
});
