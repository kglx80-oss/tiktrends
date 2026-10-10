import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * R5 · un contrôle visuel à l'issue INCERTAINE, une fois sa ligne de dépense
 * réconciliée avec la facture, peut REPARTIR · et seulement alors.
 *
 * Vraie base (pglite, migrations dont 0056), registre publié, VRAI adaptateur
 * de production pointé vers un faux serveur Anthropic local (0 $). On lit les
 * RÉSULTATS : requêtes reçues par le serveur, statut qualité, marqueur,
 * lignes `ai_spend`, audit.
 *
 *  · coupure ⇒ incertain ; relance refusée (PROVIDER_UNCERTAIN, 0 requête) ;
 *  · ligne réconciliée ⇒ relance acceptée : 1 requête, verdict enregistré,
 *    marqueur « conclu », audit de la reprise, ligne d'origine intacte ;
 *  · deux relances simultanées après réconciliation ⇒ UNE requête ;
 *  · réconciliée mais tranchée par un humain depuis ⇒ aucune relance.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import { db, schema, eq, and, reconcilierDepense, type BaseDepense } from '@tiktrends/db';
import { lireMarqueurControleVision, decisionReconciliation } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { resolveurMediasStudio } from '../lib/studios/prompts/resolveur';
import { adaptateurAnthropicGarde } from '../lib/studios/prompts/adaptateur';
import { controlerSortieParVision, type DependancesVision } from '../lib/studios/produit/qualite';
import { semer, session } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { publierRegistreDeTest } from './l2-outils';
import { semerCatalogue, type Catalogue } from './l5c-outils';
import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';
import { jobLivre, lecteur, MODELE } from './e2-vision-outils';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
/**
 * Une sortie VALIDE de `quality.visual` (schéma du registre) · verdict « passed ».
 * NB : `sortieVision` d'`e2-vision-outils` ajoute une clé `sortieId` à la racine,
 * que le schéma refuse (INVALID_SCHEMA) ; ici on veut un verdict réellement enregistré.
 */
const sortieVision = (_sortieId: string) => JSON.stringify({
  status: 'ready', questions: [], warnings: [], evidenceIds: [],
  result: { verdict: 'passed', issues: [], unverifiable: [], summary: 'Lunettes visibles' },
});
let srv: FauxServeur;
let cat: Catalogue;
const env = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };
const deps = (): DependancesVision => ({ adaptateur: adaptateurAnthropicGarde(), environnement: 'test', plafondAtteint: async () => false, medias: resolveurMediasStudio(lecteur) });
const base = () => db as unknown as BaseStudio;
const job = async (id: string) => (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
/** Les lignes `ai_spend` du contrôle visuel nées depuis `avant` (identifiants déjà vus exclus), dans l'ordre. */
const depensesVision = async (avant: ReadonlySet<string>) => (await db.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'studio-prompt:quality.visual')).orderBy(schema.aiSpend.createdAt))
  .filter((l) => !avant.has(l.id));

/** Réconcilie une ligne par la fonction de base et la décision du noyau (le geste de l'écran passe par elles). */
async function reconcilier(aiSpendId: string, billedMicros: number) {
  return reconcilierDepense(db as unknown as BaseDepense, {
    aiSpendId, billedMicros, currency: 'USD', providerRef: 'inv_vision_01', reason: 'appel retrouvé sur la facture', authorId: ids.ua, idempotencyKey: `cle-${randomUUID()}`,
  }, (e) => decisionReconciliation(e, aiSpendId));
}

/** Un job livré, contrôlé une fois avec coupure ⇒ marqueur incertain, ligne à réconcilier. */
async function incertain() {
  const t0 = new Set((await db.select({ id: schema.aiSpend.id }).from(schema.aiSpend)).map((l) => l.id));
  const { jobId, sortieId } = await jobLivre(base(), ids, cat);
  srv.comportement({ type: 'coupure' });
  expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps())).toMatchObject({ ok: true, qualite: 'requires_review', controle: 'aucun' });
  const lignes = await depensesVision(t0);
  expect(lignes.map((l) => l.reconcileReason)).toEqual(['coupure']);
  return { jobId, sortieId, ligne: lignes[0]!, t0 };
}

beforeAll(async () => {
  srv = await fauxAnthropic();
  process.env.ANTHROPIC_API_KEY = 'cle-factice-r5';
  process.env.ANTHROPIC_BASE_URL = srv.url;
  process.env.ANTHROPIC_GEN_MODEL = MODELE;
  process.env.AI_SPEND_CAP_USD = '5';
  await semer(db, schema, ids);
  cat = await semerCatalogue(base(), ids);
  await publierRegistreDeTest(depotPrompts);
}, 120_000);
afterAll(async () => {
  await srv.fermer();
  for (const [k, v] of [['ANTHROPIC_API_KEY', env.cle], ['ANTHROPIC_BASE_URL', env.url], ['ANTHROPIC_GEN_MODEL', env.modele], ['AI_SPEND_CAP_USD', env.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('R5 · contrôle visuel incertain · relance débloquée par la réconciliation', () => {
  it('refusée avant, acceptée après : 1 requête, verdict enregistré, marqueur conclu, audit, ligne d’origine intacte', async () => {
    const { jobId, sortieId, ligne, t0 } = await incertain();
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const avant = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(avant).toMatchObject({ ok: false, code: 'PROVIDER_UNCERTAIN' });
    expect(srv.requetes(), 'relance avant réconciliation').toBe(0);

    expect(await reconcilier(ligne.id, 120_000)).toMatchObject({ ok: true, statut: 'creee' });
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const apres = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(apres, JSON.stringify(apres)).toMatchObject({ ok: true, qualite: 'passed', controle: 'vision' });
    expect(srv.requetes(), 'la relance après réconciliation n’est pas partie').toBe(1);
    const j = await job(jobId);
    expect(j.qualityStatus).toBe('passed');
    expect(lireMarqueurControleVision(j.result)).toMatchObject({ etat: 'conclu' });
    const lignes = await depensesVision(t0);
    expect(lignes.map((l) => [l.id === ligne.id, l.reconcileReason, l.inputTokens])).toEqual([[true, 'coupure', null], [false, null, 9000]]);
    expect(lignes[0], 'la ligne d’origine a été réécrite').toEqual(ligne);
    const audit = await db.select().from(schema.studioAuditEvents)
      .where(and(eq(schema.studioAuditEvents.targetId, jobId), eq(schema.studioAuditEvents.action, 'media.quality.reprise')));
    expect(audit.map((a) => [a.versionBefore, a.versionAfter, (a.details as { lignesReconciliees: string[] }).lignesReconciliees])).toEqual([['requires_review', 'pending', [ligne.id]]]);
    // Tranché : plus aucune relance.
    srv.comportement({ type: 'ok', entree: 1, sortie: 1, texte: sortieVision(sortieId) });
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps())).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    expect(srv.requetes()).toBe(0);
  });

  it('deux relances simultanées après réconciliation ⇒ UNE requête, l’autre refusée', async () => {
    const { jobId, sortieId, ligne } = await incertain();
    await reconcilier(ligne.id, 0);
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const r = await Promise.all([1, 2].map(() => controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps())));
    expect(srv.requetes(), 'deux contrôles payants pour une reprise').toBe(1);
    expect(r.filter((x) => !x.ok)).toHaveLength(1);
  });

  it('réconciliée mais tranchée par un humain depuis ⇒ aucune relance', async () => {
    const { jobId, sortieId, ligne } = await incertain();
    await reconcilier(ligne.id, 50_000);
    await db.update(schema.studioJobs).set({ qualityStatus: 'rejected' }).where(eq(schema.studioJobs.id, jobId));
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps())).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    expect(srv.requetes()).toBe(0);
  });
});
