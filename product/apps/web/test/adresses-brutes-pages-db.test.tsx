import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Le stockage (S3 OVH) est PRIVÉ · la lecture anonyme y est refusée. Une page
 * qui écrit l'adresse BRUTE d'un objet (`<publicBaseUrl>/assets/<espace>/…`)
 * montre une image cassée (#1001 coquille et accueil, #1002 Veille · Formats,
 * corrigés au cas par cas). Les fichiers passent par les routes gardées ·
 * `/api/brands/[id]/media` (`brandMediaPreview`), `/api/asset/[id]`,
 * `/api/studios/media/[id]`, `/studio/projets/[id]/produit/fichier/[id]`,
 * `/api/adsmap/[id]/apercu` (`?media=vignette|brief`).
 *
 * Garde GLOBALE · vraie base (pglite + migrations), un espace semé d'objets du
 * stockage RÉELS de chaque sorte (logo importé à empreinte, photo produit,
 * fichier de la Bibliothèque et sa vignette, sortie Studios livrée, et une
 * gagnante Adsmap dont le « Lien de l'Ad », la miniature de la créa et le
 * « Lien du Brief créa » sont au stockage · #1015 n'avait corrigé que la
 * table, les écrans Résultats, l'Accueil, Itérer et Projets lisaient encore
 * `ads.asset_url` et `creatives.thumb_url` bruts), une
 * `publicBaseUrl` reconnaissable · puis CHAQUE `page.tsx` de l'arbre Spatial
 * (recensées par le système de fichiers, une page ajoutée est couverte d'office)
 * et la coquille sont rendues pour de vrai. On lit ce qui SORT :
 *  - le HTML · aucune occurrence de l'hôte de la base (src, srcset, href,
 *    `background-image`, `<link rel="preload">`, texte, `aria-label`…), ni de
 *    l'hôte du service sous ses deux formes canoniques ; AUCUNE exemption ;
 *  - les données remises à la vue (ce que le serveur sérialise vers le
 *    navigateur, qu'une surcouche ouverte plus tard afficherait) · aucune
 *    adresse brute, hors la liste EXPLICITE `EXEMPTIONS_DONNEES` (justifiée) ;
 *  - des TÉMOINS · chaque objet semé est bien montré, par sa route gardée, sur
 *    les écrans principaux · sans eux la garde passerait sur une page vide.
 * Un échec nomme l'écran, l'attribut et le contexte.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, cookie: null as string | null, chemin: '/dashboard' }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
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
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => h.chemin, useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.cookie ? { value: h.cookie } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': h.chemin }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import { semer } from './studios-semis';
import { projetTest } from './l3-harnais';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const BASE = CFG.publicBaseUrl;
/** Ce qui ne doit JAMAIS sortir · l'hôte de la base publique, et l'hôte du service sous ses formes canoniques (`objectKeyFromUrl`). */
const BRUTES: ReadonlyArray<{ motif: RegExp; nom: string }> = [
  { motif: /adresse-brute\.stockage\.test\//g, nom: 'base publique du stockage' },
  { motif: /s3\.brutes\.test\/tt-prive\//g, nom: 'adresse du service (chemin)' },
  { motif: /tt-prive\.s3\.brutes\.test\//g, nom: 'adresse du service (hôte du bucket)' },
];
const objet = (n: string) => `${BASE}/assets/${ids.wsA}/${n}`;
const LOGO = objet('1700000000000-abcd1234-logo.png');
const PHOTO = objet('1700000000001-ef567890-produit.png');
const FICHIER = objet('1700000000002-0a1b2c3d-rush.png');
const VIGNETTE = objet('drive-1AbC-thumb.jpg');
/** Adsmap · le « Lien de l'Ad », la miniature de sa créa et le « Lien du Brief créa », rangés au stockage de l'espace. */
const MEDIA_AD = objet('1700000000003-1a2b3c4d-gagnante.png');
const VIGNETTE_CREA = objet('1700000000004-2b3c4d5e-vignette.jpg');
const BRIEF = objet('1700000000005-3c4d5e6f-brief.png');
/** Deux créas d'une AUTRE marque collées sur des ads de la marque active · une miniature au stockage, une miniature de régie. */
const MINI_ETRANGERE = objet('1700000000006-4d5e6f70-autre-marque.jpg');
const MINI_ETRANGERE_EXTERNE = 'https://cdn.autre-marque.test/mini.jpg';
/** La plus petite variante du lot (identifiant fixé) n'a qu'une page de partage · la vignette du lot doit passer à la suivante. */
const AD_DRIVE = '00000000-0000-4000-8000-000000000001';
/** Une variante de logo EXTERNE (le site de la marque) · publique, son adresse se montre. */
const EXTERNE = 'https://site.exemple.fr/logo.png';
const cleDe = (u: string) => u.slice(BASE.length + 1);
const esc = (t: string) => renderToStaticMarkup(<>{t}</>);
const apercu = (u: string) => esc(`/api/brands/${ids.brandA1}/media?url=${encodeURIComponent(u)}`);

/* ───────────── Le faux bucket · sert les objets semés, ETag = MD5, If-Match honoré ───────────── */

const octets = new Map<string, Buffer>();
const etagDe = (o: Buffer) => `"${createHash('md5').update(o).digest('hex')}"`;
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(String(entree));
  if (u.host !== CFG.endpoint) return new Response('réseau coupé', { status: 599 });
  const o = octets.get(decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length)));
  if (!o) return new Response(null, { status: 404 });
  const ifMatch = new Headers(init?.headers).get('if-match');
  if (ifMatch !== null && ifMatch !== etagDe(o)) return new Response(null, { status: 412 });
  const entetes = { 'content-length': String(o.length), 'content-type': 'image/png', etag: etagDe(o) };
  return (init?.method ?? 'GET') === 'HEAD' ? new Response(null, { status: 200, headers: entetes }) : new Response(new Uint8Array(o), { status: 200, headers: entetes });
}

/* ───────────── Les écrans · chaque `page.tsx` de l'arbre Spatial, et la coquille ───────────── */

type Module = { default: (p: unknown) => Promise<ReactNode> | ReactNode };
// `import.meta.glob` est résolu par vite (vitest) à la transformation · le type vient de `vite/client`, qui n'est pas une dépendance de l'application.
declare global { interface ImportMeta { glob<T>(motif: string): Record<string, () => Promise<T>> } }
const FICHIERS = import.meta.glob<Module>('../app/\\(spatial\\)/sp/**/page.tsx');
const COQUILLE = 'coquille (layout Spatial)';
const cheminDe = (f: string) => f.replace('../app/(spatial)/sp', '').replace(/\/page\.tsx$/, '') || '/';
const ECRANS: ReadonlyArray<{ chemin: string; charger: () => Promise<Module> }> = [
  { chemin: COQUILLE, charger: async () => ({ default: async () => (await import('../app/(spatial)/layout')).default({ children: <main>page</main> }) }) },
  ...Object.entries(FICHIERS).map(([f, charger]) => ({ chemin: cheminDe(f), charger })),
];

/** Les écrans principaux · présents dans l'arbre, et rendus (aucun ne peut sortir de la garde sans qu'on le voie). */
const PRINCIPAUX = [
  COQUILLE, '/onboarding', '/dashboard', '/brands', '/brands/[id]', '/brands/[id]/identite', '/brands/[id]/offre', '/brands/[id]/personas', '/brands/[id]/regles',
  '/assets', '/veille', '/veille/formats', '/veille/formats/[format]', '/veille/concurrents', '/veille/scale', '/veille/tendances', '/saved', '/radar',
  '/studio/projets', '/studio/projets/nouveau', '/studio/projets/[id]', '/studio/projets/[id]/image', '/studio/projets/[id]/produit', '/studio/projets/[id]/video',
  '/studio/projets/[id]/textes', '/studio/projets/[id]/identites', '/studio/projets/[id]/export', '/adsmap', '/adsmap/lots', '/adsmap/lots/[id]', '/adsmap/tests', '/adsmap/tests/[id]', '/studio/iterer', '/jarvis',
  '/settings', '/profile', '/team', '/billing', '/support', '/support/[id]', '/admin', '/admin/stockage',
];

/**
 * Les SEULS écrans qui ne rendent rien · avec la raison et ce qu'ils lèvent
 * exactement. Toute autre levée fait échouer la garde (un écran qui ne se rend
 * pas ne serait pas gardé).
 */
const NON_RENDUS: Readonly<Record<string, { leve: string; raison: string }>> = {
  '/adsmap/jarvis': { leve: 'REDIRECT /jarvis', raison: 'redirection pure vers Jarvis (aucun rendu, aucune donnée lue)' },
};

/**
 * Les SEULES adresses brutes admises dans les données remises à une vue ·
 * jamais affichées (le HTML est gardé sans exemption). La charte nomme ses
 * logos par leur adresse CANONIQUE (`brands.logo_url`, `brands.logos`) · la
 * liste repart telle quelle à `saveBrandDAAction` (choisir le défaut, retirer,
 * importer à la place) et la route média la reçoit pour juger le logo. La
 * remplacer par une autre forme casserait l'enregistrement ; l'image, elle,
 * passe par `apercus` (route média) et le nom par `libelles`.
 */
const EXEMPTIONS_DONNEES: ReadonlyArray<{ ecran: string; chemin: string; raison: string }> = [
  { ecran: '/brands/[id]', chemin: '<Marque>.favicon.importLogo.logos[]', raison: 'identifiants de la charte, renvoyés à l’import du logo' },
  { ecran: '/brands/[id]', chemin: '<Marque>.favicon.importLogo.defaut', raison: 'identifiant du logo par défaut, renvoyé à l’import' },
  { ecran: '/brands/[id]/identite', chemin: '<Identite>.favicon.importLogo.logos[]', raison: 'identifiants de la charte, renvoyés à l’import du logo' },
  { ecran: '/brands/[id]/identite', chemin: '<Identite>.favicon.importLogo.defaut', raison: 'identifiant du logo par défaut, renvoyé à l’import' },
  { ecran: '/brands/[id]/identite', chemin: '<Identite>.gestion.logos.logos[]', raison: 'identifiants de la charte, renvoyés à « Par défaut » et « Retirer »' },
  { ecran: '/brands/[id]/identite', chemin: '<Identite>.gestion.logos.defaut', raison: 'identifiant du logo par défaut, renvoyé à l’enregistrement' },
];

const s = { projet: '', sortie: '', fichier: '', lot: '', ticket: '', ad: '', adEtrangere: '', adEtrangereExterne: '' };
/** Les routes gardées de l'ad semée · sa miniature (créa), son « Lien de l'Ad », son brief. */
const vignetteAd = () => esc(`/api/adsmap/${s.ad}/apercu?media=vignette`);

/** Ce que chaque écran principal DOIT montrer des objets semés, par sa route gardée. */
const temoins = (): Readonly<Record<string, readonly string[]>> => ({
  [COQUILLE]: [apercu(LOGO)],
  '/onboarding': [apercu(LOGO)],
  '/dashboard': [`/api/studios/media/${s.sortie}`, vignetteAd()],
  '/brands/[id]': [apercu(LOGO), esc(`/api/asset/${s.fichier}?v=2`)],
  '/brands/[id]/identite': [apercu(LOGO), 'Logo importé · logo.png'],
  '/brands/[id]/offre': [apercu(PHOTO)],
  '/assets': [esc(`/api/asset/${s.fichier}?v=2`)],
  '/veille/formats': [apercu(PHOTO)],
  '/veille/formats/[format]': [apercu(PHOTO)],
  '/studio/projets/[id]/produit': [`/studio/projets/${s.projet}/produit/fichier/pph_`],
  '/studio/projets': [vignetteAd()],
  '/studio/iterer': [vignetteAd()],
  '/adsmap': [vignetteAd()],
  '/adsmap/lots': [vignetteAd()],
  '/adsmap/lots/[id]': [vignetteAd()],
});

function parametres(chemin: string): Record<string, string> {
  const p: Record<string, string> = {};
  if (chemin.startsWith('/brands/[id]')) p.id = ids.brandA1;
  if (chemin.startsWith('/studio/projets/[id]')) p.id = s.projet;
  if (chemin === '/adsmap/lots/[id]') p.id = s.lot;
  if (chemin === '/support/[id]') p.id = s.ticket;
  if (chemin === '/adsmap/tests/[id]') p.id = s.ad;
  if (chemin.includes('[name]')) p.name = 'Concurrent';
  if (chemin.includes('[format]')) p.format = 'avap';
  const restants = (chemin.match(/\[[^\]]+\]/g) ?? []).filter((x) => !(x.slice(1, -1) in p));
  if (restants.length) throw new Error(`${chemin} · segment ${restants.join(', ')} sans valeur semée · ajoute-la à \`parametres\``);
  return p;
}

/** Chaque occurrence brute du HTML · l'attribut (ou le texte) qui la porte, et le contexte. */
function fuitesHtml(html: string): string[] {
  const out: string[] = [];
  for (const { motif, nom } of BRUTES) {
    for (const m of html.matchAll(motif)) {
      const avant = html.slice(0, m.index);
      const balise = avant.slice(avant.lastIndexOf('<'));
      const attr = balise.includes('>') ? 'texte' : (/\s([a-zA-Z:-]+)=["'][^"']*$/.exec(balise)?.[1] ?? 'balise');
      const tag = /^<([a-zA-Z0-9]+)/.exec(balise)?.[1] ?? '?';
      out.push(`${nom} · <${tag}> ${attr} · …${html.slice(Math.max(0, m.index! - 70), m.index! + 90)}…`);
    }
  }
  return out;
}

/** Les chemins de props (depuis l'élément rendu par la page) qui portent une adresse brute. */
function fuitesDonnees(el: unknown): string[] {
  const out = new Set<string>();
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, ch: string) => {
    if (typeof v === 'string') { if (BRUTES.some(({ motif }) => new RegExp(motif.source).test(v))) out.add(ch); return; }
    if (!v || typeof v !== 'object' || vus.has(v)) return;
    vus.add(v);
    const e = v as { $$typeof?: unknown; type?: unknown; props?: unknown };
    if (e.$$typeof && e.props) {
      const t = e.type as { name?: string; displayName?: string } | string;
      parcourir(e.props, `${ch}<${typeof t === 'string' ? t : t?.displayName ?? t?.name ?? '?'}>`);
      return;
    }
    for (const [k, x] of Object.entries(v)) parcourir(x, Array.isArray(v) ? `${ch}[]` : `${ch}.${k}`);
  };
  parcourir(el, '');
  return [...out];
}

beforeAll(async () => {
  vi.stubEnv('FOUNDER_EMAILS', 'ua@studios.test');
  vi.stubGlobal('fetch', fauxBucket);
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'business', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  for (const u of [LOGO, PHOTO, FICHIER, VIGNETTE, MEDIA_AD, VIGNETTE_CREA, BRIEF, MINI_ETRANGERE]) octets.set(cleDe(u), Buffer.from(`\x89PNG ${u}`));
  // Logo IMPORTÉ (objet du stockage, à empreinte · `saveBrandDAAction`) en défaut, et une variante externe.
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO, EXTERNE], logoEmpreintes: { [LOGO]: createHash('md5').update(octets.get(cleDe(LOGO))!).digest('hex') } }).where(eq(schema.brands.id, ids.brandA1));
  // Photo produit dans le stockage.
  await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Sérum', imageUrl: PHOTO, imageUrls: [PHOTO] });
  // Une photo d'un AUTRE espace collée sur un produit · jamais montrée (la route la refuserait).
  await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Intrus', imageUrls: [`${BASE}/assets/${ids.wsB}/1700000000009-99999999-autre.png`] });
  // Fichier de la Bibliothèque (dépôt direct) et sa vignette Drive rangée au stockage.
  const [f] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, uploaderUserId: ids.ua, name: 'Rush', kind: 'image', source: 'upload', url: FICHIER, thumbUrl: VIGNETTE, mimeType: 'image/png', objectEtag: 'abc' }).returning({ id: schema.assets.id });
  s.fichier = f!.id;
  // Une sortie Studios LIVRÉE (clé du stockage, lot réussi).
  const p = await projetTest(db, ids, ids.brandA1, ids.ua);
  s.projet = p.projectId;
  s.sortie = randomUUID();
  await db.insert(schema.studioAssets).values({ id: s.sortie, workspaceId: ids.wsA, brandId: ids.brandA1, projectId: s.projet, storageKey: `studios/${ids.wsA}/${s.sortie}.png`, mime: 'image/png', bytes: 10, width: 8, height: 6, sha256: 'a'.repeat(64), origin: 'generated', storageState: 'stored' });
  await db.insert(schema.studioJobs).values({ workspaceId: ids.wsA, brandId: ids.brandA1, projectId: s.projet, projectVersionId: p.versionId, operation: 'image_generate', state: 'completed', qualityStatus: 'passed', idempotencyKey: `brutes-${s.sortie}`, inputHash: 'b'.repeat(64), snapshot: {}, result: { assets: { 'keyframe:s_image': s.sortie } } });
  // Un lot Résultats et un ticket · leurs fiches se rendent aussi.
  const [l] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: 1 }).returning({ id: schema.batches.id });
  s.lot = l!.id;
  const [t] = await db.insert(schema.tickets).values({ workspaceId: ids.wsA, userId: ids.ua, title: 'Une question', body: 'Bonjour' }).returning({ id: schema.tickets.id });
  s.ticket = t!.id;
  // Une GAGNANTE Adsmap arbitrée, rangée dans le lot · son « Lien de l'Ad », la miniature de sa créa et son brief sont des objets du
  // stockage de l'espace. Les écrans Résultats, l'Accueil, Itérer et Projets la montrent · jamais par l'adresse brute.
  const [pe] = await db.insert(schema.personas).values({ brandId: ids.brandA1, name: 'Persona' }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: 'Concept' }).returning();
  const [cr] = await db.insert(schema.creatives).values({ brandId: ids.brandA1, fingerprintHash: 'adsmap:brutes', type: 'image', thumbUrl: VIGNETTE_CREA }).returning({ id: schema.creatives.id });
  const [ad] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: co!.id, batchId: s.lot, creativeId: cr!.id, variantCode: 'V1', status: 'done', hypothesis: 'Si on montre la preuve d’abord, alors on convertit mieux.', testedVariable: 'proof', assetUrl: MEDIA_AD, briefUrl: BRIEF }).returning({ id: schema.ads.id });
  s.ad = ad!.id;
  await db.insert(schema.verdicts).values({ adId: s.ad, workspaceId: ids.wsA, computed: 'winner', validated: 'winner', status: 'validated', comparable: true, metricsAgg: { roas: 2.4, spend: 120, purchases: 6 } });
  await db.insert(schema.learnings).values({ workspaceId: ids.wsA, brandId: ids.brandA1, adId: s.ad, scope: 'ad', statement: 'Une preuve en ouverture convertit mieux.', status: 'validated' });
  // Dans le même lot · deux ads de la marque active portant la créa d'une AUTRE marque (jamais lue · ni sa miniature, ni la route
  // qui la nommerait), et la plus petite variante, qui n'a qu'un lien Drive (pas une image · la vignette du lot passe à la suivante).
  const creaEtrangere = async (thumbUrl: string) => (await db.insert(schema.creatives).values({ brandId: ids.brandA2, fingerprintHash: `etrangere:${thumbUrl}`, type: 'image', thumbUrl }).returning({ id: schema.creatives.id }))[0]!.id;
  const [e1] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: co!.id, batchId: s.lot, creativeId: await creaEtrangere(MINI_ETRANGERE), variantCode: 'V2' }).returning({ id: schema.ads.id });
  const [e2] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: co!.id, batchId: s.lot, creativeId: await creaEtrangere(MINI_ETRANGERE_EXTERNE), variantCode: 'V3' }).returning({ id: schema.ads.id });
  s.adEtrangere = e1!.id; s.adEtrangereExterne = e2!.id;
  await db.insert(schema.ads).values({ id: AD_DRIVE, workspaceId: ids.wsA, conceptId: co!.id, batchId: s.lot, variantCode: 'V0', assetUrl: 'https://drive.google.com/file/d/1AbC/view' });
  // Propriétaire fondateur, équipe plateforme · TOUS les écrans s'ouvrent (admin compris).
  h.session = { user: { id: ids.ua, email: 'ua@studios.test', name: 'Kevin' }, workspaceId: ids.wsA, workspaceName: 'Espace A', role: 'owner', plan: 'business', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] };
  h.cookie = ids.brandA1;
});
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function rendre(e: (typeof ECRANS)[number]): Promise<{ el: unknown; html: string }> {
  h.chemin = e.chemin === COQUILLE ? '/dashboard' : e.chemin;
  const mod = await e.charger();
  const el = await mod.default({ params: Promise.resolve(parametres(e.chemin)), searchParams: Promise.resolve(e.chemin === '/onboarding' ? { redo: '1' } : {}) });
  return { el, html: renderToStaticMarkup(avecSpatial(el as ReactElement)) };
}
const ecran = (chemin: string) => ECRANS.find((e) => e.chemin === chemin)!;

describe('Spatial · aucune adresse brute du stockage privé à l’écran', () => {
  it('le recensement · l’arbre Spatial est lu (les écrans principaux y sont), chaque écran sans rendu est justifié', () => {
    const chemins = ECRANS.map((e) => e.chemin);
    expect(chemins.length, 'le recensement des pages ne trouve rien · le motif du système de fichiers est-il encore juste ?').toBeGreaterThan(80);
    expect(PRINCIPAUX.filter((c) => !chemins.includes(c)), 'écran principal absent de l’arbre').toEqual([]);
    expect(Object.keys(NON_RENDUS).filter((c) => !chemins.includes(c)), 'exemption sans écran').toEqual([]);
    expect(Object.keys(NON_RENDUS).filter((c) => PRINCIPAUX.includes(c)), 'un écran principal ne peut pas être exempté de rendu').toEqual([]);
    expect(Object.keys(temoins()).filter((c) => !PRINCIPAUX.includes(c)), 'témoin d’un écran non principal').toEqual([]);
  });

  it.each(ECRANS.map((e) => [e.chemin, e] as const))('%s · ni le HTML ni les données de la vue ne portent d’adresse brute', async (chemin, e) => {
    const sans = NON_RENDUS[chemin];
    if (sans) {
      await expect(rendre(e), `${chemin} · ${sans.raison}`).rejects.toThrow(sans.leve);
      return;
    }
    const { el, html } = await rendre(e);
    expect(html.length, `${chemin} · rendu vide`).toBeGreaterThan(200);
    expect(fuitesHtml(html), `${chemin} · adresse BRUTE du stockage privé dans le HTML (image cassée) · passe par la route gardée`).toEqual([]);
    const admises = EXEMPTIONS_DONNEES.filter((x) => x.ecran === chemin).map((x) => x.chemin);
    expect(fuitesDonnees(el).filter((c) => !admises.includes(c)), `${chemin} · adresse BRUTE remise à la vue (hors \`EXEMPTIONS_DONNEES\`)`).toEqual([]);
    for (const t of temoins()[chemin] ?? []) expect(html, `${chemin} · témoin absent · l’objet semé n’est pas montré par sa route gardée (${t})`).toContain(t);
  });

  it('chaque exemption de données sert encore (une exemption morte est retirée)', async () => {
    for (const c of new Set(EXEMPTIONS_DONNEES.map((x) => x.ecran))) {
      const vues = fuitesDonnees((await rendre(ecran(c))).el);
      expect(EXEMPTIONS_DONNEES.filter((x) => x.ecran === c && !vues.includes(x.chemin)).map((x) => x.chemin), `${c} · exemption morte`).toEqual([]);
    }
  });
});

describe('Identité · le nom d’un logo de la charte', () => {
  it('un logo IMPORTÉ se nomme par son fichier (texte et bouton « Retirer »), une variante externe par son adresse publique', async () => {
    const { html } = await rendre(ecran('/brands/[id]/identite'));
    const logos = html.slice(html.indexOf('data-geste="logos"'));
    expect(logos).toContain('<strong style="overflow-wrap:anywhere">Logo importé · logo.png</strong>');
    expect(logos).toContain('aria-label="Retirer le logo Logo importé · logo.png"');
    expect(logos).toContain('<strong style="overflow-wrap:anywhere">site.exemple.fr/logo.png</strong>');
    expect(logos).toContain('aria-label="Retirer le logo site.exemple.fr/logo.png"');
    expect(logos.replace(/ src="[^"]*"/g, ''), 'le nom du dépôt ne se montre pas (hors l’adresse de la route média)').not.toContain('1700000000000-abcd1234');
  });
});

describe('Nouveau projet · les photos produit de l’assistant', () => {
  it('l’aperçu d’une photo est l’adresse de la ROUTE MÉDIA (jamais une adresse signée de 5 minutes), que la route sert ; une photo hors de l’espace reste écartée', async () => {
    const { el } = await rendre(ecran('/studio/projets/nouveau'));
    const produits = (el as ReactElement<{ produits: Array<{ nom: string; photos: Array<{ apercu: string }> }> }>).props.produits;
    expect(produits.map((p) => [p.nom, p.photos.map((ph) => ph.apercu)]).sort()).toEqual([
      ['Intrus', []],
      ['Sérum', [`/api/brands/${ids.brandA1}/media?url=${encodeURIComponent(PHOTO)}`]],
    ]);
    const serum = produits.find((p) => p.nom === 'Sérum')!;
    const { GET } = await import('../app/api/brands/[id]/media/route');
    const r = await GET(new Request(`http://localhost${serum.photos[0]!.apercu}`), { params: Promise.resolve({ id: ids.brandA1 }) });
    expect(r.status, 'la route média sert l’aperçu rendu').toBe(302);
    expect(r.headers.get('location')).toContain(`${CFG.endpoint}/${CFG.bucket}/${cleDe(PHOTO)}`);
  });
});

describe('Adsmap · les médias d’une ad rangés au stockage (lien, vignette de la créa, brief)', () => {
  it('Tous les tests · le « Lien de l’Ad » et le « Lien du Brief créa » arrivent par la route gardée de l’ad, que la route sert (objet de l’ad, de sa créa, de son brief)', async () => {
    const { el } = await rendre(ecran('/adsmap/tests'));
    const lignes = (el as ReactElement<{ lignes: Array<{ id: string; assetUrl: string | null; briefUrl: string | null }> | null }>).props.lignes ?? [];
    const l = lignes.find((x) => x.id === s.ad);
    expect(l, 'l’ad semée est listée').toBeTruthy();
    expect([l!.assetUrl, l!.briefUrl], 'lien et brief · la route gardée, jamais l’adresse brute').toEqual([`/api/adsmap/${s.ad}/apercu`, `/api/adsmap/${s.ad}/apercu?media=brief`]);
    const { GET } = await import('../app/api/adsmap/[id]/apercu/route');
    const servi = async (u: string) => {
      const r = await GET(new Request(`http://localhost${u}`), { params: Promise.resolve({ id: s.ad }) });
      return { statut: r.status, cible: r.headers.get('location') ?? '' };
    };
    for (const [u, objetServi] of [[l!.assetUrl!, MEDIA_AD], [l!.briefUrl!, BRIEF], [`/api/adsmap/${s.ad}/apercu?media=vignette`, VIGNETTE_CREA]] as const) {
      const r = await servi(u);
      expect(r.statut, `${u} · la route sert le média rendu`).toBe(302);
      expect(r.cible, `${u} · la redirection vise l’objet attendu`).toContain(`${CFG.endpoint}/${CFG.bucket}/${cleDe(objetServi)}`);
    }
  });

  it('Tous les tests · la vignette du lot (`listBatchesAction`, lue par l’écran) est la route gardée de sa variante, jamais l’adresse brute', async () => {
    const { listBatchesAction } = await import('../app/actions/adsmap');
    const lot = (await listBatchesAction()).find((l) => l.id === s.lot);
    expect(lot?.thumbUrl, 'la vignette du lot').toBe(`/api/adsmap/${s.ad}/apercu?media=vignette`);
  });

  it('une créa d’une AUTRE marque collée sur une ad · ni sa miniature brute ni la route gardée de l’ad ne sortent, sur aucun écran qui montre le lot ; la variante est bien rendue, sans image', async () => {
    for (const chemin of ['/adsmap', '/adsmap/lots', '/adsmap/lots/[id]', '/dashboard']) {
      const { el, html } = await rendre(ecran(chemin));
      for (const interdit of [`/api/adsmap/${s.adEtrangere}/apercu`, `/api/adsmap/${s.adEtrangereExterne}/apercu`, 'cdn.autre-marque.test', cleDe(MINI_ETRANGERE)]) {
        expect(html, `${chemin} · la créa d’une autre marque est montrée (${interdit})`).not.toContain(interdit);
        expect(JSON.stringify(fuitesDonnees(el)) + JSON.stringify((el as ReactElement).props ?? {}), `${chemin} · la créa d’une autre marque est remise à la vue (${interdit})`).not.toContain(interdit);
      }
    }
    const lot = (await rendre(ecran('/adsmap/lots/[id]'))).el as ReactElement<{ variantes?: Array<{ id: string; image: string | null }> }>;
    const vues = new Map((lot.props.variantes ?? []).map((v) => [v.id, v.image]));
    expect([vues.get(s.adEtrangere), vues.get(s.adEtrangereExterne), vues.get(AD_DRIVE)], 'les variantes sont rendues, sans image').toEqual([null, null, null]);
    expect(vues.get(s.ad), 'la gagnante garde sa vignette').toBe(`/api/adsmap/${s.ad}/apercu?media=vignette`);
  });
});
