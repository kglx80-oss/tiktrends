import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { jargonEcran, texteVisible } from './helpers/jargon-ecran';

/**
 * Recette #106b · Réglages · panneau Stockage · on REND la page et on lit le
 * HTML · un administrateur d'espace (client) ne lit plus « clés S3 »,
 * « .env.deploy », « CORS », « bucket » ; l'équipe de la plateforme garde ses
 * consignes. États et fonctions inchangés.
 */
let fondateur = false;
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace démo', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid' } }) }));
vi.mock('../lib/founder', () => ({ isFounder: () => fondateur }));
vi.mock('../app/actions/admin', () => ({ updateWorkspaceAction: async () => {} }));
vi.mock('../app/actions/storage', () => ({ configureBucketAction: async () => ({}), testStorageAction: async () => ({}), embeddedImagesStatusAction: async () => ({}), migrateEmbeddedImagesAction: async () => ({}) }));

import SettingsPage from '../app/(app)/settings/page';

const panneau = async () => {
  const html = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }));
  const t = texteVisible(html);
  const i = t.search(/Stockage (objet|des fichiers lourds) (CLÉS|ACTIVÉ|À ACTIVER)/);
  return t.slice(i, i + 700);
};
beforeEach(() => { for (const k of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT']) delete process.env[k]; });

describe('Réglages · panneau Stockage', () => {
  it('administrateur d’espace (client) · aucun terme d’infrastructure, qui agit est dit', async () => {
    fondateur = false;
    const t = await panneau();
    expect(t, 'le panneau client n’est pas rendu').toMatch(/^Stockage des fichiers lourds À ACTIVER/);
    expect(jargonEcran(t), `jargon à l’écran : ${t}`).toEqual([]);
    expect(t).toMatch(/côté plateforme/);
    expect(t, 'promet une équipe que le support ne joint pas').not.toMatch(/notre équipe/);
  });
  it('équipe de la plateforme · garde ses consignes techniques', async () => {
    fondateur = true;
    const t = await panneau();
    expect(t).toMatch(/^Stockage objet CLÉS ABSENTES/);
    expect(t).toContain('.env.deploy');
  });
});
