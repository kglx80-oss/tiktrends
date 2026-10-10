import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * R5 · sur un VRAI PostgreSQL : 0056 rejouée, le plafond qui SUIT le montant
 * facturé, et l'idempotence sous concurrence réelle (plusieurs connexions du
 * pool, verrou de ligne `FOR UPDATE`).
 *
 * Ignoré sans `R5_PG_URL` (la CI n'a pas de Postgres). Base LOCALE seulement,
 * restaurée depuis le dump vide (0000→0054 ; le test applique 0055 et 0056) :
 *   R5_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_r5 pnpm exec vitest run test/r5-plafond-pg.test.ts
 * Les réconciliations sont en ajout seul (déclencheur) : rien n'est supprimé.
 * Chaque passage écrit ses lignes dans une fenêtre datée qui lui est propre
 * (au-delà de l'an 3000, à moins de 100 s de son début), de sorte que la somme de
 * la fenêtre ne voit qu'elles.
 */

const URL_PG = process.env.R5_PG_URL ?? '';
const LOCALE = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);

async function charger() {
  process.env.DATABASE_URL = URL_PG;
  const dbm = await import('@tiktrends/db');
  const core = await import('@tiktrends/core');
  return { ...dbm, decisionReconciliation: core.decisionReconciliation, checkBudget: core.checkBudget };
}

describe.skipIf(!URL_PG || !LOCALE)('R5 · PostgreSQL réel · plafond et idempotence', () => {
  let m: Awaited<ReturnType<typeof charger>>;
  // Fenêtre propre au passage · deux passages à 1 s d'écart sont à 100 s l'un de l'autre, et un passage
  // n'écrit qu'à moins de 100 s du début de sa fenêtre : la somme d'une fenêtre ne voit que ses lignes.
  const fenetre = new Date(Date.UTC(3000, 0, 1) + Date.now() * 100);
  const a = (secondes: number) => new Date(fenetre.getTime() + secondes * 1_000);
  const auteur = randomUUID();
  /** Le client postgres-js sous drizzle (0.33 : `session.client`) · pour fermer le pool en fin de passage. */
  const client = () => (m?.db as unknown as { session?: { client?: { end: () => Promise<void> } } } | undefined)?.session?.client;

  beforeAll(async () => {
    m = await charger();
    // Instruction par instruction, comme le migrateur drizzle (séparateur `--> statement-breakpoint`).
    // Le dump de recette s'arrête à 0054 : 0055 (une colonne, IF NOT EXISTS) puis 0056.
    const instructions = ['0055_ai_spend_reconciliation', '0056_ai_spend_reconciliations'].flatMap((tag) => readFileSync(join(process.cwd(), `../../packages/db/drizzle/${tag}.sql`), 'utf8')
      .split(/-->\s*statement-breakpoint/).map((x) => x.trim()).filter(Boolean));
    // Rejouable : deux passages, aucune erreur, aucun doublon d'objet.
    for (let passage = 0; passage < 2; passage++) for (const i of instructions) await m.db.execute(m.sql.raw(i));
    await m.db.insert(m.schema.users).values({ id: auteur, email: `fondateur-${auteur}@r5.exemple.test` });
  }, 60_000);
  afterAll(async () => { await client()?.end().catch(() => {}); });

  const ligneIncertaine = async (usd: number, secondes: number) => (await m.db.insert(m.schema.aiSpend).values({
    provider: 'anthropic', model: 'claude-sonnet-5', action: 'r5:pg', estimatedUsd: usd, actualUsd: usd, reconcileReason: 'coupure', createdAt: a(secondes),
  }).returning())[0]!.id;
  const reconcilier = (aiSpendId: string, billedMicros: number, cle: string) => m.reconcilierDepense(m.db as unknown as import('@tiktrends/db').BaseDepense, {
    aiSpendId, billedMicros, currency: 'USD', providerRef: 'inv_pg_01', reason: 'facture retrouvée', authorId: auteur, idempotencyKey: cle,
  }, (e) => m.decisionReconciliation(e, aiSpendId));
  const reserver = (usd: number, secondes: number) => m.reserverDepense(m.db as unknown as import('@tiktrends/db').BaseDepense, {
    workspaceId: null, provider: 'fal', model: 'fal_image', action: 'r5:pg-reserve', usd,
  }, { depuis: fenetre, decider: (depense) => m.checkBudget({ spentUsd: depense, capUsd: 1 }, usd) }).then(async (r) => {
    // La ligne réservée est datée DANS la fenêtre de ce passage.
    if (r.ok) await m.db.update(m.schema.aiSpend).set({ createdAt: a(secondes) }).where(m.eq(m.schema.aiSpend.id, r.id));
    return r;
  });

  it('plafond 1 $ · 0,95 $ incertain bloque une réservation de 0,08 $ ; réconcilié à 0,40 $, elle passe et la somme suit', async () => {
    const id = await ligneIncertaine(0.95, 1);
    expect(await m.depenseDepuis(m.db as unknown as import('@tiktrends/db').BaseDepense, fenetre)).toBeCloseTo(0.95, 9);
    expect((await reserver(0.08, 2)).ok, 'la réserve incertaine n’est pas comptée').toBe(false);
    expect(await reconcilier(id, 400_000, `cle-pg-${randomUUID()}`)).toMatchObject({ ok: true, statut: 'creee' });
    expect(await m.depenseDepuis(m.db as unknown as import('@tiktrends/db').BaseDepense, fenetre), 'le plafond retient encore le réservé').toBeCloseTo(0.4, 9);
    expect((await reserver(0.08, 3)).ok, 'le restant n’a pas suivi le facturé').toBe(true);
    expect(await m.depenseDepuis(m.db as unknown as import('@tiktrends/db').BaseDepense, fenetre)).toBeCloseTo(0.48, 9);
    const [l] = await m.db.select().from(m.schema.aiSpend).where(m.eq(m.schema.aiSpend.id, id));
    expect([l!.actualUsd, l!.reconcileReason], 'la ligne ai_spend a été réécrite').toEqual([0.95, 'coupure']);
  }, 60_000);

  it('10 manches · deux soumissions simultanées, même clé ⇒ une réconciliation ; clés différentes ⇒ une acceptée, une refusée', async () => {
    const bilan: string[] = [];
    for (let manche = 0; manche < 10; manche++) {
      const x = await ligneIncertaine(0.01, 10 + manche);
      const cle = `cle-pg-meme-${randomUUID()}`;
      const meme = await Promise.all([reconcilier(x, 5_000, cle), reconcilier(x, 5_000, cle)]);
      const y = await ligneIncertaine(0.01, 30 + manche);
      const autres = await Promise.all([reconcilier(y, 5_000, `cle-pg-a-${randomUUID()}`), reconcilier(y, 6_000, `cle-pg-b-${randomUUID()}`)]);
      const n = async (id: string) => (await m.db.select().from(m.schema.aiSpendReconciliations).where(m.eq(m.schema.aiSpendReconciliations.aiSpendId, id))).length;
      const ligne = [
        meme.map((r) => (r.ok ? r.statut : r.code)).sort().join(','), await n(x),
        autres.map((r) => (r.ok ? r.statut : r.code)).sort().join(','), await n(y),
      ].join('/');
      bilan.push(ligne);
      expect(ligne, `manche ${manche}`).toBe('creee,deja_enregistree/1/DEJA_RECONCILIEE,creee/1');
    }
    expect(new Set(bilan).size).toBe(1);
  }, 120_000);

  it('ajout seul · modification et suppression refusées par la base', async () => {
    const id = await ligneIncertaine(0.02, 60);
    const r = await reconcilier(id, 1_000, `cle-pg-${randomUUID()}`);
    if (!r.ok) throw new Error(r.message);
    await expect(m.db.update(m.schema.aiSpendReconciliations).set({ billedMicros: 0 }).where(m.eq(m.schema.aiSpendReconciliations.id, r.reconciliation.id))).rejects.toThrow(/STUDIO_IMMUABLE/);
    await expect(m.db.delete(m.schema.aiSpendReconciliations).where(m.eq(m.schema.aiSpendReconciliations.id, r.reconciliation.id))).rejects.toThrow(/STUDIO_IMMUABLE/);
    await expect(m.db.delete(m.schema.aiSpend).where(m.eq(m.schema.aiSpend.id, id))).rejects.toThrow(/ai_spend_reconciliations_ai_spend_id/);
  }, 60_000);
});
