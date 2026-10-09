import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * E2 · la commande du PAS 1 sous le budget d'essai CUMULATIF (15 $ au total,
 * registre hors base) et avec la REPRISE du seul contrôle visuel manquant.
 *
 * Vraie base (pglite + migrations), semis de recette, adaptateur texte simulé
 * (compilation ET contrôle visuel, routés au modèle réel), fournisseur fal de
 * PRODUCTION contre un `fetch` factice (0 $), moteur RÉEL, décodeur RÉEL,
 * registre dans un dossier temporaire. On lit les RÉSULTATS : appels reçus,
 * lignes en base, fichiers du registre et du journal, rapport écrit.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db, schema, eq } from '@tiktrends/db';
import { lireMarqueurControleVision } from '@tiktrends/core';
import { semerRecette } from '../scripts/recette/semer';
import { executerPas1 } from '../scripts/recette/pas1';
import { usdAffiche } from '../scripts/recette/regles';
import { FICHIER_JOURNAL, FICHIER_REGISTRE, lireRegistre } from '../scripts/recette/registre';
import { lireBudget } from '../scripts/recette/budget';
import { saisirAnterieure } from '../scripts/recette/budget-saisir';
import { adaptateurSimule } from './l2-adaptateur-simule';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

const ENV = {
  TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15',
  DATABASE_URL: 'postgres://recette:mdp-e2-registre@127.0.0.1:5432/tiktrends_recette',
  STUDIO_FOURNISSEUR_REEL: 'autorise', FAL_KEY: 'fal-e2-factice-9d1c', ANTHROPIC_API_KEY: 'sk-e2-factice-77aa',
};

/** Le comportement du contrôle visuel simulé · réponse conforme, ou coupure (issue incertaine). */
const vision = { mode: 'ok' as 'ok' | 'coupure' };
const brut = adaptateurSimule((a: AppelModele) => {
  if (a.profil === 'vision_analysis') {
    if (vision.mode === 'coupure') throw new Error('socket hang up');
    return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: { verdict: 'passed', issues: [], unverifiable: [], summary: 'Lunettes visibles' } };
  }
  const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
  return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
    generationInstruction: 'Coureuse de face sur un sentier au matin, lunettes bleues et bandeau bleu portés, lumière douce, cadrage poitrine.',
    negativeConstraints: ['Aucun autre produit visible'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
    referenceBindings: ti.referenceIds.filter((id) => id.startsWith('pph_')).map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
  } };
});
const texte = Object.assign(Object.create(brut) as typeof brut, { modelePour: (p: string) => (p === 'reasoning_structured' || p === 'vision_analysis' ? 'claude-sonnet-5' : null) });
const profils = () => brut.recues.map((a) => a.profil);

const fal = { appels: 0, soumissions: 0, plafonds: [] as Array<string | undefined>, png: new Uint8Array() };
const REQ = 'e2e20000-0000-4000-8000-0000000fa102';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const fetchFactice = (async (url: string | URL | Request, init?: RequestInit) => {
  fal.appels += 1;
  const u = String(url);
  if ((init?.method ?? 'GET') === 'POST') { fal.soumissions += 1; fal.plafonds.push(process.env.AI_SPEND_CAP_USD); return json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` }); }
  if (u.endsWith(`/requests/${REQ}/status`)) return json(200, { status: 'COMPLETED', response_url: BASE_REQ });
  if (u.endsWith(`/requests/${REQ}`)) return json(200, { images: [{ url: 'https://v3.fal.media/files/recette/scene.png', content_type: 'image/png', width: 1080, height: 1350 }] });
  if (u.startsWith('https://v3.fal.media/')) return new Response(fal.png as unknown as BodyInit, { status: 200, headers: { 'content-length': String(fal.png.length) } });
  throw new Error(`appel non prévu ${u}`);
}) as typeof fetch;

let sortie = '';
let registre = '';
let montant = '';
const journal: string[] = [];
const lancer = (argv: string[], dossier = registre) => executerPas1({
  env: ENV, argv, adaptateur: texte, fetch: fetchFactice, sortie, registre: dossier, simule: true,
  verifierAdresse: async () => true, attente: { maxMs: 20_000, pasMs: 10 }, dormir: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  journal: (l) => journal.push(l),
});
const compte = async (t: PgTable) => (await db.select().from(t)).length;
const avantEnv = { cle: process.env.ANTHROPIC_API_KEY, cap: process.env.AI_SPEND_CAP_USD, registre: process.env.RECETTE_REGISTRE };
const nouveauDossier = () => mkdtempSync(join(tmpdir(), 'e2-registre-'));
const lireFichier = (d: string, f: string) => (existsSync(join(d, f)) ? readFileSync(join(d, f), 'utf8') : null);

beforeAll(async () => {
  // Le fournisseur de vision est « configuré » : la ligne de contrôle visuel va au devis (comme en recette réelle).
  process.env.ANTHROPIC_API_KEY = 'sk-e2-factice-77aa';
  sortie = mkdtempSync(join(tmpdir(), 'e2-pas1-'));
  registre = nouveauDossier();
  const r = await semerRecette(ENV, { maintenant: new Date('2026-10-09T10:00:00Z') });
  if (!r.ok) throw new Error(r.raisons.join(' ; '));
  fal.png = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 240, g: 180, b: 120 } } }).png().toBuffer());
}, 120_000);
afterAll(() => {
  for (const x of [sortie, registre]) if (x) rmSync(x, { recursive: true, force: true });
  for (const [k, v] of [['ANTHROPIC_API_KEY', avantEnv.cle], ['AI_SPEND_CAP_USD', avantEnv.cap], ['RECETTE_REGISTRE', avantEnv.registre]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe('budget d’essai cumulatif · refus AVANT tout appel', () => {
  it('le devis affiché a trois colonnes et une réservation maximale qui inclut le contrôle visuel', async () => {
    const r = await lancer([]);
    expect(r.code).toBe(2);
    montant = usdAffiche(r.devis!.afficheUsdMicros).replace(' $', '');
    expect(r.devis!.lignes.map((l) => l.cle)).toEqual(['compilation', 'image', 'vision']);
    expect(journal[0]).toContain('estimation    réservation maximale  coût réglé');
    expect(journal[0], 'le montant à recopier n’est pas la réservation maximale').toContain(`Rien ne part sans --confirmer-usd ${montant} (la RÉSERVATION MAXIMALE`);
    expect(lireFichier(registre, FICHIER_REGISTRE), 'un refus a écrit le registre').toBeNull();
  });

  it('registre ABSENT alors que la base contient des dépenses ⇒ incohérence, refus, 0 appel', async () => {
    const [l] = await db.insert(schema.aiSpend).values({ workspaceId: null, provider: 'fal', model: 'x', action: 'avant', estimatedUsd: 0.08, actualUsd: 0.08 }).returning();
    const r = await lancer(['--confirmer-usd', montant]);
    await db.delete(schema.aiSpend).where(eq(schema.aiSpend.id, l!.id));
    expect(r.code, 'registre absent et base avec dépenses : la commande est partie').toBe(2);
    expect(r.refus[0]).toMatch(/^Registre du budget d’essai absent .* alors que la base de recette contient 1 dépense\(s\) · incohérence, rien ne part\./);
    expect({ fal: fal.appels, texte: brut.recues.length }).toEqual({ fal: 0, texte: 0 });
  });

  it('base NEUVE mais registre qui dit 14,90 $ déjà dépensés ⇒ le registre fait foi : refus, 0 appel', async () => {
    const d = nouveauDossier();
    process.env.RECETTE_REGISTRE = d;
    const s = await saisirAnterieure({ ...ENV, RECETTE_REGISTRE: d }, ['--usd', '14,90', '--motif', 'facture fal du 8 octobre (essai)']);
    expect(s.code, s.texte).toBe(0);
    const r = await lancer(['--confirmer-usd', montant], d);
    expect(r.code, 'une base neuve a rouvert un budget déjà dépensé (registre ignoré)').toBe(2);
    expect(r.refus.join('\n'), 'une base neuve a rouvert un budget déjà dépensé').toContain('BUDGET_ESSAI_INSUFFISANT · Budget d’essai insuffisant · autorisé 15,00 $, déjà engagé 14,90 $');
    expect({ fal: fal.appels, texte: brut.recues.length }).toEqual({ fal: 0, texte: 0 });
    // Registre illisible (ou autorisation relevée à la main) ⇒ refus aussi.
    const t = readFileSync(join(d, FICHIER_REGISTRE), 'utf8');
    writeFileSync(join(d, FICHIER_REGISTRE), t.replace('"usdMicros": 15000000', '"usdMicros": 50000000'));
    const r2 = await lancer(['--confirmer-usd', montant], d);
    expect(r2.refus[0]).toMatch(/^Registre du budget d’essai illisible/);
    delete process.env.RECETTE_REGISTRE;
    rmSync(d, { recursive: true, force: true });
  });
});

describe('passe complète, puis reprise du SEUL contrôle visuel', () => {
  it('confirmation exacte ⇒ livrable, contrôle visuel exécuté, registre et journal écrits, rapport à trois colonnes', async () => {
    const r = await lancer(['--confirmer-usd', montant]);
    expect(r.code, r.refus.join('\n')).toBe(0);
    expect(profils()).toEqual(['reasoning_structured', 'vision_analysis']);
    expect(fal.soumissions).toBe(1);
    // Plafond du processus au moment de payer fal : base vide au départ + réservation maximale confirmée, ≤ 15 $.
    expect(Number(fal.plafonds[0]), 'le plafond du processus n’est pas le restant calculé').toBeCloseTo(Number(montant.replace(',', '.')), 6);
    expect(Number(fal.plafonds[0])).toBeLessThanOrEqual(15);
    expect(process.env.AI_SPEND_CAP_USD, 'le plafond de passe a fui hors de la commande').toBe(avantEnv.cap);
    const reg = lireRegistre(lireFichier(registre, FICHIER_REGISTRE)!)!;
    const depenses = await db.select().from(schema.aiSpend);
    const regle = Object.values(reg.lignes).reduce((s, l) => s + l.regleMicros, 0);
    expect(regle, 'le registre n’a pas absorbé la dépense de la base').toBe(depenses.reduce((s, l) => s + Math.round(l.actualUsd * 1e6), 0));
    expect(regle).toBeGreaterThan(0);
    const types = lireFichier(registre, FICHIER_JOURNAL)!.trim().split('\n').map((l) => (JSON.parse(l) as { type: string }).type);
    expect(types).toEqual(['initialisation', 'synchro-apres', 'synchro-apres']);
    const md = readFileSync(r.rapport!, 'utf8');
    expect(md).toContain('| Ligne | Estimation | Réservation maximale | Coût réglé | Incertain (à réconcilier) |');
    expect(md).toContain('| génération de l’image (fal) | 0,0800 $ | 0,0800 $ | 0,0800 $ | 0,0000 $ |');
    expect(md).toMatch(/Contrôle visuel · qualité « /);
    expect(md).toMatch(/\*\*restant 14,9200 \$\*\*/);
  });

  it('image produite, contrôle interrompu avant l’appel ⇒ la relance lance SEUL le contrôle : 0 fal, 0 compilation, 0 devis, 0 job', async () => {
    const [j] = await db.select().from(schema.studioJobs);
    const { controleVision: _, ...reste } = j!.result as Record<string, unknown>;
    await db.update(schema.studioJobs).set({ qualityStatus: 'pending', result: reste }).where(eq(schema.studioJobs.id, j!.id));
    const avant = { fal: fal.appels, devis: await compte(schema.studioQuotes), jobs: await compte(schema.studioJobs), profils: profils().length };
    const r = await lancer([]);
    expect(r.code, r.refus.join('\n')).toBe(0);
    expect(journal.some((l) => l.startsWith('Reprise du contrôle visuel approuvé')), 'le contrôle approuvé manquant n’a pas été repris').toBe(true);
    expect({ fal: fal.appels, devis: await compte(schema.studioQuotes), jobs: await compte(schema.studioJobs), nouveaux: profils().slice(avant.profils) }, 'la reprise a fait plus que le contrôle manquant').toEqual({ fal: avant.fal, devis: avant.devis, jobs: avant.jobs, nouveaux: ['vision_analysis'] });
    expect((await db.select().from(schema.studioJobs))[0]!.qualityStatus).not.toBe('pending');
  });

  it('contrôle à l’issue INCERTAINE ⇒ code 1, rapport qui dit quoi réconcilier ; la relance n’appelle rien', async () => {
    const [j] = await db.select().from(schema.studioJobs);
    const { controleVision: _, ...reste } = j!.result as Record<string, unknown>;
    await db.update(schema.studioJobs).set({ qualityStatus: 'pending', result: reste }).where(eq(schema.studioJobs.id, j!.id));
    vision.mode = 'coupure';
    const r1 = await lancer([]);
    expect(r1.code).toBe(1);
    expect(lireMarqueurControleVision((await db.select().from(schema.studioJobs))[0]!.result)).toMatchObject({ etat: 'incertain' });
    vision.mode = 'ok';
    const n = profils().length;
    const r2 = await lancer([]);
    expect(r2.code).toBe(1);
    expect(r2.refus.join('\n')).toContain('Contrôle visuel précédent à l’issue incertaine');
    expect(readFileSync(r2.rapport!, 'utf8')).toContain('Comment · compare ce montant à l’usage facturé par le fournisseur');
    expect(profils().length, 'un contrôle incertain a été relancé').toBe(n);
  });
});

describe('destruction de l’environnement · le registre survit, `recette:budget` n’écrit rien', () => {
  it('base vidée (nouveau volume) ⇒ le réglé reste au registre ; la lecture ne modifie ni registre ni journal', async () => {
    const env = { ...ENV, RECETTE_REGISTRE: registre };
    const avantLecture = (await lireBudget(env)).texte;
    const fichiers = [lireFichier(registre, FICHIER_REGISTRE), lireFichier(registre, FICHIER_JOURNAL)];
    await db.delete(schema.aiSpend);
    const apres = await lireBudget(env);
    expect(apres.code).toBe(0);
    const regle = (t: string) => /réglé {15}· ([\d,]+ \$)/.exec(t)?.[1];
    expect(regle(apres.texte), 'la destruction de la base a effacé le cumul').toBe(regle(avantLecture));
    expect(apres.texte).toContain('autorisé            · 15,00 $ au total');
    expect([lireFichier(registre, FICHIER_REGISTRE), lireFichier(registre, FICHIER_JOURNAL)], 'recette:budget a écrit').toEqual(fichiers);
  });
});
