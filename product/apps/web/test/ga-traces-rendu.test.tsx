import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * G-A · onglet Exécutions de l'ADMIN « IA et Studios » (besoin F-D n° 1).
 *
 * Le manque : la trace `studio_prompt_runs.config` porte depuis F-D le marquage
 * `evaluation` (exécution d'une release staged dans une campagne de benchmark)
 * et `mediaBindings` (correspondance liaison ↔ pièce native réellement envoyée),
 * mais `CONFIG_VISIBLE` ne les laissait pas passer : en base, pas à l'écran.
 *
 * On lit le HTML de la VRAIE page serveur (pglite, migrations réelles) : les
 * deux champs y sont, et rien de ce qu'une ligne pourrait porter en plus
 * (octets, adresse, clé de stockage, clé d'API) ne traverse.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), brand: randomUUID(), user: randomUUID(), approbation: randomUUID(), asset: randomUUID() };
});
const h = vi.hoisted(() => ({ session: null as unknown }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { db, schema } from '@tiktrends/db';
import IaStudiosPage from '../app/(app)/admin/ia-studios/page';
import { expurgerRun, type LigneRun } from '../lib/studios/prompts/traces';

const EQUIPE = () => ({ user: { id: ids.user, email: 'quelquun@client.test', name: null }, workspaceId: ids.ws, workspaceName: 'Démo', plan: 'business', role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } });
const page = async (sp: Record<string, string>) => renderToStaticMarkup(await IaStudiosPage({ searchParams: Promise.resolve(sp) }));

const SHA_SORTIE = 'a1'.repeat(32);
const SHA_REF = 'b2'.repeat(32);
/** Ce qu'une ligne pourrait porter EN PLUS · aucun ne doit apparaître. */
const FUITES = {
  octets: 'iVBORw0KGgoAAAANSUhEUgFUITEOCTETS',
  url: 'https://v3.fal.media/files/fuite/sortie.png',
  cleStockage: 'studios/espace/job/fuite-cle-stockage.png',
  cleApi: 'sk-ant-api03-FUITECLEAPI',
};

/** La trace telle que F-D l'écrit (`ecrireRun`), plus des champs étrangers glissés dans les objets. */
const CONFIG = {
  releaseHash: 'e'.repeat(64),
  evaluation: { mode: 'benchmark', approbationId: ids.approbation, releaseStatut: 'staged', apiKey: FUITES.cleApi },
  mediaBindings: [
    {
      bindingId: 'sortie_F01_1', assetId: `sta_${ids.asset}`, assetVersion: 'v1', sha256: SHA_SORTIE, nativeAttachmentIndex: 0,
      mime: 'image/png', octets: 1293, largeur: 8, hauteur: 8, jetonsMax: 4784,
      data: FUITES.octets, url: FUITES.url, storageKey: FUITES.cleStockage,
    },
    {
      bindingId: 'f01-lunettes-bleues', assetId: FUITES.cleStockage, assetVersion: FUITES.url, sha256: SHA_REF, nativeAttachmentIndex: 1,
      mime: 'image/png', octets: FUITES.octets, largeur: 8, hauteur: 8, jetonsMax: 4784,
    },
  ],
  secretInterne: 'NE_PAS_MONTRER',
};

let runId = '';
beforeAll(async () => {
  await db.insert(schema.workspaces).values({ id: ids.ws, name: 'Démo', plan: 'business' });
  await db.insert(schema.users).values({ id: ids.user, email: 'quelquun@client.test' });
  await db.insert(schema.brands).values({ id: ids.brand, workspaceId: ids.ws, name: 'Neva' });
  const [r] = await db.insert(schema.studioPromptRuns).values({
    workspaceId: ids.ws, brandId: ids.brand, templateKey: 'quality.visual', compiledHash: 'c'.repeat(64), contextSnapshotHash: 'd'.repeat(64),
    model: 'claude-sonnet-5', status: 'succeeded', sourceRefs: [], config: CONFIG,
  }).returning();
  runId = r!.id;
});
beforeEach(() => { h.session = EQUIPE(); });

describe('onglet Exécutions · évaluation et pièces natives à l’écran, sans octets, adresse ni clé', () => {
  it('le détail d’une trace montre le marquage d’évaluation et la correspondance des pièces', async () => {
    const html = await page({ onglet: 'executions', run: runId });
    expect(html).toContain('Trace expurgée');
    expect(html, 'le marquage évaluation n’est pas à l’écran').toContain('Exécution d’évaluation · benchmark · release staged · approbation');
    expect(html).toContain(ids.approbation);
    expect(html, 'la correspondance des pièces n’est pas à l’écran').toContain('Pièces natives envoyées');
    expect(html).toContain('index 0');
    expect(html).toContain('sortie_F01_1');
    expect(html).toContain(`sta_${ids.asset}`);
    expect(html).toContain(SHA_SORTIE);
    expect(html).toContain('1293 octets · 8×8 · au plus 4784 jetons');
    expect(html).toContain('index 1');
    expect(html).toContain(SHA_REF);
  });

  it('rien d’étranger ne traverse · ni octets, ni adresse, ni clé de stockage, ni clé d’API', async () => {
    const html = await page({ onglet: 'executions', run: runId });
    for (const [nom, v] of Object.entries({ ...FUITES, secretInterne: 'NE_PAS_MONTRER', fuite: 'FUITE', falMedia: 'fal.media' })) {
      expect(html.includes(v), `${nom} visible dans l’onglet Exécutions`).toBe(false);
    }
  });

  it('expurgerRun · liste blanche par pièce et pour l’évaluation (valeur lue, pas seulement la clé)', () => {
    const x = expurgerRun({
      id: runId, workspaceId: ids.ws, brandId: ids.brand, projectId: null, jobId: null, templateKey: 'quality.visual', promptVersionId: null, promptReleaseId: null,
      compiledHash: 'c', contextSnapshotHash: 'd', sourceRefs: [], model: 'm', config: CONFIG, documentVersionId: null, outputHash: null, latencyMs: null,
      costUsdMicros: null, credits: null, status: 'succeeded', traceId: null, createdAt: new Date('2026-10-08T10:00:00Z'),
    } satisfies LigneRun);
    expect(x.config.evaluation).toEqual({ mode: 'benchmark', approbationId: ids.approbation, releaseStatut: 'staged' });
    expect(x.config.mediaBindings).toEqual([
      { bindingId: 'sortie_F01_1', assetId: `sta_${ids.asset}`, assetVersion: 'v1', sha256: SHA_SORTIE, nativeAttachmentIndex: 0, mime: 'image/png', octets: 1293, largeur: 8, hauteur: 8, jetonsMax: 4784 },
      { bindingId: 'f01-lunettes-bleues', assetId: '', assetVersion: '', sha256: SHA_REF, nativeAttachmentIndex: 1, mime: 'image/png', octets: null, largeur: 8, hauteur: 8, jetonsMax: 4784 },
    ]);
    expect('secretInterne' in x.config).toBe(false);
  });

  it('une trace sans évaluation ni pièce (conversation, tâche texte) · aucun des deux blocs', async () => {
    const [r] = await db.insert(schema.studioPromptRuns).values({
      workspaceId: ids.ws, brandId: ids.brand, templateKey: 'brief.build', compiledHash: 'f'.repeat(64), contextSnapshotHash: 'd'.repeat(64),
      model: 'claude-sonnet-5', status: 'succeeded', sourceRefs: [], config: { releaseHash: 'e'.repeat(64), evaluation: null, mediaBindings: [] },
    }).returning();
    const html = await page({ onglet: 'executions', run: r!.id });
    expect(html).toContain('brief.build');
    expect(html).not.toContain('Exécution d’évaluation');
    expect(html).not.toContain('Pièces natives envoyées');
  });
});
