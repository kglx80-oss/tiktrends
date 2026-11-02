import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Studios vidéo · un logo de la charte que l'image clé d'un PLAN utiliserait
 * (lié par sa consigne retenue ou en attente), remplacé dans le stockage depuis
 * son import, est annoncé AVANT « Compiler la consigne » (appel texte payant),
 * comme l'atelier image · vraie base (pglite + migrations), FAUX S3 à ETag MD5
 * qui honore `If-Match`, la VRAIE lecture de l'écran (`lireVideoPour`), le VRAI
 * geste « Retenir » (`retenirConsignePlanPour`) et le VRAI écran (`Video`) rendu
 * en HTML. 0 $ · aucun fournisseur appelé.
 *
 * La consigne qui lie le logo est ATTESTÉE au journal comme le ferait une
 * compilation · aujourd'hui `preparerShotImage` ne transmet que la photo
 * épinglée du produit, mais le verdict du noyau (`verdictConsignePlan`) refuse
 * déjà ce cas au devis · l'écran doit le dire avant le clic payant.
 *
 * On lit ce qui SORT · la vue, le HTML et les requêtes parties au stockage :
 *  - lié et remplacé · l'annonce du plan concerné (nom, conséquence, lien
 *    Identité pour un admin, qui peut le faire sinon) au-dessus des gestes,
 *    qui restent ouverts ; un seul HEAD pour la relecture et l'annonce ;
 *  - autre plan · rien ; lié et intact · rien, un HEAD ; sans empreinte ·
 *    aucune requête ; aucun logo lié · aucune requête.
 */
const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.test', region: 'gra', bucket: 'bucket', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://cdn.exemple.test/bucket' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/studio/projets', useSearchParams: () => new URLSearchParams() }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import {
  ACTION_CONSIGNE_PLAN, construireConsignePlan, entreesConsignePlan, idLogoMarque, motifLogosAReimporter, versionDepuisEmpreinte, type ContenuVersion,
} from '@tiktrends/core';
import { contexteDepuisSession, type ContexteStudio } from '../lib/studios/garde';
import { hacherImage } from '../lib/studios/produit/catalogue';
import { ajouterAudit } from '../lib/studios/audit';
import { retenirConsignePlanPour } from '../lib/studios/video/consigne';
import { lireVideoPour, type VueVideo } from '../lib/studios/video/lecture';
import { Video } from '../spatial/vues/projet/Video';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { semer, session } from './studios-semis';
import { projetVideo } from './l4a-outils';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const T = new Date('2026-10-08T10:00:00Z');
const LECTURE = { maintenant: T, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };
const IDENTITE = `/brands/${ids.brandA1}/identite`;
const ctx = (role: 'member' | 'admin' = 'member'): ContexteStudio =>
  contexteDepuisSession(session(ids, 'ua', { role }), [ids.brandA1, ids.brandA2], [], `st_vlogo_${role}_${randomUUID().slice(0, 6)}`);

/* ───────────── Le faux bucket · ETag = MD5 du corps, If-Match honoré ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string; ifMatch: string | null }> = [];
const md5 = (o: Buffer) => createHash('md5').update(o).digest('hex');
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const methode = init?.method ?? 'GET';
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const ifMatch = new Headers(init?.headers).get('if-match');
  requetes.push({ methode, cle, ifMatch });
  const o = bucket.get(cle);
  if (!o) return new Response(null, { status: 404 });
  if (ifMatch !== null && ifMatch !== `"${md5(o)}"`) return new Response(null, { status: 412 });
  return new Response(null, { status: 200, headers: { 'content-length': String(o.length), etag: `"${md5(o)}"` } });
}
const heads = () => requetes.filter((r) => r.methode === 'HEAD');

/** Le logo par défaut de la marque A1 · un fichier du bucket de l'espace, importé (empreinte) ou ancien (sans). */
const LOGO = `${CFG.publicBaseUrl}/assets/${ids.wsA}/1-abcd1234-logo.png`;
const CLE = LOGO.slice(CFG.publicBaseUrl.length + 1);
const ORIGINAL = Buffer.from('octets du logo importé');
const SHA_LOGO = hacherImage(LOGO).sha256;
const ID_LOGO = idLogoMarque(ids.brandA1, SHA_LOGO);
/** Une variante de la charte, importée aussi (empreinte), qu'aucun plan ne lie · jamais vérifiée ni annoncée. */
const VARIANTE = `${CFG.publicBaseUrl}/assets/${ids.wsA}/2-ef567890-variante.png`;
async function charte(o: { empreinte: boolean }) {
  bucket.set(CLE, ORIGINAL);
  bucket.set(VARIANTE.slice(CFG.publicBaseUrl.length + 1), ORIGINAL);
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO, VARIANTE], logoEmpreintes: o.empreinte ? { [LOGO]: md5(ORIGINAL), [VARIANTE]: md5(Buffer.from('autre')) } : null }).where(eq(schema.brands.id, ids.brandA1));
}
const remplacer = () => bucket.set(CLE, Buffer.from('autres octets, même type'));

const PLAN = 's_ouverture';
/** Un projet vidéo de la marque A1 · trois plans ; la consigne du plan d'ouverture lie le logo (attestée, puis retenue si `retenir`). */
async function projet(o: { lie: boolean; retenir?: boolean }) {
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
  await ajouterAudit(db, ctx(), {
    action: ACTION_CONSIGNE_PLAN, brandId: ids.brandA1, targetType: 'studio_project', targetId: p.projectId,
    versionBefore: p.versionId, versionAfter: null, reason: 'Consigne d’image du plan compilée et validée par le serveur',
    details: { runId, shotId: PLAN, empreinte: c.empreinte, consigne: c.consigne },
  });
  if (o.retenir) {
    const r = await retenirConsignePlanPour(ctx(), { projectId: p.projectId, baseVersionId: p.versionId, runId });
    if (!r.ok) throw new Error(JSON.stringify(r));
  }
  return p.projectId;
}
async function lireVue(projectId: string, role: 'member' | 'admin' = 'member'): Promise<VueVideo> {
  requetes.length = 0;
  const r = await lireVideoPour(ctx(role), projectId, LECTURE);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.vue;
}
const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 100, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const ecran = (v: VueVideo, plan = PLAN) =>
  renderToStaticMarkup(<FournisseurSpatial value={CTX}><Video vue={v} marque="Maison" variantesHref="#variantes" planInitial={plan} /></FournisseurSpatial>);
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);

beforeAll(async () => { await semer(db, schema, ids); });
beforeEach(() => { etat.session = session(ids, 'ua'); requetes.length = 0; vi.stubGlobal('fetch', fauxBucket); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Studios vidéo · consigne RETENUE d’un plan qui lie le logo', () => {
  it('REMPLACÉ · annoncé avant « Compiler la consigne » (nom, conséquence, qui peut le réimporter) ; le devis le refuse déjà ; un seul HEAD ; les gestes restent ouverts', async () => {
    await charte({ empreinte: true });
    const p = await projet({ lie: true, retenir: true });
    remplacer();
    const v = await lireVue(p);
    const k = v.keyframes[PLAN]!;
    expect(k.logosAReimporter).toEqual({
      logos: [{ assetId: ID_LOGO, libelle: 'Logo principal' }], lien: null,
      message: expect.stringContaining('Logo à réimporter · « Logo principal » : son fichier a été remplacé'),
    });
    expect(k.logosAReimporter!.message).toContain('un administrateur de l’espace peut le faire');
    expect(k.retenue?.verdict, 'le noyau refuse ce que l’écran annonce').toMatchObject({ ok: false, cause: 'non_transmissible' });
    expect(k.retenue?.verdict.ok === false && k.retenue.verdict.motif).toContain(motifLogosAReimporter([ID_LOGO]));
    expect(heads().map((r) => r.cle), 'relecture de la consigne et annonce · une seule vérification').toEqual([CLE]);
    const html = ecran(v);
    const i = html.indexOf(`data-logo-a-reimporter="${ID_LOGO}"`);
    expect(i, 'l’annonce est à l’écran').toBeGreaterThan(0);
    expect(html.slice(i)).toContain(esc(k.logosAReimporter!.message));
    const geste = html.indexOf('data-vlev="consigne"');
    expect(geste, 'le geste payant est rendu').toBeGreaterThan(0);
    expect(i, 'AVANT le geste payant').toBeLessThan(geste);
    expect(html, 'sans gestion · aucun lien vers une fiche qui le renverrait').not.toContain('identite-marque');
    expect(v.disponibilite.consigne, 'l’annonce ne ferme rien').toMatchObject({ disponible: true });
  });

  it('autre plan du projet · rien à annoncer, ni dans la vue ni à l’écran', async () => {
    await charte({ empreinte: true });
    const p = await projet({ lie: true, retenir: true });
    remplacer();
    const v = await lireVue(p);
    expect(v.keyframes.s_produit!.logosAReimporter ?? null).toBeNull();
    expect(v.keyframes.s_fin!.logosAReimporter ?? null).toBeNull();
    expect(ecran(v, 's_produit')).not.toContain('data-logo-a-reimporter');
  });

  it('REMPLACÉ, admin de l’espace · le lien vers l’Identité de la marque', async () => {
    await charte({ empreinte: true });
    const p = await projet({ lie: true, retenir: true });
    remplacer();
    const v = await lireVue(p, 'admin');
    expect(v.keyframes[PLAN]!.logosAReimporter?.lien).toBe(IDENTITE);
    expect(ecran(v)).toMatch(new RegExp(`<a data-lien="identite-marque" href="${IDENTITE}">Ouvrir l’Identité de la marque</a>`));
  });

  it('intact · rien à annoncer, un seul HEAD (If-Match)', async () => {
    await charte({ empreinte: true });
    const p = await projet({ lie: true, retenir: true });
    const v = await lireVue(p);
    expect(v.keyframes[PLAN]!.logosAReimporter ?? null).toBeNull();
    expect(heads()).toEqual([{ methode: 'HEAD', cle: CLE, ifMatch: `"${md5(ORIGINAL)}"` }]);
    expect(ecran(v)).not.toContain('data-logo-a-reimporter');
  });

  it('logo SANS empreinte · aucune requête au stockage, rien à annoncer', async () => {
    await charte({ empreinte: false });
    const p = await projet({ lie: true, retenir: true });
    remplacer();
    const v = await lireVue(p);
    expect(requetes).toEqual([]);
    expect(v.keyframes[PLAN]!.logosAReimporter ?? null).toBeNull();
  });
});

describe('Studios vidéo · consigne compilée EN ATTENTE, ou aucun logo lié', () => {
  it('en attente (attestée, pas encore retenue) qui lie le logo REMPLACÉ · annoncé aussi, avant de recompiler', async () => {
    await charte({ empreinte: true });
    const p = await projet({ lie: true, retenir: false });
    remplacer();
    const v = await lireVue(p);
    expect(v.keyframes[PLAN]!.retenue).toBeNull();
    expect(v.keyframes[PLAN]!.enAttente).not.toBeNull();
    expect(v.keyframes[PLAN]!.logosAReimporter?.logos).toEqual([{ assetId: ID_LOGO, libelle: 'Logo principal' }]);
    expect(heads().map((r) => r.cle)).toEqual([CLE]);
    expect(ecran(v)).toContain(`data-logo-a-reimporter="${ID_LOGO}"`);
  });

  it('aucun logo lié aux plans (logo de la charte remplacé) · rien à annoncer, aucune requête', async () => {
    await charte({ empreinte: true });
    const p = await projet({ lie: false });
    remplacer();
    const v = await lireVue(p);
    expect(requetes).toEqual([]);
    expect(Object.values(v.keyframes).map((k) => k.logosAReimporter ?? null)).toEqual([null, null, null]);
    expect(ecran(v)).not.toContain('data-logo-a-reimporter');
  });
});
