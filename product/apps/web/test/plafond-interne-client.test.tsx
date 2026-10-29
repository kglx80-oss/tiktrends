import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Le plafond interne de dépense n'est plus montré aux clients.
 *
 * Défaut (audit crédits du 29/10, surfaces 22 et 30) : le plafond est GLOBAL,
 * ce qu'il affiche est la dépense IA de toute la plateforme. Un admin client sur
 * Plus lisait sur le Radar « X $ dépensés sur un plafond de Y $ · il reste … »,
 * et Jarvis refusait par « Plafond de dépense atteint · X $ engagés sur Y $ ».
 *
 * On lit des RÉSULTATS, sur une base Postgres réelle (pglite) et la barrière de
 * dépense réelle :
 *  · Radar · `radarViewAction` (ce qui part vers le navigateur), puis le HTML de
 *    l'écran rendu avec cette vue. Client : ni montant de la plateforme, ni
 *    plafond, ni `spend` dans la réponse. Personnel : les montants y sont ;
 *  · Jarvis · `POST /api/jarvis/chat` refusé par le plafond (429). Client : la
 *    phrase neutre, aucun « $ ». Personnel : le détail chiffré.
 *
 * Mutations faites à la main (restaurées par `git checkout --`) :
 *  · `voitDepensePlateforme` rend toujours vrai ⇒ les cas client tombent
 *    (« 7.77 $ » dans la réponse, l'écran et le refus) ;
 *  · la route renvoie `e.message` brut ⇒ le cas client Jarvis tombe ;
 *  · l'action renvoie `spend` à tout le monde ⇒ la réponse ET l'écran client
 *    tombent (« montant du plafond à l'écran », « plafond global à l'écran »).
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID(), user: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: ids.brand, name: 'Neva', logoUrl: null, url: null, category: null }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap', useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), redirect: () => { throw new Error('redirect'); } }));

import { db, schema } from '@tiktrends/db';
import { REFUS_DEPENSE_CLIENT, sousNavResultats } from '@tiktrends/core';
import { radarViewAction } from '../app/actions/adsmap-radar';
import { POST } from '../app/api/jarvis/chat/route';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { RadarAdsmap } from '../spatial/vues/resultats/RadarAdsmap';

/** Admin d'un espace client sur Plus · le cas de l'audit. */
const client = () => ({ user: { id: ids.user, email: 'admin@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'admin', plan: 'plus', equipe: null });
/** Équipe de la plateforme à accès total. */
const personnel = () => ({ user: { id: ids.user, email: 'equipe@agence.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'owner', plan: 'plus', equipe: { role: 'adminplus', matrice: {} } });
/** Équipe de la plateforme SANS accès total · traitée comme un client. */
const equipeRestreinte = () => ({ ...personnel(), equipe: { role: 'manager', matrice: {} } });

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Admin', initiales: 'AD', email: 'admin@client.test', role: 'Administrateur' },
  credits: { solde: 10, dotation: 10, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendreRadar = (vue: unknown) => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}><RadarAdsmap sousNav={sousNavResultats({ admin: true })} sous="s" erreur={null} vue={vue as never} /></FournisseurSpatial>,
);

/** Le plafond posé pour l'épreuve · un montant qu'on ne peut pas confondre. */
const PLAFOND = '7.77';

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo', plan: 'plus' });
  await db.insert(schema.users).values({ id: ids.user, email: 'admin@client.test' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
});
beforeEach(() => { process.env.AI_SPEND_CAP_USD = PLAFOND; });

describe('Radar · le plafond global n’est montré qu’au personnel', () => {
  it('client (admin d’espace, Plus) · la réponse et l’écran ne disent ni dépense de plateforme ni plafond', async () => {
    h.session = client();
    const r = await radarViewAction();
    expect(r.error).toBeUndefined();
    // `expect.soft` · chaque fuite est dite, la réponse ET l'écran.
    expect.soft(r.view?.spend, 'dépense de la plateforme envoyée au navigateur').toBeUndefined();
    expect.soft(JSON.stringify(r), 'montant du plafond dans la réponse').not.toContain(PLAFOND);
    const html = rendreRadar(r.view);
    expect.soft(html).toContain('Radar des concurrents');
    expect.soft(html, 'montant du plafond à l’écran').not.toContain(PLAFOND);
    expect.soft(html, 'plafond global à l’écran').not.toMatch(/plafond global|dépensés sur un plafond|Il reste/i);
    expect.soft(html).toContain('momentanément limité');
  });

  it('équipe sans accès total · même lecture qu’un client', async () => {
    h.session = equipeRestreinte();
    const r = await radarViewAction();
    expect(r.view?.spend).toBeUndefined();
    expect(rendreRadar(r.view)).not.toContain(PLAFOND);
  });

  it('personnel (accès total) · le plafond et la dépense de la plateforme sont là', async () => {
    h.session = personnel();
    const r = await radarViewAction();
    expect(r.view?.spend?.capUsd).toBe(7.77);
    const html = rendreRadar(r.view);
    expect(html).toContain('7.77 $');
    expect(html).toMatch(/Le plafond global reste au-dessus de tout/);
  });
});

async function poser(): Promise<{ status: number; corps: string }> {
  const res = await POST(new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Bonjour ?' }) }));
  return { status: res.status, corps: await res.text() };
}

describe('Jarvis · le refus du plafond selon le lecteur', () => {
  beforeEach(() => { process.env.AI_SPEND_CAP_USD = '0.0001'; });

  it('client · 429 avec la phrase neutre, aucun « $ », aucun montant', async () => {
    h.session = client();
    const r = await poser();
    expect(r.status).toBe(429);
    expect(JSON.parse(r.corps).error).toBe(REFUS_DEPENSE_CLIENT);
    expect(r.corps).not.toContain('$');
    expect(r.corps).not.toMatch(/\d[.,]\d/);
  });

  it('personnel · 429 avec le détail chiffré du plafond', async () => {
    h.session = personnel();
    const r = await poser();
    expect(r.status).toBe(429);
    const e = JSON.parse(r.corps).error as string;
    expect(e).toMatch(/Plafond de dépense atteint · .* \$ engagés sur .* \$/);
  });
});
