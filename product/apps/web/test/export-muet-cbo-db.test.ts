import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * EXPORT SEUL, ligne MUETTE ⇒ CBO non établi, lot non comparable.
 *
 * Le défaut · une ad jamais synchronisée (marque sans connexion Meta) prenait
 * le `cbo` booléen de la plus récente ligne d'export · `false` dès que la ligne
 * ne dit pas « Using campaign budget ». Un export SANS colonne « Ad set budget »
 * (facultative · seules la dépense et les impressions sont obligatoires)
 * donnait donc `cbo: false, budgetJour: null` · ni `cbo_inconnu`, ni contrôle
 * de budget · le lot passait « Protocole respecté · comparables » et couronnait
 * des `winner` absolus, même s'il tournait en CBO (§6.1). La règle de #1114
 * (une ligne muette ne prouve pas l'ABO) n'était appliquée que côté connexion.
 *
 * Défaut voisin · un réimport muet de la MÊME période (upsert sur
 * `(ad_id, date_debut, date_fin)`) effaçait la preuve que portait la ligne
 * remplacée · une ligne ABO plus ancienne « revivait » et rouvrait le lot en
 * CBO.
 *
 * La garde passe par le VRAI import (`applyMesuresAction`) contre une vraie
 * base (pglite) · aucun réseau, aucune dépense. Elle LIT la base · contrôle du
 * lot, verdicts, file de décisions, lignes importées.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { ws: randomUUID(), user: randomUUID(), marque: randomUUID() };
});
const JOUR = 86_400_000;
const J = (k: number) => new Date(Date.now() - k * JOUR).toISOString().slice(0, 10);

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.user, email: 'admin@test.local', name: null }, workspaceId: ids.ws, workspaceName: 'Agence', role: 'admin', plan: 'business' },
    brand: { id: ids.marque, name: 'Marque', workspaceId: ids.ws },
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_noStore: () => {} }));

import { db, schema, eq, and, inArray } from '@tiktrends/db';
import { applyMesuresAction } from '../app/actions/adsmap-mesures';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

/** Les identifiants Meta des deux ads · en chiffres (un export ne rattache qu'un identifiant Meta valide). */
const ADS = ['120200000000000901', '120200000000000902'];
const JOURS = [7, 6, 5, 4, 3, 2, 1];
const RELATIFS = { verdicts: 2, comparables: 0, winners: 0 };
const COMPARABLES = { verdicts: 2, comparables: 2, winners: 2 };
const RESUME_INCONNU = 'CBO non établi · importe un export Ads Manager avec la colonne budget de l’ensemble, ou connecte Meta · d’ici là, les verdicts de ce lot ne sont que relatifs.';
const ACTION_INCONNU = 'Importe un export Ads Manager du lot avec la colonne budget de l’ensemble, ou connecte Meta avec l’accès aux ensembles de publicités · le CBO établi, le contrôle du lot se refait.';

/**
 * Un export Ads Manager des deux ads, une ligne par jour · 50 € et 5 achats par
 * jour (CPA 10 €) · de quoi couronner un `winner` absolu si le lot se compare.
 * `budget` · la colonne « Ad set budget » (montant, « Using campaign budget »),
 * `null` · l'export n'a PAS la colonne (ni son type).
 */
const exportAds = (budget: string | null, jours: readonly number[] = JOURS, campagne = '[ADSMAP] TEST Marque B1', avecId = true) => [
  `Day,Reporting starts,Reporting ends,Campaign name,Ad set name,Ad name,${avecId ? 'Ad ID,' : ''}Ad delivery,Results,Result indicator,Reach,Impressions,Amount spent (EUR),Link clicks,Purchases,Purchases conversion value,${budget === null ? '' : 'Ad set budget,Ad set budget type,'}Clicks (all)`,
  ...ADS.flatMap((ad) => jours.map((k) => [
    J(k), J(k), J(k), campagne, `Ensemble ${ad}`, `Marque_B1_${ad}`, ...(avecId ? [ad] : []), 'Active', 5, 'purchase', 4000, 5000, '50.00', 90, 5, 195,
    ...(budget === null ? [] : [budget, 'Daily']), 120,
  ].join(','))),
].join('\n') + '\n';

const S = { lot: '', ads: [] as string[] };

async function lot() {
  const [b] = await db!.select({ pc: schema.batches.protocolCheck }).from(schema.batches).where(eq(schema.batches.id, S.lot));
  const pc = b!.pc as { violations: Array<{ code: string; message: string }>; summary: string; compliant: boolean };
  return { codes: pc.violations.map((v) => v.code), resume: pc.summary, conforme: pc.compliant, messages: pc.violations.map((v) => v.message) };
}
async function verdicts() {
  const vs = await db!.select({ computed: schema.verdicts.computed, comparable: schema.verdicts.comparable }).from(schema.verdicts).where(inArray(schema.verdicts.adId, S.ads));
  return { verdicts: vs.length, comparables: vs.filter((v) => v.comparable).length, winners: vs.filter((v) => v.computed === 'winner').length };
}
async function importer(csv: string, fichier: string) {
  const r = await applyMesuresAction(csv, [], fichier);
  expect(r.error, `import de ${fichier} refusé`).toBeUndefined();
}

beforeAll(async () => {
  await db!.insert(schema.workspaces).values({ id: ids.ws, name: 'Agence', plan: 'business' });
  await db!.insert(schema.users).values({ id: ids.user, email: 'admin@test.local' });
  // Aucune connexion Meta · les ads ne sont mesurées que par des exports.
  await db!.insert(schema.brands).values({ id: ids.marque, workspaceId: ids.ws, name: 'Marque' });
  const [p] = await db!.insert(schema.personas).values({ brandId: ids.marque, name: 'Persona' }).returning();
  const [d] = await db!.insert(schema.desires).values({ workspaceId: ids.ws, personaId: p!.id, label: 'Désir' }).returning();
  const [a] = await db!.insert(schema.angles).values({ workspaceId: ids.ws, desireId: d!.id, label: 'Angle', mechanism: 'demo' }).returning();
  const [c] = await db!.insert(schema.concepts).values({ workspaceId: ids.ws, angleId: a!.id, title: 'Concept' }).returning();
  const [b] = await db!.insert(schema.batches).values({ workspaceId: ids.ws, brandId: ids.marque, number: 1, status: 'testing', launchedAt: new Date(Date.now() - 7 * JOUR) }).returning({ id: schema.batches.id });
  S.lot = b!.id;
  for (const [i, ext] of ADS.entries()) {
    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: ids.ws, conceptId: c!.id, batchId: b!.id, variantCode: `v${i + 1}`, format: 'static', status: 'paused',
      externalIds: { ad_id: ext }, generatedName: `Marque_B1_${ext}`, launchedAt: new Date(Date.now() - 7 * JOUR),
    }).returning({ id: schema.ads.id });
    S.ads.push(ad!.id);
  }
});

describe('export seul, SANS colonne « Ad set budget » · rien n’établit le CBO', () => {
  it('le lot est « CBO non établi » · non comparable · aucun `winner` absolu', async () => {
    await importer(exportAds(null), 'export-muet.csv');
    const [l] = await db!.select({ cbo: schema.mesuresCsv.cbo, budget: schema.mesuresCsv.budgetJour }).from(schema.mesuresCsv).where(eq(schema.mesuresCsv.brandId, ids.marque)).limit(1);
    expect(l, 'témoin · la ligne importée n’est pas muette').toEqual({ cbo: false, budget: null });
    expect(await verdicts(), 'export muet · le lot a des verdicts comparables et des winners absolus (§6.1)').toEqual(RELATIFS);
    const p = await lot();
    expect(p.codes, 'export sans colonne budget · le lot passe « Protocole respecté · comparables » comme s’il était en ABO').toEqual(['cbo_inconnu']);
    expect(p.conforme).toBe(false);
    expect(p.resume, 'le résumé ne dit pas quoi faire (importer la colonne budget, ou connecter Meta)').toBe(RESUME_INCONNU);
    expect(p.messages[0], 'le détail du contrôle ne dit pas quoi faire').toContain("importe un export Ads Manager avec la colonne budget de l'ensemble, ou connecte Meta");
  });

  it('la file de décisions le dit, avec l’action qui le rétablit · pas « corrige la structure »', async () => {
    const d = await db!.select({ payload: schema.decisionItems.payload }).from(schema.decisionItems)
      .where(and(eq(schema.decisionItems.brandId, ids.marque), eq(schema.decisionItems.type, 'protocol_violation')));
    expect(d).toHaveLength(1);
    const p = d[0]!.payload as { title: string; action: string };
    expect(p.title).toBe(`Lot 1 · ${RESUME_INCONNU.slice(0, -1)} (700 € engagés).`);
    expect(p.action, 'CBO non établi · la décision ne dit pas quoi faire').toBe(ACTION_INCONNU);
  });
});

describe('un export qui DIT le budget reste établi comme avant', () => {
  it('budget d’ensemble (50 €), mêmes périodes · ABO établi · lot comparable', async () => {
    await importer(exportAds('50'), 'export-abo.csv');
    expect((await lot()).codes, 'un export qui donne le budget de l’ensemble n’établit plus l’ABO').toEqual([]);
    expect(await verdicts()).toEqual(COMPARABLES);
  });

  it('puis une ligne muette PLUS RÉCENTE d’une autre période · la plus récente ligne qui établit (l’ABO) tient', async () => {
    await importer(exportAds(null, [9]), 'export-muet-j9.csv');
    expect((await lot()).codes, 'une ligne muette plus récente efface l’ABO qu’une ligne de la même campagne établit').toEqual([]);
    expect(await verdicts()).toEqual(COMPARABLES);
  });

  it('« Using campaign budget » · CBO établi · lot relatif (cbo)', async () => {
    await importer(exportAds('Using campaign budget'), 'export-cbo.csv');
    expect((await lot()).codes).toEqual(['cbo']);
    expect(await verdicts()).toEqual(RELATIFS);
  });
});

describe('réimport MUET de la même période · la preuve remplacée tient', () => {
  it('la ligne CBO n’est pas effacée · l’ABO plus ancien (autre période) ne revit pas', async () => {
    // Une preuve d'ABO sur une AUTRE période, plus ancienne que l'export CBO qui suit.
    await importer(exportAds('50', [10]), 'export-abo-j10.csv');
    await importer(exportAds('Using campaign budget'), 'export-cbo-2.csv');
    expect((await lot()).codes, 'témoin · l’export CBO le plus récent n’établit pas le CBO').toEqual(['cbo']);
    await importer(exportAds(null), 'export-muet-2.csv');
    const ls = await db!.select({ cbo: schema.mesuresCsv.cbo, budget: schema.mesuresCsv.budgetJour, fichier: schema.mesuresCsv.fichier, spend: schema.mesuresCsv.spend })
      .from(schema.mesuresCsv).where(and(eq(schema.mesuresCsv.brandId, ids.marque), eq(schema.mesuresCsv.dateDebut, J(3))));
    expect(ls, 'le réimport muet n’a pas réécrit les mesures, ou a effacé la preuve du CBO qu’il remplace')
      .toEqual([{ cbo: true, budget: null, fichier: 'export-muet-2.csv', spend: 50 }, { cbo: true, budget: null, fichier: 'export-muet-2.csv', spend: 50 }]);
    expect((await lot()).codes, 'réimport muet · la preuve du CBO est effacée et l’ABO plus ancien revit · lot rouvert en comparable').toEqual(['cbo']);
    expect(await verdicts()).toEqual(RELATIFS);
  });

  it('un réimport qui DIT un autre budget remplace bien la preuve · ABO 50 € · lot comparable', async () => {
    await importer(exportAds('50'), 'export-abo-2.csv');
    expect((await lot()).codes).toEqual([]);
    expect(await verdicts()).toEqual(COMPARABLES);
  });

  it('un réimport muet d’une AUTRE campagne (rattaché par le nom, sans Ad ID) ne garde pas la preuve · elle était celle d’une autre campagne · CBO non établi', async () => {
    await importer(exportAds(null, JOURS, '[ADSMAP] TEST Marque B1 relance', false), 'export-muet-autre.csv');
    const ls = await db!.select({ cbo: schema.mesuresCsv.cbo, budget: schema.mesuresCsv.budgetJour, campagne: schema.mesuresCsv.campagne })
      .from(schema.mesuresCsv).where(and(eq(schema.mesuresCsv.brandId, ids.marque), eq(schema.mesuresCsv.dateDebut, J(3))));
    expect(ls, 'le budget d’ensemble d’une campagne a été gardé sous une autre campagne').toEqual([{ cbo: false, budget: null, campagne: '[ADSMAP] TEST Marque B1 relance' }, { cbo: false, budget: null, campagne: '[ADSMAP] TEST Marque B1 relance' }]);
    expect((await lot()).codes).toEqual(['cbo_inconnu']);
    expect(await verdicts()).toEqual(RELATIFS);
  });
});
