import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { journey } from '@tiktrends/core';

/**
 * SEC-03 · l'accueil n'affiche pas l'assistant à qui le serveur le refuse.
 *
 * `askAssistant` refuse désormais un `client_viewer` (`refusAssistant`). Le
 * composant restait affiché : un champ qui ne répond qu'un refus. On REND la
 * vraie page d'accueil (session simulée, ni base ni réseau) et on lit le HTML.
 */
const etat: { role: 'owner' | 'admin' | 'member' | 'client_viewer'; plan: string } = { role: 'client_viewer', plan: 'business' };
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: etat.role, plan: etat.plan, user: { id: 'u', email: 'client@exemple.invalid', name: 'Camille' } }) }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Neva' }), listBrands: async () => [{ id: 'b1', name: 'Neva' }] }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => false }));
vi.mock('../lib/founder', () => ({ isFounder: () => false }));
vi.mock('../lib/ai-status', () => ({ anthropicConfigured: () => true }));
vi.mock('../lib/onboarding-state', () => ({ onboardingState: async () => ({ journey: journey(new Set(['brand']), { canAdmin: false }), relance: null }) }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

import Dashboard from '../app/(app)/dashboard/page';

async function accueil(role: typeof etat.role, plan = 'business') {
  etat.role = role; etat.plan = plan;
  return renderToStaticMarkup(await Dashboard({ searchParams: Promise.resolve({}) }));
}

describe('SEC-03 · assistant de l’accueil selon la règle du serveur', () => {
  it('client en lecture · ni titre ni champ de l’assistant', async () => {
    const html = await accueil('client_viewer');
    expect(html, 'l’assistant est proposé à un rôle que le serveur refuse').not.toContain('Demande à l’assistant');
    expect(html).not.toContain('Pose ta question');
  });
  it.each([['member', 'business'], ['owner', 'business'], ['member', 'starter']] as const)('%s (%s) · l’assistant reste proposé', async (role, plan) => {
    const html = await accueil(role, plan);
    expect(html).toContain('Demande à l’assistant');
    expect(html).toContain('Pose ta question');
  });
});
