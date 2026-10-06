import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

/**
 * Lot 19C · message 56 · `setSavedAdFolder` et `unsaveAd`, sur une VRAIE base
 * (pglite, migrations réelles). On appelle les actions et on lit la LIGNE ·
 * refus ET absence d'effet (ligne ni déplacée ni supprimée), parcours
 * autorisés inchangés.
 *
 * Matrice existante (celle de `saveAd` et `classerFormatSauvegarde`) · le
 * RÔLE de la Veille (membre au moins) et le périmètre espace + marque active.
 * Contournements reproduits avant correction (ces deux actions ne vérifiaient
 * que la session et l'espace) :
 * - un lecteur client (`client_viewer`, que `/saved` renvoie à l'accueil)
 *   supprimait et déplaçait une sauvegarde de l'espace ;
 * - depuis la marque Y, une sauvegarde de la marque X était supprimée ou
 *   déplacée.
 * Non reproduit · un autre espace (déjà borné). L'offre Starter n'est PAS
 * fermée ici · `/saved` reste utilisable en lecture et en rangement pour un
 * Starter comme aujourd'hui (rapporté, décision du pilotage).
 */
const ids = vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  return { wsA: randomUUID(), wsB: randomUUID(), marqueX: randomUUID(), marqueY: randomUUID(), user: randomUUID() };
});
const session = vi.hoisted(() => ({ plan: 'core' as string, role: 'member' as string, marque: 'Y' as 'X' | 'Y' | null }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({
  getSession: async () => ({
    user: { id: ids.user, email: 'membre@agence-a.test', name: 'Membre' },
    workspaceId: ids.wsA, workspaceName: 'Agence A', role: session.role, plan: session.plan,
  }),
}));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => session.marque === null ? null
    : session.marque === 'X' ? { id: ids.marqueX, name: 'Marque X', workspaceId: ids.wsA } : { id: ids.marqueY, name: 'Marque Y', workspaceId: ids.wsA },
}));

import { db, schema } from '@tiktrends/db';
import { setSavedAdFolder, unsaveAd } from '../app/actions/inspo';

const snap = (id: string) => ({ id, platform: 'meta', status: 'active', mediaType: 'image', advertiserName: 'A ' + id });
const sauver = (ws: string, brandId: string | null, ext: string, folder: string | null = null) =>
  db!.insert(schema.savedAds).values({ workspaceId: ws, brandId, platform: 'meta', externalId: ext, snapshot: snap(ext), folder })
    .onConflictDoUpdate({ target: [schema.savedAds.workspaceId, schema.savedAds.platform, schema.savedAds.externalId], set: { brandId, folder } });
const ligne = async (ws: string, ext: string) => (await db!.select().from(schema.savedAds)
  .where(and(eq(schema.savedAds.workspaceId, ws), eq(schema.savedAds.platform, 'meta'), eq(schema.savedAds.externalId, ext))))[0];

beforeAll(async () => {
  await db!.insert(schema.users).values({ id: ids.user, email: 'membre@agence-a.test', name: 'Membre' });
  await db!.insert(schema.workspaces).values([{ id: ids.wsA, name: 'Agence A', plan: 'core' }, { id: ids.wsB, name: 'Agence B', plan: 'core' }]);
  await db!.insert(schema.brands).values([{ id: ids.marqueX, workspaceId: ids.wsA, name: 'Marque X' }, { id: ids.marqueY, workspaceId: ids.wsA, name: 'Marque Y' }]);
});
beforeEach(async () => {
  session.plan = 'core'; session.role = 'member'; session.marque = 'Y';
  await sauver(ids.wsA, ids.marqueY, 'y-1', 'Hooks');
  await sauver(ids.wsA, ids.marqueX, 'x-1', 'Hooks');
  await sauver(ids.wsB, null, 'b-1', 'Hooks');
});

describe('lecteur client · refus, aucun effet', () => {
  it('unsaveAd ne supprime rien', async () => {
    session.role = 'client_viewer';
    const r = await unsaveAd({ platform: 'meta', externalId: 'y-1' });
    expect(await ligne(ids.wsA, 'y-1'), 'un lecteur client a supprimé une sauvegarde').toBeDefined();
    expect(r).toEqual({ ok: false, error: 'Ton rôle ne permet pas d’utiliser la Veille · demande à un administrateur de l’espace.' });
  });
  it('setSavedAdFolder ne déplace rien', async () => {
    session.role = 'client_viewer';
    const r = await setSavedAdFolder({ platform: 'meta', externalId: 'y-1', folder: 'Piraté' });
    expect((await ligne(ids.wsA, 'y-1'))!.folder, 'un lecteur client a déplacé une sauvegarde').toBe('Hooks');
    expect(r.ok).toBe(false);
  });
});

describe('autre marque de l’espace · refus, aucun effet', () => {
  it('unsaveAd depuis Y ne supprime pas la sauvegarde de X', async () => {
    const r = await unsaveAd({ platform: 'meta', externalId: 'x-1' });
    expect(await ligne(ids.wsA, 'x-1'), 'une sauvegarde d’une autre marque a été supprimée').toBeDefined();
    expect(r).toEqual({ ok: false, error: 'Annonce introuvable dans les sauvegardes de cette marque · recharge la page.' });
  });
  it('setSavedAdFolder depuis Y ne déplace pas la sauvegarde de X', async () => {
    const r = await setSavedAdFolder({ platform: 'meta', externalId: 'x-1', folder: 'Ailleurs' });
    expect((await ligne(ids.wsA, 'x-1'))!.folder, 'une sauvegarde d’une autre marque a été déplacée').toBe('Hooks');
    expect(r.ok).toBe(false);
  });
});

describe('autre espace · aucun effet (déjà borné)', () => {
  it('ni suppression ni déplacement, sans marque active', async () => {
    session.marque = null;
    // Vu de A, l'annonce n'est pas sauvegardée · retirer ne fait rien ; ranger échoue.
    await unsaveAd({ platform: 'meta', externalId: 'b-1' });
    expect((await setSavedAdFolder({ platform: 'meta', externalId: 'b-1', folder: 'X' })).ok).toBe(false);
    const b = await ligne(ids.wsB, 'b-1');
    expect(b, 'la sauvegarde d’un autre espace a été supprimée').toBeDefined();
    expect(b!.folder).toBe('Hooks');
  });
});

describe('parcours autorisés · inchangés', () => {
  it('membre, marque active · range puis retire du board, puis supprime', async () => {
    expect(await setSavedAdFolder({ platform: 'meta', externalId: 'y-1', folder: '  Nouveaux  ' })).toEqual({ ok: true });
    expect((await ligne(ids.wsA, 'y-1'))!.folder).toBe('Nouveaux');
    expect(await setSavedAdFolder({ platform: 'meta', externalId: 'y-1', folder: null })).toEqual({ ok: true });
    expect((await ligne(ids.wsA, 'y-1'))!.folder).toBeNull();
    expect(await unsaveAd({ platform: 'meta', externalId: 'y-1' })).toEqual({ ok: true });
    expect(await ligne(ids.wsA, 'y-1')).toBeUndefined();
  });
  it('sans marque active · tout l’espace, comme `/saved`', async () => {
    session.marque = null;
    expect(await setSavedAdFolder({ platform: 'meta', externalId: 'x-1', folder: 'Tous' })).toEqual({ ok: true });
    expect((await ligne(ids.wsA, 'x-1'))!.folder).toBe('Tous');
  });
  it('Starter (offre sans Veille) · inchangé ici, comme aujourd’hui (rapporté, non fermé)', async () => {
    session.plan = 'starter'; session.marque = null;
    expect(await setSavedAdFolder({ platform: 'meta', externalId: 'y-1', folder: 'Starter' })).toEqual({ ok: true });
    expect((await ligne(ids.wsA, 'y-1'))!.folder).toBe('Starter');
  });
  it('déjà retirée · oui (idempotent, comme avant)', async () => {
    await unsaveAd({ platform: 'meta', externalId: 'y-1' });
    expect(await unsaveAd({ platform: 'meta', externalId: 'y-1' })).toEqual({ ok: true });
  });
});
