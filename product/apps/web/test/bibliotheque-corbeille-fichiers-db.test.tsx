import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · la CORBEILLE DES FICHIERS · sur une VRAIE base (pglite,
 * migrations du dépôt), avec les VRAIES actions (`mettreAssetsCorbeilleAction`,
 * `restaurerAssetsAction`, `deleteAssetAction`) et les VRAIES lectures qui
 * doivent ignorer la corbeille. On lit les colonnes après le geste,
 * l'empreinte de `assets` quand il est refusé, le nombre d'appels de
 * suppression au bucket, et le RÉSULTAT de chaque lecture recensée (liste de
 * la Bibliothèque et sa page, analyse IA à l'unité et en lot, références des
 * Studios, catalogue d'un projet, sources de Jarvis, fiche de marque, Analytics).
 *
 * Mettre à la corbeille ne fait que poser `deleted_at` · AUCUN objet du bucket
 * n'est effacé. La suppression définitive n'est offerte qu'à un fichier déjà
 * dans la corbeille. TOUT OU RIEN · un identifiant d'un autre espace, inconnu
 * ou dans le mauvais état refuse le geste entier.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  suppressionsBucket: [] as string[],
  vision: 0,
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
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/assets',
}));
vi.mock('../lib/studios/bibliotheque', () => ({ listerSortiesStudiosBibliotheque: async () => [], sortieCommeAsset: (x: unknown) => x }));
vi.mock('../lib/creations-historiques', () => ({ listerCreationsHistoriques: async () => [], creationCommeAsset: (x: unknown) => x }));
vi.mock('../app/actions/adsmap-attribution', () => ({ attributionViewAction: async () => ({}), creativeTrendAction: async () => ({}) }));
// Aucune dépense réelle · le client IA est factice, la vision compte ses appels.
vi.mock('../lib/spend-guard', async (o) => ({ ...(await o<typeof import('../lib/spend-guard')>()), guardedAnthropic: () => ({}) }));
vi.mock('@tiktrends/ai', async (o) => ({
  ...(await o<typeof import('@tiktrends/ai')>()),
  describeAssetImage: async () => { etat.vision++; return { tags: ['analyse'] }; },
}));
// Le bucket · chaque demande de suppression d'objet est NOTÉE.
vi.mock('@tiktrends/integrations', async (o) => ({
  ...(await o<typeof import('@tiktrends/integrations')>()),
  storageFromEnv: () => ({ bucket: 'b', region: 'r', endpoint: 'https://stockage.invalid', accessKeyId: 'k', secretAccessKey: 's', publicBaseUrl: 'https://stockage.invalid' }),
  deleteObjectByUrl: async (_c: unknown, url: string) => { etat.suppressionsBucket.push(url); return true; },
}));

import { db, schema, sql } from '@tiktrends/db';
import { eq, inArray } from 'drizzle-orm';
import { ETAT_DRIVE_INITIAL, REFUS_SUPPRESSION_HORS_CORBEILLE, TAG_SELECTION_MAX, refusSelectionFichiersTropLarge, vueDrive, type DonneesDrive } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerDossierAction } from '../app/actions/bibliotheque-dossiers';
import { listAssets, mettreAssetsCorbeilleAction, restaurerAssetsAction, deleteAssetAction, tagAssetAction, tagUntaggedImagesAction } from '../app/actions/assets';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import { resoudreReferencesImage } from '../lib/studios/image/references';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { semerCatalogue, projetStatique } from './l5c-outils';
import { ctxDe } from './l4a-outils';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import ReglesSpatiale from '../app/(spatial)/sp/brands/[id]/regles/page';
import MarqueSpatiale from '../app/(spatial)/sp/brands/[id]/page';
import { chargerAnalyticsSpatial } from '../app/(spatial)/sp/dashboard/analytics';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import type { Session } from '../lib/auth';

const ids = etat.ids;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const A = { flacon: '', pot: '', tube: '', autre: '', autreJete: '' };
let dossier = '';
const REFUS = { error: 'Un fichier de la sélection est introuvable · rien n’a été modifié.' };
const INCONNU = '00000000-0000-4000-8000-000000000000';

/** Empreinte de `assets` · lignes ET contenu (un refus n'écrit rien, aucune ligne ne disparaît). */
async function empreinte(): Promise<string> {
  const r = await db!.execute(sql.raw('select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), \',\' order by md5(x::text)), \'\')) as h from public."assets" x'));
  const [l] = (r as unknown as { rows: Array<{ n: number; h: string }> }).rows;
  return `${l!.n}|${l!.h}`;
}
const lignes = async (...xs: string[]) => {
  const r = await db!.select({ id: schema.assets.id, deletedAt: schema.assets.deletedAt, url: schema.assets.url, folderId: schema.assets.folderId, rights: schema.assets.rights, useForAi: schema.assets.useForAi })
    .from(schema.assets).where(inArray(schema.assets.id, xs));
  return xs.map((x) => r.find((l) => l.id === x));
};
const jete = async (...xs: string[]) => (await lignes(...xs)).map((l) => l?.deletedAt != null);
/** Un fichier téléversé dans le bucket de l'espace · sa suppression définitive demanderait l'effacement de l'objet. */
const inserer = async (workspaceId: string, name: string, extra: Partial<typeof schema.assets.$inferInsert> = {}) => {
  const [r] = await db!.insert(schema.assets).values({
    workspaceId, brandId: workspaceId === ids.wsA ? ids.brandA1 : ids.brandB1, name, kind: 'image', source: 'upload',
    url: `https://stockage.invalid/assets/${workspaceId}/1-ab-${name.replace(/\W/g, '')}.png`, mimeType: 'image/png', ...extra,
  }).returning({ id: schema.assets.id });
  return r!.id;
};

beforeAll(async () => {
  await semer(db, schema, ids);
  await db!.update(schema.workspaces).set({ creditsBalance: 100 });
  etat.session = session(ids, 'ua');
  dossier = (await creerDossierAction({ nom: 'Photos produit', brandId: ids.brandA1 })).id!;
  A.flacon = await inserer(ids.wsA, 'flacon', { folderId: dossier, rights: 'photo_marque', useForAi: false });
  A.pot = await inserer(ids.wsA, 'pot');
  A.tube = await inserer(ids.wsA, 'tube');
  A.autre = await inserer(ids.wsB, 'secret de B');
  A.autreJete = await inserer(ids.wsB, 'jete de B', { deletedAt: new Date() });
});

describe('mettre à la corbeille · restaurer · à l’unité et groupé', () => {
  it('à l’unité · `deleted_at` posé, la ligne et son objet restent, AUCUNE suppression au bucket', async () => {
    etat.session = session(ids, 'ua'); etat.suppressionsBucket = [];
    const [avant] = await lignes(A.flacon);
    expect(await mettreAssetsCorbeilleAction({ ids: [A.flacon] })).toEqual({ ok: true, n: 1 });
    const [apres] = await lignes(A.flacon);
    expect(apres!.deletedAt, 'la corbeille n’a pas été posée').toBeInstanceOf(Date);
    expect({ ...apres, deletedAt: null }, 'la mise à la corbeille a changé autre chose que `deleted_at`').toEqual(avant);
    expect(etat.suppressionsBucket, 'un objet du bucket a été effacé par la mise à la corbeille').toEqual([]);
  });

  it('à l’unité · restaurer · le fichier revient tel quel (dossier, droits, IA)', async () => {
    etat.session = session(ids, 'ua');
    expect(await restaurerAssetsAction({ ids: [A.flacon] })).toEqual({ ok: true, n: 1 });
    expect(await lignes(A.flacon)).toEqual([expect.objectContaining({ deletedAt: null, folderId: dossier, rights: 'photo_marque', useForAi: false })]);
  });

  it('groupé · trois fichiers à la corbeille en une action, puis restaurés · aucun appel au bucket', async () => {
    etat.session = session(ids, 'ua'); etat.suppressionsBucket = [];
    expect(await mettreAssetsCorbeilleAction({ ids: [A.flacon, A.pot, A.tube, A.tube.toUpperCase()] })).toEqual({ ok: true, n: 3 });
    expect(await jete(A.flacon, A.pot, A.tube)).toEqual([true, true, true]);
    expect(await restaurerAssetsAction({ ids: [A.pot, A.tube] })).toEqual({ ok: true, n: 2 });
    expect(await jete(A.flacon, A.pot, A.tube)).toEqual([true, false, false]);
    expect(await restaurerAssetsAction({ ids: [A.flacon] })).toEqual({ ok: true, n: 1 });
    expect(etat.suppressionsBucket).toEqual([]);
  });
});

describe('TOUT OU RIEN · un intrus refuse le geste entier, rien n’est écrit', () => {
  const cas: Array<[string, () => Promise<unknown>]> = [
    ['corbeille · un fichier d’un AUTRE espace', () => mettreAssetsCorbeilleAction({ ids: [A.pot, A.autre] })],
    ['corbeille · un identifiant inconnu', () => mettreAssetsCorbeilleAction({ ids: [A.pot, INCONNU] })],
    ['corbeille · un DOSSIER glissé parmi les fichiers', () => mettreAssetsCorbeilleAction({ ids: [A.pot, dossier] })],
    ['restaurer · un fichier d’un AUTRE espace (dans SA corbeille)', () => restaurerAssetsAction({ ids: [A.tube, A.autreJete] })],
    ['restaurer · un fichier VIVANT (pas dans la corbeille)', () => restaurerAssetsAction({ ids: [A.tube, A.pot] })],
  ];
  beforeAll(async () => {
    etat.session = session(ids, 'ua');
    await mettreAssetsCorbeilleAction({ ids: [A.tube] });
  });
  for (const [quoi, faire] of cas) {
    it(quoi, async () => {
      etat.session = session(ids, 'ua');
      const avant = await empreinte();
      expect(await faire()).toEqual(REFUS);
      expect(await empreinte(), 'un fichier valide a été écrit malgré le refus').toBe(avant);
    });
  }
  it('corbeille · un fichier DÉJÀ dans la corbeille refuse le geste', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    expect(await mettreAssetsCorbeilleAction({ ids: [A.pot, A.tube] })).toEqual(REFUS);
    expect(await empreinte()).toBe(avant);
  });
  it('liste illisible ou vide · refusée par la règle du noyau', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    expect(await mettreAssetsCorbeilleAction({ ids: [A.pot, 'x'] })).toEqual({ error: 'Sélection illisible · rien n’a été modifié.' });
    expect(await restaurerAssetsAction({ ids: [] })).toEqual({ error: 'Aucun fichier sélectionné.' });
    expect(await empreinte()).toBe(avant);
  });
  it(`borne · ${TAG_SELECTION_MAX + 1} fichiers refusés en entier, ${TAG_SELECTION_MAX} passent`, async () => {
    etat.session = session(ids, 'ua');
    const lot = await db!.insert(schema.assets)
      .values(Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => ({ workspaceId: ids.wsA, name: `lot ${i}`, kind: 'image' as const, source: 'upload' as const, url: PNG })))
      .returning({ id: schema.assets.id });
    const tous = lot.map((l) => l.id);
    const avant = await empreinte();
    expect(await mettreAssetsCorbeilleAction({ ids: tous })).toEqual({ error: refusSelectionFichiersTropLarge(TAG_SELECTION_MAX + 1) });
    expect(await empreinte()).toBe(avant);
    expect(await mettreAssetsCorbeilleAction({ ids: tous.slice(1) })).toEqual({ ok: true, n: TAG_SELECTION_MAX });
    expect(await restaurerAssetsAction({ ids: tous.slice(1) })).toEqual({ ok: true, n: TAG_SELECTION_MAX });
    await db!.delete(schema.assets).where(inArray(schema.assets.id, tous));
  });
});

describe('même garde d’écriture que le reste de la Bibliothèque · rien d’écrit', () => {
  const REFUSES: Array<[string, () => SessionTest, 'role' | 'plan']> = [
    ['lecteur client (client_viewer)', () => session(ids, 'uv'), 'role'],
    ['membre en Starter', () => session(ids, 'ua', { plan: 'starter' }), 'plan'],
  ];
  for (const [qui, faire, raison] of REFUSES) {
    it(qui, async () => {
      etat.session = faire();
      const avant = await empreinte();
      expect(await mettreAssetsCorbeilleAction({ ids: [A.pot] })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await restaurerAssetsAction({ ids: [A.tube] })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await empreinte()).toBe(avant);
    });
  }
});

describe('suppression DÉFINITIVE · réservée à la corbeille', () => {
  it('un fichier VIVANT · refusé, la ligne reste, aucun appel au bucket', async () => {
    etat.session = session(ids, 'ua'); etat.suppressionsBucket = [];
    const avant = await empreinte();
    expect(await deleteAssetAction({ id: A.pot })).toEqual({ error: REFUS_SUPPRESSION_HORS_CORBEILLE });
    expect(await empreinte()).toBe(avant);
    expect(etat.suppressionsBucket).toEqual([]);
  });
  it('un fichier de la corbeille d’un AUTRE espace · même refus, rien touché', async () => {
    etat.session = session(ids, 'ua'); etat.suppressionsBucket = [];
    const avant = await empreinte();
    expect(await deleteAssetAction({ id: A.autreJete })).toEqual({ error: REFUS_SUPPRESSION_HORS_CORBEILLE });
    expect(await empreinte()).toBe(avant);
    expect(etat.suppressionsBucket).toEqual([]);
  });
  it('un fichier de la corbeille · la ligne disparaît et son objet est effacé du bucket (comportement d’avant)', async () => {
    etat.session = session(ids, 'ua'); etat.suppressionsBucket = [];
    const [t] = await lignes(A.tube);
    expect(t!.deletedAt).not.toBeNull();
    expect(await deleteAssetAction({ id: A.tube })).toEqual({ ok: true });
    expect(await lignes(A.tube)).toEqual([undefined]);
    expect(etat.suppressionsBucket, 'le témoin ne voit pas la suppression au bucket · la garde « aucun appel » regarderait la mauvaise chose').toEqual([t!.url]);
  });
});

describe('les LECTURES qui doivent ignorer la corbeille · leur résultat', () => {
  const L = { vivant: '', jete: '', jeteSansTag: '' };
  const brandId = () => ids.brandA1;
  beforeAll(async () => {
    etat.session = session(ids, 'ua');
    L.vivant = await inserer(ids.wsA, 'vivant-lu', { tags: ['vivant-tag'] });
    L.jete = await inserer(ids.wsA, 'jete-lu', { tags: ['jete-tag'] });
    L.jeteSansTag = await inserer(ids.wsA, 'jete-sans-tag');
    expect(await mettreAssetsCorbeilleAction({ ids: [L.jete, L.jeteSansTag] })).toEqual({ ok: true, n: 2 });
  });

  it('`listAssets` · la Bibliothèque ignore la corbeille ; `corbeille: true` ne rend qu’elle', async () => {
    etat.session = session(ids, 'ua');
    const vivants = (await listAssets()).map((a) => a.id);
    expect(vivants).toContain(L.vivant);
    expect(vivants, 'un fichier de la corbeille est listé dans la Bibliothèque').not.toContain(L.jete);
    expect(vivants).not.toContain(L.jeteSansTag);
    expect((await listAssets({ corbeille: true })).map((a) => a.id).sort()).toEqual([L.jete, L.jeteSansTag].sort());
  });

  it('la page Bibliothèque · rendu HTML sans le fichier jeté ; ses données le rangent dans la seule section « Corbeille »', async () => {
    etat.session = session(ids, 'ua');
    const el = (await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement<{ donnees: DonneesDrive }>;
    const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
    const html = renderToStaticMarkup(<FournisseurSpatial value={CTX}>{el}</FournisseurSpatial>);
    expect(html).toContain('vivant-lu');
    expect(html, 'un fichier de la corbeille est rendu dans le drive').not.toContain('jete-lu');
    const d = el.props.donnees;
    const nomsVue = (section: 'drive' | 'recents' | 'corbeille', recherche = '') => vueDrive(d, { ...ETAT_DRIVE_INITIAL, section, recherche }).fichiers.map((f) => f.nom);
    expect(nomsVue('corbeille').sort()).toEqual(['jete-lu', 'jete-sans-tag']);
    expect(nomsVue('recents')).not.toContain('jete-lu');
    expect(nomsVue('drive', 'jete'), 'la recherche trouve un fichier de la corbeille').toEqual([]);
  });

  it('analyse IA à l’unité · un fichier jeté est « introuvable », aucun crédit, aucune vision', async () => {
    etat.session = session(ids, 'ua'); etat.vision = 0;
    const ledger = (await db!.select().from(schema.creditLedger)).length;
    expect(await tagAssetAction({ id: L.jete })).toEqual({ error: 'Asset introuvable.' });
    expect([etat.vision, (await db!.select().from(schema.creditLedger)).length]).toEqual([0, ledger]);
  });

  it('analyse IA en lot · la corbeille n’est jamais analysée', async () => {
    etat.session = session(ids, 'ua'); etat.vision = 0;
    const r = await tagUntaggedImagesAction();
    expect(r.ok).toBe(true);
    const [l] = await db!.select({ tags: schema.assets.tags }).from(schema.assets).where(eq(schema.assets.id, L.jeteSansTag));
    expect(l!.tags, 'un fichier de la corbeille a été analysé (crédit dépensé)').toBeNull();
    expect(etat.vision).toBe(r.tagged);
  });

  it('références des Studios (`bib_`) · un fichier jeté est ABSENT à la génération ; le vivant est présent', async () => {
    const m = await resoudreReferencesImage(db as never, { workspaceId: ids.wsA, brandId: brandId() }, [`bib_${L.jete}`, `bib_${L.vivant}`]);
    expect([m.get(`bib_${L.jete}`)!.etat, m.get(`bib_${L.vivant}`)!.etat]).toEqual(['absent', 'present']);
  });

  it('catalogue d’un projet Studios · le fichier jeté n’est pas associable', async () => {
    const cat = await semerCatalogue(db as never, ids);
    const p = await projetStatique(db as never, ids, cat);
    const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), p.projectId, { veilleOuverte: true, maintenant: new Date() });
    if (!c.ok) throw new Error(c.code);
    expect(c.catalogue.fichiers.has(`bib_${L.vivant}`)).toBe(true);
    expect(c.catalogue.fichiers.has(`bib_${L.jete}`), 'un fichier de la corbeille est proposé aux Studios').toBe(false);
  });

  const compteMarque = async (avecCorbeille: boolean) => {
    const r = await db!.select({ id: schema.assets.id, deletedAt: schema.assets.deletedAt }).from(schema.assets)
      .where(eq(schema.assets.brandId, brandId()));
    return r.filter((x) => avecCorbeille || x.deletedAt == null).length;
  };

  it('Jarvis · la source « Bibliothèque » de la marque ne compte pas la corbeille', async () => {
    etat.session = session(ids, 'ua', { role: 'admin' });
    const el = (await ReglesSpatiale({ params: Promise.resolve({ id: brandId() }) })) as ReactElement<{ sources: { lignes: Array<{ libelle: string }> } }>;
    const n = await compteMarque(false);
    expect(n).toBeLessThan(await compteMarque(true));
    expect(el.props.sources.lignes.find((x) => x.libelle.startsWith('Bibliothèque'))!.libelle).toBe(`Bibliothèque · ${n} médias`);
  });

  it('fiche de marque · les vignettes de la bibliothèque ignorent la corbeille', async () => {
    etat.session = session(ids, 'ua', { role: 'admin' });
    const el = (await MarqueSpatiale({ params: Promise.resolve({ id: brandId() }), searchParams: Promise.resolve({}) })) as ReactElement<{ assets: Array<{ id: string }> }>;
    const vus = el.props.assets.map((a) => a.id);
    expect(vus).toContain(L.vivant);
    expect(vus, 'une vignette de la corbeille est montrée sur la fiche').not.toContain(L.jete);
  });

  it('Analytics · la diversité créative ne lit pas les tags de la corbeille', async () => {
    etat.session = session(ids, 'ua', { role: 'admin' });
    const r = await chargerAnalyticsSpatial(etat.session as unknown as Session, { vue: 'analytics' });
    const tags = ('diversite' in r && r.diversite ? r.diversite.tags : []).map((t) => t.tag);
    expect(tags).toContain('vivant-tag');
    expect(tags, 'un tag d’un fichier de la corbeille entre dans la diversité').not.toContain('jete-tag');
  });
});
