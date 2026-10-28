import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Spatial · « Inscriptions & comptes » (`/admin/signups`, exclusif) · les
 * déclarations d'onboarding portées de l'ancienne page, au RÉSULTAT.
 *
 * On rend la VRAIE page serveur Spatial sur une base pglite : deux espaces, l'un
 * onboardé avec un profil complet, l'autre avec une ancienne réponse « niveau
 * IA » et un onboarding en cours. Le HTML doit dire, ligne par ligne, ce que
 * disait l'ancienne table (propriétaire, profil, expérience pub, objectifs,
 * site, plan, inscrit, onboardé). La porte est la même : un admin d'espace qui
 * n'est pas fondateur est renvoyé avant toute lecture.
 */
const etat = vi.hoisted(() => ({ session: null as unknown }));
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws1: randomUUID(), ws2: randomUUID(), u1: randomUUID(), u2: randomUUID() };
});

vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => '/admin/signups',
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

const session = (email: string, role = 'owner') => ({ user: { id: ids.u1, email, name: 'K' }, workspaceId: ids.ws1, workspaceName: 'Espace', plan: 'business', role, equipe: null });

beforeAll(async () => {
  const { db, schema } = await import('@tiktrends/db');
  await db!.insert(schema.workspaces).values([
    { id: ids.ws1, name: 'Maison Lumen', plan: 'plus', createdAt: new Date(2026, 8, 2), onboardedAt: new Date(2026, 8, 3),
      onboarding: { profile: 'agency', adLevel: 'teste', goals: ['ads', 'multi'], siteUrl: 'lumen.example' } },
    { id: ids.ws2, name: 'Atelier Brume', plan: 'starter', createdAt: new Date(2026, 9, 20), onboarding: { aiLevel: 'comfortable' } },
  ]);
  await db!.insert(schema.users).values([{ id: ids.u1, email: 'proprio@lumen.example', name: 'P' }, { id: ids.u2, email: 'brume@brume.example', name: 'B' }]);
  await db!.insert(schema.workspaceMembers).values([{ workspaceId: ids.ws1, userId: ids.u1, role: 'owner' }, { workspaceId: ids.ws2, userId: ids.u2, role: 'owner' }]);
});
afterEach(() => { etat.session = null; });

const rendre = async () => renderToStaticMarkup((await (await import('../app/(spatial)/sp/admin/signups/page')).default()) as React.ReactElement);
/** La ligne d'un espace dans la section des déclarations. */
const ligne = (html: string, id: string) => {
  const sec = /<section[^>]*data-section="declarations"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
  return new RegExp(`<div class="atr"[^>]*data-espace="${id}"[^>]*>([\\s\\S]*?)</div>`).exec(sec)?.[1]?.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|') ?? '';
};

describe('Spatial · Inscriptions · déclarations d’onboarding (portées de /admin/signups)', () => {
  it('chaque espace récent dit son propriétaire, son profil, son expérience, ses objectifs, son site et son onboarding', async () => {
    etat.session = session('kguilbaux@agence-glx.fr');
    const html = await rendre();
    expect(html).toContain('Profil déclaré à l’onboarding');
    expect(html).toContain('2 espaces');
    const l1 = ligne(html, ids.ws1);
    for (const v of ['Maison Lumen', 'proprio@lumen.example', 'Agence', 'Teste', 'Pubs', 'Multi-marques', 'lumen.example', 'Plus']) expect(l1, `ligne Lumen · ${v}`).toContain(`|${v}|`);
    expect(html).toContain('href="https://lumen.example"');
    expect(l1).not.toContain('en cours');
    const l2 = ligne(html, ids.ws2);
    for (const v of ['Atelier Brume', 'brume@brume.example', 'À l’aise · IA hérité', 'Starter', 'en cours']) expect(l2, `ligne Brume · ${v}`).toContain(`|${v}|`);
    // Les plus récents d'abord · l'ordre de l'ancienne page.
    expect(html.indexOf(`data-espace="${ids.ws2}"`)).toBeLessThan(html.indexOf(`data-espace="${ids.ws1}"`));
  });

  it('la porte de l’ancienne page · un admin d’espace qui n’est pas fondateur est renvoyé avant toute lecture', async () => {
    etat.session = session('client@exemple.invalid');
    await expect(rendre()).rejects.toThrow('redirect:/dashboard');
    etat.session = session('kguilbaux@agence-glx.fr', 'member');
    await expect(rendre()).rejects.toThrow('redirect:/dashboard');
    etat.session = null;
    await expect(rendre()).rejects.toThrow('redirect:/login');
  });
});
