import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Studios · deux endroits qui ne jugeaient pas un logo de la charte par son
 * EMPREINTE (#993) · l'atelier « Identités et voix » et l'EXPORT d'une version.
 * Vraie base (pglite + migrations), FAUX S3 à ETag MD5 qui honore `If-Match`
 * (HEAD et GET, octets PNG réels), les VRAIES pages Spatiales rendues en HTML
 * (`/studio/projets/[id]/identites`, `/studio/projets/[id]/export`), la VRAIE
 * commande d'export, la vraie route de téléchargement. 0 $ · aucun fournisseur.
 *
 * On lit ce qui SORT · le HTML, le refus, les pixels du fichier, et les
 * requêtes parties au stockage :
 *  - Identités · un plan dont l'image clé utiliserait le logo REMPLACÉ le dit
 *    sur ce plan (même annonce que l'écran vidéo), un HEAD au plus ; intact,
 *    sans empreinte, non lié · rien (sans empreinte ni lien · aucune requête) ;
 *  - Export · REMPLACÉ ⇒ le logo n'est pas embarqué · l'écran et la commande
 *    le disent (« Logo à réimporter »), aucun fichier, aucune trace ; intact ⇒
 *    le fichier porte les octets VÉRIFIÉS, une seule lecture conditionnelle
 *    pour tout l'export (préflight et rendu) ; sans empreinte ⇒ comme avant
 *    (lecture simple, aucun If-Match).
 */
const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, chemin: '/studio/projets' }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.logo4.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.logo4.test/bucket' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => h.chemin, useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': h.chemin }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import {
  ACTION_CONSIGNE_PLAN, MESSAGES_LOGO_SERVI, RAISONS_LOGO_EXPORT, construireConsignePlan, contenuVide, empreinteContenu, entreesConsignePlan, idLogoMarque,
  versionDepuisEmpreinte, SCHEMA_VERSION_CONTENU, type ContenuVersion, type DocumentStudio,
} from '@tiktrends/core';
import { contexteDepuisSession } from '../lib/studios/garde';
import { hacherImage } from '../lib/studios/produit/catalogue';
import { ajouterAudit } from '../lib/studios/audit';
import { retenirConsignePlanPour } from '../lib/studios/video/consigne';
import { exporterVersion } from '../app/actions/studios/export';
import { rendreApercu } from '../app/actions/studios/rendu';
import { GET as telecharger } from '../app/api/studios/export/[versionId]/route';
import PageIdentites from '../app/(spatial)/sp/studio/projets/[id]/identites/page';
import PageExport from '../app/(spatial)/sp/studio/projets/[id]/export/page';
import { semer, session } from './studios-semis';
import { projetVideo } from './l4a-outils';
import { png, decoder } from './l5a-outils';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const ids = h.ids;
const T = new Date('2026-10-08T10:00:00Z');
const IDENTITE = `/brands/${ids.brandA1}/identite`;
const qui = (role: 'member' | 'admin' = 'member') => { h.session = session(ids, 'ua', { role }); };
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);

/* ───────────── Le faux bucket · ETag = MD5 du corps, If-Match honoré (HEAD et GET) ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
const md5 = (o: Buffer) => createHash('md5').update(o).digest('hex');
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('réseau coupé', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode, cle, ifMatch });
  const o = bucket.get(cle);
  if (!o) return new Response(null, { status: 404 });
  if (ifMatch !== null && ifMatch !== `"${md5(o)}"`) return new Response(null, { status: 412 });
  const entetes = { 'content-length': String(o.length), 'content-type': 'image/png', etag: `"${md5(o)}"` };
  return methode === 'HEAD' ? new Response(null, { status: 200, headers: entetes }) : new Response(new Uint8Array(o), { status: 200, headers: entetes });
}

/** Le logo par défaut de la marque A1 · un PNG du bucket de l'espace, importé (empreinte) ou ancien (sans). */
const LOGO = `${CFG.publicBaseUrl}/assets/${ids.wsA}/1-abcd1234-logo.png`;
const CLE = LOGO.slice(CFG.publicBaseUrl.length + 1);
const SHA_LOGO = hacherImage(LOGO).sha256;
const ID_LOGO = idLogoMarque(ids.brandA1, SHA_LOGO);
/** Bleu franc · l'original importé ; rouge franc · ce qui a été redéposé à la même adresse. */
const BLEU = [10, 60, 220, 255] as const;
const ROUGE = [230, 20, 20, 255] as const;
let ORIGINAL: Buffer;
let REMPLACANT: Buffer;
async function charte(o: { empreinte: boolean }) {
  bucket.clear();
  bucket.set(CLE, ORIGINAL);
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO], logoEmpreintes: o.empreinte ? { [LOGO]: md5(ORIGINAL) } : null }).where(eq(schema.brands.id, ids.brandA1));
}
const remplacer = () => bucket.set(CLE, REMPLACANT);

/* ───────────── Les vraies pages ───────────── */

async function page(P: (p: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) => Promise<unknown>, projectId: string): Promise<string> {
  requetes.length = 0;
  const el = await P({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(avecSpatial(el as ReactElement));
}
const identites = (projectId: string) => { h.chemin = `/studio/projets/${projectId}/identites`; return page(PageIdentites as never, projectId); };
const ecranExport = (projectId: string) => { h.chemin = `/studio/projets/${projectId}/export`; return page(PageExport as never, projectId); };
/** Le bloc HTML d'un plan de « Voix et temps ». */
const blocPlan = (html: string, sid: string) => {
  const i = html.indexOf(`data-plan="${sid}"`);
  if (i < 0) throw new Error(`plan ${sid} absent de la page`);
  const j = html.indexOf('data-plan="', i + 10);
  return html.slice(i, j < 0 ? html.indexOf('data-temps=', i) : j);
};

/* ───────────── Identités · un projet vidéo dont la consigne d'un plan lie le logo ───────────── */

const PLAN = 's_ouverture';
async function projetIdentites(o: { lie: boolean }) {
  const p = await projetVideo(db as never, ids, ids.brandA1, ids.ua);
  if (!o.lie) return p.projectId;
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p.versionId));
  const contenu = v!.content as ContenuVersion;
  const runId = randomUUID();
  const c = construireConsignePlan({
    runId, shotId: PLAN, sourceVersionId: p.versionId, entrees: entreesConsignePlan(contenu, PLAN)!,
    resultat: { generationInstruction: 'Léa face au miroir, le logo de la marque sur le flacon.', referenceBindings: [{ referenceId: ID_LOGO, role: 'logo', scope: 'global' }], protectedComponents: [] },
    references: [{ assetId: ID_LOGO, assetVersion: versionDepuisEmpreinte(SHA_LOGO), sha256: SHA_LOGO, role: 'logo' }],
    composantsProteges: [], surimpression: false, largeur: 1080, hauteur: 1920, compileeLe: T,
  });
  if (!c.ok) throw new Error(JSON.stringify(c.violations));
  const ctx = contexteDepuisSession(session(ids, 'ua'), [ids.brandA1, ids.brandA2], [], `st_logo4_${randomUUID().slice(0, 6)}`);
  await ajouterAudit(db, ctx, {
    action: ACTION_CONSIGNE_PLAN, brandId: ids.brandA1, targetType: 'studio_project', targetId: p.projectId,
    versionBefore: p.versionId, versionAfter: null, reason: 'Consigne d’image du plan compilée et validée par le serveur',
    details: { runId, shotId: PLAN, empreinte: c.empreinte, consigne: c.consigne },
  });
  const r = await retenirConsignePlanPour(ctx, { projectId: p.projectId, baseVersionId: p.versionId, runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p.projectId;
}

/* ───────────── Export · un document dont un calque est le logo de la charte ───────────── */

const docLogo = (): DocumentStudio => ({
  width: 400, height: 400, colorSpace: 'sRGB', fonts: {},
  layers: { logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 100, y: 100, width: 200, height: 100, rotationDeg: 0, opacity: 1, z: 1, assetId: ID_LOGO } },
}) as DocumentStudio;
async function projetExport(): Promise<{ projectId: string; versionId: string }> {
  const contenu: ContenuVersion = { ...contenuVide(), document: docLogo() };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'image', title: 'Logo de la charte', ownerId: ids.ua }).returning();
  const [v] = await db.insert(schema.studioProjectVersions).values({
    projectId: p!.id, workspaceId: ids.wsA, brandId: ids.brandA1, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}
const exportsAudites = async () => (await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'project.export'))).length;
/** Le pixel au centre du calque logo, dans le fichier livré. */
const centreLogo = async (o: Uint8Array) => { const d = await decoder(o); const i = (150 * d.largeur + 200) * 4; return [...d.donnees.slice(i, i + 4)]; };
const lecturesLogo = () => requetes.filter((r) => r.cle === CLE).map((r) => `${r.methode} ${r.ifMatch ? 'If-Match' : 'simple'}`);

beforeAll(async () => {
  await semer(db, schema, ids);
  ORIGINAL = await png(240, 120, () => [...BLEU]);
  REMPLACANT = await png(240, 120, () => [...ROUGE]);
});
beforeEach(() => { qui(); requetes.length = 0; vi.stubGlobal('fetch', fauxBucket); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Atelier Identités · un logo que l’image clé d’un plan utiliserait', () => {
  it('REMPLACÉ · la vraie page le dit sur ce plan (nom, conséquence, qui peut le réimporter), un seul HEAD If-Match, aucun geste fermé', async () => {
    await charte({ empreinte: true });
    const p = await projetIdentites({ lie: true });
    remplacer();
    const html = await identites(p);
    const bloc = blocPlan(html, PLAN);
    expect(bloc, 'l’annonce est sur le plan qui lie le logo').toContain(`data-logo-a-reimporter="${ID_LOGO}"`);
    expect(bloc).toContain(esc('Logo à réimporter · « Logo principal » : son fichier a été remplacé ou n’est plus dans le stockage depuis l’import.'));
    expect(bloc).toContain(esc('un administrateur de l’espace peut le faire dans l’Identité de la marque.'));
    expect(html, 'sans gestion · aucun lien vers une fiche qui le renverrait').not.toContain('identite-marque');
    expect(blocPlan(html, 's_produit'), 'autre plan · rien').not.toContain('data-logo-a-reimporter');
    expect(blocPlan(html, 's_fin'), 'autre plan · rien').not.toContain('data-logo-a-reimporter');
    expect(html.match(/data-logo-a-reimporter=/g)?.length, 'une seule annonce sur la page').toBe(1);
    expect(requetes, 'une seule vérification · HEAD signé avec If-Match, aucun octet lu').toEqual([{ methode: 'HEAD', cle: CLE, ifMatch: `"${md5(ORIGINAL)}"` }]);
    expect(html, 'la fiche reste éditable').toContain('data-geste="nouvelle-fiche"');
  });

  it('REMPLACÉ, admin de l’espace · le lien vers l’Identité de la marque', async () => {
    await charte({ empreinte: true });
    const p = await projetIdentites({ lie: true });
    remplacer();
    qui('admin');
    const bloc = blocPlan(await identites(p), PLAN);
    expect(bloc).toMatch(new RegExp(`<a data-lien="identite-marque" href="${IDENTITE}">Ouvrir l’Identité de la marque</a>`));
    expect(bloc).toContain(esc('réimporte-le dans l’Identité de la marque avant de préparer ton visuel.'));
  });

  it('intact · rien à annoncer, un seul HEAD', async () => {
    await charte({ empreinte: true });
    const p = await projetIdentites({ lie: true });
    const html = await identites(p);
    expect(html).not.toContain('data-logo-a-reimporter');
    expect(lecturesLogo()).toEqual(['HEAD If-Match']);
  });

  it('logo SANS empreinte (même redéposé) · comme avant, aucune requête au stockage, rien à annoncer', async () => {
    await charte({ empreinte: false });
    const p = await projetIdentites({ lie: true });
    remplacer();
    const html = await identites(p);
    expect(requetes).toEqual([]);
    expect(html).not.toContain('data-logo-a-reimporter');
  });

  it('aucun logo lié aux plans (logo de la charte remplacé) · rien à annoncer, aucune requête', async () => {
    await charte({ empreinte: true });
    const p = await projetIdentites({ lie: false });
    remplacer();
    const html = await identites(p);
    expect(requetes).toEqual([]);
    expect(html).not.toContain('data-logo-a-reimporter');
  });
});

describe('Export · un calque logo de la charte', () => {
  it('REMPLACÉ · la vraie page le dit (calque, « Logo à réimporter », pas embarqué), exporter est fermé, une seule lecture If-Match', async () => {
    await charte({ empreinte: true });
    const { projectId } = await projetExport();
    remplacer();
    const html = await ecranExport(projectId);
    expect(html).toContain('data-preflight="refus"');
    const i = html.indexOf('data-cause="logo_a_reimporter"');
    expect(i, 'le point bloquant est le logo à réimporter').toBeGreaterThan(0);
    expect(html.slice(i)).toContain(esc(`Calque logo « Logo » · ${RAISONS_LOGO_EXPORT.remplace}`));
    expect(html, 'sans gestion · pas de lien').not.toContain('identite-marque');
    expect(html).toMatch(/<button[^>]*data-format="png"[^>]*disabled=""/);
    expect(lecturesLogo(), 'le logo n’est lu que s’il est l’objet de l’import · un GET conditionnel, refusé (412)').toEqual(['GET If-Match']);
  });

  it('REMPLACÉ · la commande refuse (MISSING_REFERENCE, phrase), aucun fichier, aucune trace ; l’aperçu refuse aussi avec la phrase du service', async () => {
    await charte({ empreinte: true });
    const { projectId, versionId } = await projetExport();
    remplacer();
    const avant = await exportsAudites();
    requetes.length = 0;
    const e = await exporterVersion({ projectId, versionId, format: 'png' });
    if (e.ok) throw new Error('export accepté avec un logo remplacé');
    expect(e.code).toBe('MISSING_REFERENCE');
    expect('preflight' in e && e.preflight?.map((v) => [v.cause, v.cible.calqueId, v.cible.assetId])).toEqual([['logo_a_reimporter', 'logo', ID_LOGO]]);
    expect(e.message).toBe(`Export refusé · Calque logo « Logo » · ${RAISONS_LOGO_EXPORT.remplace} Aucun fichier n’a été produit.`);
    expect(await exportsAudites(), 'un export refusé a laissé une trace').toBe(avant);
    expect(lecturesLogo(), 'une seule vérification pour l’opération').toEqual(['GET If-Match']);
    const ap = await rendreApercu({ projectId, versionId });
    expect(!ap.ok && [ap.code, ap.message]).toEqual(['MISSING_REFERENCE', MESSAGES_LOGO_SERVI.remplace]);
  });

  it('REMPLACÉ, admin · la page mène à l’Identité de la marque, cible de 44 px (le lien de l’éditeur)', async () => {
    await charte({ empreinte: true });
    const { projectId } = await projetExport();
    remplacer();
    qui('admin');
    const html = await ecranExport(projectId);
    expect(html.slice(html.indexOf('data-cause="logo_a_reimporter"')), 'le lien n’est pas la cible de 44 px').toMatch(new RegExp(`<a data-lien="identite-marque" class="btn sm" style="[^"]*min-height:44px[^"]*" href="${IDENTITE}">Ouvrir l’Identité de la marque</a>`));
  });

  it('intact · « Tout est prêt », le fichier embarque les octets VÉRIFIÉS ; une seule lecture If-Match pour préflight et rendu ; remplacé ensuite, le re-rendu est refusé avec la phrase', async () => {
    await charte({ empreinte: true });
    const { projectId, versionId } = await projetExport();
    expect(await ecranExport(projectId)).toContain('data-preflight="ok"');
    requetes.length = 0;
    const e = await exporterVersion({ projectId, versionId, format: 'png' });
    if (!e.ok) throw new Error(JSON.stringify(e));
    expect(lecturesLogo(), 'préflight et rendu partagent la lecture').toEqual(['GET If-Match']);
    remplacer();
    // Le faux bucket refuse le dépôt de l'archive (aucun PUT n'y crée d'objet) · l'export n'est pas conservé,
    // le téléchargement RE-REND la version · le logo redéposé n'y entre pas, le refus le dit.
    expect(e.export.conserve).toBe(false);
    requetes.length = 0;
    const r = await telecharger(new Request(`http://local${e.export.url}`), { params: Promise.resolve({ versionId }) });
    expect(r.status).toBe(422);
    const corps = await r.json() as { message: string };
    expect(corps.message).toBe(`Export refusé · Calque logo « Logo » · ${RAISONS_LOGO_EXPORT.remplace} Aucun fichier n’a été produit.`);
    expect(lecturesLogo(), 'droits puis re-rendu · une seule vérification pour le téléchargement').toEqual(['GET If-Match']);
  });

  it('intact · les pixels du logo dans le fichier sont ceux de l’original', async () => {
    await charte({ empreinte: true });
    const { projectId, versionId } = await projetExport();
    const { fabriquerExport } = await import('../lib/studios/export/export');
    const ctx = contexteDepuisSession(session(ids, 'ua'), [ids.brandA1, ids.brandA2], [], 'st_logo4_px');
    const f = await fabriquerExport(ctx, { projectId, versionId, format: 'png' });
    if (!f.ok) throw new Error(JSON.stringify(f));
    expect(await centreLogo(f.fichier.octets)).toEqual([...BLEU]);
  });

  it('logo SANS empreinte · comme avant · lecture simple (aucun If-Match, aucun HEAD), exporté avec les octets lus', async () => {
    await charte({ empreinte: false });
    const { projectId, versionId } = await projetExport();
    remplacer();
    expect(await ecranExport(projectId)).toContain('data-preflight="ok"');
    expect(requetes.some((r) => r.ifMatch !== null || r.methode === 'HEAD'), 'aucune vérification pour un logo sans empreinte').toBe(false);
    const { fabriquerExport } = await import('../lib/studios/export/export');
    const ctx = contexteDepuisSession(session(ids, 'ua'), [ids.brandA1, ids.brandA2], [], 'st_logo4_se');
    requetes.length = 0;
    const f = await fabriquerExport(ctx, { projectId, versionId, format: 'png' });
    if (!f.ok) throw new Error(JSON.stringify(f));
    expect(await centreLogo(f.fichier.octets)).toEqual([...ROUGE]);
    expect(requetes.every((r) => r.ifMatch === null && r.methode === 'GET')).toBe(true);
  });
});
