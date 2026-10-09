import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * E2 · exclusion mutuelle du contrôle visuel sur Postgres 16 RÉEL, DEUX
 * connexions (pglite sérialise tout : il prouve la règle, pas la course).
 *
 * Limite R3 connue : « deux clics simultanés sur un média pending pourraient
 * lancer deux contrôles vision ; la garde ne lit que le statut ». Ici :
 *
 *  1. connexion A tient une transaction qui a posé le marqueur « engagé » sans
 *     la valider ; la connexion B lance le contrôle : son écriture
 *     conditionnelle ATTEND A, relit la ligne, ne correspond plus ⇒ refus,
 *     0 requête au fournisseur ;
 *  2. 10 manches : deux lancements réellement simultanés (deux connexions du
 *     pool) sur un média pending ⇒ UNE requête, UNE ligne `ai_spend`.
 *
 * Ignoré sans `E2_PG_URL` (la CI n'a pas de Postgres). Base LOCALE restaurée
 * depuis le dump vide (55 migrations + 0055) AVANT chaque passage (le semis
 * fixe des e-mails), jamais la production :
 *   E2_PG_URL=postgres://postgres@127.0.0.1:5433/e2_vision pnpm exec vitest run test/e2-controle-vision-pg.test.ts
 */

const URL_PG = process.env.E2_PG_URL ?? '';
const LOCALE = /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);
vi.hoisted(() => { if (process.env.E2_PG_URL) process.env.DATABASE_URL = process.env.E2_PG_URL; });

const etat = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { fauxAnthropic, type FauxServeur } from './helpers/faux-anthropic';

let srv: FauxServeur;
const env = { cle: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL, modele: process.env.ANTHROPIC_GEN_MODEL, cap: process.env.AI_SPEND_CAP_USD };

describe.skipIf(!LOCALE)('Postgres réel · deux connexions · contrôle visuel unique', () => {
  // Chargés après DATABASE_URL (hissé) : le client `@tiktrends/db` vise la base locale.
  let m: Awaited<ReturnType<typeof charger>>;
  async function charger() {
    const dbm = await import('@tiktrends/db');
    const qualite = await import('../lib/studios/produit/qualite');
    const resolveur = await import('../lib/studios/prompts/resolveur');
    const adaptateur = await import('../lib/studios/prompts/adaptateur');
    const depot = await import('../lib/studios/prompts/depot-prompts');
    const semis = await import('./studios-semis');
    const outils4a = await import('./l4a-outils');
    const l2 = await import('./l2-outils');
    const l5c = await import('./l5c-outils');
    const v = await import('./e2-vision-outils');
    return { ...dbm, qualite, resolveur, adaptateur, depot, semis, outils4a, l2, l5c, v };
  }
  const ids = {} as import('./studios-semis').IdsStudios;
  let cat: import('./l5c-outils').Catalogue;
  const deps = () => ({ adaptateur: m.adaptateur.adaptateurAnthropicGarde(), environnement: 'test' as const, plafondAtteint: async () => false, medias: m.resolveur.resolveurMediasStudio(m.v.lecteur) });
  const base = () => m.db as unknown as import('../lib/studios/execution/types').BaseStudio;
  const lignesVision = async (jobWs: string) => (await m.db.select().from(m.schema.aiSpend).where(m.eq(m.schema.aiSpend.workspaceId, jobWs))).filter((l) => l.action === 'studio-prompt:quality.visual');

  beforeAll(async () => {
    m = await charger();
    Object.assign(ids, m.semis.idsStudios());
    etat.session = m.semis.session(ids, 'ua');
    srv = await fauxAnthropic();
    process.env.ANTHROPIC_API_KEY = 'cle-factice-e2-pg';
    process.env.ANTHROPIC_BASE_URL = srv.url;
    process.env.ANTHROPIC_GEN_MODEL = m.v.MODELE;
    process.env.AI_SPEND_CAP_USD = '50';
    await m.semis.semer(m.db, m.schema, ids);
    cat = await m.l5c.semerCatalogue(base(), ids);
    if (!(await m.depot.lirePointeur())) await m.l2.publierRegistreDeTest(m.depot);
  }, 120_000);
  afterAll(async () => {
    await srv?.fermer();
    for (const [k, v] of [['ANTHROPIC_API_KEY', env.cle], ['ANTHROPIC_BASE_URL', env.url], ['ANTHROPIC_GEN_MODEL', env.modele], ['AI_SPEND_CAP_USD', env.cap]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await (m?.db as unknown as { $client?: { end: () => Promise<void> } } | undefined)?.$client?.end().catch(() => {});
  });

  it('connexion A tient le marqueur sans valider ⇒ le lancement de B attend, relit, refuse : 0 requête', async () => {
    const { jobId, sortieId } = await m.v.jobLivre(base(), ids, cat);
    srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: m.v.sortieVision(sortieId) });
    const J = m.schema.studioJobs;
    let lacher!: () => void;
    const porte = new Promise<void>((r) => { lacher = r; });
    let pose!: (pid: number) => void;
    const pris = new Promise<number>((r) => { pose = r; });
    // Connexion A · même écriture conditionnelle que `prendreMarqueur`, retenue avant validation.
    const a = m.db.transaction(async (tx) => {
      const r = await tx.execute(m.sql`select pg_backend_pid() as pid`);
      const rows = (Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ pid: number }>;
      await tx.update(J).set({ result: m.sql`jsonb_set(coalesce(${J.result}, '{}'::jsonb), '{controleVision}', ${JSON.stringify({ etat: 'engage', le: new Date().toISOString(), trace: 'connexion-A' })}::jsonb)` }).where(m.eq(J.id, jobId));
      pose(Number(rows[0]!.pid));
      await porte;
    });
    const pidA = await pris;
    // Connexion B · le lancement du produit, pendant que A tient la ligne.
    const b = m.qualite.controlerSortieParVision(m.outils4a.ctxDe(ids, 'ua'), { jobId }, deps());
    const pidB = await m.db.transaction(async (tx) => {
      const r = await tx.execute(m.sql`select pg_backend_pid() as pid`);
      return Number(((Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ pid: number }>)[0]!.pid);
    });
    expect(pidB, 'les deux connexions sont la même session').not.toBe(pidA);
    await new Promise((r) => setTimeout(r, 400));
    lacher();
    await a;
    const r = await b;
    expect({ requetes: srv.requetes(), aiSpend: (await lignesVision(ids.wsA)).length }, 'B a appelé malgré le marqueur tenu par A').toEqual({ requetes: 0, aiSpend: 0 });
    expect(r).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    if (!r.ok) expect(r.message).toContain('déjà engagé');
  }, 60_000);

  it('10 manches · deux lancements simultanés sur un média pending ⇒ une requête, une ligne ai_spend', async () => {
    const bilan: string[] = [];
    for (let manche = 0; manche < 10; manche++) {
      const { jobId, sortieId } = await m.v.jobLivre(base(), ids, cat);
      srv.comportement({ type: 'ok', entree: 9000, sortie: 300, texte: m.v.sortieVision(sortieId) });
      const avant = (await lignesVision(ids.wsA)).length;
      const [x, y] = await Promise.all([
        m.qualite.controlerSortieParVision(m.outils4a.ctxDe(ids, 'ua'), { jobId }, deps()),
        m.qualite.controlerSortieParVision(m.outils4a.ctxDe(ids, 'ua'), { jobId }, deps()),
      ]);
      const ligne = `${srv.requetes()}/${(await lignesVision(ids.wsA)).length - avant}/${[x.ok, y.ok].sort().join(',')}`;
      bilan.push(ligne);
      expect(ligne, `manche ${manche} · deux contrôles payants pour un média`).toBe('1/1/false,true');
    }
    expect(new Set(bilan).size).toBe(1);
  }, 180_000);
});
