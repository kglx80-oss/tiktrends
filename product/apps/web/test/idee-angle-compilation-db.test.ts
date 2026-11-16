import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

/**
 * L'idée visuelle d'un angle, sur la VRAIE compilation `image.compile`.
 *
 * Le défaut : le brief résumé pour `image.compile` ne portait ni l'angle, ni le
 * concept, ni le persona du brief V5 · le modèle compilait la même scène pour
 * chaque angle. Maintenant le contexte les porte (persona RELU dans la portée de
 * la marque), le gabarit 1.1.0 demande une scène par angle, et un lot d'angles
 * dont deux consignes montrent la même scène est refusé par la règle de variété
 * (règle prête, pas encore raccordée à un chemin payant, faute de chemin
 * multi-angles · on l'éprouve ici sur des consignes réellement compilées).
 *
 * Vraie base (pglite, migrations réelles), registre publié depuis le pack
 * embarqué, VRAI adaptateur (`adaptateurAnthropicGarde` → `guardedAnthropic` →
 * SDK) vers un faux modèle texte LOCAL (`idee-angle-outils.ts`, 0 $). On lit ce
 * que le serveur a REÇU, et les lignes écrites.
 *
 * La parité « sans angle ni persona » se lit contre une capture prise sur main
 * AVANT la modification (`fixtures/idee-angle-contexte-main.json`).
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios }));
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
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, schema, eq } from '@tiktrends/db';
import { empreinteContenu, SCHEMA_VERSION_CONTENU, PREFIXE_SCENE, type BriefCanonique, type ContenuVersion } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { PACK_EMBARQUE } from '../lib/studios/prompts/pack-embarque';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import { compilerEtAttesterPour, retenirConsignePour } from '../lib/studios/image/consigne';
import { controlerVarieteLotPour } from '../lib/studios/image/idee-angle';
import { adaptateurAnthropicGarde } from '../lib/studios/prompts/adaptateur';
import { requeteCompilationPas1 } from '../scripts/recette/devis';
import { semer } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, delta, type Catalogue } from './l5c-outils';
import { fauxModeleTexte, messageUtilisateur, briefRecu, normaliser, type CorpsRecu, type FauxModeleTexte } from './idee-angle-outils';

const ids = etat.ids;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-08T10:00:00Z') };
const MAIN = JSON.parse(readFileSync(join(__dirname, 'fixtures/idee-angle-contexte-main.json'), 'utf8')) as { utilisateur: string };
const ctx = () => ctxDe(ids, 'ua');
let cat: Catalogue;
let srv: FauxModeleTexte;
const personas = { a1: '', a2: '', b1: '', rejete: '', archive: '', propose: '' };
const avantEnv = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };

/* ── Le faux modèle · une scène par angle reçu (ou la même pour tous) ─────── */
const SCENES: Record<string, string> = {
  Peur: 'lunettes tombées dans une flaque au pied d’une coureuse · piste d’athlétisme sous la pluie',
  Preuve: 'montre GPS affichant 10 km posée contre les lunettes sèches · banc de vestiaire en bois',
};
let sceneFixe: string | null = null;
function consigne(c: CorpsRecu) {
  const angle = /^Angle : (\S+)/m.exec(briefRecu(c))?.[1] ?? '';
  const scene = sceneFixe ?? SCENES[angle] ?? 'coureur sur une piste · lever du jour';
  const ti = JSON.parse(messageUtilisateur(c).split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
  return {
    status: 'ready', questions: [], warnings: [], evidenceIds: [],
    result: {
      generationInstruction: `${PREFIXE_SCENE} ${scene}. Lunettes et bandeau visibles, produit à sa taille réelle.`,
      negativeConstraints: ['Pas de texte dans l’image'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
      referenceBindings: ti.referenceIds.filter((id) => id.startsWith('pph_')).map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
    },
  };
}

/* ── Projets ─────────────────────────────────────────────────────────────── */
const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return { p: p!, v: v! };
};

async function projetEpingle(): Promise<string> {
  const p = await projetStatique(db, ids, cat);
  const c = await chargerCatalogueProjet(ctx(), p.projectId, O);
  if (!c.ok) throw new Error(c.code);
  const photo = c.catalogue.produits.find((x) => x.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const r = await epinglerProduitPour(ctx(), { projectId: p.projectId, baseVersionId: (await courante(p.projectId)).v.id, productId: cat.produit.id, photoId: photo, composants: ['lunettes', 'bandeau'] }, O);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p.projectId;
}

/** Une version neuve dont le brief porte les champs V5 donnés (comme l'assistant les écrit). */
async function avecIdee(projectId: string, champs: Partial<BriefCanonique>): Promise<void> {
  const { p, v } = await courante(projectId);
  const contenu = { ...(v.content as ContenuVersion) };
  contenu.brief = { ...(contenu.brief as Record<string, unknown>), ...champs };
  const [n] = await db.insert(schema.studioProjectVersions).values({
    projectId, workspaceId: p.workspaceId, brandId: p.brandId, parentId: v.id, n: v.n + 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test · champs V5',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: n!.id, rowVersion: p.rowVersion + 1 }).where(eq(schema.studioProjects.id, projectId));
}

const compiler = (projectId: string) => compilerEtAttesterPour(ctx(), { projectId, mode: 'generative_scene' }, { adaptateur: adaptateurAnthropicGarde(), environnement: 'test', ...O });

async function compilerEtRetenir(projectId: string): Promise<void> {
  const base = (await courante(projectId)).v.id;
  const c = await compiler(projectId);
  if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
  const r = await retenirConsignePour(ctx(), { projectId, baseVersionId: base, runId: c.runId });
  if (!r.ok) throw new Error(JSON.stringify(r));
}

beforeAll(async () => {
  srv = await fauxModeleTexte();
  srv.repondre(consigne);
  process.env.ANTHROPIC_API_KEY = 'cle-factice-idee-angle';
  process.env.ANTHROPIC_BASE_URL = srv.url;
  process.env.ANTHROPIC_GEN_MODEL = 'claude-sonnet-5';
  process.env.AI_SPEND_CAP_USD = '5';
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
  const [a1] = await db.insert(schema.personas).values({
    brandId: ids.brandA1, name: 'Camille, coureuse du dimanche', segment: 'Urbaine active',
    description: 'Court 10 km le long du canal · joignable à camille@exemple.fr', pains: ['Ses lunettes glissent dès qu’elle transpire'], desires: ['Finir sa course sans les remonter'],
    objections: ['Trop cher'], sources: [{ type: 'avis', texte: 'CITATION-CLIENTE-REELLE' }], status: 'validated',
  }).returning();
  const [a2] = await db.insert(schema.personas).values({ brandId: ids.brandA2, name: 'PERSONA-AUTRE-MARQUE', pains: ['FRUSTRATION-AUTRE-MARQUE'] }).returning();
  const [b1] = await db.insert(schema.personas).values({ brandId: ids.brandB1, name: 'PERSONA-AUTRE-ESPACE', pains: ['FRUSTRATION-AUTRE-ESPACE'] }).returning();
  personas.a1 = a1!.id; personas.a2 = a2!.id; personas.b1 = b1!.id;
  const [rj, ar, pr] = await db.insert(schema.personas).values([
    { brandId: ids.brandA1, name: 'PERSONA-REJETE', pains: ['FRUSTRATION-REJETE'], status: 'rejected' },
    { brandId: ids.brandA1, name: 'PERSONA-ARCHIVE', pains: ['FRUSTRATION-ARCHIVE'], status: 'archived' },
    { brandId: ids.brandA1, name: 'Persona proposé', pains: ['Frustration proposée'], status: 'proposed' },
  ]).returning();
  personas.rejete = rj!.id; personas.archive = ar!.id; personas.propose = pr!.id;
}, 120_000);
afterAll(async () => {
  await srv.fermer();
  for (const [k, v] of [['ANTHROPIC_API_KEY', avantEnv.cle], ['ANTHROPIC_BASE_URL', avantEnv.url], ['ANTHROPIC_GEN_MODEL', avantEnv.modele], ['AI_SPEND_CAP_USD', avantEnv.cap]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(() => { srv.recus.length = 0; sceneFixe = null; });

describe('le contexte envoyé à image.compile', () => {
  it('sans angle ni persona · le message reçu est celui de main, au caractère près', async () => {
    const projectId = await projetEpingle();
    await compiler(projectId);
    expect(srv.recus.length).toBe(1);
    expect(normaliser(messageUtilisateur(srv.recus[0]!)), 'le contexte sans angle ni persona a changé par rapport à main').toBe(MAIN.utilisateur);
  });

  it('avec angle, concept et persona de la marque · les trois sont dans le contexte, le persona résumé sans coordonnée ni source', async () => {
    const projectId = await projetEpingle();
    await avecIdee(projectId, { angle: 'Peur · tes lunettes glissent en pleine course', concept: 'La course sous la pluie', personaRef: { id: personas.a1, label: 'Camille' } });
    await compiler(projectId);
    expect(srv.recus.length).toBe(1);
    const tout = JSON.stringify(srv.recus[0]);
    for (const absent of ['camille@exemple.fr', 'CITATION-CLIENTE-REELLE', 'Trop cher']) expect(tout, `« ${absent} » est parti vers le modèle`).not.toContain(absent);
    const brief = briefRecu(srv.recus[0]!).split('\n');
    expect(brief.slice(1, 5)).toEqual([
      'Audience : Coureurs 25-40 ans',
      'Angle : Peur · tes lunettes glissent en pleine course',
      'Concept : La course sous la pluie',
      'Persona : qui · Camille, coureuse du dimanche ; frustration · Ses lunettes glissent dès qu’elle transpire ; désir · Finir sa course sans les remonter ; contexte · Urbaine active · Court 10 km le long du canal',
    ]);
    // Le devis à blanc (recette, mode shadow) calcule la MÊME requête que celle qui est partie.
    const rc = await requeteCompilationPas1(ctx(), { projectId, mode: 'generative_scene', maintenant: O.maintenant, modelePour: () => 'claude-sonnet-5' });
    expect(rc.ok, JSON.stringify(rc)).toBe(true);
    if (rc.ok) expect(rc.requete.messages.filter((m) => m.role === 'user').map((m) => m.contenu), 'le devis à blanc ne voit pas l’idée').toEqual([messageUtilisateur(srv.recus[0]!)]);
  });

  it('un persona d’une autre marque (même espace) ou d’un autre espace n’est jamais lu', async () => {
    for (const id of [personas.a2, personas.b1]) {
      srv.recus.length = 0;
      const projectId = await projetEpingle();
      await avecIdee(projectId, { angle: 'Preuve', personaRef: { id, label: 'LIBELLE-USURPE' } });
      await compiler(projectId);
      expect(srv.recus.length).toBe(1);
      const tout = JSON.stringify(srv.recus[0]);
      for (const absent of ['PERSONA-AUTRE-MARQUE', 'FRUSTRATION-AUTRE-MARQUE', 'PERSONA-AUTRE-ESPACE', 'FRUSTRATION-AUTRE-ESPACE', 'LIBELLE-USURPE']) expect(tout, `« ${absent} » est parti vers le modèle`).not.toContain(absent);
      expect(briefRecu(srv.recus[0]!)).not.toMatch(/^Persona :/m);
      expect(briefRecu(srv.recus[0]!)).toMatch(/^Angle : Preuve$/m);
    }
  });

  it('un persona rejeté ou archivé de la marque n’est jamais lu', async () => {
    for (const id of [personas.rejete, personas.archive]) {
      srv.recus.length = 0;
      const projectId = await projetEpingle();
      await avecIdee(projectId, { angle: 'Preuve', personaRef: { id, label: 'Ancien' } });
      await compiler(projectId);
      expect(srv.recus.length).toBe(1);
      const tout = JSON.stringify(srv.recus[0]);
      for (const absent of ['PERSONA-REJETE', 'FRUSTRATION-REJETE', 'PERSONA-ARCHIVE', 'FRUSTRATION-ARCHIVE']) expect(tout, `« ${absent} » est parti vers le modèle (persona rejeté ou archivé)`).not.toContain(absent);
      expect(briefRecu(srv.recus[0]!)).not.toMatch(/^Persona :/m);
    }
  });

  it('un persona « proposé » (pas encore validé) EST lu · il a été choisi au brief, le brief ne bloque pas sur la validation', async () => {
    const projectId = await projetEpingle();
    await avecIdee(projectId, { angle: 'Preuve', personaRef: { id: personas.propose, label: 'Proposé' } });
    await compiler(projectId);
    expect(briefRecu(srv.recus[0]!)).toMatch(/^Persona : qui · Persona proposé ; frustration · Frustration proposée$/m);
  });

  it('le gabarit reçu est image.compile 1.1.0 du pack embarqué, identique au JSON source', async () => {
    const projectId = await projetEpingle();
    await compiler(projectId);
    const source = JSON.parse(readFileSync(join(__dirname, '../../../../docs/studios-v2/02-PROMPTS.json'), 'utf8')) as { templates: Array<{ key: string; version: string; taskInstructions: string }> };
    const embarque = JSON.parse(PACK_EMBARQUE.prompts.texte) as typeof source;
    const t = source.templates.find((x) => x.key === 'image.compile')!;
    expect(embarque.templates.find((x) => x.key === 'image.compile'), 'copie embarquée ≠ JSON source').toEqual(t);
    const systeme = srv.recus[0]!.system.map((b) => b.text).join('\n');
    expect(systeme, 'la consigne de scène par angle n’est pas partie').toContain(t.taskInstructions);
    expect(t.version).toBe('1.1.0');
  });
});

describe('variété d’un lot d’angles · mesurée sur les consignes compilées', () => {
  it('deux angles → deux consignes, deux scènes · le lot passe', async () => {
    const peur = await projetEpingle();
    const preuve = await projetEpingle();
    await avecIdee(peur, { angle: 'Peur' });
    await avecIdee(preuve, { angle: 'Preuve' });
    await compilerEtRetenir(peur);
    await compilerEtRetenir(preuve);
    const r = await controlerVarieteLotPour(ctx(), [peur, preuve]);
    expect(r).toEqual({ ok: true, verdict: { ok: true, scenes: [SCENES.Peur, SCENES.Preuve], avertissements: [] } });
  });

  it('un doublon de scène · refus avec la raison, sans écriture ; régénérer la consigne (appel texte sous la barrière) lève le refus', async () => {
    const peur = await projetEpingle();
    const preuve = await projetEpingle();
    await avecIdee(peur, { angle: 'Peur' });
    await avecIdee(preuve, { angle: 'Preuve' });
    sceneFixe = SCENES.Peur!;
    await compilerEtRetenir(peur);
    await compilerEtRetenir(preuve);

    const avant = await compter(db);
    const r = await controlerVarieteLotPour(ctx(), [peur, preuve]);
    expect(delta(avant, await compter(db)), 'le contrôle du lot a écrit ou dépensé').toEqual({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verdict).toEqual({
      ok: false, aRegenerer: [preuve], avertissements: [],
      doublons: [{ ids: [peur, preuve], angles: ['Peur', 'Preuve'], scene: SCENES.Peur }],
      raison: `Lot refusé · les consignes de « Peur » et de « Preuve » montrent la même scène (« ${SCENES.Peur} »). Régénère la consigne de « Preuve » (un appel texte, sous la barrière de dépense) avant de lancer le lot. Rien n’a été généré.`,
    });

    // Régénérer la consigne désignée · UN appel texte, réservé par la barrière (une ligne ai_spend), aucun devis ni job.
    sceneFixe = null;
    srv.recus.length = 0;
    const avantRegen = await compter(db);
    await compilerEtRetenir(preuve);
    const d = delta(avantRegen, await compter(db));
    expect({ appels: srv.recus.length, depenses: d.depenses, devis: d.devis, jobs: d.jobs }).toEqual({ appels: 1, depenses: 1, devis: undefined, jobs: undefined });
    expect(await controlerVarieteLotPour(ctx(), [peur, preuve])).toEqual({ ok: true, verdict: { ok: true, scenes: [SCENES.Peur, SCENES.Preuve], avertissements: [] } });
  });

  it('deux projets de même titre, sans angle, scènes différentes · le lot passe (aucun repli sur le titre)', async () => {
    const a = await projetEpingle();
    const b = await projetEpingle();
    await db.update(schema.studioProjects).set({ title: 'Lunettes · même titre' }).where(eq(schema.studioProjects.id, b));
    await db.update(schema.studioProjects).set({ title: 'Lunettes · même titre' }).where(eq(schema.studioProjects.id, a));
    sceneFixe = SCENES.Peur!;
    await compilerEtRetenir(a);
    sceneFixe = SCENES.Preuve!;
    await compilerEtRetenir(b);
    expect(await controlerVarieteLotPour(ctx(), [a, b]), 'deux projets de même titre refusés comme un même angle').toEqual({ ok: true, verdict: { ok: true, scenes: [SCENES.Peur, SCENES.Preuve], avertissements: [] } });
  });

  it('le même projet deux fois · refus INVALID_SCHEMA, rien lu', async () => {
    const a = await projetEpingle();
    expect(await controlerVarieteLotPour(ctx(), [a, a.toUpperCase()]), 'un projet compté deux fois dans le lot').toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
  });

  it('un projet sans consigne retenue · refus MISSING_REFERENCE, rien d’écrit', async () => {
    const peur = await projetEpingle();
    const avant = await compter(db);
    expect(await controlerVarieteLotPour(ctx(), [peur])).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    expect(delta(avant, await compter(db))).toEqual({});
  });
});
