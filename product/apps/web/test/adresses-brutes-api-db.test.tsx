import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Le stockage (S3 OVH) est PRIVÉ · une adresse BRUTE d'objet
 * (`<publicBaseUrl>/assets/<espace>/…`) remise au navigateur montre une image
 * cassée, et nomme la clé interne. #1007 garde les 83 pages Spatiales ; il
 * restait les deux autres portes par où le serveur répond au navigateur ·
 * les ROUTES (`app/**\/route.ts`) et les ACTIONS SERVEUR (`'use server'`).
 *
 * Garde GLOBALE, la base de la garde des pages enrichie (pglite + migrations,
 * un espace avec des objets du stockage RÉELS de chaque sorte · logo importé à
 * empreinte, photo produit, fichier de la Bibliothèque et sa vignette, sortie
 * Studios livrée, fichier versé dans un projet à brief · une `publicBaseUrl`
 * reconnaissable) · puis CHAQUE point d'entrée est APPELÉ pour de vrai, avec
 * une session propriétaire :
 *  - les actions · recensées par `import.meta.glob` (tout fichier de `app/`,
 *    `lib/` ou `components/` qui commence par `'use server'`, chaque fonction
 *    exportée ; une directive `'use server'` EN LIGNE, ailleurs, est refusée),
 *    avec des arguments minimaux valides (les identifiants semés quand il en
 *    faut) ;
 *  - les routes · recensées par `import.meta.glob` (chaque `route.ts`, chaque
 *    verbe exporté), avec une requête minimale valide.
 * On lit ce qui SORT · la valeur rendue (chaque chaîne, à toute profondeur),
 * l'erreur levée (son message part au navigateur en développement, une
 * redirection y porte sa cible), le corps et les en-têtes d'une réponse.
 *
 * La règle des redirections · une route GARDÉE qui répond `302` vers une
 * adresse SIGNÉE du stockage fait son métier de proxy (`servirAdresseDirecte`,
 * `privateObjectUrl`) · la signature est éphémère (≤ `DUREE_SIGNEE_MAX` s),
 * propre à l'objet de l'espace de la session, et la route la refuse à qui n'a
 * pas de session (vérifié · le même appel sans session ne montre aucune
 * adresse du stockage). Une adresse signée DANS DES DONNÉES n'est pas admise
 * d'office · elle expire sous les yeux de l'écran qui la garde (cf. #1007,
 * l'aperçu de l'assistant) · elle passe par `EXEMPTIONS`, justifiée.
 *
 * Témoins · les lectures doivent RÉUSSIR (sans quoi la garde passerait sur des
 * refus), et les principales doivent montrer les objets semés par leur route
 * gardée. Un échec nomme le point d'entrée, le chemin dans la valeur et le
 * contexte.
 *
 * Fuite trouvée et corrigée · `importBrandDAAction` (« Récupérer la charte du
 * site ») renvoyait `logoUrl`, l'adresse canonique d'un logo importé · il
 * renvoie désormais son aperçu par la route média (`apercuLogo`). Puis
 * `presignAssetUploadAction` rendait `publicUrl`, l'adresse canonique du
 * dépôt, que le navigateur renvoyait comme identifiant · il ne rend plus que
 * le lien de PUT signé (`uploadUrl`, seule exemption) et un jeton de dépôt
 * opaque (`lib/jeton-depot.ts`).
 *
 * Fuite trouvée et corrigée · `listerDepartsAssistant` n'était appelé qu'avec
 * « veille », sur une base sans sauvegarde · l'aperçu des GAGNANTES partait
 * signé (`assetAiUrl`, 300 s) et la table Adsmap rendait le « Lien de l'Ad »
 * brut. Chaque départ du noyau est désormais appelé (`variante`), sur une
 * gagnante et une sauvegarde semées ; le lien passe par la route gardée de
 * l'ad (`/api/adsmap/[id]/apercu`).
 *
 * Les lots et les créas · le semis Adsmap est celui de la garde des pages
 * (`helpers/semis-adsmap-medias`) · la gagnante est RANGÉE dans un lot, sa créa
 * (miniature au stockage) et son brief sont des objets de l'espace ; le lot
 * porte aussi des ads de la marque collées sur la créa d'une AUTRE marque
 * (miniature au stockage, de régie) et une variante qui n'a qu'un lien Drive ;
 * une seconde gagnante porte la créa d'une autre marque. Les actions que le
 * navigateur appelle (lots, détail d'ad, verdicts, plan d'itération, table,
 * vignette du lot) lisent donc une ad en lot · leurs témoins le vérifient · et
 * AUCUN point d'entrée ne nomme la créa étrangère (miniature, clé, ni la route
 * gardée de l'ad qui la servirait) · la route gardée, elle, la refuse (404).
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, cookie: null as string | null }));
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
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/dashboard', useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.cookie ? { value: h.cookie } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/dashboard', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));

import { db, schema, eq } from '@tiktrends/db';
import { semer } from './studios-semis';
import { projetTest } from './l3-harnais';
import sharp from 'sharp';
import { composerBrief, contenuVide, empreinteAdresse, empreinteContenu, idLogoMarque, idPhotoProduit, referenceProduit, SCHEMA_VERSION_CONTENU, type ContenuVersion, type DocumentStudio } from '@tiktrends/core';
import { HYPOTHESE, sourceConcurrente, T0 } from './l5c-outils';
import { jetonScelle } from './helpers/depot-jeton';
import type { UsageDepot } from '@tiktrends/core';
import { ORIGINES_DEPART_ASSISTANT, type OrigineDepartAssistant } from '@tiktrends/core';
import { interditsCreasEtrangeres, objetsAdsmap, semerAdsmapMedias, type SemisAdsmap } from './helpers/semis-adsmap-medias';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const BASE = CFG.publicBaseUrl;
/** Ce qui ne doit JAMAIS sortir · l'hôte de la base publique, et l'hôte du service sous ses formes canoniques (`objectKeyFromUrl`). */
const BRUTES: ReadonlyArray<{ motif: RegExp; nom: string }> = [
  { motif: /adresse-brute\.stockage\.test\//g, nom: 'base publique du stockage' },
  { motif: /s3\.brutes\.test\/tt-prive\//g, nom: 'adresse du service (chemin)' },
  { motif: /tt-prive\.s3\.brutes\.test\//g, nom: 'adresse du service (hôte du bucket)' },
];
const brute = (t: string) => BRUTES.some(({ motif }) => new RegExp(motif.source).test(t));
/**
 * Durée maximale d'une adresse signée servie en redirection · celle de
 * `privateObjectUrl` / `presignGetUrl` (300 s, `packages/integrations/src/storage.ts`).
 * Au-delà, ce n'est plus un passage éphémère mais un lien qui circule.
 */
const DUREE_SIGNEE_MAX = 300;

const objet = (n: string) => `${BASE}/assets/${ids.wsA}/${n}`;
const LOGO = objet('1700000000000-abcd1234-logo.png');
const PHOTO = objet('1700000000001-ef567890-produit.png');
const FICHIER = objet('1700000000002-0a1b2c3d-rush.png');
const VIGNETTE = objet('drive-1AbC-thumb.jpg');
const JETABLE = objet('1700000000003-0f0f0f0f-jetable.png');
const SCENE = objet('1700000000006-33333333-scene.png');
/**
 * Adsmap (semis partagé avec la garde des pages) · le « Lien de l'Ad » de la gagnante (l'aperçu du départ « itération »), la
 * miniature de sa créa et son brief, rangés au stockage ; les miniatures des créas d'une AUTRE marque.
 */
const ADSMAP = objetsAdsmap(objet);
const { lien: GAGNANTE, vignetteCrea: VIGNETTE_CREA, brief: BRIEF } = ADSMAP;
/** La vignette d'une sauvegarde Veille · l'aperçu du départ « veille » de l'assistant. */
const SAUVEE = objet('1700000000008-55555555-sauvee.png');
const EXTERNE = 'https://site.exemple.fr/logo.png';
/** Le site de la marque · hôte LITTÉRAL (aucune résolution DNS, `safeFetch`), servi par le faux réseau. */
const SITE = 'https://93.184.216.34';
const HTML_SITE = '<html><head><meta name="theme-color" content="#123456"><style>body{color:#123456;font-family:"Poppins",sans-serif}</style></head><body>Boutique</body></html>';
const cleDe = (u: string) => u.slice(BASE.length + 1);
/**
 * Le jeton de dépôt OPAQUE que le présigné rend pour `objet(n)` · seul
 * identifiant d'un dépôt qui repart du navigateur (l'adresse canonique,
 * `publicUrl`, n'en sort plus · exemption retirée).
 */
const jetonDe = (usage: UsageDepot, n: string) => jetonScelle({ espace: ids.wsA, utilisateur: h.session?.user.id ?? ids.ua, usage, cle: cleDe(objet(n)) });

/* ───────────── Le faux bucket · sert les objets semés, ETag = MD5, If-Match honoré ───────────── */

const octets = new Map<string, Buffer>();
const etagDe = (o: Buffer) => `"${createHash('md5').update(o).digest('hex')}"`;
async function fauxBucket(entree: string | URL | Request, init?: RequestInit): Promise<Response> {
  const u = new URL(entree instanceof Request ? entree.url : String(entree));
  if (u.origin === SITE) return new Response(HTML_SITE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (u.host !== CFG.endpoint) return new Response('réseau coupé', { status: 599 });
  const o = octets.get(decodeURIComponent(u.pathname.slice(`/${CFG.bucket}/`.length)));
  if (!o) return new Response(null, { status: 404 });
  const ifMatch = new Headers(init?.headers).get('if-match');
  if (ifMatch !== null && ifMatch !== etagDe(o)) return new Response(null, { status: 412 });
  const entetes = { 'content-length': String(o.length), 'content-type': 'image/png', etag: etagDe(o) };
  return (init?.method ?? 'GET') === 'HEAD' ? new Response(null, { status: 200, headers: entetes }) : new Response(new Uint8Array(o), { status: 200, headers: entetes });
}

/* ───────────── Le recensement · actions serveur et routes ───────────── */

type Fn = (...a: unknown[]) => unknown;
// `import.meta.glob` est résolu par vite (vitest) à la transformation · le type vient de `vite/client`, qui n'est pas une dépendance de l'application.
declare global { interface ImportMeta { glob<T>(motif: string | string[]): Record<string, () => Promise<T>> } }
const SOURCES = import.meta.glob<Record<string, unknown>>(['../app/**/*.ts', '../app/**/*.tsx', '../lib/**/*.ts', '../lib/**/*.tsx', '../components/**/*.ts', '../components/**/*.tsx']);
const ROUTES_FS = import.meta.glob<Record<string, unknown>>(['../app/**/route.ts', '../app/**/route.tsx']);
const RACINE = join(__dirname, '..');
/** Un fichier d'actions serveur · la directive en tête (commentaires admis avant). */
const estActions = (f: string) => /^(?:\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*(['"])use server\1/.test(readFileSync(join(RACINE, f.slice(3)), 'utf8'));
const MODULES_ACTIONS = Object.entries(SOURCES).filter(([f]) => estActions(f)).map(([f, charger]) => ({ fichier: f.slice(3), charger }));
/** Les fichiers qui portent une directive `'use server'` EN LIGNE (une action définie dans une fonction) · elle échapperait au recensement. */
const ACTIONS_EN_LIGNE = Object.keys(SOURCES).filter((f) => !estActions(f) && /^\s*(['"])use server\1\s*;?\s*$/m.test(readFileSync(join(RACINE, f.slice(3)), 'utf8'))).map((f) => f.slice(3));
const VERBES = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
const cheminRoute = (f: string) => f.slice('../app'.length).replace(/\/route\.tsx?$/, '').replace(/\/\([^)]+\)/g, '') || '/';

/* ───────────── La base semée ───────────── */

const s = {
  projet: '', version: '', sortie: '', job: '', fichier: '', jetable: '', lot: '', ticket: '', persona: '', desire: '', angle: '', concept: '', ad: '',
  produit: '', produitJetable: '', dossier: '', projetJetable: '', scenario: '', generation: '', pub: '', projetImage: '', versionImage: '', sauvegarde: '',
  adsmap: null as unknown as SemisAdsmap,
};
const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

/**
 * Chaque point d'entrée et son appel · `L` lecture (doit RÉUSSIR · sinon la
 * garde lirait un refus), `A` appel (écriture ou lecture sans objet semé ·
 * on lit ce qu'il rend, réussite non exigée), `D` destruction (en dernier,
 * sur un objet sacrifié). Un point d'entrée absent d'ici fait échouer le
 * recensement · on ne l'ajoute pas sans dire comment l'appeler.
 */
type Phase = 'lecture' | 'appel' | 'destruction';
/** `variante` · un même point d'entrée appelé sous plusieurs formes (un argument qui change la FORME du résultat) · le point se nomme alors `fichier#action(variante)`. */
type Appel = { phase: Phase; args: () => unknown[]; variante?: string };
const L = (args: () => unknown[] = () => [], variante?: string): Appel => ({ phase: 'lecture', args, variante });
const A = (args: () => unknown[] = () => [], variante?: string): Appel => ({ phase: 'appel', args, variante });
const D = (args: () => unknown[] = () => [], variante?: string): Appel => ({ phase: 'destruction', args, variante });
const P = () => [{ projectId: s.projet }];
const PI = () => [{ projectId: s.projetImage }];
const PV = () => [{ projectId: s.projet, baseVersionId: s.version }];

/**
 * Les départs de l'assistant · CHAQUE départ de la liste du noyau, pas un seul
 * (« veille » seul laissait l'aperçu des gagnantes hors garde). Un départ
 * ajouté au noyau est appelé d'office ; son objet semé se déclare ici (le type
 * l'exige).
 */
const ID_DEPART: Readonly<Record<OrigineDepartAssistant, () => string>> = { veille: () => s.sauvegarde, iteration: () => s.ad };

const ACTIONS: Readonly<Record<string, Readonly<Record<string, Appel | readonly Appel[]>>>> = {
  'app/actions/admin.ts': {
    saveProfileAction: A(() => [null, fd({ name: 'Kevin' })]),
    changePasswordAction: A(() => [fd({ current: 'x', next: 'y' })]),
    saveWorkspaceNameAction: A(() => [null, fd({ name: 'Espace A' })]),
  },
  'app/actions/adsmap-analyze.ts': {
    analyzeAssetsAction: A(() => [[s.ad]]),
    analysisCoverageAction: L(),
  },
  'app/actions/adsmap-attribution.ts': {
    attributionViewAction: L(), creativeTrendAction: L(() => [30]), essaisViewAction: L(), bilanNotesAction: L(), calibrationScoreAction: L(), bilanCopieAction: L(),
  },
  'app/actions/adsmap-batch.ts': {
    batchDetailAction: L(() => [s.lot]), candidatesAction: L(), createBatchAction: A(() => ['Tester un angle']),
    setBatchAdAction: A(() => [{ batchId: s.lot, adId: s.ad, inBatch: true }]), prepareBatchAction: A(() => [s.lot]), launchBatchAction: A(() => [s.lot]),
  },
  'app/actions/adsmap-bridge.ts': {
    trackSavedAdAction: A(() => [{ platform: 'meta', externalId: 'ext-1' }]), conceptBriefAction: L(() => [s.concept]),
  },
  'app/actions/adsmap-curation.ts': {
    curationViewAction: L(() => [{}]), validateNodeAction: A(() => [{ id: s.persona, kind: 'persona' }]), rejectNodeAction: A(() => [{ id: randomUUID(), kind: 'persona' }]),
    validateManyAction: A(() => [{ ids: [s.persona], kind: 'persona' }]), mergeCandidatesAction: L(), mergePlanAction: A(() => [{ sourceId: s.persona, targetId: randomUUID() }]),
    mergePersonasAction: A(() => [{ sourceId: randomUUID(), targetId: s.persona }]),
  },
  'app/actions/adsmap-decisions.ts': { refreshDecisionsAction: A(), listDecisionsAction: L(), resolveDecisionAction: A(() => [randomUUID(), 'done']) },
  'app/actions/adsmap-draft.ts': { draftConceptAction: A(() => [{ origin: 'blank', intent: 'Montrer le produit en usage' }]) },
  'app/actions/adsmap-graph.ts': { graphAction: L() },
  'app/actions/adsmap-hypotheses.ts': {
    creerHypotheseAction: A(() => [{ source: { type: 'libre' }, saisie: { si: 'on montre le produit dès la première seconde' } }]),
    completerHypotheseAction: A(() => [{ adId: s.ad, saisie: { si: 'on montre le produit', alors: 'le clic monte' } }]),
  },
  'app/actions/adsmap-import.ts': { previewImportAction: A(() => ['nom;angle\nPub 1;Preuve']), applyImportAction: A(() => ['nom;angle\nPub 1;Preuve']) },
  'app/actions/adsmap-iterate.ts': { iterationPlanAction: L(), createIterationAction: A(() => [{ parentAdId: s.ad, hypothesis: 'Une accroche plus directe convertit mieux', changedVariable: 'hook' }]) },
  'app/actions/adsmap-propose.ts': {
    proposePersonasAction: A(() => [1]), proposeDesiresAction: A(() => [s.persona, 1]), proposeAnglesAction: A(() => [s.desire, 1]), proposeConceptsAction: A(() => [s.angle, 1]),
  },
  'app/actions/adsmap-protocol.ts': { getSettingsAction: L(), saveSettingsAction: A(() => [{}]), suggestSettingsAction: A() },
  'app/actions/adsmap-radar.ts': {
    radarViewAction: L(), setRadarAction: A(() => [{ armed: false }]), runRadarNowAction: A(), radarCostPreviewAction: L(() => [5]),
    conceptFromFindingAction: A(() => [{ externalId: 'ext-1', hypothesis: 'Une preuve sociale en ouverture', headline: 'Titre', beats: ['un'] }]),
  },
  'app/actions/adsmap-share.ts': { listShareLinksAction: L(), createShareLinkAction: A(() => [7]), revokeShareLinkAction: A(() => [randomUUID()]) },
  'app/actions/adsmap-verdict.ts': {
    adDetailAction: L(() => [s.ad]),
    validateVerdictAction: A(() => [{ adId: s.ad, value: 'winner', learning: { statement: 'Une phrase complète et réutilisable.', scope: 'ad', confidence: 0.5 } }]),
    createIterationAction: A(() => [{ parentAdId: s.ad, mode: 'more', changedVariable: 'hook' }]),
  },
  'app/actions/adsmap.ts': { listAdsAction: L(() => [{}]), exportAdsCsvAction: L(() => [{}, true]), listBatchesAction: L(), syncAdsMapAction: A() },
  'app/actions/assets.ts': {
    listAssets: L(() => [{}]),
    pageBibliothequeAction: L(() => [{ portee: { type: 'recherche', q: 'Rush' } }]),
    uploadImageAssetsAction: A(() => [{ items: [{ name: 'a.png', dataUri: 'data:image/png;base64,iVBORw0KGgo=' }] }]),
    importAssetAction: A(() => [{ name: 'Lien', url: 'https://site.exemple.fr/a.png', kind: 'image' }]),
    toggleAssetAiAction: A(() => [{ id: s.fichier, useForAi: true }]),
    basculerAssetsIaAction: A(() => [{ ids: [s.fichier], useForAi: true }]),
    mettreAssetsCorbeilleAction: D(() => [{ ids: [s.jetable] }]),
    renommerAssetAction: A(() => [{ id: s.fichier, nom: 'Rush' }]),
    basculerTemplateAction: A(() => [{ id: s.fichier, on: false }]),
    tagAssetAction: A(() => [{ id: s.fichier }]),
    tagUntaggedImagesAction: A(),
    presignAssetUploadAction: A(() => [{ filename: 'nouveau.png', contentType: 'image/png', sizeBytes: 1000, usage: 'envoi' }]),
    registerUploadedAssetAction: A(() => [{ name: 'nouveau.png', jetonDepot: jetonDe('envoi', '1700000000004-11111111-nouveau.png'), mimeType: 'image/png', sizeBytes: 1000 }]),
    remplacerAssetAction: A(() => [{ id: s.fichier, jetonDepot: jetonDe('remplacement', '1700000000005-22222222-remplace.png'), mimeType: 'image/png' }]),
    deleteAssetAction: D(() => [{ id: s.jetable }]),
    restaurerAssetsAction: D(() => [{ ids: [s.jetable] }]),
  },
  'app/actions/assistant.ts': { askAssistant: A(() => [[], 'Bonjour']) },
  'app/actions/auth.ts': {
    signupAction: A(() => [fd({ email: 'nouveau@studios.test', password: 'motdepasse-long-1' })]), loginAction: A(() => [fd({ email: 'ua@studios.test', password: 'x' })]),
    logoutAction: D(), forgotPasswordAction: A(() => [fd({ email: 'ua@studios.test' })]), resetPasswordAction: A(() => [fd({ token: 'x', password: 'motdepasse-long-1' })]),
  },
  'app/actions/beta.ts': { grantTestPackAction: A(() => [fd({ workspaceId: ids.wsB })]), revokeTrialAction: A(() => [fd({ workspaceId: ids.wsB })]) },
  'app/actions/bibliotheque-dossiers.ts': {
    creerDossierAction: A(() => [{ nom: 'Nouveau dossier' }]), renommerDossierAction: A(() => [{ id: s.dossier, nom: 'Rushs' }]),
    deplacerDossierAction: A(() => [{ id: s.dossier, parentId: null }]), deplacerDossiersAction: A(() => [{ ids: [s.dossier], parentId: null }]),
    supprimerDossierAction: D(() => [{ id: s.dossier }]), restaurerDossierAction: D(() => [{ id: s.dossier }]),
    affecterAssetDossierAction: A(() => [{ assetId: s.fichier, folderId: s.dossier }]), definirDroitsAssetAction: A(() => [{ assetId: s.fichier, droit: null }]),
    definirTagDossierAction: A(() => [{ id: s.dossier, tag: null }]), definirTagDossiersAction: A(() => [{ ids: [s.dossier], tag: null }]),
    affecterAssetsDossierAction: A(() => [{ ids: [s.fichier], folderId: s.dossier }]), definirDroitsAssetsAction: A(() => [{ ids: [s.fichier], droit: null }]),
  },
  'app/actions/billing.ts': { changePlanAction: A(() => [fd({ plan: 'business' })]) },
  'app/actions/brand-detail.ts': {
    generateFullBrandAction: A(() => [fd({ brandId: ids.brandA1 })]), extractBrandVisualDaAction: A(() => [fd({ brandId: ids.brandA1 })]),
    saveBrandVisualDaAction: A(() => [fd({ brandId: ids.brandA1 })]), addPersonaAction: A(() => [fd({ brandId: ids.brandA1, name: 'Persona' })]),
    deletePersonaAction: D(() => [fd({ brandId: ids.brandA1, id: randomUUID() })]), addScenarioAction: A(() => [fd({ brandId: ids.brandA1, title: 'Scène' })]),
    deleteScenarioAction: D(() => [fd({ brandId: ids.brandA1, id: s.scenario })]), generateScenarioImageAction: A(() => [{ brandId: ids.brandA1, scenarioId: s.scenario }]),
    addProductAction: A(() => [fd({ brandId: ids.brandA1, name: 'Produit' })]), deleteProductAction: D(() => [fd({ brandId: ids.brandA1, id: s.produitJetable })]),
    saveBrandDAAction: A(() => [{ brandId: ids.brandA1, logoUrl: LOGO, logos: [LOGO, EXTERNE], colors: ['#111111'], fonts: [] }]),
    importBrandDAAction: L(() => [{ brandId: ids.brandA1 }]),
    syncShopifyProductsAction: A(() => [{ brandId: ids.brandA1 }]), importProductsAction: A(() => [fd({ brandId: ids.brandA1 })]),
  },
  'app/actions/brands.ts': {
    setActiveBrand: A(() => [ids.brandA1]), createBrandAction: A(() => [fd({ name: 'Marque neuve' })]), createBrandFromShopifyAction: A(() => [fd({ domain: 'boutique.myshopify.com' })]),
    updateBrandAction: A(() => [fd({ id: ids.brandA1, name: 'Marque A1' })]), deleteBrandAction: D(() => [fd({ id: ids.brandA2 })]),
  },
  'app/actions/brief-marque.ts': { briefMarqueAction: A(() => [{ platform: 'meta', name: 'Concurrent' }]) },
  'app/actions/competitor.ts': {
    analyzeCompetitorAction: A(() => [fd({ brandId: ids.brandA1, name: 'Concurrent' })]), getCompetitorReport: L(() => [ids.brandA1, 'Concurrent']),
    proposerConcurrents: A(() => [ids.brandA1, 'cosmétique']), ajouterConcurrents: A(() => [ids.brandA1, ['Concurrent']]), scannerConcurrentAction: A(() => [fd({ brandId: ids.brandA1, name: 'Concurrent' })]),
  },
  'app/actions/connaissances.ts': {
    chargerConnaissancesAction: L(), creerConnaissanceAction: A(() => [{}]), nouvelleVersionAction: A(() => [{ id: randomUUID(), base: 1, saisie: {} }]),
    publierConnaissanceAction: A(() => [{ id: randomUUID(), n: 1 }]), retirerConnaissanceAction: A(() => [{ id: randomUUID() }]),
  },
  'app/actions/connections.ts': {
    getConnectionState: L(), connectShopifyAction: A(() => [{ domain: 'boutique.myshopify.com', token: 'x' }]), syncShopifyAction: A(), disconnectShopifyAction: A(),
    connectMetaAction: A(() => [{ adAccountId: 'act_1', token: 'x' }]), selectMetaAccountAction: A(() => ['act_1']), syncMetaAction: A(), disconnectMetaAction: A(),
  },
  'app/actions/credits.ts': { grantCreditsAction: A(() => [fd({ workspaceId: ids.wsB, credits: '1' })]), rechargeAllocationAction: A(() => [fd({ workspaceId: ids.wsB })]) },
  'app/actions/decouverte.ts': { decouverteMarcheAction: A() },
  'app/actions/drive.ts': {
    getDriveState: L(), getDrivePickerConfigAction: A(), setDriveFolderAction: A(() => [{ folderId: 'f', folderName: 'Dossier' }]), syncDriveNowAction: A(),
    syncDriveFilesAction: A(() => [[{ id: 'f1', name: 'a.png', mimeType: 'image/png' }]]), disconnectDriveAction: A(),
  },
  'app/actions/equipe.ts': {
    enregistrerStaffAction: A(() => [fd({ email: 'staff@studios.test', role: 'support' })]), retirerStaffAction: A(() => [fd({ email: 'staff@studios.test' })]), enregistrerMatriceAction: A(() => [fd({})]),
  },
  'app/actions/inspo.ts': {
    saveAd: A(() => [{ platform: 'meta', externalId: 'ext-1', snapshot: { id: 'ext-1', platform: 'meta' } }]), classerFormatSauvegarde: A(() => [{ platform: 'meta', externalId: 'ext-1', format: 'avap' }]),
    setSavedAdFolder: A(() => [{ platform: 'meta', externalId: 'ext-1', folder: null }]), unsaveAd: A(() => [{ platform: 'meta', externalId: 'ext-1' }]),
    followBrand: A(() => [{ platform: 'meta', name: 'Concurrent' }]), unfollowBrand: A(() => [{ platform: 'meta', name: 'Concurrent' }]),
  },
  'app/actions/invites.ts': { createInviteAction: A(() => [fd({ email: 'invite@studios.test', role: 'member' })]), revokeInviteAction: A(() => [fd({ id: randomUUID() })]), acceptInviteAction: A(() => [fd({ token: 'x' })]) },
  'app/actions/jarvis-chat.ts': { chatThreadAction: L(() => [null]), onboardingThreadAction: L(), clearOnboardingAction: A(), clearChatAction: A(() => [null]) },
  'app/actions/jarvis-conversations.ts': { creerConversationAction: A(() => [ids.brandA1]), renommerConversationAction: A(() => [ids.brandA1, randomUUID(), 'Titre']) },
  'app/actions/jarvis-veille-studio.ts': { creerStudioDepuisJarvis: A(() => [{ params: {}, brandId: ids.brandA1, objectif: 'Tester', kind: 'image', cleClic: randomUUID() }]) },
  'app/actions/jarvis.ts': {
    saveJarvisRulesAction: A(() => [{ creativeRules: 'Toujours montrer le produit.' }]), proposeJarvisRulesAction: A(), trainJarvisAction: A(), saveJarvisLearningsAction: A(() => [{ learnings: 'Rien encore.' }]),
  },
  'app/actions/layout-marche.ts': { grammaireCategorieAction: L() },
  'app/actions/logo-marque.ts': { etatLogoMarqueActive: L(() => [{ brandId: ids.brandA1 }]) },
  'app/actions/market-learn.ts': { learnFromFollowedAction: A(), marketViewAction: L() },
  'app/actions/membres.ts': { retirerMembreAction: D(() => [fd({ userId: ids.uv })]), changerRoleMembreAction: A(() => [fd({ userId: ids.ur, role: 'member' })]) },
  'app/actions/notifications.ts': { fetchNotifications: L(), markNotificationRead: A(() => [randomUUID()]), markAllNotificationsRead: A() },
  'app/actions/onboarding.ts': { saveOnboardingAction: A(() => [{ profile: 'brand', brandName: 'Marque A1' }]) },
  'app/actions/platform.ts': { updatePlanConfigAction: A(() => [fd({ plan: 'core' })]) },
  'app/actions/reconciliation-depense.ts': { reconcilierDepenseAction: A(() => [{}, fd({})]) },
  'app/actions/storage.ts': { configureBucketAction: A(), testStorageAction: A(), embeddedImagesStatusAction: L(), migrateEmbeddedImagesAction: A() },
  'app/actions/stripe-diagnostic.ts': { runStripeDiagnosticAction: A(), verifierOffreV2Action: A() },
  'app/actions/stripe.ts': { createCheckoutAction: A(() => [fd({ plan: 'business' })]), createPortalAction: A(), createTopupCheckoutAction: A(() => [fd({ pack: 'x' })]) },
  'app/actions/studios/archivage.ts': { supprimerProjet: D(() => [{ projectId: s.projetJetable }]), restaurerProjet: D(() => [{ projectId: s.projetJetable }]) },
  'app/actions/studios/assistant.ts': { ouvrirAssistantProjet: L() },
  'app/actions/studios/canvas.ts': {
    lireCanvasProjet: L(PI), enregistrerDispositionCanvas: A(() => [{ projectId: s.projet, disposition: {}, rev: 0 }]), reinitialiserDispositionCanvas: A(() => [{ projectId: s.projet, rev: 0 }]),
  },
  'app/actions/studios/concept.ts': { demarrerConcept: A() },
  'app/actions/studios/departs-assistant.ts': {
    listerDepartsAssistant: ORIGINES_DEPART_ASSISTANT.map((o) => L(() => [o], o)),
    lireDepartAssistant: ORIGINES_DEPART_ASSISTANT.map((o) => A(() => [o, ID_DEPART[o]()], o)),
  },
  'app/actions/studios/execution.ts': {
    estimerImpact: A(P), creerDevis: A(P), approuverEtMettreEnFile: A(() => [{ quoteId: randomUUID(), inputHash: 'x', creditsAnnonces: 0, idempotencyKey: randomUUID() }]),
    annulerJob: A(() => [{ jobId: randomUUID() }]), etatJob: L(() => [{ jobId: s.job }]), accepterMedia: A(() => [{ jobId: s.job }]), rejeterMedia: A(() => [{ jobId: randomUUID() }]),
  },
  'app/actions/studios/export.ts': { lireExportProjet: L(PI), exporterVersion: A(() => [{ projectId: s.projet, format: 'json' }]) },
  'app/actions/studios/identites.ts': {
    lireIdentitesProjet: L(P), enregistrerIdentite: A(() => [{ ...PV()[0], nom: 'Léa', attributs: {} }]), lierIdentite: A(() => [{ ...PV()[0], identityId: randomUUID(), shotIds: [] }]),
    resoudreContradiction: A(() => [{ ...PV()[0], contradictionId: 'x', choix: 'x' }]), choisirModeParole: A(() => [{ ...PV()[0], shotIds: [], mode: 'voix_off' }]),
  },
  'app/actions/studios/image.ts': {
    lireParcoursImage: L(PI), compilerConsigneImage: A(() => [{ projectId: s.projet, mode: 'composee' }]), retenirConsigneImage: A(() => [{ ...PV()[0], runId: randomUUID() }]),
    demanderDevisImage: A(P), approuverEtLancerImage: A(() => [{ quoteId: randomUUID(), inputHash: 'x', creditsAnnonces: 0, idempotencyKey: randomUUID() }]), controlerMediaImage: A(() => [{ jobId: s.job }]),
  },
  'app/actions/studios/interrupteurs.ts': {
    enregistrerInterrupteursEspaceAction: A(() => [{ workspaceId: ids.wsB, actives: [], coupees: [], motif: 'test', confirme: false }]),
    enregistrerBudgetEssaiAction: A(() => [{ workspaceId: ids.wsB, plafondUsd: 1, motif: 'test', confirme: false }]),
  },
  'app/actions/studios/lignee.ts': { lireLigneeProjet: L(P) },
  'app/actions/studios/lot-formats.ts': { preparerLotFormats: A(() => [{ projectId: s.projet, formats: ['1:1'] }]) },
  'app/actions/studios/lot-images.ts': {
    preparerLotImages: A(() => [{ projectId: s.projet, nombre: 1 }]), lireLotImages: A(() => [{ lotId: randomUUID() }]),
    approuverLotImages: A(() => [{ lotId: randomUUID(), empreinte: 'x', creditsAnnonces: 0, usdMicrosAnnonces: 0, confirme: false }]),
  },
  'app/actions/studios/produit.ts': {
    lireProduitProjet: L(PI), epinglerProduit: A(() => [{ ...PV()[0], productId: s.produit, photoId: 'x' }]),
    importerPhotoProduit: A(() => [{ ...PV()[0], productId: s.produit, dataUri: 'data:image/png;base64,iVBORw0KGgo=' }]),
    associerReference: A(() => [{ projectId: s.projetImage, baseVersionId: s.versionImage, assetId: `bib_${s.fichier}`, role: 'identity', scope: 'subject' }]), retirerReference: A(() => [{ projectId: s.projetImage, baseVersionId: s.versionImage, assetId: `bib_${s.fichier}`, role: 'style' }]),
    definirDroitsAsset: A(() => [{ assetId: s.fichier, licence: 'interne' }]), controlerCompilation: A(() => [{ projectId: s.projet, mode: 'composee' }]),
    compilerConsigneImage: A(() => [{ projectId: s.projet, mode: 'composee' }]), trancherComposants: A(() => [{ jobId: s.job, constats: [] }]),
  },
  'app/actions/studios/projets.ts': {
    listerProjets: L(() => [{}]), inspecterProjet: L(() => [s.projetImage]), creerProjet: A(() => [{ brandId: ids.brandA1, kind: 'image', title: 'Projet neuf' }]),
    enregistrerDocument: A(() => [{ ...PV()[0], changes: [] }]), enregistrerDisposition: A(() => [{ projectId: s.projet, positions: {}, rowVersion: 1 }]),
  },
  'app/actions/studios/prompts.ts': {
    importerPackAction: A(), validerImportsAction: A(), enregistrerBrouillonAction: A(() => [{ baseId: randomUUID(), champs: {}, motif: 'test' }]), validerVersionAction: A(() => [{ id: randomUUID() }]),
    creerReleaseAction: A(() => [{}]), evaluerReleaseAction: A(() => [{ releaseId: randomUUID() }]), publierReleaseAction: A(() => [{ releaseId: randomUUID(), attendue: 'x', confirme: false }]),
    rollbackReleaseAction: A(() => [{ releaseId: randomUUID(), attendue: 'x', confirme: false }]), revoquerReleaseAction: A(() => [{ releaseId: randomUUID(), motif: 'x', confirme: false }]),
    retirerReleaseAction: A(() => [{ releaseId: randomUUID() }]), approuverBenchmarkAction: A(() => [{ releaseId: randomUUID(), evaluationId: randomUUID(), motif: 'x', confirme: false }]),
    approuverRecetteManuelleAction: A(() => [{ releaseId: randomUUID(), motif: 'x', confirme: false }]),
  },
  'app/actions/studios/propositions.ts': {
    proposerPatch: A(() => [{ ...PV()[0], cible: 'brief', demande: 'Plus court' }]), proposerBrief: A(() => [{ ...PV()[0], demande: 'Plus court' }]),
    creerPropositionManuelle: A(() => [{ ...PV()[0], cible: 'brief', changes: [] }]), appliquerProposition: A(() => [{ proposalId: randomUUID(), ...PV()[0] }]),
    rejeterProposition: A(() => [{ proposalId: randomUUID(), projectId: s.projet }]), listerPropositions: L(PI), inspecterProposition: A(() => [{ proposalId: randomUUID() }]),
  },
  'app/actions/studios/rendu.ts': { rendreApercu: L(PI), declinerFormat: A(() => [{ ...PV()[0], format: '1:1' }]) },
  'app/actions/studios/shadow.ts': { resoudreCompilationAblanc: A(() => [{ projectId: s.projet, mode: 'composee' }]) },
  'app/actions/studios/sources.ts': {
    preparerCreation: A(() => [{ sources: [], brandId: ids.brandA1 }]), proposerHypotheses: A(() => [{ sources: [], brandId: ids.brandA1 }]),
    creerProjetDepuisSources: A(() => [{ sources: [], brandId: ids.brandA1, cleClic: randomUUID() }]), creerProjetDepuisContexte: A(() => [{ brandId: ids.brandA1, cleClic: randomUUID() }]),
    ajouterSourcesAuProjet: A(() => [{ projectId: s.projet, sources: [] }]), exporterBrief: L(PI), lireProjetDetail: L(PI), listerProjetsCartes: L(() => [{}]),
  },
  'app/actions/studios/tests.ts': {
    rattacherVarianteAuTest: A(() => [{ variantId: randomUUID(), saisie: {} }]), lireApprentissage: A(() => [{ variantId: randomUUID() }]),
    relireApprentissage: A(() => [{ linkId: randomUUID(), coutAnnonceUsd: 0 }]), preparerLotEssai: A(() => [{ projectId: s.projet, variable: 'hook', variantIds: [] }]),
  },
  'app/actions/studios/textes.ts': {
    lireTextesProjet: L(PI), ecrireTextes: A(() => [{ ...PV()[0], type: 'accroche' }]), enregistrerTextes: A(() => [{ ...PV()[0], textes: [] }]),
    exporterTextes: L(PI), injecterTexte: A(() => [{ ...PV()[0], layerId: 'x', texte: 'Bonjour' }]),
  },
  'app/actions/studios/variantes.ts': {
    listerVariantes: L(PI), filiationVariante: A(() => [{ variantId: randomUUID() }]), creerVariante: A(() => [{ assetId: s.sortie }]), iterer: A(() => [{ variantId: randomUUID(), baseVersionId: s.version }]),
  },
  'app/actions/studios/versement.ts': {
    projetsPourVersement: L(), verserSelectionDansProjet: A(() => [{ projectId: s.projetImage, ids: [s.fichier], role: 'composition', scope: 'global' }]),
    creerProjetEtVerser: A(() => [{ brandId: ids.brandA1, titre: 'Versé', type: 'image', ids: [s.fichier], role: 'style', scope: 'global' }]),
  },
  'app/actions/studios/video.ts': {
    lireVideo: L(P), appliquerOperationVideo: A(() => [{ ...PV()[0], operation: {} }]), planifierStoryboard: A(() => [{ projectId: s.projet, nbPlans: 3, dureeCibleMs: 15000, speechMode: 'voix_off' }]),
    compilerConsignePlan: A(() => [{ projectId: s.projet, shotId: 'x' }]), retenirConsignePlan: A(() => [{ ...PV()[0], runId: randomUUID() }]), demanderDevisKeyframe: A(() => [{ projectId: s.projet, shotId: 'x' }]),
    approuverEtLancerKeyframe: A(() => [{ quoteId: randomUUID(), inputHash: 'x', creditsAnnonces: 0, idempotencyKey: randomUUID() }]), demanderDevisClip: A(() => [{ projectId: s.projet, shotId: 'x' }]),
    approuverEtLancerClip: A(() => [{ quoteId: randomUUID(), inputHash: 'x', creditsAnnonces: 0, idempotencyKey: randomUUID() }]), assemblerVideoFinale: A(P),
  },
  'app/actions/support.ts': {
    createTicketAction: A(() => [fd({ title: 'Question', body: 'Bonjour' })]), replyTicketAction: A(() => [fd({ id: s.ticket, body: 'Merci' })]), setTicketStatusAction: A(() => [fd({ id: s.ticket, status: 'open' })]),
  },
  'app/actions/tracker.ts': { scanTrackerAction: A(), markTrackerSeenAction: A() },
  'app/actions/veille-vues.ts': { garderVueVeille: A(() => [{ nom: 'Vue', params: {} }]), renommerVueVeilleAction: A(() => [{ id: randomUUID(), nom: 'Vue' }]), supprimerVueVeille: D(() => [{ id: randomUUID() }]) },
  'app/actions/video-marche.ts': { grammaireVideoAction: L() },
  'lib/studios/benchmark/actions.ts': {
    devisBenchmarkAction: A(() => [{}]), approuverBudgetBenchmarkAction: A(() => [{ releaseId: randomUUID(), budgetUsd: 0, motif: 'x' }]), joindreFichesBenchmarkAction: A(() => [{ releaseId: randomUUID(), rapport: {}, fiches: [] }]),
  },
  'lib/studios/editeur/actions.ts': {
    relireDocumentEditeur: L(() => [s.projetImage]), listerVersionsDocument: L(() => [s.projetImage]), apercuVersionDocument: L(() => [{ projectId: s.projetImage, versionId: s.versionImage }]),
    restaurerVersionDocument: A(() => [{ projectId: s.projet, versionId: s.version, baseVersionId: s.version }]),
  },
};

/**
 * Chaque verbe de chaque route · la requête minimale valide (paramètres semés).
 * Les tâches planifiées s'appellent AVEC leur secret (`CRON_SECRET`), sinon
 * elles ne liraient rien.
 */
type AppelRoute = { phase: Phase; requete: () => { url: string; init?: RequestInit; params?: Record<string, string> } };
const R = (requete: AppelRoute['requete'], phase: Phase = 'appel'): AppelRoute => ({ phase, requete });
const RL = (requete: AppelRoute['requete']): AppelRoute => R(requete, 'lecture');
const SECRET_CRON = 'secret-cron-test';
/** L'identifiant de la photo produit semée dans le catalogue du projet (`pph_…`, dérivé de son adresse). */
const photoProduit = () => idPhotoProduit(s.produit, empreinteAdresse(PHOTO).sha256);
const cron = (chemin: string) => R(() => ({ url: chemin, init: { headers: { authorization: `Bearer ${SECRET_CRON}` } } }));
const ROUTES: Readonly<Record<string, AppelRoute>> = {
  'GET /analytics': R(() => ({ url: '/analytics?vue=attribution' })),
  'GET /api/ad/[id]': RL(() => ({ url: `/api/ad/${s.pub}`, params: { id: s.pub } })),
  'GET /api/adsmap/[id]/apercu': RL(() => ({ url: `/api/adsmap/${s.ad}/apercu`, params: { id: s.ad } })),
  'GET /api/asset/[id]': RL(() => ({ url: `/api/asset/${s.fichier}`, params: { id: s.fichier } })),
  'POST /api/bibliotheque/archive': RL(() => ({ url: '/api/bibliotheque/archive', init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [s.fichier], dossiers: [] }) } })),
  'GET /api/brands/[id]/media': RL(() => ({ url: `/api/brands/${ids.brandA1}/media?url=${encodeURIComponent(PHOTO)}`, params: { id: ids.brandA1 } })),
  'GET /api/creations-historiques/[id]/texte': RL(() => ({ url: `/api/creations-historiques/${s.generation}/texte`, params: { id: s.generation } })),
  'GET /api/cron/adsmap': cron('/api/cron/adsmap'),
  'GET /api/cron/allocations': cron('/api/cron/allocations'),
  'GET /api/cron/bascule-forfaits': cron('/api/cron/bascule-forfaits'),
  'GET /api/cron/digest': cron('/api/cron/digest'),
  'GET /api/cron/radar': cron('/api/cron/radar'),
  'GET /api/cron/tracker': cron('/api/cron/tracker'),
  'GET /api/cron/videos-historiques': cron('/api/cron/videos-historiques'),
  'GET /api/drive-img/[id]': RL(() => ({ url: `/api/drive-img/${s.fichier}`, params: { id: s.fichier } })),
  'POST /api/jarvis/chat': R(() => ({ url: '/api/jarvis/chat', init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Bonjour' }) } })),
  'GET /api/oauth/google/callback': R(() => ({ url: '/api/oauth/google/callback?code=x&state=x' })),
  'GET /api/oauth/google': R(() => ({ url: '/api/oauth/google' })),
  'GET /api/oauth/meta/callback': R(() => ({ url: '/api/oauth/meta/callback?code=x&state=x' })),
  'GET /api/oauth/meta': R(() => ({ url: '/api/oauth/meta' })),
  'GET /api/oauth/shopify/callback': R(() => ({ url: '/api/oauth/shopify/callback?code=x&state=x&shop=boutique.myshopify.com' })),
  'GET /api/oauth/shopify': R(() => ({ url: '/api/oauth/shopify?shop=boutique.myshopify.com' })),
  'GET /api/oauth/tiktok': R(() => ({ url: '/api/oauth/tiktok' })),
  'POST /api/stripe/webhook': R(() => ({ url: '/api/stripe/webhook', init: { method: 'POST', headers: { 'stripe-signature': 'x' }, body: '{}' } })),
  'GET /api/studios/export/[versionId]': R(() => ({ url: `/api/studios/export/${s.version}?format=json`, params: { versionId: s.version } })),
  'GET /api/studios/media/[id]': RL(() => ({ url: `/api/studios/media/${s.sortie}`, params: { id: s.sortie } })),
  'GET /studio/projets/[id]/produit/fichier/[assetId]': RL(() => ({ url: `/studio/projets/${s.projetImage}/produit/fichier/${photoProduit()}`, params: { id: s.projetImage, assetId: photoProduit() } })),
};

/* ───────────── La lecture de ce qui sort ───────────── */

/** Les chemins (dans la valeur) qui portent une adresse brute, avec le contexte. */
function fuitesValeur(v: unknown, racine = ''): Array<{ chemin: string; extrait: string }> {
  const out: Array<{ chemin: string; extrait: string }> = [];
  const vus = new Set<unknown>();
  const parcourir = (x: unknown, ch: string) => {
    if (typeof x === 'string') {
      for (const { motif } of BRUTES) for (const m of x.matchAll(new RegExp(motif.source, 'g'))) out.push({ chemin: ch, extrait: x.slice(Math.max(0, m.index! - 50), m.index! + 90) });
      return;
    }
    if (!x || typeof x !== 'object' || vus.has(x)) return;
    vus.add(x);
    if (x instanceof Uint8Array || x instanceof ArrayBuffer) return parcourir(Buffer.from(x as Uint8Array).toString('latin1'), ch);
    if (x instanceof Date) return;
    if (x instanceof Error) { parcourir(x.message, `${ch}.message`); return; }
    if (x instanceof Map) { for (const [k, y] of x) { parcourir(k, `${ch}.<clé>`); parcourir(y, `${ch}.${String(k)}`); } return; }
    if (x instanceof Set) { for (const y of x) parcourir(y, `${ch}[]`); return; }
    for (const [k, y] of Object.entries(x)) parcourir(y, Array.isArray(x) ? `${ch}[]` : `${ch}.${k}`);
  };
  parcourir(v, racine);
  return out;
}

type Sortie = { valeur?: unknown; erreur?: string; delai?: boolean };
const DELAI_MS = 25_000;
async function appeler(fn: () => Promise<unknown>): Promise<Sortie> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    const valeur = await Promise.race([fn(), new Promise((_, rej) => { t = setTimeout(() => rej(new Error('DELAI')), DELAI_MS); })]);
    return { valeur };
  } catch (e) {
    const m = (e as Error)?.message ?? String(e);
    return m === 'DELAI' ? { delai: true } : { erreur: m };
  } finally { clearTimeout(t); }
}
/** Une lecture a RÉUSSI · ni levée, ni `error`, ni `ok: false`. */
const refus = (o: Sortie): string | null => {
  if (o.delai) return 'délai dépassé';
  if (o.erreur !== undefined) return `levée · ${o.erreur}`;
  if (o.valeur instanceof Response) return null;
  const v = o.valeur as { error?: unknown; ok?: unknown; message?: unknown } | null;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (typeof v.error === 'string') return `error · ${v.error}`;
    if (v.ok === false) return `ok:false · ${String(v.message ?? '')}`;
  }
  return null;
};

type Recu = { statut: number; entetes: Record<string, string>; corps: string };
async function lireReponse(r: unknown): Promise<Recu | null> {
  if (!(r instanceof Response)) return null;
  const corps = r.body ? Buffer.from(await r.arrayBuffer()).toString('latin1') : '';
  return { statut: r.status, entetes: Object.fromEntries(r.headers.entries()), corps };
}

/**
 * Une adresse SIGNÉE, éphémère, d'un objet de l'espace de la session (ses
 * dépôts `assets/<espace>/`, les rendus `renders/<pub>/` de sa pub semée) · la
 * seule forme qu'une redirection d'une route gardée peut porter vers le
 * stockage. Le reste (adresse brute, signature longue, objet d'un autre
 * espace) est une fuite.
 */
function signeeCourte(u: string, prefixes: readonly string[]): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  const q = url.searchParams;
  const duree = Number(q.get('X-Amz-Expires'));
  const cle = decodeURIComponent(url.pathname.replace(/^\/[^/]+\//, ''));
  return q.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256' && /^[0-9a-f]{64}$/.test(q.get('X-Amz-Signature') ?? '') && !!q.get('X-Amz-Credential') && !!q.get('X-Amz-Date')
    && Number.isInteger(duree) && duree > 0 && duree <= DUREE_SIGNEE_MAX && prefixes.some((p) => cle.startsWith(p));
}

beforeAll(async () => {
  vi.stubEnv('FOUNDER_EMAILS', 'ua@studios.test');
  vi.stubEnv('CRON_SECRET', SECRET_CRON);
  vi.stubEnv('APP_URL', 'http://localhost');
  vi.stubGlobal('fetch', fauxBucket);
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'business', onboardedAt: new Date() }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));
  // Les octets d'un objet ne portent pas son adresse · une route qui SERT un objet ne doit pas passer pour une fuite.
  for (const u of [LOGO, PHOTO, FICHIER, VIGNETTE, JETABLE]) octets.set(cleDe(u), Buffer.from(`\x89PNG objet ${createHash('md5').update(u).digest('hex')}`));
  await db.update(schema.brands).set({ logoUrl: LOGO, logos: [LOGO, EXTERNE], logoEmpreintes: { [LOGO]: createHash('md5').update(octets.get(cleDe(LOGO))!).digest('hex') }, url: SITE }).where(eq(schema.brands.id, ids.brandA1));
  const [pr] = await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Sérum', imageUrl: PHOTO, imageUrls: [PHOTO] }).returning({ id: schema.products.id });
  s.produit = pr!.id;
  const [pj] = await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Jetable', imageUrls: [PHOTO] }).returning({ id: schema.products.id });
  s.produitJetable = pj!.id;
  await db.insert(schema.products).values({ brandId: ids.brandA1, name: 'Intrus', imageUrls: [`${BASE}/assets/${ids.wsB}/1700000000009-99999999-autre.png`] });
  const [f] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, uploaderUserId: ids.ua, name: 'Rush', kind: 'image', source: 'upload', url: FICHIER, thumbUrl: VIGNETTE, mimeType: 'image/png', objectEtag: 'abc' }).returning({ id: schema.assets.id });
  s.fichier = f!.id;
  const [fj] = await db.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, uploaderUserId: ids.ua, name: 'Jetable', kind: 'image', source: 'upload', url: JETABLE, mimeType: 'image/png' }).returning({ id: schema.assets.id });
  s.jetable = fj!.id;
  const [dos] = await db.insert(schema.libraryFolders).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'Rushs' }).returning({ id: schema.libraryFolders.id });
  s.dossier = dos!.id;
  const p = await projetTest(db, ids, ids.brandA1, ids.ua);
  s.projet = p.projectId; s.version = p.versionId;
  s.projetJetable = (await projetTest(db, ids, ids.brandA1, ids.ua)).projectId;
  s.sortie = randomUUID();
  // Une sortie Studios LIVRÉE · un vrai PNG au stockage, empreinte et taille de la ligne (la route média la relit).
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  octets.set(`studios/${ids.wsA}/${s.sortie}.png`, png);
  await db.insert(schema.studioAssets).values({ id: s.sortie, workspaceId: ids.wsA, brandId: ids.brandA1, projectId: s.projet, storageKey: `studios/${ids.wsA}/${s.sortie}.png`, mime: 'image/png', bytes: png.length, width: 8, height: 6, sha256: createHash('sha256').update(png).digest('hex'), origin: 'generated', storageState: 'stored' });
  const [j] = await db.insert(schema.studioJobs).values({ workspaceId: ids.wsA, brandId: ids.brandA1, projectId: s.projet, projectVersionId: p.versionId, operation: 'image_generate', state: 'completed', qualityStatus: 'passed', idempotencyKey: `brutes-${s.sortie}`, inputHash: 'b'.repeat(64), snapshot: {}, result: { assets: { 'keyframe:s_image': s.sortie } } }).returning({ id: schema.studioJobs.id });
  s.job = j!.id;
  const [l] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: 1 }).returning({ id: schema.batches.id });
  s.lot = l!.id;
  const [t] = await db.insert(schema.tickets).values({ workspaceId: ids.wsA, userId: ids.ua, title: 'Une question', body: 'Bonjour' }).returning({ id: schema.tickets.id });
  s.ticket = t!.id;
  // Adsmap · la chaîne persona → désir → angle → concept, la GAGNANTE arbitrée rangée au lot (lien, créa, brief au stockage ·
  // le départ « itération » de l'assistant la montre), les ads du lot portant la créa d'une AUTRE marque, la variante Drive, et
  // une seconde gagnante hors lot portant la créa d'une autre marque.
  s.adsmap = await semerAdsmapMedias(db, schema, { workspaceId: ids.wsA, brandId: ids.brandA1, autreMarqueId: ids.brandA2, lotId: s.lot, objets: ADSMAP });
  for (const u of Object.values(ADSMAP)) octets.set(cleDe(u), Buffer.from(`\x89PNG objet ${createHash('md5').update(u).digest('hex')}`));
  // Une sauvegarde Veille dont la vignette est un objet du stockage · le départ « veille » de l'assistant la liste.
  const [sv] = await db.insert(schema.savedAds).values({ workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA1, platform: 'meta', externalId: 'sauvee-1', snapshot: { id: 'sauvee-1', platform: 'meta', mediaType: 'image', advertiserName: 'Concurrent observé', body: 'Une annonce observée', thumbnailUrl: SAUVEE } }).returning({ id: schema.savedAds.id });
  s.sauvegarde = sv!.id;
  Object.assign(s, { persona: s.adsmap.persona, desire: s.adsmap.desire, angle: s.adsmap.angle, concept: s.adsmap.concept, ad: s.adsmap.ad });
  const [sc] = await db.insert(schema.scenarios).values({ brandId: ids.brandA1, title: 'Scène' }).returning({ id: schema.scenarios.id });
  s.scenario = sc!.id;
  const [g] = await db.insert(schema.generations).values({ brandId: ids.brandA1, kind: 'copy', status: 'completed', output: { hooks: ['Un texte'] } }).returning({ id: schema.generations.id });
  s.generation = g!.id;
  // Une pub Pubs IA composée sur une scène rangée au stockage · la route de rendu la compose (scène lue par adresse signée).
  octets.set(cleDe(SCENE), await sharp({ create: { width: 40, height: 50, channels: 3, background: { r: 200, g: 180, b: 160 } } }).png().toBuffer());
  const [pu] = await db.insert(schema.generations).values({ brandId: ids.brandA1, kind: 'ad', status: 'completed', input: { template: 'benefits', sceneUrl: SCENE, headline: 'Une peau nette', cta: 'Acheter', accent: '#123456' }, output: {} }).returning({ id: schema.generations.id });
  s.pub = pu!.id;
  h.session = { user: { id: ids.ua, email: 'ua@studios.test', name: 'Kevin' }, workspaceId: ids.wsA, workspaceName: 'Espace A', role: 'owner', plan: 'business', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] };
  h.cookie = ids.brandA1;
  // Un projet statique AVEC brief (source, hypothèse, produit dont la photo vit au stockage) et une maquette · il se lit, s'exporte, se rend.
  const source = sourceConcurrente(ids);
  const produit = referenceProduit({ id: s.produit, name: 'Sérum', description: null, usp: null, price: null, url: null, imageUrl: PHOTO, imageUrls: [PHOTO] }, T0);
  const brief = composerBrief({ sources: [source], hypothese: { ...HYPOTHESE, sourceIds: [source.sourceId] }, produit, audience: 'Coureurs 25-40 ans' });
  const document: DocumentStudio = { width: 1080, height: 1350, colorSpace: 'sRGB', fonts: {}, layers: { l_fond: { id: 'l_fond', kind: 'shape', name: 'Fond', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 1, shape: 'rect', fill: '#120810' } } };
  const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown>, productRef: produit as unknown as ContenuVersion['productRef'], document };
  const [pst] = await db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'ads', title: 'Projet statique', ownerId: ids.ua, sourceRefs: [source] }).returning();
  const [vst] = await db.insert(schema.studioProjectVersions).values({ projectId: pst!.id, workspaceId: ids.wsA, brandId: ids.brandA1, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test' }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: vst!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, pst!.id));
  s.projetImage = pst!.id; s.versionImage = vst!.id;
  // Un fichier de la Bibliothèque VERSÉ dans le projet (comme à l'écran) · les lectures du projet le montrent.
  const { verserSelectionDansProjet } = await import('../app/actions/studios/versement');
  const ve = await verserSelectionDansProjet({ projectId: s.projetImage, ids: [s.fichier], role: 'style', scope: 'global' });
  if (!ve.ok) throw new Error(`semis · versement · ${ve.message}`);
  const [cour] = await db.select({ v: schema.studioProjects.currentVersionId }).from(schema.studioProjects).where(eq(schema.studioProjects.id, s.projetImage));
  s.versionImage = cour!.v!;
});
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/* ───────────── Les points d'entrée, dans l'ordre d'appel ───────────── */

type Point = { cle: string; phase: Phase; appeler: () => Promise<{ sortie: Sortie; recu: Recu | null; sansSession?: Recu | null }> };
const ORDRE: Record<Phase, number> = { lecture: 0, appel: 1, destruction: 2 };

async function chargerPoints(): Promise<{ points: Point[]; actions: string[]; routes: string[] }> {
  const points: Point[] = [];
  const actions: string[] = [];
  const routes: string[] = [];
  for (const { fichier, charger } of MODULES_ACTIONS) {
    const mod = await charger();
    for (const [nom, v] of Object.entries(mod)) {
      if (typeof v !== 'function') continue;
      const cle = `${fichier}#${nom}`;
      actions.push(cle);
      const appels = ACTIONS[fichier]?.[nom];
      if (!appels) continue;
      for (const a of [appels].flat()) {
        points.push({ cle: a.variante ? `${cle}(${a.variante})` : cle, phase: a.phase, appeler: async () => ({ sortie: await appeler(async () => (v as Fn)(...a.args())), recu: null }) });
      }
    }
  }
  for (const [f, charger] of Object.entries(ROUTES_FS)) {
    const mod = await charger();
    for (const verbe of VERBES) {
      const v = mod[verbe];
      if (typeof v !== 'function') continue;
      const cle = `${verbe} ${cheminRoute(f)}`;
      routes.push(cle);
      const r = ROUTES[cle];
      if (!r) continue;
      const lancer = async () => {
        const q = r.requete();
        const sortie = await appeler(async () => (v as Fn)(new Request(`http://localhost${q.url}`, q.init), { params: Promise.resolve(q.params ?? {}) }));
        return { sortie, recu: await lireReponse(sortie.valeur) };
      };
      points.push({
        cle, phase: r.phase,
        appeler: async () => {
          const avec = await lancer();
          // Une redirection vers le stockage n'est admise que d'une route GARDÉE · le même appel sans session ne doit rien en montrer.
          if (!avec.recu || !brute(avec.recu.entetes.location ?? '')) return avec;
          const garde = h.session;
          h.session = null;
          try { return { ...avec, sansSession: (await lancer()).recu }; } finally { h.session = garde; }
        },
      });
    }
  }
  points.sort((a, b) => ORDRE[a.phase] - ORDRE[b.phase]);
  return { points, actions, routes };
}

/* ───────────── Les exemptions et les témoins ───────────── */

/** Les SEULES adresses brutes admises dans ce qui sort d'un point d'entrée · justifiées une à une. */
const EXEMPTIONS: ReadonlyArray<{ point: string; chemin: string; raison: string }> = [
  {
    point: 'app/actions/assets.ts#presignAssetUploadAction', chemin: '.uploadUrl',
    raison: 'adresse SIGNÉE d’envoi (PUT, ≤ 900 s, une clé neuve de l’espace) · le navigateur y dépose le fichier directement, c’est son seul usage (jamais affichée)',
  },
];

/** Ce que les principales lectures DOIVENT rendre des objets semés, par leur route gardée. */
const signee = (u: string) => `${CFG.endpoint}/${CFG.bucket}/${cleDe(u)}?X-Amz-Algorithm=AWS4-HMAC-SHA256`;
const temoins = (): Readonly<Record<string, readonly string[]>> => ({
  'app/actions/assets.ts#listAssets': [`"url":"/api/asset/${s.fichier}?v=2&e=abc"`, `"thumbUrl":"/api/asset/${s.fichier}?v=2&thumb=1"`],
  'app/actions/assets.ts#pageBibliothequeAction': [`"url":"/api/asset/${s.fichier}?v=2&e=abc"`, `"thumbUrl":"/api/asset/${s.fichier}?v=2&thumb=1"`],
  'app/actions/brand-detail.ts#importBrandDAAction': [`/api/brands/${ids.brandA1}/media?url=${encodeURIComponent(LOGO)}`],
  'app/actions/studios/assistant.ts#ouvrirAssistantProjet': [`/api/brands/${ids.brandA1}/media?url=${encodeURIComponent(PHOTO)}`],
  // Les départs de l'assistant · la gagnante par la route gardée de l'ad, la sauvegarde listée sans aperçu signé.
  'app/actions/studios/departs-assistant.ts#listerDepartsAssistant(iteration)': [`"apercu":"/api/adsmap/${s.ad}/apercu"`],
  'app/actions/studios/departs-assistant.ts#listerDepartsAssistant(veille)': [`"titre":"Concurrent observé","detail":"Une annonce observée","apercu":null`],
  'app/actions/adsmap.ts#listAdsAction': [`"briefUrl":"/api/adsmap/${s.ad}/apercu?media=brief"`, `"assetUrl":"/api/adsmap/${s.ad}/apercu"`, `"id":"${s.adsmap.adEtrangere}"`],
  // Les lots · la vignette du lot est la route gardée de la gagnante (la variante Drive et la créa étrangère, avant elle, passent).
  'app/actions/adsmap.ts#listBatchesAction': [`"id":"${s.lot}"`, `"ads":4,"thumbUrl":"/api/adsmap/${s.ad}/apercu?media=vignette"`],
  'app/actions/adsmap-batch.ts#batchDetailAction': [`"id":"${s.ad}"`, `"id":"${s.adsmap.adEtrangere}"`, `"id":"${s.adsmap.adEtrangereExterne}"`],
  'app/actions/adsmap-verdict.ts#adDetailAction': [`"id":"${s.ad}"`, '"batchNumber":1', '"verdictStatus":"validated"'],
  'app/actions/adsmap-iterate.ts#iterationPlanAction': [`"adId":"${s.ad}"`, `"adId":"${s.adsmap.gagnanteEtrangere}"`],
  'app/actions/studios/produit.ts#lireProduitProjet': [
    `/studio/projets/${s.projetImage}/produit/fichier/${photoProduit()}`, `/studio/projets/${s.projetImage}/produit/fichier/${idLogoMarque(ids.brandA1, empreinteAdresse(LOGO).sha256)}`, `/api/asset/${s.fichier}`,
  ],
  'GET /api/asset/[id]': ['302 ', signee(FICHIER)],
  'GET /api/drive-img/[id]': ['302 ', signee(FICHIER)],
  'GET /api/brands/[id]/media': ['302 ', signee(PHOTO)],
  'GET /studio/projets/[id]/produit/fichier/[assetId]': ['302 ', signee(PHOTO)],
  'GET /api/studios/media/[id]': ['200 ', '"content-type":"image/png"'],
  'GET /api/ad/[id]': ['200 ', '"content-type":"image/png"'],
  'GET /api/adsmap/[id]/apercu': ['302 ', signee(GAGNANTE)],
  'POST /api/bibliotheque/archive': ['200 ', 'Rush.png'],
});

/** Toutes les fuites d'un point d'entrée · valeur, levée, corps, en-têtes (la redirection signée d'une route gardée à part). */
function fuitesDe(r: { sortie: Sortie; recu: Recu | null; sansSession?: Recu | null }): Array<{ chemin: string; extrait: string }> {
  if (!r.recu) return [...fuitesValeur(r.sortie.valeur), ...fuitesValeur(r.sortie.erreur, '<levée>')];
  const out = fuitesValeur(r.recu.corps, '<corps>');
  for (const [k, v] of Object.entries(r.recu.entetes)) {
    if (!brute(v)) continue;
    const proxy = k === 'location' && r.recu.statut >= 300 && r.recu.statut < 400 && signeeCourte(v, [`assets/${ids.wsA}/`, `renders/${s.pub}/`]) && r.sansSession && !brute(JSON.stringify(r.sansSession));
    if (!proxy) out.push(...fuitesValeur(v, `<en-tête ${k}>`));
  }
  return out;
}

const RECENSEMENT = await chargerPoints();
const POINTS = RECENSEMENT.points;
const sorties = new Map<string, Awaited<ReturnType<Point['appeler']>>>();

describe('Routes et actions · aucune adresse brute du stockage privé ne part au navigateur', () => {
  it('le recensement · chaque action serveur et chaque route est appelée (ni oubliée, ni morte)', () => {
    const { actions, routes } = RECENSEMENT;
    expect.soft(MODULES_ACTIONS.length, 'aucun fichier `use server` trouvé · le motif est-il encore juste ?').toBeGreaterThan(70);
    expect.soft(ACTIONS_EN_LIGNE, 'directive `use server` EN LIGNE · une action hors d’un fichier d’actions échappe au recensement · range-la dans `app/actions/`').toEqual([]);
    expect.soft(actions.length, 'trop peu d’actions recensées').toBeGreaterThan(250);
    expect.soft(routes.length, 'trop peu de routes recensées').toBeGreaterThan(20);
    const declarees = Object.entries(ACTIONS).flatMap(([f, m]) => Object.keys(m).map((n) => `${f}#${n}`));
    expect.soft(actions.filter((c) => !declarees.includes(c)), 'point d’entrée NON RECENSÉ · dis comment l’appeler dans `ACTIONS`').toEqual([]);
    expect.soft(declarees.filter((c) => !actions.includes(c)), 'entrée morte dans `ACTIONS` (l’action n’existe plus)').toEqual([]);
    expect.soft(routes.filter((c) => !(c in ROUTES)), 'point d’entrée NON RECENSÉ · dis comment l’appeler dans `ROUTES`').toEqual([]);
    expect.soft(Object.keys(ROUTES).filter((c) => !routes.includes(c)), 'entrée morte dans `ROUTES` (la route n’existe plus)').toEqual([]);
    const tous = [...actions, ...routes, ...POINTS.map((p) => p.cle)];
    expect.soft(EXEMPTIONS.filter((x) => !tous.includes(x.point)).map((x) => x.point), 'exemption d’un point d’entrée inconnu').toEqual([]);
    expect.soft(Object.keys(temoins()).filter((c) => !tous.includes(c)), 'témoin d’un point d’entrée inconnu').toEqual([]);
  });

  it('chaque départ de l’assistant (liste du noyau) est appelé · aucun aperçu hors garde', () => {
    const cles = new Set(POINTS.map((p) => p.cle));
    const manquants = ORIGINES_DEPART_ASSISTANT.filter((o) => !cles.has(`app/actions/studios/departs-assistant.ts#listerDepartsAssistant(${o})`));
    expect(manquants, 'départ de l’assistant NON EXERCÉ · `listerDepartsAssistant` doit être appelé avec chaque départ du noyau').toEqual([]);
  });

  it('la route gardée de l’ad · sert la vignette (créa) et le brief de la gagnante rangée au lot, refuse la créa d’une autre marque (404, sans indice) · avant tout appel qui écrit ou détruit', async () => {
    const { GET } = await import('../app/api/adsmap/[id]/apercu/route');
    const servi = async (id: string, media: string) => {
      const r = await GET(new Request(`http://localhost/api/adsmap/${id}/apercu?media=${media}`), { params: Promise.resolve({ id }) });
      return { statut: r.status, cible: r.headers.get('location') ?? '', corps: await r.text() };
    };
    for (const [media, o] of [['vignette', VIGNETTE_CREA], ['brief', BRIEF]] as const) {
      const r = await servi(s.ad, media);
      expect(r.statut, `?media=${media} · la route sert le média de la gagnante`).toBe(302);
      expect(signeeCourte(r.cible, [cleDe(o)]), `?media=${media} · la redirection vise l’objet attendu, signée, éphémère · ${r.cible}`).toBe(true);
    }
    for (const id of [s.adsmap.adEtrangere, s.adsmap.adEtrangereExterne, s.adsmap.gagnanteEtrangere]) {
      const r = await servi(id, 'vignette');
      expect(r.statut, `${id} · la route sert la créa d’une AUTRE marque collée sur l’ad`).toBe(404);
      expect(`${r.cible} ${r.corps}`, `${id} · la réponse nomme la créa d’une autre marque`).not.toMatch(/autre-marque/);
    }
  });

  it.each(POINTS.map((p) => [p.cle, p] as const))('%s · rien de brut dans ce qui sort', async (cle, p) => {
    const r = await p.appeler();
    sorties.set(cle, r);
    if (p.phase === 'lecture') {
      expect(refus(r.sortie), `${cle} · la lecture doit réussir (sinon la garde lit un refus)`).toBeNull();
      if (r.recu) expect(r.recu.statut, `${cle} · la route doit servir (sinon la garde lit un refus) · ${r.recu.corps.slice(0, 200)}`).toBeLessThan(400);
    }
    const admises = EXEMPTIONS.filter((x) => x.point === cle).map((x) => x.chemin);
    const fuites = fuitesDe(r).filter((f) => !admises.includes(f.chemin));
    expect(fuites.map((f) => `${f.chemin} · …${f.extrait}…`), `${cle} · adresse BRUTE du stockage privé remise au navigateur · passe par la route gardée`).toEqual([]);
    const vu = r.recu ? `${r.recu.statut} ${JSON.stringify(r.recu.entetes)} ${r.recu.corps}` : JSON.stringify(r.sortie.valeur ?? null);
    for (const t of temoins()[cle] ?? []) expect(vu, `${cle} · témoin absent · l’objet semé n’est pas rendu par sa route gardée (${t})`).toContain(t);
    const lu = `${vu} ${r.sortie.erreur ?? ''}`;
    for (const x of interditsCreasEtrangeres(s.adsmap, ADSMAP, cleDe)) expect(lu, `${cle} · la créa d’une AUTRE marque part au navigateur (${x}) · la jointure ad → créa doit être bornée à la marque (\`jointureCreaDeLaMarque\`)`).not.toContain(x);
  });

  it('chaque exemption sert encore (une exemption morte est retirée)', () => {
    const mortes = EXEMPTIONS.filter((x) => { const r = sorties.get(x.point); return !r || !fuitesDe(r).some((f) => f.chemin === x.chemin); });
    expect(mortes.map((x) => `${x.point} · ${x.chemin}`), 'exemption morte').toEqual([]);
  });
});
