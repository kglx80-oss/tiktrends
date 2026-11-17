import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema, eq, sql } from '@tiktrends/db';
import {
  refsDuJob, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, OPERATION_JOB_STUDIO, violationsRegistreJob,
  ECHECS_ETAPE_MAX, reculEtapeMs,
  type SnapshotJob, type FournisseurStudio,
} from '@tiktrends/core';
import { MoteurStudio } from '../src/studios/moteur';
import { DecodeurSharp } from '../src/studios/decodeur';
import type { BaseStudio } from '../src/studios/types';
import { FournisseurSimule, StockageSimule, DRAPEAU_SIMULE } from '../../../packages/integrations/src/studios-simule';
import { pgMemoire } from './pg-memoire';

/**
 * I1 · un job fautif ne bloque plus la file. Avant, une exception levée par
 * l'étape d'UN job (ici, le suivi du fournisseur) remontait du tour entier ·
 * la boucle l'avalait, et le job fautif, en tête de file (`heartbeatAt asc
 * nulls first`), recommençait au tour suivant · plus AUCUN job neuf n'était
 * réclamé sur la plateforme. On lit le résultat en base (pglite, migrations
 * réelles), horloge pilotée, 0 $.
 */

let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const user = randomUUID();
let projet = '';
let version = '';

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core', creditsBalance: 100 });
  await base.insert(schema.users).values({ id: user, email: `${user}@w.test` });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B' });
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'image', title: 'P', ownerId: user }).returning();
  const c = contenuVide();
  const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId: ws, brandId: brand, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c), authorId: user }).returning();
  projet = p!.id;
  version = v!.id;
});

async function semerJob(o: { snapshotIllisible?: boolean } = {}): Promise<string> {
  const lignes = [{ operation: 'keyframe:s1', nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const h = 'c'.repeat(64);
  const [q] = await base.insert(schema.studioQuotes).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, impactPlanHash: h, inputHash: h, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: user }).returning();
  const [a] = await base.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: ws, brandId: brand, inputHash: h, approvedBy: user }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: version, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres: {} };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: h, snapshot: o.snapshotIllisible ? { v: 99 } : snapshot, createdBy: user }).returning();
  await base.update(schema.workspaces).set({ creditsBalance: sql`${schema.workspaces.creditsBalance} - 4` }).where(eq(schema.workspaces.id, ws));
  await base.update(schema.studioApprovals).set({ consumedAt: new Date(), consumedJobId: j!.id }).where(eq(schema.studioApprovals.id, a!.id));
  await base.insert(schema.studioBudgetLedger).values({ workspaceId: ws, brandId: brand, projectId: projet, jobId: j!.id, quoteId: q!.id, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(j!.id).reserve });
  return j!.id;
}

/** Le simulé, dont le suivi LÈVE (bogue, base qui casse) pour les requêtes désignées. */
function fournisseurFautif() {
  const sim = new FournisseurSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' }, etapes: 1_000 });
  const fautives = new Set<string>();
  const appels = new Map<string, number>();
  const f: FournisseurStudio = {
    nom: sim.nom, simule: sim.simule, rechercheParCle: sim.rechercheParCle,
    soumettre: (d) => sim.soumettre(d),
    statut: async (id) => {
      appels.set(id, (appels.get(id) ?? 0) + 1);
      if (fautives.has(id)) throw new TypeError('Cannot read properties of undefined (reading \'images\')');
      return sim.statut(id);
    },
    telecharger: (id, ref) => sim.telecharger(id, ref),
    annuler: sim.annuler ? (id) => sim.annuler!(id) : undefined,
  };
  return { f, fautives, appels };
}

const horloge = { ms: Date.parse('2026-11-16T10:00:00Z') };
const job = async (id: string) => (await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
const solde = async () => (await base.select({ s: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ws)))[0]!.s;
const tentatives = async (id: string) => (await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, id))).length;
const registre = async (id: string) => (await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id))).map((r) => [r.kind, r.credits, Number(r.usdMicros)]).sort();

describe('I1 · une exception sur un job n’interrompt plus le tour', () => {
  it('le job fautif est journalisé et reculé, un second job `queued` est réclamé dans le MÊME tour', async () => {
    const { f, fautives, appels } = fournisseurFautif();
    const alertes: string[] = [];
    const m = new MoteurStudio({ base, fournisseur: f, stockage: new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } }), decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms), alerte: (a) => alertes.push(a) });
    const fautif = await semerJob();
    await m.tour({ maxNouveaux: 1 });
    const jf = await job(fautif);
    expect(jf.state).toBe('running');
    fautives.add(jf.providerRequestId!);

    const neuf = await semerJob();
    horloge.ms += 2_000;
    let leve: unknown = null;
    await m.tour().catch((e) => { leve = e; });
    expect(leve, 'le tour a levé l’exception d’un seul job').toBeNull();
    expect((await job(neuf)).state, 'le job neuf n’a pas été réclamé · la file est bloquée par le job fautif').not.toBe('queued');
    expect(alertes.some((a) => a.includes(fautif) && a.includes('reading')), `exception non journalisée · ${alertes.join(' | ')}`).toBe(true);

    // Reculé · pas retenté avant son recul.
    const avant = appels.get(jf.providerRequestId!)!;
    horloge.ms += reculEtapeMs(1) - 1_000;
    await m.tour();
    expect(appels.get(jf.providerRequestId!), 'le job fautif est retenté avant son recul').toBe(avant);
  });

  it(`au ${ECHECS_ETAPE_MAX}e échec consécutif en running (envoi accepté) · rapprochement, compteur remis à zéro, crédits encore réservés`, async () => {
    const { f, fautives } = fournisseurFautif();
    const m = new MoteurStudio({ base, fournisseur: f, stockage: new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } }), decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms), alerte: () => {} });
    const id = await semerJob();
    for (let i = 0; i < 5 && (await job(id)).state !== 'running'; i++) { await m.tour(); horloge.ms += 2_000; }
    fautives.add((await job(id)).providerRequestId!);
    for (let i = 0; i < 2_000 && (await job(id)).state === 'running'; i++) { await m.tour(); horloge.ms += 10_000; }
    const j = await job(id);
    expect(j.state, 'le job fautif ne finit jamais').toBe('reconciliation_required');
    expect((j.error as { echecsEtape?: number } | null)?.echecsEtape, 'le compteur survit au passage en rapprochement').toBeUndefined();
    expect(await registre(id), 'rien n’est réglé avant le rapprochement').toEqual([['reserve', 4, 80_000]]);
  });

  it('un succès remet le compteur à zéro · seuls les échecs CONSÉCUTIFS comptent', async () => {
    const { f, fautives } = fournisseurFautif();
    const m = new MoteurStudio({ base, fournisseur: f, stockage: new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } }), decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms), alerte: () => {} });
    const id = await semerJob();
    for (let i = 0; i < 5 && (await job(id)).state !== 'running'; i++) { await m.tour(); horloge.ms += 2_000; }
    const req = (await job(id)).providerRequestId!;
    fautives.add(req);
    await m.tour();
    expect((await job(id)).error).toMatchObject({ echecsEtape: 1 });
    fautives.delete(req);
    horloge.ms += reculEtapeMs(1) + 1_000;
    await m.tour();
    const j = await job(id);
    expect(j.state).toBe('running');
    expect((j.error as { echecsEtape?: number } | null)?.echecsEtape, 'le compteur survit à une étape réussie').toBeUndefined();
  });
});

describe('relecture de #1104 · aucun job fautif sans issue, quel que soit son état', () => {
  const moteurFautif = (f: FournisseurStudio, alertes: string[] = []) => new MoteurStudio({ base, fournisseur: f, stockage: new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } }), decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms), alerte: (a) => alertes.push(a) });

  it('CRITIQUE 1 · `claimed` dont l’instantané est illisible (bail 60 s) · failed echec_sans_frais, au plus N tentatives, réserve rendue', { timeout: 180_000 }, async () => {
    const { f } = fournisseurFautif();
    const m = moteurFautif(f);
    const avant = await solde();
    const id = await semerJob({ snapshotIllisible: true });
    for (let i = 0; i < 400 && !['failed', 'completed', 'cancelled'].includes((await job(id)).state); i++) { await m.tour(); horloge.ms += 10_000; }
    const j = await job(id);
    expect(j.state, `le job fautif ne finit jamais · état ${j.state}, ${JSON.stringify(j.error)}`).toBe('failed');
    expect((j.error as { issue?: string }).issue).toBe('echec_sans_frais');
    expect(await tentatives(id), 'le job est repris en boucle (remise en file)').toBeLessThanOrEqual(ECHECS_ETAPE_MAX);
    expect(await registre(id)).toEqual([['release', 4, 80_000], ['reserve', 4, 80_000], ['settle', 0, 0]]);
    expect(await solde()).toBe(avant);
  });

  it('IMPORTANT 2 · `running` envoi accepté, suivi qui lève · à la borne, rapprochement (jamais un échec direct), compteur remis à zéro · puis issue bornée', { timeout: 180_000 }, async () => {
    const { f, fautives } = fournisseurFautif();
    const m = moteurFautif(f);
    const id = await semerJob();
    for (let i = 0; i < 5 && (await job(id)).state !== 'running'; i++) { await m.tour(); horloge.ms += 2_000; }
    fautives.add((await job(id)).providerRequestId!);
    const etats: string[] = [];
    for (let i = 0; i < 400 && !['failed', 'completed', 'cancelled'].includes((await job(id)).state); i++) {
      await m.tour(); horloge.ms += 10_000;
      const e = (await job(id)).state;
      if (etats[etats.length - 1] !== e) etats.push(e);
    }
    expect(etats, 'running fautif conclu sans rapprochement').toEqual(['running', 'reconciliation_required', 'failed']);
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect((j.error as { issue?: string }).issue).toBe('facture_sans_livrable');
    expect(await registre(id)).toEqual([['release', 4, 0], ['reserve', 4, 80_000], ['settle', 0, 80_000]]);
    const audit = await base.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, id));
    expect(audit.filter((a) => a.action === 'job.failed').map((a) => a.effectiveRole)).toEqual(['systeme:reconciliateur']);
  });
});
