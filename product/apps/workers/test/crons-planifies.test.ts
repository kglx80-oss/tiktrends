import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Chaque route `/api/cron/*` du web est DÉCLENCHÉE par une tâche planifiée du
 * worker · ou exemptée, nommément, avec sa raison.
 *
 * ── Le trou que ce garde ferme ───────────────────────────────────────────────
 *
 * Deux fois, une route cron protégée existait sans que rien ne l'appelle · le
 * scan du tracker d'abord, puis le récapitulatif hebdomadaire (`/api/cron/digest`) :
 * ni notification `digest`, ni courriel, ni « Quoi de neuf ». L'ancien garde
 * (`apps/web/test/veille-scan-planifie.test.ts`, retiré au profit de celui-ci)
 * vérifiait une liste écrite à la main · une route absente de la liste n'était
 * regardée par personne.
 *
 * Ici rien n'est écrit à la main · les routes sont LUES SUR DISQUE
 * (`apps/web/app/api/cron/<nom>/route.ts`), et ce qui les déclenche est
 * CONSTATÉ : on exécute le VRAI point d'entrée du worker (`src/index.ts`,
 * BullMQ remplacé par un enregistreur), on relève les tâches répétées qu'il
 * planifie sur la file `cron`, puis on fait tourner le VRAI handler sur chacune
 * et on note l'adresse que son déclencheur appelle (`fetch` remplacé). Une
 * route que rien n'atteint fait tomber le garde.
 * 0 $ · aucun appel réseau, aucune connexion Redis, aucun modèle.
 */

/**
 * Les routes cron volontairement SANS déclencheur dans le worker · chacune
 * nommée, avec sa raison. Vide aujourd'hui · toutes sont planifiées.
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {};

type Ajout = { file: string; nom: string; opts?: { repeat?: { pattern?: string; tz?: string } } };
const h = vi.hoisted(() => ({
  ajouts: [] as Ajout[],
  handlers: new Map<string, (job: { name: string }) => Promise<unknown>>(),
  appels: [] as string[],
  logs: [] as string[],
}));

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(private n: string) {}
    add(nom: string, _d: unknown, opts?: Ajout['opts']) { h.ajouts.push({ file: this.n, nom, opts }); return Promise.resolve(); }
  },
  Worker: class {
    constructor(n: string, p: (job: { name: string }) => Promise<unknown>) { h.handlers.set(n, p); }
    on() { return this; }
  },
}));
vi.mock('ioredis', () => ({ default: class {} }));
vi.mock('@tiktrends/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/db')>()), db: null }));
vi.mock('../src/worker', () => ({ startWorkers: () => ({ studio: null }) }));
vi.mock('../src/ingest', () => ({ startIngestWorker: () => undefined }));
vi.mock('../src/sync', () => ({ runDailySync: async () => ({ synchro: 'locale' }) }));
vi.mock('../src/studios/boucle', () => ({ arretPropreSurSignal: () => undefined }));

import { FUSEAU_RECAP_HEBDO, MOTIF_RECAP_HEBDO } from '@tiktrends/core';

const DOSSIER_CRON = join(process.cwd(), '..', 'web', 'app', 'api', 'cron');
/** Les routes cron SUR DISQUE · un dossier `<nom>` qui porte un `route.ts`. */
const ROUTES = readdirSync(DOSSIER_CRON, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(DOSSIER_CRON, d.name, 'route.ts')))
  .map((d) => `/api/cron/${d.name}`)
  .sort();

/** Tâche planifiée → routes cron que son handler appelle. */
const atteintes = new Map<string, string[]>();

beforeAll(async () => {
  vi.stubEnv('CRON_SECRET', 'secret-de-test');
  vi.stubEnv('INTERNAL_APP_URL', 'http://web.test:3000');
  vi.stubGlobal('fetch', async (url: string | URL) => {
    h.appels.push(new URL(String(url)).pathname);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { h.logs.push(a.map(String).join(' ')); });
  vi.spyOn(process, 'exit').mockImplementation(((c?: number) => { throw new Error(`process.exit(${c}) · le point d’entrée a échoué`); }) as never);

  await import('../src/index');
  await vi.waitFor(() => expect(h.logs.some((l) => l.startsWith('[workers] up'))).toBe(true), { timeout: 20_000 });

  const handler = h.handlers.get('cron');
  if (!handler) throw new Error('le worker « cron » n’est pas démarré');
  for (const a of h.ajouts.filter((x) => x.file === 'cron' && x.opts?.repeat)) {
    h.appels = [];
    await handler({ name: a.nom });
    atteintes.set(a.nom, h.appels.filter((p) => p.startsWith('/api/cron/')));
  }
});

afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('chaque route cron est déclenchée par une tâche planifiée du worker', () => {
  it('témoin · les routes sont lues sur disque et le point d’entrée planifie bien des tâches', () => {
    expect(ROUTES.length, 'aucune route cron lue sur disque · le chemin du garde est faux').toBeGreaterThan(3);
    expect(ROUTES).toContain('/api/cron/digest');
    expect(atteintes.size, 'aucune tâche répétée relevée · l’enregistreur ne voit rien').toBeGreaterThan(3);
  });

  it('aucune route cron sans déclencheur planifié ni exemption nommée', () => {
    const declenchees = new Set([...atteintes.values()].flat());
    const orphelines = ROUTES.filter((r) => !declenchees.has(r) && !EXEMPTIONS[r]);
    expect(orphelines, `route(s) cron déclenchée(s) par AUCUNE tâche planifiée du worker : ${orphelines.join(', ')} · ajoute un déclencheur (triggerCron dans src/adsmap.ts), son cas dans le handler et sa planification (queues.cron.add, repeat) dans src/index.ts, ou exempte-la nommément dans EXEMPTIONS avec sa raison`).toEqual([]);
  });

  it('chaque tâche planifiée qui appelle une route cron appelle une route qui EXISTE', () => {
    for (const [tache, routes] of atteintes) {
      for (const r of routes) expect(ROUTES, `${tache} appelle ${r}, qui n’existe pas sur disque`).toContain(r);
    }
  });

  it('chaque exemption nomme une route qui existe, n’est pas planifiée, et dit pourquoi', () => {
    const declenchees = new Set([...atteintes.values()].flat());
    for (const [r, raison] of Object.entries(EXEMPTIONS)) {
      expect(ROUTES, `exemption périmée · ${r} n’existe plus`).toContain(r);
      expect(declenchees.has(r), `exemption inutile · ${r} est planifiée`).toBe(false);
      expect(raison.trim().length, `exemption de ${r} sans raison`).toBeGreaterThan(20);
    }
  });

  it('le récapitulatif hebdomadaire · weekly-digest, lundi matin heure de Paris, vers /api/cron/digest', () => {
    const digest = h.ajouts.find((a) => a.file === 'cron' && a.nom === 'weekly-digest');
    expect(digest, 'weekly-digest n’est pas planifié').toBeDefined();
    expect(digest!.opts?.repeat).toMatchObject({ pattern: MOTIF_RECAP_HEBDO, tz: FUSEAU_RECAP_HEBDO });
    expect(atteintes.get('weekly-digest')).toEqual(['/api/cron/digest']);
  });
});
