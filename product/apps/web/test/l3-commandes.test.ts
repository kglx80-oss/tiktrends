import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L3 · commandes d'exécution, au RÉSULTAT en base (pglite, migrations réelles).
 *
 * COST-01 double clic · COST-02 deux variantes · COST-04 devis périmé ·
 * COST-05 présenter sans appliquer · solde insuffisant · plafond dollars ·
 * portée · reprise après fermeture du navigateur (VIDEO-13 préparé) ·
 * acceptation/rejet sans coût.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
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
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { CREDIT_COSTS } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe, poserSolde, solde, projetTest, banc, jusquAuBout, etatEnBase } from './l3-harnais';
import { estimerImpact, creerDevis, approuverEtMettreEnFile, etatJob, annulerJob, deciderQualite } from '../lib/studios/execution/commandes';
import * as actions from '../app/actions/studios/execution';
import { enregistrerDocument } from '../app/actions/studios/projets';

const ids = etat.ids;
const IMAGE = CREDIT_COSTS.image;
let projet = { projectId: '', versionId: '' };

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 100);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
});

const comptes = async () => ({
  jobs: (await db.select().from(schema.studioJobs)).length,
  approbations: (await db.select().from(schema.studioApprovals)).length,
  registre: (await db.select().from(schema.studioBudgetLedger)).length,
  credits: (await db.select().from(schema.creditLedger)).length,
  outbox: (await db.select().from(schema.studioOutbox)).length,
  assets: (await db.select().from(schema.studioAssets)).length,
  solde: await solde(db, ids.wsA),
});

async function devis(operations = ['keyframe:s_ouverture']) {
  const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations, variante: true });
  if (!d.ok) throw new Error(`${d.code} ${d.message}`);
  return d.devis;
}

describe('COST-05 · présenter sans appliquer · aucun job, aucune mutation, aucune consommation', () => {
  it('estimerImpact puis creerDevis (y compris une ligne incluse à 0) ⇒ pas de job, solde et médias intacts', async () => {
    const avant = await comptes();
    const e = await estimerImpact(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['keyframe:s_ouverture', 'composition'] });
    expect(e.ok, JSON.stringify(e)).toBe(true);
    if (!e.ok) return;
    expect(e.devisIndicatif).toMatchObject({ ok: true, totalCredits: IMAGE });
    expect(await comptes(), 'estimerImpact a écrit').toEqual(avant);

    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['keyframe:s_ouverture', 'composition'] });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.devis.lignes.find((l) => l.operation === 'composition')).toMatchObject({ credits: 0, inclus: true });
    expect(d.devis.maximumCredits).toBe(IMAGE);
    const apres = await comptes();
    expect({ ...apres }).toEqual({ ...avant });
    expect((await db.select().from(schema.studioQuotes)).length).toBeGreaterThan(0);
  });

  it('une opération sans tarif (voix) ⇒ UNSUPPORTED_CAPABILITY, aucun devis', async () => {
    const n = (await db.select().from(schema.studioQuotes)).length;
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['voix:s_ouverture'] });
    expect(!d.ok && d.code).toBe('UNSUPPORTED_CAPABILITY');
    expect((await db.select().from(schema.studioQuotes)).length).toBe(n);
  });
});

describe('COST-01 · double clic, même clé, en parallèle', () => {
  it('deux approbations simultanées ⇒ 1 job, 1 approbation, 1 réserve, 1 débit ; puis 1 règlement', async () => {
    const q = await devis();
    const avant = await solde(db, ids.wsA);
    const entree = { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `clic-${q.id}` };
    const [a, b] = await Promise.all([
      approuverEtMettreEnFile(ctxDe(ids, 'ua'), entree, { illimite: false }),
      approuverEtMettreEnFile(ctxDe(ids, 'ua'), entree, { illimite: false }),
    ]);
    expect(a.ok && b.ok, JSON.stringify([a, b])).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.job.id).toBe(b.job.id);
    expect([a.deja, b.deja].sort()).toEqual([false, true]);
    const jobs = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.quoteId, q.id));
    expect(jobs.length).toBe(1);
    expect((await db.select().from(schema.studioApprovals).where(eq(schema.studioApprovals.quoteId, q.id))).length).toBe(1);
    const e0 = await etatEnBase(db, a.job.id);
    expect(e0.reserves).toBe(1);
    expect(e0.credits.map((c) => [c.delta, c.refId])).toEqual([[-IMAGE, `studio:job:${a.job.id}:reserve`]]);
    expect(await solde(db, ids.wsA)).toBe(avant - IMAGE);
    expect(e0.outbox.map((o) => o.topic)).toEqual(['studio.job.queued']);

    // Troisième clic après coup : même job, toujours une seule réserve.
    const c = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), entree, { illimite: false });
    expect(c.ok && c.job.id).toBe(a.job.id);

    const w = banc(db);
    expect(await jusquAuBout(db, w.moteur, a.job.id)).toBe('completed');
    const e1 = await etatEnBase(db, a.job.id);
    expect([e1.reserves, e1.reglements]).toEqual([1, 1]);
    // Rien de rendu en crédits (livré au prix devisé) ; seule la marge de dollars non facturée est libérée.
    expect(e1.registre.filter((m) => m.kind === 'release').map((m) => m.credits)).toEqual([0]);
    expect(e1.credits.filter((c) => c.delta > 0)).toEqual([]);
    expect(e1.violations).toEqual([]);
    expect(w.fournisseur.soumissions).toBe(1);
    expect(await solde(db, ids.wsA)).toBe(avant - IMAGE);
  });

  it('même clé, AUTRE devis ⇒ VERSION_CONFLICT, rien créé', async () => {
    const q1 = await devis();
    const q2 = await devis();
    const cle = `clic-conflit-${q1.id}`;
    const r1 = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q1.id, inputHash: q1.inputHash, creditsAnnonces: q1.maximumCredits, idempotencyKey: cle }, { illimite: false });
    expect(r1.ok).toBe(true);
    const avant = await comptes();
    const r2 = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q2.id, inputHash: q2.inputHash, creditsAnnonces: q2.maximumCredits, idempotencyKey: cle }, { illimite: false });
    expect(!r2.ok && r2.code).toBe('VERSION_CONFLICT');
    expect(await comptes()).toEqual(avant);
  });
});

describe('COST-02 · deux variantes volontaires aux mêmes entrées', () => {
  it('deux devis, deux clés ⇒ deux jobs distincts, deux réserves · pas de déduplication abusive', async () => {
    const q1 = await devis();
    const q2 = await devis();
    expect(q1.id).not.toBe(q2.id);
    expect(q1.inputHash).toBe(q2.inputHash);
    const avant = await solde(db, ids.wsA);
    const r1 = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q1.id, inputHash: q1.inputHash, creditsAnnonces: q1.maximumCredits, idempotencyKey: `var-1-${q1.id}` }, { illimite: false });
    const r2 = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q2.id, inputHash: q2.inputHash, creditsAnnonces: q2.maximumCredits, idempotencyKey: `var-2-${q2.id}` }, { illimite: false });
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.job.id).not.toBe(r2.job.id);
    expect((await etatEnBase(db, r1.job.id)).reserves + (await etatEnBase(db, r2.job.id)).reserves).toBe(2);
    expect(await solde(db, ids.wsA)).toBe(avant - 2 * IMAGE);
  });

  it('le MÊME devis approuvé deux fois avec deux clés ⇒ le second est refusé (une approbation par devis)', async () => {
    const q = await devis();
    const r1 = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `meme-devis-1-${q.id}` }, { illimite: false });
    expect(r1.ok).toBe(true);
    const avant = await comptes();
    const r2 = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `meme-devis-2-${q.id}` }, { illimite: false });
    expect(!r2.ok && r2.code).toBe('VERSION_CONFLICT');
    expect(!r2.ok && r2.message).toMatch(/déjà été approuvé/);
    expect(await comptes()).toEqual(avant);
  });
});

describe('COST-04 · devis périmé · brief, prix, version, expiration', () => {
  it('prix affiché différent, empreinte différente, devis expiré ⇒ refus, rien écrit', async () => {
    const q = await devis();
    const avant = await comptes();
    const base = { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits };
    const prix = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { ...base, creditsAnnonces: q.maximumCredits - 1, idempotencyKey: `prix-${q.id}` }, { illimite: false });
    expect(!prix.ok && [prix.code, prix.message]).toEqual(['VERSION_CONFLICT', expect.stringMatching(/prix/)]);
    const hash = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { ...base, inputHash: 'f'.repeat(64), idempotencyKey: `hash-${q.id}` }, { illimite: false });
    expect(!hash.ok && hash.code).toBe('VERSION_CONFLICT');
    const tard = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { ...base, idempotencyKey: `tard-${q.id}` }, { illimite: false, maintenant: new Date(Date.parse(q.expiresAt) + 1) });
    expect(!tard.ok && tard.code).toBe('QUOTE_EXPIRED');
    expect(await comptes()).toEqual(avant);
  });

  it('brief modifié après le devis (nouvelle version) ⇒ refus, puis un nouveau devis passe', async () => {
    const p = await projetTest(db, ids, ids.brandA1, ids.ua);
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: p.projectId, operations: ['keyframe:s_ouverture'] });
    if (!d.ok) throw new Error(d.code);
    etat.session = session(ids, 'ua');
    const m = await enregistrerDocument({ projectId: p.projectId, baseVersionId: p.versionId, changes: [{ op: 'replace', path: '/brief/objectif', newValue: 'autre objectif', reason: 'brief' }] });
    expect(m.ok, JSON.stringify(m)).toBe(true);
    const avant = await comptes();
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `brief-${d.devis.id}` }, { illimite: false });
    expect(!r.ok && [r.code, r.message]).toEqual(['VERSION_CONFLICT', expect.stringMatching(/projet a changé/)]);
    expect(await comptes()).toEqual(avant);
    const d2 = await creerDevis(ctxDe(ids, 'ua'), { projectId: p.projectId, operations: ['keyframe:s_ouverture'] });
    if (!d2.ok) throw new Error(d2.code);
    expect(d2.devis.inputHash).not.toBe(d.devis.inputHash);
    const r2 = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d2.devis.id, inputHash: d2.devis.inputHash, creditsAnnonces: d2.devis.maximumCredits, idempotencyKey: `brief2-${d2.devis.id}` }, { illimite: false });
    expect(r2.ok, JSON.stringify(r2)).toBe(true);
  });
});

describe('budget · solde insuffisant, plafond dollars, compte illimité', () => {
  it('solde insuffisant ⇒ BUDGET_EXCEEDED et RIEN (ni approbation, ni job, ni réserve, ni débit)', async () => {
    const q = await devis();
    const s = await solde(db, ids.wsA);
    await poserSolde(db, ids.wsA, IMAGE - 1);
    const avant = await comptes();
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `pauvre-${q.id}` }, { illimite: false });
    expect(!r.ok && r.code).toBe('BUDGET_EXCEEDED');
    expect(await comptes()).toEqual(avant);
    await poserSolde(db, ids.wsA, s);
  });

  it('plafond dollars restant insuffisant ⇒ BUDGET_EXCEEDED, rien écrit', async () => {
    const q = await devis();
    const avant = await comptes();
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `dollars-${q.id}` }, { illimite: false, plafond: { capUsd: 10, depenseUsd: 9.99, bloque: false } });
    expect(!r.ok && r.code).toBe('BUDGET_EXCEEDED');
    expect(await comptes()).toEqual(avant);
  });

  it('compte illimité ⇒ réserve à 0 crédit (dollars réservés), aucun débit', async () => {
    const q = await devis();
    const s = await solde(db, ids.wsA);
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `illimite-${q.id}` }, { illimite: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = await etatEnBase(db, r.job.id);
    expect(e.registre.map((m) => [m.kind, m.credits, Number(m.usdMicros)])).toEqual([['reserve', 0, q.maximumUsdMicros]]);
    expect(e.credits).toEqual([]);
    expect(await solde(db, ids.wsA)).toBe(s);
  });
});

describe('portée et droits', () => {
  it('un autre espace ne voit ni le devis ni le job (NOT_FOUND neutre), un lecteur ne génère pas', async () => {
    const q = await devis();
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ub'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `intrus-${q.id}` }, { illimite: false });
    expect(!r.ok && [r.code, r.targetIds]).toEqual(['NOT_FOUND', []]);
    etat.session = session(ids, 'uv');
    const v = await actions.approuverEtMettreEnFile({ quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `lecteur-${q.id}` });
    expect(!v.ok && v.code).toBe('FORBIDDEN');
    const dv = await actions.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_fin'] });
    expect(!dv.ok && dv.code).toBe('FORBIDDEN');
    etat.session = session(ids, 'ur');
    const p2 = await projetTest(db, ids, ids.brandA2, ids.ua);
    const restreint = await actions.estimerImpact({ projectId: p2.projectId });
    expect(!restreint.ok && restreint.code).toBe('NOT_FOUND');
  });

  it('l’action passe par la garde et l’offre · un membre approuve via l’action serveur', async () => {
    etat.session = session(ids, 'ua');
    const d = await actions.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_fin'] });
    expect(d.ok, JSON.stringify(d)).toBe(true);
    if (!d.ok) return;
    const r = await actions.approuverEtMettreEnFile({ quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `action-${d.devis.id}` });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
});

describe('reprise après fermeture du navigateur (VIDEO-13 préparé)', () => {
  it('la clé du clic retrouve le même job et son progrès, sans nouveau débit', async () => {
    const q = await devis();
    const cle = `reprise-${q.id}`;
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: cle }, { illimite: false });
    if (!r.ok) throw new Error(r.code);
    const w = banc(db, { etapes: 3 });
    // D'autres jobs attendent en file : on tourne jusqu'à ce que le nôtre soit EN COURS chez le fournisseur.
    for (let i = 0; i < 10 && (await etatEnBase(db, r.job.id)).job.result === null; i++) await w.moteur.tour({ maxNouveaux: 20 });
    const s = await solde(db, ids.wsA);
    // « Fermeture » : le navigateur n'a plus que la clé.
    const e = await etatJob(ctxDe(ids, 'ua'), { idempotencyKey: cle });
    expect(e.ok && e.job.id).toBe(r.job.id);
    expect(e.ok && e.vue.etat).toBe('running');
    expect(e.ok && e.vue.progression).toBe(50);
    expect(e.ok && e.vue.message).toMatch(/tu peux fermer cette page/);
    const re = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: cle }, { illimite: false });
    expect(re.ok && [re.job.id, re.deja]).toEqual([r.job.id, true]);
    expect(await solde(db, ids.wsA)).toBe(s);
    expect((await etatEnBase(db, r.job.id)).reserves).toBe(1);
    const autre = await etatJob(ctxDe(ids, 'ub'), { idempotencyKey: cle });
    expect(!autre.ok && autre.code).toBe('NOT_FOUND');
  });

  it('etatJob est une lecture pure', async () => {
    const avant = await comptes();
    const [j] = await db.select().from(schema.studioJobs).limit(1);
    await etatJob(ctxDe(ids, 'ua'), { jobId: j!.id });
    expect(await comptes()).toEqual(avant);
  });
});

describe('accepter / rejeter · statut qualité seul, aucun coût', () => {
  it('accepter un média livré ne touche ni registre ni solde ; refusé tant que le job n’est pas completed', async () => {
    const q = await devis();
    const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `qualite-${q.id}` }, { illimite: false });
    if (!r.ok) throw new Error(r.code);
    const tot = await deciderQualite(ctxDe(ids, 'ua'), { jobId: r.job.id }, 'passed');
    expect(!tot.ok && tot.code).toBe('INVARIANT_CONFLICT');
    const w = banc(db);
    expect(await jusquAuBout(db, w.moteur, r.job.id)).toBe('completed');
    const avant = await comptes();
    const a = await deciderQualite(ctxDe(ids, 'ua'), { jobId: r.job.id, raison: 'bon produit' }, 'passed');
    expect(a.ok && a.qualite).toBe('passed');
    const apres = await comptes();
    expect({ ...apres }).toEqual({ ...avant });
    const [j] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, r.job.id));
    expect(j!.qualityStatus).toBe('passed');
    expect(w.fournisseur.soumissions).toBe(1);
  });
});

describe('annulerJob · commande', () => {
  it('idempotente sur un job terminé · aucune écriture', async () => {
    const [j] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.state, 'completed')).limit(1);
    const avant = await comptes();
    const r = await annulerJob(ctxDe(ids, 'ua'), { jobId: j!.id });
    expect(r.ok && r.vue.etat).toBe('completed');
    expect(await comptes()).toEqual(avant);
  });
});
