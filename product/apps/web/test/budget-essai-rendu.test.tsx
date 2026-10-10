// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Budget d'essai de l'espace pilote · au HTML RENDU de la vraie page ADMIN
 * (pglite) et par la vraie action : la plateforme le pose (motif, audit),
 * l'écran lit engagé et restant depuis `ai_spend`, un owner d'espace est
 * refusé sans rien écrire, une saisie hors bornes est refusée.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null, listBrands: async () => [] }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq, cleBudgetEssai } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import InterrupteursPage from '../app/(app)/admin/studios-interrupteurs/page';
import { enregistrerBudgetEssaiAction } from '../app/actions/studios/interrupteurs';

const ids = h.ids;
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const plateforme = () => session(ids, 'ua', { role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] });
const reglage = async () => (await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleBudgetEssai(ids.wsA))))[0]?.value ?? null;

beforeAll(async () => { await semer(db, schema, ids); });

describe('budget d’essai · posé par la plateforme, lu à l’écran', () => {
  it('un owner d’espace est refusé, rien n’est écrit', async () => {
    h.session = session(ids, 'ua', { role: 'owner' });
    const r = await enregistrerBudgetEssaiAction({ workspaceId: ids.wsA, plafondUsd: '15', motif: 'essai', confirme: true });
    expect(r.ok).toBe(false);
    expect(await reglage()).toBeNull();
  });

  it('hors bornes ou sans motif · refus nommé, rien n’est écrit', async () => {
    h.session = plateforme();
    const trop = await enregistrerBudgetEssaiAction({ workspaceId: ids.wsA, plafondUsd: '80', motif: 'essai', confirme: true });
    expect(trop.ok ? [] : trop.raisons).toEqual(['plafond entre 0 et 50 $']);
    const sans = await enregistrerBudgetEssaiAction({ workspaceId: ids.wsA, plafondUsd: '15', motif: ' ', confirme: true });
    expect(sans.ok).toBe(false);
    expect(await reglage()).toBeNull();
  });

  it('posé à 15 $ · audit, puis l’écran dit engagé et restant à partir des dépenses de l’espace', async () => {
    h.session = plateforme();
    const r = await enregistrerBudgetEssaiAction({ workspaceId: ids.wsA, plafondUsd: '15', motif: 'Recette manuelle Studios', confirme: true });
    expect(r.ok).toBe(true);
    const au = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'studios.budget_essai'));
    expect(au).toHaveLength(1);
    expect(au[0]).toMatchObject({ workspaceId: ids.wsA, reason: 'Recette manuelle Studios' });
    await db.insert(schema.aiSpend).values({ workspaceId: ids.wsA, provider: 'fal', model: 'x', action: 'essai', estimatedUsd: 2.5, actualUsd: 2.5 });
    await db.insert(schema.aiSpend).values({ workspaceId: ids.wsB, provider: 'fal', model: 'x', action: 'autre', estimatedUsd: 9, actualUsd: 9 });
    const d = dom(renderToStaticMarkup(await InterrupteursPage({ searchParams: Promise.resolve({ espace: ids.wsA }) })));
    const b = d.querySelector('[data-budget-essai="pose"]');
    expect(b, 'bloc budget absent').not.toBeNull();
    expect(b!.querySelector('[data-budget-restant]')?.getAttribute('data-budget-restant')).toBe('12.50');
    expect(b!.textContent).toContain('2,50 $ engagés sur 15,00 $');
    expect(b!.textContent).toContain('reste 12,50 $');
    expect(d.querySelector('[data-formulaire="budget-essai"]')).not.toBeNull();
  });
});
