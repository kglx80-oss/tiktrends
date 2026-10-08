import { describe, it, expect, vi, beforeAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';

/**
 * Lot F-D · routage `vision_analysis` de bout en bout, sur l'adaptateur RÉEL
 * (`adaptateurAnthropicGarde` → `guardedAnthropic`, barrière de dépense
 * inchangée) dont seul le client HTTP est remplacé par un ESPION : on lit le
 * payload Messages exactement tel qu'il partirait. Vraie base (pglite), vrai
 * registre, vrais médias `studio_assets` lus dans la portée par le serveur.
 */

const h = vi.hoisted(() => ({ recus: [] as Array<Record<string, any>> }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/ai')>();
  return {
    ...actual,
    anthropicFromEnv: () => ({
      messages: {
        create: async (params: Record<string, any>) => {
          h.recus.push(params);
          const sortie = { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { verdict: 'requires_review', issues: [], unverifiable: ['étiquette'], summary: 'À revoir' } };
          return { content: [{ type: 'text', text: JSON.stringify(sortie) }], usage: { input_tokens: 2400, output_tokens: 60 } };
        },
      },
    }),
  };
});

import { db, schema, eq } from '@tiktrends/db';
import { imageVide, versionDepuisEmpreinte, planifierPiecesVision } from '@tiktrends/core';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { executerTache, resolveurMediasStudio } from '../lib/studios/prompts/resolveur';
import { adaptateurAnthropicGarde, PiecesInvalides } from '../lib/studios/prompts/adaptateur';
import { encoder } from '../lib/studios/benchmark/jeu-synthetique';
import { adaptateurSimuleBenchmark } from '../lib/studios/benchmark/campagne';
import { publierRegistreDeTest } from './l2-outils';

const W = randomUUID(); const B = randomUUID(); const B2 = randomUUID(); const W2 = randomUUID(); const B3 = randomUUID();
const stockage = new Map<string, Uint8Array>();
const lecteur = { async lire(m: { storageKey: string }) { return stockage.get(m.storageKey) ?? null; } };
const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

interface Media { id: string; octets: Uint8Array; sha: string }
async function media(ws: string, brand: string, couleur: [number, number, number, number], o: { altere?: boolean } = {}): Promise<Media> {
  const octets = new Uint8Array(await encoder(imageVide(8, 6, couleur)));
  const id = randomUUID();
  const cle = `studios/${ws}/${id}.png`;
  await db.insert(schema.studioAssets).values({ id, workspaceId: ws, brandId: brand, storageKey: cle, mime: 'image/png', bytes: octets.length, width: 8, height: 6, sha256: sha(octets), origin: 'generated', storageState: 'stored' });
  stockage.set(cle, o.altere ? new Uint8Array(await encoder(imageVide(8, 6, [1, 2, 3, 255]))) : octets);
  return { id, octets, sha: sha(octets) };
}
const lien = (m: Media, index: number) => ({ bindingId: `b_${m.id}`, assetId: `sta_${m.id}`, assetVersion: versionDepuisEmpreinte(m.sha), sha256: m.sha, role: index === 0 ? 'sortie' : 'référence', modality: 'image' as const, derivation: 'original' as const, nativeAttachmentIndex: index, coverageDescription: 'image entière' });
const ref = (m: Media) => ({ assetId: `sta_${m.id}`, assetVersion: versionDepuisEmpreinte(m.sha), sha256: m.sha, role: 'product' as const, scope: 'product' as const, allowedChanges: [], requiredComponents: ['produit'] });

async function controle(sortie: Media, reference: Media, portee = { workspaceId: W, brandId: B }) {
  return executerTache({
    templateKey: 'quality.visual', portee, acteur: { userId: null, traceId: `t_${randomUUID()}` },
    taskInputs: { outputAssetIds: [`sta_${sortie.id}`], referenceIds: [`sta_${reference.id}`], criteria: ['Le produit de référence est présent'] },
    contexte: { connaissances: false, references: [ref(reference)], mediaBindings: [lien(sortie, 0), lien(reference, 1)] },
    adaptateur: adaptateurAnthropicGarde()!, environnement: 'production', medias: resolveurMediasStudio(lecteur),
  });
}
const depenses = async () => db.select().from(schema.aiSpend).where(eq(schema.aiSpend.action, 'studio-prompt:quality.visual'));

let sortie: Media; let reference: Media;
beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'cle-factice-de-test-sans-reseau';
  process.env.AI_SPEND_CAP_USD = '10';
  for (const w of [W, W2]) await db.insert(schema.workspaces).values({ id: w, name: 'Espace', plan: 'business' }).onConflictDoNothing();
  await db.insert(schema.brands).values([{ id: B, workspaceId: W, name: 'Marque A' }, { id: B2, workspaceId: W, name: 'Marque B' }, { id: B3, workspaceId: W2, name: 'Autre espace' }]);
  await publierRegistreDeTest(depot);
  sortie = await media(W, B, [200, 40, 40, 255]);
  reference = await media(W, B, [40, 40, 200, 255]);
}, 60_000);

describe('vision · payload Messages reçu par le client espion', () => {
  it('les deux images partent en blocs image NATIFS, dans l’ordre des index, avant le texte compilé', async () => {
    h.recus.length = 0;
    const r = await controle(sortie, reference);
    expect(r).toMatchObject({ ok: true });
    expect(h.recus).toHaveLength(1);
    const p = h.recus[0]!;
    expect(p.model).toBe('claude-sonnet-5');
    expect(p.messages).toHaveLength(1);
    const contenu = p.messages[0].content as Array<Record<string, any>>;
    expect(contenu.map((b) => b.type)).toEqual(['image', 'image', 'text']);
    expect(contenu[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(sortie.octets).toString('base64') } });
    expect(contenu[1]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: Buffer.from(reference.octets).toString('base64') } });
    expect(contenu[2]!.text).toContain(`sta_${sortie.id}`);
    // Aucune adresse ne part : ni clé de stockage, ni URL.
    expect(JSON.stringify(p)).not.toMatch(/studios\/|https?:\/\//);
  });

  it('la trace relie chaque liaison à son index natif et à l’empreinte des octets lus ; la barrière a écrit la dépense', async () => {
    if (!(await controle(sortie, reference)).ok) throw new Error('appel');
    const run = (await db.select().from(schema.studioPromptRuns)).filter((x) => x.templateKey === 'quality.visual' && x.status === 'succeeded').at(-1)!;
    expect((run.config as { mediaBindings: Array<Record<string, unknown>> }).mediaBindings.map((m) => [m.bindingId, m.nativeAttachmentIndex, m.sha256, m.mime])).toEqual([
      [`b_${sortie.id}`, 0, sortie.sha, 'image/png'], [`b_${reference.id}`, 1, reference.sha, 'image/png'],
    ]);
    const d = await depenses();
    expect(d.length).toBe(2);
    expect(d.every((x) => x.workspaceId === W && x.provider === 'anthropic' && Number(x.actualUsd) > 0)).toBe(true);
  });
});

describe('vision · un média hors portée ou altéré bloque AVANT l’appel, 0 $', () => {
  it('autre marque du même espace, autre espace, identifiant non studio, octets altérés', async () => {
    const autreMarque = await media(W, B2, [10, 200, 10, 255]);
    const autreEspace = await media(W2, B3, [10, 200, 10, 255]);
    const altere = await media(W, B, [9, 9, 9, 255], { altere: true });
    h.recus.length = 0;
    const avant = (await depenses()).length;
    const codes: string[] = [];
    for (const m of [autreMarque, autreEspace, altere]) {
      const r = await controle(m, reference);
      codes.push(r.ok ? 'ok' : `${r.statut}:${r.code}`);
    }
    expect(codes).toEqual(['blocked:MEDIA_NON_RESOLU', 'blocked:MEDIA_NON_RESOLU', 'blocked:MEDIA_NON_RESOLU']);
    const lus = await resolveurMediasStudio(lecteur)({ workspaceId: W, brandId: B }, [`sta_${autreMarque.id}`, `sta_${autreEspace.id}`, `sta_${altere.id}`, 'pph_0123', 'https://evil.test/a.png']);
    expect([...lus.values()].map((x) => (x.ok ? 'ok' : x.motif))).toEqual(['hors_portee', 'hors_portee', 'illisible', 'absent', 'absent']);
    expect(h.recus).toEqual([]);
    expect((await depenses()).length).toBe(avant);
  });

  it('l’adaptateur réel revérifie le contrat : une pièce altérée est refusée avant tout client, aucune dépense', async () => {
    const plan = planifierPiecesVision([lien(sortie, 0)], new Map([[`sta_${sortie.id}`, { ok: true, assetId: `sta_${sortie.id}`, assetVersion: versionDepuisEmpreinte(sortie.sha), octets: sortie.octets }]]));
    if (!plan.ok) throw new Error('plan');
    const altere = plan.pieces[0]!.octets.slice(); altere[30] = (altere[30] ?? 0) ^ 1;
    const avant = (await db.select().from(schema.aiSpend)).length;
    h.recus.length = 0;
    await expect(adaptateurAnthropicGarde()!.appeler({ profil: 'vision_analysis', messages: [{ role: 'user', nature: 'donnees_utilisateur', contenu: 'x' }], maxJetonsSortie: 10, workspaceId: W, action: 'fd:altere', pieces: [{ ...plan.pieces[0]!, octets: altere }] }))
      .rejects.toBeInstanceOf(PiecesInvalides);
    await expect(adaptateurAnthropicGarde()!.appeler({ profil: 'reasoning_structured', messages: [{ role: 'user', nature: 'donnees_utilisateur', contenu: 'x' }], maxJetonsSortie: 10, workspaceId: W, action: 'fd:hors-vision', pieces: plan.pieces }))
      .rejects.toBeInstanceOf(PiecesInvalides);
    expect(h.recus).toEqual([]);
    expect((await db.select().from(schema.aiSpend)).length).toBe(avant);
  });
});

describe('le simulé suit le même contrat que le réel', () => {
  it('routage vision identique, pièce altérée ou hors vision refusée par l’adaptateur simulé du benchmark', async () => {
    const sim = adaptateurSimuleBenchmark(() => null);
    expect(['reasoning_structured', 'vision_analysis', 'image_generation'].map((p) => sim.modelePour(p) !== null)).toEqual([true, true, false]);
    expect(['reasoning_structured', 'vision_analysis', 'image_generation'].map((p) => adaptateurAnthropicGarde()!.modelePour(p) !== null)).toEqual([true, true, false]);
    const plan = planifierPiecesVision([lien(sortie, 0)], new Map([[`sta_${sortie.id}`, { ok: true, assetId: `sta_${sortie.id}`, assetVersion: versionDepuisEmpreinte(sortie.sha), octets: sortie.octets }]]));
    if (!plan.ok) throw new Error('plan');
    const altere = plan.pieces[0]!.octets.slice(); altere[30] = (altere[30] ?? 0) ^ 1;
    const appel = { messages: [], maxJetonsSortie: 10, workspaceId: W, action: 'fd:sim' };
    await expect(sim.appeler({ ...appel, profil: 'vision_analysis', pieces: [{ ...plan.pieces[0]!, octets: altere }] })).rejects.toBeInstanceOf(PiecesInvalides);
    await expect(sim.appeler({ ...appel, profil: 'reasoning_structured', pieces: plan.pieces })).rejects.toBeInstanceOf(PiecesInvalides);
  });
});
