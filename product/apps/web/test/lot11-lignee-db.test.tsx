// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 11 V5 · le CANVAS DE LIGNÉE · au RÉSULTAT · vraie base (pglite et les
 * migrations du dépôt), vraies lectures et actions serveur, vraie page rendue
 * (DOM lu). Un projet semé de bout en bout · brief (hypothèse, direction) →
 * lot de production (deux créations) → deux tests Adsmap dans un lot de test
 * ANALYSÉ (verdicts validés) → lectures → itération (version 2).
 *
 *  · couloirs · le lot de production et le lot de test sont des CADRES, le lot
 *    de test dit son statut, sa conclusion et ouvre sa fiche ;
 *  · canvas de lignée · chaque nœud attendu, chaque lien EXACTEMENT ceux que
 *    les données portent (aucun inventé), légende, mini-carte décorative, liste
 *    avec l'écran existant de chaque nœud ;
 *  · positions · une flèche écrit la position de CETTE carte (même clé
 *    personnelle), la page la relit ; la visite n'écrit rien ;
 *  · autre marque, autre espace · refus, rien du projet à l'écran.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as { id: string; name: string } | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.marque, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, usePathname: () => '/studio/projets', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq, sql } from '@tiktrends/db';
import { composerCanvas, dimensionsLignee, ligneeVersCanvas, positionAuto, type ModeleLignee } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { iterer } from '../lib/studios/variantes/apprentissage';
import { lireLigneeProjetPour } from '../lib/studios/lignee/lignee';
import { cleDispositionCanvas } from '../lib/studios/canvas/disposition';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import { avecSpatial } from './spatial/fournisseur';

const ids = h.ids;
const S = { projet: '', v1: '', v2: '', job: '', va: '', vb: '', adA: '', adB: '', lot: '', secret: '' };

const ua = () => session(ids, 'ua', { plan: 'plus' });
const page = (projectId: string, sp: Record<string, string> = {}) => ProjetSpatial({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve(sp) });
const html = async (projectId: string, sp: Record<string, string> = {}) => renderToStaticMarkup(avecSpatial(await page(projectId, sp)));
const LIGNEE = { disposition: 'libre', graphe: 'lignee' };
const texte = (x: string) => x.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const attr = (x: string, nom: string) => [...x.matchAll(new RegExp(`${nom}="([^"]*)"`, 'g'))].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&gt;/g, '>'));
const compte = async (t: string) => Number(((await db.execute(sql.raw(`select count(*)::int as n from ${t}`))) as unknown as { rows: Array<{ n: number }> }).rows[0]!.n);
const ligne = async (userId: string, projectId: string) => (await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleDispositionCanvas(userId, projectId))))[0]?.value as
  { v: number; rev: number; positions: Record<string, { x: number; y: number }> } | undefined;

let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; document.body.innerHTML = ''; });

beforeAll(async () => {
  await semer(db, schema, ids);
  h.marque = { id: ids.brandA1, name: 'Marque A1' };
  const ctx = ctxDe(ids, 'ua');
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · lignée de bout en bout' });
  S.projet = p.projectId; S.v1 = p.versionId;
  S.job = await lancerLot(db, ctx, p.projectId, KEYFRAMES(2));
  await executer(db, S.job);
  const sorties = await sortiesDuJob(db, S.job);
  const a = await creerVariante(ctx, { assetId: sorties['keyframe:s1'] });
  const b = await creerVariante(ctx, { assetId: sorties['keyframe:s2'] });
  if (!a.ok || !b.ok) throw new Error('variantes');
  S.va = a.variante.id; S.vb = b.variante.id;
  const la = await rattacherVarianteAuTest(ctx, { variantId: S.va, saisie: saisieTest({ valeurVariable: 'Marre des boutons ?' }) });
  const lb = await rattacherVarianteAuTest(ctx, { variantId: S.vb, saisie: saisieTest({ valeurVariable: 'Une peau nette en 7 jours' }) });
  if (!la.ok || !lb.ok) throw new Error(`tests ${!la.ok ? la.code : ''} ${!lb.ok ? lb.code : ''}`);
  S.adA = la.lien.adsmapAdId; S.adB = lb.lien.adsmapAdId;
  // Le lot de test Adsmap · analysé (conclu), les deux fiches dedans, verdicts validés au protocole.
  const [lot] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: 7, status: 'analyzed', launchedAt: new Date('2026-10-12T00:00:00Z') }).returning();
  S.lot = lot!.id;
  for (const ad of [S.adA, S.adB]) await db.update(schema.ads).set({ batchId: S.lot }).where(eq(schema.ads.id, ad));
  await db.insert(schema.verdicts).values([
    { adId: S.adA, workspaceId: ids.wsA, computed: 'winner', validated: 'winner', status: 'validated', comparable: true },
    { adId: S.adB, workspaceId: ids.wsA, computed: 'loser', validated: 'loser', status: 'validated', comparable: true },
  ]);
  // L'itération · version enfant de la version 1, depuis la gagnante.
  const it = await iterer(ctx, { variantId: S.va, baseVersionId: S.v1, variable: 'opening_visual' });
  if (!it.ok) throw new Error(`itérer ${it.code} ${it.message}`);
  S.v2 = it.version.id;
  // Un projet d'une AUTRE marque du même espace · `ur` (restreint à A1) ne doit rien en voir.
  S.secret = (await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'Projet secret de la marque A2' })).projectId;
}, 90_000);

/** Les liens que les DONNÉES semées portent, écrits à la main depuis le semis (jamais relus de l'écran). */
function liensAttendus(): string[] {
  const c = (v: string) => `creation:${v}`;
  return [
    `marque>brief:${S.v1}`,
    `brief:${S.v1}>hypothese:${S.v1}`, `brief:${S.v1}>direction:${S.v1}`,
    `brief:${S.v2}>hypothese:${S.v2}`, `brief:${S.v2}>direction:${S.v2}`,
    `brief:${S.v1}>groupe:${S.job}`, `groupe:${S.job}>${c(S.va)}`, `groupe:${S.job}>${c(S.vb)}`,
    `${c(S.va)}>resultat:${S.va}`, `${c(S.vb)}>resultat:${S.vb}`,
    `resultat:${S.va}>apprentissage:${S.va}`, `resultat:${S.vb}>apprentissage:${S.vb}`,
    `brief:${S.v1}>iteration:${S.v2}`, `iteration:${S.v2}>brief:${S.v2}`,
  ].sort();
}

describe('Lot 11 · couloirs · les groupes de lot sont des cadres calculés', () => {
  it('le lot de production encadre son nœud « Lot » et ses deux créations ; le lot de test encadre ses résultats, dit son statut, sa conclusion, ouvre sa fiche', async () => {
    h.session = ua();
    const x = await html(S.projet);
    const prod = x.slice(x.indexOf(`data-groupe-lot="lot:${S.job}"`));
    const finProd = prod.indexOf('data-groupe-lot=', 10);
    const cadreProd = finProd > 0 ? prod.slice(0, finProd) : prod;
    expect(attr(cadreProd, 'data-noeud').slice(0, 3)).toEqual([`groupe:${S.job}`, `creation:${S.va}`, `creation:${S.vb}`]);
    const test = x.slice(x.indexOf(`data-groupe-lot="lot-test:${S.lot}"`));
    expect(texte(test)).toMatch(/^.*?LOT DE TEST Lot de test n° 7 Analysé · Non concluante · 2 variantes tranchées au protocole · il en faut 4/);
    expect(test).toContain(`href="/adsmap/lots/${S.lot}"`);
    expect(attr(test, 'data-noeud').slice(0, 4)).toEqual([`resultat:${S.va}`, `apprentissage:${S.va}`, `resultat:${S.vb}`, `apprentissage:${S.vb}`]);
  });

  it('sans les Résultats (formule Core) · le cadre du lot de test dit le statut seul, aucun lien vers la fiche, aucune conclusion', async () => {
    h.session = session(ids, 'ua');
    const x = await html(S.projet);
    const test = x.slice(x.indexOf(`data-groupe-lot="lot-test:${S.lot}"`));
    expect(texte(test)).toContain('Lot de test n° 7 Analysé · 2 résultats de ce projet dans ce lot.');
    expect(x).not.toContain(`/adsmap/lots/${S.lot}`);
    expect(texte(x)).not.toContain('Non concluante');
  });
});

describe('Lot 11 · canvas de lignée · vraie page, DOM lu', () => {
  let modele: ModeleLignee;
  beforeAll(async () => {
    const r = await lireLigneeProjetPour(ctxDe(ids, 'ua'), S.projet, { veilleOuverte: true, maintenant: new Date() });
    if (!r.ok) throw new Error(r.code);
    modele = r.lignee.lignee;
  });

  it('chaque nœud attendu est une carte ET un élément de la liste, avec le lien de son écran EXISTANT', async () => {
    h.session = ua();
    const x = await html(S.projet, LIGNEE);
    expect(x).toContain('data-graphe="lignee"');
    const ecran: Record<string, string> = {
      [`brief:${S.v1}`]: `/studio/projets/${S.projet}?version=${S.v1}#brief`,
      [`hypothese:${S.v1}`]: `/studio/projets/${S.projet}?version=${S.v1}#brief`,
      [`direction:${S.v1}`]: `/studio/projets/${S.projet}?version=${S.v1}#brief`,
      [`brief:${S.v2}`]: `/studio/projets/${S.projet}?version=${S.v2}#brief`,
      [`groupe:${S.job}`]: `/studio/projets/${S.projet}#creations`,
      [`creation:${S.va}`]: `/studio/projets/${S.projet}#variantes`,
      [`creation:${S.vb}`]: `/studio/projets/${S.projet}#variantes`,
      [`resultat:${S.va}`]: `/adsmap?ad=${S.adA}&depuis=studio`,
      [`resultat:${S.vb}`]: `/adsmap?ad=${S.adB}&depuis=studio`,
      [`apprentissage:${S.va}`]: `/studio/projets/${S.projet}#variantes`,
      [`iteration:${S.v2}`]: `/studio/projets/${S.projet}?version=${S.v2}`,
    };
    const cartes = new Set(attr(x, 'data-carte'));
    for (const [id, href] of Object.entries(ecran)) {
      expect(cartes.has(id), `carte ${id}`).toBe(true);
      const li = x.slice(x.indexOf(`data-element-lignee="${id}"`));
      const balise = li.slice(0, li.indexOf('</li>')).match(new RegExp(`<a [^>]*data-ecran="${id}"[^>]*>`));
      expect(balise, `lien d’écran de ${id}`).toBeTruthy();
      expect(balise![0].match(/href="([^"]*)"/)![1]!.replace(/&amp;/g, '&'), `écran de ${id}`).toBe(href);
    }
    expect(cartes.has('marque')).toBe(true);
    // La gagnante porte sa pastille, sur la carte et dans la liste.
    expect(x).toMatch(new RegExp(`data-carte="resultat:${S.va}"[^>]*aria-label="[^"]*· Gagnant"`));
    expect(texte(x)).toContain('Résultat · Image 1 du lot 1 · Gagnant');
    // Une carte par nœud de la lignée, ni plus ni moins.
    expect([...cartes].sort()).toEqual(modele.noeuds.map((n) => n.id).sort());
  });

  it('aucun lien inventé · les traits sont EXACTEMENT les liens que les données semées portent, chacun avec sa catégorie', async () => {
    h.session = ua();
    const x = await html(S.projet, LIGNEE);
    const traits = attr(x, 'data-lien').sort();
    expect(traits).toEqual(liensAttendus());
    const cats = Object.fromEntries([...x.matchAll(/data-lien="([^"]*)" data-categorie="([^"]*)"/g)].map((m) => [m[1]!.replace(/&gt;/g, '>'), m[2]]));
    expect(cats[`marque>brief:${S.v1}`]).toBe('contexte');
    expect(cats[`brief:${S.v1}>groupe:${S.job}`]).toBe('visuel');
    expect(cats[`creation:${S.va}>resultat:${S.va}`]).toBe('mesure');
    expect(cats[`iteration:${S.v2}>brief:${S.v2}`]).toBe('iteration');
    // La liste dit les mêmes liens · un « Vient de » par lien, rien d'autre.
    const vientDe = [...x.matchAll(/data-element-lignee="([^"]*)"[^]*?Vient de · ([^<]*)</g)].filter((m) => !m[2]!.startsWith('rien'));
    const nb = vientDe.reduce((t, m) => t + m[2]!.split('), ').length, 0);
    expect(nb).toBe(liensAttendus().length);
  });

  it('légende des seules catégories présentes, avec leur nombre ; cadres des lots ; mini-carte décorative ; liste repliable', async () => {
    h.session = ua();
    const x = await html(S.projet, LIGNEE);
    const t = texte(x);
    expect(attr(x, 'data-legende')).toEqual(['contexte', 'visuel', 'mesure', 'iteration']);
    expect(t).toContain('Contexte · trait plein · 5 liens');
    expect(t).toContain('Visuel · tirets · 3 liens');
    expect(t).toContain('Mesure · pointillés · 4 liens');
    expect(t).toContain('Itération · tirets et points · 2 liens');
    expect([...new Set(attr(x, 'data-cadre-lot'))].sort()).toEqual([`lot-test:${S.lot}`, `lot:${S.job}`].sort());
    expect(x).toMatch(/data-cadre-lot="[^"]*" data-nature="[a-z]+"( data-suite="")? aria-hidden="true"/);
    expect(x).toMatch(/<svg data-mini-carte="" aria-hidden="true" focusable="false"/);
    expect(x.match(/data-mini-carte-noeud=/g)).toHaveLength(modele.noeuds.length);
    expect(x).toContain('data-lignee-liste=""');
    expect(t).toContain(`La lignée en liste · ${modele.noeuds.length} nœuds · 2 lots`);
    expect(t).toContain('Lot de test n° 7 Analysé · Non concluante');
    expect(x).not.toContain('—');
    expect(x.toLowerCase()).not.toContain('trendtrack');
  });

  it('positions · la visite n’écrit rien ; une flèche écrit la position de CETTE carte de lignée, la page la relit', async () => {
    h.session = ua();
    const avant = { reglages: await compte('app_settings'), versions: await compte('studio_project_versions'), liens: await compte('studio_test_links') };
    await html(S.projet, LIGNEE);
    expect({ reglages: await compte('app_settings'), versions: await compte('studio_project_versions'), liens: await compte('studio_test_links') }).toEqual(avant);

    const hote = document.createElement('div');
    document.body.appendChild(hote);
    root = createRoot(hote);
    const el = avecSpatial(await page(S.projet, LIGNEE));
    await act(async () => { root!.render(el); });
    const id = `creation:${S.va}`;
    const carte = hote.querySelector<HTMLButtonElement>(`[data-carte="${id}"]`)!;
    const x0 = Number(carte.dataset.x); const y0 = Number(carte.dataset.y);
    await act(async () => { carte.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    await vi.waitFor(async () => expect(await ligne(ids.ua, S.projet)).toBeTruthy(), { timeout: 5000 });
    await vi.waitFor(() => expect(hote.querySelector('[data-canvas-message]')!.textContent).toContain('Position enregistrée pour toi'));
    const l = (await ligne(ids.ua, S.projet))!;
    expect(l).toMatchObject({ v: 2, rev: 1, positions: { [id]: { x: x0 + 16, y: y0 } } });
    expect(Object.keys(l.positions)).toEqual([id]);
    expect(await compte('app_settings')).toBe(avant.reglages + 1);
    expect(await compte('studio_project_versions')).toBe(avant.versions);
    // Relue · la carte à sa position enregistrée, sa place automatique ailleurs.
    const auto = positionAuto(dimensionsLignee(ligneeVersCanvas(modele), {}), id)!;
    expect(x0).toBe(auto.x);
    const relue = await html(S.projet, LIGNEE);
    expect(relue).toMatch(new RegExp(`data-carte="${id}"[^>]*data-x="${x0 + 16}" data-y="${y0}"`));
    // Le cadre du lot (DOM) suit la carte déplacée · la boîte de ses membres POSÉS la contient.
    const k = composerCanvas(dimensionsLignee(ligneeVersCanvas(modele), {}), { positions: l.positions }).cartes.find((c) => c.id === id)!;
    const boites = [...relue.matchAll(new RegExp(`data-cadre-lot="lot:${S.job}"[^>]*style="position:absolute;left:(-?[\\d.]+)px;top:(-?[\\d.]+)px;width:([\\d.]+)px;height:([\\d.]+)px`, 'g'))]
      .map((m) => m.slice(1, 5).map(Number) as [number, number, number, number]);
    expect(boites.length).toBeGreaterThan(0);
    expect(boites.some(([gx, gy, gw, gh]) => gx <= k.x && gy <= k.y && gx + gw >= k.x + k.w && gy + gh >= k.y + k.h), 'la carte déplacée sort de son cadre').toBe(true);
    // Le graphe de production n'a pas bougé · ses cartes à leur place automatique.
    expect(await html(S.projet, { disposition: 'libre' })).toContain('data-graphe="production"');
  });
});

describe('Lot 11 · portée · autre marque, autre espace · refus sans fuite', () => {
  it('`ur` (restreint à A1) ouvre le projet de A2 · refusé, rien du projet ni de sa lignée', async () => {
    h.session = session(ids, 'ur', { plan: 'plus' });
    const x = await html(S.secret, LIGNEE);
    expect(x).not.toContain('Projet secret de la marque A2');
    expect(x).not.toContain('data-canvas-libre');
    expect(x).not.toContain('data-carte=');
    expect(await lireLigneeProjetPour(ctxDe(ids, 'ur'), S.secret, { veilleOuverte: true, maintenant: new Date() })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('un membre d’un autre espace ouvre le projet · refusé, ni titre, ni lot, ni lien', async () => {
    h.session = session(ids, 'ub', { plan: 'plus' });
    const x = await html(S.projet, LIGNEE);
    expect(x).not.toContain('Sérum · lignée de bout en bout');
    expect(x).not.toContain(S.lot);
    expect(x).not.toContain('data-groupe-lot');
    expect(x).not.toContain('data-carte=');
  });
});
