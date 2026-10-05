import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * Lot 19B · la VRAIE route `/api/jarvis/chat` consomme les Connaissances.
 *
 * On appelle `POST` de `app/api/jarvis/chat/route.ts` tel qu'il est livré · base
 * Postgres réelle (pglite, migrations du dépôt), actions réelles pour déposer
 * les connaissances, barrière de dépense réelle, SDK Anthropic réel · seul le
 * fournisseur est faux (serveur HTTP local, `ANTHROPIC_BASE_URL`), et il
 * enregistre la consigne RÉELLEMENT reçue. On lit le flux jusqu'au bout, puis :
 *  - la consigne contient les versions publiées applicables, jamais un
 *    brouillon, une version retirée ou la connaissance d'une autre marque ;
 *  - le compteur « incluse » de chaque version a avancé, « citée » seulement
 *    pour la référence que la réponse cite ;
 *  - la barrière de dépense refuse comme avant (429) et RIEN ne part vers le
 *    fournisseur · le branchement n'ajoute aucun appel.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID(), user: randomUUID(), ws2: randomUUID(), brand2: randomUUID() };
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

import { db, schema } from '@tiktrends/db';
import { refConnaissance, type SaisieConnaissance } from '@tiktrends/core';
import { creerConnaissanceAction, retirerConnaissanceAction } from '../app/actions/connaissances';
import { usageConnaissances } from '../lib/jarvis-connaissances';
import { POST } from '../app/api/jarvis/chat/route';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';

const equipe = () => ({ user: { id: ids.user, email: 'equipe@agence.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'owner', plan: 'plus', equipe: { role: 'adminplus', matrice: {} } });
const membre = () => ({ user: { id: ids.user, email: 'membre@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'member', plan: 'plus', equipe: null });
const saisie = (o: Partial<SaisieConnaissance>): SaisieConnaissance => ({ titre: 'T', type: 'instruction', texte: 'X', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o });

let mock: Awaited<ReturnType<typeof demarrerMockFournisseur>>;
let reponse = 'Réponse simulée.';
const K: Record<string, string> = {};

async function poser(question: string): Promise<{ status: number; texte: string }> {
  const res = await POST(new Request('http://local/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: question }) }));
  return { status: res.status, texte: await res.text() };
}

beforeAll(async () => {
  mock = await demarrerMockFournisseur(() => reponse);
  process.env.ANTHROPIC_API_KEY = 'cle-factice-locale';
  process.env.ANTHROPIC_BASE_URL = mock.url;
  await db.insert(schema.workspaces).values([{ id: ids.ws, name: 'Démo' }, { id: ids.ws2, name: 'Autre' }]);
  await db.insert(schema.users).values({ id: ids.user, email: 'membre@client.test' });
  await db.insert(schema.brands).values([{ id: ids.brand, workspaceId: ids.ws, name: 'Neva', creativeRules: 'REGLE_MAISON_NEVA' }, { id: ids.brand2, workspaceId: ids.ws2, name: 'Autre' }]);
  h.session = equipe();
  const cree = async (cle: string, s: SaisieConnaissance, publier: boolean) => { const r = await creerConnaissanceAction({ ...s, publier }); if (!r.id) throw new Error(r.error); K[cle] = r.id; };
  await cree('publiee', saisie({ titre: 'Ton', texte: 'TEXTE_PUBLIE' }), true);
  await cree('methode', saisie({ titre: 'Itérer', type: 'methode', texte: 'TEXTE_METHODE' }), true);
  await cree('brouillon', saisie({ titre: 'Pas prête', type: 'savoir', texte: 'TEXTE_BROUILLON' }), false);
  await cree('retiree', saisie({ titre: 'Ancienne', texte: 'TEXTE_RETIRE' }), true);
  await retirerConnaissanceAction({ id: K.retiree! });
  await cree('autre', saisie({ titre: 'Privée', type: 'donnees', texte: 'TEXTE_AUTRE_MARQUE', portee: { niveau: 'marque', workspaceId: ids.ws2, brandId: ids.brand2 } }), true);
});
afterAll(async () => { await mock.fermer(); });
beforeEach(() => { h.session = membre(); delete process.env.AI_SPEND_CAP_USD; });

describe('POST /api/jarvis/chat · la consigne réellement envoyée', () => {
  it('contient les publiées applicables, aucun brouillon, aucune retirée, rien d’une autre marque', async () => {
    const avant = mock.recues.length;
    const r = await poser('Comment itérer ?');
    expect(r.status).toBe(200);
    expect(mock.recues.length).toBe(avant + 1);
    const system = mock.recues[mock.recues.length - 1]!.system;
    expect(system).toContain('TEXTE_PUBLIE');
    expect(system).toContain('TEXTE_METHODE');
    expect(system).not.toContain('TEXTE_BROUILLON');
    expect(system).not.toContain('TEXTE_RETIRE');
    expect(system).not.toContain('TEXTE_AUTRE_MARQUE');
    expect(system.trimEnd().endsWith('REGLE_MAISON_NEVA')).toBe(true);
  });

  it('le compteur « incluse » avance à chaque réponse · « citée » seulement pour la référence citée', async () => {
    const refP = refConnaissance(K.publiee!, 1);
    const refM = refConnaissance(K.methode!, 1);
    const u0 = await usageConnaissances();
    reponse = `Trois phrases.\n[[SOURCE:${refP}]]`;
    const r = await poser('Cite ta source.');
    expect(r.texte).toContain('Trois phrases.');
    const u1 = await usageConnaissances();
    expect(u1.get(refP)!.inclus).toBe((u0.get(refP)?.inclus ?? 0) + 1);
    expect(u1.get(refM)!.inclus).toBe((u0.get(refM)?.inclus ?? 0) + 1);
    expect(u1.get(refP)!.cite).toBe((u0.get(refP)?.cite ?? 0) + 1);
    expect(u1.get(refM)!.cite).toBe(u0.get(refM)?.cite ?? 0);
    expect(u1.has(refConnaissance(K.brouillon!, 1))).toBe(false);
    expect(u1.has(refConnaissance(K.autre!, 1))).toBe(false);
  });

  it('retirée entre deux tours d’un même fil · la question suivante part sans elle', async () => {
    await poser('Premier tour');
    h.session = equipe();
    await retirerConnaissanceAction({ id: K.publiee! });
    h.session = membre();
    await poser('Deuxième tour');
    const dernier = mock.recues[mock.recues.length - 1]!;
    expect(dernier.system).not.toContain('TEXTE_PUBLIE');
    expect(dernier.system).toContain('TEXTE_METHODE');
    // Le fil passé part tel quel · pas d'oubli rétroactif promis.
    expect(dernier.messages.some((m) => m.content === 'Premier tour')).toBe(true);
  });

  it('barrière de dépense inchangée · plafond atteint → 429, rien ne part vers le fournisseur', async () => {
    process.env.AI_SPEND_CAP_USD = '0';
    const avant = mock.recues.length;
    const r = await poser('Bloqué ?');
    expect(r.status).toBe(429);
    expect(mock.recues.length).toBe(avant);
  });
});
