import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · RENOMMER et DÉPLACER un dossier · sur une VRAIE base (pglite,
 * migrations du dépôt), avec les VRAIES actions (`renommerDossierAction`,
 * `deplacerDossierAction`) et la VRAIE page Spatial `/assets`. On relit la
 * ligne `library_folders` après le geste, l'empreinte de la table quand le
 * geste est refusé, et le HTML de la page · jamais la présence d'un appel.
 *
 * Renommer · le nom relu (rogné) ; un nom vide, trop long ou à caractère de
 * contrôle refusé par la règle de la création ; un dossier système, en
 * corbeille, d'un autre espace ou virtuel refusé ; rien d'écrit.
 * Déplacer · le parent relu, puis la page qui montre le dossier à sa nouvelle
 * place ; vers lui-même, vers un descendant, vers un dossier d'un autre
 * espace, vers un dossier en corbeille, vers un dossier système ou d'une autre
 * marque · refusés, rien d'écrit. Même garde d'écriture (lecteur client,
 * Starter) pour les deux.
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
import { eq } from 'drizzle-orm';
import { destinationsDeplacementDossier, LONGUEUR_MAX_NOM_DOSSIER, REFUS_DOSSIER, type DonneesDrive } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerDossierAction, deplacerDossierAction, renommerDossierAction, supprimerDossierAction } from '../app/actions/bibliotheque-dossiers';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const INCONNU = '00000000-0000-4000-8000-000000000000';
/** L'arbre de A · Shooting › Hiver › Rushs ; Archives ; Système (verrouillé) ; Jeté (corbeille) ; Marque (brand A2). B · Secret de B. */
const D = { shooting: '', hiver: '', rushs: '', archives: '', systeme: '', jete: '', marque: '', autre: '' };

const ligne = async (id: string) => (await db!.select().from(schema.libraryFolders).where(eq(schema.libraryFolders.id, id)))[0]!;
/** Empreinte de `library_folders` · lignes ET contenu. */
async function empreinte(): Promise<string> {
  const r = await db!.execute(sql.raw('select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), \',\' order by md5(x::text)), \'\')) as h from public."library_folders" x'));
  const [l] = (r as unknown as { rows: Array<{ n: number; h: string }> }).rows;
  return `${l!.n}|${l!.h}`;
}

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const page = async () => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}>{(await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement}</FournisseurSpatial>,
);
/** Les cartes de dossier rendues à la racine · nom et sous-titre (« 0 élément · 1 sous-dossier »). */
const cartes = (html: string) => Object.fromEntries([...html.matchAll(/<button type="button" class="fopen">[\s\S]*?<strong>([^<]*)<\/strong><small>([^<]*)<\/small>/g)].map((m) => [m[1], m[2]]));
const noms = (html: string) => Object.keys(cartes(html));

beforeAll(async () => {
  await semer(db, schema, ids);
  etat.session = session(ids, 'ua');
  const c = async (nom: string, parentId: string | null = null) => { const r = await creerDossierAction({ nom, parentId }); if (!r.ok) throw new Error(r.error); return r.id!; };
  D.shooting = await c('Shooting');
  D.hiver = await c('Hiver', D.shooting);
  D.rushs = await c('Rushs', D.hiver);
  D.archives = await c('Archives');
  D.systeme = await c('Photos système');
  await db!.update(schema.libraryFolders).set({ locked: true }).where(eq(schema.libraryFolders.id, D.systeme));
  D.jete = await c('Jeté');
  expect((await supprimerDossierAction({ id: D.jete })).ok).toBe(true);
  const m = await creerDossierAction({ nom: 'Dossier de marque', brandId: ids.brandA2 });
  D.marque = m.id!;
  etat.session = session(ids, 'ub');
  D.autre = await c('Secret de B');
});

describe('renommer · le nom relu en base', () => {
  it('un nom rogné · la ligne porte le nouveau nom, rien d’autre ne change', async () => {
    etat.session = session(ids, 'ua');
    const avant = await ligne(D.archives);
    expect(await renommerDossierAction({ id: D.archives, nom: '  Archives 2025  ' })).toEqual({ ok: true, nom: 'Archives 2025' });
    const apres = await ligne(D.archives);
    expect([apres.name, apres.parentId, apres.locked, apres.deletedAt, apres.brandId, apres.workspaceId]).toEqual(['Archives 2025', avant.parentId, false, null, avant.brandId, ids.wsA]);
    expect(apres.updatedAt.getTime()).toBeGreaterThanOrEqual(avant.updatedAt.getTime());
  });

  it('la page montre le nouveau nom · plus l’ancien', async () => {
    etat.session = session(ids, 'ua');
    const html = await page();
    expect(noms(html)).toContain('Archives 2025');
    expect(noms(html)).not.toContain('Archives');
  });

  it('le nom d’un frère est permis (la création ne l’interdit pas)', async () => {
    etat.session = session(ids, 'ua');
    expect(await renommerDossierAction({ id: D.archives, nom: 'Shooting' })).toEqual({ ok: true, nom: 'Shooting' });
    expect((await ligne(D.archives)).name).toBe('Shooting');
    expect(await renommerDossierAction({ id: D.archives, nom: 'Archives 2025' })).toEqual({ ok: true, nom: 'Archives 2025' });
  });

  it('un nom vide, trop long, à caractère de contrôle ou illisible · refusé par la règle de la création, rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    const CAS: Array<[unknown, string]> = [
      ['   ', 'Donne un nom au dossier.'],
      ['x'.repeat(LONGUEUR_MAX_NOM_DOSSIER + 1), `Nom trop long (max ${LONGUEUR_MAX_NOM_DOSSIER} caractères).`],
      ['Ligne\nsuivante', 'Le nom ne peut pas contenir de caractère de contrôle.'],
      [42, 'Nom de dossier invalide.'],
    ];
    for (const [nom, raison] of CAS) expect([nom, await renommerDossierAction({ id: D.archives, nom: nom as string })]).toEqual([nom, { error: raison }]);
    expect(await empreinte()).toBe(avant);
  });

  it('un dossier système, en corbeille, d’un autre espace, inconnu ou virtuel · refusé, rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    expect(await renommerDossierAction({ id: D.systeme, nom: 'Pirate' })).toEqual({ error: REFUS_DOSSIER.systemeRenommer });
    for (const id of [D.jete, D.autre, INCONNU, 'r:assets', 'p:projet', '']) {
      expect([id, await renommerDossierAction({ id, nom: 'Pirate' })]).toEqual([id, { error: REFUS_DOSSIER.introuvable }]);
    }
    expect(await empreinte()).toBe(avant);
    expect((await ligne(D.autre)).name).toBe('Secret de B');
  });
});

describe('déplacer · le parent relu en base', () => {
  it('« Rushs » sous « Archives 2025 » · la ligne change de parent, la page le montre à sa nouvelle place', async () => {
    etat.session = session(ids, 'ua');
    expect(await deplacerDossierAction({ id: D.rushs, parentId: D.archives })).toEqual({ ok: true });
    const r = await ligne(D.rushs);
    expect([r.parentId, r.name, r.deletedAt]).toEqual([D.archives, 'Rushs', null]);
    // La page · « Archives 2025 » porte désormais un sous-dossier, « Rushs » n'est pas à la racine.
    const html = await page();
    expect(cartes(html)['Archives 2025']).toBe('0 élément · 1 sous-dossier');
    expect(noms(html)).not.toContain('Rushs');
  });

  it('à la racine (`parentId: null`) · puis de retour sous « Hiver » (UUID en capitales accepté)', async () => {
    etat.session = session(ids, 'ua');
    expect(await deplacerDossierAction({ id: D.rushs, parentId: null })).toEqual({ ok: true });
    expect((await ligne(D.rushs)).parentId).toBeNull();
    const html = await page();
    expect([cartes(html)['Rushs'], cartes(html)['Archives 2025']]).toEqual(['0 élément', '0 élément']);
    expect(await deplacerDossierAction({ id: D.rushs.toUpperCase(), parentId: D.hiver.toUpperCase() })).toEqual({ ok: true });
    expect((await ligne(D.rushs)).parentId).toBe(D.hiver);
  });

  it('un sous-arbre entier suit son sommet · « Hiver » (avec « Rushs ») sous « Archives 2025 »', async () => {
    etat.session = session(ids, 'ua');
    expect(await deplacerDossierAction({ id: D.hiver, parentId: D.archives })).toEqual({ ok: true });
    expect([(await ligne(D.hiver)).parentId, (await ligne(D.rushs)).parentId]).toEqual([D.archives, D.hiver]);
    expect(await deplacerDossierAction({ id: D.hiver, parentId: D.shooting })).toEqual({ ok: true });
  });

  const REFUS: Array<[string, () => { id: string; parentId: string | null }, string]> = [
    ['vers lui-même', () => ({ id: D.shooting, parentId: D.shooting }), REFUS_DOSSIER.soiMeme],
    ['vers son enfant', () => ({ id: D.shooting, parentId: D.hiver }), REFUS_DOSSIER.descendant],
    ['vers son petit-enfant', () => ({ id: D.shooting, parentId: D.rushs }), REFUS_DOSSIER.descendant],
    ['vers un dossier d’un AUTRE espace', () => ({ id: D.rushs, parentId: D.autre }), REFUS_DOSSIER.destinationIntrouvable],
    ['vers un dossier EN CORBEILLE', () => ({ id: D.rushs, parentId: D.jete }), REFUS_DOSSIER.destinationIntrouvable],
    ['vers un dossier inconnu', () => ({ id: D.rushs, parentId: INCONNU }), REFUS_DOSSIER.destinationIntrouvable],
    ['vers un dossier virtuel (racine de l’écran)', () => ({ id: D.rushs, parentId: 'r:assets' }), REFUS_DOSSIER.destinationIntrouvable],
    ['vers un dossier système', () => ({ id: D.rushs, parentId: D.systeme }), REFUS_DOSSIER.destinationSysteme],
    ['vers un dossier d’une autre marque', () => ({ id: D.rushs, parentId: D.marque }), REFUS_DOSSIER.autreMarque],
    ['un dossier système', () => ({ id: D.systeme, parentId: D.archives }), REFUS_DOSSIER.systemeDeplacer],
    ['un dossier en corbeille', () => ({ id: D.jete, parentId: D.archives }), REFUS_DOSSIER.introuvable],
    ['un dossier d’un autre espace', () => ({ id: D.autre, parentId: null }), REFUS_DOSSIER.introuvable],
    ['un dossier virtuel', () => ({ id: 'p:projet', parentId: null }), REFUS_DOSSIER.introuvable],
  ];
  for (const [quoi, entree, raison] of REFUS) {
    it(`${quoi} · refusé avec sa phrase, rien d’écrit`, async () => {
      etat.session = session(ids, 'ua');
      const avant = await empreinte();
      expect(await deplacerDossierAction(entree())).toEqual({ error: raison });
      expect(await empreinte(), `${quoi} · une écriture a eu lieu malgré le refus`).toBe(avant);
    });
  }
});

describe('la page porte ce que le menu juge · la marque de chaque dossier', () => {
  it('« Déplacer vers… » ferme une destination d’une autre marque · la page la transmet (relue en base), la règle la ferme', async () => {
    etat.session = session(ids, 'ua');
    const el = (await BibliothequeSpatiale({ searchParams: Promise.resolve({}) })) as ReactElement<{ donnees: DonneesDrive }>;
    const marques = Object.fromEntries(el.props.donnees.dossiers.filter((x) => x.reel).map((x) => [x.nom, x.marque ?? null]));
    expect([marques['Dossier de marque'], marques['Shooting']]).toEqual([ids.brandA2, null]);
    const dest = destinationsDeplacementDossier(el.props.donnees, D.shooting).find((x) => x.id === D.marque);
    expect(dest?.raison).toBe(REFUS_DOSSIER.autreMarque);
  });
});

describe('garde d’écriture · rôle ou offre sans écriture, rien d’écrit', () => {
  const REFUSES: Array<[string, () => SessionTest, 'role' | 'plan']> = [
    ['lecteur client (client_viewer)', () => session(ids, 'uv'), 'role'],
    ['membre en Starter', () => session(ids, 'ua', { plan: 'starter' }), 'plan'],
  ];
  for (const [qui, faire, raison] of REFUSES) {
    it(`${qui} · renommer et déplacer refusés`, async () => {
      etat.session = faire();
      const avant = await empreinte();
      expect(await renommerDossierAction({ id: D.archives, nom: 'Pirate' })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await deplacerDossierAction({ id: D.rushs, parentId: D.archives })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await empreinte()).toBe(avant);
      expect([(await ligne(D.archives)).name, (await ligne(D.rushs)).parentId]).toEqual(['Archives 2025', D.hiver]);
    });
  }
});
