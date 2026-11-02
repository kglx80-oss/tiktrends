// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Ce qui part au MODÈLE ne lit que les créas de la marque.
 *
 * Défaut corrigé · « Décrire les créas » (`analyzeAssetsAction`) et la mémoire
 * de Jarvis (`jarvisHooks`, `loadSourceAds`) joignaient ad → créa sans borne de
 * marque (`eq(ads.creativeId, creatives.id)`). Une ad de la marque A rattachée
 * (import, ancienne synchro, donnée incohérente) à une créa de la marque B
 * envoyait au modèle la transcription, l'OCR et la durée de B · l'analyse de A
 * en était nourrie, puis RÉÉCRITE sur la créa de B. Les accroches de B
 * partaient dans le prompt de Jarvis pour A. Les écrans et la route gardée
 * passaient déjà par `jointureCreaDeLaMarque` (#1019, #1022) · désormais tout
 * le code serveur aussi.
 *
 * Une ad liée à la créa d'une autre marque est ÉCARTÉE avant l'appel : rien
 * d'elle ne part au modèle, aucune ligne n'est écrite (ni son lien
 * `creative_id`, ni une créa), aucun crédit n'est réservé, le coût annoncé ne
 * la compte pas, et l'écran le dit, compté. Réparer ce lien est une décision
 * humaine (CLAUDE.md · pas de modification de donnée sans mandat). Une ad SANS
 * créa reçoit toujours une créa de sa marque.
 *
 * Garde en deux temps :
 *  1. le RÉSULTAT, sur une vraie base (pglite + migrations), faux client
 *     Anthropic derrière la vraie barrière de dépense · on lit la REQUÊTE remise
 *     au modèle, le texte de la mémoire de Jarvis et ses statistiques, l'écran
 *     « Décrire les créas » RENDU avec les vraies actions (couverture, bouton,
 *     résumé), le solde et le registre des crédits, la dépense mesurée, et les
 *     lignes écrites. Une créa étrangère n'y laisse rien ; la créa de la marque
 *     (témoin) y est, sans quoi la garde lirait un envoi vide ;
 *  2. le RECENSEMENT, par motif · toute jointure ad → créa du code serveur passe
 *     par `jointureCreaDeLaMarque` (« NON RECENSÉ » sinon), et toute autre
 *     jointure sur `creatives` est nommée avec la PREUVE de sa borne de marque.
 */

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  cookie: null as string | null,
  /** Ce que le client Anthropic aurait reçu (paramètres de `messages.create`). */
  appelsIA: [] as unknown[],
  claude: null as unknown,
}));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
  h.claude = {
    messages: {
      create: async (p: { model?: string; tool_choice?: { name?: string } }) => {
        h.appelsIA.push(JSON.parse(JSON.stringify(p)));
        const outil = p.tool_choice?.name ?? '';
        const input = outil === 'return_asset_analysis' ? { hookType: 'question', openingType: 'produit', confidence: 0.6, claims: [], proofElements: [] } : {};
        return { id: 'msg_faux', type: 'message', role: 'assistant', model: p.model, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_1', name: outil, input }], usage: { input_tokens: 100, output_tokens: 50 } };
      },
    },
  };
});
const CFG = vi.hoisted(() => ({ endpoint: 's3.crea.test', region: 'gra', bucket: 'tt-prive', accessKeyId: 'cle', secretAccessKey: 'secret', publicBaseUrl: 'https://stockage.crea.test/tt-prive' }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/auth')>()), getSession: async () => h.session }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'tt_brand' && h.cookie ? { value: h.cookie } : undefined), getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ 'x-tt-chemin': '/jarvis/sources', host: 'localhost' }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/jarvis/sources', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));
// Aucun appel modèle · la vraie barrière de dépense enveloppe le faux client.
vi.mock('@tiktrends/ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/ai')>()), anthropicFromEnv: () => h.claude }));

import { db, schema, eq } from '@tiktrends/db';
import { costFor, estimateAnalysisCost, lectureCouverture } from '@tiktrends/core';
import { semer } from './studios-semis';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { DecrireCreas } from '../spatial/vues/jarvis/sources-client';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ids = h.ids;
const objet = (n: string) => `${CFG.publicBaseUrl}/assets/${ids.wsA}/${n}`;

/**
 * Les créas ÉTRANGÈRES · une de la marque A2 (même espace · `assetAiUrl` ne
 * l'arrêterait pas), une de B1 (autre espace). Chaque champ porte un marqueur
 * distinctif · aucun ne doit se lire dans ce qui part au modèle.
 */
const ETRANGERES = {
  memeEspace: {
    transcript: 'TRANSCRIPTION-SECRETE-A2 la crème de la marque voisine',
    ocrText: 'OCR-SECRET-A2 moins 40 pour cent',
    durationS: 47.25,
    thumbUrl: objet('1700000000020-a2a2a2a2-mini-a2.jpg'),
    storageUrl: objet('1700000000021-a2a2a2a3-fichier-a2.mp4'),
    hookSpoken: 'ACCROCHE-SECRETE-A2 tu fais trois erreurs avec ta crème',
    hookType: 'type-secret-a2',
  },
  autreEspace: {
    transcript: 'TRANSCRIPTION-SECRETE-B1 le sérum du concurrent',
    ocrText: 'OCR-SECRET-B1 livraison offerte',
    durationS: 38.75,
    thumbUrl: 'https://cdn.marque-b1.test/mini-b1.jpg',
    storageUrl: 'https://cdn.marque-b1.test/fichier-b1.mp4',
    hookSpoken: 'ACCROCHE-SECRETE-B1 arrête de gaspiller ton sérum',
    hookType: 'type-secret-b1',
  },
} as const;
/** La créa de la marque elle-même · le TÉMOIN (elle doit partir, sinon la garde lirait un envoi vide). */
const PROPRE = {
  transcript: 'TRANSCRIPTION-TEMOIN-A1 notre crème hydrate en une nuit',
  ocrText: 'OCR-TEMOIN-A1 testé sous contrôle',
  durationS: 21.5,
  thumbUrl: objet('1700000000022-a1a1a1a1-mini-a1.jpg'),
  hookSpoken: 'ACCROCHE-TEMOIN-A1 une nuit suffit pour le voir',
  hookType: 'type-temoin-a1',
};
/** Les briefs des ads liées à une créa étrangère · écartées, même leur brief ne part pas. */
const BRIEFS_ETRANGERS = ['BRIEF-ETRANGERE-A2', 'BRIEF-ETRANGERE-B1'];
const PHRASE = '2 ad(s) écartée(s) · leur créa liée appartient à une autre marque · à réparer avant analyse';

/** Ce qui, d'une créa étrangère, ne doit jamais se lire dans ce qui part au modèle. */
const interdits = (c: (typeof ETRANGERES)[keyof typeof ETRANGERES]) => [
  c.transcript, c.ocrText, `${c.durationS} secondes`, c.thumbUrl, c.storageUrl, c.hookSpoken, c.hookType,
];
const TOUS_INTERDITS = [...interdits(ETRANGERES.memeEspace), ...interdits(ETRANGERES.autreEspace)];

const s = { adPropre: '', adSansCrea: '', adEtrangereMemeEspace: '', adEtrangereAutreEspace: '', creaPropre: '', creaA2: '', creaB1: '' };

beforeAll(async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-faux');
  vi.stubEnv('AI_SPEND_CAP_USD', '10');
  // Pas de fondateur · ses crédits seraient illimités et le débit ne se lirait pas.
  vi.stubEnv('FOUNDER_EMAILS', '');
  await semer(db, schema, ids);
  await db.update(schema.workspaces).set({ plan: 'business', onboardedAt: new Date(), creditsBalance: 1000 }).where(eq(schema.workspaces.id, ids.wsA));
  await db.update(schema.workspaceMembers).set({ role: 'owner' }).where(eq(schema.workspaceMembers.userId, ids.ua));

  const crea = async (brandId: string, c: { transcript: string; ocrText: string; durationS: number; thumbUrl: string; storageUrl?: string; hookSpoken: string; hookType: string }) =>
    (await db.insert(schema.creatives).values({
      brandId, fingerprintHash: `semis:${c.thumbUrl}`, type: 'video', thumbUrl: c.thumbUrl, storageUrl: c.storageUrl ?? null,
      transcript: c.transcript, ocrText: c.ocrText, durationS: c.durationS, hookType: c.hookType, analysis: { hookSpoken: c.hookSpoken },
    }).returning({ id: schema.creatives.id }))[0]!.id;
  s.creaPropre = await crea(ids.brandA1, PROPRE);
  s.creaA2 = await crea(ids.brandA2, ETRANGERES.memeEspace);
  s.creaB1 = await crea(ids.brandB1, ETRANGERES.autreEspace);

  // La chaîne Adsmap de A1 · quatre ads, leurs verdicts (Jarvis ne lit que les ads arbitrées).
  const [pe] = await db.insert(schema.personas).values({ brandId: ids.brandA1, name: 'Persona' }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: 'Concept de la marque A1' }).returning();
  const ad = async (variantCode: string, creativeId: string | null, hypothesis: string) => {
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: co!.id, variantCode, format: 'video_ugc', creativeId, hypothesis, status: 'done' }).returning({ id: schema.ads.id });
    await db.insert(schema.verdicts).values({ adId: a!.id, workspaceId: ids.wsA, computed: 'winner', validated: 'winner', status: 'validated', comparable: true, metricsAgg: { roas: 2.1, spend: 90, purchases: 4, daysElapsed: 7 } });
    return a!.id;
  };
  s.adPropre = await ad('V1', s.creaPropre, 'BRIEF-TEMOIN-A1 si la preuve ouvre, on convertit mieux.');
  s.adEtrangereMemeEspace = await ad('V2', s.creaA2, 'BRIEF-ETRANGERE-A2 si on nomme le problème, on retient mieux.');
  s.adEtrangereAutreEspace = await ad('V3', s.creaB1, 'BRIEF-ETRANGERE-B1 si on montre le geste, on rassure.');
  s.adSansCrea = await ad('V4', null, 'BRIEF-SANS-CREA-A1 si on parle au réveil, on retient mieux.');

  h.session = { user: { id: ids.ua, email: 'ua@studios.test', name: 'Kevin' }, workspaceId: ids.wsA, workspaceName: 'Espace A', role: 'owner', plan: 'business', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] };
  h.cookie = ids.brandA1;
});
afterAll(() => { vi.unstubAllEnvs(); });

const fuitesDans = (texte: string) => [...TOUS_INTERDITS, ...BRIEFS_ETRANGERS].filter((x) => texte.includes(x));
const requete = () => h.appelsIA.map((p) => JSON.stringify(p)).join('\n');

/** Ce que l'action peut avoir touché · solde, registre des crédits, dépense mesurée, créas, liens des ads. */
async function etat() {
  const [w] = await db.select({ solde: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, ids.wsA));
  const registre = await db.select({ delta: schema.creditLedger.delta, reason: schema.creditLedger.reason }).from(schema.creditLedger).where(eq(schema.creditLedger.workspaceId, ids.wsA));
  const depenses = await db.select({ id: schema.aiSpend.id }).from(schema.aiSpend).where(eq(schema.aiSpend.workspaceId, ids.wsA));
  const creas = await db.select({ id: schema.creatives.id, brandId: schema.creatives.brandId, fp: schema.creatives.fingerprintHash, analysisModel: schema.creatives.analysisModel, analyzedAt: schema.creatives.analyzedAt }).from(schema.creatives);
  const ads = await db.select({ id: schema.ads.id, creativeId: schema.ads.creativeId }).from(schema.ads).where(eq(schema.ads.workspaceId, ids.wsA));
  return { solde: w!.solde, registre, depenses: depenses.length, creas, lien: new Map(ads.map((a) => [a.id, a.creativeId])) };
}

const CTX: CtxSpatial = {
  utilisateur: { nom: 'K', initiales: 'K', email: 'ua@studios.test', role: 'Propriétaire' },
  credits: { solde: 1000, dotation: 1000, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
/** Laisse les vraies actions (base pglite) répondre et React se mettre à jour. */
const laisser = async (ms = 400) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function attendre(hote: HTMLElement, ok: () => boolean, quoi: string) {
  for (let i = 0; i < 60 && !ok(); i++) await laisser(100);
  expect(ok(), `${quoi} · rien de tel à l’écran (${hote.textContent?.slice(0, 400)})`).toBe(true);
}

/* ───────────── 1 · Le résultat ───────────── */

describe('Ce qui part au modèle ne lit que les créas de la marque', () => {
  it('la mémoire de Jarvis (prompt et statistiques) ignore la créa d’une autre marque collée sur une ad', async () => {
    const { jarvisFullMemory, jarvisStats } = await import('../lib/jarvis-memory');
    const memoire = await jarvisFullMemory(ids.brandA1, ids.wsA);
    expect(memoire, 'témoin absent · l’accroche de la créa de la marque doit partir dans le prompt de Jarvis (sinon la garde lirait une mémoire vide)').toContain(PROPRE.hookSpoken);
    expect(fuitesDans(memoire), 'la créa d’une AUTRE marque nourrit le prompt de Jarvis · la jointure ad → créa doit être bornée à la marque (`jointureCreaDeLaMarque`)').toEqual([]);

    const { stats } = await jarvisStats(ids.brandA1, ids.wsA);
    const cles = stats.map((r) => `${r.dimension}:${r.key}`);
    expect(cles, 'témoin absent · le type d’accroche de la créa de la marque doit compter dans ses statistiques').toContain(`hook_type:${PROPRE.hookType}`);
    expect(fuitesDans(cles.join('\n')), 'la créa d’une AUTRE marque compte dans les statistiques de Jarvis · la jointure ad → créa doit être bornée à la marque (`jointureCreaDeLaMarque`)').toEqual([]);
  });

  it('le coût annoncé ne compte pas les ads liées à la créa d’une autre marque, et la couverture les nomme', async () => {
    const { analysisCoverageAction } = await import('../app/actions/adsmap-analyze');
    const r = await analysisCoverageAction();
    const c = r.coverage!;
    expect(c, `couverture illisible (${JSON.stringify(r)})`).toBeTruthy();
    // Restent à décrire · le témoin et l'ad sans créa, depuis leur brief (aucun visuel ouvrable).
    expect({ pendingAsset: c.pendingAsset, pendingWritten: c.pendingWritten, nextBatch: c.nextBatch }, 'le coût annoncé compte les ads écartées pour créa d’une autre marque · elles ne seront ni envoyées ni débitées').toEqual({ pendingAsset: 0, pendingWritten: 2, nextBatch: 2 });
    expect(c.nextCostUsd, 'le coût annoncé compte les ads écartées pour créa d’une autre marque').toBe(estimateAnalysisCost(0, 2));
    expect(c.foreignCrea, 'la couverture ne compte pas les ads liées à la créa d’une autre marque').toBe(2);
    expect(lectureCouverture(c).texte, 'la couverture ne dit pas les ads écartées').toContain(PHRASE);
  });

  it('l’écran « Décrire les créas », vraies actions · rien de la créa étrangère ne part, le débit ne compte que les ads décrites, la phrase est rendue', async () => {
    const avant = await etat();
    h.appelsIA.length = 0;
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const root = createRoot(hote);
    act(() => root.render(<FournisseurSpatial value={CTX}><DecrireCreas /></FournisseurSpatial>));
    await attendre(hote, () => (hote.textContent ?? '').includes('Décrire 2 créa(s)'), 'le bouton annonce les 2 créas décrivables (pas les écartées)');
    expect(hote.textContent, 'la couverture rendue ne dit pas les ads écartées').toContain(PHRASE);
    const bouton = [...hote.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Décrire 2 créa(s)')) as HTMLButtonElement;
    await act(async () => { bouton.click(); });
    await attendre(hote, () => !!hote.querySelector('[role="status"]'), 'le résumé de l’action');
    const resume = hote.querySelector('[role="status"]')!.textContent ?? '';
    act(() => root.unmount());
    hote.remove();

    // Ce qui est parti au modèle d'abord · le témoin et l'ad sans créa, RIEN des ads écartées.
    const vu = requete();
    expect(fuitesDans(vu), 'une ad liée à la créa d’une AUTRE marque part au MODÈLE (sa créa ou son brief) · elle doit être écartée avant l’appel').toEqual([]);
    for (const x of [PROPRE.transcript, PROPRE.ocrText, `${PROPRE.durationS} secondes`, 'BRIEF-SANS-CREA-A1']) {
      expect(vu, `témoin absent · ${x} doit partir au modèle · une borne trop large écarterait aussi les créas légitimes`).toContain(x);
    }
    expect(h.appelsIA.length, 'une ad liée à la créa d’une AUTRE marque part au MODÈLE · deux requêtes attendues (le témoin, l’ad sans créa)').toBe(2);

    expect(resume, 'l’écran ne rend pas la phrase des ads écartées (comptée)').toContain(PHRASE);
    expect(resume, `deux ads décrites attendues (${resume})`).toMatch(/^2 ad\(s\) décrite\(s\)/);

    // Le débit · deux ads décrites, ni plus ni moins (barrière de dépense et crédits).
    const apres = await etat();
    expect(avant.solde - apres.solde, 'le débit compte les ads écartées pour créa d’une autre marque').toBe(2 * costFor('asset_analysis', 1));
    expect(apres.depenses - avant.depenses, 'la dépense mesurée ne correspond pas aux requêtes parties').toBe(2);
    const nouvelles = apres.registre.slice(avant.registre.length).map((l) => l.reason).join('\n');
    for (const adId of [s.adEtrangereMemeEspace, s.adEtrangereAutreEspace]) {
      expect(nouvelles, 'un crédit est réservé pour une ad écartée').not.toContain(adId);
    }
  });

  it('aucune ligne écrite pour l’ad liée à la créa d’une autre marque · son lien est intact, aucune créa ne naît pour elle', async () => {
    const e = await etat();
    expect(e.lien.get(s.adEtrangereMemeEspace), 'le lien `creative_id` d’une ad liée à la créa d’une autre marque a été RÉÉCRIT · c’est une modification de donnée sans mandat, l’ad doit être écartée').toBe(s.creaA2);
    expect(e.lien.get(s.adEtrangereAutreEspace), 'le lien `creative_id` d’une ad liée à la créa d’une autre marque a été RÉÉCRIT · c’est une modification de donnée sans mandat, l’ad doit être écartée').toBe(s.creaB1);
    for (const adId of [s.adEtrangereMemeEspace, s.adEtrangereAutreEspace]) {
      expect(e.creas.filter((c) => c.fp === `adsmap:${adId}`), 'une créa est NÉE pour une ad liée à la créa d’une autre marque · rien ne doit s’écrire pour elle').toEqual([]);
    }
    for (const id of [s.creaA2, s.creaB1]) {
      const c = e.creas.find((x) => x.id === id);
      expect(c, 'la créa étrangère a disparu · elle doit rester intacte').toBeTruthy();
      expect({ analysisModel: c!.analysisModel, analyzedAt: c!.analyzedAt }, 'l’analyse d’une ad de A1 a été ÉCRITE sur la créa d’une autre marque · l’écriture doit être bornée à la marque').toEqual({ analysisModel: null, analyzedAt: null });
    }
    // Inchangé · l'ad SANS créa reçoit une créa de SA marque, avec l'analyse.
    const sansCrea = e.creas.find((c) => c.id === e.lien.get(s.adSansCrea));
    expect(sansCrea?.brandId, 'témoin absent · l’ad sans créa doit recevoir une créa de sa marque (comportement existant)').toBe(ids.brandA1);
    expect(sansCrea?.analysisModel, 'témoin absent · la créa née pour l’ad sans créa doit porter l’analyse').toBeTruthy();
    expect(e.creas.find((c) => c.id === s.creaPropre)?.analysisModel, 'témoin absent · l’analyse de la créa de la marque doit être écrite sur elle').toBeTruthy();
  });

  it('ciblées explicitement, les ads liées à la créa d’une autre marque ne coûtent rien et ne partent pas', async () => {
    const { analyzeAssetsAction } = await import('../app/actions/adsmap-analyze');
    const avant = await etat();
    h.appelsIA.length = 0;
    const r = await analyzeAssetsAction([s.adEtrangereMemeEspace, s.adEtrangereAutreEspace]);
    expect(r.error, 'l’action a échoué · la garde lirait un envoi vide').toBeUndefined();
    expect(h.appelsIA.length, `une ad liée à la créa d’une AUTRE marque part au MODÈLE · elle doit être écartée avant l’appel (${requete().slice(0, 300)})`).toBe(0);
    expect(r.foreignCrea, `les deux ads écartées ne sont pas comptées (${JSON.stringify(r)})`).toBe(2);
    expect(r.summary, 'le résultat ne dit pas les ads écartées (phrase comptée)').toContain(PHRASE);
    const apres = await etat();
    expect(avant.solde - apres.solde, 'le débit compte les ads écartées pour créa d’une autre marque').toBe(0);
    expect(apres.depenses, 'une dépense est mesurée pour des ads écartées').toBe(avant.depenses);
    expect([...apres.lien], 'le lien `creative_id` d’une ad liée à la créa d’une autre marque a été RÉÉCRIT · c’est une modification de donnée sans mandat, l’ad doit être écartée').toEqual([...avant.lien]);
    expect(apres.creas.length, 'une créa est NÉE pour une ad liée à la créa d’une autre marque · rien ne doit s’écrire pour elle').toBe(avant.creas.length);
  });
});

/* ───────────── 2 · Le recensement, par motif ───────────── */

const RACINE_PRODUIT = join(__dirname, '../../..');
/** Le code SERVEUR · tout ce qui lit la base. */
const RACINES = ['apps/web/app', 'apps/web/lib', 'apps/workers/src', 'packages/ai/src', 'packages/integrations/src', 'packages/core/src', 'packages/db/src'];
const DEFINITION = 'apps/web/lib/adsmap-medias.ts';
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
/** Le texte sans ses lignes de commentaire (une jointure CITÉE dans une doc n'est pas une jointure). */
const sansCommentaires = (t: string) => t.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

/** Une égalité ad → créa écrite à la main · drizzle (`eq`, dans les deux sens) ou SQL brut. Seule `jointureCreaDeLaMarque` a le droit de l'écrire. */
const AD_VERS_CREA = [
  /eq\(\s*schema\.ads\.creativeId\s*,\s*schema\.creatives\.id\s*\)/g,
  /eq\(\s*schema\.creatives\.id\s*,\s*schema\.ads\.creativeId\s*\)/g,
  /\$\{\s*schema\.ads\.creativeId\s*\}\s*=\s*\$\{\s*schema\.creatives\.id\s*\}/g,
  /\$\{\s*schema\.creatives\.id\s*\}\s*=\s*\$\{\s*schema\.ads\.creativeId\s*\}/g,
  /\bads\.creative_id\s*=\s*(?:c|creatives)\.id\b|\b(?:c|creatives)\.id\s*=\s*(?:a|ads)\.creative_id\b/gi,
];
/** Toute jointure SUR la table des créas · drizzle (`leftJoin(schema.creatives, …)`, alias) ou SQL brut. */
const JOINTURE_CREAS = /(?:left|inner|right|full)Join\(\s*schema\.creatives\s*,(?!\s*jointureCreaDeLaMarque\()|alias\(\s*schema\.creatives\b|\bjoin\s+"?creatives"?\b/gi;
/**
 * Les jointures sur `creatives` qui ne partent PAS d'une ad · nommées, avec la
 * PREUVE de leur borne de marque lue dans le fichier (une preuve qui ne tient
 * plus fait de l'exemption une exemption morte).
 */
const AUTRES_JOINTURES: Readonly<Record<string, { n: number; raison: string; preuve: RegExp }>> = {
  'apps/web/app/(spatial)/sp/adsmap/donnees.ts': {
    n: 1, raison: 'mesures d’une INSTANCE de régie → sa créa, filtrées par la marque de la créa (`creatives.brand_id`)',
    preuve: /innerJoin\(schema\.creatives, eq\(schema\.adInstances\.creativeId, schema\.creatives\.id\)\)\s*\.where\(and\(eq\(schema\.creatives\.brandId, brandId\)/,
  },
};

function recenser(): { adVersCrea: string[]; autres: Map<string, number> } {
  const adVersCrea: string[] = [];
  const autres = new Map<string, number>();
  for (const r of RACINES) {
    for (const f of fichiersDe(join(RACINE_PRODUIT, r))) {
      const t = sansCommentaires(readFileSync(f, 'utf8'));
      const rel = relative(RACINE_PRODUIT, f);
      const n = AD_VERS_CREA.reduce((acc, re) => acc + [...t.matchAll(new RegExp(re.source, re.flags))].length, 0);
      if (n) adVersCrea.push(`${rel} · ${n}`);
      const j = [...t.matchAll(new RegExp(JOINTURE_CREAS.source, JOINTURE_CREAS.flags))].length;
      if (j) autres.set(rel, j);
    }
  }
  return { adVersCrea, autres };
}

describe('Recensement · toute jointure ad → créa du code serveur passe par `jointureCreaDeLaMarque`', () => {
  const { adVersCrea, autres } = recenser();

  it('aucune jointure ad → créa écrite à la main, hors de `jointureCreaDeLaMarque`', () => {
    expect(adVersCrea, `jointure ad → créa NON RECENSÉE · elle lirait la créa d’une AUTRE marque collée sur l’ad · remplace-la par \`jointureCreaDeLaMarque(brandId)\` (${DEFINITION})`).toEqual([`${DEFINITION} · 1`]);
    const def = sansCommentaires(readFileSync(join(RACINE_PRODUIT, DEFINITION), 'utf8'));
    expect(def, '`jointureCreaDeLaMarque` ne borne plus à la marque').toMatch(/export function jointureCreaDeLaMarque\(brandId: string\) \{\s*return and\(eq\(schema\.creatives\.id, schema\.ads\.creativeId\), eq\(schema\.creatives\.brandId, brandId\)\);/);
  });

  it('toute autre jointure sur `creatives` est nommée, et sa borne de marque tient', () => {
    const nonRecensees = [...autres].filter(([f, n]) => AUTRES_JOINTURES[f]?.n !== n).map(([f, n]) => `${f} · ${n} trouvée(s), ${AUTRES_JOINTURES[f]?.n ?? 0} recensée(s)`);
    expect(nonRecensees, 'jointure sur `creatives` NON RECENSÉE · si elle part d’une ad, passe par `jointureCreaDeLaMarque` ; sinon nomme-la dans `AUTRES_JOINTURES` avec la preuve de sa borne de marque').toEqual([]);
    expect(Object.keys(AUTRES_JOINTURES).filter((f) => !autres.has(f)), 'entrée morte dans `AUTRES_JOINTURES` (la jointure n’existe plus)').toEqual([]);
    const mortes = Object.entries(AUTRES_JOINTURES).filter(([f, e]) => !e.preuve.test(readFileSync(join(RACINE_PRODUIT, f), 'utf8'))).map(([f, e]) => `${f} · « ${e.raison} » ne tient plus`);
    expect(mortes, 'exemption morte · la preuve de la borne de marque n’est plus dans le fichier').toEqual([]);
  });
});
