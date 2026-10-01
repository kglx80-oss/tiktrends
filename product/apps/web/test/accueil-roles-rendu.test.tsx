import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { journey } from '@tiktrends/core';

/**
 * Lot 11 · l'accueil selon le rôle. Constaté au lot 10 · un client en lecture
 * voyait « Créer une pub » et « Nouvelle marque » (et les studios, Adsmap, la
 * Veille), alors que son rôle n'ouvre qu'Accueil, Analytics et Support ; un
 * membre voyait « Nouvelle marque » et des fiches de marque réservées aux
 * admins. On REND la vraie page (session simulée, ni base ni réseau) pour
 * chaque rôle et on lit les liens.
 */
const etat: { role: 'owner' | 'admin' | 'member' | 'client_viewer' } = { role: 'client_viewer' };
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: etat.role, plan: 'business', user: { id: 'u', email: 'client@exemple.invalid', name: 'Camille' } }) }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Neva' }), listBrands: async () => [{ id: 'b1', name: 'Neva' }, { id: 'b2', name: 'Orée' }] }));
vi.mock('../lib/credits', () => ({ unlimitedCredits: () => false }));
vi.mock('../lib/founder', () => ({ isFounder: () => false }));
vi.mock('../lib/ai-status', () => ({ anthropicConfigured: () => false }));
vi.mock('../lib/onboarding-state', () => ({ onboardingState: async () => ({ journey: journey(new Set(['brand', 'products', 'connect', 'generate', 'track', 'verdict']), { canAdmin: false }), relance: null }) }));
vi.mock('../app/actions/assistant', () => ({ askAssistant: async () => ({}) }));

import Dashboard from '../app/(app)/dashboard/page';

const liens = (html: string) => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]!);
async function accueil(role: typeof etat.role) {
  etat.role = role;
  const html = renderToStaticMarkup(await Dashboard());
  return { html, liens: liens(html), texte: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
}

describe('Accueil · ne propose que ce que le rôle ouvre', () => {
  it('client en lecture · ni création, ni marque, ni test · Analytics et la raison', async () => {
    const a = await accueil('client_viewer');
    for (const mort of ['/studio/ads', '/studio/image', '/studio/video', '/studio/textes', '/brands/new', '/brands', '/brands/b1', '/adsmap', '/veille', '/radar', '/jarvis']) {
      expect(a.liens, `lien vers ${mort} proposé au client en lecture`).not.toContain(mort);
    }
    expect(a.texte).not.toContain('Créer une pub');
    expect(a.texte).not.toContain('Nouvelle marque');
    expect(a.liens).toContain('/analytics');
    expect(a.liens, 'brancher un compte est réservé aux admins').not.toContain('/connections');
    expect(a.texte, 'la raison n’est pas dite').toContain('Ton rôle dans cet espace ne comprend pas la création');
    expect(a.texte, 'les marques de l’espace disparaissent').toContain('Orée');
  });
  it('membre · crée des pubs, ne gère pas les marques', async () => {
    const a = await accueil('member');
    expect(a.liens).toContain('/studio/ads');
    expect(a.liens).toContain('/adsmap');
    // La section Marques de l'accueil.
    const marques = liens(a.html.slice(a.html.indexOf('aria-label="Tes marques"'), a.html.indexOf('</section>', a.html.indexOf('aria-label="Tes marques"'))));
    expect(marques, 'fiche de marque réservée aux admins').not.toContain('/brands/b1');
    expect(marques).not.toContain('/brands/new');
    expect(marques).not.toContain('/brands');
    expect(a.texte).not.toContain('Nouvelle marque');
    expect(a.texte).toContain('ne comprend pas la gestion des marques');
    // Partout sur l'accueil, y compris le parcours (étapes cochées) et l'exemple.
    for (const admin of ['/brands/new', '/brands', '/adsmap/import', '/adsmap/lots', '/connections']) {
      expect(a.liens, `lien admin ${admin} proposé au membre`).not.toContain(admin);
    }
  });
  it('propriétaire · tout reste proposé, aucune note', async () => {
    const a = await accueil('owner');
    for (const l of ['/adsmap', '/studio/ads', '/brands/new', '/brands/b1', '/veille']) expect(a.liens, l).toContain(l);
    expect(a.texte).toContain('Créer une pub');
    expect(a.texte).not.toContain('Ton rôle dans cet espace');
  });
});
