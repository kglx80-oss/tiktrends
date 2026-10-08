import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * Recette Studios · lot E · la commande du PAS 1 (premier rendu image) jouée
 * en mode SIMULÉ, sur une VRAIE base (pglite + migrations réelles) : adaptateur
 * texte simulé pour `image.compile`, fournisseur fal de PRODUCTION contre un
 * `fetch` FACTICE qui rejoue la file fal (aucun réseau, 0 $), moteur RÉEL du
 * worker, décodeur RÉEL (sharp), stockage local dans un dossier temporaire.
 *
 * On lit les RÉSULTATS : lignes en base, appels reçus par le faux fal, fichier
 * de rapport et fichier livré sur le disque.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db, schema } from '@tiktrends/db';
import { semerRecette } from '../scripts/recette/semer';
import { executerPas1, lireOptionsPas1 } from '../scripts/recette/pas1';
import { annoncePas1, deciderPas1, lireMontantUsd, masquerSecrets, rapportPas1, texteAnnonce, type DonneesRapportPas1 } from '../scripts/recette/regles';
import { adaptateurSimule } from './l2-adaptateur-simule';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

/** Valeurs SENTINELLES · aucune ne doit apparaître dans un rapport ni dans le journal. */
const SECRETS = {
  FAL_KEY: 'fal-sentinelle-7f3a9c2e', ANTHROPIC_API_KEY: 'sk-ant-sentinelle-41d8', POSTGRES_PASSWORD: 'mdpSentinelle987',
  AUTH_SECRET: 'auth-sentinelle-55b1', S3_SECRET_ACCESS_KEY: 's3-sentinelle-0c4e',
};
const ENV = {
  TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15',
  DATABASE_URL: `postgres://recette:${SECRETS.POSTGRES_PASSWORD}@127.0.0.1:5432/tiktrends_recette`,
  STUDIO_FOURNISSEUR_REEL: 'autorise', ...SECRETS,
};

const texte = adaptateurSimule((a: AppelModele) => {
  const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
  return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
    generationInstruction: 'Coureuse de face sur un sentier au matin, lunettes bleues et bandeau bleu portés, lumière douce, cadrage poitrine.',
    negativeConstraints: ['Aucun autre produit visible'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
    referenceBindings: ti.referenceIds.filter((id) => id.startsWith('pph_')).map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
  } };
});

/* ── Le faux fal · file rejouée, compteur des soumissions, plafond lu au moment de soumettre ── */
const fal = { mode: 'termine' as 'termine' | 'en_cours', soumissions: 0, appels: 0, plafondsVus: [] as Array<string | undefined>, png: new Uint8Array() };
const REQ = 'e5ec0000-0000-4000-8000-0000000fa101';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
const fetchFactice = (async (url: string | URL | Request, init?: RequestInit) => {
  fal.appels += 1;
  const u = String(url);
  if ((init?.method ?? 'GET') === 'POST') {
    fal.soumissions += 1;
    fal.plafondsVus.push(process.env.AI_SPEND_CAP_USD);
    return json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` });
  }
  if (u.endsWith(`/requests/${REQ}/status`)) return json(200, fal.mode === 'termine' ? { status: 'COMPLETED', response_url: BASE_REQ } : { status: 'IN_PROGRESS' });
  if (u.endsWith(`/requests/${REQ}`)) return json(200, { images: [{ url: 'https://v3.fal.media/files/recette/scene.png', content_type: 'image/png', width: 1080, height: 1350 }] });
  if (u.startsWith('https://v3.fal.media/')) return new Response(fal.png as unknown as BodyInit, { status: 200, headers: { 'content-length': String(fal.png.length) } });
  throw new Error(`appel non prévu ${u}`);
}) as typeof fetch;

let sortie = '';
const journal: string[] = [];
const lancer = (argv: string[], env: Record<string, string | undefined> = ENV, maxMs = 20_000) => executerPas1({
  env, argv, adaptateur: texte, fetch: fetchFactice, sortie, simule: true,
  verifierAdresse: async () => true, attente: { maxMs, pasMs: 10 }, dormir: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  journal: (l) => journal.push(l),
});
const compte = async (t: PgTable) => (await db.select().from(t)).length;
const rien = async () => ({
  depenses: await compte(schema.aiSpend), devis: await compte(schema.studioQuotes), jobs: await compte(schema.studioJobs), runs: await compte(schema.studioPromptRuns),
});

beforeAll(async () => {
  sortie = mkdtempSync(join(tmpdir(), 'recette-pas1-'));
  const r = await semerRecette(ENV, { maintenant: new Date('2026-10-08T10:00:00Z') });
  if (!r.ok) throw new Error(r.raisons.join(' ; '));
  fal.png = new Uint8Array(await sharp({ create: { width: 1080, height: 1350, channels: 3, background: { r: 240, g: 180, b: 120 } } }).png().toBuffer());
}, 120_000);
afterAll(() => { if (sortie) rmSync(sortie, { recursive: true, force: true }); });

describe('Pas 1 · règles pures', () => {
  it('annonce au centime supérieur, confirmation exacte, plafond de passe ≤ 1 $', () => {
    const a = annoncePas1({ compilationUsd: 0.132, imageUsdMicros: 80_000 });
    expect(a).toEqual({ compilationUsdMicros: 132_000, imageUsdMicros: 80_000, totalUsdMicros: 212_000, afficheUsdMicros: 220_000 });
    const budget = { capUsd: 15, depenseUsd: 0 };
    expect(deciderPas1({ annonce: a, confirmation: '0,22', plafondPasseUsdMicros: 1_000_000, budget })).toEqual({ ok: true, capPasseUsd: 0.22, confirmeUsdMicros: 220_000 });
    expect(deciderPas1({ annonce: a, confirmation: '0.22 $', plafondPasseUsdMicros: 1_000_000, budget }).ok).toBe(true);
    const codes = (c: string | null, p = 1_000_000, b = budget) => { const d = deciderPas1({ annonce: a, confirmation: c, plafondPasseUsdMicros: p, budget: b }); return d.ok ? [] : d.refus.map((r) => r.code); };
    expect(codes(null)).toEqual(['CONFIRMATION_ABSENTE']);
    expect(codes('0,21')).toEqual(['CONFIRMATION_DIFFERENTE']);
    expect(codes('0,212')).toEqual(['CONFIRMATION_DIFFERENTE']);
    expect(codes('0,22', 100_000)).toEqual(['DEVIS_AU_DELA_DU_PLAFOND_DE_PASSE']);
    expect(codes('0,22', 2_000_000)).toEqual(['PLAFOND_PASSE_INVALIDE']);
    expect(codes('0,22', 1_000_000, { capUsd: 15, depenseUsd: 14.9 })).toEqual(['BUDGET_ESSAI_INSUFFISANT']);
    // La barrière ne dépasse jamais le plafond de l'environnement.
    const d = deciderPas1({ annonce: a, confirmation: '0,22', plafondPasseUsdMicros: 1_000_000, budget: { capUsd: 15, depenseUsd: 14.7 } });
    expect(d.ok && d.capPasseUsd).toBe(14.92);
    expect(lireMontantUsd('abc')).toBeNull();
    expect(texteAnnonce(a)).toContain('plafond de passe PROPOSÉ           · 1,00 $ (proposition à approuver par le propriétaire, pas une dépense approuvée)');
    expect(masquerSecrets(`clé ${SECRETS.FAL_KEY} base ${ENV.DATABASE_URL} mdp ${SECRETS.POSTGRES_PASSWORD}`, ENV)).toBe('clé [masqué] base [masqué] mdp [masqué]');
    expect(lireOptionsPas1(['--inconnue'])).toEqual({ ok: false, raison: 'Option inconnue « --inconnue ».' });
  });

  it('le rapport dit SIMULÉ, le chemin à regarder et une empreinte qui ne concorde pas', () => {
    const d: DonneesRapportPas1 = {
      mode: 'SIMULE', horodatage: '2026-10-08T10:00:00.000Z',
      ids: { workspaceId: 'w', brandId: 'b', projectId: 'p', versionId: 'v', runId: 'r', devisId: 'q', jobId: 'j', assetId: 'a' },
      annonce: annoncePas1({ compilationUsd: 0.132, imageUsdMicros: 80_000 }), confirmeUsdMicros: 220_000, capPasseUsd: 0.22,
      etatJob: 'completed', raisonEchec: null, qualite: 'requires_review',
      depenses: [{ provider: 'fal', modele: 'fal_image', action: 'studio.generation', reserveUsd: 0.08, regleUsd: 0.08 }], registre: [],
      livrable: { chemin: '/sorties/livrables/x.png', aTransmettre: '/sorties/a-transmettre/recette-pas1-j.png', cle: 'x.png', mime: 'image/png', octets: 10, sha256Base: 'aa', sha256Fichier: 'bb', largeurBase: 1080, hauteurBase: 1350, largeurDecodee: 1080, hauteurDecodee: 1350 },
      budgetPas2UsdMicros: 14_780_000, arret: null,
    };
    const md = rapportPas1(d);
    expect(md).toContain('> SIMULÉ · fournisseur factice, aucun appel réel, aucune dépense. Ce rapport ne vaut PAS recette réelle.');
    expect(md).toContain('Fichier à REGARDER · `/sorties/livrables/x.png`');
    expect(md).toContain('Copie à TRANSMETTRE au relecteur · `/sorties/a-transmettre/recette-pas1-j.png`');
    expect(md).toContain('(DIFFÉRENTE · le fichier ne correspond pas au média enregistré)');
    expect(md).toContain('Budget restant pour le pas 2 (benchmark) · 14,78 $');
    expect(md).not.toContain('—');
  });
});

describe('Pas 1 · commande en mode simulé sur une vraie base', () => {
  it('sans confirmation ⇒ refus, annonce affichée, RIEN écrit ni appelé', async () => {
    const r = await lancer([]);
    expect(r.code).toBe(2);
    expect(r.refus).toEqual(['CONFIRMATION_ABSENTE · Aucune confirmation · relance avec --confirmer-usd 0,22 (le montant maximal affiché, recopié).']);
    expect(journal[0]).toContain('TOTAL                              · 0,22 $ au plus');
    expect(await rien()).toEqual({ depenses: 0, devis: 0, jobs: 0, runs: 0 });
    expect(fal.appels).toBe(0);
    expect(texte.recues).toHaveLength(0);
  });

  it('devis au-delà du plafond de passe ⇒ refus, RIEN écrit ni appelé', async () => {
    const r = await lancer(['--plafond-passe-usd', '0,10', '--confirmer-usd', '0,22']);
    expect(r.code).toBe(2);
    expect(r.refus).toEqual(['DEVIS_AU_DELA_DU_PLAFOND_DE_PASSE · Devis 0,22 $ au plus > plafond de passe 0,10 $ · rien n’est lancé.']);
    expect(await rien()).toEqual({ depenses: 0, devis: 0, jobs: 0, runs: 0 });
    expect(fal.appels).toBe(0);
  });

  it('confirmation exacte, fal encore en cours ⇒ code 3 · relancée, elle REPREND le job sans seconde soumission', async () => {
    fal.mode = 'en_cours';
    const r1 = await lancer(['--confirmer-usd', '0,22'], ENV, 1_500);
    expect(r1.code).toBe(3);
    expect(fal.soumissions).toBe(1);
    // La barrière de la passe était posée au moment de soumettre : dépense 0 + 0,22 confirmés.
    expect(fal.plafondsVus).toEqual(['0.22']);
    expect(process.env.AI_SPEND_CAP_USD).toBeUndefined();
    expect(readFileSync(r1.rapport!, 'utf8')).toContain('toujours « running »');

    fal.mode = 'termine';
    const r2 = await lancer(['--confirmer-usd', '0,22']);
    expect(r2.code).toBe(0);
    expect(r2.jobId).toBe(r1.jobId);
    expect(fal.soumissions).toBe(1);
    expect(await compte(schema.studioJobs)).toBe(1);
    expect(await compte(schema.studioQuotes)).toBe(1);
    expect(texte.recues).toHaveLength(1); // une seule compilation

    const [job] = await db.select().from(schema.studioJobs);
    expect(job!.state).toBe('completed');
    const [asset] = await db.select().from(schema.studioAssets);
    const md = readFileSync(r2.rapport!, 'utf8');
    expect(md).toContain('# Recette Studios · pas 1 · premier rendu image SIMULÉ');
    expect(md).toContain(`| Job | \`${job!.id}\` |`);
    expect(md).toContain(`| Média livré | \`${asset!.id}\` |`);
    expect(md).toContain('dimensions enregistrées · 1080 × 1350 · décodées · 1080 × 1350 (identiques)');
    expect(md).toContain(`SHA-256 du fichier relu · \`${asset!.sha256}\` (identique)`);
    expect(md).toContain('| fal | fal_image | studio.generation | 0,0800 $ |');

    // Le fichier à regarder existe et c'est bien le média enregistré.
    const chemin = /Fichier à REGARDER · `([^`]+)`/.exec(md)![1]!;
    expect(chemin.startsWith(sortie)).toBe(true);
    expect(createHash('sha256').update(readFileSync(chemin)).digest('hex')).toBe(asset!.sha256);
    expect(readFileSync(join(sortie, 'rapport-pas1.md'), 'utf8')).toBe(md);

    // La copie à transmettre, à un chemin explicite nommé par le job, identique au média enregistré.
    const copie = join(sortie, 'a-transmettre', `recette-pas1-${job!.id}.png`);
    expect(md).toContain(`Copie à TRANSMETTRE au relecteur · \`${copie}\``);
    expect(createHash('sha256').update(readFileSync(copie)).digest('hex')).toBe(asset!.sha256);
  });

  it('livrable déjà produit ⇒ rapport réécrit, AUCUN appel, aucun job nouveau', async () => {
    const avant = { appels: fal.appels, soumissions: fal.soumissions };
    const r = await lancer(['--confirmer-usd', '0,22']);
    expect(r.code).toBe(0);
    expect(journal.some((l) => l.startsWith('Un livrable existe déjà'))).toBe(true);
    expect(fal).toMatchObject(avant);
    expect(await compte(schema.studioJobs)).toBe(1);
    expect(existsSync(r.rapport!)).toBe(true);
  });

  it('aucune valeur sensible dans les rapports écrits ni dans le journal', async () => {
    const rapports = readdirSync(sortie).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(sortie, f), 'utf8'));
    expect(rapports.length).toBeGreaterThanOrEqual(3);
    const tout = [...rapports, ...journal].join('\n');
    for (const v of Object.values(SECRETS)) expect(tout).not.toContain(v);
    expect(tout).not.toContain(ENV.DATABASE_URL);
    expect(statSync(join(sortie, 'a-transmettre')).isDirectory()).toBe(true);
  });

  it('cible hors recette ⇒ refus avant toute lecture', async () => {
    const r = await lancer(['--confirmer-usd', '0,22'], { ...ENV, TIKTRENDS_ENV: undefined, DATABASE_URL: 'postgres://tiktrends:x@db:5432/tiktrends' });
    expect(r.code).toBe(2);
    expect(r.annonce).toBeNull();
    expect(r.refus[0]).toBe('TIKTRENDS_ENV=recette absent · cette commande ne tourne que dans l’environnement de recette.');
  });
});
