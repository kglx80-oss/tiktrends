import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import sharp from 'sharp';
import { schema, eq, and, sql } from '@tiktrends/db';
import {
  refsDuJob, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, OPERATION_JOB_STUDIO, OPERATION_IMAGE,
  parametresImageDuDevis, parametresRetoucheDuDevis, photosDuProduit, idDepenseDuJob, lireEntetePng, versionDepuisEmpreinte,
  type SnapshotJob, type StockageStudio, type DecisionFournisseur, type MediaRetouche,
} from '@tiktrends/core';
import type { StorageConfig } from '@tiktrends/integrations';
import { MoteurStudio } from '../src/studios/moteur';
import { construireFournisseurFal, hacherImage } from '../src/studios/fournisseurs';
import type { BaseStudio } from '../src/studios/types';
import { pngSimule } from '../../../packages/integrations/src/studios-simule';
import { DecodeurSharp } from '../src/studios/decodeur';
import { pgMemoire } from './pg-memoire';

/**
 * G-B · retouche masquée RÉELLE dans le worker et contrôle qualité posé à la
 * finalisation. Moteur L3 + fournisseur fal de PRODUCTION contre un `fetch`
 * INJECTÉ qui rejoue la file fal (provenance : fixtures F-A, documentation
 * publique de la file fal, écrites à la main) · 0 $, aucun réseau.
 *
 * Le « modèle » rejoué REPEINT TOUTE L'IMAGE (magenta uni, à une autre taille
 * et un autre ratio que la source) : la preuve est que le média livré n'a
 * changé AUCUN pixel hors zone + fondu, compté par force brute sur le PNG
 * stocké, redécodé, avec une zone calculée ici sans le code du noyau.
 */

let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const user = randomUUID();
const produit = randomUUID();
let projet = '';
let version = '';
let versionSansProduit = '';

/* ── médias ── */
const L = 96;
const H = 64;
const ZONE = { x0: 10, y0: 8, x1: 40, y1: 56 }; // support du masque, bords droit et bas exclus
const FONDU = 3;
const MAGENTA = [255, 0, 255] as const;

async function pngRvb(l: number, h: number, f: (x: number, y: number) => readonly [number, number, number]): Promise<Uint8Array> {
  const d = Buffer.alloc(l * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) { const c = f(x, y); d.set(c, (y * l + x) * 3); }
  return new Uint8Array(await sharp(d, { raw: { width: l, height: h, channels: 3 } }).png().toBuffer());
}
async function pngGris(l: number, h: number, f: (x: number, y: number) => number): Promise<Uint8Array> {
  const d = Buffer.alloc(l * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) d[y * l + x] = f(x, y);
  // `b-w` : sans lui, sharp écrit un PNG RVB (type de couleur 2) même depuis un canal gris.
  return new Uint8Array(await sharp(d, { raw: { width: l, height: h, channels: 1 } }).toColourspace('b-w').png().toBuffer());
}
const dansZone = (x: number, y: number) => x >= ZONE.x0 && x < ZONE.x1 && y >= ZONE.y0 && y < ZONE.y1;
let SOURCE: Uint8Array;
let MASQUE: Uint8Array;
let SORTIE_FAL: Uint8Array; // tout repeint, 200×100

async function rvba(o: Uint8Array) {
  const { data, info } = await sharp(o).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { l: info.width, h: info.height, d: new Uint8Array(data) };
}

/* ── stockage objet en mémoire (dépôt + relecture) et adresse publique fictive ── */
class StockageMemoire implements StockageStudio {
  objets = new Map<string, Uint8Array>();
  async deposer(cle: string, octets: Uint8Array) { this.objets.set(cle, new Uint8Array(octets)); }
  async relire(cle: string) { return this.objets.get(cle) ?? null; }
}
const CFG: StorageConfig = { endpoint: 's3.test', region: 'x', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's', publicBaseUrl: 'https://medias.test' };

async function deposerMedia(stockage: StockageMemoire, octets: Uint8Array, mime: string, l: number, h: number): Promise<MediaRetouche> {
  const sha = createHash('sha256').update(octets).digest('hex');
  const cle = `studios/${ws}/manuel/${randomUUID()}.png`;
  await stockage.deposer(cle, octets);
  const [a] = await base.insert(schema.studioAssets).values({ workspaceId: ws, brandId: brand, projectId: projet, storageKey: cle, mime, bytes: octets.length, width: l, height: h, sha256: sha, origin: 'upload', storageState: 'stored', createdBy: user }).returning();
  return { assetId: `sta_${a!.id}`, assetVersion: versionDepuisEmpreinte(sha), sha256: sha, largeur: l, hauteur: h };
}

const CONSIGNE = { generationInstruction: 'Dessiner une étoile jaune dans la zone.', preserve: ['le quadrillage hors zone'], expectedChanges: ['une étoile'] };

async function semerJob(parametres: unknown, o: { operation?: string; version?: string } = {}): Promise<string> {
  const lignes = [{ operation: o.operation ?? 'retouche:fond', nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const v = o.version ?? version;
  const h = 'c'.repeat(64);
  const [q] = await base.insert(schema.studioQuotes).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: v, impactPlanHash: h, inputHash: h, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: user }).returning();
  const [a] = await base.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: ws, brandId: brand, inputHash: h, approvedBy: user }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: v, contentHash: h, impactPlanHash: h, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres: parametres as Record<string, unknown> };
  const [j] = await base.insert(schema.studioJobs).values({ workspaceId: ws, brandId: brand, projectId: projet, projectVersionId: v, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: h, snapshot, createdBy: user }).returning();
  await base.update(schema.studioApprovals).set({ consumedAt: new Date(), consumedJobId: j!.id }).where(eq(schema.studioApprovals.id, a!.id));
  await base.update(schema.workspaces).set({ creditsBalance: sql`${schema.workspaces.creditsBalance} - 4` }).where(eq(schema.workspaces.id, ws));
  await base.insert(schema.studioBudgetLedger).values({ workspaceId: ws, brandId: brand, projectId: projet, jobId: j!.id, quoteId: q!.id, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(j!.id).reserve });
  return j!.id;
}

/* ── fal rejoué ── */
interface Appel { url: string; methode: string; auth: string | null; corps: Record<string, unknown> | null }
let appels: Appel[] = [];
let sortieFal: () => Uint8Array = () => SORTIE_FAL;
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const REQ = 'b2c3d4e5-0000-4000-8000-00000000cafe';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = { url: String(url), methode: init?.method ?? 'GET', auth: new Headers(init?.headers).get('authorization'), corps: init?.body ? JSON.parse(String(init.body)) : null };
  appels.push(a);
  if (a.methode === 'POST') return json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` });
  if (a.url === `${BASE_REQ}/status`) return json(200, { status: 'COMPLETED', response_url: BASE_REQ });
  if (a.url === BASE_REQ) return json(200, { images: [{ url: 'https://v3.fal.media/files/lion/retouche.png', content_type: 'image/png', width: 200, height: 100 }], description: '' });
  if (a.url.startsWith('https://v3.fal.media/')) { const o = sortieFal(); return new Response(o as unknown as BodyInit, { status: 200, headers: { 'content-length': String(o.length) } }); }
  throw new Error(`appel non prévu ${a.methode} ${a.url}`);
}) as typeof fetch;

const DECISION: Extract<DecisionFournisseur, { ok: true }> = { ok: true, apiKey: 'cle-fal-test:secret', queueUrl: null, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' } };
const horloge = { ms: Date.parse('2026-10-08T10:00:00Z') };
function moteur(stockage: StockageMemoire) {
  const fournisseur = construireFournisseurFal({ base, decision: DECISION, fetch: fetchRejoue, env: { AI_SPEND_CAP_USD: '10' }, stockage: CFG, lire: (c) => stockage.relire(c), horloge: () => new Date(horloge.ms), verifierAdresse: async () => true });
  return new MoteurStudio({ base, fournisseur, stockage, decodeur: new DecodeurSharp(), bailMs: 60_000, horloge: () => new Date(horloge.ms) });
}
async function tours(m: MoteurStudio, id: string, n = 12) {
  for (let i = 0; i < n; i++) {
    const s = (await job(id)).state;
    if (['completed', 'failed', 'cancelled', 'reconciliation_required'].includes(s)) return;
    await m.tour();
    horloge.ms += 16_000;
  }
}
const job = async (id: string) => (await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id)))[0]!;
const registre = async (id: string) => (await base.select().from(schema.studioBudgetLedger).where(eq(schema.studioBudgetLedger.jobId, id))).map((r) => [r.kind, r.credits, Number(r.usdMicros)]).sort();
const depense = async (id: string) => (await base.select().from(schema.aiSpend).where(eq(schema.aiSpend.id, idDepenseDuJob(id)))).map((r) => r.actualUsd);
const medias = async (id: string) => base.select().from(schema.studioAssets).where(sql`${schema.studioAssets.rights}->>'jobId' = ${id}`);
const audits = async (id: string, action: string) => base.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, id), eq(schema.studioAuditEvents.action, action)));
const solde = async () => (await base.select().from(schema.workspaces).where(eq(schema.workspaces.id, ws)))[0]!.creditsBalance;

const refProduit = (composants: string[]) => ({
  schema: 'produit_epingle/1', productId: produit, assetId: 'pph_abc', nom: 'Lunettes Sport',
  photo: { assetId: 'pph_abc', assetVersion: 'v1', sha256: 'a'.repeat(64), nature: 'contenu', position: 1, total: 1 },
  composantsObligatoires: composants, transformationsAutorisees: [], attributsImmuables: [], faits: [], manques: [],
});

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core', creditsBalance: 100 });
  await base.insert(schema.users).values({ id: user, email: `${user}@w.test` });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B' });
  const [p] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'image', title: 'P', ownerId: user }).returning();
  projet = p!.id;
  const c = { ...contenuVide(), productRef: refProduit(['lunettes', 'bandeau']) };
  const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: projet, workspaceId: ws, brandId: brand, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c), authorId: user }).returning();
  version = v!.id;
  const c2 = contenuVide();
  const [v2] = await base.insert(schema.studioProjectVersions).values({ projectId: projet, workspaceId: ws, brandId: brand, n: 2, schemaVersion: SCHEMA_VERSION_CONTENU, content: c2, contentHash: empreinteContenu(c2), authorId: user }).returning();
  versionSansProduit = v2!.id;
  // Source : un motif où chaque pixel compte (dégradés croisés) · masque gris 8 bits de la même résolution.
  SOURCE = await pngRvb(L, H, (x, y) => [(x * 2) & 255, (y * 3 + 40) & 255, (x ^ y) & 255]);
  MASQUE = await pngGris(L, H, (x, y) => (dansZone(x, y) ? 255 : 0));
  SORTIE_FAL = await pngRvb(200, 100, () => MAGENTA);
});

beforeEach(async () => {
  appels = [];
  sortieFal = () => SORTIE_FAL;
  await base.delete(schema.aiSpend);
});

describe('format canonique du masque', () => {
  it('le masque des tests est bien un PNG gris 8 bits (profondeur 8, type de couleur 0) à la résolution de la source', () => {
    expect(lireEntetePng(MASQUE)).toEqual({ largeur: L, hauteur: H, profondeur: 8, typeCouleur: 0 });
  });
});

describe('IMG-06 · retouche masquée réelle · une sortie qui repeint tout ne fuit jamais hors zone', () => {
  it('média livré = recomposition : 0 pixel modifié hors zone + fondu (force brute sur le PNG stocké), zone repeinte ; une requête, 0,08 $, registre réglé', async () => {
    const stockage = new StockageMemoire();
    const source = await deposerMedia(stockage, SOURCE, 'image/png', L, H);
    const masque = await deposerMedia(stockage, MASQUE, 'image/png', L, H);
    const id = await semerJob(parametresRetoucheDuDevis({ consigne: CONSIGNE, source, masque, fonduPx: FONDU }));
    const m = moteur(stockage);
    await tours(m, id);
    const j = await job(id);
    expect(j.state, JSON.stringify(j.error)).toBe('completed');

    // Ce qui est parti : le modèle d'édition existant, la SOURCE en image de départ (adresse publique), la zone dans la consigne.
    const posts = appels.filter((a) => a.methode === 'POST');
    expect(posts.map((p) => p.url)).toEqual(['https://queue.fal.run/fal-ai/nano-banana-2/edit']);
    const corps = posts[0]!.corps as { prompt: string; image_urls: string[]; num_images: number };
    expect(corps.image_urls).toEqual([`https://medias.test/${(await base.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, source.assetId.slice(4))))[0]!.storageKey}`]);
    expect(corps.num_images).toBe(1);
    expect(corps.prompt).toContain('Dessiner une étoile jaune dans la zone.');
    expect(corps.prompt).toContain('pixels 10,8 à 40,56 sur 96×64');
    expect(JSON.stringify(corps)).not.toContain(masque.assetId);

    // Le média livré, relu au stockage et redécodé.
    const [a] = await medias(id);
    expect(a, 'aucun média livré').toBeDefined();
    const stocke = stockage.objets.get(a!.storageKey)!;
    expect(createHash('sha256').update(stocke).digest('hex')).toBe(a!.sha256);
    expect([a!.mime, a!.width, a!.height, a!.parentAssetId]).toEqual(['image/png', L, H, source.assetId.slice(4)]);
    const avant = await rvba(SOURCE);
    const apres = await rvba(stocke);
    expect([apres.l, apres.h]).toEqual([L, H]);
    // Zone autorisée calculée ICI, par force brute (distance euclidienne au support ≤ fondu), sans le noyau.
    const support: Array<[number, number]> = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) if (dansZone(x, y)) support.push([x, y]);
    let horsZone = 0, zoneRepeinte = 0, bande = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < L; x++) {
        const i = (y * L + x) * 4;
        const change = [0, 1, 2, 3].some((k) => avant.d[i + k] !== apres.d[i + k]);
        if (dansZone(x, y)) { if (apres.d[i] === MAGENTA[0] && apres.d[i + 1] === MAGENTA[1] && apres.d[i + 2] === MAGENTA[2]) zoneRepeinte++; continue; }
        let d2 = Infinity;
        for (const [sx, sy] of support) d2 = Math.min(d2, (sx - x) ** 2 + (sy - y) ** 2);
        if (d2 <= FONDU * FONDU) { if (change) bande++; continue; }
        if (change) horsZone++;
      }
    }
    expect(horsZone, 'pixels modifiés hors zone + fondu dans le média livré').toBe(0);
    expect(zoneRepeinte).toBe(support.length); // 1 440 pixels du support, tous repeints
    expect(bande).toBeGreaterThan(0);
    // Trace de la retouche : contrôle avant et après encodage, redimension explicite.
    expect((a!.rights as { retouche: unknown }).retouche).toMatchObject({
      source: source.assetId, masque: masque.assetId, fonduPx: FONDU,
      redimension: { de: { largeur: 200, hauteur: 100 }, vers: { largeur: L, hauteur: H } },
      controle: { pixelsHorsZone: 0, conforme: true }, controleApresEncodage: { pixelsHorsZone: 0, conforme: true },
    });
    // Argent : une requête, la dépense réservée et gardée, crédits réglés.
    expect(await depense(id)).toEqual([0.08]);
    expect(await registre(id)).toEqual([['reserve', 4, 80_000], ['settle', 4, 80_000]]);
    // Contrôle qualité posé par le WORKER : requires_review, composants non vérifiés, jamais passed.
    expect(j.qualityStatus).toBe('requires_review');
    const [q] = await audits(id, 'media.quality.control');
    expect([q!.effectiveRole, q!.versionBefore, q!.versionAfter]).toEqual(['systeme:controle', 'pending', 'requires_review']);
    expect((q!.details as { nonVerifies: string[] }).nonVerifies).toEqual(['lunettes', 'bandeau']);
    // L'audit du corps : expurgé, le masque noté non transmis.
    const [pl] = await audits(id, 'job.provider.payload');
    expect((pl!.details as { references: string[] }).references).toEqual([source.assetId, masque.assetId]);
  });

  it('source modifiée au stockage entre la soumission et la finalisation : rien n’est livré (ni brut, ni recomposé), job failed', async () => {
    const stockage = new StockageMemoire();
    const source = await deposerMedia(stockage, SOURCE, 'image/png', L, H);
    const masque = await deposerMedia(stockage, MASQUE, 'image/png', L, H);
    const id = await semerJob(parametresRetoucheDuDevis({ consigne: CONSIGNE, source, masque, fonduPx: 0 }));
    const m = moteur(stockage);
    // Altère la source APRÈS la soumission : au premier téléchargement de la sortie.
    sortieFal = () => {
      const [cle] = [...stockage.objets.keys()].filter((k) => stockage.objets.get(k)!.length === SOURCE.length && createHash('sha256').update(stockage.objets.get(k)!).digest('hex') === source.sha256);
      if (cle) stockage.objets.set(cle, MASQUE);
      return SORTIE_FAL;
    };
    await tours(m, id);
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect((j.error as { motif: string }).motif).toMatch(/source .* absente ou modifiée depuis le devis/);
    expect(await medias(id)).toEqual([]);
    expect(appels.filter((a) => a.methode === 'POST')).toHaveLength(1);
  });
});

describe('masque absent ou au mauvais format ⇒ tâche bloquée AVANT tout appel, 0 $', () => {
  const bloque = async (id: string, motif: RegExp) => {
    const s0 = await solde();
    const stockage = new StockageMemoire();
    for (const [k, v] of stockagePartage.objets) stockage.objets.set(k, v);
    await tours(moteur(stockage), id);
    const j = await job(id);
    expect(j.state).toBe('failed');
    expect((j.error as { motif: string }).motif).toMatch(motif);
    expect(appels.filter((a) => a.methode === 'POST'), 'requête partie').toEqual([]);
    expect(await depense(id), 'dépense écrite').toEqual([]);
    expect(await registre(id)).toEqual([['release', 4, 80_000], ['reserve', 4, 80_000], ['settle', 0, 0]]);
    expect(await solde()).toBe(s0 + 4);
    expect(await medias(id)).toEqual([]);
    expect((await audits(id, 'job.provider.blocked')).length).toBe(1);
  };
  const stockagePartage = new StockageMemoire();

  it('masque retiré du catalogue (ligne supprimée logiquement)', async () => {
    const source = await deposerMedia(stockagePartage, SOURCE, 'image/png', L, H);
    const masque = await deposerMedia(stockagePartage, MASQUE, 'image/png', L, H);
    await base.update(schema.studioAssets).set({ storageState: 'deleted' }).where(eq(schema.studioAssets.id, masque.assetId.slice(4)));
    await bloque(await semerJob(parametresRetoucheDuDevis({ consigne: CONSIGNE, source, masque, fonduPx: 0 })), /MISSING_REFERENCE · masque .* absent/);
  });

  it('masque à une autre résolution que la source (fichier 48×32, devis 96×64)', async () => {
    const source = await deposerMedia(stockagePartage, SOURCE, 'image/png', L, H);
    const petit = await deposerMedia(stockagePartage, await pngGris(48, 32, () => 255), 'image/png', 48, 32);
    await bloque(await semerJob(parametresRetoucheDuDevis({ consigne: CONSIGNE, source, masque: { ...petit, largeur: L, hauteur: H }, fonduPx: 0 })), /résolution de la source/);
  });

  it('masque déclaré à une autre résolution dans l’instantané', async () => {
    const source = await deposerMedia(stockagePartage, SOURCE, 'image/png', L, H);
    const petit = await deposerMedia(stockagePartage, await pngGris(48, 32, () => 255), 'image/png', 48, 32);
    await bloque(await semerJob(parametresRetoucheDuDevis({ consigne: CONSIGNE, source, masque: petit, fonduPx: 0 })), /INVALID_SCHEMA .*résolution 48×32 différente de la source 96×64/);
  });

  it('masque en couleur (PNG RVB) au lieu du gris 8 bits', async () => {
    const source = await deposerMedia(stockagePartage, SOURCE, 'image/png', L, H);
    const couleur = await deposerMedia(stockagePartage, await pngRvb(L, H, (x, y) => (dansZone(x, y) ? [255, 255, 255] : [0, 0, 0])), 'image/png', L, H);
    await bloque(await semerJob(parametresRetoucheDuDevis({ consigne: CONSIGNE, source, masque: couleur, fonduPx: 0 })), /masque PNG gris 8 bits attendu \(profondeur 8, type de couleur 2\)/);
  });

  it('masque vide (aucun pixel à modifier)', async () => {
    const source = await deposerMedia(stockagePartage, SOURCE, 'image/png', L, H);
    const vide = await deposerMedia(stockagePartage, await pngGris(L, H, () => 0), 'image/png', L, H);
    await bloque(await semerJob(parametresRetoucheDuDevis({ consigne: CONSIGNE, source, masque: vide, fonduPx: 0 })), /masque vide/);
  });
});

describe('contrôle qualité posé par le worker à la finalisation (IMG-03)', () => {
  const photo = `data:image/png;base64,${Buffer.from(pngSimule([200, 30, 30])).toString('base64')}`;
  const parametresImage = async () => {
    await base.insert(schema.products).values({ id: produit, brandId: brand, workspaceId: ws, name: 'Lunettes', imageUrl: photo } as typeof schema.products.$inferInsert).onConflictDoNothing();
    const [ph] = photosDuProduit({ id: produit, name: 'Lunettes', imageUrl: photo, imageUrls: null }, hacherImage);
    return parametresImageDuDevis({
      consigne: { generationInstruction: 'Lunettes sur une table.', negativeConstraints: [], protectedComponents: [], needsDeterministicOverlay: false, referenceBindings: [{ referenceId: ph!.assetId, role: 'product', scope: 'product' }] },
      references: [{ assetId: ph!.assetId, assetVersion: ph!.assetVersion, sha256: ph!.sha256, role: 'product' }], largeur: 1080, hauteur: 1080,
    });
  };

  it('image du studio Image (`keyframe:s_image`) : requires_review posé par le worker, sans écran, audit des composants', async () => {
    sortieFal = () => pngSimule([20, 120, 200]);
    const id = await semerJob(await parametresImage(), { operation: OPERATION_IMAGE });
    await tours(moteur(new StockageMemoire()), id);
    const j = await job(id);
    expect(j.state).toBe('completed');
    expect(j.qualityStatus).toBe('requires_review');
    const [q] = await audits(id, 'media.quality.control');
    expect((q!.details as { nonVerifies: string[]; confirmes: string[] })).toMatchObject({ nonVerifies: ['lunettes', 'bandeau'], confirmes: [] });
  });

  it('sans produit épinglé : requires_review quand même (identité non contrôlée), jamais passed', async () => {
    sortieFal = () => pngSimule([20, 120, 200]);
    const id = await semerJob(await parametresImage(), { operation: OPERATION_IMAGE, version: versionSansProduit });
    await tours(moteur(new StockageMemoire()), id);
    const j = await job(id);
    expect([j.state, j.qualityStatus]).toEqual(['completed', 'requires_review']);
    expect((await audits(id, 'media.quality.control'))[0]!.reason).toMatch(/identité du produit non contrôlée/);
  });

  it('une autre image clé (`keyframe:s1`) garde la règle L3 : pending, aucun audit de composants', async () => {
    sortieFal = () => pngSimule([20, 120, 200]);
    const id = await semerJob(await parametresImage(), { operation: 'keyframe:s1' });
    await tours(moteur(new StockageMemoire()), id);
    const j = await job(id);
    expect([j.state, j.qualityStatus]).toEqual(['completed', 'pending']);
    expect(await audits(id, 'media.quality.control')).toEqual([]);
  });
});
