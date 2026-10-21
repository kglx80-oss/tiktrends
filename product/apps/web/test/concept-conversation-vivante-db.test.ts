// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Concept créatif VIVANT · PR3 + PR4, au RÉSULTAT, sur une vraie base (pglite).
 * Mandat Kevin du 20/10. On lit les LIGNES et le THREAD rendu, jamais un appel.
 *
 * GUARD #2 · le PREMIER message (`demarrerConcept`) crée EXACTEMENT un projet
 *   (écriture canonique #837) + une conversation Jarvis LIÉE au concept
 *   (`projectId`). Mutation : créer la conversation SANS `{ projectId }` fait
 *   que `conversationDuProjet` ne la retrouve pas · le lien tombe en rouge.
 *
 * GUARD #4 · au rechargement de l'écran du concept, `chatThreadAction({ projectId })`
 *   retrouve le fil PAR `conversationDuProjet`, et NE mélange PAS marque et
 *   concept : un concept SANS conversation rend un fil VIDE (pas le fil principal
 *   de la marque), et le fil d'un concept ne laisse pas fuiter le fil principal.
 *   Mutation : retomber sur le fil principal en mode concept (lire la
 *   conversation `null`) ferait apparaître « PRINCIPAL » · le cas « vide » rougit.
 */

const h = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  active: null as { id: string; name: string } | null,
}));
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
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.active, listBrands: async () => [] }));

import { db, schema, eq, and } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { demarrerConcept } from '../app/actions/studios/concept';
import { chatThreadAction } from '../app/actions/jarvis-chat';
import { blocConceptJarvis } from '../lib/studios/jarvis-projets';
import { conversationDuProjet, creerConversation } from '../lib/jarvis/conversations';

const ids = h.ids;
const projetsDe = (brandId: string, userId: string) => db.select().from(schema.studioProjects)
  .where(and(eq(schema.studioProjects.brandId, brandId), eq(schema.studioProjects.ownerId, userId)));

beforeAll(async () => { await semer(db, schema, ids); });

describe('GUARD #2 · le premier message crée EXACTEMENT un projet + une conversation liée', () => {
  it('demarrerConcept · un projet « ads » pour la marque active, et une conversation portée par son projectId', async () => {
    h.session = session(ids, 'ua');
    h.active = { id: ids.brandA1, name: 'Marque A1' };
    const avant = (await projetsDe(ids.brandA1, ids.ua)).length;

    const r = await demarrerConcept();
    expect(r.ok, 'demarrerConcept a échoué').toBe(true);
    if (!r.ok) return;
    const { projectId, conversationId } = r.demarrage;

    // EXACTEMENT un projet de plus, « ads », pour la marque active, avec version.
    const apres = await projetsDe(ids.brandA1, ids.ua);
    expect(apres.length).toBe(avant + 1);
    const cree = apres.find((p) => p.id === projectId)!;
    expect(cree, 'projet créé introuvable').toMatchObject({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'ads' });
    expect(cree.currentVersionId, 'projet sans version courante').not.toBeNull();

    // EXACTEMENT une conversation, LIÉE au concept (retrouvée par projectId).
    const portee = { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua };
    const liees = await conversationDuProjet(portee, projectId);
    expect(liees.map((c) => c.id), 'la conversation du concept n’est pas liée (projectId manquant ?)').toEqual([conversationId]);
  });
});

describe('GUARD #4 · chatThreadAction({ projectId }) retrouve le fil par projet, sans mélange marque/concept', () => {
  it('concept SANS conversation · fil VIDE (jamais le fil principal de la marque)', async () => {
    h.session = session(ids, 'ua');
    h.active = { id: ids.brandA1, name: 'Marque A1' };
    // Un fil PRINCIPAL de marque (conversationId null) avec un message.
    await db.insert(schema.jarvisMessages).values({ workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, conversationId: null, role: 'user', content: 'PRINCIPAL' });

    const projetSansConv = '88888888-8888-4888-8888-888888888881';
    const r = await chatThreadAction({ projectId: projetSansConv });
    expect(r.error, r.error).toBeUndefined();
    const contenus = (r.thread?.turns ?? []).map((t) => t.content);
    expect(contenus, 'le fil principal de la marque a fuité dans un concept vide').not.toContain('PRINCIPAL');
    expect(contenus, 'un concept sans conversation doit rendre un fil vide').toEqual([]);
    // Vérifie que le fil principal EXISTE bien (sinon le test ne prouve rien).
    expect((await chatThreadAction(null)).thread?.turns.map((t) => t.content)).toContain('PRINCIPAL');
  });

  it('concept AVEC conversation · son fil, et pas celui d’un autre concept ni d’une autre marque', async () => {
    h.session = session(ids, 'ua');
    h.active = { id: ids.brandA1, name: 'Marque A1' };
    const porteeA1 = { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua };
    const P = '88888888-8888-4888-8888-888888888882';

    const convConcept = await creerConversation(porteeA1, { projectId: P });
    await db.insert(schema.jarvisMessages).values({ workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, conversationId: convConcept, role: 'user', content: 'CONCEPT-P' });
    // Leurre · même projectId, AUTRE marque (A2).
    const convAutreMarque = await creerConversation({ workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua }, { projectId: P });
    await db.insert(schema.jarvisMessages).values({ workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, conversationId: convAutreMarque, role: 'user', content: 'AUTRE-MARQUE' });

    const r = await chatThreadAction({ projectId: P });
    expect(r.error, r.error).toBeUndefined();
    const contenus = (r.thread?.turns ?? []).map((t) => t.content);
    expect(contenus, 'le fil du concept est lu').toContain('CONCEPT-P');
    expect(contenus, 'le fil principal de la marque ne doit pas apparaître').not.toContain('PRINCIPAL');
    expect(contenus, 'une autre marque (même projectId) ne doit pas apparaître').not.toContain('AUTRE-MARQUE');
    expect(r.thread?.conversationId, 'la conversation ouverte est celle du concept').toBe(convConcept);
  });
});


it('contexte production relu depuis la version, sans fuite de marque ni écriture', async () => {
  h.session = session(ids, 'ua'); h.active = { id: ids.brandA1, name: 'Marque A1' };
  const r = await demarrerConcept(); expect(r.ok).toBe(true); if (!r.ok) return;
  const projectId = r.demarrage.projectId;
  const [project] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [version] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, project!.currentVersionId!));
  const content = { ...(version!.content as Record<string, unknown>), brief: { objective: '', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: 'Flacon sur fond rose', styleIntent: 'Lumière douce', texts: ['Hydra'], formats: ['4:5'], exclusions: [] }, productRef: { productId: 'p', assetId: null, nom: 'Hydra sélectionné', faits: [], manques: [], photoDisponible: true, instantaneLe: '2026-10-21' } };
  const versionId = randomUUID();
  await db.insert(schema.studioProjectVersions).values({ ...version!, id: versionId, n: version!.n + 1, content });
  await db.update(schema.studioProjects).set({ currentVersionId: versionId }).where(eq(schema.studioProjects.id, projectId));
  const bloc = await blocConceptJarvis(ids.brandA1, projectId);
  for (const texte of ['Flacon sur fond rose', '4:5', 'Hydra sélectionné']) expect(bloc).toContain(texte);
  expect(await blocConceptJarvis(ids.brandA2, projectId)).toBe('');
  h.session = session(ids, 'ub'); expect(await blocConceptJarvis(ids.brandA1, projectId)).toBe('');
  const [apres] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, versionId));
  expect(apres!.content).toEqual(content);
});
