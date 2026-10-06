import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Message 55 · publier en portée PLATEFORME exige une confirmation explicite,
 * et c'est le SERVEUR qui refuse · actions réelles, base pglite réelle.
 *
 * Le résultat vérifié : ce qui est (ou n'est pas) ÉCRIT en base, et l'état de
 * la version relue · pas la présence d'un appel.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));

import { like } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { REFUS_PUBLICATION_PLATEFORME, type SaisieConnaissance } from '@tiktrends/core';
import { creerConnaissanceAction, nouvelleVersionAction, publierConnaissanceAction } from '../app/actions/connaissances';
import { lireUneConnaissance } from '../lib/jarvis-connaissances';

const adminPlus = () => ({ user: { id: 'u', email: 'equipe@agence.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', role: 'owner', plan: 'plus', equipe: { role: 'adminplus', matrice: {} } });
const saisie = (o: Partial<SaisieConnaissance> = {}): SaisieConnaissance => ({ titre: 'Plateforme 55', type: 'instruction', texte: 'TEXTE_55', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o });
const lignes = async () => (await db.select({ key: schema.appSettings.key }).from(schema.appSettings).where(like(schema.appSettings.key, 'connaissance:%'))).length;
const etat = async (id: string, n: number) => (await lireUneConnaissance(id))?.versions.find((v) => v.n === n)?.etat;

beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
});
beforeEach(() => { h.session = adminPlus(); });

describe('création publiée · plateforme', () => {
  it('sans confirmation → refusée, RIEN n’est écrit (pas même un brouillon)', async () => {
    const avant = await lignes();
    for (const confirmerPlateforme of [undefined, false, 'true' as unknown as boolean]) {
      const r = await creerConnaissanceAction({ ...saisie(), publier: true, confirmerPlateforme });
      expect(r.error).toBe(REFUS_PUBLICATION_PLATEFORME);
      expect(r.id).toBeUndefined();
    }
    expect(await lignes()).toBe(avant);
  });

  it('avec confirmation explicite → publiée', async () => {
    const r = await creerConnaissanceAction({ ...saisie(), publier: true, confirmerPlateforme: true });
    expect(r.error).toBeUndefined();
    expect(await etat(r.id!, 1)).toBe('publie');
  });

  it('brouillon sans confirmation → accepté, et il reste brouillon', async () => {
    const r = await creerConnaissanceAction({ ...saisie(), publier: false });
    expect(r.error).toBeUndefined();
    expect(await etat(r.id!, 1)).toBe('brouillon');
  });

  it('espace et marque · pas de confirmation exigée (avertissement seulement)', async () => {
    const e = await creerConnaissanceAction({ ...saisie({ portee: { niveau: 'espace', workspaceId: ids.ws } }), publier: true });
    expect(e.error).toBeUndefined();
    expect(await etat(e.id!, 1)).toBe('publie');
    const m = await creerConnaissanceAction({ ...saisie({ portee: { niveau: 'marque', workspaceId: ids.ws, brandId: ids.brand } }), publier: true });
    expect(m.error).toBeUndefined();
    expect(await etat(m.id!, 1)).toBe('publie');
  });
});

describe('publier un brouillon · la portée lue est celle STOCKÉE', () => {
  it('plateforme · refusé sans confirmation (le brouillon reste brouillon), accepté avec', async () => {
    const { id } = await creerConnaissanceAction({ ...saisie(), publier: false });
    const sans = await publierConnaissanceAction({ id: id!, n: 1 });
    expect(sans.error).toBe(REFUS_PUBLICATION_PLATEFORME);
    expect(await etat(id!, 1)).toBe('brouillon');
    const avec = await publierConnaissanceAction({ id: id!, n: 1, confirmerPlateforme: true });
    expect(avec.error).toBeUndefined();
    expect(await etat(id!, 1)).toBe('publie');
  });

  it('marque · publiable sans la case', async () => {
    const { id } = await creerConnaissanceAction({ ...saisie({ portee: { niveau: 'marque', workspaceId: ids.ws, brandId: ids.brand } }), publier: false });
    expect((await publierConnaissanceAction({ id: id!, n: 1 })).error).toBeUndefined();
    expect(await etat(id!, 1)).toBe('publie');
  });
});

describe('nouvelle version publiée · plateforme', () => {
  it('refusée sans confirmation (aucune v2 écrite), acceptée avec', async () => {
    const { id } = await creerConnaissanceAction({ ...saisie(), publier: true, confirmerPlateforme: true });
    const sans = await nouvelleVersionAction({ id: id!, base: 1, saisie: saisie({ texte: 'V2' }), publier: true });
    expect(sans.error).toBe(REFUS_PUBLICATION_PLATEFORME);
    expect((await lireUneConnaissance(id!))!.versions.length).toBe(1);
    const brouillon = await nouvelleVersionAction({ id: id!, base: 1, saisie: saisie({ texte: 'V2' }) });
    expect(brouillon.error).toBeUndefined();
    const avec = await nouvelleVersionAction({ id: id!, base: 2, saisie: saisie({ texte: 'V3' }), publier: true, confirmerPlateforme: true });
    expect(avec.error).toBeUndefined();
    expect(await etat(id!, 3)).toBe('publie');
  });
});
