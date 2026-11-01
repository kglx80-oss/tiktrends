import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Sécurité · Bibliothèque et marques suivies · les actions serveur appliquent la
 * règle d'accès de la PAGE (feature `assets` / `inspo` de `lib/rbac.ts`).
 *
 * Le défaut · les actions de `app/actions/assets.ts`, `followBrand` et
 * `unfollowBrand` ne vérifiaient que la session. Un lecteur client, ou un membre
 * d'un espace Starter, les appelait directement · import, suppression, tagging
 * IA qui réserve des crédits et dépense de l'IA.
 *
 * LECTURE et ÉCRITURE sont séparées · voir ses médias existants garde la règle
 * d'avant (plancher de rôle Membre, sans offre) · aucun accès à des données
 * déjà là n'est retiré. Tout geste qui écrit, réserve un crédit ou appelle l'IA
 * exige la feature complète (rôle ET offre). Un espace Starter voit donc ses
 * assets en lecture seule, sous un bandeau d'offre.
 *
 * Vraie base (pglite + migrations du dépôt), VRAIES actions, sessions ·
 * `client_viewer` (Core), `client_viewer` de l'équipe plateforme, `member` en
 * Starter, `member` et `admin` en Core. On lit le
 * RÉSULTAT · le refus rendu, l'empreinte des tables (assets, credit_ledger,
 * ai_spend, followed_brands, soldes) avant/après, et le nombre d'appels IA
 * (un client IA qui ÉCHOUE s'il est seulement demandé pendant un refus).
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  iaInterdite: true,
  appelsClient: 0,
  appelsVision: 0,
  appelsPresign: 0,
}));
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
// Marque active · le VRAI `getActiveBrand` (qui vérifie l'espace), cookie posé sur A1.
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (k === 'tt_brand' ? { value: etat.ids.brandA1 } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, unstable_cache: (f: unknown) => f }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`redirect ${u}`); },
  notFound: () => { throw new Error('notFound'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/assets', useSearchParams: () => new URLSearchParams(),
}));
// Aucune dépense · le client IA ÉCHOUE s'il est demandé pendant un refus.
vi.mock('../lib/spend-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/spend-guard')>()),
  guardedAnthropic: () => {
    etat.appelsClient++;
    if (etat.iaInterdite) throw new Error('client IA demandé alors que l’accès est refusé');
    return {};
  },
}));
vi.mock('@tiktrends/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/ai')>()),
  describeAssetImage: async () => {
    etat.appelsVision++;
    if (etat.iaInterdite) throw new Error('vision appelée alors que l’accès est refusé');
    return { tags: ['produit', 'flacon'] };
  },
}));
vi.mock('@tiktrends/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tiktrends/integrations')>()),
  storageFromEnv: () => ({ bucket: 'b', region: 'r', endpoint: 'https://stockage.invalid', accessKeyId: 'k', secretAccessKey: 's', publicBaseUrl: 'https://stockage.invalid' }),
  presignPutUrl: (_c: unknown, key: string) => { etat.appelsPresign++; return { uploadUrl: `https://stockage.invalid/put/${key}`, publicUrl: `https://stockage.invalid/${key}` }; },
  deleteObjectByUrl: async () => true,
}));

import { db, schema, sql } from '@tiktrends/db';
import { eq } from 'drizzle-orm';
import { session, semer } from './studios-semis';
import { bucketQuiSert } from './helpers/bucket-qui-sert';
import * as actionsAssets from '../app/actions/assets';
import {
  listAssets, uploadImageAssetsAction, importAssetAction, toggleAssetAiAction, tagAssetAction,
  tagUntaggedImagesAction, presignAssetUploadAction, registerUploadedAssetAction, deleteAssetAction,
  basculerTemplateAction,
} from '../app/actions/assets';
import { followBrand, unfollowBrand } from '../app/actions/inspo';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
// Vague 2 · l'écran V5 `/assets` est retiré · la page servie est la Spatiale.
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { FournisseurSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const A = { image: '', video: '', b: '' };

/** Empreinte de tout ce qu'un refus pourrait écrire · lignes ET contenu. */
async function empreinte(): Promise<string> {
  const out: string[] = [];
  for (const t of ['assets', 'credit_ledger', 'ai_spend', 'followed_brands']) {
    const r = await db!.execute(sql.raw(`select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), ',' order by md5(x::text)), '')) as h from public."${t}" x`));
    const [l] = ((r as unknown as { rows: Array<{ n: number; h: string }> }).rows);
    out.push(`${t}|${l!.n}|${l!.h}`);
  }
  const ws = await db!.select({ id: schema.workspaces.id, c: schema.workspaces.creditsBalance }).from(schema.workspaces).orderBy(schema.workspaces.id);
  out.push(`soldes|${JSON.stringify(ws)}`);
  return out.join('\n');
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db!.update(schema.workspaces).set({ creditsBalance: 100 });
  const [img] = await db!.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'flacon', kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png' }).returning();
  const [vid] = await db!.insert(schema.assets).values({ workspaceId: ids.wsA, brandId: ids.brandA1, name: 'rush', kind: 'video', source: 'url', url: 'https://exemple.invalid/rush.mp4' }).returning();
  const [b] = await db!.insert(schema.assets).values({ workspaceId: ids.wsB, brandId: ids.brandB1, name: 'secret B', kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png' }).returning();
  A.image = img!.id; A.video = vid!.id; A.b = b!.id;
  await db!.insert(schema.followedBrands).values([
    { workspaceId: ids.wsA, brandId: ids.brandA1, platform: 'meta', name: 'Concurrent Un' },
    { workspaceId: ids.wsA, brandId: ids.brandA1, platform: 'meta', name: 'Concurrent Deux' },
  ]);
});

/** Chaque action, appelée telle que l'écran l'appelle. Le nom sert au message d'échec. */
const ACTIONS: Array<[string, () => Promise<unknown>]> = [
  ['uploadImageAssetsAction', () => uploadImageAssetsAction({ items: [{ name: 'neuve', dataUri: PNG }] })],
  ['importAssetAction', () => importAssetAction({ name: 'lien', url: 'https://exemple.invalid/clip.mp4', kind: 'video' })],
  ['toggleAssetAiAction', () => toggleAssetAiAction({ id: A.image, useForAi: false })],
  ['basculerTemplateAction', () => basculerTemplateAction({ id: A.image, on: true })],
  ['tagAssetAction', () => tagAssetAction({ id: A.image })],
  ['tagUntaggedImagesAction', () => tagUntaggedImagesAction()],
  ['presignAssetUploadAction', () => presignAssetUploadAction({ filename: 'a.png', contentType: 'image/png', sizeBytes: 10 })],
  ['registerUploadedAssetAction', () => registerUploadedAssetAction({ name: 'f', url: `https://stockage.invalid/assets/${ids.wsA}/1-ab-f.png`, mimeType: 'image/png', sizeBytes: 10 })],
  ['deleteAssetAction', () => deleteAssetAction({ id: A.video })],
];

/**
 * Les exports de `assets.ts` qui n'ÉCRIVENT pas · chacun avec sa raison. Tout
 * autre export doit figurer dans ACTIONS (garde d'écriture éprouvée ci-dessous).
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {
  listAssets: 'lecture seule · règle d’avant (rôle Membre, sans offre), éprouvée par « Lecture »',
};

/** Équipe plateforme à accès total, mais `client_viewer` dans l'espace · le plancher de rôle d'ESPACE tient. */
const equipeLectrice = () => session(ids, 'uv', { equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] });

/** [qui, session, raison du refus d'écriture, la lecture lui est-elle ouverte ?] */
const REFUSES: Array<[string, () => SessionTest, 'role' | 'plan', boolean]> = [
  ['client_viewer (Core)', () => session(ids, 'uv'), 'role', false],
  ['équipe plateforme restée client_viewer', equipeLectrice, 'role', false],
  ['member en Starter', () => session(ids, 'ua', { plan: 'starter' }), 'plan', true],
];

describe('assets.ts · aucun export sans garde', () => {
  const nommees = new Set(ACTIONS.map(([n]) => n));
  it('chaque export est une action gardée (ACTIONS) ou une exemption justifiée', () => {
    const exports = Object.keys(actionsAssets).filter((k) => typeof (actionsAssets as Record<string, unknown>)[k] === 'function');
    expect(exports.length).toBeGreaterThan(0);
    const oublies = exports.filter((k) => !nommees.has(k) && !(k in EXEMPTIONS));
    expect(oublies, `export(s) de app/actions/assets.ts sans garde éprouvée · ajouter à ACTIONS (garde d’écriture) ou à EXEMPTIONS avec sa raison : ${oublies.join(', ')}`).toEqual([]);
    const fantomes = [...nommees, ...Object.keys(EXEMPTIONS)].filter((k) => !exports.includes(k));
    expect(fantomes, 'ACTIONS ou EXEMPTIONS nomme un export qui n’existe plus').toEqual([]);
  });
  it('chaque export non exempté refuse un member Starter AVANT de lire ses arguments', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    etat.iaInterdite = true;
    const avant = await empreinte();
    for (const [k, f] of Object.entries(actionsAssets)) {
      if (typeof f !== 'function' || k in EXEMPTIONS) continue;
      const r = await (f as (x: unknown) => Promise<{ error?: string }>)({}).catch((e: Error) => ({ error: `exception · ${e.message}` }));
      expect(r?.error, `${k} · appelée sans arguments par un member Starter · la garde ne passe pas en premier`).toBe(TEXTE_REFUS_BIBLIOTHEQUE.plan);
    }
    expect(await empreinte()).toBe(avant);
  });
});

describe('Bibliothèque · refus AVANT toute écriture, réservation ou appel IA', () => {
  for (const [qui, faire, raison, lecture] of REFUSES) {
    describe(qui, () => {
      for (const [nom, appeler] of ACTIONS) {
        it(`${nom} · refusé, rien d'écrit, aucun appel IA`, async () => {
          etat.session = faire();
          etat.iaInterdite = true;
          etat.appelsClient = 0; etat.appelsVision = 0; etat.appelsPresign = 0;
          const avant = await empreinte();
          const r = await appeler() as { error?: string; ok?: boolean };
          expect(r?.error, `${nom} · ${qui} · la garde de la Bibliothèque ne refuse pas`).toBe(TEXTE_REFUS_BIBLIOTHEQUE[raison]);
          expect(r?.ok, `${nom} · ${qui} · succès rendu malgré le refus`).toBeUndefined();
          expect(await empreinte(), `${nom} · ${qui} · une écriture a eu lieu malgré le refus`).toBe(avant);
          expect([etat.appelsClient, etat.appelsVision, etat.appelsPresign], `${nom} · ${qui} · IA ou stockage sollicité malgré le refus`).toEqual([0, 0, 0]);
        });
      }
      if (lecture) {
        it('listAssets · LECTURE ouverte · ses assets existants restent visibles', async () => {
          etat.session = faire();
          const l = await listAssets();
          expect(l.map((a) => a.id).sort(), `listAssets · ${qui} · la lecture des médias existants est retirée`).toEqual([A.image, A.video].sort());
        });
      } else {
        it('listAssets · refusé, ne rend rien', async () => {
          etat.session = faire();
          expect(await listAssets(), `listAssets · ${qui} · la garde de lecture de la Bibliothèque ne refuse pas`).toEqual([]);
        });
      }
    });
  }
});

describe('Bibliothèque · member en Core · chaque geste marche comme avant', () => {
  const ws = async () => db!.select().from(schema.assets).where(eq(schema.assets.workspaceId, ids.wsA));

  it('listAssets · rend les assets de la marque active', async () => {
    etat.session = session(ids, 'ua'); etat.iaInterdite = false;
    const l = await listAssets();
    expect(l.map((a) => a.id).sort()).toEqual([A.image, A.video].sort());
  });
  it('uploadImageAssetsAction · une ligne en plus', async () => {
    const n = (await ws()).length;
    expect(await uploadImageAssetsAction({ items: [{ name: 'neuve', dataUri: PNG }] })).toEqual({ ok: true, count: 1 });
    expect((await ws()).length).toBe(n + 1);
  });
  it('importAssetAction · une ligne en plus, à l’URL donnée', async () => {
    expect(await importAssetAction({ name: 'lien', url: 'https://exemple.invalid/clip.mp4', kind: 'video' })).toEqual({ ok: true });
    expect((await ws()).some((a) => a.url === 'https://exemple.invalid/clip.mp4')).toBe(true);
  });
  it('toggleAssetAiAction · la bascule est écrite', async () => {
    expect(await toggleAssetAiAction({ id: A.image, useForAi: false })).toEqual({ ok: true });
    expect((await ws()).find((a) => a.id === A.image)!.useForAi).toBe(false);
  });
  it('tagAssetAction · tags écrits, un crédit débité', async () => {
    etat.appelsVision = 0;
    const ledger = (await db!.select().from(schema.creditLedger)).length;
    expect(await tagAssetAction({ id: A.image })).toEqual({ ok: true, tags: ['produit', 'flacon'] });
    expect((await ws()).find((a) => a.id === A.image)!.tags).toEqual(['produit', 'flacon']);
    expect((await db!.select().from(schema.creditLedger)).length).toBe(ledger + 1);
    expect(etat.appelsVision).toBe(1);
  });
  it('tagUntaggedImagesAction · tague l’image téléversée non taguée', async () => {
    const r = await tagUntaggedImagesAction();
    expect(r.ok).toBe(true);
    expect(r.tagged).toBeGreaterThanOrEqual(1);
  });
  it('presignAssetUploadAction · rend une URL', async () => {
    const r = await presignAssetUploadAction({ filename: 'a.png', contentType: 'image/png', sizeBytes: 10 });
    expect(r.error).toBeUndefined();
    expect(r.uploadUrl).toMatch(/^https:\/\/stockage\.invalid\/put\//);
  });
  it('registerUploadedAssetAction · une ligne en plus (objet rangé chez l’espace, règle A2 de #798)', async () => {
    // L'objet déposé est relu (type, taille) avant l'écriture · le bucket sert un vrai PNG.
    vi.stubGlobal('fetch', bucketQuiSert(Buffer.from(PNG.split(',')[1]!, 'base64')));
    try {
      expect(await registerUploadedAssetAction({ name: 'f', url: `https://stockage.invalid/assets/${ids.wsA}/1-ab-f.png`, mimeType: 'image/png', sizeBytes: 10 })).toEqual({ ok: true });
    } finally { vi.unstubAllGlobals(); }
    expect((await ws()).some((a) => a.url === `https://stockage.invalid/assets/${ids.wsA}/1-ab-f.png`)).toBe(true);
  });
  it('basculerTemplateAction · member refusé (admin seulement), admin Core range le template', async () => {
    expect(await basculerTemplateAction({ id: A.image, on: true })).toEqual({ error: 'Seule l’agence (admin) gère les templates.' });
    etat.session = session(ids, 'ua', { role: 'admin' });
    expect(await basculerTemplateAction({ id: A.image, on: true })).toEqual({ ok: true, isTemplate: true });
    expect((await ws()).find((a) => a.id === A.image)!.tags).toContain('__template__');
    expect(await basculerTemplateAction({ id: A.image, on: false })).toEqual({ ok: true, isTemplate: false });
    etat.session = session(ids, 'ua');
  });
  it('deleteAssetAction · l’asset disparaît', async () => {
    expect(await deleteAssetAction({ id: A.video })).toEqual({ ok: true });
    expect((await ws()).some((a) => a.id === A.video)).toBe(false);
  });
  it('un asset d’un AUTRE espace reste hors d’atteinte (suppression, bascule, tagging)', async () => {
    const lire = async () => (await db!.select().from(schema.assets).where(eq(schema.assets.id, A.b)))[0];
    const avant = await lire();
    await deleteAssetAction({ id: A.b });
    await toggleAssetAiAction({ id: A.b, useForAi: false });
    expect((await tagAssetAction({ id: A.b })).error).toBe('Asset introuvable.');
    expect(await lire()).toEqual(avant);
  });
});

describe('Marques suivies · followBrand / unfollowBrand', () => {
  const suivies = async () => (await db!.select().from(schema.followedBrands)).map((f) => f.name).sort();

  it('client_viewer · suivre et ne plus suivre refusés, rien d’écrit', async () => {
    etat.session = session(ids, 'uv');
    const avant = await empreinte();
    const f = await followBrand({ platform: 'meta', name: 'Intrus' });
    const u = await unfollowBrand({ platform: 'meta', name: 'Concurrent Un' });
    expect(f, 'followBrand · client_viewer · la garde Veille ne refuse pas').toEqual({ ok: false, error: expect.stringMatching(/Ton rôle ne permet pas d’utiliser la Veille/) });
    expect(u, 'unfollowBrand · client_viewer · la garde de rôle Veille ne refuse pas').toEqual({ ok: false, error: expect.stringMatching(/Ton rôle ne permet pas d’utiliser la Veille/) });
    expect(await empreinte()).toBe(avant);
  });
  it('member en Starter · suivre refusé par l’offre, rien d’écrit', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const avant = await empreinte();
    const f = await followBrand({ platform: 'meta', name: 'Intrus' });
    expect(f, 'followBrand · member Starter · la garde Veille ne refuse pas').toEqual({ ok: false, error: expect.stringMatching(/offre Core/) });
    expect(await empreinte()).toBe(avant);
  });
  it('member en Starter · ne plus suivre reste permis (dette /saved documentée, retrait sans dépense)', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    expect(await unfollowBrand({ platform: 'meta', name: 'Concurrent Deux' })).toEqual({ ok: true });
    expect(await suivies()).toEqual(['Concurrent Un']);
  });
  it('member en Core · suivre puis ne plus suivre', async () => {
    etat.session = session(ids, 'ua');
    expect(await followBrand({ platform: 'meta', name: 'Nouveau', domain: 'https://www.nouveau.example/p' })).toEqual({ ok: true });
    expect(await suivies()).toEqual(['Concurrent Un', 'Nouveau']);
    expect(await unfollowBrand({ platform: 'meta', name: 'Concurrent Un' })).toEqual({ ok: true });
    expect(await suivies()).toEqual(['Nouveau']);
  });
});

describe('Page /assets · lecture d’avant, écriture selon la feature', () => {
  // La page Spatiale se rend pour de vrai, bibliothèque comprise, et on lit son HTML.
  const rendre = async () => renderToStaticMarkup(<FournisseurSpatial value={{ utilisateur: { nom: 'A', initiales: 'A', email: 'a@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} }}>{await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })}</FournisseurSpatial>);
  /** Le bouton « Nouveau » (téléverser, importer par lien, analyser, dossiers) · fermé en lecture seule. */
  const nouveau = (html: string) => /<button class="btn pri" type="button" aria-expanded="false"( disabled="")?>.*?Nouveau<\/button>/.exec(html);

  it('client_viewer · renvoyé à l’accueil', async () => {
    etat.session = session(ids, 'uv');
    await expect(rendre()).rejects.toThrow('redirect /dashboard');
  });
  it('équipe plateforme restée client_viewer · renvoyée à l’accueil', async () => {
    etat.session = equipeLectrice();
    await expect(rendre()).rejects.toThrow('redirect /dashboard');
  });
  it('member en Starter · ses médias en lecture seule, sous un bandeau d’offre, sans aucun geste', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const html = await rendre();
    expect(html, 'page /assets · member Starter · ses médias existants ne sont plus visibles').toContain('flacon');
    expect(html, 'page /assets · member Starter · le bandeau de lecture seule n’est pas affiché').toContain('<b>Lecture seule.</b>');
    expect(html).toContain(TEXTE_REFUS_BIBLIOTHEQUE.plan);
    const b = nouveau(html);
    expect(b, 'le bouton « Nouveau » est introuvable').not.toBeNull();
    expect(b![1], 'page /assets · member Starter · « Nouveau » ouvert malgré la lecture seule').toBe(' disabled=""');
  });
  it('member en Core · ni bandeau, et les gestes sont là', async () => {
    etat.session = session(ids, 'ua');
    const html = await rendre();
    expect(html).toContain('flacon');
    expect(html, 'page /assets · member Core · bandeau de lecture seule affiché à tort').not.toContain('<b>Lecture seule.</b>');
    expect(nouveau(html)?.[1], 'page /assets · member Core · « Nouveau » fermé').toBeUndefined();
  });
});
