import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { IdsStudios } from './studios-semis';

/**
 * Raccord V5 · Lot 2b · les étapes stratégie/direction sur une VRAIE base
 * (pglite + migrations), fournisseur SIMULÉ (aucun appel payant). On vérifie le
 * RÉSULTAT en base : un CHANGEMENT du noyau (écrire l'angle, écrire le style,
 * une direction Jarvis) devient une proposition relue, et seule une proposition
 * `proposed` adoptée PAR UN GESTE crée une version ; le brief relu porte alors
 * le choix (restitution). Une proposition rejetée ne s'applique JAMAIS.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios }));
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
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import { db, schema, eq } from '@tiktrends/db';
import {
  construireBriefV5, changementAngleManuel, changementStyleManuel, contenuVide, empreinteContenu,
  RAISON_REF_HORS_PORTEE, SCHEMA_VERSION_CONTENU, type BriefCanonique, type ContenuVersion,
} from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { proposerAvecJarvis, creerPropositionManuelle, type DependancesJarvis } from '../lib/studios/propositions/proposer';
import { appliquerProposition, rejeterProposition } from '../lib/studios/propositions/depot-propositions';
import type { ResultatGarde } from '../lib/studios/garde';
import { semer } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { ctxDe } from './l4a-outils';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

const ids = etat.ids;
const V = schema.studioProjectVersions;
const PR = schema.studioProposals;

let reponse: (a: AppelModele) => unknown = () => ({});
const fournisseur = adaptateurSimule((a) => reponse(a));
const deps: DependancesJarvis = {
  adaptateur: fournisseur, environnement: 'test', plafondAtteint: async () => false,
  relireContexte: async (): Promise<ResultatGarde> => ({ ok: true, ctx: ctxDe(ids, 'ua') }),
};

const briefBase = (): BriefCanonique => construireBriefV5({
  intention: 'Vendre les lunettes de natation aux parents', audience: 'Parents', objectifType: null,
  plateformes: [], persona: null, angle: '', concept: '', contraintes: '',
});

async function projetBrief(brandId: string, brief: BriefCanonique): Promise<{ projectId: string; versionId: string }> {
  const ws = ids.wsA;
  const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as ContenuVersion['brief'] };
  const [p] = await db.insert(schema.studioProjects).values({ workspaceId: ws, brandId, kind: 'ads', title: `Projet ${randomUUID().slice(0, 6)}`, ownerId: ids.ua }).returning();
  const [v] = await db.insert(V).values({
    projectId: p!.id, workspaceId: ws, brandId, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: contenu, contentHash: empreinteContenu(contenu), authorId: ids.ua, reason: 'test',
  }).returning();
  await db.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, p!.id));
  return { projectId: p!.id, versionId: v!.id };
}

const contenuVersion = async (id: string) => ((await db.select().from(V).where(eq(V.id, id)))[0]!.content as ContenuVersion);
const versions = async (projectId: string) => db.select().from(V).where(eq(V.projectId, projectId));
const etatProp = async (id: string) => (await db.select().from(PR).where(eq(PR.id, id)))[0]!.state;

// Personas RÉELLES · une de la marque du projet (A1), une d'une autre marque du
// même espace (A2), une d'un autre espace (B1). Servent aux contre-tests de
// portée Adsmap sur le chemin d'APPLICATION d'une proposition.
const PERSONA_A1 = randomUUID();
const PERSONA_A2 = randomUUID();
const PERSONA_B1 = randomUUID();

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.insert(schema.personas).values([
    { id: PERSONA_A1, brandId: ids.brandA1, name: 'Persona A1' },
    { id: PERSONA_A2, brandId: ids.brandA2, name: 'Persona A2' },
    { id: PERSONA_B1, brandId: ids.brandB1, name: 'Persona B1' },
  ]);
});
beforeEach(() => { reponse = () => ({}); });

describe('Application d’une proposition · portée des références Adsmap (recette Codex 20 oct)', () => {
  const posePersona = (id: string) => ([{ op: 'add', path: '/brief/personaRef', newValue: { id, label: 'Persona choisie' }, reason: 'choix persona' }]);

  async function appliquerPersona(id: string) {
    const { projectId, versionId } = await projetBrief(ids.brandA1, briefBase());
    const ctx = ctxDe(ids, 'ua');
    const m = await creerPropositionManuelle(ctx, { projectId, baseVersionId: versionId, cible: 'brief', changes: posePersona(id), explication: 'Recette' });
    if (!m.ok || m.statut !== 'proposee') throw new Error('création de proposition refusée');
    const a = await appliquerProposition(ctx, { proposalId: m.proposition.id, projectId, baseVersionId: versionId });
    return { a, projectId, proposalId: m.proposition.id };
  }

  for (const [nom, id] of [
    ['INCONNUE (uuid au hasard)', randomUUID()],
    ['d’une AUTRE marque du même espace', PERSONA_A2],
    ['d’un AUTRE espace', PERSONA_B1],
  ] as const) {
    it(`appliquer une proposition posant une personaRef ${nom} · refusée, aucune version, pas d’approbation`, async () => {
      const { a, projectId, proposalId } = await appliquerPersona(id);
      expect(a.ok).toBe(false);
      if (!a.ok) expect(JSON.stringify(a.violations ?? a)).toContain(RAISON_REF_HORS_PORTEE);
      expect(await versions(projectId)).toHaveLength(1); // aucune nouvelle version écrite
      expect(await etatProp(proposalId)).toBe('proposed'); // proposition NON approuvée
    });
  }

  it('personaRef de la MARQUE du projet · appliquée, version écrite, brief relu porte la référence', async () => {
    const { a, projectId, proposalId } = await appliquerPersona(PERSONA_A1);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(await versions(projectId)).toHaveLength(2);
    expect(await etatProp(proposalId)).toBe('approved');
    const brief2 = (await contenuVersion(a.version.id)).brief as unknown as BriefCanonique;
    expect(brief2.personaRef).toEqual({ id: PERSONA_A1, label: 'Persona choisie' });
  });
});

describe('« Écrire mon angle » · proposition manuelle relue, adoptée par un geste', () => {
  it('le changement du noyau s’applique et le brief relu porte l’angle (restitution)', async () => {
    const brief = briefBase();
    const { projectId, versionId } = await projetBrief(ids.brandA1, brief);
    const ctx = ctxDe(ids, 'ua');

    // 1 · écrire mon angle → changement du noyau (angle absent ⇒ `add`), proposition manuelle gratuite
    const changement = changementAngleManuel(brief, 'Le premier plongeon');
    expect(changement).toMatchObject({ op: 'add', path: '/brief/angle' });
    const m = await creerPropositionManuelle(ctx, { projectId, baseVersionId: versionId, cible: 'brief', changes: [changement], explication: 'Angle écrit à la main' });
    expect(m.ok && m.statut).toBe('proposee');
    if (!m.ok || m.statut !== 'proposee') return;
    expect(await etatProp(m.proposition.id)).toBe('proposed');
    // rien n’est encore écrit dans le document
    expect((await versions(projectId))).toHaveLength(1);

    // 2 · adopter PAR UN GESTE → nouvelle version, proposition approuvée
    const a = await appliquerProposition(ctx, { proposalId: m.proposition.id, projectId, baseVersionId: versionId });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(await etatProp(m.proposition.id)).toBe('approved');
    expect((await versions(projectId))).toHaveLength(2);
    // 3 · restitution · le brief relu porte l’angle
    const brief2 = (await contenuVersion(a.version.id)).brief as unknown as BriefCanonique;
    expect(brief2.angle).toBe('Le premier plongeon');
  });

  it('une proposition REJETÉE ne s’applique jamais (garantie réutilisée, pas de version)', async () => {
    const brief = briefBase();
    const { projectId, versionId } = await projetBrief(ids.brandA1, brief);
    const ctx = ctxDe(ids, 'ua');
    const m = await creerPropositionManuelle(ctx, { projectId, baseVersionId: versionId, cible: 'brief', changes: [changementAngleManuel(brief, 'Un angle')], explication: '' });
    if (!m.ok || m.statut !== 'proposee') throw new Error('création');
    const r = await rejeterProposition(ctx, { proposalId: m.proposition.id, projectId });
    expect(r.ok).toBe(true);
    expect(await etatProp(m.proposition.id)).toBe('rejected');
    const a = await appliquerProposition(ctx, { proposalId: m.proposition.id, projectId, baseVersionId: versionId });
    expect(a).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    expect((await versions(projectId))).toHaveLength(1);
  });
});

describe('Direction · « Écrire le style » et « Autre direction » (Jarvis simulé)', () => {
  it('écrire le style → proposition manuelle adoptée → styleIntent dans le brief relu', async () => {
    const brief = briefBase();
    const { projectId, versionId } = await projetBrief(ids.brandA1, brief);
    const ctx = ctxDe(ids, 'ua');
    const changement = changementStyleManuel('Lumière douce, palette pastel');
    expect(changement).toMatchObject({ op: 'replace', path: '/brief/styleIntent' });
    const m = await creerPropositionManuelle(ctx, { projectId, baseVersionId: versionId, cible: 'brief', changes: [changement], explication: 'Style à la main' });
    if (!m.ok || m.statut !== 'proposee') throw new Error('création');
    const a = await appliquerProposition(ctx, { proposalId: m.proposition.id, projectId, baseVersionId: versionId });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const brief2 = (await contenuVersion(a.version.id)).brief as unknown as BriefCanonique;
    expect(brief2.styleIntent).toBe('Lumière douce, palette pastel');
  });

  it('« Autre direction » (proposerBrief, fournisseur simulé) → proposition relue, adoptée, styleIntent écrit', async () => {
    await publierRegistreDeTest(depotPrompts, acteurPlateforme());
    const brief = briefBase();
    const { projectId, versionId } = await projetBrief(ids.brandA1, brief);
    const ctx = ctxDe(ids, 'ua');
    const briefPropose: BriefCanonique = { ...brief, angle: 'Le premier plongeon', styleIntent: 'Lumière dorée de fin de journée' };
    reponse = () => ({ status: 'ready', questions: [], warnings: [], evidenceIds: [], result: briefPropose });

    const r = await proposerAvecJarvis(ctx, { tache: 'brief.build', projectId, baseVersionId: versionId, demande: 'Propose une direction lumineuse' }, deps);
    expect(r.ok && r.statut).toBe('proposee');
    if (!r.ok || r.statut !== 'proposee') return;
    expect(fournisseur.recues.length).toBeGreaterThan(0); // un vrai appel (simulé) a eu lieu
    expect(await etatProp(r.proposition.id)).toBe('proposed');
    expect((await versions(projectId))).toHaveLength(1); // rien appliqué sans geste

    const a = await appliquerProposition(ctx, { proposalId: r.proposition.id, projectId, baseVersionId: versionId });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const brief2 = (await contenuVersion(a.version.id)).brief as unknown as BriefCanonique;
    expect(brief2.styleIntent).toBe('Lumière dorée de fin de journée');
    expect(brief2.angle).toBe('Le premier plongeon');
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · appliquerProposition qui n'exigerait pas l'état `proposed` → « une rejetée ne s’applique jamais » tombe.
 *  · changementStyleManuel ciblant un mauvais chemin → styleIntent absent après application · le cas direction tombe.
 *  · changementAngleManuel forçant `replace` (angle absent) → l’application échoue · « restitution » tombe.
 */
