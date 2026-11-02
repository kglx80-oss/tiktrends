import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Sécurité · le dépôt direct ne passe plus par une adresse du stockage.
 *
 * Le défaut · `presignAssetUploadAction` rendait `publicUrl`, l'adresse
 * canonique BRUTE de l'objet dans le stockage privé ; le navigateur la
 * renvoyait comme identifiant à `registerUploadedAssetAction`,
 * `remplacerAssetAction` et `saveBrandDAAction` (logo importé). La garde
 * #1010 la tolérait par une exemption.
 *
 * La règle · le présigné ne rend que le lien de PUT signé et un JETON OPAQUE
 * (scellé AES-256-GCM, `lib/jeton-depot.ts` · espace, utilisateur, usage, clé,
 * type, taille, expiration · règle `packages/core/src/jeton-depot.ts`). Les
 * trois actions le résolvent en clé, puis gardent toutes leurs vérifications
 * (appartenance, type réel relu, taille, ETag). Un jeton ne sert qu'une fois.
 *
 * Vraie base (pglite + migrations), VRAIES actions, VRAI sceau, face à un
 * faux bucket qui accepte le PUT au lien présigné, puis sert HEAD/GET (ETag =
 * MD5, If-Match honoré) et DELETE. On lit ce qui SORT · la valeur rendue au
 * navigateur, la ligne écrite, l'objet présent ou retiré.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.jeton.test', region: 'gra', bucket: 'tt-prive', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://base-publique.jeton.test/tt-prive' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  storageFromEnv: () => CFG,
}));

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { LOGO_DEPOSE, REFUS_REMPLACEMENT, jetonDepotPour, REFUS_USAGE_DEPOT, TEXTES_REFUS_JETON_DEPOT, TEXTES_REFUS_JETON_FICHIER, charteAvecLogoImporte, type UsageDepot } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { presignAssetUploadAction, registerUploadedAssetAction, remplacerAssetAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';
import { cleDuLienDepot, jetonAltere, jetonScelle } from './helpers/depot-jeton';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ids = etat.ids;
const BASE = CFG.publicBaseUrl;
const ANCIEN = 'https://site.exemple.fr/logo.png';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAYAAAAECAIAAAAiZtkUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGP4H9OFhhjIFQIAy24teZ6V9CwAAAAASUVORK5CYII=', 'base64');
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

/* ───────────── Le faux bucket · PUT au lien présigné, HEAD, GET, DELETE ───────────── */

const bucket = new Map<string, Buffer>();
const requetes: Array<{ methode: string; cle: string }> = [];
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('hôte inconnu', { status: 599 });
  const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
  const methode = init?.method ?? 'GET';
  requetes.push({ methode, cle });
  if (methode === 'PUT') {
    // Le bucket n'accepte un PUT que signé · ici, la présence de la signature suffit (le PUT signé est gardé ailleurs, #972).
    if (!u.searchParams.get('X-Amz-Signature')) return new Response(null, { status: 403 });
    bucket.set(cle, Buffer.from(await new Response(init?.body as BodyInit).arrayBuffer()));
    return new Response(null, { status: 200 });
  }
  if (methode === 'DELETE') { bucket.delete(cle); return new Response(null, { status: 204 }); }
  const o = bucket.get(cle);
  if (!o) return new Response(null, { status: 404 });
  const etag = `"${md5(o)}"`;
  const ifMatch = new Headers(init?.headers).get('if-match');
  if (ifMatch !== null && ifMatch !== etag) return new Response(null, { status: 412 });
  const entetes = { 'content-length': String(o.length), etag };
  return methode === 'HEAD' ? new Response(null, { status: 200, headers: entetes }) : new Response(new Uint8Array(o), { status: 200, headers: entetes });
}

/* ──────────────────────────────── Outils ──────────────────────────────── */

const ua = () => session(ids, 'ua', { role: 'admin' });
/** Un AUTRE membre (admin) du même espace A · même rôle, même offre, autre personne. */
const autreMembre = () => session(ids, 'ua', { role: 'admin', user: { id: ids.ur, email: 'ur@studios.test', name: null } });

/** Le geste du navigateur · présigné, puis PUT au lien rendu · il ne garde que ce que le serveur lui a rendu. */
async function envoyer(usage: UsageDepot, nom = 'photo.png', octets: Buffer = PNG) {
  const pre = await presignAssetUploadAction({ filename: nom, contentType: 'image/png', sizeBytes: octets.length, usage });
  expect(pre.error, 'présigné refusé').toBeUndefined();
  const put = await fetch(pre.uploadUrl!, { method: 'PUT', headers: { 'Content-Type': pre.contentType! }, body: new Uint8Array(octets) });
  expect(put.ok, 'le PUT au lien présigné a échoué').toBe(true);
  // Pour les ASSERTIONS seulement · l'adresse canonique que la ligne doit porter.
  const cle = cleDuLienDepot(pre.uploadUrl!, CFG.bucket);
  return { pre, jeton: pre.jetonDepot!, cle, url: `${BASE}/${cle}` };
}
const lignes = async (url: string) => db.select().from(schema.assets).where(eq(schema.assets.url, url));
const marque = async (id: string) => (await db.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos }).from(schema.brands).where(eq(schema.brands.id, id)))[0]!;
/** Un fichier vivant de la Bibliothèque, enregistré par le vrai chemin. */
async function fichierVivant(nom: string) {
  const d = await envoyer('envoi', nom);
  expect(await registerUploadedAssetAction({ name: nom, jetonDepot: d.jeton, mimeType: 'image/png', sizeBytes: PNG.length })).toEqual({ ok: true });
  return { ...d, id: (await lignes(d.url))[0]!.id };
}

beforeAll(async () => { await semer(db, schema, ids); });
beforeEach(async () => {
  requetes.length = 0;
  vi.stubGlobal('fetch', fauxBucket);
  etat.session = ua();
  await db.update(schema.brands).set({ logoUrl: ANCIEN, logos: [ANCIEN] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

/* ──────────────────────────────── Gardes ──────────────────────────────── */

describe('presignAssetUploadAction · aucune adresse du stockage ne sort, sauf le lien de PUT', () => {
  it('rend EXACTEMENT le lien de PUT, le type signé et un jeton opaque · ni l’hôte du stockage, ni la clé, ni l’espace hors du lien', async () => {
    const r = await presignAssetUploadAction({ filename: 'photo.png', contentType: 'image/png', sizeBytes: 2048, usage: 'envoi' });
    const cle = cleDuLienDepot(r.uploadUrl!, CFG.bucket);
    expect(cle).toMatch(new RegExp(`^assets/${ids.wsA}/\\d+-[0-9a-f]{8}-photo\\.png$`));
    const { uploadUrl: _lien, ...horsLien } = r;
    const texte = JSON.stringify(horsLien);
    for (const interdit of ['base-publique.jeton.test', CFG.endpoint, `/${CFG.bucket}/`, 'assets/', cle, ids.wsA, ids.ua]) {
      expect(texte, `« ${interdit} » sort du présigné hors du lien de PUT`).not.toContain(interdit);
    }
    expect(Object.keys(r).sort(), 'le présigné rend une clé de plus que le lien, le type et le jeton').toEqual(['contentType', 'jetonDepot', 'uploadUrl']);
    // Le jeton est OPAQUE · décodé, il ne nomme ni la clé, ni l'espace, ni la personne.
    const decode = Buffer.from(r.jetonDepot!, 'base64url').toString('latin1');
    for (const interdit of ['assets/', ids.wsA, ids.ua, 'envoi', 'image/png']) expect(decode, `le jeton laisse lire « ${interdit} »`).not.toContain(interdit);
  });

  it('un usage inconnu ou absent ⇒ refusé, rien n’est signé', async () => {
    for (const usage of [undefined, '', 'autre', 'LOGO']) {
      expect(await presignAssetUploadAction({ filename: 'photo.png', contentType: 'image/png', sizeBytes: 2048, usage: usage as UsageDepot }), String(usage)).toEqual({ error: REFUS_USAGE_DEPOT });
    }
  });
});

describe('Envoi complet par jeton · les trois appelants', () => {
  it('Bibliothèque · présigné → PUT → enregistrement par le jeton · la ligne porte l’adresse résolue, le type RELU et l’ETag', async () => {
    const d = await envoyer('envoi');
    expect(await registerUploadedAssetAction({ name: 'photo.png', jetonDepot: d.jeton, mimeType: 'application/octet-stream', sizeBytes: 1 })).toEqual({ ok: true });
    const [l] = await lignes(d.url);
    expect({ espace: l?.workspaceId, auteur: l?.uploaderUserId, type: l?.mimeType, taille: l?.sizeBytes, etag: l?.objectEtag }).toEqual({ espace: ids.wsA, auteur: ids.ua, type: 'image/png', taille: PNG.length, etag: md5(PNG) });
    // Relu par HEAD puis GET signé, sur l'adresse que le jeton a résolue.
    expect(requetes.map((q) => [q.methode, q.cle])).toEqual([['PUT', d.cle], ['HEAD', d.cle], ['GET', d.cle]]);
  });

  it('Remplacer · présigné (remplacement) → PUT → remplacement par le jeton · la MÊME ligne pointe le nouvel objet', async () => {
    const f = await fichierVivant('avant.png');
    const d = await envoyer('remplacement', 'apres.png');
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: d.jeton, mimeType: 'image/png' })).toEqual({ ok: true });
    expect((await db.select().from(schema.assets).where(eq(schema.assets.id, f.id)))[0]!.url).toBe(d.url);
  });

  it('Logo · présigné (logo) → PUT → charte avec `LOGO_DEPOSE` · le serveur la résout, la référence n’est jamais écrite', async () => {
    const d = await envoyer('logo', 'logo.png');
    expect(await saveBrandDAAction({ brandId: ids.brandA1, ...charteAvecLogoImporte({ logos: [ANCIEN], defaut: ANCIEN }, LOGO_DEPOSE), colors: [], fonts: [], jetonDepot: d.jeton })).toEqual({ ok: true });
    expect(await marque(ids.brandA1)).toEqual({ logoUrl: d.url, logos: [ANCIEN, d.url] });
  });
});

describe('Jeton refusé · phrase claire, rien d’écrit, rien de relu', () => {
  it('altéré · refusé aux trois appelants', async () => {
    const env = await envoyer('envoi');
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: jetonAltere(env.jeton), mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.illisible });
    const f = await fichierVivant('cible.png');
    const rem = await envoyer('remplacement');
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: jetonAltere(rem.jeton), mimeType: 'image/png' })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.illisible });
    const logo = await envoyer('logo');
    expect(await saveBrandDAAction({ brandId: ids.brandA1, logoUrl: LOGO_DEPOSE, logos: [ANCIEN, LOGO_DEPOSE], colors: [], fonts: [], jetonDepot: jetonAltere(logo.jeton) })).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.illisible });
    expect([await lignes(env.url), (await db.select().from(schema.assets).where(eq(schema.assets.id, f.id)))[0]!.url, await marque(ids.brandA1)]).toEqual([[], f.url, { logoUrl: ANCIEN, logos: [ANCIEN] }]);
  });

  it('expiré · refusé (au-delà de la durée proportionnée à la taille)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
    const d = await envoyer('envoi');
    vi.setSystemTime(new Date('2026-11-02T10:05:00Z')); // 300 s · au-delà des 122 s d'un fichier de 70 octets (`dureeJetonDepotS`)
    requetes.length = 0;
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: d.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.expire });
    expect([await lignes(d.url), requetes]).toEqual([[], []]);
    // Témoin · le même jeton, encore dans sa durée, passe.
    vi.setSystemTime(new Date('2026-11-02T10:01:00Z'));
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: d.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ ok: true });
  });

  it('d’un autre espace · refusé, l’objet de l’autre espace ni lu ni touché', async () => {
    etat.session = session(ids, 'ub', { role: 'admin' });
    const chezB = await envoyer('envoi');
    etat.session = ua();
    requetes.length = 0;
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: chezB.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_espace });
    expect([await lignes(chezB.url), requetes, bucket.has(chezB.cle)]).toEqual([[], [], true]);
  });

  it('d’un autre utilisateur du MÊME espace · refusé aux trois appelants', async () => {
    etat.session = autreMembre();
    const env = await envoyer('envoi');
    const rem = await envoyer('remplacement');
    const logo = await envoyer('logo');
    etat.session = ua();
    const f = await fichierVivant('cible2.png');
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: env.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_utilisateur });
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: rem.jeton, mimeType: 'image/png' })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_utilisateur });
    expect(await saveBrandDAAction({ brandId: ids.brandA1, logoUrl: LOGO_DEPOSE, logos: [ANCIEN, LOGO_DEPOSE], colors: [], fonts: [], jetonDepot: logo.jeton })).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.autre_utilisateur });
    expect(await lignes(env.url)).toEqual([]);
    expect(await marque(ids.brandA1)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
  });

  it('pour une autre action · chaque usage ne sert qu’à la sienne', async () => {
    const f = await fichierVivant('cible3.png');
    const logo = await envoyer('logo');
    const rem = await envoyer('remplacement');
    const env = await envoyer('envoi');
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: logo.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_usage });
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: rem.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_usage });
    expect(await remplacerAssetAction({ id: f.id, jetonDepot: env.jeton, mimeType: 'image/png' })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.autre_usage });
    expect(await saveBrandDAAction({ brandId: ids.brandA1, logoUrl: LOGO_DEPOSE, logos: [ANCIEN, LOGO_DEPOSE], colors: [], fonts: [], jetonDepot: env.jeton })).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.autre_usage });
    expect([await lignes(logo.url), await lignes(rem.url), await marque(ids.brandA1)]).toEqual([[], [], { logoUrl: ANCIEN, logos: [ANCIEN] }]);
  });

  it('forgé sans la clé · un jeton en clair (format #987 sans signature) ou un chiffré retouché pour changer la personne · refusé', async () => {
    const T = Date.now();
    const cle = `assets/${ids.wsA}/1700000000000-f0f0f0f0-forge.png`;
    bucket.set(cle, PNG);
    const contenu = jetonDepotPour({ espace: ids.wsA, utilisateur: ids.ua, usage: 'envoi', cle, type: 'image/png', taille: PNG.length, maintenant: T });
    const vrai = jetonScelle({ espace: ids.wsA, utilisateur: ids.ua, usage: 'envoi', cle, taille: PNG.length, maintenant: T });
    const pour = { ...contenu, utilisateur: ids.ur };
    // 1 · fabriqué en clair · ce que #987 aurait lu une fois la signature retirée.
    const clair = Buffer.from(JSON.stringify(pour), 'utf8').toString('base64url');
    // 2 · malléabilité · le chiffré de `ua` retouché octet à octet pour dire `ur` (même longueur).
    const brut = Buffer.from(vrai, 'base64url');
    const P = Buffer.from(JSON.stringify(contenu), 'utf8');
    const P2 = Buffer.from(JSON.stringify(pour), 'utf8');
    expect(P2.length).toBe(P.length);
    const retouche = Buffer.concat([brut.subarray(0, 28), Buffer.from(brut.subarray(28).map((b, i) => b ^ P[i]! ^ P2[i]!))]).toString('base64url');
    etat.session = autreMembre();
    requetes.length = 0;
    for (const [quoi, jeton] of [['en clair', clair], ['retouché', retouche]] as const) {
      expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: jeton, mimeType: 'image/png', sizeBytes: 1 }), quoi).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.illisible });
    }
    expect([await lignes(`${BASE}/${cle}`), requetes]).toEqual([[], []]);
    // Témoin · le vrai jeton, présenté par SA personne, passe.
    etat.session = ua();
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: vrai, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ ok: true });
  });

  it('une adresse du stockage à la place du jeton (l’ancien identifiant) · refusée, jamais requêtée', async () => {
    const d = await envoyer('envoi');
    requetes.length = 0;
    expect(await registerUploadedAssetAction({ name: 'x.png', jetonDepot: d.url, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.illisible });
    expect(await registerUploadedAssetAction({ name: 'x.png', url: d.url, mimeType: 'image/png', sizeBytes: 1 } as never)).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.absent });
    expect([await lignes(d.url), requetes]).toEqual([[], []]);
  });
});

describe('Réutilisation · un jeton ne fait entrer son objet qu’une fois', () => {
  it('Bibliothèque · le même jeton rejoué ⇒ « déjà enregistré », une seule ligne', async () => {
    const d = await envoyer('envoi');
    expect(await registerUploadedAssetAction({ name: 'un.png', jetonDepot: d.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ ok: true });
    expect(await registerUploadedAssetAction({ name: 'deux.png', jetonDepot: d.jeton, mimeType: 'image/png', sizeBytes: 1 })).toEqual({ error: TEXTES_REFUS_JETON_FICHIER.deja_employe });
    expect((await lignes(d.url)).length).toBe(1);
    expect(bucket.has(d.cle), 'l’objet enregistré est gardé').toBe(true);
  });

  it('Bibliothèque · deux envois SIMULTANÉS du même jeton ⇒ une seule ligne (verrou de transaction)', async () => {
    const d = await envoyer('envoi');
    const r = await Promise.all([1, 2, 3].map((i) => registerUploadedAssetAction({ name: `${i}.png`, jetonDepot: d.jeton, mimeType: 'image/png', sizeBytes: 1 })));
    expect(r.filter((x) => x.ok).length).toBe(1);
    expect(r.filter((x) => x.error === TEXTES_REFUS_JETON_FICHIER.deja_employe).length).toBe(2);
    expect((await lignes(d.url)).length).toBe(1);
  });

  it('Remplacer · le même jeton sur un AUTRE fichier ⇒ refusé, l’autre fichier intact', async () => {
    const a = await fichierVivant('a.png');
    const b = await fichierVivant('b.png');
    const d = await envoyer('remplacement');
    expect(await remplacerAssetAction({ id: a.id, jetonDepot: d.jeton, mimeType: 'image/png' })).toEqual({ ok: true });
    expect(await remplacerAssetAction({ id: b.id, jetonDepot: d.jeton, mimeType: 'image/png' })).toEqual({ error: REFUS_REMPLACEMENT.dejaEnregistre });
    expect((await db.select().from(schema.assets).where(eq(schema.assets.id, b.id)))[0]!.url).toBe(b.url);
  });

  it('Logo · le même jeton sur une AUTRE marque ⇒ refusé ; renvoyé sur la même marque (déjà là) ⇒ admis sans rien ajouter', async () => {
    const d = await envoyer('logo');
    const charte = { ...charteAvecLogoImporte({ logos: [ANCIEN], defaut: ANCIEN }, LOGO_DEPOSE), colors: [], fonts: [], jetonDepot: d.jeton };
    expect(await saveBrandDAAction({ brandId: ids.brandA1, ...charte })).toEqual({ ok: true });
    expect(await saveBrandDAAction({ brandId: ids.brandA2, ...charte })).toEqual({ error: TEXTES_REFUS_JETON_DEPOT.deja_employe });
    expect(await marque(ids.brandA2)).toEqual({ logoUrl: ANCIEN, logos: [ANCIEN] });
    expect(await saveBrandDAAction({ brandId: ids.brandA1, ...charte })).toEqual({ ok: true });
    expect(await marque(ids.brandA1)).toEqual({ logoUrl: d.url, logos: [ANCIEN, d.url] });
  });
});
