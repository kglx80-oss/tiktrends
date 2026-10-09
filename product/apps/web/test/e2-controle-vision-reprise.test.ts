import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * E2 · reprise du contrôle visuel, exclusion mutuelle, issue incertaine
 * réconciliée avant toute relance (« Si l'image est déjà produite après une
 * interruption, reprends uniquement le contrôle approuvé qui manque. Aucune
 * seconde génération ni double facturation. Un résultat incertain doit être
 * réconcilié avant toute relance. »).
 *
 * Vraie base (pglite), registre publié, VRAI adaptateur de production
 * (`adaptateurAnthropicGarde` → `guardedAnthropic` → client du SDK) pointé vers
 * un faux serveur Anthropic local. On lit les RÉSULTATS : requêtes REÇUES par
 * le serveur (ce qu'on aurait payé), lignes `ai_spend`, devis, statut qualité
 * et marqueur en base. La course réelle à deux connexions est jouée sur
 * Postgres par `e2-controle-vision-pg.test.ts`.
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

import { db, schema, eq } from '@tiktrends/db';
import { lireMarqueurControleVision } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { resolveurMediasStudio } from '../lib/studios/prompts/resolveur';
import { adaptateurAnthropicGarde } from '../lib/studios/prompts/adaptateur';
import { controlerSortieParVision, type DependancesVision } from '../lib/studios/produit/qualite';
import { controlerMediaPour } from '../lib/studios/image/parcours';
import { semer, session } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { publierRegistreDeTest } from './l2-outils';
import { semerCatalogue, type Catalogue } from './l5c-outils';
import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';
import { jobLivre, lecteur, sortieVision, MODELE, LIGNE_IMAGE } from './e2-vision-outils';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = etat.ids;
let srv: FauxServeur;
let cat: Catalogue;
const env = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };
const deps = (): DependancesVision => ({ adaptateur: adaptateurAnthropicGarde(), environnement: 'test', plafondAtteint: async () => false, medias: resolveurMediasStudio(lecteur) });
const base = () => db as unknown as BaseStudio;
const job = async (id: string) => (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
const depenses = async () => db.select().from(schema.aiSpend);
const devis = async () => (await db.select().from(schema.studioQuotes)).length;

beforeAll(async () => {
  srv = await fauxAnthropic();
  process.env.ANTHROPIC_API_KEY = 'cle-factice-e2';
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
beforeEach(async () => { etat.session = session(ids, 'ua'); await db.delete(schema.aiSpend); });

describe('reprise · média livré, ligne approuvée, aucun contrôle fait', () => {
  it('seul le contrôle manquant part : 1 requête vision, 0 devis nouveau, 1 ligne ai_spend réglée, marqueur « conclu »', async () => {
    const { jobId, sortieId } = await jobLivre(base(), ids, cat);
    const devisAvant = await devis();
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const r = await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias: resolveurMediasStudio(lecteur) });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const tranche = (await job(jobId)).qualityStatus;
    expect(tranche).not.toBe('pending');
    expect({ requetes: srv.requetes(), devisNouveaux: (await devis()) - devisAvant }, 'la reprise a fait autre chose que le seul contrôle manquant').toEqual({ requetes: 1, devisNouveaux: 0 });
    expect((await depenses()).map((l) => [l.action, l.inputTokens, l.reconcileReason])).toEqual([['studio-prompt:quality.visual', 9000, null]]);
    expect(lireMarqueurControleVision((await job(jobId)).result)).toMatchObject({ etat: 'conclu' });
    // Rejouée : déjà tranché, aucun second appel.
    srv.comportement({ type: 'ok', entree: 1, sortie: 1, texte: sortieVision(sortieId) });
    expect(await controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias: resolveurMediasStudio(lecteur) })).toEqual({ ok: true, qualite: tranche });
    expect(srv.requetes(), 'un média tranché a été re-contrôlé · second débit').toBe(0);
  });
});

describe('exclusion mutuelle · deux lancements simultanés', () => {
  it('deux clics sur un média pending ⇒ UN appel, une ligne ai_spend ; l’autre est refusé, nommé', async () => {
    const { jobId, sortieId } = await jobLivre(base(), ids, cat);
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const [a, b] = await Promise.all([
      controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps()),
      controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps()),
    ]);
    expect({ requetes: srv.requetes(), aiSpend: (await depenses()).length }, 'deux contrôles payants sont partis pour un seul média').toEqual({ requetes: 1, aiSpend: 1 });
    const refus = [a, b].filter((x) => !x.ok);
    expect(refus).toHaveLength(1);
    expect(refus[0]).toMatchObject({ code: 'INVARIANT_CONFLICT' });
  });
});

describe('issue INCERTAINE · réconciliation avant toute relance', () => {
  it('coupure après envoi ⇒ revue humaine, marqueur « incertain », ligne à réconcilier ; la relance est refusée et dit quoi réconcilier et comment', async () => {
    const { jobId, sortieId } = await jobLivre(base(), ids, cat);
    srv.comportement({ type: 'coupure' });
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(r).toMatchObject({ ok: true, qualite: 'requires_review', controle: 'aucun' });
    expect(srv.requetes()).toBe(1);
    const [ligne] = await depenses();
    expect(ligne!.reconcileReason).toBe('coupure');
    expect(lireMarqueurControleVision((await job(jobId)).result)).toMatchObject({ etat: 'incertain', cause: 'coupure' });

    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    for (const relance of [
      () => controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps()),
      () => controlerMediaPour(ctxDe(ids, 'ua'), { jobId }, { medias: resolveurMediasStudio(lecteur) }),
    ]) {
      const x = await relance();
      expect(x.ok).toBe(false);
      if (x.ok) continue;
      expect(x.code).toBe('PROVIDER_UNCERTAIN');
      expect(x.message, 'le refus ne dit pas quelle ligne réconcilier').toContain(ligne!.id);
      expect(x.message).toContain('Contrôle visuel précédent à l’issue incertaine');
      expect(x.message).toContain('Comment · compare ce montant à l’usage facturé par le fournisseur');
    }
    expect({ requetes: srv.requetes(), aiSpend: (await depenses()).length }, 'un contrôle incertain a été relancé sans réconciliation').toEqual({ requetes: 0, aiSpend: 1 });
  });

  it('processus interrompu pendant l’appel (marqueur « engagé », ligne réservée sans issue) ⇒ refus, la ligne est nommée, 0 appel', async () => {
    const { jobId, sortieId } = await jobLivre(base(), ids, cat);
    const le = new Date().toISOString();
    const [l] = await db.insert(schema.aiSpend).values({ workspaceId: ids.wsA, provider: 'anthropic', model: MODELE, action: 'studio-prompt:quality.visual', estimatedUsd: 0.147024, actualUsd: 0.147024 }).returning();
    const j = await job(jobId);
    await db.update(schema.studioJobs).set({ result: { ...(j.result as object), controleVision: { etat: 'engage', le, trace: 'st_interrompu' } } }).where(eq(schema.studioJobs.id, jobId));
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('INVARIANT_CONFLICT');
      expect(r.message).toContain('déjà engagé');
      expect(r.message, 'la ligne réservée sans issue n’est pas nommée').toContain(l!.id);
    }
    expect(srv.requetes(), 'un contrôle engagé a été relancé').toBe(0);
    expect((await job(jobId)).qualityStatus).toBe('pending');
  });

  it('refus CERTAIN du fournisseur (400) ⇒ réservation rendue, marqueur « conclu », pas d’issue incertaine', async () => {
    const { jobId } = await jobLivre(base(), ids, cat);
    srv.comportement({ type: 'statut', statut: 400 });
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(r).toMatchObject({ ok: true, qualite: 'requires_review' });
    const [ligne] = await depenses();
    expect([ligne!.actualUsd, ligne!.reconcileReason]).toEqual([0, null]);
    expect(lireMarqueurControleVision((await job(jobId)).result)).toMatchObject({ etat: 'conclu' });
  });
});

describe('aucun appel quand le contrôle est hors devis ou déjà tranché', () => {
  it('hors devis ⇒ BUDGET_EXCEEDED, aucun marqueur posé ; tranché ⇒ INVARIANT_CONFLICT, 0 requête', async () => {
    const h = await jobLivre(base(), ids, cat, [LIGNE_IMAGE]);
    srv.comportement({ type: 'ok', entree: 1, sortie: 1, texte: '{}' });
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: h.jobId }, deps())).toMatchObject({ ok: false, code: 'BUDGET_EXCEEDED' });
    expect(lireMarqueurControleVision((await job(h.jobId)).result)).toBeNull();
    const t = await jobLivre(base(), ids, cat);
    await db.update(schema.studioJobs).set({ qualityStatus: 'rejected' }).where(eq(schema.studioJobs.id, t.jobId));
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: t.jobId }, deps())).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    expect(srv.requetes()).toBe(0);
  });
});
