import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ECRANS_SPATIAUX, ONGLETS_REGLAGES, PAGES_ADMINISTRATION } from '@tiktrends/core';
import { OngletsReglages, OngletsAdministration } from '../components/OngletsReglages';

/**
 * UX V2 · lot 4c · les onglets de Réglages et d'Administration, au RÉSULTAT.
 *
 * On REND les vraies pages serveur (session simulée, base pglite vide) pour cinq
 * rôles, et on lit deux choses dans le HTML :
 *
 *  1. la page S'OUVRE-t-elle à ce rôle ? Refus = redirection ou écran « Accès
 *     réservé » · c'est la garde écrite dans la page, pas une copie ;
 *  2. quels onglets propose-t-elle ?
 *
 * La règle éprouvée · aucune page ne propose un onglet que sa destination
 * refuserait, et chaque page ouverte de la famille y figure (rien de caché à
 * tort). L'onglet de la page affichée porte `aria-current="page"`.
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
const SPATIAUX = new Set(['/settings', '/team', '/connections', '/usage', '/billing',
  // Vague 3 · Admin · l'accueil des coulisses, les gestes et les outils de la plateforme ne sont plus servis que par Spatial.
  '/admin', '/admin/equipe', '/admin/plans', '/admin/paiement', '/admin/incidents', '/admin/depenses', '/admin/intelligence',
  '/admin/connaissances', '/admin/ia-studios', '/admin/studios-interrupteurs', '/console',
  // Vague 2 Spatial v4 · Finance et Inscriptions sont rendues par leur page Spatial (même porte que l'ancienne page).
  '/admin/finance', '/admin/signups']);
const sp = { searchParams: Promise.resolve({}) };
const PAGES: Record<string, Rendu> = {
  // Vague 2 · ces cinq écrans n'ont plus de page V5 · seul Spatial les sert
  // (déclarés exclusifs). Leur GARDE est lue ici sur la page Spatial ; ils ne
  // portent pas la barre d'onglets V5 (la sous-navigation Spatial la remplace).
  '/settings': async () => (await import('../app/(spatial)/sp/settings/page')).default(),
  '/team': async () => (await import('../app/(spatial)/sp/team/page')).default(),
  '/connections': async () => (await import('../app/(spatial)/sp/connections/page')).default(),
  '/usage': async () => (await import('../app/(spatial)/sp/usage/page')).default(),
  '/billing': async () => (await import('../app/(spatial)/sp/billing/page')).default(),
  '/profile': async () => (await import('../app/(app)/profile/page')).default(sp),
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
  '/credits': async () => (await import('../app/(app)/credits/page')).default(sp),
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
const SOUS_ENSEMBLE = new Set(['manager d’équipe (matrice)']);

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

/** Les onglets d'une barre rendue · `href` et `aria-current`. */
function onglets(html: string, zone: string): Array<{ href: string; courant: boolean; style: string }> {
  const nav = new RegExp(`<nav[^>]*data-zone="onglets-${zone}"[^>]*>([\\s\\S]*?)</nav>`).exec(html)?.[1];
  if (!nav) return [];
  return [...nav.matchAll(/<a\b([^>]*)>/g)].map((m) => ({
    href: /href="([^"]*)"/.exec(m[1]!)?.[1] ?? '',
    courant: /aria-current="page"/.test(m[1]!),
    style: /style="([^"]*)"/.exec(m[1]!)?.[1] ?? '',
  }));
}

const REGLAGES = ONGLETS_REGLAGES.map((e) => e.href);
const ADMINISTRATION = PAGES_ADMINISTRATION.filter((p) => !p.horsOnglets).map((p) => p.href);

beforeAll(async () => {
  const { db, schema } = await import('@tiktrends/db');
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Espace', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'client@exemple.invalid', name: 'Client' });
});
afterEach(() => { etat.session = null; });

describe('lot 4c · chaque page ne propose que des onglets qu’elle n’ouvrirait pas en vain', () => {
  for (const [nomRole, session] of Object.entries(ROLES)) {
    it(`${nomRole} · Réglages et Administration`, async () => {
      etat.session = session();
      const issues: Record<string, Issue> = {};
      for (const chemin of Object.keys(PAGES)) issues[chemin] = await rendre(chemin);

      for (const [famille, zone] of [[REGLAGES, 'reglages'], [ADMINISTRATION, 'administration']] as const) {
        const ouvertes = famille.filter((c) => issues[c]!.ouvre);
        for (const chemin of famille) {
          const r = issues[chemin]!;
          if (!r.ouvre || SPATIAUX.has(chemin)) continue;
          expect(r.html, `${chemin} · rendu impossible pour ${nomRole} : ${r.erreur}`).not.toBeNull();
          const o = onglets(r.html!, zone);
          if (ouvertes.length < 2) { expect(o, `${chemin} · barre d’un seul onglet`).toEqual([]); continue; }
          const proposes = o.map((x) => x.href);
          for (const href of proposes) expect(issues[href]?.ouvre, `${chemin} propose ${href}, que la page refuse à ${nomRole}`).toBe(true);
          if (!SOUS_ENSEMBLE.has(nomRole)) expect([...proposes].sort(), `${chemin} · onglets ouverts manquants pour ${nomRole}`).toEqual([...ouvertes].sort());
          else expect([...proposes].sort(), `${chemin} · matrice d’équipe`).toEqual(zone === 'reglages' ? ['/profile', '/settings', '/team'] : []);
          if (proposes.includes(chemin)) expect(o.filter((x) => x.courant).map((x) => x.href), `${chemin} · onglet courant`).toEqual([chemin]);
          else expect(o.some((x) => x.courant), `${chemin} · un onglet courant sans sa page`).toBe(false);
          for (const x of o) expect(x.style, `${x.href} · cible tactile`).toContain('min-height:44px');
        }
        // La barre seule, hors de toute page (ex. rendue par erreur ailleurs) ·
        // jamais une page fermée, quel que soit le rôle.
        const seule = renderToStaticMarkup(zone === 'reglages'
          ? <OngletsReglages session={etat.session as never} chemin={famille[0]!} />
          : <OngletsAdministration session={etat.session as never} chemin={famille[0]!} />);
        for (const href of onglets(seule, zone).map((x) => x.href)) expect(issues[href]?.ouvre, `barre seule · ${href} proposé à ${nomRole}, que la page refuse`).toBe(true);
        if (ouvertes.length < 2) expect(onglets(seule, zone), `barre seule · ${nomRole}`).toEqual([]);
        // Une page fermée à ce rôle n'apparaît dans AUCUNE barre de la famille.
        const fermees = famille.filter((c) => !issues[c]!.ouvre);
        for (const chemin of ouvertes.filter((c) => !SPATIAUX.has(c))) {
          const proposes = onglets(issues[chemin]!.html ?? '', zone).map((x) => x.href);
          for (const f of fermees) expect(proposes, `${chemin} propose ${f} à ${nomRole}`).not.toContain(f);
        }
      }
    });
  }

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
  it('chaque page d’Administration existe (page V5 ou écran Spatial) · aucun lien mort', () => {
    for (const p of PAGES_ADMINISTRATION) {
      const segs = p.href.split('/').filter(Boolean);
      const existe = existsSync(join(process.cwd(), 'app', '(app)', ...segs, 'page.tsx')) || existsSync(join(process.cwd(), 'app', '(spatial)', 'sp', ...segs, 'page.tsx'));
      expect(existe, `${p.href} · page absente`).toBe(true);
    }
  });

  it('fondateur sans compte admissible (SEC-10) · ni le registre ni les interrupteurs proposés', async () => {
    etat.session = base({ role: 'owner', user: { id: ids.user, email: 'kguilbaux@agence-glx.fr', name: 'K' }, equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: false } });
    // La barre V5 d'Administration · lue sur `/credits`, dernière page V5 qui la porte (Finance est exclusive Spatial).
    const { html } = await rendre('/credits');
    const o = onglets(html!, 'administration').map((x) => x.href);
    expect(o).toContain('/admin/connaissances');
    expect(o).not.toContain('/admin/ia-studios');
    expect(o).not.toContain('/admin/studios-interrupteurs');
    expect((await rendre('/admin/ia-studios')).ouvre, 'la page refuse bien ce compte').toBe(false);
    expect((await rendre('/admin/studios-interrupteurs')).ouvre, 'la page refuse bien ce compte').toBe(false);
  });
});

describe('lot 4c · chaque page porte SA barre, sur SON chemin', () => {
  it('toute sous-page de `/admin` présente sur le disque a son onglet (aucune oubliée)', () => {
    const dossier = join(process.cwd(), 'app', '(app)', 'admin');
    const surDisque = !existsSync(dossier) ? [] : readdirSync(dossier, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(dossier, d.name, 'page.tsx')))
      .map((d) => `/admin/${d.name}`);
    // Une page V5 d'Administration ne reste sur le disque que pour un écran Spatial NON exclusif (vague 2 Spatial v4 · dérivé de la déclaration).
    expect(surDisque.sort()).toEqual(ECRANS_SPATIAUX.filter((e) => !e.exclusif && e.chemin.startsWith('/admin/')).map((e) => e.chemin).sort());
    for (const c of surDisque) expect(ADMINISTRATION, `${c} · page d’Administration sans onglet`).toContain(c);
    for (const c of surDisque) expect(Object.keys(PAGES), `${c} · non rendue par ce test`).toContain(c);
  });

  it('la source de chaque page rend le composant partagé avec son propre chemin', () => {
    for (const chemin of Object.keys(PAGES).filter((c) => !SPATIAUX.has(c))) {
      const src = readFileSync(join(process.cwd(), 'app', '(app)', ...chemin.split('/').filter(Boolean), 'page.tsx'), 'utf8');
      const comp = REGLAGES.includes(chemin) ? 'OngletsReglages' : 'OngletsAdministration';
      expect(src, `${chemin} · <${comp} chemin="${chemin}"> absent`).toMatch(new RegExp(`<${comp} session=\\{[\\w.]+\\} chemin="${chemin.replace(/\//g, '\\/')}" />`));
    }
  });
});
