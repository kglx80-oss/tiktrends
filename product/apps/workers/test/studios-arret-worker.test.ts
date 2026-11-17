import { describe, it, expect, beforeAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { schema, eq } from '@tiktrends/db';
import {
  refsDuJob, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, OPERATION_JOB_STUDIO,
  type SnapshotJob, type FournisseurStudio, type DemandeFournisseur,
} from '@tiktrends/core';
import { DELAI_SOUMISSION_FAL_MS } from '@tiktrends/integrations';
import { demarrerBoucleStudio, arretPropreSurSignal, DELAI_ARRET_MAX_MS, ETAPE_INSECABLE_PIRE_MS, PHASES_ETAPE_INSECABLE } from '../src/studios/boucle';
import { DecodeurSharp } from '../src/studios/decodeur';
import type { BaseStudio } from '../src/studios/types';
import { FournisseurSimule, StockageSimule, DRAPEAU_SIMULE } from '../../../packages/integrations/src/studios-simule';
import { pgMemoire } from './pg-memoire';

/**
 * Arrêt propre du worker (SIGTERM, SIGINT) · `deploy.sh` recrée le conteneur
 * à chaque commit. Avant, rien n'écoutait le signal et `pnpm start` (PID 1)
 * sortait sans attendre son enfant : un job tué entre la soumission à fal et
 * l'écriture de sa requête finissait en rapprochement sans identifiant.
 * On lit le RÉSULTAT en base (pglite, migrations réelles) et l'ordre des
 * événements · le fournisseur simulé retient la soumission tant qu'on ne la
 * relâche pas.
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

/** Le simulé, dont la soumission attend qu'on la relâche · on sait quand elle est « partie ». */
function fournisseurRetenu() {
  const sim = new FournisseurSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
  let relacher: () => void = () => {};
  let partie: () => void = () => {};
  const soumissionPartie = new Promise<void>((r) => { partie = r; });
  const retenue = new Promise<void>((r) => { relacher = r; });
  const f: FournisseurStudio = {
    nom: sim.nom, simule: sim.simule, rechercheParCle: sim.rechercheParCle,
    soumettre: async (d: DemandeFournisseur) => { const r = await sim.soumettre(d); partie(); await retenue; return r; },
    statut: (id) => sim.statut(id),
    telecharger: (id, ref) => sim.telecharger(id, ref),
    annuler: sim.annuler ? (id) => sim.annuler!(id) : undefined,
  };
  return { f, sim, soumissionPartie, relacher: () => relacher() };
}

const job = async (id: string) => (await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
const tentatives = async (id: string) => (await base.select().from(schema.studioJobAttempts).where(eq(schema.studioJobAttempts.jobId, id))).map((t) => t.state);
const ENV = { STUDIOS_CAPACITES_GENERALES: 'generation_image,video' };

describe('arrêt demandé pendant un tour · le tour finit, aucun job orphelin', () => {
  it('soumission en vol · l’arrêt attend l’écriture de la requête, puis plus rien n’est réclamé', async () => {
    const premier = await semerJob();
    const second = await semerJob();
    const { f, soumissionPartie, relacher } = fournisseurRetenu();
    const stockage = new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
    const b = demarrerBoucleStudio({ base, fournisseur: f, stockage, decodeur: new DecodeurSharp(), intervalleMs: 5, env: ENV });
    await soumissionPartie;
    const ordre: string[] = [];
    const arret = b.arreter().then(() => ordre.push('arrêt rendu'));
    await new Promise((r) => setTimeout(r, 50));
    expect(ordre, 'l’arrêt n’a pas attendu la soumission en vol').toEqual([]);
    ordre.push('soumission relâchée');
    relacher();
    await arret;
    expect(ordre).toEqual(['soumission relâchée', 'arrêt rendu']);
    const j = await job(premier);
    expect(j.state).toBe('running');
    expect(j.providerRequestId, 'la requête partie doit être écrite avant que la boucle rende la main').toMatch(/^sim_/);
    expect(await tentatives(premier)).toEqual(['submitted']);
    expect((await job(second)).state, 'aucun job neuf réclamé après l’arrêt').toBe('queued');
    expect(await tentatives(second)).toEqual([]);
    // Plus aucun tour ne part.
    await new Promise((r) => setTimeout(r, 50));
    expect((await job(second)).state).toBe('queued');
  });

  it('boucle au repos · l’arrêt rend la main sans attendre', async () => {
    const stockage = new StockageSimule({ drapeau: DRAPEAU_SIMULE, env: { NODE_ENV: 'test' } });
    const b = demarrerBoucleStudio({ base, fournisseur: fournisseurRetenu().f, stockage, decodeur: new DecodeurSharp(), intervalleMs: 3_600_000, env: ENV });
    const t = Date.now();
    await b.arreter();
    expect(Date.now() - t).toBeLessThan(1_000);
  });
});

describe('le signal · SIGTERM et SIGINT arrêtent proprement, une fois', () => {
  it('SIGTERM · arrêt attendu, puis sortie 0 · un second signal ne relance rien', async () => {
    const processus = new EventEmitter();
    const ordre: string[] = [];
    let relacher: () => void = () => {};
    const arreter = () => { ordre.push('arrêt demandé'); return new Promise<void>((r) => { relacher = () => { ordre.push('tour fini'); r(); }; }); };
    const sorti = new Promise<number>((r) => arretPropreSurSignal({ processus, arreter, sortir: (c) => { ordre.push(`sortie ${c}`); r(c); }, journal: () => {} }));
    processus.emit('SIGTERM');
    processus.emit('SIGTERM');
    await new Promise((r) => setTimeout(r, 10));
    expect(ordre).toEqual(['arrêt demandé']);
    relacher();
    expect(await sorti).toBe(0);
    expect(ordre).toEqual(['arrêt demandé', 'tour fini', 'sortie 0']);
  });

  it('SIGINT pareil · un arrêt qui ne finit pas sort quand même, en échec, après le délai', async () => {
    const processus = new EventEmitter();
    const sorti = new Promise<number>((r) => arretPropreSurSignal({ processus, arreter: () => new Promise<void>(() => {}), sortir: r, delaiMaxMs: 20, journal: () => {} }));
    processus.emit('SIGINT');
    expect(await sorti).toBe(1);
  });
});

describe('le délai d’arrêt est mesuré, et Docker l’accorde', () => {
  const PRODUIT = join(__dirname, '..', '..', '..');

  it('l’étape insécable au pire · préparation (40 s) + soumission (DELAI_SOUMISSION_FAL_MS) + écriture · le délai d’arrêt la couvre avec 1,5 de marge', () => {
    const soumission = PHASES_ETAPE_INSECABLE.find((p) => p.phase === 'soumission à fal');
    expect(soumission?.ms).toBe(DELAI_SOUMISSION_FAL_MS);
    expect(ETAPE_INSECABLE_PIRE_MS).toBe(PHASES_ETAPE_INSECABLE.reduce((s, p) => s + p.ms, 0));
    expect(DELAI_ARRET_MAX_MS).toBeGreaterThanOrEqual(1.5 * ETAPE_INSECABLE_PIRE_MS);
  });

  it('docker-compose.yml · stop_grace_period du worker au-delà du délai d’arrêt (sinon SIGKILL avant la fin)', () => {
    const compose = readFileSync(join(PRODUIT, 'docker-compose.yml'), 'utf8');
    const bloc = compose.split(/\n  (?=\w)/).find((b) => b.startsWith('workers:')) ?? '';
    const m = /stop_grace_period:\s*(\d+)s/.exec(bloc);
    expect(m, 'stop_grace_period absent du service workers · Docker tue au bout de 10 s').not.toBeNull();
    expect(Number(m![1]) * 1000).toBeGreaterThanOrEqual(DELAI_ARRET_MAX_MS + 10_000);
  });

  it('Dockerfile.workers · le processus 1 attend son enfant (`pnpm exec tsx`, jamais `pnpm start`, qui sort sans attendre)', () => {
    const df = readFileSync(join(PRODUIT, 'Dockerfile.workers'), 'utf8');
    const cmd = /^CMD\s+(.+)$/m.exec(df)?.[1] ?? '';
    expect(cmd).toBe('["pnpm", "exec", "tsx", "src/index.ts"]');
  });

  it('le point d’entrée du worker branche l’arrêt sur le signal', () => {
    const index = readFileSync(join(PRODUIT, 'apps/workers/src/index.ts'), 'utf8');
    expect(index).toMatch(/arretPropreSurSignal\(\{[^}]*processus: process/);
  });
});
