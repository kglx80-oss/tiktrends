import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * G-A · `compilerConsigneImage` de `app/actions/studios/produit.ts` (besoin
 * F-B n° 4).
 *
 * Le défaut : cette action compilait « à nu » (`compilerConsigneImagePour`).
 * Elle rendait une consigne et un `runId`, mais rien n'était ATTESTÉ côté
 * serveur ; `retenirConsigneImage` relit l'attestation par ce `runId` et
 * répondait donc MISSING_REFERENCE · un appel texte payé dont le résultat ne
 * pouvait jamais être retenu.
 *
 * Vraie base (pglite, migrations réelles), vraies actions serveur ; adaptateur
 * texte SIMULÉ injecté à la place du câblage de production (aucun appel réel,
 * 0 $). On lit les LIGNES : attestation d'audit, trace, version retenue.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as import('./studios-semis').IdsStudios,
  session: null as unknown,
  adaptateur: null as unknown,
  plafondAtteint: false,
}));
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
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
// Le câblage de production choisit l'adaptateur réel (barrière de dépense) : ici, le SIMULÉ.
vi.mock('../lib/studios/textes/dependances', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/studios/textes/dependances')>();
  return {
    ...actual,
    dependancesTextesProduction: () => ({ adaptateur: etat.adaptateur, environnement: 'test', plafondAtteint: async () => etat.plafondAtteint }),
  };
});

import { db, schema, eq, and } from '@tiktrends/db';
import { consigneDuContenu, ACTION_CONSIGNE_COMPILEE, type ContenuVersion } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour } from '../lib/studios/produit/commandes';
import * as produit from '../app/actions/studios/produit';
import * as image from '../app/actions/studios/image';
import { semer, session } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, compter, delta, type Catalogue } from './l5c-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

const ids = etat.ids;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-08T10:00:00Z') };
let reponse: (a: AppelModele) => unknown = () => ({});
const texte = adaptateurSimule((a) => reponse(a));
etat.adaptateur = texte;
let cat: Catalogue;

/** Le modèle simulé lie chaque référence reçue avec un rôle déclaré (même réponse que F-B). */
function repondreConsigne() {
  reponse = (a) => {
    const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
    return {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: {
        generationInstruction: 'Coureur portant les lunettes et le bandeau, piste au lever du jour.', negativeConstraints: ['Pas de texte dans l’image'],
        needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
        referenceBindings: ti.referenceIds.map((id) => (id.startsWith('pph_') ? { referenceId: id, role: 'product', scope: 'product' } : { referenceId: id, role: 'style', scope: 'background' })),
      },
    };
  };
}

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, p!.currentVersionId!));
  return v!;
};

async function projetEpingle(): Promise<string> {
  const p = await projetStatique(db, ids, cat);
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), p.projectId, O);
  if (!c.ok) throw new Error(c.code);
  const photo = c.catalogue.produits.find((x) => x.produit.id === cat.produit.id)!.photos[4]!.assetId;
  const r = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: (await courante(p.projectId)).id, productId: cat.produit.id, photoId: photo, composants: ['lunettes', 'bandeau'] }, O);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return p.projectId;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
  await publierRegistreDeTest(depotPrompts, acteurPlateforme());
});
beforeEach(() => { etat.session = session(ids, 'ua'); etat.plafondAtteint = false; texte.recues.length = 0; repondreConsigne(); });

describe('compilerConsigneImage (actions produit) · le résultat est attesté, donc retenable', () => {
  it('compiler par l’action produit puis retenir · la version courante porte la consigne attestée, mot pour mot', async () => {
    const projectId = await projetEpingle();
    const base = await courante(projectId);
    const avant = await compter(db);
    const c = await produit.compilerConsigneImage({ projectId, mode: 'generative_scene' });
    expect(c, JSON.stringify(c)).toMatchObject({ ok: true, statut: 'compilee' });
    if (!c.ok || c.statut !== 'compilee') return;
    const ecrit = delta(avant, await compter(db));
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, projectId), eq(schema.studioAuditEvents.action, ACTION_CONSIGNE_COMPILEE)));

    const r = await image.retenirConsigneImage({ projectId, baseVersionId: base.id, runId: c.runId });
    expect(r.ok ? 'retenue' : `${r.code} · ${r.message}`, 'la consigne compilée par l’action produit n’a pas pu être retenue').toBe('retenue');
    expect((a?.details as { runId?: string } | undefined)?.runId, 'aucune attestation serveur pour la compilation de l’action produit').toBe(c.runId);
    // Un appel texte, une trace, UNE attestation · rien d'autre (ni version, ni devis, ni job, ni débit).
    expect({ appels: texte.recues.length, ecrit }).toEqual({ appels: 1, ecrit: { runs: 1, audit: 1 } });
    const v = await courante(projectId);
    expect(v.id).not.toBe(base.id);
    expect(consigneDuContenu(v.content as ContenuVersion)).toEqual(c.consigne);
  });

  it('même garde que le parcours image · un lecteur reçoit FORBIDDEN, aucun appel, aucune trace', async () => {
    const projectId = await projetEpingle();
    etat.session = session(ids, 'uv');
    const avant = await compter(db);
    expect(await produit.compilerConsigneImage({ projectId, mode: 'generative_scene' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect({ appels: texte.recues.length, delta: delta(avant, await compter(db)) }).toEqual({ appels: 0, delta: {} });
  });

  it('même barrière de dépense · plafond atteint ⇒ BUDGET_EXCEEDED avant l’appel, rien d’écrit', async () => {
    const projectId = await projetEpingle();
    etat.plafondAtteint = true;
    const avant = await compter(db);
    expect(await produit.compilerConsigneImage({ projectId, mode: 'generative_scene' })).toMatchObject({ ok: false, code: 'BUDGET_EXCEEDED' });
    expect({ appels: texte.recues.length, delta: delta(avant, await compter(db)) }).toEqual({ appels: 0, delta: {} });
  });
});
