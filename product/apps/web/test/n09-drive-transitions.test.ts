import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * CDC v8 · N09 · RECETTE EXÉCUTABLE des transitions Drive, sur une vraie base
 * (pglite) · les gardes existantes lisaient le TEXTE SOURCE de `drive.ts` ; ici
 * on exécute l'action RÉELLE (`syncDriveNowAction`, `getDriveState`) et on lit le
 * RÉSULTAT persisté, exactement ce qu'un rechargement d'écran relit.
 *
 * Seul le franchissement vers le vrai Drive Google (`syncDriveAssets`) est
 * simulé · on ne teste pas l'API de Google mais NOTRE logique de synchro, de
 * persistance du bilan et de rattachement à la marque. Le va-et-vient réel avec
 * un dossier Drive isolé reste, lui, à recetter à la main (aucun Drive de prod
 * n'est touché ici).
 *
 * Sous-cas couverts · jamais synchronisé · dossier vide · fichiers ignorés ·
 * succès (fraîcheur + bilan) · échec qui CONSERVE le dernier succès · rattachement
 * à la marque active (isolation).
 */

const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsId: randomUUID(), userId: randomUUID(), brandA: randomUUID(), brandB: randomUUID() };
});

// L'état pilotable · la marque active du moment, et le comportement simulé du
// connecteur Drive pour l'appel courant.
const scene = vi.hoisted(() => ({
  active: '' as string,
  sync: { found: 0, added: [] as Array<Record<string, unknown>>, skipped: 0, errors: 0, jette: false },
}));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.userId, email: 'admin@test.local', name: 'Admin' },
    workspaceId: ids.wsId, workspaceName: 'Agence', role: 'admin', plan: 'business',
  }),
}));

// La marque active suit `scene.active` · c'est le pivot du rattachement.
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => {
    const id = scene.active;
    return id ? { id, name: id === ids.brandA ? 'Klorea' : 'Neva', workspaceId: ids.wsId } : null;
  },
}));

// Le secret déchiffré · on ne teste pas le chiffrement ici · un jeton non vide suffit.
vi.mock('../lib/secrets', () => ({ decryptSecret: (v: unknown) => (v ? 'refresh-token' : null) }));

// Le connecteur Drive · simulé au RÉSULTAT · `syncDriveAssets` insère les assets
// « ajoutés » via le callback réel (donc sous la marque active) puis rend le bilan.
vi.mock('@tiktrends/integrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/integrations')>();
  return {
    ...actual,
    googleConfigured: () => true,
    drivePickerConfigured: () => true,
    storageFromEnv: () => null,
    googleAccessToken: async () => 'access-token',
    driveDownload: async () => new Uint8Array(),
    putObject: async () => 'https://bucket/x',
    storeDriveThumb: async () => undefined,
    syncDriveAssets: async (cb: { insertAsset: (a: Record<string, unknown>) => Promise<void> }) => {
      if (scene.sync.jette) throw new Error('Drive injoignable');
      for (const a of scene.sync.added) await cb.insertAsset(a);
      return { found: scene.sync.found, added: scene.sync.added.length, skipped: scene.sync.skipped, errors: scene.sync.errors };
    },
  };
});

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { etatSyncDrive, derniereTentativeDriveEnEchec } from '@tiktrends/core';
import { getDriveState, syncDriveNowAction } from '../app/actions/drive';

const asset = (externalId: string): Record<string, unknown> => ({
  name: `img-${externalId}.png`, kind: 'image', source: 'drive',
  url: `https://drive.google.com/file/d/${externalId}/view`, externalId, mimeType: 'image/png',
});

async function assetsDrive(brandId: string): Promise<number> {
  const rows = await db!.select().from(schema.assets)
    .where(eq(schema.assets.brandId, brandId));
  return rows.filter((r) => (r as { source?: string }).source === 'drive').length;
}

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.userId, email: 'admin@test.local', name: 'Admin' });
  await db!.insert(schema.workspaces).values({ id: ids.wsId, name: 'Agence' });
  // Deux marques · A a un dossier Drive branché, B non · le rattachement se prouve.
  await db!.insert(schema.brands).values({ id: ids.brandA, workspaceId: ids.wsId, name: 'Klorea', driveRefreshToken: 'enc', driveFolderId: 'folder-A' });
  await db!.insert(schema.brands).values({ id: ids.brandB, workspaceId: ids.wsId, name: 'Neva' });
  scene.active = ids.brandA;
});

describe('N09 · transitions Drive, sur vraie base', () => {
  it('1 · jamais synchronisé · dossier branché mais aucune synchro', async () => {
    const st = await getDriveState();
    expect(st.connected, 'le Drive est branché').toBe(true);
    expect(st.folderId).toBe('folder-A');
    expect(st.syncedAt, 'aucun succès encore').toBeNull();
    expect(st.dernier, 'aucune tentative encore').toBeNull();
    // La décision d'état, lue comme l'écran la lit.
    expect(etatSyncDrive({ folderId: st.folderId, syncedAt: st.syncedAt })).toBe('jamais_synchronise');
  });

  it('2 · dossier vide · succès honnête « 0 trouvé », sans faux import', async () => {
    scene.sync = { found: 0, added: [], skipped: 0, errors: 0, jette: false };
    const r = await syncDriveNowAction();
    expect(r.error).toBeUndefined();
    expect(r.found).toBe(0);
    expect(r.added).toBe(0);
    const st = await getDriveState();
    expect(st.syncedAt, 'la fraîcheur est posée même à vide').not.toBeNull();
    expect(st.dernier?.ok).toBe(true);
    expect(st.dernier?.found).toBe(0);
  });

  it('3 · fichiers ignorés · le bilan compte importés ET ignorés', async () => {
    scene.sync = { found: 3, added: [asset('file1')], skipped: 2, errors: 0, jette: false };
    const r = await syncDriveNowAction();
    expect(r.error).toBeUndefined();
    expect(r.added).toBe(1);
    expect(r.skipped, 'les fichiers non supportés sont comptés « ignorés »').toBe(2);
    const st = await getDriveState();
    expect(st.dernier?.skipped).toBe(2);
    expect(await assetsDrive(ids.brandA), 'l’asset importé est rattaché à la marque active').toBe(1);
  });

  it('4 · échec puis rechargement · le dernier SUCCÈS est conservé, l’échec est marqué', async () => {
    const avant = await getDriveState();
    const succesConserve = avant.syncedAt;
    expect(succesConserve, 'un succès a bien eu lieu avant').not.toBeNull();

    scene.sync = { found: 0, added: [], skipped: 0, errors: 0, jette: true };
    const r = await syncDriveNowAction();
    expect(r.error, 'la synchro échoue').toBeTruthy();

    // Rechargement · l'écran relit l'état.
    const apres = await getDriveState();
    expect(apres.syncedAt, 'le dernier succès n’est PAS écrasé par l’échec').toBe(succesConserve);
    expect(apres.dernier?.ok, 'la dernière tentative est un échec').toBe(false);
    // La décision affichée · « dernière tentative en échec » malgré un succès conservé.
    expect(derniereTentativeDriveEnEchec({ syncedAt: apres.syncedAt, dernier: apres.dernier })).toBe(true);
  });

  it('5 · rattachement · une autre marque ne voit ni l’état ni les assets de la première', async () => {
    scene.active = ids.brandB;
    const st = await getDriveState();
    expect(st.folderId, 'Neva n’a pas de dossier branché').toBeNull();
    expect(st.syncedAt).toBeNull();
    expect(await assetsDrive(ids.brandB), 'les assets Drive de Klorea ne fuient pas chez Neva').toBe(0);
    expect(await assetsDrive(ids.brandA), 'ils restent chez Klorea').toBe(1);
    scene.active = ids.brandA;
  });
});
