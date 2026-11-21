import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

/**
 * Suite de #1122 · le registre des faces équipe ne ferme pas un écran d'équipe
 * LÉGITIME. On rend la VRAIE page « Tous les formats » (Veille, ouverte dès
 * Core) pour un espace Starter, base pglite, et on lit le HTML.
 *
 *  · un membre d'équipe ADMISSIBLE (rôle gradé, matrice qui ouvre la Veille)
 *    voit l'écran · sa face, construite par effectiveAccess dans la page, est
 *    reconnue, aucun verrou de formule ;
 *  · le même compte NON admissible, et un client sans équipe, voient le verrou
 *    de formule · « Inclus dès la formule Core ».
 *
 * La décision se prend côté serveur · la page ne transmet au client que le
 * résultat (l'écran, ou le verrou), jamais l'Access.
 */
const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); }, notFound: () => { throw new Error('404'); }, usePathname: () => '/veille/formats', useRouter: () => ({ refresh: () => {}, push: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));

import { avecSpatial } from './spatial/fournisseur';
import FormatsPage from '../app/(spatial)/sp/veille/formats/page';
import { sessionEquipeTest } from './helpers/face-equipe';

const VERROU = 'Inclus dès la formule Core';
const base = { workspaceId: '00000000-0000-4000-8000-000000001122', workspaceName: 'Espace Starter', role: 'member', plan: 'starter', user: { id: 'u-1122', email: 'membre-equipe@tiktrends.invalid', name: 'Membre' } };
/** La session d'équipe telle que getSession la rend (authentifiée · `equipeDeSession`). */
const equipe = (plateformeAdmissible: boolean) => sessionEquipeTest({ role: 'membre', matrice: { membre: ['veille'] }, plateformeAdmissible });

async function rendre(session: unknown): Promise<string> {
  h.session = session;
  return renderToStaticMarkup(avecSpatial((await FormatsPage({ searchParams: Promise.resolve({}) })) as ReactElement));
}

describe('Face équipe · un écran d’équipe légitime reste ouvert (rendu réel)', () => {
  it('membre d’équipe ADMISSIBLE, espace Starter · l’écran Tous les formats, sans verrou de formule', async () => {
    const html = await rendre({ ...base, equipe: equipe(true) });
    expect(html, 'la face équipe légitime est refusée · le registre ne reconnaît plus la face construite par effectiveAccess').not.toContain(VERROU);
    expect(html).toContain('Tous les formats');
  });

  it('le même compte NON admissible · le verrou de formule', async () => {
    expect(await rendre({ ...base, equipe: equipe(false) })).toContain(VERROU);
  });

  it('un client sans équipe · le verrou de formule (le témoin témoigne)', async () => {
    expect(await rendre({ ...base, equipe: null })).toContain(VERROU);
  });
});
