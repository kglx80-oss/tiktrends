import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 2b · restauration d'une version sur une VRAIE base (pglite, migrations
 * réelles), par les vraies actions serveur. On LIT la base : une ligne de plus,
 * au contenu (empreinte) de la version restaurée, fille de l'ancienne
 * courante ; toutes les autres lignes identiques, octet pour octet ; le projet
 * pointe la nouvelle ; un événement d'audit. Base périmée : 409, rien d'écrit.
 * Autre espace, autre projet, autre marque : NOT_FOUND, rien d'écrit. Lecteur :
 * il voit la liste, il ne restaure pas. Aucune ligne de devis, job ou dépense.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));

import { db, schema, eq, asc } from '@tiktrends/db';
import {
  ajouterTexte, documentInitial, modifierTexte, patchDocument, jsonCanonique, contenuVide,
  type ContenuVersion, type DocumentStudio, type ResultatOperation,
} from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { creerProjet, enregistrerDocument } from '../app/actions/studios/projets';
import { apercuVersionDocument, listerVersionsDocument, restaurerVersionDocument } from '../lib/studios/editeur/actions';

const ids = h.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { h.session = session(ids, q); };
const ok = (r: ResultatOperation) => { if (!r.ok) throw new Error(r.message); return r; };

let projet = '';
let projetA2 = '';
let versionA2 = '';
const v = {} as Record<1 | 2 | 3, { id: string; doc: DocumentStudio }>;

const lignes = async (p = projet) => db.select().from(schema.studioProjectVersions)
  .where(eq(schema.studioProjectVersions.projectId, p)).orderBy(asc(schema.studioProjectVersions.n));
const instantane = async (p = projet) => jsonCanonique((await lignes(p)).map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })));
const courante = async (p = projet) => (await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, p)))[0]!.currentVersionId;
async function depenses() {
  const n = async (t: any) => (await db.select().from(t)).length;
  return [await n(schema.studioQuotes), await n(schema.studioJobs), await n(schema.studioBudgetLedger), await n(schema.creditLedger), await n(schema.aiSpend), await n(schema.studioPromptRuns)];
}

beforeAll(async () => {
  await semer(db, schema, ids);
  qui('ua');
  const c = await creerProjet({ brandId: ids.brandA1, kind: 'image', title: 'Restauration', contenu: { ...contenuVide(), brief: { objective: 'Tester' } } as ContenuVersion });
  if (!c.ok) throw new Error(c.code);
  projet = c.projet.id;
  v[1] = { id: c.version.id, doc: null as unknown as DocumentStudio };
  // v2 · le document avec un titre ; v3 · le titre réécrit.
  const d2 = ok(ajouterTexte(documentInitial('4:5'), { texte: 'Titre de la version 2' })).document;
  const r2 = await enregistrerDocument({ projectId: projet, baseVersionId: v[1].id, changes: patchDocument(null, d2), raison: 'Éditeur de calques · v2' });
  if (!r2.ok) throw new Error(r2.code);
  v[2] = { id: r2.version.id, doc: d2 };
  const idTexte = Object.keys(d2.layers)[0]!;
  const d3 = ok(modifierTexte(d2, idTexte, { text: 'Titre de la version 3' })).document;
  const r3 = await enregistrerDocument({ projectId: projet, baseVersionId: v[2].id, changes: patchDocument(d2, d3), raison: 'Éditeur de calques · v3' });
  if (!r3.ok) throw new Error(r3.code);
  v[3] = { id: r3.version.id, doc: d3 };
  const c2 = await creerProjet({ brandId: ids.brandA2, kind: 'image', title: 'Projet A2', contenu: contenuVide() });
  if (!c2.ok) throw new Error(c2.code);
  projetA2 = c2.projet.id;
  versionA2 = c2.version.id;
});

describe('restaurer · une NOUVELLE version, l’historique jamais réécrit', () => {
  it('v2 restaurée sur la base v3 · ligne 4 au contenu de v2, fille de v3 ; lignes 1 à 3 intactes ; audit ; aucune dépense', async () => {
    qui('ua');
    const avant = await instantane();
    const depensesAvant = await depenses();
    const auditAvant = (await db.select().from(schema.studioAuditEvents)).length;
    const r = await restaurerVersionDocument({ projectId: projet, versionId: v[2].id, baseVersionId: v[3].id });
    if (!r.ok) throw new Error(`${r.code} ${r.message}`);
    expect(r.version.n).toBe(4);
    expect(r.restauree).toEqual({ id: v[2].id, n: 2 });
    expect(jsonCanonique(r.document)).toBe(jsonCanonique(v[2].doc));

    const ls = await lignes();
    expect(ls.map((l) => l.n)).toEqual([1, 2, 3, 4]);
    const [l2, l3, l4] = [ls[1]!, ls[2]!, ls[3]!];
    expect(l4.contentHash).toBe(l2.contentHash);
    expect(jsonCanonique(l4.content)).toBe(jsonCanonique(l2.content));
    expect(l4.parentId).toBe(l3.id);
    expect(l4.reason).toBe('Restauration de la version 2');
    expect(l4.authorId).toBe(ids.ua);
    // Les trois lignes d'avant n'ont pas bougé d'un octet.
    expect(jsonCanonique(JSON.parse(await instantane()).slice(0, 3))).toBe(jsonCanonique(JSON.parse(avant)));
    expect(await courante()).toBe(l4.id);
    const audit = await db.select().from(schema.studioAuditEvents);
    expect(audit.length).toBe(auditAvant + 1);
    expect(audit.find((a) => a.versionAfter === l4.id)).toMatchObject({ action: 'project.version.create', versionBefore: l3.id, reason: 'Restauration de la version 2' });
    expect(await depenses()).toEqual(depensesAvant);
  });

  it('base périmée (v3 alors que v4 est courante) · 409, rien d’écrit', async () => {
    qui('ua');
    const avant = await instantane();
    const r = await restaurerVersionDocument({ projectId: projet, versionId: v[3].id, baseVersionId: v[3].id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('VERSION_CONFLICT');
    expect(await instantane()).toBe(avant);
  });

  it('même contenu que la courante · refus dit, rien d’écrit', async () => {
    qui('ua');
    const avant = await instantane();
    const ls = await lignes();
    const r = await restaurerVersionDocument({ projectId: projet, versionId: v[2].id, baseVersionId: ls[3]!.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('La version 2 a déjà le même contenu que la version courante (4) · restaurer ne créerait rien.');
    expect(await instantane()).toBe(avant);
  });

  it('restaurer la v3 depuis la v4 · la restauration se défait par une restauration', async () => {
    qui('ua');
    const ls = await lignes();
    const r = await restaurerVersionDocument({ projectId: projet, versionId: v[3].id, baseVersionId: ls[3]!.id });
    if (!r.ok) throw new Error(r.code);
    const apres = await lignes();
    expect(apres.map((l) => l.n)).toEqual([1, 2, 3, 4, 5]);
    expect(apres[4]!.contentHash).toBe(apres[2]!.contentHash);
  });
});

describe('portée et droits · rien ne fuit, rien ne s’écrit', () => {
  it('autre espace · liste, aperçu et restauration répondent NOT_FOUND', async () => {
    const avant = await instantane();
    qui('ub');
    const ls = await listerVersionsDocument(projet);
    const ap = await apercuVersionDocument({ projectId: projet, versionId: v[2].id });
    const r = await restaurerVersionDocument({ projectId: projet, versionId: v[2].id, baseVersionId: (await lignes()).at(-1)!.id });
    expect([ls.ok, ap.ok, r.ok]).toEqual([false, false, false]);
    if (!ls.ok && !ap.ok && !r.ok) expect([ls.code, ap.code, r.code]).toEqual(['NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND']);
    expect(await instantane()).toBe(avant);
  });

  it('version d’un AUTRE projet · NOT_FOUND, même pour un membre qui voit les deux', async () => {
    qui('ua');
    const avant = await instantane();
    const avantA2 = await instantane(projetA2);
    const base = (await lignes()).at(-1)!.id;
    const r = await restaurerVersionDocument({ projectId: projet, versionId: versionA2, baseVersionId: base });
    expect(r.ok === false && r.code).toBe('NOT_FOUND');
    const ap = await apercuVersionDocument({ projectId: projet, versionId: versionA2 });
    expect(ap.ok === false && ap.code).toBe('NOT_FOUND');
    expect(await instantane()).toBe(avant);
    expect(await instantane(projetA2)).toBe(avantA2);
  });

  it('membre restreint à A1 · le projet de A2 lui est introuvable', async () => {
    qui('ur');
    const r = await restaurerVersionDocument({ projectId: projetA2, versionId: versionA2, baseVersionId: versionA2 });
    expect(r.ok === false && r.code).toBe('NOT_FOUND');
  });

  it('lecteur · voit la liste (auteur, raison, courante) et l’aperçu, ne restaure pas', async () => {
    const avant = await instantane();
    // Lecteur d'équipe · `studio.read` sans `studio.propose` (le profil « lecture seule » de l'éditeur).
    h.session = session(ids, 'uv', { equipe: { role: 'membre', matrice: { membre: ['studio'] } } } as never);
    const ls = await listerVersionsDocument(projet);
    if (!ls.ok) throw new Error(ls.code);
    expect(ls.versions.map((x) => [x.n, x.courante])).toEqual([[5, true], [4, false], [3, false], [2, false], [1, false]]);
    expect(ls.versions[0]).toMatchObject({ auteur: 'ua@studios.test', raison: 'Restauration de la version 3' });
    const ap = await apercuVersionDocument({ projectId: projet, versionId: v[2].id });
    if (!ap.ok) throw new Error(ap.code);
    expect(ap.apercu.comparaison.phrases.length).toBeGreaterThan(0);
    expect(jsonCanonique(ap.apercu.document)).toBe(jsonCanonique(v[2].doc));
    const r = await restaurerVersionDocument({ projectId: projet, versionId: v[2].id, baseVersionId: ls.versions[0]!.id });
    expect(r.ok === false && r.code).toBe('FORBIDDEN');
    expect(await instantane()).toBe(avant);
    qui('ua');
    const moi = await listerVersionsDocument(projet);
    expect(moi.ok && moi.versions[0]!.auteur).toBe('Toi');
  });
});
