import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * La synchro Adsmap n'écrit les mesures d'une marque que sur SES créas.
 *
 * Le défaut · `syncBrand` lisait le lien brut `ads.creative_id` et créait /
 * mettait à jour l'instance de régie (dépense, ROAS, journées) sur la créa
 * pointée, sans vérifier sa marque. Une ad de A liée (donnée incohérente) à une
 * créa de B faisait recevoir à la créa de B les mesures de A · ses résultats
 * étaient pollués sans que personne ne le voie.
 *
 * La garde lance la VRAIE synchro (`runAdsMapSyncForBrand`, puis le bouton
 * « Mesurer maintenant » · `syncAdsMapAction`) contre une vraie base (pglite) ·
 * seul Meta est simulé (journées fournies, aucun réseau). Puis elle LIT la base :
 *  - la créa de B garde exactement ses propres instances et mesures ;
 *  - le lien `ads.creative_id` de l'ad écartée est intact (pas de réparation sans mandat) ;
 *  - le TÉMOIN (ad de A liée à une créa de A) reçoit ses mesures ;
 *  - une ad sans créa reçoit toujours sa coquille DE LA MARQUE ;
 *  - le reste de la synchro de l'ad écartée suit son cours (verdict) ;
 *  - le compte rendu le dit, en français, à l'écran.
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsA: randomUUID(), wsB: randomUUID(), brandA: randomUUID(), brandB: randomUUID() };
});
/** Dépenses traçables · chaque ad de Meta a la sienne, on la retrouve (ou non) en base. */
const DEPENSE = { 'meta-0': 111, 'meta-1': 222, 'meta-2': 333 } as const;
const DEPENSE_PROPRE_B = 7;

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  const jour = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const ligne = (adId: 'meta-0' | 'meta-1' | 'meta-2', i: number) => ({
    adId, adName: `Ad ${i}`, adsetId: `as-${i}`, adsetName: null, campaignId: 'c-1', campaignName: 'Test',
    date: jour, spend: DEPENSE[adId], impressions: 5000, reach: 4000, clicks: 80, linkClicks: 60, landingViews: 40, addToCart: 4,
    purchases: 3, purchaseValue: 120, video3s: 0, thruplays: 0, videoP25: 0, videoP50: 0, videoP75: 0, videoP100: 0,
  });
  return {
    ...actual,
    decryptSecret: () => 'jeton-factice',
    metaDailySync: async () => [ligne('meta-0', 0), ligne('meta-1', 1), ligne('meta-2', 2)],
    metaAdsetsSync: async () => [],
  };
});
vi.mock('../lib/adsmap-guard', () => ({
  adsmapGuard: async () => ({
    s: { user: { id: ids.wsA, email: 'admin@test.local', name: null }, workspaceId: ids.wsA, workspaceName: 'Agence A', role: 'admin', plan: 'business' },
    brand: { id: ids.brandA, name: 'Marque A', workspaceId: ids.wsA },
  }),
}));

import { db, schema, eq, inArray, and } from '@tiktrends/db';
import { runAdsMapSyncForBrand, type AdsMapSyncReport } from '../lib/adsmap-sync';
import { syncAdsMapAction } from '../app/actions/adsmap';

const s = { creaA: '', creaB: '', adEtrangere: '', adTemoin: '', adSans: '' };

beforeAll(async () => {
  await db.insert(schema.workspaces).values([{ id: ids.wsA, name: 'Agence A', plan: 'plus' }, { id: ids.wsB, name: 'Agence B', plan: 'plus' }]);
  await db.insert(schema.brands).values([
    { id: ids.brandA, workspaceId: ids.wsA, name: 'Marque A', metaAdAccountId: 'act_a', metaToken: 'chiffre' },
    { id: ids.brandB, workspaceId: ids.wsB, name: 'Marque B' },
  ]);
  const crea = async (brandId: string, empreinte: string) =>
    (await db.insert(schema.creatives).values({ brandId, fingerprintHash: empreinte, type: 'image' }).returning({ id: schema.creatives.id }))[0]!.id;
  s.creaA = await crea(ids.brandA, 'crea-propre-a');
  s.creaB = await crea(ids.brandB, 'crea-de-b');

  // La créa de B a DÉJÀ ses propres mesures · elles doivent rester exactement les siennes.
  const [instB] = await db.insert(schema.adInstances).values({ creativeId: s.creaB, externalAdId: 'meta-b', platform: 'meta' }).returning({ id: schema.adInstances.id });
  await db.insert(schema.metricsDaily).values({ adInstanceId: instB!.id, date: '2026-10-01', spend: DEPENSE_PROPRE_B, impressions: 10 });

  const [p] = await db.insert(schema.personas).values({ brandId: ids.brandA, name: 'Persona' }).returning();
  const [d] = await db.insert(schema.desires).values({ workspaceId: ids.wsA, personaId: p!.id, label: 'Dormir' }).returning();
  const [a] = await db.insert(schema.angles).values({ workspaceId: ids.wsA, desireId: d!.id, label: 'Démo', mechanism: 'demo' }).returning();
  const [c] = await db.insert(schema.concepts).values({ workspaceId: ids.wsA, angleId: a!.id, title: 'Concept' }).returning();
  const ad = async (variantCode: string, metaId: string, creativeId: string | null) =>
    (await db.insert(schema.ads).values({
      workspaceId: ids.wsA, conceptId: c!.id, variantCode, format: 'static', status: 'paused', creativeId,
      externalIds: { ad_id: metaId }, launchedAt: new Date(Date.now() - 3 * 86_400_000),
    }).returning({ id: schema.ads.id }))[0]!.id;
  s.adEtrangere = await ad('V0', 'meta-0', s.creaB);   // ad de A liée à la créa de B · donnée incohérente
  s.adTemoin = await ad('V1', 'meta-1', s.creaA);      // témoin · ad de A liée à SA créa
  s.adSans = await ad('V2', 'meta-2', null);           // ad sans créa · la synchro crée la coquille de A
});

/** Les instances d'une créa et la dépense totale qu'elles portent. */
async function mesuresDe(creativeId: string): Promise<{ instances: string[]; depense: number; jours: number }> {
  const inst = await db.select({ id: schema.adInstances.id, ext: schema.adInstances.externalAdId }).from(schema.adInstances).where(eq(schema.adInstances.creativeId, creativeId));
  const m = inst.length ? await db.select({ spend: schema.metricsDaily.spend }).from(schema.metricsDaily).where(inArray(schema.metricsDaily.adInstanceId, inst.map((i) => i.id))) : [];
  return { instances: inst.map((i) => i.ext).sort(), depense: m.reduce((t, r) => t + Number(r.spend ?? 0), 0), jours: m.length };
}
const lienDe = async (adId: string) => (await db.select({ c: schema.ads.creativeId }).from(schema.ads).where(eq(schema.ads.id, adId)))[0]?.c ?? null;

/** Ce que la garde vérifie après CHAQUE synchro · une seconde passe ne doit pas faire mieux que la première. */
async function verifierLaBase(): Promise<void> {
  // 1 · La créa de B · rien de A.
  const b = await mesuresDe(s.creaB);
  expect(b.instances, 'la créa de la marque B a reçu les mesures d’une ad de A · la synchro doit écarter une créa d’une autre marque (`jointureCreaDeLaMarque`, `porteuseSynchro`)').toEqual(['meta-b']);
  expect({ depense: b.depense, jours: b.jours }, 'les mesures de la créa de B ont changé · la synchro de A a écrit sur la créa d’une autre marque').toEqual({ depense: DEPENSE_PROPRE_B, jours: 1 });

  // 2 · Le lien brut n'est pas réparé en douce.
  expect(await lienDe(s.adEtrangere), 'le lien `ads.creative_id` de l’ad écartée a été réécrit · modification de donnée sans mandat, le propriétaire tranche la réparation').toBe(s.creaB);
  const ailleurs = await db.select({ c: schema.adInstances.creativeId }).from(schema.adInstances).where(eq(schema.adInstances.externalAdId, 'meta-0'));
  expect(ailleurs, 'les mesures de l’ad écartée ont été écrites sur une autre créa · elle est écartée pour tout ce qui touche la créa').toEqual([]);

  // 3 · Le témoin · la borne n'écarte pas trop.
  expect(await mesuresDe(s.creaA), 'la créa de A n’a pas reçu les mesures de son ad (témoin) · la borne écarte aussi les créas de la marque').toEqual({ instances: ['meta-1'], depense: DEPENSE['meta-1'], jours: 1 });

  // 4 · L'ad sans créa reçoit toujours SA coquille, de la marque A.
  const lienSans = await lienDe(s.adSans);
  expect(lienSans, 'une ad sans créa n’a plus reçu sa coquille · la synchro ne crée plus la créa porteuse').not.toBeNull();
  const [coquille] = await db.select({ brandId: schema.creatives.brandId }).from(schema.creatives).where(eq(schema.creatives.id, lienSans!));
  expect(coquille?.brandId, 'la coquille d’une ad sans créa n’appartient pas à la marque de l’ad').toBe(ids.brandA);
  expect(await mesuresDe(lienSans!), 'l’ad sans créa n’a pas reçu ses mesures sur sa coquille').toEqual({ instances: ['meta-2'], depense: DEPENSE['meta-2'], jours: 1 });

  // 5 · Aucune autre créa n'est apparue (une réparation déguisée en créerait une).
  const creasA = await db.select({ id: schema.creatives.id }).from(schema.creatives).where(eq(schema.creatives.brandId, ids.brandA));
  expect(creasA.length, 'une créa de trop est apparue pour la marque A · l’ad écartée a reçu une coquille (lien réécrit)').toBe(2);

  // 6 · Le reste de la synchro de l'ad écartée suit son cours · son verdict, calculé sur les journées Meta.
  const v = await db.select({ adId: schema.verdicts.adId }).from(schema.verdicts).where(and(eq(schema.verdicts.workspaceId, ids.wsA), inArray(schema.verdicts.adId, [s.adEtrangere, s.adTemoin, s.adSans])));
  expect(v.map((x) => x.adId).sort(), 'le reste de la synchro de l’ad écartée (rattachement, verdict) a été coupé · seule l’écriture sur la créa est écartée').toEqual([s.adEtrangere, s.adTemoin, s.adSans].sort());
}

describe('synchro Adsmap · les mesures d’une marque ne s’écrivent que sur SES créas', () => {
  it('le semis tient · une ad de A liée à une créa de B, et le témoin', async () => {
    expect(s.adTemoin ? await lienDe(s.adTemoin) : null, 'témoin absent · sans une ad de A liée à SA créa, la garde ne prouverait rien (une synchro qui n’écrit plus rien passerait)').toBe(s.creaA);
    expect(await lienDe(s.adEtrangere), 'le semis n’a pas lié l’ad de A à la créa de B · la garde ne prouverait rien').toBe(s.creaB);
    const [b] = await db.select({ brandId: schema.creatives.brandId }).from(schema.creatives).where(eq(schema.creatives.id, s.creaB));
    expect(b?.brandId, 'la créa « étrangère » appartient à la marque A · la garde ne prouverait rien').toBe(ids.brandB);
  });

  let r: AdsMapSyncReport;
  it('la vraie synchro · la créa de B ne reçoit rien, le lien est intact, le témoin est mesuré', async () => {
    r = await runAdsMapSyncForBrand(ids.brandA);
    expect(r.adsMatched, 'la synchro n’a rattaché aucune ad · la garde ne prouverait rien').toBeGreaterThan(0);
    await verifierLaBase();
    expect(r.adsCreaEtrangere, 'le compte rendu ne compte pas l’ad liée à la créa d’une autre marque').toBe(1);
    expect(r.daysIngested, 'les journées ingérées comptent celles de l’ad écartée').toBe(2);
  });

  it('« Mesurer maintenant » · le compte rendu à l’écran le dit en français, et une seconde passe n’écrit toujours rien sur B', async () => {
    const res = await syncAdsMapAction();
    expect(res.error, 'la synchro à la demande a échoué').toBeUndefined();
    expect(res.summary ?? '', 'le compte rendu visible ne dit pas qu’une ad a été écartée').toContain('1 ad liée à la créa d’une autre marque · ses mesures ne sont pas écrites sur cette créa, et le lien reste à réparer.');
    await verifierLaBase();
  });
});
