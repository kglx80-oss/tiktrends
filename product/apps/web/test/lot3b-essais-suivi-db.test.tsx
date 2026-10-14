import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 3b · lots d'essai et suivi Adsmap dans les variantes d'un projet.
 *
 * Données RÉELLES (pglite, lots produits par le chemin L3 simulé, fiche Adsmap
 * créée par le rattachement existant, lot et verdict posés en base). On lit le
 * RÉSULTAT : le plan rendu par le serveur, le HTML de l'écran, et l'état de la
 * base avant/après · jamais la présence d'un appel. Aucun réseau, aucune dépense.
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
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import { db, schema, eq } from '@tiktrends/db';
import { hypotheseEssai, type DonneesVariantes, type PlanLotEssai } from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest, briefCanonique } from './l4c-harnais';
import { creerVariante, listerVariantes } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { preparerLotEssai } from '../lib/studios/variantes/essai';
import { enregistrerVersion } from '../lib/studios/depot';
import { PanneauVariantes } from '../components/studios/variantes/PanneauVariantes';

const ids = etat.ids;
const scene = { p: '', r: '', matinS1: '', matinS2: '', nuitS1: '', autreProjet: '', adId: '', lotB: '' };
const RELECTURE_OFF = { disponible: false, raison: 'La relecture IA n’est pas encore activée.', coutMaxUsd: 0.14 };

async function donnees(qui: 'ua' | 'uv' = 'ua'): Promise<DonneesVariantes> {
  const r = await listerVariantes(ctxDe(ids, qui), { projectId: scene.p }, { adsmapAcces: true, relecture: RELECTURE_OFF });
  if (!r.ok) throw new Error(r.code);
  return r.donnees;
}
const html = (d: DonneesVariantes, recette = {}) => renderToStaticMarkup(<PanneauVariantes donnees={d} recette={recette} />);
const texteVisible = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const carte = (h: string, id: string) => { const i = h.indexOf(`data-variante="${id}"`); return texteVisible(h.slice(i, h.indexOf('</article>', i))); };

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
    const h = html(await donnees());
    const c = carte(h, scene.matinS1);
    expect(c).toContain('Suivi Adsmap · Fiche Adsmap en brouillon');
    expect(c).toContain('Lot de test Lot 3 · En test');
    expect(c).toContain('Verdict · Gagnante · à valider dans Résultats · calculé le');
    expect(c).toContain('Voir la fiche dans Résultats');
    expect(h).toContain(`href="/adsmap?ad=${scene.adId}&amp;depuis=studio"`);
    // Sans test, l'écran le dit au lieu d'inventer un état.
    expect(carte(h, scene.nuitS1)).toContain('Pas encore rattachée à un test.');
  });

  it('sans lot et sans verdict · dit en mots ; un lot d’un autre espace n’est jamais lu', async () => {
    await db.update(schema.ads).set({ batchId: scene.lotB }).where(eq(schema.ads.id, scene.adId));
    await db.delete(schema.verdicts).where(eq(schema.verdicts.adId, scene.adId));
    try {
      const c = carte(html(await donnees()), scene.matinS1);
      expect(c).toContain('Lot de test Hors lot · la fiche n’est encore dans aucun lot de test.');
      expect(c).not.toContain('Lot 9');
      expect(c).toContain('Verdict · Pas encore de résultat mesuré.');
    } finally {
      const [b] = await db.select().from(schema.batches).where(eq(schema.batches.number, 3));
      await db.update(schema.ads).set({ batchId: b!.id }).where(eq(schema.ads.id, scene.adId));
      await db.insert(schema.verdicts).values({ adId: scene.adId, workspaceId: ids.wsA, computed: 'winner', comparable: true });
    }
  });
});

describe('rendu · préparer un lot d’essai dans les variantes', () => {
  async function planReel(): Promise<PlanLotEssai> {
    const r = await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.nuitS1] }, { adsmapAcces: true });
    if (!r.ok) throw new Error(r.code);
    return r.plan;
  }

  it('formulaire · trois variables, chaque variante à cocher, bouton sans coût désactivé tant que rien n’est choisi', async () => {
    const h = html(await donnees());
    const t = texteVisible(h);
    expect(h).toContain('data-essai="formulaire"');
    expect(t).toContain('Préparer un lot d’essai');
    for (const l of ['Les accroches', 'Les mises en page', 'Les ambiances']) expect(t).toContain(l);
    expect((h.match(/type="checkbox"/g) ?? []).length).toBe(3);
    expect(h).toMatch(/<button type="button" disabled=""[^>]*>Préparer le lot d’essai · sans génération, sans coût/);
    expect(t).toContain('Choisis ce qui varie et au moins deux variantes.');
  });

  it('plan affiché · essai réel, hypothèse, tenu, coût nul, saisie pour la seule variante libre, lien vers les lots', async () => {
    const plan = await planReel();
    const h = html(await donnees(), { essai: { variable: 'univers', selection: [scene.matinS1, scene.nuitS1], plan } });
    const i = h.indexOf('data-plan-essai=');
    const bloc = h.slice(i);
    const t = texteVisible(bloc);
    expect(h).toContain('data-plan-essai="essai"');
    expect(t).toContain('Essai · Les ambiances');
    expect(t).toContain(hypotheseEssai('univers', 2));
    expect(t).toContain('Tenu dans tout le lot tous les textes, la mise en page');
    expect(t).toContain('Aucune génération ici');
    expect(t).toContain('Variable au rattachement le visuel d’ouverture');
    expect((bloc.match(/>Rattacher avec ce plan</g) ?? []).length, 'seule la variante sans test ouvert').toBe(1);
    expect(bloc).toMatch(/data-ligne-essai="en_test"[\s\S]*Déjà en test/);
    expect(bloc).toContain('href="/adsmap/lots"');
  });

  it('« Rattacher avec ce plan » ouvre le formulaire EXISTANT prérempli · hypothèse, variable et valeur du plan', async () => {
    const plan = await planReel();
    const saisie = plan.lignes.find((l) => l.variantId === scene.nuitS1)!.saisie!;
    const h = html(await donnees(), { formulaireOuvert: scene.nuitS1, prefill: { [scene.nuitS1]: saisie } });
    const f = h.slice(h.indexOf(`data-formulaire-test="${scene.nuitS1}"`));
    expect(f).toContain(`${hypotheseEssai('univers', 2)}</textarea>`);
    expect(f).toMatch(/<select[^>]*name="variable"[^>]*>.*<option value="opening_visual" selected="">/s);
    expect(f).toMatch(/name="valeurVariable" value="néon de nuit, contrasté"/);
  });

  it('plan refusé · dit pourquoi, aucune saisie proposée', async () => {
    const r = await preparerLotEssai(ctxDe(ids, 'ua'), { projectId: scene.p, variable: 'univers', variantIds: [scene.matinS1, scene.matinS2] }, { adsmapAcces: true });
    if (!r.ok) throw new Error(r.code);
    const h = html(await donnees(), { essai: { variable: 'univers', selection: [scene.matinS1, scene.matinS2], plan: r.plan } });
    expect(h).toContain('data-plan-essai="refus"');
    expect(texteVisible(h)).toContain('Pas un essai');
    expect(texteVisible(h)).toContain('son devis annonce le prix avant le clic. Rien n’est lancé ici.');
    expect(h).not.toContain('>Rattacher avec ce plan<');
  });

  it('lecteur · aucune préparation ; aucun tiret cadratin, aucune marque tierce', async () => {
    expect(texteVisible(html(await donnees('uv')))).not.toContain('Préparer un lot d’essai');
    const h = html(await donnees(), { essai: { variable: 'univers', selection: [scene.matinS1, scene.nuitS1], plan: await planReel() } });
    expect(h).not.toContain('—');
    expect(h.toLowerCase()).not.toContain('trendtrack');
  });
});
