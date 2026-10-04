import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette #106b · Studio Textes · l'astuce promettait « depuis la Veille, le
 * bouton « Générer » pré-remplit l'inspiration avec une créa gagnante ». Mesuré
 * au navigateur · la carte de la Veille propose « Décline cette piste », qui
 * mène à Pubs IA (`studioDepuisVeille` → /studio/ads) ; rien ne pré-remplit
 * Textes IA. Et une pub concurrente dont on ignore les résultats n'est pas
 * « gagnante » · c'est une piste.
 *
 * On REND le studio et la page et on lit le texte affiché.
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('../app/actions/studio', () => ({ generateAction: async () => ({}) }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: 'owner', plan: 'business', user: { id: 'u', email: 'client@exemple.invalid' } }) }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => true }));
vi.mock('@tiktrends/db', async (orig) => ({ ...(await orig<typeof import('@tiktrends/db')>()), db: null }));

import { StudioClient } from '../app/(app)/studio/textes/StudioClient';
import TextesPage from '../app/(app)/studio/textes/page';

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '’').replace(/&nbsp;| /g, ' ').replace(/\s+/g, ' ');

describe('Studio Textes · l’astuce décrit le parcours qui existe', () => {
  it.each([
    ['le studio', () => renderToStaticMarkup(<StudioClient hasKey />)],
    ['la page', async () => renderToStaticMarkup(await TextesPage({ searchParams: Promise.resolve({}) }))],
  ])('%s · plus de bouton « Générer » qui pré-remplirait, plus de « gagnante »', async (_n, rendre) => {
    const t = texte(await rendre());
    expect(t, 'la promesse d’un pré-remplissage depuis la Veille subsiste').not.toMatch(/Générer\s*»?\s*pré-remplit/);
    expect(t, 'une pub concurrente est encore dite « gagnante »').not.toMatch(/gagnante/i);
    expect(t, 'le geste réel (coller le texte d’une annonce repérée) n’est pas dit').toMatch(/colle dans « ?Inspiration ?» le texte d’une annonce repérée/);
    expect(t).toMatch(/piste/);
  });
});
