import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
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
 * Garde en deux temps :
 *  1. le RÉSULTAT, sur une vraie base (pglite + migrations), faux client
 *     Anthropic derrière la vraie barrière de dépense · on lit la REQUÊTE remise
 *     au modèle, le texte de la mémoire de Jarvis et ses statistiques, et les
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
  headers: async () => new Headers({ 'x-tt-chemin': '/adsmap', host: 'localhost' }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/integrations')>()), storageFromEnv: () => CFG, storageConfigured: () => true }));
// Aucun appel modèle · la vraie barrière de dépense enveloppe le faux client.
vi.mock('@tiktrends/ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/ai')>()), anthropicFromEnv: () => h.claude }));

import { db, schema, eq } from '@tiktrends/db';
import { semer } from './studios-semis';

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

/** Ce qui, d'une créa étrangère, ne doit jamais se lire dans ce qui part au modèle. */
const interdits = (c: (typeof ETRANGERES)[keyof typeof ETRANGERES]) => [
  c.transcript, c.ocrText, `${c.durationS} secondes`, c.thumbUrl, c.storageUrl, c.hookSpoken, c.hookType,
];
const TOUS_INTERDITS = [...interdits(ETRANGERES.memeEspace), ...interdits(ETRANGERES.autreEspace)];

const s = { adPropre: '', adEtrangereMemeEspace: '', adEtrangereAutreEspace: '', creaPropre: '', creaA2: '', creaB1: '' };

beforeAll(async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-faux');
  vi.stubEnv('AI_SPEND_CAP_USD', '10');
  vi.stubEnv('FOUNDER_EMAILS', 'ua@studios.test');
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

  // La chaîne Adsmap de A1 · trois ads, chacune avec sa créa, ses verdicts (Jarvis ne lit que les ads arbitrées).
  const [pe] = await db.insert(schema.personas).values({ brandId: ids.brandA1, name: 'Persona' }).returning();
  const [de] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: pe!.id, label: 'Désir' }).returning();
  const [an] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: de!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [co] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: an!.id, title: 'Concept de la marque A1' }).returning();
  const ad = async (variantCode: string, creativeId: string, hypothesis: string) => {
    const [a] = await db.insert(schema.ads).values({ workspaceId: ids.wsA, conceptId: co!.id, variantCode, format: 'video_ugc', creativeId, hypothesis, status: 'done' }).returning({ id: schema.ads.id });
    await db.insert(schema.verdicts).values({ adId: a!.id, workspaceId: ids.wsA, computed: 'winner', validated: 'winner', status: 'validated', comparable: true, metricsAgg: { roas: 2.1, spend: 90, purchases: 4, daysElapsed: 7 } });
    return a!.id;
  };
  s.adPropre = await ad('V1', s.creaPropre, 'BRIEF-TEMOIN-A1 si la preuve ouvre, on convertit mieux.');
  s.adEtrangereMemeEspace = await ad('V2', s.creaA2, 'BRIEF-ETRANGERE-A2 si on nomme le problème, on retient mieux.');
  s.adEtrangereAutreEspace = await ad('V3', s.creaB1, 'BRIEF-ETRANGERE-B1 si on montre le geste, on rassure.');

  h.session = { user: { id: ids.ua, email: 'ua@studios.test', name: 'Kevin' }, workspaceId: ids.wsA, workspaceName: 'Espace A', role: 'owner', plan: 'business', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] };
  h.cookie = ids.brandA1;
});
afterAll(() => { vi.unstubAllEnvs(); });

const fuitesDans = (texte: string) => TOUS_INTERDITS.filter((x) => texte.includes(x));

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

  it('« Décrire les créas » · une ad liée à la créa d’une autre marque part SANS elle', async () => {
    const { analyzeAssetsAction } = await import('../app/actions/adsmap-analyze');
    for (const [adId, brief] of [[s.adEtrangereMemeEspace, 'BRIEF-ETRANGERE-A2'], [s.adEtrangereAutreEspace, 'BRIEF-ETRANGERE-B1']] as const) {
      h.appelsIA.length = 0;
      const r = await analyzeAssetsAction([adId]);
      const requete = h.appelsIA.map((p) => JSON.stringify(p)).join('\n');
      // Témoin · l'ad est bien décrite (depuis son brief), la requête n'est pas vide.
      expect(h.appelsIA.length, `témoin absent · aucune requête n’est partie au modèle pour l’ad (${JSON.stringify(r)})`).toBeGreaterThan(0);
      expect(requete, 'témoin absent · le brief de l’ad elle-même doit partir').toContain(brief);
      expect(fuitesDans(requete), 'la créa d’une AUTRE marque part au MODÈLE (transcription, OCR, durée, miniature) · la jointure ad → créa de l’analyse doit être bornée à la marque (`jointureCreaDeLaMarque`)').toEqual([]);
      expect(r.analyzed, `l’ad n’a pas été décrite (${JSON.stringify(r)})`).toBe(1);
    }
  });

  it('« Décrire les créas » · la créa d’une autre marque n’est jamais réécrite, l’ad reçoit une créa de SA marque', async () => {
    const etrangeres = await db.select({ id: schema.creatives.id, analysisModel: schema.creatives.analysisModel, analyzedAt: schema.creatives.analyzedAt, transcript: schema.creatives.transcript })
      .from(schema.creatives);
    for (const id of [s.creaA2, s.creaB1]) {
      const c = etrangeres.find((x) => x.id === id);
      expect(c, 'la créa étrangère a disparu · elle doit rester intacte').toBeTruthy();
      expect({ analysisModel: c!.analysisModel, analyzedAt: c!.analyzedAt }, 'l’analyse d’une ad de A1 a été ÉCRITE sur la créa d’une autre marque · l’écriture doit être bornée à la marque').toEqual({ analysisModel: null, analyzedAt: null });
    }
    for (const adId of [s.adEtrangereMemeEspace, s.adEtrangereAutreEspace]) {
      const [l] = await db.select({ brandId: schema.creatives.brandId, analysisModel: schema.creatives.analysisModel })
        .from(schema.ads).innerJoin(schema.creatives, eq(schema.creatives.id, schema.ads.creativeId)).where(eq(schema.ads.id, adId));
      expect(l?.brandId, 'l’ad décrite ne porte pas une créa de SA marque · l’analyse n’a nulle part où vivre').toBe(ids.brandA1);
      expect(l?.analysisModel, 'la créa de la marque n’a pas reçu l’analyse').toBeTruthy();
    }
  });

  it('« Décrire les créas » · témoin · une ad liée à une créa de SA marque l’envoie bien au modèle', async () => {
    const { analyzeAssetsAction } = await import('../app/actions/adsmap-analyze');
    h.appelsIA.length = 0;
    const r = await analyzeAssetsAction([s.adPropre]);
    const requete = h.appelsIA.map((p) => JSON.stringify(p)).join('\n');
    expect(r.analyzed, `l’ad témoin n’a pas été décrite (${JSON.stringify(r)})`).toBe(1);
    for (const x of [PROPRE.transcript, PROPRE.ocrText, `${PROPRE.durationS} secondes`]) {
      expect(requete, `témoin absent · la créa de la marque doit partir au modèle (${x}) · une borne trop large écarterait aussi les créas légitimes`).toContain(x);
    }
    expect(fuitesDans(requete)).toEqual([]);
    const [c] = await db.select({ analysisModel: schema.creatives.analysisModel }).from(schema.creatives).where(eq(schema.creatives.id, s.creaPropre));
    expect(c?.analysisModel, 'témoin absent · l’analyse de la créa de la marque doit être écrite sur elle').toBeTruthy();
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
