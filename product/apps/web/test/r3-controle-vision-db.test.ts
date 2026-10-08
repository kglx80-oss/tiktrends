import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * R3 · le contrôle visuel est une LIGNE du devis accepté, jamais un débit
 * ajouté après coup (décision du propriétaire du 8 octobre : activé par
 * défaut, visible, chiffré, décochable).
 *
 * Vraie base (pglite), vrai registre publié, VRAI adaptateur de production
 * (`adaptateurAnthropicGarde` → `guardedAnthropic` → client du SDK) pointé vers
 * un faux serveur Anthropic local. On lit les RÉSULTATS : requêtes reçues par
 * le serveur, lignes `ai_spend`, statut qualité en base.
 *
 *  · sans ligne « contrôle visuel » au devis approuvé ⇒ refus, 0 requête,
 *    0 ligne `ai_spend`, statut inchangé ;
 *  · avec la ligne ⇒ 1 requête, 1 ligne `ai_spend` réglée, statut tranché, et
 *    la requête réellement envoyée tient dans la borne approuvée (mesure du
 *    texte compilé, écrite dans `tarifs.ts`) ;
 *  · ligne approuvée trop petite pour la requête ⇒ refus AVANT l'envoi ;
 *  · média déjà tranché ⇒ aucun second contrôle payant.
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
import { db, schema, eq } from '@tiktrends/db';
import {
  imageVide, mesurerRequete, borneMaxAppel, borneControleVisionParImageMicros, OPERATION_CONTROLE_VISION, PROFIL_CONTROLE_VISION,
  OCTETS_TEXTE_CONTROLE_VISION_MAX, type LigneDevis, type SnapshotJob,
} from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { resolveurMediasStudio } from '../lib/studios/prompts/resolveur';
import { adaptateurAnthropicGarde } from '../lib/studios/prompts/adaptateur';
import { encoder } from '../lib/studios/benchmark/jeu-synthetique';
import { controlerSortieParVision, type DependancesVision } from '../lib/studios/produit/qualite';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { semer, session } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { publierRegistreDeTest } from './l2-outils';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';
import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';

const ids = etat.ids;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-08T10:00:00Z') };
const MODELE = 'claude-sonnet-5';
const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');
const stockage = new Map<string, Uint8Array>();
const lecteur = { async lire(m: { storageKey: string }) { return stockage.get(m.storageKey) ?? null; } };
let srv: FauxServeur;
const env = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };

const deps = (): DependancesVision => ({ adaptateur: adaptateurAnthropicGarde(), environnement: 'test', plafondAtteint: async () => false, medias: resolveurMediasStudio(lecteur) });

const LIGNE_IMAGE: LigneDevis = { operation: 'keyframe:s_image', nature: 'generation', profil: 'image_generation', unites: 1, credits: 4, usdMicros: 80_000, inclus: false, natureCout: 'borne', motifEstimation: null };
const ligneVision = (usdMicros: number): LigneDevis => ({ operation: OPERATION_CONTROLE_VISION, nature: 'generation', profil: PROFIL_CONTROLE_VISION, unites: 1, credits: 0, usdMicros, inclus: true, natureCout: 'borne', motifEstimation: null });
const snapshot = (versionId: string, lignes: LigneDevis[]): SnapshotJob => ({
  v: 1, quoteId: randomUUID(), projectVersionId: versionId, contentHash: '', impactPlanHash: '', pricingVersion: 'v', lignes, epinglage: null,
  reserve: { credits: 4, usdMicros: lignes.reduce((s, l) => s + l.usdMicros * l.unites, 0) }, parametres: {},
});

let cat: Catalogue;
async function jobLivre(lignes: LigneDevis[] | null): Promise<{ jobId: string; sortieId: string }> {
  const { projectId } = await projetStatique(db, ids, cat);
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  const photo5 = c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const e = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: p!.currentVersionId, productId: cat.produit.id, photoId: photo5, composants: ['lunettes'] }, O);
  if (!e.ok) throw new Error(JSON.stringify(e));
  const octets = new Uint8Array(await encoder(imageVide(8, 6, [150, 110, 60, 255])));
  const assetId = randomUUID();
  const cle = `studios/${ids.wsA}/${assetId}.png`;
  await db.insert(schema.studioAssets).values({ id: assetId, workspaceId: ids.wsA, brandId: ids.brandA1, projectId, storageKey: cle, mime: 'image/png', bytes: octets.length, width: 8, height: 6, sha256: sha(octets), origin: 'generated', storageState: 'stored' });
  stockage.set(cle, octets);
  const [j] = await db.insert(schema.studioJobs).values({
    workspaceId: ids.wsA, brandId: ids.brandA1, projectId, projectVersionId: e.version.id, operation: 'image_generate', state: 'completed',
    idempotencyKey: `r3-${randomUUID()}`, inputHash: 'a'.repeat(64), snapshot: lignes ? snapshot(e.version.id, lignes) : {}, result: { assets: { 'keyframe:s_image': assetId } },
  }).returning();
  return { jobId: j!.id, sortieId: `sta_${assetId}` };
}
const qualite = async (id: string) => (await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!.qualityStatus;
const depenses = async () => db.select().from(schema.aiSpend);
const sortieVision = (sortieId: string) => JSON.stringify({
  status: 'ready', questions: [], warnings: [], evidenceIds: [],
  result: { verdict: 'passed', issues: [], unverifiable: [], summary: 'Lunettes visibles' },
  sortieId,
});

beforeAll(async () => {
  srv = await fauxAnthropic();
  process.env.ANTHROPIC_API_KEY = 'cle-factice-r3';
  process.env.ANTHROPIC_BASE_URL = srv.url;
  process.env.ANTHROPIC_GEN_MODEL = MODELE;
  process.env.AI_SPEND_CAP_USD = '5';
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts);
}, 120_000);
afterAll(async () => {
  await srv.fermer();
  for (const [k, v] of [['ANTHROPIC_API_KEY', env.cle], ['ANTHROPIC_BASE_URL', env.url], ['ANTHROPIC_GEN_MODEL', env.modele], ['AI_SPEND_CAP_USD', env.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(async () => { etat.session = session(ids, 'ua'); await db.delete(schema.aiSpend); });

describe('contrôle visuel hors devis · refusé avant tout appel', () => {
  it.each([
    ['devis approuvé SANS ligne de contrôle visuel', [LIGNE_IMAGE]],
    ['instantané sans devis lisible', null],
  ] as const)('%s ⇒ refus, 0 requête, 0 ligne ai_spend, statut inchangé', async (_nom, lignes) => {
    srv.comportement({ type: 'ok', entree: 10, sortie: 10, texte: '{}' });
    const { jobId } = await jobLivre(lignes ? [...lignes] : null);
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect({ requetes: srv.requetes(), aiSpend: (await depenses()).length }, 'contrôle visuel exécuté hors devis · débit ajouté après coup').toEqual({ requetes: 0, aiSpend: 0 });
    expect(r).toMatchObject({ ok: false, code: 'BUDGET_EXCEEDED' });
    expect(await qualite(jobId)).toBe('pending');
  });
});

describe('contrôle visuel APPROUVÉ au devis · exécuté dans sa borne', () => {
  it('ligne approuvée ⇒ 1 requête, 1 ligne ai_spend réglée, statut tranché ; la requête envoyée tient dans la borne', async () => {
    const borne = borneControleVisionParImageMicros(MODELE);
    const { jobId, sortieId } = await jobLivre([LIGNE_IMAGE, ligneVision(borne)]);
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: sortieVision(sortieId) });
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect(r.ok).toBe(true);
    expect(srv.requetes()).toBe(1);
    const lignes = await depenses();
    expect(lignes.map((l) => [l.provider, l.inputTokens, l.reconcileReason])).toEqual([['anthropic', 9000, null]]);
    expect(await qualite(jobId)).not.toBe('pending');

    // MESURE (écrite dans `tarifs.ts`) : octets du texte de la requête RÉELLEMENT envoyée.
    const envoye = srv.corps()[0] as Parameters<typeof mesurerRequete>[0] & { model: string; max_tokens: number };
    const m = mesurerRequete(envoye);
    console.info(`[r3:mesure] quality.visual · 1 sortie, 1 composant · octets texte ${m.octets} · images ${m.images} · blocs ${m.blocs} · borne ${borneMaxAppel(envoye)} $ · ligne ${borne / 1e6} $`);
    expect(m.images).toBe(1);
    expect(m.octets, 'le texte compilé dépasse la marge choisie dans OCTETS_TEXTE_CONTROLE_VISION_MAX').toBeLessThan(OCTETS_TEXTE_CONTROLE_VISION_MAX / 2);
    expect(Math.ceil(borneMaxAppel(envoye) * 1e6)).toBeLessThanOrEqual(borne);
  });

  it('ligne approuvée trop petite pour la requête ⇒ refus AVANT l’envoi : 0 requête, 0 ai_spend, revue humaine', async () => {
    const { jobId } = await jobLivre([LIGNE_IMAGE, ligneVision(1_000)]);
    srv.comportement({ type: 'ok', entree: 10, sortie: 10, texte: '{}' });
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect({ requetes: srv.requetes(), aiSpend: (await depenses()).length }, 'la borne approuvée n’a pas arrêté une requête qui pouvait la dépasser').toEqual({ requetes: 0, aiSpend: 0 });
    expect(r).toMatchObject({ ok: true, qualite: 'requires_review', controle: 'aucun', motif: 'contrôle visuel non conclu (BUDGET_EXCEEDED)' });
  });

  it('média déjà tranché ⇒ aucun second contrôle payant', async () => {
    const { jobId } = await jobLivre([LIGNE_IMAGE, ligneVision(borneControleVisionParImageMicros(MODELE))]);
    await db.update(schema.studioJobs).set({ qualityStatus: 'requires_review' }).where(eq(schema.studioJobs.id, jobId));
    srv.comportement({ type: 'ok', entree: 10, sortie: 10, texte: '{}' });
    const r = await controlerSortieParVision(ctxDe(ids, 'ua'), { jobId }, deps());
    expect({ requetes: srv.requetes(), aiSpend: (await depenses()).length }, 'un média déjà tranché a été re-contrôlé · second débit').toEqual({ requetes: 0, aiSpend: 0 });
    expect(r).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
  });
});
