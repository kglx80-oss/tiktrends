// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 3b · lots d'essai et suivi Adsmap dans les variantes d'un projet.
 *
 * Données RÉELLES (pglite, lots produits par le chemin L3 simulé, fiche Adsmap
 * créée par le rattachement existant, lot et verdict posés en base). On lit le
 * RÉSULTAT : le plan rendu par le serveur, le HTML de l'écran, et l'état de la
 * base avant/après · jamais la présence d'un appel. Aucun réseau, aucune dépense.
 *
 * L'écran est celui de SPATIAL (onglet « Créations » de la fiche, lot d'essai)
 * · le panneau V5 des variantes est retiré avec la fiche V5.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/studio/projets/p', redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema, eq } from '@tiktrends/db';
import { hypotheseEssai, type DonneesVariantes } from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique } from './l4c-harnais';
import { creerVariante, listerVariantes } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { preparerLotEssai } from '../lib/studios/variantes/essai';
import { enregistrerVersion } from '../lib/studios/depot';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import { LotEssai } from '../spatial/vues/projet/Rattachement';
import { avecSpatial } from './spatial/fournisseur';

const ids = etat.ids;
const scene = { p: '', r: '', matinS1: '', matinS2: '', nuitS1: '', autreProjet: '', adId: '', lotB: '' };
const RELECTURE_OFF = { disponible: false, raison: 'La relecture IA n’est pas encore activée.', coutMaxUsd: 0.14 };

async function donnees(qui: 'ua' | 'uv' = 'ua'): Promise<DonneesVariantes> {
  const r = await listerVariantes(ctxDe(ids, qui), { projectId: scene.p }, { adsmapAcces: true, relecture: RELECTURE_OFF });
  if (!r.ok) throw new Error(r.code);
  return r.donnees;
}
/** L'onglet « Créations » de la fiche Spatiale · même lecture serveur que la page. */
async function crea(): Promise<string> {
  etat.session = session(ids, 'ua');
  const r = await chargerProjet(etat.session as never, scene.p);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  return renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial="crea" />));
}
const texteVisible = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const carte = (h: string, id: string) => { const i = h.indexOf(`data-variante="${id}"`); const fin = [h.indexOf('data-variante=', i + 15), h.indexOf('data-essai', i)].filter((x) => x > 0); return texteVisible(h.slice(i, Math.min(...fin))); };

async function variantesDuLot(ctxQui: 'ua', projectId: string, jobId: string): Promise<Record<string, string>> {
  const s = await sortiesDuJob(db, jobId);
  const out: Record<string, string> = {};
  for (const [op, assetId] of Object.entries(s)) {
    const v = await creerVariante(ctxDe(ids, ctxQui), { assetId });
    if (!v.ok) throw new Error(`variante ${v.code}`);
    out[op] = v.variante.id;
  }
  void projectId;
  return out;
}

/** Tout ce qu'une consultation pourrait écrire · lu tel quel, comparé avant/après. */
async function photo(): Promise<string> {
  const t = [
    schema.studioProjects, schema.studioProjectVersions, schema.studioJobs, schema.studioAssets, schema.studioVariants, schema.studioTestLinks,
    schema.studioAuditEvents, schema.ads, schema.batches, schema.verdicts, schema.workspaces, schema.aiSpend, schema.creditLedger,
  ];
  const lignes = [];
  for (const x of t) lignes.push((await db.select().from(x as typeof schema.ads)).map((r) => JSON.stringify(r)).sort());
  return JSON.stringify(lignes);
}

beforeAll(async () => {
  await semer(db, schema, ids);
  // Projet P (A1) · version 1 « matin », deux images ; version 2 « néon de nuit », une image.
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · essai ambiances' });
  scene.p = p.projectId;
  const j1 = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, KEYFRAMES(2));
  await executer(db, j1);
  const v1 = await variantesDuLot('ua', p.projectId, j1);
  scene.matinS1 = v1['keyframe:s1']!;
  scene.matinS2 = v1['keyframe:s2']!;
  const v2 = await enregistrerVersion(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: p.versionId, changes: [{ op: 'replace', path: '/brief', newValue: briefCanonique({ styleIntent: 'néon de nuit, contrasté' }), reason: 'ambiance' }] });
  if (!v2.ok) throw new Error(v2.code);
  const j2 = await lancerLot(db, ctxDe(ids, 'ua'), p.projectId, KEYFRAMES(1));
  await executer(db, j2);
  scene.nuitS1 = (await variantesDuLot('ua', p.projectId, j2))['keyframe:s1']!;

  // La variante « matin » est déjà en test · fiche Adsmap par le rattachement existant, rangée dans le lot 3, verdict calculé.
  const l = await rattacherVarianteAuTest(ctxDe(ids, 'ua'), { variantId: scene.matinS1, saisie: saisieTest() });
  if (!l.ok) throw new Error(l.code);
  scene.adId = l.lien.adsmapAdId;
  const [b] = await db.insert(schema.batches).values({ workspaceId: ids.wsA, brandId: ids.brandA1, number: 3, status: 'testing' }).returning();
  await db.update(schema.ads).set({ batchId: b!.id }).where(eq(schema.ads.id, scene.adId));
  await db.insert(schema.verdicts).values({ adId: scene.adId, workspaceId: ids.wsA, computed: 'winner', comparable: true });
  // Un lot d'un AUTRE espace · ne doit jamais apparaître ici, même si une fiche le désignait.
  const [bb] = await db.insert(schema.batches).values({ workspaceId: ids.wsB, brandId: ids.brandB1, number: 9, status: 'analyzed' }).returning();
  scene.lotB = bb!.id;

  // Projet R (A2) · une variante d'un autre projet et d'une autre marque.
  const r = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'Projet R secret' });
  scene.r = r.projectId;
  const jr = await lancerLot(db, ctxDe(ids, 'ua'), r.projectId, KEYFRAMES(1));
  await executer(db, jr);
  scene.autreProjet = (await variantesDuLot('ua', r.projectId, jr))['keyframe:s1']!;
}, 120_000);

describe('préparer un lot d’essai · lecture serveur, règle du noyau', () => {
  it('ambiances · « matin » contre « néon » · essai réel, la variante en test garde sa fiche, l’autre reçoit la saisie', async () => {
    const r = await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.nuitS1] }, { adsmapAcces: true });
    if (!r.ok) throw new Error(r.code);
    expect(r.plan.constat).toEqual({ ok: true, phrase: 'Essai réel · seule l’ambiance change d’une variante à l’autre.' });
    expect(r.plan.lignes[0]).toMatchObject({ variantId: scene.matinS1, etat: 'en_test', saisie: null, adsmapHref: `/adsmap?ad=${scene.adId}&depuis=studio` });
    expect(r.plan.lignes[1]).toMatchObject({ variantId: scene.nuitS1, etat: 'a_rattacher', valeur: 'néon de nuit, contrasté' });
    expect(r.plan.lignes[1]!.saisie).toEqual({ hypothese: hypotheseEssai('univers', 2), variable: 'opening_visual', valeurVariable: 'néon de nuit, contrasté' });
  });

  it('deux images de la même version · même ambiance, pas un essai · accroches sur deux images · la scène varie', async () => {
    const meme = await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.matinS2] }, { adsmapAcces: true });
    if (!meme.ok) throw new Error(meme.code);
    expect(meme.plan.constat).toMatchObject({ ok: false, probleme: expect.stringContaining('partagent les ambiances') });
    const acc = await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'accroche', variantIds: [scene.matinS1, scene.nuitS1] }, { adsmapAcces: true });
    if (!acc.ok) throw new Error(acc.code);
    expect(acc.plan.constat.ok).toBe(false);
    expect(acc.plan.lignes.every((l) => l.saisie === null)).toBe(true);
  });

  it('portée · un autre espace, une marque fermée, une variante d’un autre projet : même refus neutre, rien révélé', async () => {
    const e = { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.nuitS1] };
    const ub = await preparerLotEssai(ctxDe(ids, 'ub'), e, { adsmapAcces: true });
    expect(ub).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(JSON.stringify(ub)).not.toMatch(/néon|Sérum|Image|plan/);
    // `ur` ne voit que A1 · le projet R (A2) lui est fermé.
    const ur = await preparerLotEssai(ctxDe(ids, 'ur'), { projectId: scene.r, variable: 'univers', variantIds: [scene.autreProjet, scene.matinS1] }, { adsmapAcces: true });
    expect(ur).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    // Une variante d'un AUTRE projet glissée dans la sélection · refusée, même pour `ua` qui voit les deux.
    const mele = await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.autreProjet] }, { adsmapAcces: true });
    expect(mele).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    // Saisie invalide · dite, sans rien lire.
    const une = await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1] }, { adsmapAcces: true });
    expect(une).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', message: 'Un essai a besoin d’au moins deux variantes à comparer.' });
  });

  it('consulter et préparer n’écrivent rien · base identique avant et après', async () => {
    const avant = await photo();
    await donnees('ua');
    await donnees('uv');
    await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.nuitS1] }, { adsmapAcces: true });
    await preparerLotEssai(ctxDe(ids, 'ub'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.nuitS1] }, { adsmapAcces: true });
    await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'accroche', variantIds: [scene.matinS1, scene.autreProjet] }, { adsmapAcces: true });
    expect(await photo()).toBe(avant);
  });
});

describe('suivi Adsmap visible · lot, statut, verdict, lien vers Résultats', () => {
  it('la variante en test · lot 3 en test, fiche en brouillon, verdict calculé à valider, lien profond', async () => {
    const h = await crea();
    const c = carte(h, scene.matinS1);
    expect(c).toContain('Fiche Adsmap en brouillon');
    expect(c).toContain('Lot de test · Lot 3 · En test');
    expect(c).toContain('Gagnante · à valider dans Résultats · calculé le');
    expect(h).toContain(`href="/adsmap?ad=${scene.adId}&amp;depuis=studio"`);
    // Sans test, aucun état inventé · ni suivi, ni verdict.
    expect(carte(h, scene.nuitS1)).not.toContain('Lot de test');
    expect(carte(h, scene.nuitS1)).not.toContain('Gagnante');
  });

  it('sans lot et sans verdict · dit en mots ; un lot d’un autre espace n’est jamais lu', async () => {
    await db.update(schema.ads).set({ batchId: scene.lotB }).where(eq(schema.ads.id, scene.adId));
    await db.delete(schema.verdicts).where(eq(schema.verdicts.adId, scene.adId));
    try {
      const c = carte(await crea(), scene.matinS1);
      expect(c).toContain('Lot de test · Hors lot · la fiche n’est encore dans aucun lot de test.');
      expect(c).not.toContain('Lot 9');
      expect(c).toContain('Pas encore de résultat mesuré.');
    } finally {
      const [b] = await db.select().from(schema.batches).where(eq(schema.batches.number, 3));
      await db.update(schema.ads).set({ batchId: b!.id }).where(eq(schema.ads.id, scene.adId));
      await db.insert(schema.verdicts).values({ adId: scene.adId, workspaceId: ids.wsA, computed: 'winner', comparable: true });
    }
  });
});

describe('rendu Spatial · préparer un lot d’essai dans les créations (vraie action, vraie base)', () => {
  const variantes = () => [scene.matinS1, scene.nuitS1, scene.matinS2].map((id) => ({ id, libelle: id.slice(0, 6), version: 'Version 1' }));
  async function monter(ouvrir = vi.fn()) {
    // Offre Plus · l'accès Adsmap est relu par l'action, comme en production.
    etat.session = session(ids, 'ua', { plan: 'plus' });
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const root = createRoot(hote);
    await act(async () => { root.render(avecSpatial(<LotEssai projectId={scene.p} variantes={variantes()} ouvrirRattachement={ouvrir} />)); });
    const choisir = async (variable: string, ids2: string[]) => {
      await act(async () => { hote.querySelector<HTMLButtonElement>(`[data-essai-variable="${variable}"]`)!.click(); });
      for (const v of ids2) await act(async () => { hote.querySelector<HTMLButtonElement>(`[data-essai-variante="${v}"]`)!.click(); });
      await act(async () => { [...hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Préparer le lot d’essai'))!.click(); });
      await vi.waitFor(() => expect(hote.querySelector('[data-plan-essai], [role="alert"]')).not.toBeNull(), { timeout: 5000 });
    };
    return { hote, choisir, fin: () => { act(() => root.unmount()); hote.remove(); } };
  }

  it('formulaire · trois variables, chaque variante à choisir, bouton sans coût inactif tant que rien n’est choisi', async () => {
    const m = await monter();
    const t = m.hote.textContent!;
    expect(m.hote.querySelector('[data-essai="formulaire"]')).not.toBeNull();
    expect(m.hote.querySelectorAll('[data-essai-variable]')).toHaveLength(3);
    expect(m.hote.querySelectorAll('[data-essai-variante]')).toHaveLength(3);
    expect(t).toContain('sans génération, sans coût');
    expect([...m.hote.querySelectorAll('button')].find((b) => b.textContent?.includes('Préparer le lot d’essai'))!.disabled).toBe(true);
    m.fin();
  });

  it('plan affiché · essai réel, hypothèse, tenu, coût nul, saisie pour la seule variante libre, lien vers les lots ; « Rattacher avec ce plan » transmet la saisie du plan', async () => {
    const ouvrir = vi.fn();
    const m = await monter(ouvrir);
    await m.choisir('univers', [scene.matinS1, scene.nuitS1]);
    const bloc = m.hote.querySelector('[data-plan-essai]')!;
    expect(bloc.getAttribute('data-plan-essai')).toBe('essai');
    const t = bloc.textContent!;
    expect(t).toContain('Essai réel');
    expect(t).toContain(hypotheseEssai('univers', 2));
    expect(t).toContain('tous les textes, la mise en page');
    expect(t).toContain('Aucune génération ici');
    expect(t).toContain('le visuel d’ouverture');
    const rattacher = [...bloc.querySelectorAll('button')].filter((b) => b.textContent === 'Rattacher avec ce plan');
    expect(rattacher, 'seule la variante sans test ouvert').toHaveLength(1);
    expect(bloc.querySelector('[data-ligne-essai="en_test"]')?.textContent).toContain('Déjà en test');
    expect(bloc.querySelector('a[href="/adsmap/lots"]')).not.toBeNull();
    await act(async () => { rattacher[0]!.click(); });
    expect(ouvrir).toHaveBeenCalledWith(scene.nuitS1, expect.objectContaining({ hypothese: hypotheseEssai('univers', 2), variable: 'opening_visual', valeurVariable: 'néon de nuit, contrasté' }));
    expect(bloc.innerHTML).not.toContain('—');
    expect(bloc.innerHTML.toLowerCase()).not.toContain('trendtrack');
    m.fin();
  });

  it('plan refusé · dit pourquoi, aucune saisie proposée', async () => {
    const m = await monter();
    await m.choisir('univers', [scene.matinS1, scene.matinS2]);
    const bloc = m.hote.querySelector('[data-plan-essai]')!;
    expect(bloc.getAttribute('data-plan-essai')).toBe('refus');
    expect(bloc.textContent).toContain('Pas un essai');
    expect(bloc.textContent).toContain('son devis annonce le prix avant le clic. Rien n’est lancé ici.');
    expect([...bloc.querySelectorAll('button')].some((b) => b.textContent === 'Rattacher avec ce plan')).toBe(false);
    m.fin();
  });
});
