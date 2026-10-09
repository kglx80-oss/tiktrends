import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * F1 · mode SHADOW (cahier 01 §14) · la résolution à blanc de la requête
 * `image.compile`, exposée comme capacité « shadow » : aucun appel au modèle,
 * aucune écriture, et la forme rendue est EXACTEMENT celle de la requête que
 * la vraie compilation enverrait (`requeteCompilationPas1`, E2, comparée au
 * corps HTTP réellement reçu dans `e2-devis-pas1.test.ts`).
 *
 * Vraie base (pglite, semis de recette, registre publié). Aucune clé de
 * fournisseur posée : un appel au modèle ne pourrait même pas partir.
 */

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createHash, randomUUID } from 'node:crypto';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import { semerRecette } from '../scripts/recette/semer';
import { requeteCompilationPas1 } from '../scripts/recette/devis';
import { MODE_PAS1, RECETTE } from '../scripts/recette/regles';
import { modeleTexte, PROFILS_ROUTES_ANTHROPIC } from '../lib/studios/prompts/adaptateur';
import { contexteDepuisSession } from '../lib/studios/garde';
import { resoudreCompilationAblanc } from '../app/actions/studios/shadow';

const ENV = { TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15', DATABASE_URL: 'postgres://recette:mdp-f1@127.0.0.1:5432/tiktrends_recette' };
const SESSION = { user: { id: RECETTE.userId, email: RECETTE.email, name: 'Recette' }, workspaceId: RECETTE.workspaceId, workspaceName: 'Recette', role: 'owner', plan: 'business', equipe: null };
const compte = async (t: PgTable) => (await db.select().from(t)).length;
const avantCle = process.env.ANTHROPIC_API_KEY;

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const r = await semerRecette(ENV, { maintenant: new Date() });
  if (!r.ok) throw new Error(r.raisons.join(' ; '));
  h.session = SESSION;
}, 120_000);
afterAll(() => { if (avantCle !== undefined) process.env.ANTHROPIC_API_KEY = avantCle; });

describe('shadow · résolution à blanc, sans appel ni écriture', () => {
  it('coupée par défaut ; allumée, rend la forme exacte de la requête, n’écrit rien', async () => {
    vi.stubEnv('STUDIOS_CAPACITES_GENERALES', '');
    const coupee = await resoudreCompilationAblanc({ projectId: RECETTE.projectId, mode: MODE_PAS1 });
    expect(!coupee.ok && coupee.targetIds).toEqual(['shadow']);
    vi.stubEnv('STUDIOS_CAPACITES_GENERALES', 'shadow');

    const tables = [schema.studioPromptRuns, schema.aiSpend, schema.studioAuditEvents, schema.studioQuotes, schema.studioProjectVersions];
    const avant = await Promise.all(tables.map(compte));
    const r = await resoudreCompilationAblanc({ projectId: RECETTE.projectId, mode: MODE_PAS1 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(await Promise.all(tables.map(compte)), 'la résolution à blanc a écrit').toEqual(avant);

    const ctx = contexteDepuisSession(SESSION as never, [RECETTE.brandId], [], `st_f1_${randomUUID()}`);
    const ref = await requeteCompilationPas1(ctx, { projectId: RECETTE.projectId, mode: MODE_PAS1, maintenant: new Date(), modelePour: (p) => (PROFILS_ROUTES_ANTHROPIC.includes(p) ? modeleTexte() : null) });
    if (!ref.ok) throw new Error(ref.raison);
    expect(r.resolution).toEqual({
      modele: ref.requete.modele, profil: ref.requete.profil, messages: ref.requete.messages.length,
      caracteres: ref.requete.messages.reduce((n, m) => n + m.contenu.length, 0),
      empreinte: createHash('sha256').update(JSON.stringify(ref.requete.messages)).digest('hex'),
      maxJetonsSortie: ref.requete.maxJetonsSortie, borneUsd: ref.requete.borneUsd,
    });
    // Le texte compilé (prompts de la plateforme) n'est jamais rendu.
    expect(JSON.stringify(r)).not.toContain(ref.requete.messages[0]!.contenu.slice(0, 40));
    vi.unstubAllEnvs();
  }, 60_000);
});
