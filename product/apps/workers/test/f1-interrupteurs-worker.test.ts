import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema, eq } from '@tiktrends/db';
import {
  refsDuJob, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, OPERATION_JOB_STUDIO, OPERATION_IMAGE, cleInterrupteursEspace,
  type SnapshotJob,
} from '@tiktrends/core';
import { demarrerBoucleStudio } from '../src/studios/boucle';
import { DecodeurSharp } from '../src/studios/decodeur';
import type { BaseStudio } from '../src/studios/types';
import { FournisseurSimule, StockageSimule, DRAPEAU_SIMULE } from '../../../packages/integrations/src/studios-simule';
import { pgMemoire } from './pg-memoire';

/**
 * F1 · le worker ne RÉCLAME pas un job dont une capacité est coupée pour son
 * espace (cahier 01 §14, garde « workers »).
 *
 * On passe par la boucle de PRODUCTION (`demarrerBoucleStudio`, celle que
 * `demarrerWorkerStudio` lance) : c'est elle qui pose les interrupteurs. Puis
 * on lit le RÉSULTAT en base : état du job, tentatives, registre, solde, et
 * les appels reçus par le fournisseur (simulé, aucun réseau).
 */

let base: BaseStudio;
const ws = randomUUID();
const ws2 = randomUUID();
const brand = randomUUID();
const brand2 = randomUUID();
const user = randomUUID();
const projets: Record<string, { projet: string; version: string; brand: string }> = {};
const arrets: Array<() => void> = [];

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.users).values({ id: user, email: `${user}@w.test` });
  for (const [w, b] of [[ws, brand], [ws2, brand2]] as const) {
    await base.insert(schema.workspaces).values({ id: w, name: 'W', plan: 'core', creditsBalance: 100 });
    await base.insert(schema.brands).values({ id: b, workspaceId: w, name: 'B' });
    const [p] = await base.insert(schema.studioProjects).values({ workspaceId: w, brandId: b, kind: 'image', title: 'P', ownerId: user }).returning();
    const c = contenuVide();
    const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId: w, brandId: b, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c), authorId: user }).returning();
    projets[w] = { projet: p!.id, version: v!.id, brand: b };
  }
});
afterEach(() => { while (arrets.length) arrets.pop()!(); });

/** Un job tel que l'approbation l'écrit (devis, approbation consommée, job `queued`, réserve). */
async function semerJob(operation: string, w = ws): Promise<string> {
  const { projet, version, brand: b } = projets[w]!;
  const lignes = [{ operation, nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const h = 'c'.repeat(64);
  const [q] = await base.insert(schema.studioQuotes).values({ workspaceId: w, brandId: b, projectId: projet, projectVersionId: version, impactPlanHash: h, inputHash: h, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: user }).returning();
  const [a] = await base.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: w, brandId: b, inputHash: h, approvedBy: user }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: version, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres: {} };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: w, brandId: b, projectId: projet, projectVersionId: version, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: h, snapshot, createdBy: user }).returning();
  await base.update(schema.studioApprovals).set({ consumedAt: new Date(), consumedJobId: j!.id }).where(eq(schema.studioApprovals.id, a!.id));
  await base.insert(schema.studioBudgetLedger).values({ workspaceId: w, brandId: b, projectId: projet, jobId: j!.id, quoteId: q!.id, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(j!.id).reserve });
  return j!.id;
}

function boucle(env: Record<string, string>) {
  const fournisseur = new FournisseurSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
  const stockage = new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
  // Intervalle d'une heure : on joue les tours à la main, la minuterie ne tourne jamais.
  const b = demarrerBoucleStudio({ base, fournisseur, stockage, decodeur: new DecodeurSharp(), intervalleMs: 3_600_000, env });
  arrets.push(b.arreter);
  return { moteur: b.moteur, fournisseur };
}

const job = async (id: string) => (await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
const tentatives = async (id: string) => (await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, id))).length;
const registre = async (id: string) => (await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id))).map((l) => l.kind);
const poserReglage = async (w: string, value: unknown) => {
  await base.insert(schema.appSettings).values({ key: cleInterrupteursEspace(w), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
};
const finir = async (m: ReturnType<typeof boucle>['moteur'], id: string) => { for (let i = 0; i < 30 && !['completed', 'failed', 'cancelled'].includes((await job(id)).state); i++) await m.tour(); };

describe('worker · capacité coupée ⇒ job non réclamé, rien soumis, rien débité', () => {
  it('défauts (aucun réglage) : ni l’image du studio Image ni l’image clé vidéo ne sont réclamées', async () => {
    const image = await semerJob(OPERATION_IMAGE);
    const video = await semerJob('keyframe:s_ouverture');
    const { moteur, fournisseur } = boucle({});
    expect(await moteur.reclamer(), 'un job coupé a été réclamé').toBeNull();
    for (let i = 0; i < 3; i++) await moteur.tour();
    for (const id of [image, video]) {
      expect((await job(id)).state, 'le job coupé a quitté la file').toBe('queued');
      expect(await tentatives(id)).toBe(0);
      expect(await registre(id), 'le registre a bougé pour un job coupé').toEqual(['reserve']);
    }
    expect(fournisseur.appelsSoumettre, 'le fournisseur a reçu une soumission pour un job coupé').toBe(0);
    // Il repart : le réglage plateforme de l'espace l'allume, relu à la réclamation suivante (sans redémarrage).
    await poserReglage(ws, { actives: ['generation_image', 'video'], coupees: [] });
    await finir(moteur, image);
    await finir(moteur, video);
    expect([(await job(image)).state, (await job(video)).state]).toEqual(['completed', 'completed']);
    await poserReglage(ws, { actives: [], coupees: [] });
  });

  it('une tête de file coupée ne bloque pas les jobs permis qui la suivent', async () => {
    const coupe = await semerJob(OPERATION_IMAGE);
    const permis = await semerJob('keyframe:s_fin');
    await poserReglage(ws, { actives: ['video'], coupees: [] });
    const { moteur } = boucle({});
    const r = await moteur.reclamer();
    expect(r?.id, 'la réclamation n’a pas sauté la tête coupée').toBe(permis);
    expect((await job(coupe)).state).toBe('queued');
    await finir(moteur, permis);
    // L'environnement d'un worker redémarré (généralisation) le fait repartir.
    const apres = boucle({ STUDIOS_CAPACITES_GENERALES: 'generation_image' });
    await finir(apres.moteur, coupe);
    expect((await job(coupe)).state).toBe('completed');
    await poserReglage(ws, { actives: [], coupees: [] });
  });

  it('espace pilote : seul l’espace listé est servi', async () => {
    const pilote = await semerJob(OPERATION_IMAGE, ws);
    const autre = await semerJob(OPERATION_IMAGE, ws2);
    const { moteur } = boucle({ STUDIOS_ESPACES_PILOTES: ws, STUDIOS_CAPACITES_PILOTES: 'generation_image' });
    await finir(moteur, pilote);
    expect((await job(pilote)).state).toBe('completed');
    expect((await job(autre)).state, 'un espace non pilote a été servi').toBe('queued');
    expect(await tentatives(autre)).toBe(0);
    // Nettoyage · l'utilisateur annule : voir le cas suivant.
    await base.update(schema.studioJobs).set({ state: 'cancel_requested', rowVersion: (await job(autre)).rowVersion + 1 }).where(eq(schema.studioJobs.id, autre));
    await finir(moteur, autre);
  });

  it('coupée, une annulation est quand même traitée : réserve rendue, aucune soumission', async () => {
    const id = await semerJob('keyframe:s_annule');
    const { moteur, fournisseur } = boucle({});
    await moteur.tour();
    expect((await job(id)).state).toBe('queued');
    await base.update(schema.studioJobs).set({ state: 'cancel_requested', rowVersion: (await job(id)).rowVersion + 1 }).where(eq(schema.studioJobs.id, id));
    await finir(moteur, id);
    expect((await job(id)).state).toBe('cancelled');
    expect(await registre(id)).toEqual(['reserve', 'settle', 'release']);
    expect(fournisseur.appelsSoumettre).toBe(0);
  });

  it('coupure globale : même un espace qui l’a allumée n’est pas servi', async () => {
    const id = await semerJob(OPERATION_IMAGE);
    await poserReglage(ws, { actives: ['generation_image'], coupees: [] });
    const { moteur } = boucle({ STUDIOS_CAPACITES_COUPEES: 'generation_image' });
    expect(await moteur.reclamer()).toBeNull();
    expect((await job(id)).state).toBe('queued');
    await base.update(schema.studioJobs).set({ state: 'cancel_requested', rowVersion: (await job(id)).rowVersion + 1 }).where(eq(schema.studioJobs.id, id));
    await finir(moteur, id);
    await poserReglage(ws, { actives: [], coupees: [] });
  });
});
