import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L3 · worker durable, au RÉSULTAT en base (pglite, migrations réelles) avec
 * le fournisseur et le stockage SIMULÉS (aucun réseau, aucune dépense).
 *
 * COST-06 crash avant soumission · COST-07 crash après soumission ·
 * COST-08 webhooks dupliqués et inversés · COST-09 annuler avant/après ·
 * COST-10 échec qualité · COST-11 persistance échouée · échec certain ·
 * résultat illisible.
 *
 * Chaque cas compte ce qui SORT : état du job, tentatives, lignes du registre
 * studio, lignes du registre de crédits (même `ref_id`), solde de l'espace,
 * médias reliés, nombre de requêtes payantes créées chez le fournisseur.
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

import { randomUUID } from 'node:crypto';
import { db, schema, eq, inArray } from '@tiktrends/db';
import { CREDIT_COSTS, inspecterMedia, type FournisseurStudio } from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe, poserSolde, solde, projetTest, banc, secondWorker, jusquAuBout, etatEnBase } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile, annulerJob, etatJob, deciderQualite } from '../lib/studios/execution/commandes';
import { MoteurStudio } from '../../workers/src/studios/moteur';
import { DecodeurSharp } from '../../workers/src/studios/decodeur';
import { FournisseurSimule, StockageSimule, DRAPEAU_SIMULE, SimulationInterdite, signerWebhookSimule } from '../../../packages/integrations/src/studios-simule';

const ids = etat.ids;
const IMAGE = CREDIT_COSTS.image;
const SOLDE = 1000;
let projet = { projectId: '', versionId: '' };

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, SOLDE);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
});

/** Un job approuvé, en file, avec sa réserve et son débit. */
async function jobEnFile(): Promise<string> {
  const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
  if (!d.ok) throw new Error(d.code);
  const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `k-${d.devis.id}` }, { illimite: false });
  if (!r.ok) throw new Error(r.code);
  return r.job.id;
}

/** Aucun job ne doit traîner en file d'un cas à l'autre. */
beforeEach(async () => {
  const restants = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.state, 'queued'));
  expect(restants.map((j) => j.id), 'un job est resté en file').toEqual([]);
});

describe('adaptateur simulé · jamais en production, jamais sans drapeau', () => {
  it('refuse NODE_ENV=production, refuse sans drapeau explicite', () => {
    expect(() => new FournisseurSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'production' } })).toThrow(SimulationInterdite);
    expect(() => new FournisseurSimule({ drapeau: 'oui', env: { NODE_ENV: 'test' } })).toThrow(/drapeau/);
    expect(() => new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'production' } })).toThrow(SimulationInterdite);
  });
});

describe('chemin nominal · un job livré, réglé une fois, média simulé marqué comme tel', () => {
  it('queued → claimed → running → persisting → completed ; fichier décodé, relu, relié', async () => {
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const w = banc(db);
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    const e = await etatEnBase(db, id);
    expect(w.journal.filter((x) => x.type === 'transition' && x.jobId === id).map((x) => x.type === 'transition' && x.vers))
      .toEqual(['claimed', 'running', 'persisting', 'completed']);
    expect(e.assets.length).toBe(1);
    const a = e.assets[0]!;
    expect(a).toMatchObject({ storageState: 'stored', mime: 'image/png', width: 8, height: 8, origin: 'generated' });
    expect(a.storageKey.startsWith('simule/')).toBe(true);
    expect(a.rights).toMatchObject({ simule: true });
    expect(inspecterMedia(w.stockage.fichiers.get(a.storageKey)!)).toMatchObject({ mime: 'image/png' });
    expect((e.job.result as { assets: Record<string, string> }).assets).toEqual({ 'keyframe:s_ouverture': a.id });
    expect([e.reserves, e.reglements]).toEqual([1, 1]);
    expect(e.violations).toEqual([]);
    expect(e.outbox.map((o) => o.topic).sort()).toEqual(['studio.job.completed', 'studio.job.queued']);
    expect(await solde(db, ids.wsA)).toBe(s0);
  });
});

describe('COST-06 · crash du worker APRÈS réservation, AVANT soumission', () => {
  it('reprise unique : bail expiré ⇒ retour en file, une seule réserve, une seule requête, un seul règlement', async () => {
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const A = banc(db, { workerId: 'worker-A' });
    const pris = await A.moteur.reclamer();
    expect(pris?.id).toBe(id);
    // A « meurt » ici · B passe avant l'expiration du bail : il ne touche à rien,
    // même en visant le job directement (le bail valide d'A est respecté en base).
    const B = secondWorker(db, A, 'worker-B');
    await B.tour();
    expect(await B.etape(pris!)).toBe(false);
    expect((await etatEnBase(db, id)).job).toMatchObject({ state: 'claimed', leaseOwner: 'worker-A' });
    expect(A.fournisseur.soumissions).toBe(0);

    A.avancer(31_000);
    expect(await jusquAuBout(db, B, id)).toBe('completed');
    // A revient d'entre les morts avec sa copie périmée : le compare-and-set le refuse.
    expect(await A.moteur.etape(pris!)).toBe(false);

    const e = await etatEnBase(db, id);
    expect(e.tentatives.map((t) => [t.n, t.workerId, t.state])).toEqual([[1, 'worker-A', 'abandoned'], [2, 'worker-B', 'succeeded']]);
    expect(e.tentatives[0]!.providerIdempotencyKey).toBeNull();
    expect(A.fournisseur.soumissions).toBe(1);
    expect([e.reserves, e.reglements]).toEqual([1, 1]);
    expect(e.violations).toEqual([]);
    expect(e.credits.map((c) => c.delta)).toEqual([-IMAGE]);
    expect(await solde(db, ids.wsA)).toBe(s0);
    expect(A.journal.filter((x) => x.type === 'transition' && x.jobId === id).map((x) => x.type === 'transition' && `${x.de}>${x.vers}`))
      .toEqual(['queued>claimed', 'claimed>queued', 'queued>claimed', 'claimed>running', 'running>persisting', 'persisting>completed']);
  });
});

describe('COST-07 · crash APRÈS soumission · réconciliation, jamais de resoumission aveugle', () => {
  it('réponse perdue, fournisseur qui retrouve par clé ⇒ requête retrouvée, 1 seule requête, livré', async () => {
    const id = await jobEnFile();
    const w = banc(db, { rechercheParCle: true });
    w.fournisseur.prochaine('reponse_perdue');
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    expect([w.fournisseur.soumissions, w.fournisseur.appelsSoumettre]).toEqual([1, 1]);
    const e = await etatEnBase(db, id);
    expect(e.job.providerRequestId).toBe([...w.fournisseur.requetes.keys()][0]);
    expect(e.reglements).toBe(1);
  });

  it('réponse perdue SANS recherche possible ⇒ reconciliation_required, aucune resoumission, aucun remboursement annoncé ; un webhook signé portant la clé réconcilie', async () => {
    const id = await jobEnFile();
    const secret = `secret-test-${randomUUID()}`;
    const w = banc(db, { rechercheParCle: false, secret });
    w.fournisseur.prochaine('reponse_perdue');
    expect(await jusquAuBout(db, w.moteur, id)).toBe('reconciliation_required');
    for (let i = 0; i < 5; i++) await w.moteur.tour();
    let e = await etatEnBase(db, id);
    expect(e.job.state).toBe('reconciliation_required');
    expect([w.fournisseur.soumissions, w.fournisseur.appelsSoumettre]).toEqual([1, 1]);
    expect(e.tentatives.map((t) => t.state)).toEqual(['uncertain']);
    expect([e.reserves, e.reglements, e.liberations]).toEqual([1, 0, 0]);
    expect(e.credits.filter((c) => c.delta > 0)).toEqual([]);
    const v = await etatJob(ctxDe(ids, 'ua'), { jobId: id });
    expect(v.ok && v.vue.message).toMatch(/rien n’est relancé/);
    expect(v.ok && v.vue.creditsRendus).toBeNull();

    const requestId = [...w.fournisseur.requetes.keys()][0]!;
    const maintenant = Math.floor(w.horloge().getTime() / 1000);
    const corps = JSON.stringify(w.fournisseur.evenement(requestId, 'succeeded', maintenant));
    expect(await w.moteur.recevoirWebhook(signerWebhookSimule(corps, maintenant, secret), corps)).toEqual({ status: 200, action: 'persister' });
    e = await etatEnBase(db, id);
    expect(e.job.state).toBe('completed');
    expect(e.job.providerRequestId).toBe(requestId);
    expect(w.fournisseur.soumissions).toBe(1);
    expect([e.reserves, e.reglements]).toEqual([1, 1]);
    expect(e.violations).toEqual([]);
    expect(w.journal.some((x) => x.type === 'transition' && x.jobId === id && x.de === 'reconciliation_required' && x.vers === 'persisting' && x.acteur === 'reconciliateur')).toBe(true);
  });

  it('crash après soumission ACCEPTÉE (requête connue) ⇒ un autre worker reprend le suivi par l’identifiant, sans resoumettre', async () => {
    const id = await jobEnFile();
    const A = banc(db, { workerId: 'worker-A', etapes: 2 });
    await A.moteur.tour();
    expect((await etatEnBase(db, id)).job).toMatchObject({ state: 'running', leaseOwner: 'worker-A' });
    A.avancer(31_000);
    const B = secondWorker(db, A, 'worker-B');
    expect(await jusquAuBout(db, B, id)).toBe('completed');
    expect([A.fournisseur.soumissions, A.fournisseur.appelsSoumettre]).toEqual([1, 1]);
    expect((await etatEnBase(db, id)).reglements).toBe(1);
  });

  it('crash ENTRE la clé posée et la réponse (soumission possible, non prouvée), sans recherche ⇒ réconciliation, zéro nouvelle soumission', async () => {
    const id = await jobEnFile();
    const A = banc(db, { workerId: 'worker-A', rechercheParCle: false });
    const bloque: FournisseurStudio = {
      nom: 'simule', simule: true, rechercheParCle: false,
      soumettre: () => new Promise(() => {}), // l'appel part et le worker meurt avant la réponse
      statut: (r) => A.fournisseur.statut(r), telecharger: (r, x) => A.fournisseur.telecharger(r, x),
    };
    const mourant = new MoteurStudio({ base: db, fournisseur: bloque, stockage: A.stockage, decodeur: new DecodeurSharp(), workerId: 'worker-mourant', bailMs: 30_000, horloge: A.horloge });
    const j = await mourant.reclamer();
    void mourant.etape(j!);
    for (let i = 0; i < 50 && (await etatEnBase(db, id)).job.state !== 'running'; i++) await new Promise((r) => setTimeout(r, 5));
    expect((await etatEnBase(db, id)).tentatives[0]!.providerIdempotencyKey).toMatch(/^tt-studio-/);
    A.avancer(31_000);
    expect(await jusquAuBout(db, A.moteur, id)).toBe('reconciliation_required');
    expect(A.fournisseur.appelsSoumettre).toBe(0);
    const e = await etatEnBase(db, id);
    expect([e.reserves, e.reglements, e.liberations]).toEqual([1, 0, 0]);
  });
});

describe('COST-08 · webhooks signés, dupliqués et inversés', () => {
  it('succès, progrès en retard, succès dupliqué, échec contradictoire ⇒ état final stable, un seul règlement, un seul média', async () => {
    const id = await jobEnFile();
    const secret = `secret-test-${randomUUID()}`;
    const w = banc(db, { etapes: 1000, secret });
    await w.moteur.tour();
    const requestId = (await etatEnBase(db, id)).job.providerRequestId!;
    w.fournisseur.terminer(requestId);
    const t = Math.floor(w.horloge().getTime() / 1000);
    const envoyer = (type: 'progress' | 'succeeded' | 'failed', evId?: string) => {
      const corps = JSON.stringify(w.fournisseur.evenement(requestId, type, t, evId));
      return w.moteur.recevoirWebhook(signerWebhookSimule(corps, t, secret), corps);
    };
    const [s1, s1bis] = await Promise.all([envoyer('succeeded', 'evt-ok'), envoyer('succeeded', 'evt-ok')]);
    expect([s1.status, s1bis.status]).toEqual([200, 200]);
    expect([s1.action, s1bis.action].sort()).toContain('persister');
    expect((await envoyer('progress', 'evt-progres-ancien')).action).toBe('ignorer');
    expect((await envoyer('succeeded', 'evt-ok')).action).toBe('ignorer');
    expect((await envoyer('failed', 'evt-contradictoire')).action).toBe('ignorer');
    for (let i = 0; i < 3; i++) await w.moteur.tour();
    const e = await etatEnBase(db, id);
    expect(e.job.state).toBe('completed');
    expect([e.reserves, e.reglements]).toEqual([1, 1]);
    expect(e.assets.length).toBe(1);
    expect(e.violations).toEqual([]);
    expect(w.fournisseur.soumissions).toBe(1);
  });

  it('signature fausse, horodatage rejoué, corps illisible, requête inconnue ⇒ refusés, rien ne bouge', async () => {
    const id = await jobEnFile();
    const secret = `secret-test-${randomUUID()}`;
    const w = banc(db, { etapes: 1000, secret });
    await w.moteur.tour();
    const requestId = (await etatEnBase(db, id)).job.providerRequestId!;
    w.fournisseur.terminer(requestId);
    const t = Math.floor(w.horloge().getTime() / 1000);
    const corps = JSON.stringify(w.fournisseur.evenement(requestId, 'succeeded', t));
    expect((await w.moteur.recevoirWebhook(signerWebhookSimule(corps, t, 'mauvais-secret'), corps)).status).toBe(401);
    const vieux = t - 600;
    const corpsVieux = JSON.stringify(w.fournisseur.evenement(requestId, 'succeeded', vieux));
    expect(await w.moteur.recevoirWebhook(signerWebhookSimule(corpsVieux, vieux, secret), corpsVieux)).toEqual({ status: 401, action: 'rejeu refusé (trop_ancien)' });
    expect((await w.moteur.recevoirWebhook(signerWebhookSimule('{pas du json', t, secret), '{pas du json')).status).toBe(400);
    const inconnu = JSON.stringify({ id: 'e', type: 'succeeded', requestId: 'sim_inconnue', emisA: t });
    expect(await w.moteur.recevoirWebhook(signerWebhookSimule(inconnu, t, secret), inconnu)).toEqual({ status: 202, action: 'ignorer' });
    const sansSecret = banc(db).moteur;
    expect((await sansSecret.recevoirWebhook(signerWebhookSimule(corps, t, secret), corps)).status).toBe(503);
    expect((await etatEnBase(db, id)).job.state).toBe('running');
    // On termine proprement ce job pour les cas suivants.
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
  });
});

describe('COST-09 · annuler avant puis après démarrage', () => {
  it('avant démarrage ⇒ aucune soumission, annulé, réserve rendue avec la même référence', async () => {
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const a = await annulerJob(ctxDe(ids, 'ua'), { jobId: id });
    expect(a.ok && a.vue.etat).toBe('cancel_requested');
    expect(a.ok && a.vue.message).toMatch(/rien n’était parti/);
    expect(a.ok && a.vue.creditsRendus).toBeNull();
    const w = banc(db);
    expect(await jusquAuBout(db, w.moteur, id)).toBe('cancelled');
    expect(w.fournisseur.appelsSoumettre).toBe(0);
    const e = await etatEnBase(db, id);
    expect(e.registre.map((m) => [m.kind, m.credits]).sort()).toEqual([['release', IMAGE], ['reserve', IMAGE], ['settle', 0]]);
    expect(e.credits.map((c) => [c.delta, c.refId]).sort()).toEqual([[-IMAGE, `studio:job:${id}:reserve`], [IMAGE, `studio:job:${id}:release`]]);
    expect(await solde(db, ids.wsA)).toBe(s0 + IMAGE);
    const v = await etatJob(ctxDe(ids, 'ua'), { jobId: id });
    expect(v.ok && v.vue.message).toBe(`Annulé · ${IMAGE} crédits rendus.`);
  });

  it('après démarrage, annulation confirmée sans frais ⇒ annulé, réserve rendue ; pas de promesse avant confirmation', async () => {
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const w = banc(db, { etapes: 1000, annulation: 'sans_frais' });
    await w.moteur.tour();
    expect((await etatEnBase(db, id)).job.state).toBe('running');
    const a = await annulerJob(ctxDe(ids, 'ua'), { jobId: id });
    expect(a.ok && a.vue.message).toMatch(/peut encore facturer/);
    expect(a.ok && a.vue.creditsRendus).toBeNull();
    expect(await jusquAuBout(db, w.moteur, id)).toBe('cancelled');
    const e = await etatEnBase(db, id);
    expect(w.fournisseur.soumissions).toBe(1);
    expect([e.reglements, e.liberations]).toEqual([1, 1]);
    expect(await solde(db, ids.wsA)).toBe(s0 + IMAGE);
    expect(e.violations).toEqual([]);
  });

  it('après démarrage, résultat tardif (annulation trop tard) ⇒ résultat conservé et réglé, aucun remboursement inventé', async () => {
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const w = banc(db, { etapes: 1000, annulation: 'trop_tard' });
    await w.moteur.tour();
    await annulerJob(ctxDe(ids, 'ua'), { jobId: id });
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    const e = await etatEnBase(db, id);
    expect((e.job.result as { annulationDemandee?: boolean }).annulationDemandee).toBe(true);
    expect(e.assets.length).toBe(1);
    expect(e.registre.find((m) => m.kind === 'settle')!.credits).toBe(IMAGE);
    expect(e.credits.filter((c) => c.delta > 0)).toEqual([]);
    expect(await solde(db, ids.wsA)).toBe(s0);
  });
});

describe('COST-10 · fournisseur réussi mais produit faux', () => {
  it('completed + requires_review, aucune relance payante, aucun nouveau job ; le rejet ne coûte rien', async () => {
    const id = await jobEnFile();
    const w = banc(db);
    w.fournisseur.prochaine('produit_faux');
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    for (let i = 0; i < 3; i++) await w.moteur.tour();
    const e = await etatEnBase(db, id);
    expect(e.job.qualityStatus).toBe('requires_review');
    expect(w.fournisseur.soumissions).toBe(1);
    const n = (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.quoteId, e.job.quoteId!))).length;
    expect(n).toBe(1);
    const v = await etatJob(ctxDe(ids, 'ua'), { jobId: id });
    expect(v.ok && v.vue.message).toMatch(/à relire/);
    const registreAvant = (await db.select().from(schema.studioBudgetLedger)).length;
    const r = await deciderQualite(ctxDe(ids, 'ua'), { jobId: id, raison: 'mauvais flacon' }, 'rejected');
    expect(r.ok && r.qualite).toBe('rejected');
    expect((await db.select().from(schema.studioBudgetLedger)).length).toBe(registreAvant);
    expect(w.fournisseur.soumissions).toBe(1);
  });
});

describe('COST-11 · fournisseur réussi, stockage indisponible', () => {
  it('pas completed tant que le fichier n’est pas déposé ET relu ; reprise de finalisation sans régénération', async () => {
    const id = await jobEnFile();
    const w = banc(db);
    w.stockage.indisponible = true;
    for (let i = 0; i < 4; i++) await w.moteur.tour();
    let e = await etatEnBase(db, id);
    expect(e.job.state).toBe('persisting');
    expect((e.job.error as { code?: string }).code).toBe('PERSISTENCE_FAILED');
    expect(e.assets).toEqual([]);
    expect([e.reglements, e.liberations]).toEqual([0, 0]);
    const v = await etatJob(ctxDe(ids, 'ua'), { jobId: id });
    expect(v.ok && v.vue.etat).toBe('persisting');

    w.stockage.indisponible = false;
    // Reprise par un AUTRE worker : seule la finalisation est rejouée.
    const B = secondWorker(db, w, 'worker-B');
    expect(await jusquAuBout(db, B, id)).toBe('completed');
    e = await etatEnBase(db, id);
    expect([w.fournisseur.soumissions, w.fournisseur.appelsSoumettre]).toEqual([1, 1]);
    expect(e.assets.length).toBe(1);
    expect(e.job.error).toBeNull();
    expect(e.reglements).toBe(1);
    expect(e.violations).toEqual([]);
  });

  it('stockage qui acquitte sans conserver ⇒ la relecture le voit, pas completed', async () => {
    const id = await jobEnFile();
    const w = banc(db);
    w.stockage.perteSilencieuse = true;
    for (let i = 0; i < 4; i++) await w.moteur.tour();
    const e = await etatEnBase(db, id);
    expect(e.job.state).toBe('persisting');
    expect((e.job.error as { motif?: string }).motif).toMatch(/relecture/);
    expect(e.assets).toEqual([]);
    w.stockage.perteSilencieuse = false;
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    expect(w.fournisseur.soumissions).toBe(1);
  });

  it('résultat illisible (pas une image) ⇒ failed, crédits rendus, coût fournisseur réglé', async () => {
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const w = banc(db);
    w.fournisseur.prochaine('resultat_illisible');
    expect(await jusquAuBout(db, w.moteur, id)).toBe('failed');
    const e = await etatEnBase(db, id);
    expect(e.assets).toEqual([]);
    const settle = e.registre.find((m) => m.kind === 'settle')!;
    expect([settle.credits, Number(settle.usdMicros)]).toEqual([0, 39_000]);
    expect(await solde(db, ids.wsA)).toBe(s0 + IMAGE);
    expect(e.violations).toEqual([]);
  });
});

describe('recette du 8 octobre · un fichier tronqué n’est jamais livré', () => {
  it('téléchargement coupé à mi-fichier ⇒ ni completed ni média ni règlement ; le fichier complet relu au tour suivant ⇒ livré, réglé une fois', async () => {
    const id = await jobEnFile();
    const w = banc(db);
    w.fournisseur.prochaine('resultat_tronque');
    w.fournisseur.troncatures = 2;
    // Deux tours au plus loin : le fichier reste incomplet, rien n'est livré.
    for (let i = 0; i < 6 && (await etatEnBase(db, id)).job.state !== 'persisting'; i++) await w.moteur.tour();
    await w.moteur.tour();
    let e = await etatEnBase(db, id);
    expect(e.job.state, 'un fichier tronqué a terminé le job').toBe('persisting');
    expect(e.assets, 'un fichier tronqué a été enregistré comme média').toEqual([]);
    expect(e.registre.filter((m) => m.kind === 'settle')).toEqual([]);
    expect((e.job.error as { code?: string } | null)?.code).toBe('PERSISTENCE_FAILED');
    // Le transfert finit par aboutir : livré, une seule requête, un seul règlement.
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    e = await etatEnBase(db, id);
    expect(e.assets).toHaveLength(1);
    expect(inspecterMedia(w.stockage.fichiers.get(e.assets[0]!.storageKey)!)).toMatchObject({ mime: 'image/png', largeur: 8, hauteur: 8 });
    expect(e.registre.filter((m) => m.kind === 'settle')).toHaveLength(1);
    expect(w.fournisseur.requetes.size).toBe(1);
    expect(e.violations).toEqual([]);
  });
});

describe('recette du 8 octobre · 50 réconciliations n’affament pas le suivi des autres jobs', () => {
  it('50 jobs en réconciliation sans preuve (plus anciens) + 1 job lancé ⇒ le job lancé est suivi et livré', async () => {
    const modele = await jobEnFile();
    const [m] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, modele));
    // Le modèle sert de gabarit puis part normalement au bout.
    const w = banc(db, { rechercheParCle: false });
    expect(await jusquAuBout(db, w.moteur, modele)).toBe('completed');
    const bloques = Array.from({ length: 50 }, (_, i) => ({
      workspaceId: m!.workspaceId, brandId: m!.brandId, projectId: m!.projectId, projectVersionId: m!.projectVersionId,
      operation: m!.operation, state: 'reconciliation_required' as const, idempotencyKey: `famine-${randomUUID()}-${i}`,
      inputHash: m!.inputHash, snapshot: m!.snapshot, updatedAt: new Date('2020-01-01T00:00:00Z'), createdAt: new Date('2020-01-01T00:00:00Z'),
    }));
    const ins = await db.insert(schema.studioJobs).values(bloques).returning({ id: schema.studioJobs.id });
    try {
      const id = await jobEnFile();
      for (let i = 0; i < 8; i++) await w.moteur.tour();
      const e = await etatEnBase(db, id);
      expect(e.job.state, 'le job lancé n’a jamais été suivi : les 50 réconciliations prennent toutes les places').toBe('completed');
      expect(e.reglements).toBe(1);
      // Les réconciliations sans preuve restent où elles sont : aucune soumission, aucun règlement inventé.
      const encore = await db.select({ s: schema.studioJobs.state }).from(schema.studioJobs).where(inArray(schema.studioJobs.id, ins.map((x) => x.id)));
      expect(new Set(encore.map((x) => x.s))).toEqual(new Set(['reconciliation_required']));
    } finally {
      await db.delete(schema.studioJobs).where(inArray(schema.studioJobs.id, ins.map((x) => x.id)));
    }
  });
});

describe('échec certain du fournisseur', () => {
  it('refus immédiat ⇒ failed, rien facturé, tout rendu, aucune relance', async () => {
    const id = await jobEnFile();
    const s0 = await solde(db, ids.wsA);
    const w = banc(db);
    w.fournisseur.prochaine('echec_certain');
    expect(await jusquAuBout(db, w.moteur, id)).toBe('failed');
    for (let i = 0; i < 3; i++) await w.moteur.tour();
    const e = await etatEnBase(db, id);
    expect(w.fournisseur.appelsSoumettre).toBe(1);
    expect(e.registre.find((m) => m.kind === 'settle')).toMatchObject({ credits: 0, usdMicros: 0 });
    expect(await solde(db, ids.wsA)).toBe(s0 + IMAGE);
    expect(e.violations).toEqual([]);
  });
});
