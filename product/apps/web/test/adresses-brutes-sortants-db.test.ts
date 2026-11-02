import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Le stockage (S3 OVH) est PRIVÉ · une adresse BRUTE d'objet est soit cassée
 * (lecture anonyme refusée), soit une fuite (elle nomme la clé interne). #1007
 * garde les pages, #1010 les routes et les actions serveur. Restaient les
 * chemins vers L'EXTÉRIEUR · ce qui part d'un worker ou d'un module vers un
 * tiers : courriels (bienvenue, réinitialisation, invitation, récapitulatif
 * hebdomadaire), événements marketing (webhook Klaviyo), adresses d'image
 * transmises à un fournisseur (vision Anthropic, fal, worker Studios).
 *
 * Garde GLOBALE, en trois temps :
 *  1. le RECENSEMENT, par motif (jamais à la main) · chaque fichier serveur
 *     (`apps/web/app`, `apps/web/lib`, `apps/workers/src`, `packages/*\/src`)
 *     est lu, chaque appel d'envoi compté (`MOTIFS`). Un appel absent de
 *     `SORTANTS`, ou un compte qui change, est « NON RECENSÉ » ;
 *  2. chaque point recensé est EXERCÉ (`CAS`) sur une vraie base (pglite +
 *     migrations, le semis de #1007/#1010 · un logo importé à empreinte, une
 *     photo produit, un fichier de la Bibliothèque, une sortie Studios livrée,
 *     une pub dont l'asset vit au stockage) · ou, quand son contenu ne peut
 *     PAS porter d'objet du stockage, exempté avec sa raison et une PREUVE lue
 *     dans le fichier (une exemption dont la preuve ne tient plus est morte) ;
 *  3. on lit le RÉSULTAT · le courriel rendu (nodemailer remplacé, rien ne
 *     part), le corps envoyé au faux réseau (Klaviyo, fal), les paramètres
 *     remis au faux client Anthropic (derrière la vraie barrière de dépense).
 *
 * Les règles :
 *  - un COURRIEL ne porte AUCUNE adresse du stockage, ni brute ni signée (il
 *    vit des jours, une signature de 5 à 15 minutes y est déjà morte) · et
 *    chaque lien pointe vers l'application (`APP_URL`), qui garde ses routes ;
 *  - un WEBHOOK (Klaviyo) ne porte aucune adresse du stockage ;
 *  - un FOURNISSEUR ne reçoit une adresse du stockage que SIGNÉE AWS4, d'un
 *    objet de l'espace du job, avec une durée bornée · la durée réellement
 *    utilisée par chaque point est MESURÉE et écrite (`DUREES_MESUREES`).
 *
 * Fuite trouvée et corrigée · `analyzeAssetsAction` (Adsmap, « Décrire les
 * créas ») transmettait l'adresse BRUTE de l'asset d'une pub
 * (`ads.asset_url`) au modèle de vision · illisible pour lui (bucket privé),
 * et la clé interne partait chez un tiers. Elle passe désormais par
 * `assetAiUrl` (signée 300 s si l'objet est de l'espace, écartée sinon),
 * calculée au moment de l'appel.
 */

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  cookie: null as string | null,
  /** Ce que nodemailer aurait envoyé (le transport est remplacé). */
  courriels: [] as Array<{ to?: unknown; subject?: unknown; html?: unknown; text?: unknown }>,
  /** Ce que le client Anthropic aurait reçu (paramètres de `messages.create`). */
  appelsIA: [] as unknown[],
  claude: null as unknown,
}));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
  // Le faux client · même forme que le SDK, rend l'outil demandé, avec un usage (la barrière règle au réel).
  h.claude = {
    messages: {
      create: async (p: { model?: string; tool_choice?: { name?: string } }) => {
        h.appelsIA.push(JSON.parse(JSON.stringify(p)));
        const outil = p.tool_choice?.name ?? '';
        const input = outil === 'return_asset_tags' ? { tags: ['produit', 'studio', 'lumière douce'], caption: 'Un produit posé.' }
          : outil === 'return_asset_analysis' ? { hookType: 'question', openingType: 'produit', confidence: 0.6, claims: [], proofElements: [] }
          : {};
        return { id: 'msg_faux', type: 'message', role: 'assistant', model: p.model, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: outil, input }], usage: { input_tokens: 100, output_tokens: 50 } };
      },
    },
  };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.brutes.test', region: 'gra', bucket: 'tt-prive', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://adresse-brute.stockage.test/tt-prive' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, permanentRedirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/dashboard', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.cookie ? { value: h.cookie } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/dashboard', host: 'localhost', 'x-forwarded-for': '203.0.113.7' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));
// Aucun courriel ne part · le transport rend ce qu'il aurait envoyé.
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: async (m: (typeof h.courriels)[number]) => { h.courriels.push(m); return { messageId: 'faux' }; } }) } }));
// Aucun appel modèle · la vraie barrière de dépense enveloppe le faux client.
vi.mock('@tiktrends/ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/ai')>()), anthropicFromEnv: () => h.claude }));

import { db, schema, eq } from '@tiktrends/db';
import { cleFournisseurDuJob, empreinteContenu, contenuVide, idLogoMarque, OPERATION_JOB_STUDIO, parametresImageDuDevis, photosDuProduit, refsDuJob, SCHEMA_VERSION_CONTENU, type SnapshotJob } from '@tiktrends/core';
import { semer } from './studios-semis';
import type { BaseStudio } from '../../workers/src/studios/types';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const BASE = CFG.publicBaseUrl;
const APP = 'https://app.exemple.test';
/** Ce qui ne doit JAMAIS sortir brut · l'hôte de la base publique, et l'hôte du service sous ses formes canoniques (`objectKeyFromUrl`). */
const BRUTES: ReadonlyArray<{ motif: RegExp; nom: string }> = [
  { motif: /adresse-brute\.stockage\.test\//g, nom: 'base publique du stockage' },
  { motif: /s3\.brutes\.test\/tt-prive\//g, nom: 'adresse du service (chemin)' },
  { motif: /tt-prive\.s3\.brutes\.test\//g, nom: 'adresse du service (hôte du bucket)' },
];
const occurrences = (t: string) => BRUTES.flatMap(({ motif, nom }) => [...t.matchAll(new RegExp(motif.source, 'g'))].map((m) => `${nom} · …${t.slice(Math.max(0, m.index! - 60), m.index! + 100)}…`));

/**
 * Durée maximale d'une adresse signée remise à un fournisseur · le plafond de
 * `presignObjectUrl` (900 s, `packages/integrations/src/storage.ts`), au-delà
 * duquel la signature est refusée. Une file fal peut attendre plusieurs
 * minutes avant de lire ses références · 900 s est la borne du worker.
 */
const DUREE_FOURNISSEUR_MAX = 900;
/**
 * Les durées RÉELLEMENT utilisées, mesurées par cette garde (chaque adresse
 * signée de chaque point exercé porte exactement cette durée) · relevé du
 * 2 novembre 2026 :
 *
 *   point                                          durée   source
 *   vision · tagging d'un fichier (un et lot)      300 s   `assetAiUrl` → `privateObjectUrl` (défaut)
 *   vision · description d'une créa Adsmap         300 s   `assetAiUrl` (corrigé ici, était BRUTE)
 *   fal · worker Studios (photo, logo, sortie, fichier) 900 s   `resoudreMedias` (`privateObjectUrl`/`presignGetUrl`, 900)
 *
 * Une durée qui monte fait échouer la garde (« durée de signature trop
 * longue ») · qui la change le dit ici, mesurée.
 */
const DUREES_MESUREES: Readonly<Record<string, number>> = {
  'vision · tagging d’un fichier': 300,
  'vision · tagging en lot': 300,
  'vision · description d’une créa Adsmap': 300,
  'fal · worker Studios': 900,
};

const objet = (n: string, ws = ids.wsA) => `${BASE}/assets/${ws}/${n}`;
const LOGO = objet('1700000000000-abcd1234-logo.png');
const PHOTO = objet('1700000000001-ef567890-produit.png');
const FICHIER = objet('1700000000002-0a1b2c3d-rush.png');
const VIGNETTE = objet('drive-1AbC-thumb.jpg');
const ASSET_PUB = objet('1700000000007-44444444-pub.png');
/** L'asset d'une pub qui nomme un objet d'un AUTRE espace · il ne part jamais, ni brut ni signé. */
const ASSET_INTRUS = objet('1700000000008-55555555-intrus.png', ids.wsB);
const cleDe = (u: string) => u.slice(BASE.length + 1);

/* ───────────── Le faux réseau · le bucket (semé, ETag = MD5, If-Match honoré), et les tiers qui reçoivent ───────────── */

const octets = new Map<string, Buffer>();
const etagDe = (o: Buffer) => `"${createHash('md5').update(o).digest('hex')}"`;
type Envoi = { url: string; methode: string; corps: string };
const envois: Envoi[] = [];
const REQ = 'a1b2c3d4-0000-4000-8000-00000000beef';
async function fauxReseau(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(entree instanceof Request ? entree.url : String(entree));
  const methode = init?.method ?? 'GET';
  if (u.host === CFG.endpoint) {
    const cle = decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length));
    if (methode === 'PUT') { octets.set(cle, Buffer.from(await new Response(init?.body ?? null).arrayBuffer())); return new Response(null, { status: 200, headers: { etag: etagDe(octets.get(cle)!) } }); }
    const o = octets.get(cle);
    if (!o) return new Response(null, { status: 404 });
    const ifMatch = new Headers(init?.headers).get('if-match');
    if (ifMatch !== null && ifMatch !== etagDe(o)) return new Response(null, { status: 412 });
    const entetes = { 'content-length': String(o.length), 'content-type': 'image/png', etag: etagDe(o) };
    return methode === 'HEAD' ? new Response(null, { status: 200, headers: entetes }) : new Response(new Uint8Array(o), { status: 200, headers: entetes });
  }
  // Tout le reste est un TIERS · on garde ce qui lui serait parti, rien ne sort.
  envois.push({ url: u.toString(), methode, corps: typeof init?.body === 'string' ? init.body : init?.body ? '[corps non textuel]' : '' });
  if (u.host === 'a.klaviyo.com') return new Response(null, { status: 202 });
  if (u.host === 'fal.run') return Response.json({ images: [{ url: 'https://v3.fal.media/files/lion/scene.png' }] });
  if (u.host === 'queue.fal.run') {
    const base = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
    return Response.json({ request_id: REQ, response_url: base, status_url: `${base}/status`, cancel_url: `${base}/cancel` });
  }
  return new Response('réseau coupé', { status: 599 });
}

/* ───────────── 1 · Le recensement, par motif ───────────── */

const RACINE_WEB = join(__dirname, '..');
const RACINE_PRODUIT = join(RACINE_WEB, '../..');
/** Le code SERVEUR · ce qui peut parler à un tiers (les vues clientes ne parlent qu'aux routes de l'app, gardées par #1007/#1010). */
const RACINES = ['apps/web/app', 'apps/web/lib', 'apps/workers/src', 'packages/ai/src', 'packages/integrations/src', 'packages/core/src', 'packages/db/src'];
function fichiersDe(dossier: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dossier)) {
    if (n === 'node_modules' || n === 'test' || n === '__tests__') continue;
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) out.push(...fichiersDe(p));
    else if (/\.(ts|tsx)$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) && !n.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
/** Le texte sans ses lignes de commentaire (un appel CITÉ dans une doc n'est pas un appel). */
const sansCommentaires = (t: string) => t.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

/**
 * Les motifs d'un envoi vers l'extérieur · chacun capte l'APPEL (jamais la
 * définition, `function x(`, ni une méthode d'un autre objet, `.x(`).
 */
const MOTIFS: Readonly<Record<string, { re: RegExp; quoi: string }>> = {
  courriel: { re: /(?<![.\w])sendMail\s*\(/g, quoi: 'un courriel part (`sendMail`, `lib/mailer.ts`)' },
  transport: { re: /from\s+['"]nodemailer['"]|require\(\s*['"]nodemailer['"]\s*\)/g, quoi: 'un transport de courriel (nodemailer)' },
  'vision-url': { re: /(?<![.\w])(?:describeAssetImage|analyzeAdAsset)\s*\(/g, quoi: 'une image transmise par ADRESSE au modèle de vision' },
  'anthropic-url': { re: /type:\s*['"]url['"]/g, quoi: 'une source d’image par adresse dans un message Anthropic' },
  'generation-fal': { re: /(?<![.\w])(?:falGenerateImage|falSubmitVideo|hfSubmitVideo|hfSubmitImageVideo)\s*\(/g, quoi: 'une génération soumise à fal / Higgsfield' },
  'fal-studio': { re: /new\s+FournisseurFal\s*\(/g, quoi: 'un fournisseur Studios sur la file fal' },
  'http-sortant': { re: /method:\s*['"](?:POST|PUT|PATCH)['"]/g, quoi: 'une requête HTTP qui ÉCRIT chez un tiers (corps envoyé)' },
  stripe: { re: /stripe\.[a-zA-Z.]+\.create\s*\(/g, quoi: 'un objet créé chez Stripe' },
};
const definition = /(?:function|async function)\s+(?:sendMail|describeAssetImage|analyzeAdAsset|falGenerateImage|falSubmitVideo|hfSubmitVideo|hfSubmitImageVideo)\s*\(/g;

function recenser(): Map<string, number> {
  const trouves = new Map<string, number>();
  for (const r of RACINES) {
    for (const f of fichiersDe(join(RACINE_PRODUIT, r))) {
      const t = sansCommentaires(readFileSync(f, 'utf8')).replace(definition, '');
      const rel = relative(RACINE_PRODUIT, f);
      for (const [nom, { re }] of Object.entries(MOTIFS)) {
        const n = [...t.matchAll(new RegExp(re.source, 'g'))].length;
        if (n) trouves.set(`${rel} · ${nom}`, n);
      }
    }
  }
  return trouves;
}

/**
 * Chaque point d'envoi · `cas` = exercé par cette garde (le nom du cas) ;
 * `primitive` = la fonction d'envoi elle-même, ses appelants sont recensés par
 * le motif nommé ; `sansAdresse` = son contenu ne peut pas porter d'objet du
 * stockage, avec la raison et la PREUVE lue dans le fichier (`contient` doit y
 * être, `exclut` ne doit pas y être) · une preuve qui ne tient plus fait de
 * l'exemption une exemption MORTE.
 */
type Traitement =
  | { cas: readonly string[] }
  | { primitive: string }
  | { sansAdresse: string; contient?: RegExp; exclut?: RegExp };
const SORTANTS: Readonly<Record<string, { n: number } & Traitement>> = {
  // ── Courriels ──
  'apps/web/app/actions/auth.ts · courriel': { n: 2, cas: ['courriel · bienvenue', 'courriel · réinitialisation'] },
  'apps/web/app/actions/invites.ts · courriel': { n: 1, cas: ['courriel · invitation'] },
  'apps/web/app/api/cron/digest/route.ts · courriel': { n: 1, cas: ['courriel · récapitulatif hebdomadaire'] },
  'apps/web/lib/mailer.ts · transport': { n: 1, cas: ['courriel · bienvenue', 'courriel · réinitialisation', 'courriel · invitation', 'courriel · récapitulatif hebdomadaire'] },
  // ── Vision (image par adresse) ──
  'apps/web/app/actions/assets.ts · vision-url': { n: 2, cas: ['vision · tagging d’un fichier', 'vision · tagging en lot'] },
  'apps/web/app/actions/adsmap-analyze.ts · vision-url': { n: 3, cas: ['vision · description d’une créa Adsmap'] },
  'apps/web/app/actions/market-learn.ts · vision-url': {
    n: 1, sansAdresse: 'créa CONCURRENTE lue chez Trendtrack · son adresse est celle de la régie (publique), jamais un objet de notre stockage',
    contient: /imageUrl:\s*a\.thumbnailUrl\s*\|\|\s*a\.mediaUrl\s*\|\|\s*null/,
  },
  'apps/web/lib/radar.ts · vision-url': {
    n: 1, sansAdresse: 'créa CONCURRENTE lue chez Trendtrack (radar de veille) · adresse publique de la régie, jamais un objet de notre stockage',
    contient: /imageUrl:\s*a\.thumbnailUrl\s*\|\|\s*a\.mediaUrl\s*\|\|\s*null/,
  },
  'packages/ai/src/adsmap-asset.ts · anthropic-url': { n: 1, primitive: 'vision-url' },
  'packages/ai/src/generation.ts · anthropic-url': { n: 1, primitive: 'vision-url' },
  // ── Génération ──
  'apps/web/app/actions/brand-detail.ts · generation-fal': { n: 1, cas: ['fal · visuel de scénario'] },
  'apps/workers/src/studios/fournisseurs.ts · fal-studio': { n: 1, cas: ['fal · worker Studios'] },
  'apps/web/lib/studios/benchmark/executeur-fal.ts · fal-studio': {
    n: 1, sansAdresse: 'banc d’essai · les références sont les octets du jeu SYNTHÉTIQUE, envoyés en data URI (aucune adresse)',
    contient: /url:\s*`data:image\/png;base64,\$\{/, exclut: /presign|privateObjectUrl|storageFromEnv/,
  },
  // ── HTTP qui écrit chez un tiers ──
  'apps/web/lib/klaviyo.ts · http-sortant': { n: 1, cas: ['webhook · Klaviyo inscription', 'webhook · Klaviyo onboarding'] },
  'packages/integrations/src/fal.ts · http-sortant': { n: 2, primitive: 'generation-fal' },
  'packages/integrations/src/higgsfield.ts · http-sortant': { n: 2, primitive: 'generation-fal' },
  'packages/integrations/src/studios-fal.ts · http-sortant': { n: 2, cas: ['fal · worker Studios'] },
  'packages/integrations/src/google-drive.ts · http-sortant': {
    n: 2, sansAdresse: 'échange OAuth Google (code et jetons) · aucun fichier ni adresse dans le corps',
    contient: /fetch\(TOKEN,\s*\{\s*method:\s*'POST'/,
  },
  'apps/web/app/api/oauth/shopify/callback/route.ts · http-sortant': {
    n: 1, sansAdresse: 'échange OAuth Shopify (code contre jeton) · aucun fichier ni adresse dans le corps',
    contient: /client_secret/,
  },
  'packages/integrations/src/shopify-admin.ts · http-sortant': {
    n: 1, sansAdresse: 'requête GraphQL de LECTURE de l’admin Shopify (commandes, produits) · rien de notre stockage n’y part',
    contient: /graphql\.json/, exclut: /mutation|storageFromEnv|presign/,
  },
  'packages/integrations/src/trendtrack.ts · http-sortant': {
    n: 6, sansAdresse: 'requêtes de RECHERCHE Trendtrack (marques, mots, filtres) · aucune adresse d’image dans le corps',
    exclut: /imageUrl|image_url|storageFromEnv|presign/,
  },
  'packages/integrations/src/storage.ts · http-sortant': {
    n: 1, sansAdresse: 'signature d’une requête vers NOTRE bucket (S3 lui-même, pas un tiers)',
    contient: /function presignObjectUrl\(cfg: StorageConfig, key: string, method: 'PUT' \| 'GET' \| 'HEAD'/,
  },
  // ── Stripe ──
  'apps/web/app/actions/stripe.ts · stripe': {
    n: 6, sansAdresse: 'client, session de paiement, portail · identifiants, prix et adresses de RETOUR vers l’app, jamais une image',
    exclut: /images\s*:|logoUrl|imageUrl|storageFromEnv/,
  },
  'apps/web/lib/stripe-bascule.ts · stripe': {
    n: 1, sansAdresse: 'calendrier d’abonnement (prix, échéance) · aucune image',
    exclut: /images\s*:|logoUrl|imageUrl|storageFromEnv/,
  },
};

/* ───────────── 2 · La base semée ───────────── */

const s = { produit: '', fichier: '', sortie: '', projet: '', version: '', ad: '', adIntrus: '' };

beforeAll(async () => {
  vi.stubEnv('FOUNDER_EMAILS', 'ua@studios.test');
  vi.stubEnv('CRON_SECRET', 'secret-cron-test');
  vi.stubEnv('APP_URL', APP);
  vi.stubEnv('SMTP_URL', 'smtp://faux:faux@smtp.exemple.invalid:25');
  vi.stubEnv('KLAVIYO_API_KEY', 'pk_faux');
  vi.stubEnv('FAL_KEY', 'cle-fal-test:secret');
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-faux');
  vi.stubEnv('AI_SPEND_CAP_USD', '10');
  vi.stubGlobal('fetch', fauxReseau);
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'business', onboardedAt: new Date(), creditsBalance: 1000 }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  for (const u of [LOGO, PHOTO, FICHIER, VIGNETTE, ASSET_PUB]) octets.set(cleDe(u), Buffer.from(`\x89PNG objet ${createHash('md5').update(u).digest('hex')}`));
  // Logo IMPORTÉ (objet du stockage, à empreinte) en défaut.
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO], logoEmpreintes: { [LOGO]: createHash('md5').update(octets.get(cleDe(LOGO))!).digest('hex') } }).where(eq(schema.brands.id, ids.brandA1));
  const [pr] = await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Sérum', imageUrl: PHOTO, imageUrls: [PHOTO] }).returning({ id: schema.products.id });
  s.produit = pr!.id;
  // Deux fichiers de la Bibliothèque au stockage, sans tags (le tagging les lit).
  const [f] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, uploaderUserId: ids.ua, name: 'Rush', kind: 'image', source: 'upload', url: FICHIER, thumbUrl: VIGNETTE, mimeType: 'image/png', objectEtag: 'abc' }).returning({ id: schema.assets.id });
  s.fichier = f!.id;
  // Une sortie Studios LIVRÉE.
  s.sortie = randomUUID();
  octets.set(`studios/${ids.wsA}/${s.sortie}.png`, Buffer.from('\x89PNG sortie'));
  await db.insert(schema.studioAssets).values({ id: s.sortie, workspaceId: ids.wsA, brandId: ids.brandA1, storageKey: `studios/${ids.wsA}/${s.sortie}.png`, mime: 'image/png', bytes: 10, width: 8, height: 6, sha256: 'a'.repeat(64), origin: 'generated', storageState: 'stored' });
  // Une chaîne Adsmap · trois pubs en attente de verdict (la lettre de la semaine part) · la première a son asset AU STOCKAGE, la deuxième nomme un objet d'un autre espace.
  const [pe] = await db.insert(schema.personas).values({ brandId: ids.brandA1, name: 'Persona' }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: 'Concept' }).returning();
  const pubs = await db.insert(schema.ads).values(['V1', 'V2', 'V3'].map((v, i) => ({ workspaceId: ids.wsA, conceptId: co!.id, variantCode: v, assetUrl: [ASSET_PUB, ASSET_INTRUS, null][i] }))).returning();
  s.ad = pubs[0]!.id;
  s.adIntrus = pubs[1]!.id;
  // Un projet Studios et sa version (le job du worker s'y rattache).
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'image', title: 'Projet', ownerId: ids.ua }).returning();
  const c = contenuVide();
  const [v] = await db.insert(schema.studioProjectVersions).values({ projectId: p!.id, workspaceId: ids.wsA, brandId: ids.brandA1, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: c, contentHash: empreinteContenu(c), authorId: ids.ua }).returning();
  s.projet = p!.id; s.version = v!.id;
  h.session = { user: { id: ids.ua, email: 'ua@studios.test', name: 'Kevin' }, workspaceId: ids.wsA, workspaceName: 'Espace A', role: 'owner', plan: 'business', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] };
  h.cookie = ids.brandA1;
});
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/** Le job du worker · quatre références, une de chaque sorte, chacune au stockage. */
async function semerJobStudio(): Promise<string> {
  const hacher = (await import('../../workers/src/studios/fournisseurs')).hacherImage;
  const [ph] = photosDuProduit({ id: s.produit, name: 'Sérum', imageUrl: PHOTO, imageUrls: [PHOTO] }, hacher);
  const shaLogo = hacher(LOGO).sha256;
  const refs = [
    { assetId: ph!.assetId, sha256: ph!.sha256, role: 'product' },
    { assetId: idLogoMarque(ids.brandA1, shaLogo), sha256: shaLogo, role: 'logo' },
    { assetId: `sta_${s.sortie}`, sha256: 'a'.repeat(64), role: 'style' },
    { assetId: `bib_${s.fichier}`, sha256: hacher(FICHIER).sha256, role: 'style' },
  ];
  const parametres = parametresImageDuDevis({
    consigne: { generationInstruction: 'Le sérum posé sur une table en chêne, lumière du matin.', negativeConstraints: [], protectedComponents: [], needsDeterministicOverlay: false, referenceBindings: refs.map((r) => ({ referenceId: r.assetId, role: r.role, scope: 'global' })) },
    references: refs.map((r) => ({ ...r, assetVersion: `sha256-${r.sha256.slice(0, 16)}` })),
    largeur: 1080, hauteur: 1350,
  });
  const lignes = [{ operation: 'keyframe:s1', nature: 'generation' as const, profil: 'image_generation' as const, unites: 1, credits: 4, usdMicros: 80_000, inclus: false }];
  const hh = 'c'.repeat(64);
  const [q] = await db.insert(schema.studioQuotes).values({ workspaceId: ids.wsA, brandId: ids.brandA1, projectId: s.projet, projectVersionId: s.version, impactPlanHash: hh, inputHash: hh, pricingVersion: 'v', lines: lignes, maximumCredits: 4, maximumUsdMicros: 80_000, expiresAt: new Date(Date.now() + 60_000), createdBy: ids.ua }).returning();
  const [a] = await db.insert(schema.studioApprovals).values({ quoteId: q!.id, workspaceId: ids.wsA, brandId: ids.brandA1, inputHash: hh, approvedBy: ids.ua }).returning();
  const snapshot: SnapshotJob = { v: 1, quoteId: q!.id, projectVersionId: s.version, contentHash: hh, impactPlanHash: hh, pricingVersion: 'v', lignes, epinglage: null, reserve: { credits: 4, usdMicros: 80_000 }, parametres: parametres as unknown as Record<string, unknown> };
  const [j] = await db.insert(schema.studioJobs).values({ workspaceId: ids.wsA, brandId: ids.brandA1, projectId: s.projet, projectVersionId: s.version, quoteId: q!.id, approvalId: a!.id, operation: OPERATION_JOB_STUDIO, idempotencyKey: `k-${q!.id}`, inputHash: hh, snapshot, createdBy: ids.ua }).returning();
  await db.insert(schema.studioBudgetLedger).values({ workspaceId: ids.wsA, brandId: ids.brandA1, projectId: s.projet, jobId: j!.id, quoteId: q!.id, kind: 'reserve', credits: 4, usdMicros: 80_000, ref: refsDuJob(j!.id).reserve });
  return j!.id;
}

/* ───────────── 3 · Les cas · chaque point exercé, et ce qu'il DOIT montrer ───────────── */

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
const sansRedirection = async (p: Promise<unknown>) => { try { return await p; } catch (e) { if (!String((e as Error).message).startsWith('REDIRECT ')) throw e; return (e as Error).message; } };
const signee = (u: string) => `${CFG.endpoint}/${CFG.bucket}/${cleDe(u)}?X-Amz-Algorithm=AWS4-HMAC-SHA256`;

type Nature = 'courriel' | 'webhook' | 'fournisseur';
type Cas = {
  nature: Nature;
  lancer: () => Promise<unknown>;
  /** Ce que la sortie DOIT contenir · sans eux la garde passerait sur un envoi vide. */
  temoins: () => readonly string[];
  /** Le tiers visé (webhook, fournisseur par HTTP) · ses envois sont lus. */
  hote?: string;
};
const CAS: Readonly<Record<string, Cas>> = {
  'courriel · bienvenue': {
    nature: 'courriel', lancer: () => sansRedirection(import('../app/actions/auth').then((m) => m.signupAction(fd({ email: 'nouveau@studios.test', password: 'motdepasse-long-1', name: 'Léa' })))),
    temoins: () => [`${APP}/dashboard`],
  },
  'webhook · Klaviyo inscription': {
    nature: 'webhook', hote: 'a.klaviyo.com', lancer: () => sansRedirection(import('../app/actions/auth').then((m) => m.signupAction(fd({ email: 'autre@studios.test', password: 'motdepasse-long-1', name: 'Noé' })))),
    temoins: () => ['"name":"Signed Up"'],
  },
  'courriel · réinitialisation': {
    nature: 'courriel', lancer: () => sansRedirection(import('../app/actions/auth').then((m) => m.forgotPasswordAction(fd({ email: 'ua@studios.test' })))),
    temoins: () => [`${APP}/reset/`],
  },
  'courriel · invitation': {
    nature: 'courriel', lancer: () => sansRedirection(import('../app/actions/invites').then((m) => m.createInviteAction(fd({ email: 'invite@studios.test', role: 'member' })))),
    temoins: () => [`${APP}/invite/`],
  },
  'courriel · récapitulatif hebdomadaire': {
    nature: 'courriel',
    lancer: async () => (await import('../app/api/cron/digest/route')).GET(new Request('http://localhost/api/cron/digest', { headers: { authorization: 'Bearer secret-cron-test' } })),
    temoins: () => ['Marque A1 · ', `${APP}/`],
  },
  'webhook · Klaviyo onboarding': {
    nature: 'webhook', hote: 'a.klaviyo.com',
    lancer: async () => (await import('../app/actions/onboarding')).saveOnboardingAction({ profile: 'brand', brandName: 'Marque A1', siteUrl: 'https://boutique.exemple.fr' } as Parameters<typeof import('../app/actions/onboarding').saveOnboardingAction>[0]),
    temoins: () => ['"name":"Completed Onboarding"'],
  },
  'vision · tagging en lot': {
    nature: 'fournisseur', lancer: async () => (await import('../app/actions/assets')).tagUntaggedImagesAction(),
    temoins: () => [signee(FICHIER)],
  },
  'vision · tagging d’un fichier': {
    nature: 'fournisseur', lancer: async () => (await import('../app/actions/assets')).tagAssetAction({ id: s.fichier }),
    temoins: () => [signee(FICHIER)],
  },
  'vision · description d’une créa Adsmap': {
    nature: 'fournisseur', lancer: async () => (await import('../app/actions/adsmap-analyze')).analyzeAssetsAction([s.ad, s.adIntrus]),
    temoins: () => [signee(ASSET_PUB)],
  },
  'fal · visuel de scénario': {
    nature: 'fournisseur', hote: 'fal.run',
    lancer: async () => {
      const [sc] = await db.insert(schema.scenarios).values({ brandId: ids.brandA1, title: 'Au réveil, salle de bain' }).returning({ id: schema.scenarios.id });
      return (await import('../app/actions/brand-detail')).generateScenarioImageAction({ brandId: ids.brandA1, scenarioId: sc!.id });
    },
    temoins: () => ['Au réveil, salle de bain'],
  },
  'fal · worker Studios': {
    nature: 'fournisseur', hote: 'queue.fal.run',
    lancer: async () => {
      const { construireFournisseurFal } = await import('../../workers/src/studios/fournisseurs');
      const jobId = await semerJobStudio();
      const f = construireFournisseurFal({
        base: db as unknown as BaseStudio,
        decision: { ok: true, apiKey: 'cle-fal-test:secret', queueUrl: null, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit', animation: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video' } },
        fetch: fauxReseau as typeof fetch, env: { AI_SPEND_CAP_USD: '10' }, stockage: CFG, lire: null, verifierAdresse: async () => true,
      });
      return f.soumettre({ cleIdempotence: cleFournisseurDuJob(jobId), operations: [{ operation: 'keyframe:s1', profil: 'image_generation' }], parametres: {} }).catch((e: Error) => ({ erreur: e.message }));
    },
    temoins: () => [signee(PHOTO), signee(LOGO), `${CFG.endpoint}/${CFG.bucket}/studios/${ids.wsA}/${s.sortie}.png?X-Amz-Algorithm=AWS4-HMAC-SHA256`, signee(FICHIER)],
  },
};

/* ───────────── La lecture de ce qui sort ───────────── */

const URLS = /https?:\/\/[^\s"'<>\\)]+/g;
/** Une adresse SIGNÉE AWS4, d'un objet de l'espace semé, et sa durée. */
function signature(u: string): { cle: string; duree: number } | null {
  let url: URL;
  try { url = new URL(u.replace(/&amp;/g, '&')); } catch { return null; }
  const q = url.searchParams;
  const duree = Number(q.get('X-Amz-Expires'));
  const cle = decodeURIComponent(url.pathname.replace(/^\/[^/]+\//, ''));
  const ok = url.host === CFG.endpoint && q.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256' && /^[0-9a-f]{64}$/.test(q.get('X-Amz-Signature') ?? '') && !!q.get('X-Amz-Credential') && !!q.get('X-Amz-Date')
    && Number.isInteger(duree) && duree > 0 && [`assets/${ids.wsA}/`, `studios/${ids.wsA}/`].some((p) => cle.startsWith(p));
  return ok ? { cle, duree } : null;
}

type Sortie = { textes: string[]; durees: number[]; fuites: string[] };
/** Ce qu'un cas a fait sortir · les textes envoyés, les durées de signature vues, et les fuites selon sa nature. */
function lire(nature: Nature, hote: string | undefined, c: { courriels: typeof h.courriels; appelsIA: unknown[]; envois: Envoi[] }): Sortie {
  const textes = nature === 'courriel'
    ? c.courriels.map((m) => [m.subject, m.html, m.text].map((x) => String(x ?? '')).join('\n'))
    : [...c.appelsIA.map((p) => JSON.stringify(p)), ...c.envois.filter((e) => !hote || new URL(e.url).host === hote).map((e) => `${e.methode} ${e.url}\n${e.corps}`)];
  const durees: number[] = [];
  const fuites: string[] = [];
  for (const t of textes) {
    if (nature === 'fournisseur') {
      // Seule forme admise · signée AWS4, objet de l'espace. On la retire, et ce qui reste du stockage est une fuite.
      let reste = t;
      for (const u of t.match(URLS) ?? []) {
        const sg = signature(u);
        if (!sg) continue;
        durees.push(sg.duree);
        reste = reste.split(u).join('<signée>');
      }
      fuites.push(...occurrences(reste));
    } else {
      fuites.push(...occurrences(t));
      if (/X-Amz-/i.test(t)) fuites.push(`adresse SIGNÉE · …${t.slice(Math.max(0, t.search(/X-Amz-/i) - 80), t.search(/X-Amz-/i) + 40)}…`);
      if (nature === 'courriel') for (const u of t.match(URLS) ?? []) if (u !== APP && !u.startsWith(`${APP}/`)) fuites.push(`lien hors de l’application · ${u}`);
    }
  }
  return { textes, durees, fuites };
}

const TROUVES = recenser();
const sorties = new Map<string, Sortie>();

describe('Sortants · aucune adresse brute du stockage privé ne part vers l’extérieur', () => {
  it('le recensement · chaque envoi vers l’extérieur est recensé, exercé ou justifié (ni oublié, ni mort)', () => {
    expect.soft(TROUVES.size, 'le recensement ne trouve presque rien · les racines ou les motifs sont-ils encore justes ?').toBeGreaterThan(15);
    const nonRecenses = [...TROUVES].filter(([k, n]) => SORTANTS[k]?.n !== n).map(([k, n]) => `${k} · ${n} appel(s) trouvé(s), ${SORTANTS[k]?.n ?? 0} recensé(s)`);
    expect.soft(nonRecenses, 'point sortant NON RECENSÉ · dis dans `SORTANTS` comment il est exercé (un cas) ou pourquoi il ne peut porter aucun objet du stockage').toEqual([]);
    expect.soft(Object.keys(SORTANTS).filter((k) => !TROUVES.has(k)), 'entrée morte dans `SORTANTS` (l’envoi n’existe plus)').toEqual([]);
    const casCites = new Set(Object.values(SORTANTS).flatMap((t) => ('cas' in t ? t.cas : [])));
    expect.soft([...casCites].filter((c) => !(c in CAS)), 'cas cité dans `SORTANTS` mais absent de `CAS`').toEqual([]);
    expect.soft(Object.keys(CAS).filter((c) => !casCites.has(c)), 'cas orphelin (aucun point recensé ne le cite)').toEqual([]);
    expect.soft(Object.entries(SORTANTS).filter(([, t]) => 'primitive' in t && !Object.keys(SORTANTS).some((k) => k.endsWith(` · ${t.primitive}`) && 'cas' in SORTANTS[k]!)).map(([k]) => k), 'primitive dont aucun appelant n’est exercé').toEqual([]);
    expect.soft(Object.keys(DUREES_MESUREES).filter((c) => CAS[c]?.nature !== 'fournisseur'), 'durée mesurée d’un cas inconnu ou non fournisseur').toEqual([]);
    expect.soft(Object.values(DUREES_MESUREES).filter((d) => d > DUREE_FOURNISSEUR_MAX), `durée mesurée au-delà du plafond (${DUREE_FOURNISSEUR_MAX} s)`).toEqual([]);
  });

  it('chaque exemption tient encore (sa preuve est lue dans le fichier · une exemption morte est retirée)', () => {
    const mortes: string[] = [];
    for (const [k, t] of Object.entries(SORTANTS)) {
      if (!('sansAdresse' in t)) continue;
      const texte = readFileSync(join(RACINE_PRODUIT, k.split(' · ')[0]!), 'utf8');
      if (t.contient && !t.contient.test(texte)) mortes.push(`${k} · la preuve ${t.contient} n’est plus dans le fichier`);
      if (t.exclut && t.exclut.test(texte)) mortes.push(`${k} · le fichier contient désormais ${t.exclut} · la raison « ${t.sansAdresse} » ne tient plus`);
    }
    expect(mortes, 'exemption morte').toEqual([]);
  });

  it.each(Object.entries(CAS))('%s · rien de brut dans ce qui part', async (nom, c) => {
    h.courriels.length = 0; h.appelsIA.length = 0; envois.length = 0;
    const r = await c.lancer();
    const lu = lire(c.nature, c.hote, { courriels: [...h.courriels], appelsIA: [...h.appelsIA], envois: [...envois] });
    sorties.set(nom, lu);
    const vu = lu.textes.join('\n');
    expect(lu.textes.length, `${nom} · témoin absent · rien n’est parti (la garde lirait un envoi vide) · ${JSON.stringify(r)?.slice(0, 300)}`).toBeGreaterThan(0);
    const libelle = c.nature === 'courriel'
      ? 'adresse du stockage dans un COURRIEL (ni brute ni signée · un lien vers l’application, qui garde ses routes)'
      : c.nature === 'webhook' ? 'adresse du stockage dans un WEBHOOK' : 'adresse BRUTE (non signée) du stockage remise à un FOURNISSEUR';
    expect(lu.fuites, `${nom} · ${libelle}`).toEqual([]);
    for (const t of c.temoins()) expect(vu, `${nom} · témoin absent · ${t}`).toContain(t);
    if (c.nature === 'fournisseur' && nom in DUREES_MESUREES) {
      const max = DUREES_MESUREES[nom]!;
      expect(lu.durees.filter((d) => d > max), `${nom} · durée de signature trop longue (mesurée ${max} s, plafond ${DUREE_FOURNISSEUR_MAX} s)`).toEqual([]);
      // CHAQUE adresse signée (pas seulement la plus longue · le worker signe à deux endroits) porte la durée mesurée.
      expect(lu.durees.length, `${nom} · témoin absent · aucune adresse signée n’est partie`).toBeGreaterThan(0);
      expect(lu.durees.filter((d) => d !== max), `${nom} · durée mesurée périmée · la durée réellement utilisée a changé, mesure-la et écris-la dans \`DUREES_MESUREES\``).toEqual([]);
    }
  });
});
