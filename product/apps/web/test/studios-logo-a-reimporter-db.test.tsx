import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Studios · un logo de la charte LIÉ au visuel et remplacé dans le stockage
 * depuis son import est annoncé AVANT la préparation payante (« Préparer mon
 * visuel avec Jarvis »), avec le chemin vers l'Identité · vraie base (pglite +
 * migrations), FAUX S3 à ETag MD5 qui honore `If-Match`, la VRAIE lecture du
 * parcours (`lireParcoursImagePour`) et le VRAI écran (`ParcoursImage`) rendu
 * en HTML. 0 $ · l'adaptateur texte est simulé, aucun fournisseur appelé.
 *
 * On lit ce qui SORT · la vue, le HTML et les requêtes parties au stockage :
 *  - lié et remplacé · l'annonce (nom du logo dans le catalogue, conséquence,
 *    lien Identité pour un admin, qui peut le faire sinon) au-dessus du bouton
 *    payant, qui reste ouvert ;
 *  - lié et intact · rien, un seul HEAD ; sans empreinte · aucune requête ;
 *  - non lié · rien, aucune requête (les autres logos ne concernent pas ce visuel) ;
 *  - consigne retenue qui le lie · UN seul HEAD pour la consigne et l'annonce.
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
import { idLogoMarque, motifLogosAReimporter } from '@tiktrends/core';
import { contexteDepuisSession, type ContexteStudio } from '../lib/studios/garde';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { hacherImage } from '../lib/studios/produit/catalogue';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour, associerReferencePour } from '../lib/studios/produit/commandes';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import { lireParcoursImagePour, type VueParcoursImage } from '../lib/studios/image/parcours';
import { ParcoursImage } from '../spatial/vues/projet/ParcoursImage';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { semerCatalogue, projetStatique, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const T = new Date('2026-10-08T10:00:00Z');
const O = { veilleOuverte: true, maintenant: T };
const LECTURE = { ...O, releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutCompilationUsd: 0.14 };
const IDENTITE = `/brands/${ids.brandA1}/identite`;
const ctx = (role: 'member' | 'admin' = 'member'): ContexteStudio =>
  contexteDepuisSession(session(ids, 'ua', { role }), [ids.brandA1, ids.brandA2], [], `st_logo_${role}`);

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
const ID_LOGO = idLogoMarque(ids.brandA1, hacherImage(LOGO).sha256);
async function charte(o: { empreinte: boolean }) {
  bucket.set(CLE, ORIGINAL);
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO], logoEmpreintes: o.empreinte ? { [LOGO]: md5(ORIGINAL) } : null }).where(eq(schema.brands.id, ids.brandA1));
}
const remplacer = () => bucket.set(CLE, Buffer.from('autres octets, même type'));

let cat: Catalogue;
const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  return p!.currentVersionId!;
};
/** Un projet de la marque A1 · photo épinglée, et le logo lié au brief (rôle Logo) quand `lie`. */
async function projet(lie: boolean) {
  const p = await projetStatique(db, ids, cat);
  const c = await chargerCatalogueProjet(ctx(), p.projectId, O);
  if (!c.ok) throw new Error(c.code);
  const photo = c.catalogue.produits.find((x) => x.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const e = await epinglerProduitPour(ctx(), { projectId: p.projectId, baseVersionId: await courante(p.projectId), productId: cat.produit.id, photoId: photo, composants: ['lunettes'] }, O);
  if (!e.ok) throw new Error(JSON.stringify(e));
  if (lie) {
    const a = await associerReferencePour(ctx(), { projectId: p.projectId, baseVersionId: await courante(p.projectId), assetId: ID_LOGO, role: 'logo', scope: 'global' }, O);
    if (!a.ok) throw new Error(JSON.stringify(a));
  }
  return p.projectId;
}
async function lireVue(projectId: string, role: 'member' | 'admin' = 'member'): Promise<VueParcoursImage> {
  requetes.length = 0;
  const r = await lireParcoursImagePour(ctx(role), projectId, LECTURE);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.vue;
}
const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 100, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const ecran = (projectId: string, v: VueParcoursImage) =>
  renderToStaticMarkup(<FournisseurSpatial value={CTX}><ParcoursImage projectId={projectId} versionId={v.version.id} initial={v} /></FournisseurSpatial>);
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);

/* ── L'adaptateur texte simulé · lie chaque référence reçue avec le rôle du brief (0 $) ── */
const texte = adaptateurSimule((a: AppelModele) => {
  const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
  return {
    status: 'ready', questions: [], warnings: [], evidenceIds: [],
    result: {
      generationInstruction: 'Coureur portant les lunettes, piste au lever du jour.', negativeConstraints: ['Pas de texte'], needsDeterministicOverlay: true, protectedComponents: ['lunettes'],
      referenceBindings: ti.referenceIds.map((id) => (id.startsWith('pph_') ? { referenceId: id, role: 'product', scope: 'product' } : { referenceId: id, role: 'logo', scope: 'global' })),
    },
  };
});

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
});
beforeEach(() => { etat.session = session(ids, 'ua'); requetes.length = 0; vi.stubGlobal('fetch', fauxBucket); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Studios · parcours image · logo lié au brief', () => {
  it('REMPLACÉ · annoncé avant « Préparer mon visuel avec Jarvis » (nom, conséquence, qui peut le réimporter) ; le bouton payant reste ouvert', async () => {
    await charte({ empreinte: true });
    const p = await projet(true);
    remplacer();
    const v = await lireVue(p);
    expect(v.logosAReimporter).toEqual({
      logos: [{ assetId: ID_LOGO, libelle: 'Logo principal' }], lien: null,
      message: expect.stringContaining('Logo à réimporter · « Logo principal » : son fichier a été remplacé'),
    });
    expect(v.logosAReimporter!.message).toContain('un administrateur de l’espace peut le faire');
    expect(heads().map((r) => r.cle)).toEqual([CLE]);
    const html = ecran(p, v);
    const i = html.indexOf(`data-logo-a-reimporter="${ID_LOGO}"`);
    expect(i, 'l’annonce est à l’écran').toBeGreaterThan(0);
    expect(html.slice(i)).toContain(esc(v.logosAReimporter!.message));
    expect(i, 'AVANT le bouton payant').toBeLessThan(html.indexOf('data-bouton="compiler"'));
    expect(html, 'sans gestion · aucun lien vers une fiche qui le renverrait').not.toContain('identite-marque');
    // L'annonce ne ferme rien · la préparation reste disponible côté serveur (le rendu serveur
    // du bouton suit le verrou d'appel payant, lu au navigateur).
    expect(v.disponibilite.compilation).toMatchObject({ disponible: true });
    expect(html).toContain('data-bouton="compiler"');
  });

  it('REMPLACÉ, admin de l’espace · le lien vers l’Identité de la marque', async () => {
    await charte({ empreinte: true });
    const p = await projet(true);
    remplacer();
    const v = await lireVue(p, 'admin');
    expect(v.logosAReimporter?.lien).toBe(IDENTITE);
    expect(v.logosAReimporter?.message).toContain('réimporte-le dans l’Identité de la marque avant de préparer ton visuel');
    expect(ecran(p, v)).toMatch(new RegExp(`<a data-lien="identite-marque" href="${IDENTITE}">Ouvrir l’Identité de la marque</a>`));
  });

  it('intact · rien à annoncer, un seul HEAD (If-Match)', async () => {
    await charte({ empreinte: true });
    const p = await projet(true);
    const v = await lireVue(p);
    expect(v.logosAReimporter).toBeNull();
    expect(heads()).toEqual([{ methode: 'HEAD', cle: CLE, ifMatch: `"${md5(ORIGINAL)}"` }]);
    expect(ecran(p, v)).not.toContain('data-logo-a-reimporter');
  });

  it('logo SANS empreinte · aucune requête au stockage, rien à annoncer', async () => {
    await charte({ empreinte: false });
    const p = await projet(true);
    remplacer();
    const v = await lireVue(p);
    expect(requetes).toEqual([]);
    expect(v.logosAReimporter).toBeNull();
  });

  it('logo de la charte NON lié au visuel · rien à annoncer, aucune requête', async () => {
    await charte({ empreinte: true });
    const p = await projet(false);
    remplacer();
    const v = await lireVue(p);
    expect(requetes).toEqual([]);
    expect(v.logosAReimporter).toBeNull();
  });
});

describe('Studios · consigne retenue qui lie le logo', () => {
  it('un seul HEAD pour la relecture de la consigne ET l’annonce · le devis refuse avec son motif, l’annonce le dit aussi', async () => {
    await charte({ empreinte: true });
    const p = await projet(true);
    const c = await compilerEtAttesterPour(ctx(), { projectId: p, mode: 'generative_scene' }, { adaptateur: texte, environnement: 'test', ...O });
    if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
    const r = await retenirConsignePour(ctx(), { projectId: p, baseVersionId: await courante(p), runId: c.runId });
    if (!r.ok) throw new Error(JSON.stringify(r));
    remplacer();
    const v = await lireVue(p);
    expect(v.retenue?.verdict).toMatchObject({ ok: false, cause: 'non_transmissible' });
    expect(v.retenue?.verdict.ok === false && v.retenue.verdict.motif).toContain(motifLogosAReimporter([ID_LOGO]));
    expect(v.logosAReimporter?.logos).toEqual([{ assetId: ID_LOGO, libelle: 'Logo principal' }]);
    expect(heads().map((x) => x.cle), 'un logo cité par la consigne et le brief · une seule vérification').toEqual([CLE]);
  });
});
