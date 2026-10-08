import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * G-A · l'approbation GÉNÉRIQUE (`app/actions/studios/execution.ts`) refuse
 * quand le fournisseur d'images n'est pas branché (besoin F-B n° 2).
 *
 * Le défaut : l'écran image refusait déjà (`approuverImagePour`), mais l'action
 * L3 générique approuvait, débitait et mettait en file un job que le worker,
 * non démarré sans fournisseur (`demarrerWorkerStudio`), n'exécuterait jamais :
 * réserve bloquée, rien produit.
 *
 * Vraie base (pglite, migrations réelles), vraie action serveur ; seuls la
 * session et le statut du plafond dollars sont posés. On lit les LIGNES :
 * approbations, jobs, registre, crédits, outbox, solde. Aucun appel réseau :
 * l'action n'appelle aucun fournisseur (le worker exécute, hors requête).
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
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { db, schema } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { poserSolde, solde, projetTest } from './l3-harnais';
import * as actions from '../app/actions/studios/execution';

const ids = etat.ids;
let projet = { projectId: '', versionId: '' };

/**
 * Environnement d'un serveur où le fournisseur EST branché (règle
 * `decisionFournisseurStudio`) · valeurs factices, aucune n'est un secret et
 * aucune n'est lue par un client réseau ici.
 */
const BRANCHE = {
  FAL_KEY: 'cle-factice-ga:sans-valeur', STUDIO_FOURNISSEUR_REEL: 'autorise',
  S3_ENDPOINT: 'http://stockage.invalide', S3_BUCKET: 'seau-factice', S3_ACCESS_KEY_ID: 'factice', S3_SECRET_ACCESS_KEY: 'factice',
};
const VIDE = Object.fromEntries(Object.keys(BRANCHE).map((k) => [k, ''])) as Record<keyof typeof BRANCHE, string>;
const poser = (env: Record<string, string>) => { for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v); };

const comptes = async () => ({
  approbations: (await db.select().from(schema.studioApprovals)).length,
  jobs: (await db.select().from(schema.studioJobs)).length,
  registre: (await db.select().from(schema.studioBudgetLedger)).length,
  credits: (await db.select().from(schema.creditLedger)).length,
  outbox: (await db.select().from(schema.studioOutbox)).length,
  solde: await solde(db, ids.wsA),
});

async function devis() {
  const d = await actions.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
  if (!d.ok) throw new Error(`${d.code} ${d.message}`);
  return d.devis;
}
const approuver = (q: { id: string; inputHash: string; maximumCredits: number }, cle: string) =>
  actions.approuverEtMettreEnFile({ quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: cle });

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 100);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
});
beforeEach(() => { etat.session = session(ids, 'ua'); poser(VIDE); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('approbation générique · fournisseur d’images non branché ⇒ refus, 0 débit, 0 job', () => {
  const CAS: Array<[string, Record<string, string>]> = [
    ['aucune FAL_KEY', {}],
    ['FAL_KEY de simulation locale', { ...BRANCHE, FAL_KEY: 'simule-local-sans-reseau' }],
    ['hors production sans autorisation explicite', { ...BRANCHE, STUDIO_FOURNISSEUR_REEL: '' }],
    ['stockage objet absent', { ...BRANCHE, S3_BUCKET: '' }],
  ];
  for (const [nom, env] of CAS) {
    it(`${nom} · UNSUPPORTED_CAPABILITY, aucune ligne écrite, solde intact`, async () => {
      const q = await devis();
      poser(env);
      const avant = await comptes();
      const r = await approuver(q, `ga-refus-${q.id}`);
      expect(!r.ok && [r.code, r.message], 'approbation acceptée sans fournisseur d’images branché').toEqual(['UNSUPPORTED_CAPABILITY', 'Le fournisseur d’images n’est pas branché sur ce serveur · rien n’a été approuvé ni débité.']);
      expect(await comptes(), 'une approbation refusée a écrit (débit, job, registre ou outbox)').toEqual(avant);
    });
  }

  it('la garde passe AVANT la règle du fournisseur · un lecteur reçoit FORBIDDEN, pas un refus de capacité', async () => {
    const q = await devis();
    etat.session = session(ids, 'uv');
    const r = await approuver(q, `ga-lecteur-${q.id}`);
    expect(!r.ok && r.code).toBe('FORBIDDEN');
  });

  it('même devis, fournisseur branché ensuite ⇒ l’approbation passe : le refus ne consommait rien', async () => {
    const q = await devis();
    const avant = await comptes();
    expect(await approuver(q, `ga-avant-${q.id}`)).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY' });
    poser(BRANCHE);
    const r = await approuver(q, `ga-apres-${q.id}`);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.deja).toBe(false);
    const apres = await comptes();
    expect({ approbations: apres.approbations - avant.approbations, jobs: apres.jobs - avant.jobs, debit: avant.solde - apres.solde })
      .toEqual({ approbations: 1, jobs: 1, debit: q.maximumCredits });
  });
});
