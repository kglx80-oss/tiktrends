import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · la SÉLECTION DE FICHIERS · sur une VRAIE base (pglite,
 * migrations du dépôt), avec les VRAIES actions groupées
 * (`affecterAssetsDossierAction`, `definirDroitsAssetsAction`,
 * `basculerAssetsIaAction`) et la VRAIE page Spatial `/assets`. On lit les
 * colonnes après le geste, l'empreinte de la table `assets` quand il est
 * refusé, et le HTML rendu · jamais la présence d'un appel.
 *
 * TOUT OU RIEN · un identifiant d'un autre espace, d'un dossier (sélection
 * mixte envoyée telle quelle) ou inconnu refuse le
 * geste entier ; borne `TAG_SELECTION_MAX` ; même garde d'écriture que les
 * gestes unitaires (lecteur client, Starter). Aucune ligne n'est supprimée.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
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
vi.mock('../lib/brands', async (orig) => ({ ...(await orig<typeof import('../lib/brands')>()), getActiveBrand: async () => null }));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/assets',
}));

import { db, schema, sql } from '@tiktrends/db';
import { inArray } from 'drizzle-orm';
import { refusSelectionFichiersTropLarge, TAG_SELECTION_MAX } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerDossierAction, supprimerDossierAction, affecterAssetsDossierAction, definirDroitsAssetsAction } from '../app/actions/bibliotheque-dossiers';
import { basculerAssetsIaAction } from '../app/actions/assets';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const A = { flacon: '', pot: '', tube: '', autre: '' };
const D = { photos: '', jete: '', autre: '' };

/** Empreinte de `assets` · lignes ET contenu (un refus n'écrit rien, aucune ligne ne disparaît). */
async function empreinte(): Promise<string> {
  const r = await db!.execute(sql.raw('select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), \',\' order by md5(x::text)), \'\')) as h from public."assets" x'));
  const [l] = (r as unknown as { rows: Array<{ n: number; h: string }> }).rows;
  return `${l!.n}|${l!.h}`;
}
const lignes = async (...xs: string[]) => {
  const r = await db!.select({ id: schema.assets.id, folderId: schema.assets.folderId, rights: schema.assets.rights, useForAi: schema.assets.useForAi })
    .from(schema.assets).where(inArray(schema.assets.id, xs));
  return xs.map((x) => r.find((l) => l.id === x)!);
};
const inserer = async (workspaceId: string, name: string, extra: Partial<typeof schema.assets.$inferInsert> = {}) => {
  const [r] = await db!.insert(schema.assets).values({ workspaceId, name, kind: 'image', source: 'upload', url: PNG, mimeType: 'image/png', ...extra }).returning({ id: schema.assets.id });
  return r!.id;
};

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const page = async () => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}>{(await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement}</FournisseurSpatial>,
);

beforeAll(async () => {
  await semer(db, schema, ids);
  etat.session = session(ids, 'ua');
  D.photos = (await creerDossierAction({ nom: 'Photos produit' })).id!;
  D.jete = (await creerDossierAction({ nom: 'Ancien shooting' })).id!;
  await supprimerDossierAction({ id: D.jete });
  etat.session = session(ids, 'ub');
  D.autre = (await creerDossierAction({ nom: 'Dossier de B' })).id!;
  A.flacon = await inserer(ids.wsA, 'flacon');
  A.pot = await inserer(ids.wsA, 'pot');
  A.tube = await inserer(ids.wsA, 'tube');
  A.autre = await inserer(ids.wsB, 'secret de B');
});

describe('les gestes groupés écrivent CHAQUE fichier de la sélection', () => {
  it('« Déplacer vers… » · trois fichiers rangés dans un dossier, puis sortis (non classés)', async () => {
    etat.session = session(ids, 'ua');
    expect(await affecterAssetsDossierAction({ ids: [A.flacon, A.pot, A.tube], folderId: D.photos })).toEqual({ ok: true, n: 3 });
    expect((await lignes(A.flacon, A.pot, A.tube)).map((l) => l.folderId)).toEqual([D.photos, D.photos, D.photos]);
    expect(await affecterAssetsDossierAction({ ids: [A.flacon, A.pot], folderId: null })).toEqual({ ok: true, n: 2 });
    expect((await lignes(A.flacon, A.pot, A.tube)).map((l) => l.folderId)).toEqual([null, null, D.photos]);
  });

  it('« Droits d’usage » · posé sur deux fichiers, puis effacé', async () => {
    etat.session = session(ids, 'ua');
    expect(await definirDroitsAssetsAction({ ids: [A.flacon, A.pot], droit: 'ugc_accord' })).toEqual({ ok: true, n: 2 });
    expect((await lignes(A.flacon, A.pot, A.tube)).map((l) => l.rights)).toEqual(['ugc_accord', 'ugc_accord', null]);
    expect(await definirDroitsAssetsAction({ ids: [A.flacon], droit: null })).toEqual({ ok: true, n: 1 });
    expect((await lignes(A.flacon, A.pot)).map((l) => l.rights)).toEqual([null, 'ugc_accord']);
  });

  it('« Servir à l’IA » · retiré de deux fichiers, puis rendu · un identifiant répété ne compte qu’une fois', async () => {
    etat.session = session(ids, 'ua');
    expect(await basculerAssetsIaAction({ ids: [A.flacon, A.tube, A.tube.toUpperCase()], useForAi: false })).toEqual({ ok: true, n: 2 });
    expect((await lignes(A.flacon, A.pot, A.tube)).map((l) => l.useForAi)).toEqual([false, true, false]);
    expect(await basculerAssetsIaAction({ ids: [A.flacon, A.tube], useForAi: true })).toEqual({ ok: true, n: 2 });
    expect((await lignes(A.flacon, A.tube)).map((l) => l.useForAi)).toEqual([true, true]);
  });
});

describe('TOUT OU RIEN · un intrus refuse le geste entier, rien n’est écrit', () => {
  const REFUS = { error: 'Un fichier de la sélection est introuvable · rien n’a été modifié.' };
  const INTRUS: Array<[string, () => string]> = [
    ['un fichier d’un AUTRE espace', () => A.autre],
    ['un DOSSIER glissé parmi les fichiers (sélection mixte envoyée telle quelle)', () => D.photos],
    ['un identifiant inconnu', () => '00000000-0000-4000-8000-000000000000'],
  ];
  const GESTES: Array<[string, (xs: string[]) => Promise<{ ok?: true; error?: string }>]> = [
    ['déplacer', (xs) => affecterAssetsDossierAction({ ids: xs, folderId: D.photos })],
    ['droits', (xs) => definirDroitsAssetsAction({ ids: xs, droit: 'banque_images' })],
    ['IA', (xs) => basculerAssetsIaAction({ ids: xs, useForAi: false })],
  ];
  for (const [quoi, intrus] of INTRUS) {
    for (const [geste, faire] of GESTES) {
      it(`${geste} · ${quoi}`, async () => {
        etat.session = session(ids, 'ua');
        const avant = await empreinte();
        expect(await faire([A.flacon, intrus(), A.pot])).toEqual(REFUS);
        expect(await empreinte(), 'un fichier valide a été écrit malgré le refus').toBe(avant);
      });
    }
  }

  it('déplacer · vers un dossier d’un autre espace ou en corbeille · refusé, rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    for (const dest of [D.autre, D.jete, '00000000-0000-4000-8000-000000000000']) {
      expect(await affecterAssetsDossierAction({ ids: [A.flacon], folderId: dest })).toEqual({ error: 'Dossier de destination introuvable.' });
    }
    expect(await empreinte()).toBe(avant);
  });

  it('liste illisible ou vide, droit inconnu, réglage IA illisible · refusés par la règle du noyau', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    expect(await affecterAssetsDossierAction({ ids: [A.flacon, 'x'], folderId: null })).toEqual({ error: 'Sélection illisible · rien n’a été modifié.' });
    expect(await definirDroitsAssetsAction({ ids: 'tout' as never, droit: null })).toEqual({ error: 'Sélection illisible · rien n’a été modifié.' });
    expect(await basculerAssetsIaAction({ ids: [], useForAi: true })).toEqual({ error: 'Aucun fichier sélectionné.' });
    expect(await definirDroitsAssetsAction({ ids: [A.flacon], droit: 'libre' as never })).toEqual({ error: 'Droit d’usage inconnu.' });
    expect(await basculerAssetsIaAction({ ids: [A.flacon], useForAi: 'non' as never })).toEqual({ error: 'Réglage IA illisible · rien n’a été modifié.' });
    expect(await empreinte()).toBe(avant);
  });
});

describe('même garde d’écriture que les gestes unitaires · rien d’écrit', () => {
  const REFUSES: Array<[string, () => SessionTest, 'role' | 'plan']> = [
    ['lecteur client (client_viewer)', () => session(ids, 'uv'), 'role'],
    ['membre en Starter', () => session(ids, 'ua', { plan: 'starter' }), 'plan'],
  ];
  for (const [qui, faire, raison] of REFUSES) {
    it(qui, async () => {
      etat.session = faire();
      const avant = await empreinte();
      expect(await affecterAssetsDossierAction({ ids: [A.flacon], folderId: D.photos })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await definirDroitsAssetsAction({ ids: [A.flacon], droit: 'photo_marque' })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await basculerAssetsIaAction({ ids: [A.flacon], useForAi: false })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await empreinte()).toBe(avant);
    });
  }
});

describe('la VRAIE page · une case sur chaque fichier de la bibliothèque', () => {
  it('membre · chaque fichier non classé porte sa case « Sélectionner … » en grille', async () => {
    etat.session = session(ids, 'ua');
    await affecterAssetsDossierAction({ ids: [A.flacon, A.pot, A.tube], folderId: null });
    const html = await page();
    const cases = [...html.matchAll(/<div class="dcard [^"]*"><button type="button" class="dchk " aria-pressed="false" aria-label="Sélectionner ([^"]+)"><span data-zone-tactile="" aria-hidden="true"><\/span><\/button><button type="button" class="dopen"/g)].map((m) => m[1]).sort();
    expect(cases).toEqual(['flacon', 'pot', 'tube']);
    expect(html, 'un fichier d’un autre espace est proposé').not.toContain('secret de B');
  });

  it('lecture seule (Starter) · aucune case, aucun geste', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const html = await page();
    expect(html).toContain('flacon');
    expect(html).not.toContain('class="dchk');
  });
});

describe(`borne · ${TAG_SELECTION_MAX} fichiers par geste`, () => {
  it(`${TAG_SELECTION_MAX} vrais fichiers passent, un de plus refuse le geste entier`, async () => {
    etat.session = session(ids, 'ua');
    const lot = await db!.insert(schema.assets)
      .values(Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => ({ workspaceId: ids.wsA, name: `lot ${i}`, kind: 'image' as const, source: 'upload' as const, url: PNG })))
      .returning({ id: schema.assets.id });
    const tous = lot.map((l) => l.id);
    const avant = await empreinte();
    expect(await basculerAssetsIaAction({ ids: tous, useForAi: false })).toEqual({ error: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) });
    expect(await affecterAssetsDossierAction({ ids: tous, folderId: D.photos })).toEqual({ error: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) });
    expect(await empreinte(), 'une liste au-delà de la borne a écrit').toBe(avant);
    expect(await basculerAssetsIaAction({ ids: tous.slice(1), useForAi: false })).toEqual({ ok: true, n: TAG_SELECTION_MAX });
    expect(new Set((await lignes(...tous.slice(1))).map((l) => l.useForAi))).toEqual(new Set([false]));
    expect((await lignes(tous[0]!))[0]!.useForAi).toBe(true);
  });
});
