import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * L6-B · VIDEO-04 · substitution produit · « le fournisseur rend une boîte au
 * lieu des lunettes » : le job a RÉUSSI techniquement (`completed`, média
 * stocké), la qualité doit être `rejected` ou `requires_review`, jamais
 * `passed`.
 *
 * Vraie base (pglite), vrai registre publié, contrôle `quality.visual` routé
 * (vision F-D) : la sortie du job est lue par le SERVEUR dans la portée et
 * envoyée en pièce native à un fournisseur SIMULÉ qui applique le même
 * contrat des pièces que l'adaptateur réel. On lit le statut qualité EN BASE,
 * l'audit, la trace, et les octets reçus par le fournisseur.
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

import { createHash, randomUUID } from 'node:crypto';
import { db, schema, eq, and } from '@tiktrends/db';
import { imageVide } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { resolveurMediasStudio } from '../lib/studios/prompts/resolveur';
import { exigerPiecesConformes, type AdaptateurModele, type AppelModele } from '../lib/studios/prompts/adaptateur';
import { encoder } from '../lib/studios/benchmark/jeu-synthetique';
import { controlerSortieParVision, type DependancesVision } from '../lib/studios/produit/qualite';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { semer, session } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { publierRegistreDeTest } from './l2-outils';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';

const ids = etat.ids;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-08T10:00:00Z') };
const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');
const stockage = new Map<string, Uint8Array>();
const lecteur = { async lire(m: { storageKey: string }) { return stockage.get(m.storageKey) ?? null; } };

let reponse: (a: AppelModele) => unknown = () => ({});
const recues: AppelModele[] = [];
/** Fournisseur SIMULÉ qui route la vision et applique le contrat des pièces de l'adaptateur réel. */
const vision: AdaptateurModele = {
  nom: 'simule-vision-l6b', simule: true,
  modelePour: (p) => (p === 'vision_analysis' || p === 'reasoning_structured' ? 'modele-simule' : null),
  async appeler(a) {
    exigerPiecesConformes(a);
    recues.push(a);
    return { texte: JSON.stringify(reponse(a)), modele: 'modele-simule', jetonsEntree: 100, jetonsSortie: 50, coutUsd: 0 };
  },
};
const deps = (o: Partial<DependancesVision> = {}): DependancesVision => ({ adaptateur: vision, environnement: 'test', plafondAtteint: async () => false, medias: resolveurMediasStudio(lecteur), ...o });
const sortieVision = (sortieId: string, o: { verdict: 'passed' | 'requires_review' | 'rejected'; issues?: Array<Record<string, unknown>>; unverifiable?: string[] }) => ({
  status: 'ready', questions: [], warnings: [], evidenceIds: [],
  result: { verdict: o.verdict, issues: (o.issues ?? []).map((i) => ({ code: 'COMPOSANT', severity: 'blocking', targetId: sortieId, observation: '', expected: '', evidenceIds: [], ...i })), unverifiable: o.unverifiable ?? [], summary: 'Contrôle de la sortie' },
});

let cat: Catalogue;
async function jobLivre(): Promise<{ jobId: string; sortieId: string; octets: Uint8Array }> {
  const { projectId } = await projetStatique(db, ids, cat);
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  const photo5 = c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const e = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: p!.currentVersionId, productId: cat.produit.id, photoId: photo5, composants: ['lunettes'] }, O);
  if (!e.ok) throw new Error(JSON.stringify(e));
  // La « boîte » : une image décodable (PNG réel), déposée et stockée comme le ferait le worker.
  const octets = new Uint8Array(await encoder(imageVide(8, 6, [150, 110, 60, 255])));
  const assetId = randomUUID();
  const cle = `studios/${ids.wsA}/${assetId}.png`;
  await db.insert(schema.studioAssets).values({ id: assetId, workspaceId: ids.wsA, brandId: ids.brandA1, projectId, storageKey: cle, mime: 'image/png', bytes: octets.length, width: 8, height: 6, sha256: sha(octets), origin: 'generated', storageState: 'stored' });
  stockage.set(cle, octets);
  const [j] = await db.insert(schema.studioJobs).values({
    workspaceId: ids.wsA, brandId: ids.brandA1, projectId, projectVersionId: e.version.id, operation: 'image_generate', state: 'completed',
    idempotencyKey: `l6b-${randomUUID()}`, inputHash: 'a'.repeat(64), snapshot: {}, result: { assets: { 'keyframe:s_image': assetId } },
  }).returning();
  return { jobId: j!.id, sortieId: `sta_${assetId}`, octets };
}
const qualite = async (id: string) => (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!.qualityStatus;

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
});
beforeEach(() => { etat.session = session(ids, 'ua'); recues.length = 0; });

describe('VIDEO-04 · sans release publiée · aucun contrôle visuel ⇒ requires_review, jamais passed', () => {
  it('le job a réussi ; aucune release : 0 appel, statut requires_review en base, motif dit, audit écrit', async () => {
    const { jobId } = await jobLivre();
    reponse = () => { throw new Error('aucun appel attendu'); };
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(r).toMatchObject({ ok: true, qualite: 'requires_review', controle: 'aucun', motif: 'aucune version des consignes n’est publiée · contrôle visuel indisponible', verdict: { nonVerifies: ['lunettes'] } });
    expect(recues).toHaveLength(0);
    expect(await qualite(jobId)).toBe('requires_review');
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, jobId), eq(schema.studioAuditEvents.action, 'media.quality.control')));
    expect(a!.reason).toBe('Revue requise · non vérifié : lunettes. Aucun contrôle visuel : aucune version des consignes n’est publiée · contrôle visuel indisponible.');
  });

  it('sans fournisseur, plafond atteint, lecteur : requires_review ou refus, aucun appel', async () => {
    const a = await jobLivre();
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: a.jobId }, deps({ adaptateur: null }))).toMatchObject({ ok: true, qualite: 'requires_review', motif: 'le fournisseur de vision n’est pas configuré sur ce serveur' });
    const b = await jobLivre();
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: b.jobId }, deps({ plafondAtteint: async () => true }))).toMatchObject({ ok: true, qualite: 'requires_review', motif: 'le plafond de dépense est atteint' });
    const c = await jobLivre();
    expect(await controlerSortieParVision(ctxDe(ids, 'uv'), { jobId: c.jobId }, deps())).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await qualite(c.jobId)).toBe('pending');
    expect(recues).toHaveLength(0);
  });
});

describe('VIDEO-04 · release publiée · quality.visual routé sur la sortie réelle', () => {
  beforeAll(async () => { await publierRegistreDeTest(depotPrompts); }, 60_000);

  it('une boîte à la place des lunettes · rejected EN BASE malgré le succès technique ; la vision a reçu les octets de la sortie', async () => {
    const { jobId, sortieId, octets } = await jobLivre();
    reponse = () => sortieVision(sortieId, { verdict: 'rejected', issues: [{ observation: 'Une boîte en carton à la place des lunettes', expected: 'Lunettes visibles et intactes' }] });
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(r).toMatchObject({ ok: true, qualite: 'rejected', controle: 'vision', motif: null, verdict: { manquants: ['lunettes'] } });
    expect(await qualite(jobId)).toBe('rejected');
    expect((await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, jobId)))[0]!.state).toBe('completed');
    // Ce que la vision a reçu : la sortie en pièce native (octets lus par le serveur), les composants en critères.
    expect(recues).toHaveLength(1);
    expect(recues[0]!.profil).toBe('vision_analysis');
    expect(recues[0]!.pieces!.map((p) => [p.index, sha(p.octets), p.mime])).toEqual([[0, sha(octets), 'image/png']]);
    const user = recues[0]!.messages.find((m) => m.role === 'user')!.contenu;
    expect(user).toContain('Composant obligatoire visible et intact : lunettes');
    expect(user).toContain(sortieId);
    const [run] = await db.select().from(schema.studioPromptRuns).where(and(eq(schema.studioPromptRuns.templateKey, 'quality.visual'), eq(schema.studioPromptRuns.jobId, jobId)));
    expect(run!.status).toBe('succeeded');
  });

  it('verdict « passed » mais défaut majeur qui nomme les lunettes · rejected ; lunettes invérifiables · requires_review', async () => {
    const a = await jobLivre();
    reponse = () => sortieVision(a.sortieId, { verdict: 'passed', issues: [{ severity: 'major', observation: 'Un étui fermé, les lunettes ne sont pas visibles', expected: 'lunettes' }] });
    // Le registre accepte un « passed » porteur d'un défaut MAJEUR (seul le bloquant est incohérent) ;
    // la règle des composants, elle, ne valide pas un produit parce que le verdict global est bon.
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: a.jobId }, deps())).toMatchObject({ ok: true, qualite: 'rejected', controle: 'vision', verdict: { manquants: ['lunettes'] } });
    expect(await qualite(a.jobId)).toBe('rejected');
    const b = await jobLivre();
    reponse = () => sortieVision(b.sortieId, { verdict: 'requires_review', unverifiable: ['lunettes (cadrées hors champ)'] });
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: b.jobId }, deps())).toMatchObject({ ok: true, qualite: 'requires_review', controle: 'vision' });
  });

  it('sortie invalide du modèle ou média altéré · requires_review (jamais passed) ; tout confirmé · passed', async () => {
    const a = await jobLivre();
    reponse = () => ({ status: 'ready', result: { verdict: 'passed' } });
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: a.jobId }, deps())).toMatchObject({ ok: true, qualite: 'requires_review', controle: 'aucun' });
    const b = await jobLivre();
    const [ligne] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, b.sortieId.slice(4)));
    stockage.set(ligne!.storageKey, new Uint8Array(await encoder(imageVide(8, 6, [1, 2, 3, 255]))));
    const n = recues.length;
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: b.jobId }, deps())).toMatchObject({ ok: true, qualite: 'requires_review', controle: 'aucun', motif: 'contrôle visuel non conclu (MEDIA_NON_RESOLU)' });
    expect(recues.length).toBe(n);
    const c = await jobLivre();
    reponse = () => sortieVision(c.sortieId, { verdict: 'passed' });
    expect(await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId: c.jobId }, deps())).toMatchObject({ ok: true, qualite: 'passed', controle: 'vision', verdict: { confirmes: ['lunettes'] } });
  });
});
