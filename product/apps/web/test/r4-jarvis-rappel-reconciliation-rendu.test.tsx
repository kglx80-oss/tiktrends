import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * R4 · /jarvis/sources · c'est là que le propriétaire lit sa dépense. Quand des
 * lignes attendent la facture, un rappel s'affiche sous le compteur, avec un
 * lien vers la section de /admin/depenses. On REND la vraie page et on lit le
 * HTML : rappel présent quand il y a des lignes, absent sinon, jamais montré à
 * qui n'est pas fondateur, et une lecture qui échoue ne casse pas la page.
 */
const etat = vi.hoisted(() => ({ fondateur: true, vue: null as unknown, panne: false, lectures: 0 }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'fondateur@exemple.invalid', name: 'K' } }) }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => true }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/founder', () => ({ isFounder: () => etat.fondateur }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Neva' }) }));
vi.mock('../lib/jarvis-memory', () => ({ jarvisMeasuredMemory: async () => '', jarvisStats: async () => null }));
vi.mock('../lib/jarvis-state', () => ({ STATE_LABEL: {}, jarvisSnapshot: async () => ({ layers: [], liveCount: 0, dataCount: 0, summary: '' }) }));
vi.mock('../lib/spend-guard', () => ({
  spendStatus: async () => ({ blocked: false, summary: 'Plafond synthétique.' }),
  depensesAReconcilier: async () => { etat.lectures++; if (etat.panne) throw new Error('base indisponible'); return etat.vue; },
}));
vi.mock('../lib/deployment', () => ({ currentDeployment: async () => null }));
vi.mock('../app/(app)/jarvis/JarvisRules', () => ({ JarvisRules: () => null }));
vi.mock('../app/(app)/jarvis/JarvisTraining', () => ({ JarvisTraining: () => null }));
vi.mock('../app/(app)/jarvis/DescribePanel', () => ({ DescribePanel: () => null }));

import { vueReconciliation } from '@tiktrends/core';
import JarvisSourcesPage from '../app/(app)/jarvis/sources/page';

const ligne = (n: number, usd: number) => ({ id: `l${n}`, createdAt: new Date(Date.UTC(2026, 9, 8, 12, n)), provider: 'anthropic', model: 'm', action: `a${n}`, workspaceId: null, estimatedUsd: usd, actualUsd: usd, cause: 'coupure' });
const rappel = (html: string) => /<p data-rappel-reconciliation[\s\S]*?<\/p>/.exec(html)?.[0] ?? '';
const texte = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

beforeEach(() => { etat.fondateur = true; etat.panne = false; etat.lectures = 0; etat.vue = vueReconciliation([]); });

describe('R4 · rappel « à réconcilier » sur /jarvis/sources', () => {
  it('lignes en attente · rappel chiffré et lien vers la section des dépenses', async () => {
    etat.vue = vueReconciliation([ligne(1, 0.1), ligne(2, 2.5)]);
    const r = rappel(renderToStaticMarkup(await JarvisSourcesPage()));
    expect(r, 'le rappel n’est pas rendu').not.toBe('');
    expect(texte(r)).toBe('À réconcilier · 2 dépenses à réconcilier avec la facture · 2,60 $ comptés au maximum en attendant. Rapprocher ›');
    expect(r).toContain('href="/admin/depenses#a-reconcilier"');
    expect(r).toMatch(/min-height:(4[4-9]|[5-9]\d)px/);
  });

  it('rien en attente · aucun rappel (le silence)', async () => {
    expect(rappel(renderToStaticMarkup(await JarvisSourcesPage()))).toBe('');
  });

  it('non fondateur · ni rappel ni lecture', async () => {
    etat.fondateur = false;
    etat.vue = vueReconciliation([ligne(1, 0.1)]);
    const html = renderToStaticMarkup(await JarvisSourcesPage());
    expect(rappel(html), 'rappel de dépense montré à un non-fondateur').toBe('');
    expect(etat.lectures, 'dépenses lues pour un non-fondateur').toBe(0);
  });

  it('lecture en panne · la page tient, le compteur reste, pas de rappel', async () => {
    etat.panne = true;
    const html = renderToStaticMarkup(await JarvisSourcesPage());
    expect(html).toContain('Plafond synthétique.');
    expect(rappel(html)).toBe('');
  });
});
