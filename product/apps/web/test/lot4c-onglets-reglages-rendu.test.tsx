import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ONGLETS_REGLAGES, PAGES_ADMINISTRATION } from '@tiktrends/core';

/**
 * UX V2 · lot 4c · les onglets de Réglages et d'Administration, au RÉSULTAT.
 *
 * On REND les vraies pages serveur (session simulée, base pglite vide) pour cinq
 * rôles, et on lit si la page S'OUVRE à ce rôle (refus = redirection ou écran
 * « Accès réservé » · c'est la garde écrite dans la page, pas une copie).
 *
 * Les barres d'onglets V5 (`OngletsReglages`, `OngletsAdministration`) sont
 * retirées avec l'ancienne coquille · toutes ces pages sont servies par
 * Spatial, dont la sous-navigation du Tour de contrôle est éprouvée plus bas
 * (chaque entrée proposée s'ouvre).
 */
const etat = vi.hoisted(() => ({ session: null as unknown }));
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID() };
});

vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_noStore: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  return { ...actual, db: await pgMemoire(actual.schema as unknown as Record<string, unknown>) };
});

type Rendu = () => Promise<unknown>;
const sp = { searchParams: Promise.resolve({}) };
const PAGES: Record<string, Rendu> = {
  // Ces écrans n'ont plus de page V5 · seul Spatial les sert. Leur GARDE est lue ici sur la page Spatial.
  '/settings': async () => (await import('../app/(spatial)/sp/settings/page')).default(),
  '/team': async () => (await import('../app/(spatial)/sp/team/page')).default(),
  '/connections': async () => (await import('../app/(spatial)/sp/connections/page')).default(),
  '/usage': async () => (await import('../app/(spatial)/sp/usage/page')).default(),
  '/billing': async () => (await import('../app/(spatial)/sp/billing/page')).default(),
  '/profile': async () => (await import('../app/(spatial)/sp/profile/page')).default(),
  '/admin': async () => (await import('../app/(spatial)/sp/admin/page')).default(),
  '/admin/finance': async () => (await import('../app/(spatial)/sp/admin/finance/page')).default(),
  '/admin/signups': async () => (await import('../app/(spatial)/sp/admin/signups/page')).default(),
  '/admin/equipe': async () => (await import('../app/(spatial)/sp/admin/equipe/page')).default(sp),
  '/admin/plans': async () => (await import('../app/(spatial)/sp/admin/plans/page')).default(sp),
  '/admin/paiement': async () => (await import('../app/(spatial)/sp/admin/paiement/page')).default(),
  '/admin/incidents': async () => (await import('../app/(spatial)/sp/admin/incidents/page')).default(sp),
  '/admin/depenses': async () => (await import('../app/(spatial)/sp/admin/depenses/page')).default(sp),
  '/admin/intelligence': async () => (await import('../app/(spatial)/sp/admin/intelligence/page')).default(),
  '/admin/connaissances': async () => (await import('../app/(spatial)/sp/admin/connaissances/page')).default(),
  '/admin/ia-studios': async () => (await import('../app/(spatial)/sp/admin/ia-studios/page')).default(),
  '/admin/studios-interrupteurs': async () => (await import('../app/(spatial)/sp/admin/studios-interrupteurs/page')).default(sp),
  '/console': async () => (await import('../app/(spatial)/sp/console/page')).default(sp),
  '/credits': async () => (await import('../app/(spatial)/sp/credits/page')).default(),
};

const base = (o: Record<string, unknown>) => ({ user: { id: ids.user, email: 'client@exemple.invalid', name: 'Client' }, workspaceId: ids.ws, workspaceName: 'Espace', plan: 'business', equipe: null, ...o });
const ROLES: Record<string, () => unknown> = {
  'propriétaire': () => base({ role: 'owner' }),
  'admin d’espace': () => base({ role: 'admin' }),
  membre: () => base({ role: 'member' }),
  lecteur: () => base({ role: 'client_viewer' }),
  'équipe plateforme': () => base({ role: 'owner', user: { id: ids.user, email: 'kguilbaux@agence-glx.fr', name: 'K' }, equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } }),
  // Rôle d'équipe GRADÉ · la matrice ne lui montre que Réglages et Équipe du
  // menu de compte. Les onglets en sont un sous-ensemble (jamais plus large
  // que les pages) · la complétude ne s'applique pas à lui.
  'manager d’équipe (matrice)': () => base({ role: 'owner', equipe: { role: 'manager', matrice: { manager: ['reglages', 'equipe'] }, plateformeAdmissible: true } }),
};

type Issue = { ouvre: boolean; html: string | null; erreur?: string };
async function rendre(chemin: string): Promise<Issue> {
  try {
    const html = renderToStaticMarkup((await PAGES[chemin]!()) as React.ReactElement);
    if (html.includes('Accès réservé à l’équipe de la plateforme.')) return { ouvre: false, html };
    return { ouvre: true, html };
  } catch (e) {
    const m = (e as Error).message;
    if (m.startsWith('redirect:')) return { ouvre: false, html: null };
    // La garde est passée (elle précède toute lecture), le rendu a échoué plus loin.
    return { ouvre: true, html: null, erreur: m };
  }
}

const REGLAGES = ONGLETS_REGLAGES.map((e) => e.href);
const ADMINISTRATION = PAGES_ADMINISTRATION.filter((p) => !p.horsOnglets).map((p) => p.href);

beforeAll(async () => {
  const { db, schema } = await import('@tiktrends/db');
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Espace', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'client@exemple.invalid', name: 'Client' });
});
afterEach(() => { etat.session = null; });

describe('lot 4c · la garde de chaque page, par rôle', () => {
  it('les ouvertures attendues par rôle · la garde des pages, inchangée', async () => {
    const ouvre = async (role: string) => {
      etat.session = ROLES[role]!();
      const r: string[] = [];
      for (const c of Object.keys(PAGES)) if ((await rendre(c)).ouvre) r.push(c);
      return r.sort();
    };
    expect(await ouvre('membre')).toEqual(['/profile']);
    expect(await ouvre('lecteur')).toEqual(['/profile']);
    expect(await ouvre('propriétaire')).toEqual([...REGLAGES].sort());
    expect(await ouvre('admin d’espace')).toEqual([...REGLAGES].sort());
    expect(await ouvre('équipe plateforme')).toEqual([...REGLAGES, ...ADMINISTRATION].sort());
  });
});

describe('lot 4c · entrée de l’Administration', () => {
  // Vague 3 · l'accueil V5 des coulisses (cartes par groupe) est retiré · le Tour de contrôle Spatial et sa
  // sous-navigation le remplacent. Reste gardé ici · aucun onglet ne mène à une page absente.
  it('chaque page d’Administration existe (écran Spatial) · aucun lien mort', () => {
    for (const p of PAGES_ADMINISTRATION) {
      const segs = p.href.split('/').filter(Boolean);
      const existe = existsSync(join(process.cwd(), 'app', '(spatial)', 'sp', ...segs, 'page.tsx'));
      expect(existe, `${p.href} · page absente`).toBe(true);
    }
  });

  it('fondateur sans compte admissible (SEC-10) · ni les modèles IA ni les interrupteurs ne s’ouvrent', async () => {
    etat.session = base({ role: 'owner', user: { id: ids.user, email: 'kguilbaux@agence-glx.fr', name: 'K' }, equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: false } });
    // Vague 4 · plus aucune page V5 ne porte la barre d'Administration (toutes servies par
    // Spatial) · la protection reste le refus des pages elles-mêmes, gardé ici.
    expect((await rendre('/admin/ia-studios')).ouvre, 'la page refuse bien ce compte').toBe(false);
    expect((await rendre('/admin/studios-interrupteurs')).ouvre, 'la page refuse bien ce compte').toBe(false);
    // La sous-navigation Spatial du Tour de contrôle ne les propose pas non plus.
    const { html, ouvre } = await rendre('/admin');
    expect(ouvre, 'le Tour de contrôle s’ouvre à ce fondateur').toBe(true);
    expect(html).toContain('href="/admin/churn"');
    expect(html, 'Modèles IA proposé à un compte que la page refuse').not.toContain('href="/admin/ia-studios"');
    expect(html, 'Interrupteurs proposés à un compte que la page refuse').not.toContain('href="/admin/studios-interrupteurs"');
  });

  it('Tour de contrôle Spatial · chaque entrée proposée s’ouvre, pour chaque compte qui y entre (SEC-10)', async () => {
    const comptes = [
      { nom: 'fondateur non admissible', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: false } },
      { nom: 'fondateur admissible', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } },
      { nom: 'fondateur sans équipe', equipe: undefined },
    ];
    let proposees = 0;
    for (const c of comptes) {
      etat.session = base({ role: 'owner', user: { id: ids.user, email: 'kguilbaux@agence-glx.fr', name: 'K' }, equipe: c.equipe });
      const { html, ouvre } = await rendre('/admin');
      expect(ouvre, `${c.nom} · le Tour de contrôle s’ouvre`).toBe(true);
      for (const href of Object.keys(PAGES).filter((h) => h.startsWith('/admin/') || h === '/console')) {
        if (!html!.includes(`href="${href}"`)) continue;
        proposees++;
        expect((await rendre(href)).ouvre, `${c.nom} · ${href} proposé dans la sous-navigation, que la page refuse`).toBe(true);
      }
    }
    // Mesuré : 30 entrées proposées sur les trois comptes (28/10/2026) · plancher 20.
    expect(proposees).toBeGreaterThanOrEqual(20);
    etat.session = base({ role: 'owner', user: { id: ids.user, email: 'kguilbaux@agence-glx.fr', name: 'K' }, equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } });
    const admissible = (await rendre('/admin')).html!;
    expect(admissible, 'le fondateur admissible voit bien Modèles IA').toContain('href="/admin/ia-studios"');
    expect(admissible, 'le fondateur admissible voit bien les Interrupteurs').toContain('href="/admin/studios-interrupteurs"');
  });
});
