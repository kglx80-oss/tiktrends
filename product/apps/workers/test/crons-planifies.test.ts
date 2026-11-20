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

type Ajout = { file: string; nom: string; data?: unknown; opts?: { repeat?: { pattern?: string; tz?: string }; attempts?: number; backoff?: { type?: string; delay?: number }; delay?: number } };
const h = vi.hoisted(() => ({
  statut: 200,
  ajouts: [] as Ajout[],
  handlers: new Map<string, (job: { name: string; data?: unknown; attemptsMade?: number; opts?: { attempts?: number } }) => Promise<unknown>>(),
  erreurs: [] as string[],
  corps: { ok: true } as Record<string, unknown>,
  corpsErreur: null as Record<string, unknown> | null,
  avis: [] as string[],
  evenements: new Map<string, (...a: unknown[]) => void>(),
  fermes: [] as string[],
  arreter: null as null | (() => Promise<void>),
  appels: [] as string[],
  logs: [] as string[],
}));

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(private n: string) {}
    add(nom: string, data: unknown, opts?: Ajout['opts']) { h.ajouts.push({ file: this.n, nom, data, opts }); return Promise.resolve(); }
  },
  Worker: class {
    constructor(private n: string, p: (job: { name: string; data?: unknown; attemptsMade?: number; opts?: { attempts?: number } }) => Promise<unknown>) { h.handlers.set(n, p); }
    on(ev: string, cb: (...a: unknown[]) => void) { h.evenements.set(`${this.n}:${ev}`, cb); return this; }
    close(force?: boolean) { h.fermes.push(`${this.n}:${force === true ? 'force' : 'attend'}`); return Promise.resolve(); }
  },
}));
vi.mock('ioredis', () => ({ default: class {} }));
vi.mock('@tiktrends/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tiktrends/db')>()), db: null }));
vi.mock('../src/worker', () => ({ startWorkers: () => ({ studio: null }) }));
vi.mock('../src/ingest', () => ({ startIngestWorker: () => undefined }));
vi.mock('../src/sync', () => ({ runDailySync: async () => ({ synchro: 'locale' }) }));
vi.mock('../src/studios/boucle', () => ({ arretPropreSurSignal: (o: { arreter: () => Promise<void> }) => { h.arreter = o.arreter; } }));

import { ATTENTE_RECAP_MS, FUSEAU_RECAP_HEBDO, MOTIF_RECAP_HEBDO, REPORT_EN_COURS_MS, REPORTS_EN_COURS_MAX, TENTATIVES_RECAP } from '@tiktrends/core';

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
    const corps = h.statut === 200 ? h.corps : h.corpsErreur ?? (h.statut === 409 ? { error: 'en_cours' } : { error: 'digest_incomplet' });
    return new Response(JSON.stringify(corps), { status: h.statut, headers: { 'content-type': 'application/json' } });
  });
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { h.logs.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { h.avis.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { h.erreurs.push(a.map(String).join(' ')); });
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

  it('l’arrêt propre FERME le worker cron (il rend son job au lieu de le laisser bloqué)', async () => {
    expect(h.arreter, 'le point d’entrée n’enregistre pas d’arrêt propre').not.toBeNull();
    h.fermes = [];
    await h.arreter!();
    expect(h.fermes, 'l’arrêt propre ne ferme pas le worker cron SANS attendre son job (un passage du récap dépasse la borne d’arrêt)').toContain('cron:force');
  });

  it('weekly-digest · tentatives bornées, attente exponentielle', () => {
    const digest = h.ajouts.find((a) => a.file === 'cron' && a.nom === 'weekly-digest');
    expect(digest!.opts, 'weekly-digest sans tentatives bornées · un passage raté n’est jamais retenté').toMatchObject({ attempts: TENTATIVES_RECAP, backoff: { type: 'exponential', delay: ATTENTE_RECAP_MS } });
  });

  describe('weekly-digest · la suite d’un déclenchement', () => {
    const handler = () => h.handlers.get('cron')!;
    const avec = async (statut: number, f: () => Promise<void>) => { h.statut = statut; h.erreurs = []; try { await f(); } finally { h.statut = 200; } };

    it('409 « en cours » · ne lève pas (aucune tentative consommée), REPORTE une vérification différée au-delà du seuil', async () => {
      await avec(409, async () => {
        const avant = h.ajouts.length;
        await expect(handler()({ name: 'weekly-digest', attemptsMade: 5, opts: { attempts: TENTATIVES_RECAP } }), 'un 409 « en cours » lève · il consomme une tentative').resolves.toMatchObject({ reporte: 1 });
        const report = h.ajouts.slice(avant);
        expect(report, 'un 409 « en cours » n’a reprogrammé aucune vérification').toHaveLength(1);
        expect(report[0]).toMatchObject({ file: 'cron', nom: 'weekly-digest', data: { reports: 1 }, opts: { delay: REPORT_EN_COURS_MS, attempts: TENTATIVES_RECAP } });
        expect(report[0]!.opts?.repeat).toBeUndefined();
      });
    });

    it('500 avant la dernière tentative · LÈVE (BullMQ retente)', async () => {
      await avec(500, async () => {
        await expect(handler()({ name: 'weekly-digest', attemptsMade: 0, opts: { attempts: TENTATIVES_RECAP } }), 'un récap en échec est classé « terminé » · BullMQ ne le retentera pas').rejects.toThrow(/récap hebdomadaire non servi/);
      });
    });

    it('500 à la DERNIÈRE tentative · ALERTE explicite', async () => {
      await avec(500, async () => {
        await handler()({ name: 'weekly-digest', attemptsMade: TENTATIVES_RECAP - 1, opts: { attempts: TENTATIVES_RECAP } }).catch(() => undefined);
        expect(h.erreurs.some((e) => e.includes('ALERTE · récap hebdomadaire NON SERVI')), 'la dernière tentative laisse la semaine non servie sans alerte').toBe(true);
      });
    });

    it('servi avec des courriels ABANDONNÉS (refus définitif) · ALERTE', async () => {
      h.erreurs = [];
      h.corps = { ok: true, abandoned: 2 };
      try { await handler()({ name: 'weekly-digest' }); } finally { h.corps = { ok: true }; }
      expect(h.erreurs.some((e) => e.includes('ALERTE') && e.includes('2 courriel(s) ABANDONNÉ(S)')), 'des courriels abandonnés passent sans alerte').toBe(true);
      h.erreurs = [];
      await handler()({ name: 'weekly-digest' });
      expect(h.erreurs.filter((e) => e.includes('ALERTE')), 'une semaine servie sans abandon alerte').toEqual([]);
    });

    it('job en échec DÉFINITIF hors de passageRecap (bloqué par des redémarrages, dernière tentative) · ALERTE ; tentative intermédiaire · rien', () => {
      const echec = h.evenements.get('cron:failed');
      expect(echec, 'le worker cron n’écoute pas ses échecs').toBeDefined();
      const alertes = () => h.erreurs.filter((e) => e.includes('ALERTE · récap hebdomadaire NON CONFIRMÉ') && /vérifier le verrou digest:\d{4}-W\d{2}/.test(e));
      h.erreurs = [];
      echec!({ name: 'weekly-digest', attemptsMade: 1, opts: { attempts: TENTATIVES_RECAP } }, new Error('job stalled more than allowable limit'));
      expect(alertes(), 'un weekly-digest bloqué deux fois échoue sans alerte').toHaveLength(1);
      h.erreurs = [];
      echec!({ name: 'weekly-digest', attemptsMade: TENTATIVES_RECAP, opts: { attempts: TENTATIVES_RECAP } }, new Error('boum'));
      expect(alertes(), 'un weekly-digest en échec à sa dernière tentative échoue sans alerte').toHaveLength(1);
      h.erreurs = [];
      echec!({ name: 'weekly-digest', attemptsMade: 2, opts: { attempts: TENTATIVES_RECAP } }, new Error('récap hebdomadaire non servi · 500'));
      echec!({ name: 'tracker-scan', attemptsMade: 1, opts: { attempts: 1 } }, new Error('boum'));
      expect(alertes(), 'une tentative intermédiaire (ou une autre tâche) crie au récap perdu').toHaveLength(0);
    });

    it('SMTP absent (503 smtp_absent) · ne lève pas, aucune ALERTE « non servi », une seule ligne de TOUT le journal, en avertissement', async () => {
      h.corpsErreur = { error: 'smtp_absent', notified: 2, skippedMails: 2 };
      h.avis = [];
      h.logs = [];
      try {
        await avec(503, async () => {
          await expect(handler()({ name: 'weekly-digest', attemptsMade: 0, opts: { attempts: TENTATIVES_RECAP } }), 'un SMTP absent lève · BullMQ retenterait chaque lundi pour un état connu').resolves.toMatchObject({ sansSmtp: true });
          // TOUTES les lignes · erreurs, avertissements et journal ordinaire.
          expect(h.erreurs, 'un SMTP absent écrit une erreur · une configuration connue passe pour une panne').toEqual([]);
          expect(h.logs, 'un SMTP absent écrit une ligne de plus au journal').toEqual([]);
          expect(h.avis, 'une ligne, une seule, en avertissement').toHaveLength(1);
          expect(h.avis[0]).toContain('SMTP non configuré');
          expect(h.avis[0], 'l’avertissement ne dit pas jusqu’à quand la relance sert la semaine').toContain('la même semaine (avant lundi 00:00, heure de Paris)');
        });
      } finally { h.corpsErreur = null; }
    });

    it('témoin · un autre refus (500) reste une ERREUR au journal du déclencheur', async () => {
      h.corpsErreur = { error: 'digest_incomplet', failedBrands: 1 };
      try {
        await avec(500, async () => {
          await handler()({ name: 'weekly-digest', attemptsMade: 0, opts: { attempts: TENTATIVES_RECAP } }).catch(() => undefined);
          expect(h.erreurs.some((e) => e.includes('[digest] passage refusé 500 digest_incomplet')), 'un vrai refus n’est plus journalisé en erreur').toBe(true);
        });
      } finally { h.corpsErreur = null; }
    });

    it('disjoncteur ET marque en échec · la marque l’emporte · LÈVE (BullMQ retente), aucune ALERTE « lettres servies »', async () => {
      h.corpsErreur = { error: 'digest_incomplet', disjoncteur: true, refused: 4, sent: 0, failedBrands: 1 };
      h.avis = [];
      try {
        await avec(500, async () => {
          await expect(handler()({ name: 'weekly-digest', attemptsMade: 0, opts: { attempts: TENTATIVES_RECAP } }), 'une marque en échec n’est pas retentée parce que le disjoncteur a aussi sauté, ou le message levé tait le disjoncteur')
            .rejects.toThrow(/récap hebdomadaire non servi · digest_incomplet · 1 marque\(s\) en échec · disjoncteur des courriels aussi déclenché · 4 refus/);
          expect(h.erreurs.filter((e) => e.includes('ALERTE')), 'une retente crie une ALERTE').toEqual([]);
          expect([...h.erreurs, ...h.avis].some((e) => e.includes('lettres servies')), 'une marque en échec est annoncée « lettres servies dans l’application »').toBe(false);
        });
      } finally { h.corpsErreur = null; }
    });

    it('disjoncteur des courriels · ALERTE précise sans retente (pas « non servi »)', async () => {
      h.corpsErreur = { error: 'digest_incomplet', disjoncteur: true, refused: 4, sent: 0 };
      try {
        await avec(500, async () => {
          await expect(handler()({ name: 'weekly-digest', attemptsMade: 0, opts: { attempts: TENTATIVES_RECAP } }), 'un disjoncteur déclenché se retente').resolves.toMatchObject({ disjoncteur: true });
          expect(h.erreurs.some((e) => e.includes('ALERTE · disjoncteur des courriels · 4 refus')), 'le disjoncteur n’alerte pas précisément').toBe(true);
          expect(h.erreurs.some((e) => e.includes('NON SERVI')), 'un disjoncteur est annoncé « non servi »').toBe(false);
          expect(h.erreurs.some((e) => e.includes('ALERTE · disjoncteur') && e.includes('la même semaine (avant lundi 00:00, heure de Paris)')), 'l’ALERTE du disjoncteur ne dit pas jusqu’à quand relancer').toBe(true);
        });
      } finally { h.corpsErreur = null; }
    });

    it('409 après le dernier report · ALERTE, plus de report', async () => {
      await avec(409, async () => {
        const avant = h.ajouts.length;
        await handler()({ name: 'weekly-digest', data: { reports: REPORTS_EN_COURS_MAX } }).catch(() => undefined);
        expect(h.ajouts.length - avant, 'les reports ne sont pas bornés').toBe(0);
        expect(h.erreurs.some((e) => e.includes('ALERTE · récap hebdomadaire NON SERVI')), 'un passage qui tient la semaine trop longtemps n’alerte pas').toBe(true);
      });
    });
  });

});
