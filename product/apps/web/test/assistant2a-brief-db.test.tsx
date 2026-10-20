import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Raccord V5 · Lot 2a · le brief V5 saisi dans l'assistant est RÉELLEMENT
 * persisté à la création et relu à l'identique (restitution après rechargement).
 *
 * Vraie base (pglite + migrations). On crée un projet via l'action `creerProjet`
 * avec un brief V5 (objectif typé, plateformes, persona, angle, concept,
 * contraintes) construit par la règle du noyau, puis on relit par
 * `lireProjetDetail` : les champs V5 reviennent dans `detail.brief`, et ils sont
 * bien dans `content.brief` en base. On vérifie aussi le garde du write-path :
 * un brief présent mais mal formé est REFUSÉ, rien n'est écrit.
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
import { construireBriefV5, contenuVide, type SaisieBriefV5, type ContenuVersion } from '@tiktrends/core';
import { randomUUID } from 'node:crypto';
import { session, semer } from './studios-semis';
import { creerProjet } from '../app/actions/studios/projets';
import { lireProjetDetail } from '../app/actions/studios/sources';

const ids = etat.ids;
// Persona RÉELLE de la marque du projet · la portée Adsmap (contrôlée désormais
// à la création) exige que `personaRef` cite une ligne existante de la marque.
const PERSONA_A1 = randomUUID();

const saisie: SaisieBriefV5 = {
  intention: 'Vendre les lunettes de natation aux parents',
  audience: 'Parents d’enfants de 4 à 10 ans',
  objectifType: 'conversion',
  plateformes: ['meta_feed', 'tiktok'],
  persona: { id: PERSONA_A1, label: 'Claire, maman active' },
  angle: 'Le premier plongeon',
  concept: 'Un été ludique',
  contraintes: 'Montrer le produit en entier\nPas de visage identifiable',
};

const contenuV5 = (): ContenuVersion => ({ ...contenuVide(), brief: construireBriefV5(saisie) as unknown as ContenuVersion['brief'] });

beforeAll(async () => { await semer(db, schema, ids); await db.insert(schema.personas).values({ id: PERSONA_A1, brandId: ids.brandA1, name: 'Claire, maman active' }); });
beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('brief V5 persisté à la création, relu à l’identique', () => {
  it('creerProjet({contenu}) écrit le brief V5 et lireProjetDetail le restitue', async () => {
    const c = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Le premier plongeon', contenu: contenuV5() });
    expect(c.ok, c.ok ? '' : `création refusée : ${c.code}`).toBe(true);
    if (!c.ok) return;

    // En base · le brief V5 est bien dans content.brief
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, c.version.id));
    const briefBase = (v!.content as { brief: Record<string, unknown> }).brief;
    expect(briefBase.objectifType).toBe('conversion');
    expect(briefBase.plateformes).toEqual(['meta_feed', 'tiktok']);
    expect(briefBase.personaRef).toEqual({ id: PERSONA_A1, label: 'Claire, maman active' });
    expect(briefBase.angle).toBe('Le premier plongeon');
    expect(briefBase.concept).toBe('Un été ludique');
    expect(briefBase.invariants).toEqual(['Montrer le produit en entier', 'Pas de visage identifiable']);

    // Relu par l'action de lecture (le chemin qu'emprunte l'écran au rechargement)
    const r = await lireProjetDetail({ projectId: c.projet.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.detail.briefIllisible).toBe(false);
    const b = r.detail.brief!;
    expect(b.objective).toBe('Vendre les lunettes de natation aux parents');
    expect(b.audience).toBe('Parents d’enfants de 4 à 10 ans');
    expect(b.objectifType).toBe('conversion');
    expect(b.plateformes).toEqual(['meta_feed', 'tiktok']);
    expect(b.personaRef).toEqual({ id: PERSONA_A1, label: 'Claire, maman active' });
    expect(b.angle).toBe('Le premier plongeon');
    expect(b.concept).toBe('Un été ludique');
  });

  it('un brief présent mais MAL FORMÉ est refusé · rien n’est écrit (garde du write-path)', async () => {
    const avant = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.brandId, ids.brandA1));
    const malforme = contenuV5();
    (malforme.brief as Record<string, unknown>).objectifType = 'engagement'; // hors domaine
    const c = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Refusé', contenu: malforme });
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.code).toBe('INVALID_SCHEMA');
      expect(JSON.stringify(c)).toContain('/contenu/brief/objectifType');
    }
    const apres = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.brandId, ids.brandA1));
    expect(apres.length, 'un projet a été écrit malgré le brief invalide').toBe(avant.length);
  });

  it('un brief hérité (sans champ V5) reste accepté · compat ascendante', async () => {
    const heritee = contenuVide();
    heritee.brief = { objective: 'Objectif simple', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [] };
    const c = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Hérité', contenu: heritee });
    expect(c.ok, c.ok ? '' : `refusé : ${c.code}`).toBe(true);
  });
});
