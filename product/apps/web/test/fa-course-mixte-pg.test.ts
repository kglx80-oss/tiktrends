import { describe, it, expect, vi, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/**
 * F-A · R2 · course MIXTE site/worker sur un VRAI PostgreSQL.
 *
 * Constat de la contre-recette (8 octobre, P1) : `reserverDepense` verrouillait
 * les réservations du worker, mais la barrière web lisait la somme puis
 * insérait SANS ce verrou, et le chemin Anthropic n'écrivait qu'APRÈS l'appel.
 * « Une table commune n'est pas un verrou commun. » Exemple de la recette :
 * plafond 0,20 $, déjà 0,08 $, le web et le worker autorisent chacun 0,08 $ ⇒
 * 0,24 $.
 *
 * Ce banc rejoue ce scénario avec deux PROCESSUS distincts, comme en
 * production : ce fichier joue le site (`sousPlafond`, `guardedAnthropic` de
 * `lib/spend-guard.ts`, client `@tiktrends/db` du processus web), et
 * `apps/workers/test/fa-course-worker.ts` joue le worker (barrière composée
 * comme `src/studios/fournisseurs.ts`, son propre client et ses propres
 * connexions). Aucun fournisseur réel : le client Anthropic est un faux qui
 * compte, l'appel fal du worker est une fonction locale. 0 $, aucun réseau.
 *
 * Ignoré sans `FA_PG_URL` (la CI n'a pas de Postgres). Base LOCALE seulement :
 *   FA_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_fa pnpm exec vitest run test/fa-course-mixte-pg.test.ts
 * Les lignes écrites sont supprimées à la fin.
 */

const URL_PG = process.env.FA_PG_URL ?? '';
const locale = /^postgres:\/\/[^@]*@(127\.0\.0\.1|localhost):\d+\//.test(URL_PG);
const WORKERS = join(__dirname, '..', '..', 'workers');
const TSX = join(WORKERS, 'node_modules', '.bin', 'tsx');

/** Le faux client Anthropic · compte les appels, répond après `latenceMs` avec l'usage demandé. */
const faux = vi.hoisted(() => ({ appels: 0, latenceMs: 30, usage: { input_tokens: 1, output_tokens: 5000 } }));
vi.mock('@tiktrends/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/ai')>();
  return {
    ...actual,
    anthropicFromEnv: () => ({
      messages: {
        create: async () => {
          faux.appels += 1;
          await new Promise((r) => setTimeout(r, faux.latenceMs));
          return { content: [{ type: 'text', text: 'ok' }], usage: { ...faux.usage } };
        },
      },
    }),
  };
});

/** Paramètres d'un appel texte · max = 5000 × 15 $/M (sortie) + 1 jeton d'entrée × 3 $/M = 0,075003 $. */
const APPEL_TEXTE = { model: 'claude-sonnet-5', max_tokens: 5000, messages: [{ role: 'user' as const, content: 'x' }] };

async function charger() {
  process.env.DATABASE_URL = URL_PG;
  const dbm = await import('@tiktrends/db');
  const sg = await import('../lib/spend-guard');
  const core = await import('@tiktrends/core');
  return { ...dbm, ...sg, idDepenseDuJob: core.idDepenseDuJob, estimateCallCost: core.estimateCallCost };
}

function lancerWorker(env: Record<string, string>) {
  const p = spawn(TSX, ['test/fa-course-worker.ts'], { cwd: WORKERS, env: { ...process.env, DATABASE_URL: URL_PG, ...env } }) as ChildProcessWithoutNullStreams;
  const lignes: string[] = [];
  const attentes: Array<{ test: (l: string) => boolean; ok: (l: string) => void }> = [];
  let tampon = '';
  let erreurs = '';
  p.stderr.on('data', (d) => { erreurs += String(d); });
  p.stdout.on('data', (d) => {
    tampon += String(d);
    let i: number;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const l = tampon.slice(0, i); tampon = tampon.slice(i + 1);
      lignes.push(l);
      for (const a of [...attentes]) if (a.test(l)) { attentes.splice(attentes.indexOf(a), 1); a.ok(l); }
    }
  });
  const fin = new Promise<number>((ok) => p.on('exit', (c) => ok(c ?? -1)));
  return {
    p,
    attendre: (test: (l: string) => boolean, ms = 30_000) => new Promise<string>((ok, ko) => {
      const deja = lignes.find(test);
      if (deja) return ok(deja);
      const t = setTimeout(() => ko(new Error(`worker muet (${erreurs.slice(0, 400)})`)), ms);
      attentes.push({ test, ok: (l) => { clearTimeout(t); ok(l); } });
    }),
    resultat: async () => {
      const code = await fin;
      const l = lignes.find((x) => x.startsWith('{'));
      if (code !== 0 || !l) throw new Error(`worker en échec (code ${code}) · ${erreurs.slice(0, 400)}`);
      return JSON.parse(l) as { passees: number; appels: number; refus: number; jobs: string[] };
    },
  };
}

describe.skipIf(!locale)('course mixte site/worker sur PostgreSQL réel · le plafond tient', () => {
  const nettoyages: Array<() => Promise<unknown>> = [];
  afterAll(async () => { for (const n of nettoyages) await n().catch(() => null); });

  async function preparer(cap: string) {
    const m = await charger();
    const [avant] = await m.db.select({ id: m.schema.aiSpend.id }).from(m.schema.aiSpend).limit(1);
    expect(avant, 'base locale non vide en ai_spend · restaurer avant le banc').toBeUndefined();
    process.env.AI_SPEND_CAP_USD = cap;
    nettoyages.push(() => m.db.delete(m.schema.aiSpend));
    return m;
  }

  const somme = async (m: Awaited<ReturnType<typeof charger>>) => {
    const lignes = await m.db.select({ a: m.schema.aiSpend.actualUsd }).from(m.schema.aiSpend);
    return Math.round(lignes.reduce((s, l) => s + l.a, 0) * 1e6) / 1e6;
  };

  it('scénario de la recette · plafond 0,20 $, déjà 0,08 $, web fixe 0,08 $ et worker 0,08 $ ⇒ un seul passe', async () => {
    const m = await preparer('0.2');
    await m.db.insert(m.schema.aiSpend).values({ provider: 'fal', model: 'fal_image', action: 'fa:course:deja', estimatedUsd: 0.08, actualUsd: 0.08 });
    // Le worker lit 0,08 $ sous son verrou puis tient sa décision 1,5 s.
    const w = lancerWorker({ FA_MODE: 'verrou', FA_TENUE_MS: '1500', FA_USD: '0.08', AI_SPEND_CAP_USD: '0.2' });
    await w.attendre((l) => l.startsWith('VERROU'));
    // Pendant cette fenêtre, le site tente sa dépense.
    const web = await m.sousPlafond('fal_image', { workspaceId: randomUUID(), action: 'fa:course:web' }, async () => 'parti').then(() => 1, (e) => {
      expect(e).toBeInstanceOf(m.SpendBlockedError);
      return 0;
    });
    const r = await w.resultat();
    const total = await somme(m);
    try {
      expect({ passages: web + r.passees, total }, `dépassement · web ${web}, worker ${r.passees}, total ${total} $ pour un plafond de 0,20 $`).toEqual({ passages: 1, total: 0.16 });
    } finally { await m.db.delete(m.schema.aiSpend); }
  }, 60_000);

  it('même scénario, côté Anthropic · le maximum de l’appel texte est réservé AVANT, il ne passe plus', async () => {
    const m = await preparer('0.2');
    faux.appels = 0;
    faux.usage = { input_tokens: 1, output_tokens: 5000 };    // réponse coupée à max_tokens : coût réel = maximum
    await m.db.insert(m.schema.aiSpend).values({ provider: 'fal', model: 'fal_image', action: 'fa:course:deja', estimatedUsd: 0.08, actualUsd: 0.08 });
    const w = lancerWorker({ FA_MODE: 'verrou', FA_TENUE_MS: '1500', FA_USD: '0.08', AI_SPEND_CAP_USD: '0.2' });
    await w.attendre((l) => l.startsWith('VERROU'));
    const client = m.guardedAnthropic({ workspaceId: randomUUID(), action: 'fa:course:anthropic' })!;
    const texte = await client.messages.create(APPEL_TEXTE).then(() => 1, (e) => {
      expect(e).toBeInstanceOf(m.SpendBlockedError);
      return 0;
    });
    const r = await w.resultat();
    const total = await somme(m);
    try {
      expect({ passages: texte + r.passees, appelsAnthropic: faux.appels, total }, `dépassement · Anthropic ${texte}, worker ${r.passees}, total ${total} $ pour 0,20 $`)
        .toEqual({ passages: 1, appelsAnthropic: 0, total: 0.16 });
    } finally { await m.db.delete(m.schema.aiSpend); }
  }, 60_000);

  it('cinq manches · web fixe + web Anthropic + worker simultanés contre un plafond serré · la somme ne dépasse jamais', async () => {
    const m = await preparer('0.5');
    const manches: Array<{ manche: number; passesWeb: number; passesWorker: number; appelsAnthropic: number; total: number }> = [];
    for (let manche = 0; manche < 5; manche++) {
      faux.appels = 0;
      faux.latenceMs = 20 + manche * 10;
      // Une manche sur deux, la réponse s'arrête à max_tokens (coût réel = maximum).
      faux.usage = manche % 2 === 0 ? { input_tokens: 1, output_tokens: 5000 } : { input_tokens: 800, output_tokens: 900 };
      // Les deux côtés partent par vagues (un départ toutes les 2 ms) : leurs
      // réservations se croisent dans la file du verrou au lieu de s'y suivre en bloc.
      const w = lancerWorker({ FA_MODE: 'course', FA_JOBS: '8', FA_USD: '0.08', FA_PAS_MS: '2', AI_SPEND_CAP_USD: '0.5' });
      // Connexions du site ouvertes avant le départ, comme celles du worker.
      await Promise.all(Array.from({ length: 10 }, () => m.db.execute(m.sql`select pg_sleep(0.05)`)));
      await w.attendre((l) => l === 'PRET');
      // Départ commun, décalé de quelques millisecondes selon la manche : qui
      // prend le verrou en premier change, la course n'a pas toujours le même vainqueur.
      const depart = Date.now() + 300;
      w.p.stdin.write(`GO ${depart + [-3, -1, 0, 1, 3][manche]!}\n`);
      await new Promise((r) => setTimeout(r, depart - Date.now()));
      const client = m.guardedAnthropic({ workspaceId: randomUUID(), action: 'fa:course:anthropic' })!;
      const vague = (i: number) => new Promise((r) => setTimeout(r, i * 2));
      const web = await Promise.allSettled([
        ...Array.from({ length: 8 }, (_, i) => vague(i).then(() => m.sousPlafond('fal_image', { workspaceId: randomUUID(), action: 'fa:course:web' }, async () => 'parti'))),
        ...Array.from({ length: 6 }, (_, i) => vague(i).then(() => client.messages.create(APPEL_TEXTE))),
      ]);
      const r = await w.resultat();
      const total = await somme(m);
      const passesWeb = web.filter((x) => x.status === 'fulfilled').length;
      for (const x of web) if (x.status === 'rejected') expect(x.reason).toBeInstanceOf(m.SpendBlockedError);
      manches.push({ manche, passesWeb, passesWorker: r.passees, appelsAnthropic: faux.appels, total });
      await m.db.delete(m.schema.aiSpend);
    }
    console.log('[fa-course-mixte] manches', JSON.stringify(manches));
    const depassements = manches.filter((x) => x.total > 0.5 + 1e-9);
    expect(depassements, `plafond 0,50 $ dépassé : ${JSON.stringify(depassements)}`).toEqual([]);
    // La course a bien eu lieu : chaque manche a refusé quelque chose et laissé passer quelque chose.
    for (const x of manches) expect(x.passesWeb + x.passesWorker).toBeGreaterThan(0);
    for (const x of manches) expect(x.passesWeb + x.passesWorker).toBeLessThan(22);
    // Mixte pour de bon : le site ET le worker ont obtenu des réservations sur l'ensemble des manches.
    expect(manches.reduce((s, x) => s + x.passesWorker, 0), 'le worker n’a jamais rien réservé · la course n’était pas mixte').toBeGreaterThan(0);
    expect(manches.reduce((s, x) => s + x.passesWeb, 0), 'le site n’a jamais rien réservé · la course n’était pas mixte').toBeGreaterThan(0);
  }, 180_000);
});
