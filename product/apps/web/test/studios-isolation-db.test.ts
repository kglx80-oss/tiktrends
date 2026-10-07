import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * SEC-01 et SEC-02 · isolation des espaces et des marques, au RÉSULTAT.
 *
 * Vraie base (pglite + les 55 migrations du dépôt). Un projet complet est posé
 * dans l'espace B (version, disposition, média, job, trace de prompt), puis une
 * personne de l'espace A tente de le lire et de l'écrire par identifiant, par
 * les actions ET par le dépôt appelé directement. On vérifie : le code de
 * refus, l'ABSENCE de toute donnée de B dans la réponse sérialisée, et l'état
 * de la base après coup (rien n'a bougé).
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

import { db, schema, eq } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { creerProjet, inspecterProjet, enregistrerDocument, enregistrerDisposition, listerProjets } from '../app/actions/studios/projets';
import { contexteDepuisSession } from '../lib/studios/garde';
import * as depot from '../lib/studios/depot';

const ids = etat.ids;
const B = { projet: '', version: '', asset: '', job: '', run: '' };
const A2 = { projet: '', version: '' };
const SECRET_B = 'Lancement confidentiel B';

/** Aucune trace de B dans une réponse : ni id, ni titre, ni marque. */
function sansFuite(reponse: unknown) {
  const texte = JSON.stringify(reponse);
  for (const s of [B.projet, B.version, B.asset, B.job, B.run, ids.brandB1, ids.wsB, SECRET_B, 'Marque B1 secrète']) {
    expect(texte, `la réponse divulgue « ${s} »`).not.toContain(s);
  }
}

const sha = 'a'.repeat(64);

beforeAll(async () => {
  await semer(db, schema, ids);

  // ── Espace B · un projet complet, par les actions de B ─────────────────
  etat.session = session(ids, 'ub');
  const c = await creerProjet({ brandId: ids.brandB1, kind: 'video', title: SECRET_B });
  if (!c.ok) throw new Error(`semis B : ${c.code}`);
  B.projet = c.projet.id; B.version = c.version.id;
  const d = await enregistrerDisposition({ projectId: B.projet, positions: { s_1: { x: 10, y: 20 } }, rowVersion: 0 });
  if (!d.ok) throw new Error(`semis disposition B : ${d.code}`);
  const [a] = await db.insert(schema.studioAssets).values({ workspaceId: ids.wsB, brandId: ids.brandB1, projectId: B.projet, storageKey: 'b/secret.png', mime: 'image/png', bytes: 10, sha256: sha, origin: 'upload' }).returning();
  B.asset = a!.id;
  const [j] = await db.insert(schema.studioJobs).values({ workspaceId: ids.wsB, brandId: ids.brandB1, projectId: B.projet, projectVersionId: B.version, operation: 'image_generate', idempotencyKey: 'k-b-1', inputHash: sha, snapshot: { secret: SECRET_B } }).returning();
  B.job = j!.id;
  const [r] = await db.insert(schema.studioPromptRuns).values({ workspaceId: ids.wsB, brandId: ids.brandB1, projectId: B.projet, templateKey: 'brief.build', compiledHash: sha, contextSnapshotHash: sha, model: 'modele-test', status: 'shadow' }).returning();
  B.run = r!.id;

  // ── Espace A · un projet sur A2 (pour SEC-02), par ua ──────────────────
  etat.session = session(ids, 'ua');
  const c2 = await creerProjet({ brandId: ids.brandA2, kind: 'image', title: 'Projet A2' });
  if (!c2.ok) throw new Error(`semis A2 : ${c2.code}`);
  A2.projet = c2.projet.id; A2.version = c2.version.id;
  const c1 = await creerProjet({ brandId: ids.brandA1, kind: 'image', title: 'Projet A1' });
  if (!c1.ok) throw new Error(`semis A1 : ${c1.code}`);
});

async function versionsDe(projectId: string) {
  return db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, projectId));
}

describe('SEC-01 · l’espace A ne lit ni n’écrit rien de l’espace B par identifiant', () => {
  it('actions · inspecter, enregistrer, disposer, créer sur B → NOT_FOUND neutre, sans fuite', async () => {
    etat.session = session(ids, 'ua');
    const lectures = [
      await inspecterProjet(B.projet),
      await enregistrerDocument({ projectId: B.projet, baseVersionId: B.version, changes: [{ op: 'replace', path: '/brief', newValue: { pirate: true }, reason: 'x' }] }),
      await enregistrerDisposition({ projectId: B.projet, positions: { s_1: { x: 0, y: 0 } }, rowVersion: 1 }),
      await creerProjet({ brandId: ids.brandB1, kind: 'image', title: 'Intrusion' }),
    ];
    for (const r of lectures) {
      expect(r.ok).toBe(false);
      expect(!r.ok && r.code, JSON.stringify(r)).toBe('NOT_FOUND');
      expect(!r.ok && r.targetIds).toEqual([]);
      sansFuite(r);
    }
  });

  it('dépôt appelé directement · version, média, job, trace, disposition de B → NOT_FOUND', async () => {
    const ctx = contexteDepuisSession(session(ids, 'ua'), [ids.brandA1, ids.brandA2], [], 't-sec01');
    const reponses = [
      await depot.lireProjet(ctx, B.projet),
      await depot.lireVersion(ctx, B.version),
      await depot.lireAsset(ctx, B.asset),
      await depot.lireJob(ctx, B.job),
      await depot.lirePromptRun(ctx, B.run),
      await depot.lireDisposition(ctx, B.projet),
    ];
    for (const r of reponses) {
      expect(r.ok, JSON.stringify(r)).toBe(false);
      expect(!r.ok && r.code).toBe('NOT_FOUND');
      sansFuite(r);
    }
  });

  it('la liste de A ne contient aucun projet de B, même en demandant la marque de B', async () => {
    etat.session = session(ids, 'ua');
    const tout = await listerProjets();
    const filtre = await listerProjets({ brandId: ids.brandB1 });
    expect(tout.ok && tout.projets.length).toBe(2);
    expect(filtre.ok && filtre.projets).toEqual([]);
    sansFuite(tout); sansFuite(filtre);
  });

  it('la base de B est intacte · une version, disposition inchangée, aucun projet créé chez B par A', async () => {
    expect((await versionsDe(B.projet)).length).toBe(1);
    const [l] = await db.select().from(schema.studioLayouts).where(eq(schema.studioLayouts.projectId, B.projet));
    expect(l?.rowVersion).toBe(1);
    expect(l?.positions).toEqual({ s_1: { x: 10, y: 20 } });
    const chezB = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.workspaceId, ids.wsB));
    expect(chezB.map((p) => p.title)).toEqual([SECRET_B]);
  });

  it('la base refuse d’elle-même une marque de B rattachée à l’espace A (clé composite)', async () => {
    await expect(db.insert(schema.studioProjects).values({ workspaceId: ids.wsA, brandId: ids.brandB1, kind: 'image', title: 'Croisement' }))
      .rejects.toThrow(/studio_projects_brand_fk|foreign key/);
  });
});

describe('SEC-02 · restreint à la marque A1, la marque A2 du même espace est fermée', () => {
  it('actions · inspecter, enregistrer, créer sur A2 → NOT_FOUND ; la liste ne montre que A1', async () => {
    etat.session = session(ids, 'ur');
    for (const r of [
      await inspecterProjet(A2.projet),
      await enregistrerDocument({ projectId: A2.projet, baseVersionId: A2.version, changes: [{ op: 'replace', path: '/brief', newValue: {}, reason: 'x' }] }),
      await creerProjet({ brandId: ids.brandA2, kind: 'image', title: 'Hors marque' }),
    ]) {
      expect(!r.ok && r.code, JSON.stringify(r)).toBe('NOT_FOUND');
      expect(JSON.stringify(r)).not.toContain('Projet A2');
    }
    const liste = await listerProjets();
    expect(liste.ok && liste.projets.map((p) => p.title)).toEqual(['Projet A1']);
    expect((await versionsDe(A2.projet)).length).toBe(1);
  });

  it('dépôt appelé directement avec le contexte de la personne restreinte → NOT_FOUND', async () => {
    const ctx = contexteDepuisSession(session(ids, 'ur'), [ids.brandA1, ids.brandA2], [ids.brandA1], 't-sec02');
    expect(ctx.marques).toEqual([ids.brandA1]);
    const r = await depot.lireProjet(ctx, A2.projet);
    expect(!r.ok && r.code).toBe('NOT_FOUND');
    const w = await depot.enregistrerVersion(ctx, { projectId: A2.projet, baseVersionId: A2.version, changes: [{ op: 'replace', path: '/brief', newValue: {}, reason: 'x' }] });
    expect(!w.ok && w.code).toBe('NOT_FOUND');
  });

  it('le filtre SQL suffit à lui seul · marques visibles réduites à A1, A2 n’est pas lue', async () => {
    // Revérification pure neutralisée (aucune restriction déclarée) : seul le filtre SQL sur `marques` refuse.
    const ctx = { ...contexteDepuisSession(session(ids, 'ua'), [ids.brandA1, ids.brandA2], [], 't-sql'), marques: [ids.brandA1] };
    expect((await depot.listerProjets(ctx)).map((p) => p.title)).toEqual(['Projet A1']);
    const r = await depot.lireProjet(ctx, A2.projet);
    expect(!r.ok && r.code, 'le filtre SQL de portée n’a pas restreint la lecture').toBe('NOT_FOUND');
  });

  it('défense en profondeur · un contexte dont la liste de marques serait faussée reste refusé', async () => {
    const ctx = contexteDepuisSession(session(ids, 'ur'), [ids.brandA1, ids.brandA2], [ids.brandA1], 't-sec02b');
    const fausse = { ...ctx, marques: [ids.brandA1, ids.brandA2] };
    const r = await depot.lireProjet(fausse, A2.projet);
    expect(!r.ok && r.code, 'la revérification pure doit refuser malgré un filtre SQL élargi').toBe('NOT_FOUND');
  });
});
