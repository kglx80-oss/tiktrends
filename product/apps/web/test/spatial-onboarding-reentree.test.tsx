import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'accueil est facultatif et ne se répète pas tout seul · porté de l'ancienne
 * garde `onboarding-wizard` (page V5 `app/onboarding`, retirée avec la
 * coquille V5). `/onboarding` est servi par Spatial (`sp/onboarding`).
 *
 * On appelle la VRAIE page · un espace déjà accueilli est renvoyé à l'accueil
 * SANS reprise demandée ; avec `?redo=1` la page continue (elle lit les
 * marques · le faux `listBrands` le signale). Un espace non accueilli entre.
 */

const h = vi.hoisted(() => ({ onboarde: null as Date | null }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock('@tiktrends/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ at: h.onboarde, rep: null, solde: 0, essai: null, genre: null, sub: null, st: null }] }) }) }) },
  schema: { workspaces: {}, brands: {} },
}));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ user: { id: 'u', email: 'k@x.fr', name: 'Kevin' }, workspaceId: 'w', workspaceName: 'GLX', role: 'owner', plan: 'starter' }) }));
// La page a dépassé le contrôle d'accueil quand elle lit les marques.
vi.mock('../lib/brands', () => ({ listBrands: async () => { throw new Error('SUITE'); }, getActiveBrand: async () => null }));
vi.mock('../app/actions/connections', () => ({ getConnectionState: async () => ({}) }));
vi.mock('../app/actions/drive', () => ({ getDriveState: async () => ({}) }));

import ParcoursSpatial from '../app/(spatial)/sp/onboarding/page';

const ouvrir = (redo?: string) => ParcoursSpatial({ searchParams: Promise.resolve(redo ? { redo } : {}) });

describe('Accueil · facultatif, ré-entrée volontaire seulement (Spatial)', () => {
  it('un espace accueilli est renvoyé à l’accueil QUE sans reprise demandée', async () => {
    h.onboarde = new Date('2026-10-01T00:00:00Z');
    await expect(ouvrir()).rejects.toThrow('REDIRECT /dashboard');
    await expect(ouvrir('1')).rejects.toThrow('SUITE');
  });

  it('un espace non accueilli entre dans le parcours', async () => {
    h.onboarde = null;
    await expect(ouvrir()).rejects.toThrow('SUITE');
  });

  it('Jarvis offre la ré-entrée explicite « Personnaliser Jarvis »', () => {
    const jarvis = readFileSync(join(process.cwd(), 'spatial/vues/jarvis/Jarvis.tsx'), 'utf8');
    expect(jarvis).toContain('/onboarding?redo=1');
    expect(jarvis).toContain('Personnaliser Jarvis');
  });
});
