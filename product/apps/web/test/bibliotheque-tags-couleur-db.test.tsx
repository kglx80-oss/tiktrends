import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Bibliothèque · TAGS DE COULEUR des dossiers · sur une VRAIE base (pglite,
 * migrations du dépôt, 0064 comprise), avec la VRAIE action
 * (`definirTagDossierAction`) et la VRAIE page Spatial `/assets`. On lit la
 * colonne `library_folders.color_tag` après le geste et le HTML rendu · jamais
 * la présence d'un appel.
 *
 * Poser, retirer · refus d'une couleur hors liste (par l'action ET par la
 * contrainte CHECK en base) · isolation entre espaces · refus d'un rôle ou
 * d'une offre sans écriture, rien d'écrit · page filtrée par `?tag=` · le geste
 * ne se dit plus « bientôt ».
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
import { analyserMigrationSql, TAGS_COULEUR } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerDossierAction, definirTagDossierAction, supprimerDossierAction } from '../app/actions/bibliotheque-dossiers';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import BibliothequeSpatiale from '../app/(spatial)/sp/assets/page';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ids = etat.ids;
const D = { photos: '', ugc: '', jete: '', autre: '' };

const tagEnBase = async (id: string) => (await db!.select({ t: schema.libraryFolders.colorTag }).from(schema.libraryFolders).where(eq(schema.libraryFolders.id, id)))[0]?.t;
/** Empreinte de `library_folders` · lignes ET contenu. */
async function empreinte(): Promise<string> {
  const r = await db!.execute(sql.raw('select count(*)::int as n, md5(coalesce(string_agg(md5(x::text), \',\' order by md5(x::text)), \'\')) as h from public."library_folders" x'));
  const [l] = (r as unknown as { rows: Array<{ n: number; h: string }> }).rows;
  return `${l!.n}|${l!.h}`;
}

const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const page = async (sp: Record<string, string> = {}) => renderToStaticMarkup(
  <FournisseurSpatial value={CTX}>{(await BibliothequeSpatiale({ searchParams: Promise.resolve(sp) })) as ReactElement}</FournisseurSpatial>,
);
/** Les cartes de dossier rendues · nom et étiquette de tag. */
const cartes = (html: string) => [...html.matchAll(/<div class="fcard [^"]*"[^>]*><button type="button" class="fopen">[\s\S]*?<strong>([^<]*)<\/strong><small>[^<]*<\/small>(?:<span class="ftag"><i><\/i>([^<]*)<\/span>)?/g)].map((m) => [m[1], m[2] ?? null]);

beforeAll(async () => {
  await semer(db, schema, ids);
  etat.session = session(ids, 'ua');
  const c = async (nom: string) => { const r = await creerDossierAction({ nom }); if (!r.ok) throw new Error(r.error); return r.id!; };
  D.photos = await c('Photos produit');
  D.ugc = await c('UGC');
  D.jete = await c('Ancien shooting');
  etat.session = session(ids, 'ub');
  D.autre = await c('Secret de B');
});

describe('la migration 0064 est additive et rejouable', () => {
  it('aucune écriture de données, aucune destruction, tout rejouable', () => {
    const a = analyserMigrationSql(readFileSync(join(process.cwd(), '../../packages/db/drizzle/0064_tags_couleur_dossiers.sql'), 'utf8'));
    expect(a.instructions.length).toBe(3);
    expect([a.ecritures, a.destructives, a.inconnues, a.nonRejouables].map((x) => x.length)).toEqual([0, 0, 0, 0]);
  });
});

describe('poser, retirer · la colonne suit le geste', () => {
  it('poser « Validé » puis le changer en « À valider » · un dossier verrouillé se tague aussi', async () => {
    etat.session = session(ids, 'ua');
    expect(await definirTagDossierAction({ id: D.photos, tag: 'vert' })).toEqual({ ok: true });
    expect(await tagEnBase(D.photos)).toBe('vert');
    expect(await definirTagDossierAction({ id: D.photos, tag: 'orange' })).toEqual({ ok: true });
    expect(await tagEnBase(D.photos)).toBe('orange');
    await db!.update(schema.libraryFolders).set({ locked: true }).where(eq(schema.libraryFolders.id, D.ugc));
    expect(await definirTagDossierAction({ id: D.ugc, tag: 'vert' })).toEqual({ ok: true });
    expect(await tagEnBase(D.ugc)).toBe('vert');
  });

  it('retirer · `null` efface le tag', async () => {
    etat.session = session(ids, 'ua');
    expect(await definirTagDossierAction({ id: D.photos, tag: null })).toEqual({ ok: true });
    expect(await tagEnBase(D.photos)).toBeNull();
    expect(await definirTagDossierAction({ id: D.photos, tag: 'vert' })).toEqual({ ok: true });
  });

  it('un dossier en corbeille ne se tague pas', async () => {
    etat.session = session(ids, 'ua');
    expect((await supprimerDossierAction({ id: D.jete })).ok).toBe(true);
    expect(await definirTagDossierAction({ id: D.jete, tag: 'rouge' })).toEqual({ error: 'Dossier introuvable.' });
    expect(await tagEnBase(D.jete)).toBeNull();
  });
});

describe('hors liste · refusé par l’action ET par la base', () => {
  it('l’action refuse une couleur inconnue, une clé absente, une valeur hexadécimale · rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    for (const tag of ['fuchsia', 'Vert', '#4ade80', undefined, 7]) {
      const r = await definirTagDossierAction({ id: D.photos, tag: tag as never });
      expect(r, String(tag)).toEqual({ error: 'Couleur inconnue · choisis un tag de la liste.' });
    }
    expect(await empreinte()).toBe(avant);
  });

  it('la contrainte CHECK refuse en base une valeur hors catalogue, accepte chaque clé du catalogue et NULL', async () => {
    await expect(db!.update(schema.libraryFolders).set({ colorTag: 'fuchsia' }).where(eq(schema.libraryFolders.id, D.autre)))
      .rejects.toThrow(/library_folders_color_tag_ck/);
    for (const t of TAGS_COULEUR) {
      await db!.update(schema.libraryFolders).set({ colorTag: t.cle }).where(eq(schema.libraryFolders.id, D.autre));
      expect(await tagEnBase(D.autre)).toBe(t.cle);
    }
    await db!.update(schema.libraryFolders).set({ colorTag: null }).where(eq(schema.libraryFolders.id, D.autre));
    expect(await tagEnBase(D.autre)).toBeNull();
  });
});

describe('isolation entre espaces', () => {
  it('un membre de A ne tague pas un dossier de B · même réponse qu’un dossier inconnu, rien d’écrit', async () => {
    etat.session = session(ids, 'ua');
    const avant = await empreinte();
    expect(await definirTagDossierAction({ id: D.autre, tag: 'rouge' })).toEqual({ error: 'Dossier introuvable.' });
    expect(await definirTagDossierAction({ id: '00000000-0000-4000-8000-000000000000', tag: 'rouge' })).toEqual({ error: 'Dossier introuvable.' });
    expect(await tagEnBase(D.autre)).toBeNull();
    expect(await empreinte()).toBe(avant);
  });
  it('la page de B ne montre ni les dossiers ni les tags de A', async () => {
    etat.session = session(ids, 'ub');
    const html = await page({ tag: 'vert' });
    expect(cartes(html)).toEqual([]);
    expect(html).not.toContain('Photos produit');
    expect(html).toContain('Aucun dossier tagué « Validé »');
    // Aucun tag dans B · l'arbre invite à en poser un, il ne dit plus « bientôt ».
    expect(html).toContain('<div class="tgl"><small class="faint">Ajoute un tag depuis un dossier.</small></div>');
    expect(html, 'le tag de couleur se dit encore « bientôt »').not.toMatch(/Tags de couleur · bientôt|pas encore disponible/);
  });
});

describe('refus d’un rôle ou d’une offre sans écriture · rien d’écrit', () => {
  const REFUSES: Array<[string, () => SessionTest, 'role' | 'plan']> = [
    ['lecteur client (client_viewer)', () => session(ids, 'uv'), 'role'],
    ['membre en Starter', () => session(ids, 'ua', { plan: 'starter' }), 'plan'],
  ];
  for (const [qui, faire, raison] of REFUSES) {
    it(qui, async () => {
      etat.session = faire();
      const avant = await empreinte();
      expect(await definirTagDossierAction({ id: D.photos, tag: 'rouge' })).toEqual({ error: TEXTE_REFUS_BIBLIOTHEQUE[raison] });
      expect(await tagEnBase(D.photos)).toBe('vert');
      expect(await empreinte()).toBe(avant);
    });
  }
  it('lecture seule (Starter) · la page montre les tags et filtre, sans proposer le geste', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const html = await page({ tag: 'vert' });
    expect(cartes(html).map(([n]) => n).sort()).toEqual(['Photos produit', 'UGC']);
    expect(html).not.toContain('class="ftb');
  });
});

describe('la VRAIE page · pastilles, puces, filtre par l’adresse', () => {
  it('sans filtre · les dossiers portent leur étiquette, les puces comptent les tags en usage, le geste est proposé', async () => {
    etat.session = session(ids, 'ua');
    const html = await page();
    expect(cartes(html)).toEqual([['Photos produit', 'Validé'], ['UGC', 'Validé']]);
    const puces = [...html.matchAll(/class="tgchip ?[^"]*"[^>]*><i><\/i>([^<]*)<span>(\d+)<\/span>/g)].map((m) => [m[1], m[2]]);
    expect(puces).toEqual([['Validé', '2']]);
    expect(html.match(/<button type="button" class="ftb has" aria-label="Tag de couleur"/g)?.length).toBe(2);
    expect(html, 'le tag de couleur se dit encore « bientôt »').not.toMatch(/Tags de couleur · bientôt|pas encore disponible/);
  });

  it('`?tag=vert` · seuls les dossiers tagués, le bandeau du filtre, la puce active', async () => {
    etat.session = session(ids, 'ua');
    await definirTagDossierAction({ id: D.ugc, tag: 'orange' });
    const html = await page({ tag: 'vert' });
    expect(cartes(html)).toEqual([['Photos produit', 'Validé']]);
    expect(html).toContain('<div class="bbanner tagb" style="--tc:#4ade80">');
    expect(html).toContain('<b>Dossiers tagués « Validé »</b>');
    expect(html).toMatch(/<button type="button" class="tgchip on" style="--tc:#4ade80" aria-pressed="true">/);
    expect(html, 'pas de « Nouveau sous-dossier » sous un filtre').not.toContain('Nouveau sous-dossier');
  });

  it('`?tag=` hors catalogue · aucun filtre, l’écran habituel', async () => {
    etat.session = session(ids, 'ua');
    const html = await page({ tag: 'fuchsia' });
    expect(html).not.toContain('bbanner tagb');
    expect(cartes(html).map(([n]) => n)).toEqual(['Photos produit', 'UGC']);
  });
});
