import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { jargonTechnique } from '@tiktrends/core';

/**
 * Recette #106 · Réglages affichait à l'écran les noms de variables
 * d'environnement (dont celle du fournisseur interne, en clair) et les noms des
 * fournisseurs. On REND la page (session simulée, aucune base, aucun réseau) et
 * on lit le HTML du panneau « Services activés » · les capacités sont nommées,
 * les états BRANCHÉ / À BRANCHER restent, aucune variable n'atteint l'écran.
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace démo', role: 'owner', plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../app/actions/admin', () => ({ updateWorkspaceAction: async () => {} }));
vi.mock('../components/StorageConfigurator', () => ({ StorageConfigurator: () => null }));
vi.mock('@tiktrends/integrations', () => ({ storageConfigured: () => false }));

import SettingsPage from '../app/(app)/settings/page';

async function panneauServices(env: Record<string, string>) {
  const avant = { ...process.env };
  Object.assign(process.env, env);
  try {
    const html = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));
    const debut = html.indexOf('Services activés');
    expect(debut, 'le panneau « Services activés » est absent').toBeGreaterThan(-1);
    const fin = html.indexOf('<h2', debut);
    return html.slice(debut, fin === -1 ? undefined : fin);
  } finally {
    process.env = avant;
  }
}

const VARIABLES = ['ANTHROPIC_API_KEY', 'TRENDTRACK_API_KEY', 'FAL_KEY', 'S3_BUCKET', 'HIGGSFIELD_API_KEY', 'SMTP_URL', 'KLAVIYO_API_KEY', 'STRIPE_SECRET_KEY', 'SLACK_BOT_TOKEN'];

describe('Réglages · services activés · copie client', () => {
  it('aucun nom de variable d’environnement à l’écran', async () => {
    const html = await panneauServices({});
    for (const v of VARIABLES) expect(html, `« ${v} » est affiché`).not.toContain(v);
    expect(jargonTechnique(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });

  it('le fournisseur interne n’apparaît jamais, sous aucune casse', async () => {
    expect(await panneauServices({})).not.toMatch(/trendtrack/i);
  });

  it('l’état branché suit toujours la configuration · 9 services, un seul BRANCHÉ', async () => {
    const vides = Object.fromEntries(VARIABLES.map((v) => [v, '']));
    const html = await panneauServices({ ...vides, FAL_KEY: 'factice' });
    expect(html.match(/>BRANCHÉ</g)?.length, 'BRANCHÉ').toBe(1);
    expect(html.match(/>À BRANCHER</g)?.length, 'À BRANCHER').toBe(8);
  });
});
