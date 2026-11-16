import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema, eq } from '@tiktrends/db';
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

async function semerJob(): Promise<string> {
  const lignes = [{ operation: 'keyframe:s1', nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const h = 'c'.repeat(64);
  const [q] = await base.insert(schema.studioQuotes).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, impactPlanHash: h, inputHash: h, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: user }).returning();
  const [a] = await base.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: ws, brandId: brand, inputHash: h, approvedBy: user }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: version, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres: {} };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: version, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: h, snapshot, createdBy: user }).returning();
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

  it(`au-delà de ${ECHECS_ETAPE_MAX} échecs consécutifs · failed, crédits rendus, un seul règlement`, async () => {
    const { f, fautives } = fournisseurFautif();
    const m = new MoteurStudio({ base, fournisseur: f, stockage: new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } }), decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms), alerte: () => {} });
    const id = await semerJob();
    for (let i = 0; i < 5 && (await job(id)).state !== 'running'; i++) { await m.tour(); horloge.ms += 2_000; }
    fautives.add((await job(id)).providerRequestId!);
    let tours = 0;
    for (; tours < 2_000 && (await job(id)).state === 'running'; tours++) { await m.tour(); horloge.ms += 10_000; }
    const j = await job(id);
    expect(j.state, 'le job fautif ne finit jamais').toBe('failed');
    expect((j.error as { issue?: string }).issue).toBe('facture_sans_livrable');
    expect(await registre(id)).toEqual([['release', 4, 0], ['reserve', 4, 80_000], ['settle', 0, 80_000]]);
    expect(violationsRegistreJob((await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id))).map((x) => ({ kind: x.kind, credits: x.credits, usdMicros: Number(x.usdMicros) })), j.state)).toEqual([]);
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
