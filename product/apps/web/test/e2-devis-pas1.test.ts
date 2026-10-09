import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * E2 · le devis du pas 1 est CALCULÉ sur la requête réellement envoyée.
 *
 * « Corrige le montant figé de 0,36 $ : calcule la réservation nécessaire pour
 * la compilation, l'image et le contrôle visuel à partir des paramètres
 * effectivement envoyés. » (Codex/propriétaire, 9 octobre)
 *
 * Vraie base (pglite, semis de recette, registre publié), VRAI adaptateur
 * (`adaptateurAnthropicGarde` → `guardedAnthropic` → SDK) vers un faux serveur
 * Anthropic local. On compare au RÉSULTAT :
 *  · la requête calculée à blanc (`requeteCompilationPas1`) et le corps HTTP
 *    que le serveur a REÇU quand la vraie compilation s'exécute ;
 *  · la ligne du devis et la RÉSERVATION que la barrière a écrite en base
 *    (`ai_spend.estimated_usd`) pour cet appel ;
 *  · le calcul à blanc n'écrit rien (aucune trace, aucune ligne, aucun appel).
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import { borneMaxAppel, coutMaximalTexte } from '@tiktrends/core';
import { semerRecette } from '../scripts/recette/semer';
import { requeteCompilationPas1 } from '../scripts/recette/devis';
import { MODE_PAS1, RECETTE } from '../scripts/recette/regles';
import { adaptateurAnthropicGarde, modeleTexte, PROFILS_ROUTES_ANTHROPIC } from '../lib/studios/prompts/adaptateur';
import { environnementPrompts } from '../lib/studios/prompts/environnement';
import { compilerEtAttesterPour } from '../lib/studios/image/consigne';
import { contexteDepuisSession } from '../lib/studios/garde';
import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';

const ENV = {
  TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15',
  DATABASE_URL: 'postgres://recette:mdp-e2-devis@127.0.0.1:5432/tiktrends_recette',
};
const ctx = () => contexteDepuisSession({ user: { id: RECETTE.userId, email: RECETTE.email, name: 'Recette' }, workspaceId: RECETTE.workspaceId, role: 'owner', plan: 'business', equipe: null }, [RECETTE.brandId], [], `st_e2_${randomUUID()}`);
const modelePour = (p: string) => (PROFILS_ROUTES_ANTHROPIC.includes(p) ? modeleTexte() : null);
const compte = async (t: PgTable) => (await db.select().from(t)).length;
let srv: FauxServeur;
const avant = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };

beforeAll(async () => {
  srv = await fauxAnthropic();
  process.env.ANTHROPIC_API_KEY = 'cle-factice-e2-devis';
  process.env.ANTHROPIC_BASE_URL = srv.url;
  process.env.ANTHROPIC_GEN_MODEL = 'claude-sonnet-5';
  process.env.AI_SPEND_CAP_USD = '5';
  const r = await semerRecette(ENV, { maintenant: new Date('2026-10-09T10:00:00Z') });
  if (!r.ok) throw new Error(r.raisons.join(' ; '));
}, 120_000);
afterAll(async () => {
  await srv.fermer();
  for (const [k, v] of [['ANTHROPIC_API_KEY', avant.cle], ['ANTHROPIC_BASE_URL', avant.url], ['ANTHROPIC_GEN_MODEL', avant.modele], ['AI_SPEND_CAP_USD', avant.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('devis de compilation · la requête réellement envoyée', () => {
  it('à blanc : aucune écriture, aucun appel ; puis la vraie compilation envoie EXACTEMENT cette requête, et la barrière réserve EXACTEMENT la ligne du devis', async () => {
    const t0 = { runs: await compte(schema.studioPromptRuns), depenses: await compte(schema.aiSpend), audits: await compte(schema.studioAuditEvents) };
    srv.comportement({ type: 'ok', entree: 1, sortie: 1, texte: '{}' });
    const rc = await requeteCompilationPas1(ctx(), { projectId: RECETTE.projectId, mode: MODE_PAS1, maintenant: new Date('2026-10-09T10:00:00Z'), modelePour });
    expect(rc.ok, JSON.stringify(rc)).toBe(true);
    if (!rc.ok) return;
    expect({ runs: await compte(schema.studioPromptRuns), depenses: await compte(schema.aiSpend), audits: await compte(schema.studioAuditEvents), requetes: srv.requetes() }, 'le calcul du devis a écrit ou appelé').toEqual({ ...t0, requetes: 0 });

    // La vraie compilation, par l'adaptateur réel : le serveur reçoit la requête, la barrière réserve.
    srv.comportement({ type: 'ok', entree: 5000, sortie: 400, texte: '{"status":"blocked","questions":["?"],"warnings":[],"evidenceIds":[],"result":null}' });
    await compilerEtAttesterPour(ctx(), { projectId: RECETTE.projectId, mode: MODE_PAS1 }, { adaptateur: adaptateurAnthropicGarde(), environnement: environnementPrompts(ENV), veilleOuverte: true, maintenant: new Date('2026-10-09T10:00:00Z') });
    expect(srv.requetes()).toBe(1);
    const envoye = srv.corps()[0] as { model: string; max_tokens: number; system: Array<{ type: string; text: string }>; messages: Array<{ role: string; content: unknown }> };
    const sys = rc.requete.messages.filter((m) => m.role === 'system').map((m) => m.contenu);
    const usr = rc.requete.messages.filter((m) => m.role === 'user').map((m) => m.contenu);
    expect({ model: envoye.model, max_tokens: envoye.max_tokens, system: envoye.system.map((b) => b.text), user: envoye.messages.map((m) => m.content) }, 'la requête du devis n’est pas celle qui part').toEqual({ model: rc.requete.modele, max_tokens: rc.requete.maxJetonsSortie, system: sys, user: usr });
    expect(borneMaxAppel(envoye)).toBe(rc.requete.borneUsd);

    const [reservation] = await db.select().from(schema.aiSpend);
    expect(Math.ceil(reservation!.estimatedUsd * 1e6 - 1e-6), 'la ligne de compilation du devis n’est pas la réservation posée par la barrière').toBe(rc.requete.borneUsdMicros);
    // Et ce n'est plus l'estimation figée (3,5 caractères par jeton) d'avant.
    console.info(`[e2:mesure] compilation image.compile · borne ${rc.requete.borneUsd} $ · ancienne estimation ${coutMaximalTexte(rc.requete.modele)} $`);
    expect(rc.requete.borneUsdMicros).not.toBe(Math.round(coutMaximalTexte(rc.requete.modele) * 1e6));
  }, 60_000);
});
