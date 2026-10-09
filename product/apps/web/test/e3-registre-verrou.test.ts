import { describe, it, expect, vi, afterAll } from 'vitest';

/**
 * E3 · registre du budget d'essai · engagement DURABLE avant dépense et
 * VERROU interprocessus, éprouvés par de VRAIS processus (`child_process.fork`,
 * tsx, `test/e3-enfant-registre.ts`), jamais par des promesses d'un même
 * processus.
 *
 *  · course · 8 processus concurrents, registre à 14 $ comptés, 0,80 $ chacun
 *    ⇒ au plus UN accepté, total ≤ 15 $ ; idem avec deux bases distinctes ;
 *    registre vide ⇒ les 8 acceptés et les 8 engagements présents, réglés
 *    (aucune écriture perdue) ;
 *  · arrêt brutal · enfant tué (SIGKILL) après l'engagement, pendant
 *    l'« appel » ; sa base meurt avec lui ; dans une base NEUVE,
 *    `recette:budget` montre l'engagement compté et le restant diminué.
 *    Variante Postgres réelle (base supprimée puis recréée, commande
 *    `recette:budget` lancée pour de vrai) quand 127.0.0.1:5433 répond.
 *
 * On lit des RÉSULTATS : issues rendues par les enfants, contenu du registre
 * et du journal, sortie de `recette:budget`.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { fork, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, schema } from '@tiktrends/db';
import { BUDGET_ESSAIS_TOTAL_USD_MICROS } from '@tiktrends/core';
import { FICHIER_JOURNAL, FICHIER_REGISTRE, bilanRegistre, ecrireRegistre, engagerEssai, lireBaseDepuis, lireRegistre, registreVierge, type LigneBase } from '../scripts/recette/registre';
import { sousVerrou } from '../scripts/recette/verrou';
import { lireBudget } from '../scripts/recette/budget';

const WEB = process.cwd();
const WORKERS = join(WEB, '..', 'workers');
const ENFANT = join(WEB, 'test', 'e3-enfant-registre.ts');
const CHARGEUR = pathToFileURL(join(WEB, 'scripts', 'bench-studios-chargeur.mjs')).href;
const ENV = { TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15', DATABASE_URL: 'postgres://recette:x@127.0.0.1:5432/tiktrends_recette' };

const dossiers: string[] = [];
const nouveauDossier = () => { const d = mkdtempSync(join(tmpdir(), 'e3-registre-')); dossiers.push(d); return d; };
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });

function enfant(args: string[], env: Record<string, string> = {}): { p: ChildProcess; sortie: () => string } {
  let txt = '';
  const p = fork(ENFANT, args, { cwd: WORKERS, execArgv: ['--import', 'tsx', '--import', CHARGEUR], env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  p.stdout?.on('data', (b) => { txt += String(b); });
  p.stderr?.on('data', (b) => { txt += String(b); });
  return { p, sortie: () => txt };
}
const fin = (p: ChildProcess) => new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((ok) => {
  if (p.exitCode !== null || p.signalCode !== null) ok({ code: p.exitCode, signal: p.signalCode });
  else p.once('exit', (code, signal) => ok({ code, signal }));
});

/** Un registre initial · antérieur saisi, écrit sous verrou comme toute écriture. */
async function registreInitial(dossier: string, anterieuresMicros: number): Promise<void> {
  const r = registreVierge(new Date('2026-10-09T09:00:00Z'));
  if (anterieuresMicros > 0) r.anterieures.push({ id: 'facture', usdMicros: anterieuresMicros, motif: 'dépense antérieure (essai)', saisieLe: '2026-10-09T09:00:00Z' });
  await sousVerrou(dossier, (v) => ecrireRegistre(dossier, r, v));
}

interface Issue { accepte: boolean; raison?: string; id?: string; regle?: boolean; detentions: number[] }

/** N processus RÉELS, départ simultané (barrière), chacun engage 0,80 $ puis règle. */
async function course(dossier: string, n: number, lectures: Array<{ base: string; lignes: LigneBase[] }>, pauseMs: number): Promise<Issue[]> {
  const enfants = Array.from({ length: n }, (_, i) => {
    const l = lectures[i % lectures.length]!;
    return enfant(['course', dossier, l.base, String(pauseMs)], { E3_LECTURE: JSON.stringify({ lignes: l.lignes, depenseFenetreUsd: 0 }) });
  });
  const issues: Issue[] = [];
  await Promise.all(enfants.map(({ p, sortie }) => new Promise<void>((ok, ko) => {
    p.on('message', (m: { pret?: boolean; erreur?: string } & Partial<Issue>) => {
      if (m.pret) ok();
      else if (m.erreur) ko(new Error(m.erreur));
    });
    p.once('exit', (c) => ko(new Error(`enfant sorti (${c}) avant d’être prêt · ${sortie()}`)));
  })));
  const resultats = enfants.map(({ p, sortie }) => new Promise<void>((ok, ko) => {
    p.on('message', (m: { erreur?: string } & Partial<Issue>) => {
      if (m.erreur) ko(new Error(`${m.erreur} · ${sortie()}`));
      else if (typeof m.accepte === 'boolean') { issues.push(m as Issue); ok(); }
    });
  }));
  for (const { p } of enfants) p.send('go');
  await Promise.all(resultats);
  await Promise.all(enfants.map(({ p }) => fin(p)));
  return issues;
}

const lireReg = (d: string) => lireRegistre(readFileSync(join(d, FICHIER_REGISTRE), 'utf8'))!;
const journal = (d: string) => (existsSync(join(d, FICHIER_JOURNAL)) ? readFileSync(join(d, FICHIER_JOURNAL), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { type: string }) : []);
const ligneFal = (id: string): LigneBase => ({ id, provider: 'fal', model: 'fal_image', action: 'studio.generation', estimatedUsd: 0.05, actualUsd: 0.05, inputTokens: null, outputTokens: null, reconcileReason: null, createdAt: new Date('2026-10-09T08:00:00Z') });

// Huit processus tsx démarrent à chaque cas (≈ 5 à 9 s mesurés en local) · limite explicite, avec marge.
describe('verrou interprocessus · 8 processus réels, départ simultané', { timeout: 120_000 }, () => {
  it('registre à 14 $, chacun demande 0,80 $ ⇒ UN seul accepté, total ≤ 15 $, l’accepté engagé puis réglé', async () => {
    const d = nouveauDossier();
    await registreInitial(d, 14_000_000);
    const issues = await course(d, 8, [{ base: 'recette_a@1', lignes: [] }], 30);
    const acceptes = issues.filter((i) => i.accepte);
    expect(issues).toHaveLength(8);
    expect(acceptes.length, `${acceptes.length} commandes acceptées sur un restant de 1 $ · dépassement`).toBe(1);
    for (const i of issues.filter((x) => !x.accepte)) expect(i.raison).toContain('Budget d’essai insuffisant · autorisé 15,00 $, déjà engagé 14,80 $');
    const reg = lireReg(d);
    const b = bilanRegistre(reg);
    expect(b.autoriseMicros - b.restantMicros, 'total engagé au-delà de 15 $').toBeLessThanOrEqual(BUDGET_ESSAIS_TOTAL_USD_MICROS);
    expect(Object.values(reg.engagements).map((g) => [g.id, g.etat, g.regleMicros]), 'l’engagement accepté manque ou n’est pas réglé').toEqual([[acceptes[0]!.id, 'regle', 800_000]]);
    expect(b.restantMicros).toBe(200_000);
    expect(journal(d).map((e) => e.type).sort()).toEqual(['cloture', 'engagement']);
  });

  it('DEUX bases distinctes sur le même registre (13,90 $ saisis + 0,05 $ par base) ⇒ un seul accepté, total ≤ 15 $', async () => {
    const d = nouveauDossier();
    await registreInitial(d, 13_900_000);
    const issues = await course(d, 8, [{ base: 'recette_a@1', lignes: [ligneFal('ligne-a')] }, { base: 'recette_b@2', lignes: [ligneFal('ligne-b')] }], 30);
    const acceptes = issues.filter((i) => i.accepte);
    expect(acceptes.length, `${acceptes.length} commandes acceptées depuis deux bases · dépassement`).toBe(1);
    // Vérité : antérieur + les lignes des DEUX bases + ce qui a été accepté.
    const verite = 13_900_000 + 50_000 + 50_000 + acceptes.length * 800_000;
    expect(verite, 'dépense réelle au-delà de 15 $').toBeLessThanOrEqual(BUDGET_ESSAIS_TOTAL_USD_MICROS);
    const reg = lireReg(d);
    expect(Object.keys(reg.engagements)).toEqual([acceptes[0]!.id]);
    expect(Object.keys(reg.bases), 'la base de l’accepté n’a pas été fusionnée').toHaveLength(1);
  });

  it('registre vide, 8 × 0,80 $ ⇒ les 8 acceptés et les 8 engagements présents et réglés · aucune écriture perdue', async () => {
    const d = nouveauDossier();
    await registreInitial(d, 0);
    const issues = await course(d, 8, [{ base: 'recette_a@1', lignes: [] }], 0);
    expect(issues.filter((i) => i.accepte)).toHaveLength(8);
    const reg = lireReg(d);
    const engs = Object.values(reg.engagements);
    expect(engs.length, `${8 - engs.length} engagement(s) écrasé(s) par une écriture concurrente`).toBe(8);
    expect(engs.every((g) => g.etat === 'regle' && g.regleMicros === 800_000), 'un règlement a été perdu').toBe(true);
    expect(bilanRegistre(reg)).toMatchObject({ regleMicros: 6_400_000, engageMicros: 0, restantMicros: 8_600_000 });
    const types = journal(d).map((e) => e.type);
    expect(types.filter((t) => t === 'engagement')).toHaveLength(8);
    expect(types.filter((t) => t === 'cloture')).toHaveLength(8);
    // Mesure du seuil de péremption (VERROU_PERIME_MS = 30 s) · détention réelle, sans pause de test.
    const detentions = issues.flatMap((i) => i.detentions).sort((a, b) => a - b);
    console.log(`[e3:mesure] détention du verrou · ${detentions.length} prises · médiane ${detentions[Math.floor(detentions.length / 2)]!.toFixed(1)} ms · max ${detentions.at(-1)!.toFixed(1)} ms`);
    expect(detentions.at(-1)!).toBeLessThan(2_000);
    expect(existsSync(join(d, 'budget-essais.lock')), 'verrou laissé derrière').toBe(false);
  });
});

describe('arrêt brutal pendant l’appel · l’engagement survit à la base', { timeout: 120_000 }, () => {
  it('enfant tué (SIGKILL) après l’engagement ; base NEUVE ⇒ recette:budget montre l’engagement compté et le restant diminué', async () => {
    const d = nouveauDossier();
    await registreInitial(d, 1_000_000);
    const { p, sortie } = enfant(['tue-pglite', d]);
    const id = await new Promise<string>((ok, ko) => {
      p.on('message', (m: { enAppel?: boolean; id?: string; erreur?: string }) => { if (m.enAppel) ok(m.id!); else if (m.erreur) ko(new Error(m.erreur)); });
      p.once('exit', (c) => ko(new Error(`enfant sorti (${c}) · ${sortie()}`)));
    });
    p.kill('SIGKILL');
    expect((await fin(p)).signal).toBe('SIGKILL');
    // La base de l'enfant (en mémoire) est morte avec lui ; celle de ce processus est neuve, sans aucune dépense.
    expect(await db.select().from(schema.aiSpend)).toEqual([]);
    const r = await lireBudget({ ...ENV, RECETTE_REGISTRE: d });
    expect(r.code, r.texte).toBe(0);
    expect(r.texte, 'l’engagement d’un processus tué n’est pas compté').toContain('engagé (ouvert)     · 0,3300 $');
    expect(r.texte).toContain('réglé               · 0,0800 $');
    expect(r.texte, 'restant non diminué de l’engagement').toContain('RESTANT             · 13,5900 $');
    expect(r.texte).toContain(`- ${id} · recette:pas1 · 0,3300 $`);
    expect(journal(d).map((e) => e.type), 'une clôture a été écrite pour un processus tué').toEqual(['engagement']);
    // Une nouvelle commande, dans la base neuve, ne retrouve PAS les 0,33 $ engagés.
    const lu = await lireBaseDepuis(db);
    const refus = await engagerEssai(d, { commande: 'recette:bench', reservationMicros: 13_600_000, lu });
    expect(refus.ok, 'une base neuve a rouvert l’engagement d’un processus tué').toBe(false);
    expect((await engagerEssai(d, { commande: 'recette:bench', reservationMicros: 13_590_000, lu })).ok).toBe(true);
  });

  const pgDispo = spawnSync('pg_isready', ['-h', '127.0.0.1', '-p', '5433'], { encoding: 'utf8' }).status === 0
    && spawnSync('pg_restore', ['--version']).status === 0 && !!process.env.E3_DUMP_BASE_VIDE && existsSync(process.env.E3_DUMP_BASE_VIDE);

  it.skipIf(!pgDispo)('Postgres RÉEL · enfant tué, base SUPPRIMÉE puis recréée, la commande recette:budget lancée pour de vrai', async () => {
    const nom = `e3_recette_${process.pid}_${Date.now() % 100_000}`;
    const pg = (bin: string, ...a: string[]) => {
      const r = spawnSync(bin, ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', ...a], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`${bin} ${a.join(' ')} · ${r.stderr}`);
    };
    // Base de recette recréée · dump vide (55 migrations), puis les migrations du dépôt qui lui manquent.
    const recreer = () => {
      pg('createdb', nom);
      pg('pg_restore', '--no-owner', '-d', nom, process.env.E3_DUMP_BASE_VIDE!);
      // Le dump ne garde pas la table de suivi de drizzle · il porte les 55 premières migrations (E3_DUMP_MIGRATIONS).
      const n = Number(process.env.E3_DUMP_MIGRATIONS ?? 55);
      const dir = join(WEB, '..', '..', 'packages', 'db', 'drizzle');
      const tags = (JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }).entries.map((e) => e.tag);
      for (const t of tags.slice(n)) pg('psql', '-v', 'ON_ERROR_STOP=1', '-q', '-d', nom, '-f', join(dir, `${t}.sql`));
    };
    const url = `postgres://postgres@127.0.0.1:5433/${nom}`;
    try {
      recreer();
      const d = nouveauDossier();
      await registreInitial(d, 1_000_000);
      const { p, sortie } = enfant(['tue-pg', d], { DATABASE_URL: url });
      await new Promise<string>((ok, ko) => {
        p.on('message', (m: { enAppel?: boolean; id?: string; erreur?: string }) => { if (m.enAppel) ok(m.id!); else if (m.erreur) ko(new Error(m.erreur)); });
        p.once('exit', (c) => ko(new Error(`enfant sorti (${c}) · ${sortie()}`)));
      });
      p.kill('SIGKILL');
      await fin(p);
      pg('dropdb', '--force', nom);
      recreer();
      const r = spawnSync(process.execPath, ['--import', 'tsx', '--import', CHARGEUR, join(WEB, 'scripts', 'recette', 'budget.ts')], {
        cwd: WORKERS, encoding: 'utf8', env: { ...process.env, ...ENV, DATABASE_URL: url, RECETTE_REGISTRE: d },
      });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      expect(r.stdout, 'recette:budget, base recréée : l’engagement du processus tué n’est pas compté').toContain('engagé (ouvert)     · 0,3300 $');
      expect(r.stdout).toContain('RESTANT             · 13,5900 $');
    } finally {
      try { pg('dropdb', '--if-exists', '--force', nom); } catch { /* nettoyage */ }
    }
  });
});
