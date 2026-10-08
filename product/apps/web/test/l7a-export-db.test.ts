import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L7-A · export image d'une version, sur une VRAIE base (pglite + migrations
 * du dépôt), par les vraies commandes (garde relue), la vraie route GET, et
 * des fichiers RÉELLEMENT décodés.
 *
 *  · EXPORT-02 · fixture texte + recadrage + logo : pixels du PNG exporté
 *    IDENTIQUES à ceux de l'aperçu (tolérance 0), même empreinte ; logo à sa
 *    place au pixel ; JPEG décodé aux dimensions du document ;
 *  · EXPORT-01 · police absente, média absent : refus CIBLÉ, aucun fichier,
 *    aucune trace d'export ;
 *  · EXPORT-04 · fichier vérifié : type réel, dimensions, empreinte ; un
 *    encodeur qui abîme le fichier est refusé à la vérification ;
 *  · EXPORT-05 · V1 puis V2 : V1 se télécharge encore, au même hash ;
 *  · sécurité · autre espace, rôle sans `studio.export`, ressource révoquée
 *    après l'aperçu, restriction de marque : refus ;
 *  · coût · 0 ligne de dépense, aucun appel réseau ; un GET n'écrit rien.
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

import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { empreinteContenu, inspecterMedia, contenuVide, SCHEMA_VERSION_CONTENU, type ContenuVersion, type DocumentStudio } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe, compter, delta } from './l4a-outils';
import { png, decoder, boite } from './l5a-outils';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import { enregistrerVersion } from '../lib/studios/depot';
import { rendreApercu } from '../app/actions/studios/rendu';
import { exporterVersion, lireExportProjet } from '../app/actions/studios/export';
import { exporterVersionPour, type ExportRealise } from '../lib/studios/export/export';
import { GET } from '../app/api/studios/export/[versionId]/route';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const stockage = new Map<string, Uint8Array>();
const A = { fond: '', produit: '', logo: '', logoA2: '' };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { etat.session = session(ids, q); };

async function poser(brand: string, cle: string, octets: Uint8Array): Promise<string> {
  stockage.set(cle, octets);
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ids.wsA, brandId: brand, storageKey: cle, mime: 'image/png', bytes: octets.length,
    sha256: sha(octets), origin: 'upload', storageState: 'stored',
  }).returning();
  return a!.id;
}

/** Fixture EXPORT-02 · décor RECADRÉ (déborde du cadre), produit, titre, appel, logo opaque. */
function fixture(o: { fond: string; produit: string; logo: string; famille?: string }): DocumentStudio {
  return {
    width: 1080, height: 1080, colorSpace: 'sRGB',
    layers: {
      fond: { id: 'fond', kind: 'image', name: 'Décor', visible: true, locked: false, x: -120, y: -60, width: 1320, height: 1320, rotationDeg: 0, opacity: 1, z: 0, assetId: o.fond, sourceWidth: 1080, sourceHeight: 1080, mask: null },
      produit: { id: 'produit', kind: 'image', name: 'Produit', visible: true, locked: true, x: 330, y: 260, width: 420, height: 630, rotationDeg: 0, opacity: 1, z: 10, assetId: o.produit, sourceWidth: 400, sourceHeight: 600, mask: null },
      titre: { id: 'titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 60, y: 60, width: 960, height: 150, rotationDeg: 0, opacity: 1, z: 20, text: 'La crème qui tient 24 h', fontId: 'f_titre', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.1 },
      cta: { id: 'cta', kind: 'text', name: 'Appel', visible: true, locked: false, x: 290, y: 940, width: 500, height: 60, rotationDeg: 0, opacity: 1, z: 21, text: 'Je la teste', fontId: 'f_corps', fontSizePx: 40, color: '#ffe14d', align: 'center', lineHeight: 1.2 },
      logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 900, y: 960, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 22, assetId: o.logo },
    },
    fonts: { f_titre: { family: o.famille ?? 'Sans Bold', assetId: null }, f_corps: { family: 'Sans', assetId: null } },
  };
}

async function projet(doc: DocumentStudio | null, brand = ids.brandA1, titre = 'Sérum · accroche au réveil'): Promise<{ projectId: string; versionId: string }> {
  const ws = brand === ids.brandB1 ? ids.wsB : ids.wsA;
  const contenu: ContenuVersion = { ...contenuVide(), document: doc };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'image', title: titre, ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ws, brandId: brand, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}

const telecharger = (url: string) => {
  const u = new URL(url, 'http://local');
  const versionId = u.pathname.split('/').pop()!;
  return GET(new Request(u.toString()), { params: Promise.resolve({ versionId }) });
};
const octetsDe = async (r: Response) => new Uint8Array(await r.arrayBuffer());
const exportsAudites = async () => db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'project.export'));

let fetchAppele = 0;
const fetchOrigine = globalThis.fetch;
let principal: { projectId: string; versionId: string };

beforeAll(async () => {
  await semer(db, schema, ids);
  A.fond = await poser(ids.brandA1, 'studios/a/fond.png', await png(1080, 1080, (x, y) => [20, Math.round((y / 1080) * 120), 160 + Math.round((x / 1080) * 80), 255]));
  A.produit = await poser(ids.brandA1, 'studios/a/produit.png', await png(400, 600, (x, y) => (x < 4 || x >= 396 || y < 4 || y >= 596 ? [0, 0, 0, 0] : (y >> 4) & 1 ? [220, 20, 40, 255] : [180, 10, 30, 255])));
  A.logo = await poser(ids.brandA1, 'studios/a/logo.png', await png(240, 120, () => [255, 255, 255, 255]));
  A.logoA2 = await poser(ids.brandA2, 'studios/a2/logo.png', await png(240, 120, () => [9, 9, 9, 255]));
  injecterLecteurMedias({ lire: async (m) => stockage.get(m.storageKey) ?? null });
  principal = await projet(fixture(A));
  // Aucun appel réseau : un export est un calcul local.
  globalThis.fetch = (async () => { fetchAppele++; throw new Error('appel réseau interdit pendant un export'); }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = fetchOrigine; injecterLecteurMedias(null); });
beforeEach(() => qui('ua'));

describe('EXPORT-02 · même définition aperçu / export', () => {
  it('PNG · pixels de l’export IDENTIQUES à l’aperçu (tolérance 0), même empreinte, logo et recadrage au pixel', async () => {
    const ap = await rendreApercu({ projectId: principal.projectId, versionId: principal.versionId });
    if (!ap.ok) throw new Error(JSON.stringify(ap));
    const e = await exporterVersion({ projectId: principal.projectId, versionId: principal.versionId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const r = await telecharger(e.export.url);
    expect(r.status).toBe(200);
    const fichier = await octetsDe(r);

    const apercu = await decoder(Buffer.from(ap.apercu.image.split(',')[1]!, 'base64'));
    const exporte = await decoder(fichier);
    expect([exporte.largeur, exporte.hauteur]).toEqual([1080, 1080]);
    let ecart = 0;
    for (let i = 0; i < apercu.donnees.length; i++) ecart = Math.max(ecart, Math.abs(apercu.donnees[i]! - exporte.donnees[i]!));
    expect(ecart, 'les pixels exportés diffèrent de l’aperçu').toBe(0);
    expect(sha(fichier)).toBe(ap.apercu.sha256);
    expect(e.export.sha256).toBe(ap.apercu.sha256);

    // Logo opaque blanc : sa boîte au pixel près (≤ 1 px), au-dessus du décor.
    const b = boite(exporte, (p, i) => p[i] === 255 && p[i + 1] === 255 && p[i + 2] === 255 && i >= (900 * 1080) * 4);
    expect(b).not.toBeNull();
    expect(Math.abs(b!.x0 - 900)).toBeLessThanOrEqual(1);
    expect(Math.abs(b!.x1 - 1019)).toBeLessThanOrEqual(1);
    expect(Math.abs(b!.y0 - 960)).toBeLessThanOrEqual(1);
    expect(Math.abs(b!.y1 - 1019)).toBeLessThanOrEqual(1);
    // Recadrage : le décor déborde, le coin haut gauche du fichier est le décor (pas du vide).
    expect(exporte.donnees[3]).toBe(255);
    // Le texte jaune de l'appel est dessiné dans son cadre.
    const jaune = boite(exporte, (p, i) => p[i]! > 240 && p[i + 1]! > 210 && p[i + 2]! < 110);
    expect(jaune && jaune.y0 >= 940 && jaune.y1 < 1000 && jaune.x0 >= 290 && jaune.x1 < 790, 'texte de l’appel absent ou hors cadre').toBe(true);
  });

  it('JPEG · décodé, dimensions du document, type réel JPEG, empreinte annoncée', async () => {
    const e = await exporterVersion({ projectId: principal.projectId, versionId: principal.versionId, format: 'jpeg' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const r = await telecharger(e.export.url);
    expect(r.status).toBe(200);
    const fichier = await octetsDe(r);
    expect(inspecterMedia(fichier)?.mime).toBe('image/jpeg');
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    const { info } = await sharp(fichier, { failOn: 'warning' }).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1080, 1080]);
    expect(sha(fichier)).toBe(e.export.sha256);
    expect(r.headers.get('x-studio-sha256')).toBe(e.export.sha256);
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="serum-accroche-au-reveil-v1-jpeg.jpg"');
  });
});

describe('EXPORT-01 · préflight ciblé, aucun fichier prétendu terminé', () => {
  it('police absente · refus ciblé (calque, police), aucune trace d’export', async () => {
    const p = await projet(fixture({ ...A, famille: 'Inter' }));
    const avant = (await exportsAudites()).length;
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (e.ok) throw new Error('export accepté malgré une police absente');
    expect(e.code).toBe('MISSING_REFERENCE');
    expect('preflight' in e && e.preflight?.map((v) => [v.cause, v.cible.calqueId, v.cible.famille])).toEqual([['police_absente', 'titre', 'Inter']]);
    expect(e.message).toContain('Calque texte « Titre »');
    expect(e.message).toContain('Aucun fichier n’a été produit');
    expect((await exportsAudites()).length, 'un export refusé a laissé une trace d’export').toBe(avant);
    // L'écran le dit à la visite, avec la même cible.
    const v = await lireExportProjet({ projectId: p.projectId });
    expect(v.ok && !v.vue.preflight.ok && v.vue.preflight.violations[0]!.cible.calqueId).toBe('titre');
  });

  it('média absent · refus ciblé (calque logo, média), aucune trace d’export', async () => {
    const inconnu = randomUUID();
    const p = await projet(fixture({ ...A, logo: inconnu }));
    const avant = (await exportsAudites()).length;
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (e.ok) throw new Error('export accepté malgré un média absent');
    expect(e.code).toBe('MISSING_REFERENCE');
    expect('preflight' in e && e.preflight?.map((v) => [v.cause, v.cible.calqueId, v.cible.kind, v.cible.assetId])).toEqual([['media_absent', 'logo', 'logo', inconnu]]);
    expect((await exportsAudites()).length).toBe(avant);
  });

  it('média d’une autre marque du même espace · absent pour ce projet (pas d’usage inter-marques)', async () => {
    const p = await projet(fixture({ ...A, logo: A.logoA2 }));
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    expect(!e.ok && 'preflight' in e && e.preflight?.[0]?.cible.calqueId).toBe('logo');
  });
});

describe('EXPORT-04 · fichier vérifié par un décodage réel', () => {
  it('encodeur qui tronque le fichier · refusé à la vérification, rien n’est audité ni livré', async () => {
    const avant = (await exportsAudites()).length;
    const r = await exporterVersionPour(ctxDe(ids, 'ua'), { projectId: principal.projectId, format: 'png' }, {
      encoder: async (rendu) => new Uint8Array(rendu.png.subarray(0, rendu.png.length - 200)),
    });
    if (r.ok) throw new Error('fichier tronqué déclaré terminé');
    expect(r.code).toBe('INVARIANT_CONFLICT');
    expect(r.message).toContain('il n’est pas livré');
    expect((await exportsAudites()).length).toBe(avant);
  });

  it('encodeur qui dégrade les pixels (PNG à palette) · décodable mais refusé : pixels ≠ rendu', async () => {
    const r = await exporterVersionPour(ctxDe(ids, 'ua'), { projectId: principal.projectId, format: 'png' }, {
      encoder: async (rendu) => sharp(rendu.png).png({ palette: true, colours: 16 }).toBuffer(),
    });
    expect(!r.ok && r.message).toContain('pixels différents du rendu');
  });

  it('format inconnu · refusé avant tout rendu', async () => {
    const e = await exporterVersion({ projectId: principal.projectId, format: 'gif' });
    expect(!e.ok && e.code).toBe('INVALID_SCHEMA');
  });
});

describe('EXPORT-05 · historique · V1 reste accessible après V2', () => {
  it('V1 exportée, V2 créée et exportée · V1 se re-télécharge au même hash, l’historique garde les deux', async () => {
    const p = await projet(fixture(A), ids.brandA1, 'Historique');
    const e1 = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e1.ok) throw new Error(JSON.stringify(e1));
    const v1Avant = (await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p.versionId)))[0]!;

    const s = await enregistrerVersion(ctxDe(ids, 'ua'), {
      projectId: p.projectId, baseVersionId: p.versionId,
      changes: [{ op: 'replace', path: '/document/layers/titre/text', newValue: 'Nouvelle accroche', reason: 'V2' }], allowedPaths: ['/document'], raison: 'V2',
    });
    if (!s.ok) throw new Error(JSON.stringify(s));
    const e2 = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e2.ok) throw new Error(JSON.stringify(e2));
    expect(e2.export.versionId).toBe(s.version.id);
    expect(e2.export.sha256).not.toBe(e1.export.sha256);
    // Même nom de schéma, versions différentes · le nom ne désigne pas la version.
    expect(e1.export.nomFichier).toBe('historique-v1-png.png');
    expect(e2.export.nomFichier).toBe('historique-v2-png.png');

    const r1 = await telecharger(e1.export.url);
    expect(r1.status).toBe(200);
    expect(sha(await octetsDe(r1)), 'V1 re-téléchargée n’a plus la même empreinte').toBe(e1.export.sha256);
    expect(r1.headers.get('x-studio-version-id')).toBe(p.versionId);

    // V1 ré-exportée APRÈS V2, par son identifiant · même empreinte (rendu déterministe), une seule entrée d'historique.
    const e1bis = await exporterVersion({ projectId: p.projectId, versionId: p.versionId, format: 'png' });
    expect(e1bis.ok && e1bis.export.sha256, 'V1 ré-exportée n’a plus la même empreinte').toBe(e1.export.sha256);

    const v = await lireExportProjet({ projectId: p.projectId });
    if (!v.ok) throw new Error(v.code);
    // Le plus récent d'abord (V1 vient d'être ré-exportée), chaque fichier une fois.
    expect(v.vue.historique.map((h) => [h.versionN, h.versionId, h.sha256])).toEqual([[1, p.versionId, e1.export.sha256], [2, s.version.id, e2.export.sha256]]);
    // L'export ne modifie pas la version.
    const v1Apres = (await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p.versionId)))[0]!;
    expect(v1Apres.contentHash).toBe(v1Avant.contentHash);
  });

  it('une empreinte jamais exportée, ou le nom de fichier à la place de la version · 404', async () => {
    const e = await exporterVersion({ projectId: principal.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    expect((await telecharger(e.export.url.replace(/empreinte=[0-9a-f]+/, `empreinte=${'0'.repeat(64)}`))).status).toBe(404);
    expect((await telecharger(e.export.url.replace(/png&/, 'jpeg&'))).status).toBe(404);
    expect((await telecharger(`/api/studios/export/${e.export.nomFichier}?format=png&empreinte=${e.export.sha256}`)).status).toBe(404);
  });
});

describe('sécurité · portée et droits relus au moment de l’export', () => {
  it('autre espace · export et téléchargement refusés comme « introuvable », rien n’est écrit', async () => {
    qui('ua');
    const e = await exporterVersion({ projectId: principal.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const avant = await compter(db);
    qui('ub');
    const x = await exporterVersion({ projectId: principal.projectId, versionId: principal.versionId, format: 'png' });
    expect(!x.ok && x.code).toBe('NOT_FOUND');
    const r = await telecharger(e.export.url);
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain(principal.projectId);
    expect(delta(avant, await compter(db))).toEqual({});
  });

  it('rôle sans `studio.export` (lecteur) · consulte le contrôle, n’exporte ni ne télécharge', async () => {
    const e = await exporterVersion({ projectId: principal.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    qui('uv');
    const v = await lireExportProjet({ projectId: principal.projectId });
    expect(v.ok && v.vue.peutExporter).toBe(false);
    const x = await exporterVersion({ projectId: principal.projectId, format: 'png' });
    expect(!x.ok && x.code).toBe('FORBIDDEN');
    expect((await telecharger(e.export.url)).status).toBe(403);
    // Le noyau du serveur refuse aussi, même appelé directement avec ce contexte.
    const y = await exporterVersionPour(ctxDe(ids, 'uv'), { projectId: principal.projectId, format: 'png' });
    expect(!y.ok && y.code).toBe('FORBIDDEN');
  });

  it('ressource révoquée APRÈS l’aperçu · l’export est refusé avec sa cible, l’ancien fichier n’est plus servi', async () => {
    const p = await projet(fixture(A), ids.brandA1, 'Révocation');
    const e = await exporterVersion({ projectId: p.projectId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    const v = await lireExportProjet({ projectId: p.projectId });
    expect(v.ok && v.vue.preflight.ok).toBe(true);
    await db.update(schema.studioAssets).set({ storageState: 'deleted' }).where(eq(schema.studioAssets.id, A.logo));
    try {
      const x = await exporterVersion({ projectId: p.projectId, format: 'png' });
      expect(!x.ok && 'preflight' in x && x.preflight?.map((w) => [w.cause, w.cible.calqueId])).toEqual([['media_absent', 'logo']]);
      expect((await telecharger(e.export.url)).status).toBe(422);
    } finally {
      await db.update(schema.studioAssets).set({ storageState: 'stored' }).where(eq(schema.studioAssets.id, A.logo));
    }
  });

  it('restriction de marque posée après coup · relue à l’export : projet introuvable', async () => {
    await db.insert(schema.studioMemberBrandScopes).values({ workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA2 });
    try {
      const x = await exporterVersion({ projectId: principal.projectId, format: 'png' });
      expect(!x.ok && x.code).toBe('NOT_FOUND');
    } finally {
      await db.delete(schema.studioMemberBrandScopes).where(and(eq(schema.studioMemberBrandScopes.userId, ids.ua), eq(schema.studioMemberBrandScopes.brandId, ids.brandA2)));
    }
    expect((await exporterVersion({ projectId: principal.projectId, format: 'png' })).ok).toBe(true);
  });
});

describe('coût et écritures', () => {
  it('un export · 0 dépense, 0 crédit, 0 job, 0 version, aucun appel réseau · UNE ligne d’audit', async () => {
    const avant = await compter(db);
    const appels = fetchAppele;
    const e = await exporterVersion({ projectId: principal.projectId, format: 'jpeg' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    expect(delta(avant, await compter(db))).toEqual({ audit: 1 });
    expect(fetchAppele).toBe(appels);
    const [a] = (await exportsAudites()).filter((x) => (x.details as { sha256?: string }).sha256 === e.export.sha256);
    expect(a).toMatchObject({ targetType: 'studio_project_version', targetId: principal.versionId, brandId: ids.brandA1, actorId: ids.ua });
    expect(a!.details).toMatchObject({ versionId: principal.versionId, format: 'jpeg', sha256: e.export.sha256, largeur: 1080, hauteur: 1080 });
  });

  it('téléchargement et visite de l’écran · lectures pures, rien n’est écrit', async () => {
    const e: ExportRealise = await (async () => { const r = await exporterVersion({ projectId: principal.projectId, format: 'png' }); if (!r.ok) throw new Error(r.code); return r.export; })();
    const avant = await compter(db);
    expect((await telecharger(e.url)).status).toBe(200);
    expect((await lireExportProjet({ projectId: principal.projectId })).ok).toBe(true);
    expect(delta(avant, await compter(db))).toEqual({});
  });
});
