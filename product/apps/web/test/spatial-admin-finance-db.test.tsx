import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzePlanNet, corporateTaxRate, creditMarkup, eurosFinance } from '@tiktrends/core';

/**
 * Spatial · « Revenus & MRR » (`/admin/finance`, exclusif) · les indicateurs de
 * l'ancienne page Finance, portés TELS QU'ELLE LES CALCULAIT, au RÉSULTAT.
 *
 * On rend la VRAIE page serveur Spatial sur pglite : un espace Core abonné
 * (Stripe actif), un espace Plus SANS abonnement Stripe, un Starter. L'ancienne
 * page comptait la formule de chaque espace · son MRR vaut 99 + 299 €, son
 * bénéfice net déduit coût API, frais et IS. Le MRR de tête Spatial (abonnements
 * Stripe actifs) reste 99 € · les deux s'affichent, la base de chacun est dite.
 */
const etat = vi.hoisted(() => ({ session: null as unknown }));
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { core: randomUUID(), plus: randomUUID(), starter: randomUUID() };
});

vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect:${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => '/admin/finance',
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

const session = (email: string, role = 'owner') => ({ user: { id: ids.core, email, name: 'K' }, workspaceId: ids.core, workspaceName: 'Espace', plan: 'business', role, equipe: null });

beforeAll(async () => {
  const { db, schema } = await import('@tiktrends/db');
  await db!.insert(schema.workspaces).values([
    { id: ids.core, name: 'Core abonné', plan: 'core', stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' },
    { id: ids.plus, name: 'Plus sans Stripe', plan: 'plus' },
    { id: ids.starter, name: 'Starter', plan: 'starter' },
  ]);
});
afterEach(() => { etat.session = null; });

const rendre = async () => renderToStaticMarkup((await (await import('../app/(spatial)/sp/admin/finance/page')).default()) as React.ReactElement);
const texte = (h: string) => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');
const bloc = (html: string, attr: string) => texte(new RegExp(`<[^>]*${attr}[^>]*>([\\s\\S]*?)</(?:section|div)>`).exec(html)?.[1] ?? '');
const kpi = (sec: string, lbl: string) => new RegExp(`\\|${lbl}\\|([^|]+)\\|`).exec(sec)?.[1];

describe('Spatial · Revenus & MRR · indicateurs de l’ancienne page Finance', () => {
  it('MRR, ARR, bénéfice net après IS et clients payants · calculés comme l’ancienne page, chiffre par chiffre', async () => {
    etat.session = session('kguilbaux@agence-glx.fr');
    const html = await rendre();
    const sec = texte(/<section[^>]*data-section="finance-formules"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '');
    const net = analyzePlanNet('Core', 99, 2000, creditMarkup(), corporateTaxRate()).netEur + analyzePlanNet('Plus', 299, 7000, creditMarkup(), corporateTaxRate()).netEur;
    expect(kpi(sec, 'MRR')).toBe(eurosFinance(398));
    expect(kpi(sec, 'ARR')).toBe(eurosFinance(398 * 12));
    expect(kpi(sec, 'Bénéfice net / mois')).toBe(eurosFinance(net));
    expect(kpi(sec, 'Clients payants')).toBe('2');
    expect(sec).toContain(`ARPA ${eurosFinance(199)}`);
    expect(sec).toContain('la définition du MRR reste à décider');
    // Par formule · une ligne par formule payante, ses clients et son net.
    expect(bloc(html, 'data-formule="plus"')).toContain('|Plus|299 €|1|299 €|');
    expect(bloc(html, 'data-formule="business"')).toContain(`|Business|990 €|0|${eurosFinance(0)}|`);
    // Le MRR de tête Spatial (abonnements Stripe actifs) n'est pas réécrit.
    expect(texte(/<section class="tile rvhero"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '')).toContain('|99 €|');
  });

  it('la reco de marge · sur-allocation et conseil seulement là où l’allocation dépasse la cible de plus de 10 %', async () => {
    etat.session = session('kguilbaux@agence-glx.fr');
    const html = await rendre();
    const recoSec = /<section[^>]*data-section="finance-reco"[^>]*>([\s\S]*?)<\/section>/.exec(html)?.[1] ?? '';
    expect(texte(recoSec)).toContain('Cible : |65 % de marge brute|');
    // Une carte par formule · le texte entre son attribut et la carte suivante.
    const carte = (plan: string) => texte(recoSec.split('data-reco="').find((c) => c.startsWith(`${plan}"`)) ?? '');
    expect(carte('core')).not.toContain('Sur-alloué');
    expect(carte('core')).toContain('|Crédits pour 65 % de marge|2');
    expect(carte('plus')).toContain('Sur-alloué');
    expect(carte('plus')).toContain('pour sécuriser la marge.');
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
