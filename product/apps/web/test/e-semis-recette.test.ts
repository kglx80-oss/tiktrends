import { describe, it, expect, vi } from 'vitest';

/**
 * Recette Studios · lot E · le SEMIS synthétique et sa garde anti-production,
 * sur une VRAIE base (pglite + migrations réelles).
 *
 * La garde est éprouvée au RÉSULTAT : une cible qui ressemble à la production
 * laisse la base VIDE (lignes comptées), et les variables qui ouvriraient
 * pourtant le registre local (hôte 127.0.0.1, drapeau de recette locale) ne
 * suffisent pas sans TIKTRENDS_ENV=recette et une base « recette ».
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import type { PgTable } from 'drizzle-orm/pg-core';
import { db, schema, eq } from '@tiktrends/db';
import { semerRecette } from '../scripts/recette/semer';
import { RECETTE, verifierCibleRecette } from '../scripts/recette/regles';

const RECETTE_OK = {
  TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15',
  DATABASE_URL: 'postgres://recette:x@127.0.0.1:5432/tiktrends_recette',
};

async function lignes() {
  const n = async (t: PgTable) => (await db.select().from(t)).length;
  return {
    espaces: await n(schema.workspaces), marques: await n(schema.brands), produits: await n(schema.products),
    projets: await n(schema.studioProjects), versions: await n(schema.studioProjectVersions), prompts: await n(schema.studioPromptVersions),
  };
}
const VIDE = { espaces: 0, marques: 0, produits: 0, projets: 0, versions: 0, prompts: 0 };

describe('Semis de recette · garde anti-production', () => {
  it('règle pure · chaque condition manquante est nommée', () => {
    expect(verifierCibleRecette(RECETTE_OK)).toEqual({ ok: true });
    const prod = verifierCibleRecette({ DATABASE_URL: 'postgres://tiktrends:x@db:5432/tiktrends', AI_SPEND_CAP_USD: '50', APP_URL: 'https://app.tiktrends.co' });
    expect(prod.ok).toBe(false);
    expect(!prod.ok && prod.raisons).toEqual([
      'TIKTRENDS_ENV=recette absent · cette commande ne tourne que dans l’environnement de recette.',
      'Hôte de base « db » · la base de recette se joint en local (127.0.0.1), jamais par un nom de service ou un hôte distant.',
      'Base « tiktrends » · le nom d’une base de recette contient « recette ».',
      'STUDIOS_PROMPTS_RECETTE_LOCALE=1 absent · le registre de prompts de recette n’est pas ouvert.',
      'AI_SPEND_CAP_USD 50 dépasse le budget d’essai de 15 $.',
      'APP_URL « https://app.tiktrends.co » désigne l’application en ligne.',
    ]);
    expect(verifierCibleRecette({ ...RECETTE_OK, AI_SPEND_CAP_USD: undefined }).ok).toBe(false);
    expect(verifierCibleRecette({ ...RECETTE_OK, AI_SPEND_CAP_USD: 'beaucoup' }).ok).toBe(false);
    expect(verifierCibleRecette({ ...RECETTE_OK, DATABASE_URL: 'postgres://recette:x@51.255.39.79:5432/tiktrends_recette' }).ok).toBe(false);
  });

  it('cible « locale » mais base de production (tiktrends, sans TIKTRENDS_ENV) ⇒ refus, base VIDE', async () => {
    // Hôte local et drapeau posés : le registre s'ouvrirait. Seule la garde de recette arrête le semis.
    const r = await semerRecette({ STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15', DATABASE_URL: 'postgres://tiktrends:x@127.0.0.1:5432/tiktrends' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.raisons).toEqual([
      'TIKTRENDS_ENV=recette absent · cette commande ne tourne que dans l’environnement de recette.',
      'Base « tiktrends » · le nom d’une base de recette contient « recette ».',
    ]);
    expect(await lignes()).toEqual(VIDE);
  });

  it('cible de recette ⇒ données synthétiques, produit épinglé, release locale · un second passage ne duplique rien', async () => {
    const r = await semerRecette(RECETTE_OK, { maintenant: new Date('2026-10-08T10:00:00Z') });
    expect(r.ok && r.deja).toBe(false);
    const apres = await lignes();
    expect(apres).toMatchObject({ espaces: 1, marques: 1, produits: 1, projets: 1 });
    expect(apres.versions).toBe(2); // création + épinglage
    expect(apres.prompts).toBeGreaterThan(0);

    const [p] = await db.select().from(schema.products).where(eq(schema.products.id, RECETTE.productId));
    expect(p!.imageUrls).toHaveLength(2);
    expect(p!.imageUrls!.every((u) => u.startsWith('data:image/png;base64,'))).toBe(true);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, RECETTE.userId));
    expect(u!.email.endsWith('.invalid')).toBe(true);
    const [projet] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, RECETTE.projectId));
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, projet!.currentVersionId!));
    const ref = (v!.content as { productRef?: { productId?: string; composantsObligatoires?: string[] } }).productRef;
    expect(ref?.productId).toBe(RECETTE.productId);
    expect(ref?.composantsObligatoires).toEqual(['lunettes', 'bandeau']);

    const r2 = await semerRecette(RECETTE_OK);
    expect(r2.ok && r2.deja).toBe(true);
    expect(r2.ok && r.ok && r2.releaseId).toBe(r.ok ? r.releaseId : null);
    expect(await lignes()).toEqual(apres);
  });
});
