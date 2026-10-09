import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * R4 · export CONSERVÉ, sur une VRAIE base (pglite + migrations du dépôt), par
 * les vraies commandes (garde relue) et la vraie route GET. Le stockage est un
 * faux bucket en mémoire, branché des DEUX côtés (dépôt de l'export, lecture
 * des médias) · aucun réseau.
 *
 *  · l'export vérifié est déposé, relu, conservé (`studio_assets`, origine
 *    `render`, provenance de version) et désigné par la trace d'audit ;
 *  · un média MODIFIÉ depuis : la version re-rendue n'a plus la même
 *    empreinte, mais l'export V1 est servi depuis l'archive, AU MÊME HASH ;
 *  · sans archive (comportement L7-A), le même changement rend V1 non servi (409) ;
 *  · archive altérée dans le stockage : jamais servie, repli sur le re-rendu
 *    à empreinte exigée ;
 *  · droits relus à chaque téléchargement : autre espace 404, lecteur 403,
 *    média RÉVOQUÉ 422 ciblé (l'archive reste, rétablir la rend servable) ;
 *  · consultation et téléchargement n'écrivent rien ; 0 ligne `ai_spend`.
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
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, type ContenuVersion, type DocumentStudio, type StockageStudio } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { png } from './l5a-outils';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import { exporterVersion, lireExportProjet } from '../app/actions/studios/export';
import { fabriquerExport, injecterStockageExport } from '../lib/studios/export/export';
import { GET } from '../app/api/studios/export/[versionId]/route';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
/** Le faux bucket · une seule table de clés, lue par le lecteur des médias ET par la relecture de l'export. */
const bucket = new Map<string, Uint8Array>();
const depots: string[] = [];
const stockage: StockageStudio = {
  async deposer(cle, octets) { depots.push(cle); bucket.set(cle, new Uint8Array(octets)); },
  async relire(cle) { return bucket.get(cle) ?? null; },
};
const A = { fond: '', logo: '' };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { etat.session = session(ids, q); };

async function poser(cle: string, octets: Uint8Array): Promise<string> {
  bucket.set(cle, octets);
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ids.wsA, brandId: ids.brandA1, storageKey: cle, mime: 'image/png', bytes: octets.length,
    sha256: sha(octets), origin: 'upload', storageState: 'stored',
  }).returning();
  return a!.id;
}

/** Remplace le CONTENU d'un média (mêmes droits, même identifiant) · ce qu'un nouveau dépôt fait. */
async function modifierMedia(id: string, cle: string, octets: Uint8Array) {
  bucket.set(cle, octets);
  await db.update(schema.studioAssets).set({ sha256: sha(octets), bytes: octets.length }).where(eq(schema.studioAssets.id, id));
}

const fondV1 = () => png(1080, 1080, (x, y) => [20, Math.round((y / 1080) * 120), 160 + Math.round((x / 1080) * 80), 255]);
const fondV2 = () => png(1080, 1080, (x) => [200, 40, Math.round((x / 1080) * 255), 255]);

function fixture(): DocumentStudio {
  return {
    width: 1080, height: 1080, colorSpace: 'sRGB',
    layers: {
      fond: { id: 'fond', kind: 'image', name: 'Décor', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1080, rotationDeg: 0, opacity: 1, z: 0, assetId: A.fond, sourceWidth: 1080, sourceHeight: 1080, mask: null },
      titre: { id: 'titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 60, y: 60, width: 960, height: 150, rotationDeg: 0, opacity: 1, z: 20, text: 'La crème qui tient 24 h', fontId: 'f_titre', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.1 },
      logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 900, y: 960, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 22, assetId: A.logo },
    },
    fonts: { f_titre: { family: 'Sans Bold', assetId: null } },
  };
}

async function projet(titre: string): Promise<{ projectId: string; versionId: string }> {
  const contenu: ContenuVersion = { ...contenuVide(), document: fixture() };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'image', title: titre, ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ids.wsA, brandId: ids.brandA1, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}

const telecharger = (url: string) => {
  const u = new URL(url, 'http://local');
  return GET(new Request(u.toString()), { params: Promise.resolve({ versionId: u.pathname.split('/').pop()! }) });
};
const octetsDe = async (r: Response) => new Uint8Array(await r.arrayBuffer());

/** Comptes RÉELS des tables qu'un téléchargement ou une visite ne doit jamais toucher. */
async function comptes() {
  const n = async (t: string) => {
    const r = await db.execute(sql.raw(`select count(*)::int as n from ${t}`));
    return Number(((Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ n: number }>)[0]!.n);
  };
  return { assets: await n('studio_assets'), audit: await n('studio_audit_events'), depenses: await n('ai_spend'), versions: await n('studio_project_versions'), credits: await n('credit_ledger') };
}

let fetchAppele = 0;
const fetchOrigine = globalThis.fetch;

beforeAll(async () => {
  await semer(db, schema, ids);
  A.fond = await poser('studios/r4/fond.png', await fondV1());
  A.logo = await poser('studios/r4/logo.png', await png(240, 120, () => [255, 255, 255, 255]));
  injecterLecteurMedias({ lire: async (m) => bucket.get(m.storageKey) ?? null });
  injecterStockageExport(stockage);
  globalThis.fetch = (async () => { fetchAppele++; throw new Error('appel réseau interdit pendant un export'); }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = fetchOrigine; injecterLecteurMedias(null); injecterStockageExport(undefined); });
beforeEach(async () => {
  qui('ua');
  // Chaque test part du fond V1.
  const [f] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, A.fond));
  if (f!.storageKey === 'studios/r4/fond.png') await modifierMedia(A.fond, f!.storageKey, await fondV1());
});

describe('R4 · le fichier exporté est CONSERVÉ', () => {
  it('dépôt relu, ligne `studio_assets` origine render (projet, provenance de version), trace qui la désigne · 0 dépense', async () => {
    const p = await projet('Conservation');
    const avant = await comptes();
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    expect(e.export.conserve, 'l’export n’est pas conservé').toBe(true);
    const apres = await comptes();
    expect([apres.assets - avant.assets, apres.audit - avant.audit, apres.depenses - avant.depenses, apres.credits - avant.credits]).toEqual([1, 1, 0, 0]);
    expect(fetchAppele).toBe(0);

    const [audit] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.action, 'project.export'), eq(schema.studioAuditEvents.targetId, p.versionId)));
    const assetId = (audit!.details as { assetId?: string }).assetId;
    expect(assetId, 'la trace d’export ne désigne pas l’archive').toMatch(/^[0-9a-f-]{36}$/);
    const [a] = await db.select().from(schema.studioAssets).where(eq(schema.studioAssets.id, assetId!));
    expect(a).toMatchObject({
      origin: 'render', storageState: 'stored', projectId: p.projectId, brandId: ids.brandA1, workspaceId: ids.wsA,
      mime: 'image/png', sha256: e.export.sha256, bytes: e.export.octets, width: 1080, height: 1080, createdBy: ids.ua, parentAssetId: null,
    });
    expect((a!.rights as { export: unknown }).export).toEqual({ projectId: p.projectId, versionId: p.versionId, versionN: 1, format: 'png' });
    expect(a!.storageKey).toBe(`exports/${ids.wsA}/${p.projectId}/${p.versionId}/png-${e.export.sha256}.png`);
    expect(sha(bucket.get(a!.storageKey)!), 'les octets conservés ne sont pas ceux de l’export').toBe(e.export.sha256);

    // Ré-exporter le même fichier · même ligne, pas de doublon.
    const e2 = await exporterVersion({ projectId: p.projectId, format: 'png' });
    expect(e2.ok && e2.export.sha256).toBe(e.export.sha256);
    expect((await comptes()).assets).toBe(apres.assets);
    const v = await lireExportProjet({ projectId: p.projectId });
    expect(v.ok && v.vue.historique.map((h) => [h.versionN, h.conserve])).toEqual([[1, true]]);
  });

  it('relecture du dépôt différente · l’export est livré NON conservé, aucune ligne d’archive, la trace le dit', async () => {
    const p = await projet('Dépôt abîmé');
    const avant = await comptes();
    injecterStockageExport({ deposer: stockage.deposer, relire: async (cle) => { const b = bucket.get(cle); return b ? b.subarray(0, b.length - 1) : null; } });
    try {
      const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
      if (!e.ok) throw new Error(JSON.stringify(e));
      expect(e.export.conserve, 'un dépôt relu différent est déclaré conservé').toBe(false);
      expect((await comptes()).assets - avant.assets).toBe(0);
    } finally { injecterStockageExport(stockage); }
  });
});

describe('R4 · média MODIFIÉ depuis l’export · V1 servie depuis l’archive, au même hash', () => {
  it('le re-rendu a changé d’empreinte, le téléchargement sert pourtant le fichier exporté', async () => {
    const p = await projet('Média modifié');
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const v1 = await octetsDe(await telecharger(e.export.url));
    expect(sha(v1)).toBe(e.export.sha256);

    await modifierMedia(A.fond, 'studios/r4/fond.png', await fondV2());
    // Preuve que le changement est réel · la même version, re-rendue, ne redonne plus ce fichier.
    const rerendu = await fabriquerExport(ctxDe(ids, 'ua'), { projectId: p.projectId, versionId: p.versionId, format: 'png', empreinteAttendue: e.export.sha256 });
    expect(!rerendu.ok && rerendu.message, 'le média modifié ne change pas le rendu · le test ne prouverait rien').toContain('empreinte différente de celle de l’export');

    const avant = await comptes();
    const r = await telecharger(e.export.url);
    expect(r.status, 'l’export V1 n’est plus servi après modification d’un média').toBe(200);
    const servi = await octetsDe(r);
    expect(sha(servi), 'le fichier servi n’est pas celui exporté').toBe(e.export.sha256);
    expect(Buffer.compare(Buffer.from(servi), Buffer.from(v1))).toBe(0);
    expect(r.headers.get('x-studio-sha256')).toBe(e.export.sha256);
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="media-modifie-v1-png.png"');
    expect(await comptes(), 'un téléchargement a écrit').toEqual(avant);
  });

  it('témoin L7-A · le même changement SANS archive rend l’export non servi (jamais un autre fichier)', async () => {
    const p = await projet('Sans archive');
    const e = await (async () => {
      injecterStockageExport(null);
      try { return await exporterVersion({ projectId: p.projectId, format: 'png' }); } finally { injecterStockageExport(stockage); }
    })();
    if (!e.ok) throw new Error(JSON.stringify(e));
    expect(e.export.conserve).toBe(false);
    expect((await telecharger(e.export.url)).status).toBe(200);
    await modifierMedia(A.fond, 'studios/r4/fond.png', await fondV2());
    const r = await telecharger(e.export.url);
    expect(r.status).toBe(409);
    expect((await r.json() as { message: string }).message).toContain('empreinte différente de celle de l’export');
  });

  it('archive altérée dans le stockage · jamais servie ; repli sur le re-rendu à empreinte exigée', async () => {
    const p = await projet('Archive altérée');
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const cle = `exports/${ids.wsA}/${p.projectId}/${p.versionId}/png-${e.export.sha256}.png`;
    const bon = bucket.get(cle)!;
    bucket.set(cle, await png(1080, 1080, () => [0, 0, 0, 255]));
    try {
      // Médias inchangés · le re-rendu redonne l'empreinte exacte, servi.
      const r = await telecharger(e.export.url);
      expect(r.status).toBe(200);
      expect(sha(await octetsDe(r)), 'une archive altérée a été servie').toBe(e.export.sha256);
      // Média modifié en plus · ni l'archive (altérée) ni le re-rendu (autre empreinte) · refus.
      await modifierMedia(A.fond, 'studios/r4/fond.png', await fondV2());
      const r2 = await telecharger(e.export.url);
      expect(r2.status, 'une archive altérée a été servie').toBe(409);
      expect((await r2.json() as { message: string }).message).toContain('empreinte différente de celle de l’export');
    } finally { bucket.set(cle, bon); }
  });
});

describe('R4 · droits relus à chaque téléchargement', () => {
  it('autre espace · 404 neutre, rien n’est écrit', async () => {
    const p = await projet('Autre espace');
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const avant = await comptes();
    qui('ub');
    const r = await telecharger(e.export.url);
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain(p.projectId);
    expect(await comptes()).toEqual(avant);
  });

  it('lecteur sans `studio.export` · 403', async () => {
    const p = await projet('Lecteur');
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    qui('uv');
    expect((await telecharger(e.export.url)).status).toBe(403);
  });

  it('média RÉVOQUÉ · l’archive n’est pas servie (422, cible logo), elle reste ; rétabli, elle l’est de nouveau', async () => {
    const p = await projet('Révocation');
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const avant = await comptes();
    await db.update(schema.studioAssets).set({ storageState: 'deleted' }).where(eq(schema.studioAssets.id, A.logo));
    try {
      const r = await telecharger(e.export.url);
      expect(r.status, 'un export contenant un média révoqué est encore servi').toBe(422);
      const corps = await r.json() as { code: string; message: string };
      expect(corps.code).toBe('MISSING_REFERENCE');
      expect(corps.message).toBe('Téléchargement refusé · Calque logo « Logo » · média retiré depuis l’export · le fichier conservé n’est plus servi tant qu’il n’est pas rétabli. Le fichier reste conservé.');
      expect((await comptes()).assets, 'l’archive a été effacée').toBe(avant.assets);
    } finally {
      await db.update(schema.studioAssets).set({ storageState: 'stored' }).where(eq(schema.studioAssets.id, A.logo));
    }
    const r2 = await telecharger(e.export.url);
    expect(r2.status).toBe(200);
    expect(sha(await octetsDe(r2))).toBe(e.export.sha256);
  });
});

describe('R4 · consulter n’écrit rien', () => {
  it('visite de l’écran et téléchargement · aucune ligne écrite, aucune dépense, aucun appel réseau', async () => {
    const p = await projet('Lecture pure');
    const e = await exporterVersion({ projectId: p.projectId, format: 'jpeg' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const avant = await comptes();
    const deposes = depots.length;
    expect((await lireExportProjet({ projectId: p.projectId })).ok).toBe(true);
    expect((await telecharger(e.export.url)).status).toBe(200);
    expect(await comptes()).toEqual(avant);
    expect(depots.length, 'un téléchargement a déposé dans le stockage').toBe(deposes);
    expect(avant.depenses).toBe(0);
    expect(fetchAppele).toBe(0);
  });
});
