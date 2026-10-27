import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ENTETE_CHEMIN } from '@tiktrends/core';

/**
 * Spatial · le parcours d'accueil sous le layout Spatial. La coquille renvoie
 * un propriétaire non accueilli vers `/onboarding` · or `/onboarding` est servi
 * sous CE layout. Sans le chemin public, la page se renverrait à elle-même.
 * Le middleware le transmet (`x-tt-chemin`), la coquille l'épargne · on
 * appelle le VRAI middleware et le VRAI chargeur de la coquille.
 */

const h = vi.hoisted(() => ({ chemin: null as string | null }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: (k: string) => (k === 'x-tt-chemin' ? h.chemin : null) }),
}));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
// Un propriétaire dont l'espace n'est PAS accueilli (`onboardedAt` nul).
const lignes = async () => [{ c: 300, ob: null, n: 'Kevin' }];
vi.mock('@tiktrends/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: lignes }) }) }) },
  schema: { workspaces: { creditsBalance: 'c', onboardedAt: 'ob', id: 'id' }, users: { name: 'n', id: 'id' } },
}));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ user: { id: 'u', email: 'k@x.fr', name: 'Kevin' }, workspaceId: 'w', workspaceName: 'GLX', role: 'owner', plan: 'starter' }) }));
vi.mock('../lib/brands', () => ({ listBrands: async () => [], getActiveBrand: async () => null }));
vi.mock('../lib/notifications', () => ({ unreadCount: async () => 0 }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => false }));
vi.mock('../app/actions/auth', () => ({ logoutAction: async () => {} }));

import { middleware } from '../middleware';
import { chargerCoquille, poserPastilles } from '../lib/spatial/coquille';
import { entreesRail } from '@tiktrends/core';

const HOTE = 'https://app.tiktrends.test';

describe('Spatial · parcours d’accueil · pas de boucle de redirection', () => {
  it('le middleware transmet le chemin PUBLIC de l’écran réécrit', () => {
    const r = middleware(new NextRequest(`${HOTE}/onboarding`, { headers: { cookie: 'tt_ui=spatial' } }));
    expect(r.headers.get('x-middleware-rewrite')).toBe(`${HOTE}/sp/onboarding`);
    expect(r.headers.get(`x-middleware-request-${ENTETE_CHEMIN}`)).toBe('/onboarding');
    expect(r.headers.get('x-middleware-request-x-tt-section')).toBe('accueil');
  });

  it('un propriétaire non accueilli est renvoyé au parcours depuis un autre écran', async () => {
    h.chemin = '/usage';
    await expect(chargerCoquille()).rejects.toThrow('REDIRECT /onboarding');
    h.chemin = null; // requête non réécrite · même règle
    await expect(chargerCoquille()).rejects.toThrow('REDIRECT /onboarding');
  });

  it('… mais pas depuis le parcours lui-même · la coquille se charge', async () => {
    h.chemin = '/onboarding';
    const d = await chargerCoquille();
    expect(d.utilisateur.email).toBe('k@x.fr');
    expect(d.demarrage).toBe('/onboarding?redo=1');
  });
});

describe('Spatial · pastilles du rail · point d’entrée', () => {
  const marque = { id: 'b1', nom: 'Neva' };
  const pastille = { classe: 'badge' as const, valeur: '', libelle: 'Un lot à conclure' };
  const sources = { resultats: { destination: '/adsmap', source: vi.fn(async () => pastille) } };

  it('la source n’est appelée que si la destination est ouverte, et pose la pastille sur SON entrée', async () => {
    const ouverts = new Set(['/adsmap', '/jarvis']);
    const l = await poserPastilles(entreesRail({ ouverts, marque }), { ouverts, workspaceId: 'w', brandId: 'b1' }, sources);
    expect(sources.resultats.source).toHaveBeenCalledWith('w', 'b1');
    expect(l.find((e) => e.cle === 'resultats')?.pastille).toEqual(pastille);
    expect(l.filter((e) => e.pastille)).toHaveLength(1);
  });

  it('sans droit Résultats ou sans marque, aucune lecture', async () => {
    sources.resultats.source.mockClear();
    const ferme = new Set(['/jarvis']);
    await poserPastilles(entreesRail({ ouverts: ferme, marque }), { ouverts: ferme, workspaceId: 'w', brandId: 'b1' }, sources);
    const ouverts = new Set(['/adsmap']);
    await poserPastilles(entreesRail({ ouverts, marque: null }), { ouverts, workspaceId: 'w', brandId: null }, sources);
    expect(sources.resultats.source).not.toHaveBeenCalled();
  });

  it('une source qui échoue ne fait pas tomber la coquille', async () => {
    const ouverts = new Set(['/adsmap']);
    const l = await poserPastilles(entreesRail({ ouverts, marque }), { ouverts, workspaceId: 'w', brandId: 'b1' }, { resultats: { destination: '/adsmap', source: async () => { throw new Error('x'); } } });
    expect(l.every((e) => !e.pastille)).toBe(true);
  });
});
