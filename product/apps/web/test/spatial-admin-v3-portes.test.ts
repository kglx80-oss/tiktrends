import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Spatial · vague 3 · Admin · les PORTES des écrans portés. Chaque page repose
 * la garde de son écran V5 AVANT toute lecture · on vérifie la redirection
 * ET qu'aucune lecture n'a eu lieu (les lecteurs sont des espions).
 */
const h = vi.hoisted(() => ({
  session: null as unknown,
  fondateur: false,
  garde: { ok: false, code: 'FORBIDDEN', message: 'non', traceId: 't' } as unknown,
  lectures: [] as string[],
  lu: (nom: string) => async () => { h.lectures.push(nom); throw new Error('lecture interdite avant la porte'); },
}));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }) }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/founder', () => ({ isFounder: () => h.fondateur }));
vi.mock('../lib/studios/prompts/garde-prompts', () => ({ gardePlateforme: async () => h.garde }));
vi.mock('../lib/studios/prompts/vues-registre', () => ({
  vueVersions: h.lu('versions'), vueReleases: h.lu('releases'), vueEvaluations: h.lu('evaluations'), vueBenchmark: h.lu('benchmark'),
  vueRoutage: h.lu('routage'), vueExecutions: h.lu('executions'), vueConnaissances: h.lu('connaissances'),
}));
vi.mock('../lib/studios/interrupteurs', () => ({ vueInterrupteurs: h.lu('interrupteurs') }));
vi.mock('../lib/studios/budget-essai', () => ({ vueBudgetEssai: h.lu('budget') }));
vi.mock('../app/actions/connaissances', () => ({ chargerConnaissancesAction: h.lu('connaissances-action') }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: h.lu('spend'), spendByAction: h.lu('spend'), depensesAReconcilier: h.lu('spend'), depensesReconciliees: h.lu('spend') }));
vi.mock('../lib/deployment', () => ({ currentDeployment: h.lu('deploiement') }));
vi.mock('../lib/platform-metrics', () => ({ computePlatformMetrics: h.lu('metriques') }));
vi.mock('../lib/settings', () => ({ getPlanConfig: h.lu('tarifs') }));

import RegistrePage from '../app/(spatial)/sp/admin/prompts/registre/page';
import InterrupteursPage from '../app/(spatial)/sp/admin/studios-interrupteurs/page';
import ConnaissancesPage from '../app/(spatial)/sp/admin/connaissances/page';
import ConsolePage from '../app/(spatial)/sp/console/page';
import IncidentsPage from '../app/(spatial)/sp/admin/incidents/page';
import IntelligencePage from '../app/(spatial)/sp/admin/intelligence/page';
import CoutsPage from '../app/(spatial)/sp/admin/depenses/page';

const session = (o: { role?: string; equipe?: string | null } = {}) => ({ user: { id: 'u', email: 'x@y.fr' }, role: o.role ?? 'owner', workspaceId: 'w', workspaceName: 'W', plan: 'core', equipe: o.equipe ? { role: o.equipe } : null });
const porte = async (p: Promise<unknown>) => { try { await p; return 'aucune redirection'; } catch (e) { return (e as Error).message; } };

beforeEach(() => { h.session = null; h.fondateur = false; h.garde = { ok: false, code: 'FORBIDDEN', message: 'non', traceId: 't' }; h.lectures = []; });

describe('Spatial · Admin · vague 3 · portes des écrans portés', () => {
  it('Registre IA et Interrupteurs · la garde plateforme refuse (accès refusé → tableau de bord, sans session → connexion), avant toute lecture', async () => {
    expect(await porte(RegistrePage({ searchParams: Promise.resolve({ onglet: 'releases' }) }))).toBe('REDIRECT /dashboard');
    expect(await porte(InterrupteursPage({ searchParams: Promise.resolve({ espace: 'w' }) }))).toBe('REDIRECT /dashboard');
    h.garde = { ok: false, code: 'AUTH_REQUIRED', message: 'non', traceId: 't' };
    expect(await porte(RegistrePage({}))).toBe('REDIRECT /login');
    expect(await porte(InterrupteursPage({}))).toBe('REDIRECT /login');
    expect(h.lectures).toEqual([]);
  });

  it('Connaissances · un propriétaire d’espace sans rôle d’équipe à accès total est renvoyé, sans lecture', async () => {
    h.session = session({ role: 'owner' });
    expect(await porte(ConnaissancesPage())).toBe('REDIRECT /dashboard');
    h.session = session({ role: 'owner', equipe: 'membre' });
    expect(await porte(ConnaissancesPage())).toBe('REDIRECT /dashboard');
    h.session = null;
    expect(await porte(ConnaissancesPage())).toBe('REDIRECT /login');
    expect(h.lectures).toEqual([]);
  });

  it('Console, Incidents, Intelligence, Coûts · admin d’espace ET fondateur · un admin d’espace seul est renvoyé, sans lecture', async () => {
    h.session = session({ role: 'admin' });
    for (const p of [ConsolePage({}), IncidentsPage({}), IntelligencePage(), CoutsPage({})]) expect(await porte(p)).toBe('REDIRECT /dashboard');
    h.session = session({ role: 'member' }); h.fondateur = true;
    expect(await porte(ConsolePage({}))).toBe('REDIRECT /dashboard');
    expect(h.lectures).toEqual([]);
  });
});
