import { describe, it, expect, vi, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { IdsStudios } from './studios-semis';

/**
 * Références Adsmap V5 · sur une VRAIE base (pglite + migrations), par les
 * fonctions serveur `creerProjet` (création) ET `enregistrerVersion` (éditeur).
 * On lit le RÉSULTAT (projet/version créés ou refus INVALID_SCHEMA) et l'état
 * en base, jamais « une fonction a été appelée ».
 *
 * Défaut reproduit sur `main` : les deux écritures ne validaient que la FORME
 * (ou rien, pour l'éditeur) · une `*Ref` inexistante OU d'une autre
 * marque/espace passait. Le câblage (portée + résolveur injectés) la refuse de
 * façon INDISTINCTE, sans toucher la base. Les quatre kinds (persona, désir,
 * angle, concept) sont éprouvés, y compris les chaînes de jointure multi-sauts
 * (désir→persona, angle→désir→persona, concept→angle→désir→persona).
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios }));
vi.hoisted(() => {
  const { randomUUID: u } = require('node:crypto') as typeof import('node:crypto');
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
  process.env.DATABASE_URL = 'postgres://test@127.0.0.1:5433/refsadsmap_pglite';
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import { contenuVide, RAISON_REF_HORS_PORTEE, type BriefCanonique } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { contexteDepuisSession, type ContexteStudio } from '../lib/studios/garde';
import { creerProjet, enregistrerVersion } from '../lib/studios/depot';

type CleRef = 'personaRef' | 'desirRef' | 'angleRef' | 'conceptRef';

/** Brief hérité minimal · les treize champs canoniques, aucun champ V5. */
function briefBase(): BriefCanonique {
  return {
    objective: 'Vendre la crème', audience: 'Femmes 30-45', hypothesisId: null, testedVariable: '',
    facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '',
    texts: [], formats: [], exclusions: [],
  };
}

/** Contexte 'ua' · espace A, voit A1 et A2, aucune restriction. */
function ctxUa(): ContexteStudio {
  return contexteDepuisSession(session(ids, 'ua'), [ids.brandA1, ids.brandA2], [], `st_test_${randomUUID()}`);
}

const ids = etat.ids;

/** `creerProjet` sur A1 avec un brief citant `<cle> = { id }`. */
async function creerAvecRef(cle: CleRef, id: string) {
  const brief = { ...briefBase(), [cle]: { id, label: 'figé au choix' } };
  const contenu = { ...contenuVide(), brief: brief as unknown as Record<string, unknown> };
  return creerProjet(ctxUa(), { brandId: ids.brandA1, kind: 'image', title: 'Projet démo', contenu, raison: 'test' });
}

async function nbProjets(): Promise<number> {
  return (await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.workspaceId, ids.wsA))).length;
}

// Lignes Adsmap semées · pour chaque marque, une chaîne persona→désir→angle→concept.
const refIds: Record<'A1' | 'A2', Record<CleRef, string>> = {
  A1: { personaRef: '', desirRef: '', angleRef: '', conceptRef: '' },
  A2: { personaRef: '', desirRef: '', angleRef: '', conceptRef: '' },
};
const persoB1 = randomUUID();

async function semerChaine(marque: 'A1' | 'A2', brandId: string): Promise<void> {
  const p = randomUUID(), d = randomUUID(), a = randomUUID(), c = randomUUID();
  await db.insert(schema.personas).values({ id: p, brandId, name: `Persona ${marque}` });
  await db.insert(schema.desires).values({ id: d, workspaceId: ids.wsA, personaId: p, label: `Désir ${marque}` });
  await db.insert(schema.angles).values({ id: a, workspaceId: ids.wsA, desireId: d, label: `Angle ${marque}`, mechanism: 'demo' });
  await db.insert(schema.concepts).values({ id: c, workspaceId: ids.wsA, angleId: a, title: `Concept ${marque}` });
  refIds[marque] = { personaRef: p, desirRef: d, angleRef: a, conceptRef: c };
}

beforeAll(async () => {
  await semer(db as never, schema as never, ids);
  await semerChaine('A1', ids.brandA1); // marque du projet
  await semerChaine('A2', ids.brandA2); // autre marque, même espace A
  await db.insert(schema.personas).values({ id: persoB1, brandId: ids.brandB1, name: 'Persona B1' }); // autre espace
});

describe('creerProjet · portée des références Adsmap citées par le brief', () => {
  const KINDS: CleRef[] = ['personaRef', 'desirRef', 'angleRef', 'conceptRef'];

  it('référence de la MARQUE du projet · acceptée, projet créé (les 4 kinds)', async () => {
    for (const cle of KINDS) {
      const avant = await nbProjets();
      const r = await creerAvecRef(cle, refIds.A1[cle]);
      expect(r.ok, `${cle} en marque doit être accepté`).toBe(true);
      expect(await nbProjets()).toBe(avant + 1);
    }
  });

  it('référence d’une AUTRE marque du même espace · refus indistinct, rien créé (les 4 kinds)', async () => {
    for (const cle of KINDS) {
      const avant = await nbProjets();
      const r = await creerAvecRef(cle, refIds.A2[cle]);
      expect(r.ok, `${cle} hors marque doit être refusé`).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('INVALID_SCHEMA');
        expect(r.violations).toContainEqual({ chemin: `/contenu/brief/${cle}`, raison: RAISON_REF_HORS_PORTEE });
      }
      expect(await nbProjets()).toBe(avant);
    }
  });

  it('persona d’un AUTRE espace · même refus (ni existence ni appartenance révélées)', async () => {
    const avant = await nbProjets();
    const r = await creerAvecRef('personaRef', persoB1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContainEqual({ chemin: '/contenu/brief/personaRef', raison: RAISON_REF_HORS_PORTEE });
    expect(await nbProjets()).toBe(avant);
  });

  it('référence INEXISTANTE / id MALFORMÉ · même refus, aucune requête en erreur', async () => {
    for (const id of [randomUUID(), 'pas-un-uuid']) {
      const r = await creerAvecRef('angleRef', id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.violations).toContainEqual({ chemin: '/contenu/brief/angleRef', raison: RAISON_REF_HORS_PORTEE });
    }
  });

  it('brief hérité SANS aucune *Ref · reste valide (compat ascendante, aucune requête)', async () => {
    const avant = await nbProjets();
    const contenu = { ...contenuVide(), brief: briefBase() as unknown as Record<string, unknown> };
    const r = await creerProjet(ctxUa(), { brandId: ids.brandA1, kind: 'image', title: 'Hérité', contenu, raison: 'test' });
    expect(r.ok).toBe(true);
    expect(await nbProjets()).toBe(avant + 1);
  });
});

describe('enregistrerVersion (éditeur) · une *Ref hors portée ne s’écrit pas APRÈS création', () => {
  async function projetSansRef() {
    const contenu = { ...contenuVide(), brief: briefBase() as unknown as Record<string, unknown> };
    const r = await creerProjet(ctxUa(), { brandId: ids.brandA1, kind: 'image', title: 'Éditable', contenu, raison: 'test' });
    if (!r.ok) throw new Error('création de base refusée');
    return { projectId: r.projet.id, versionId: r.version.id };
  }
  const patchPersona = (id: string) => ([{ op: 'add', path: '/brief/personaRef', newValue: { id, label: 'figé' }, reason: 'ajout persona' }]);

  it('patch /brief/personaRef vers une AUTRE marque · refusé, aucune nouvelle version', async () => {
    const { projectId, versionId } = await projetSansRef();
    const versionsAvant = (await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, projectId))).length;
    const r = await enregistrerVersion(ctxUa(), { projectId, baseVersionId: versionId, changes: patchPersona(refIds.A2.personaRef), raison: 'édition' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContainEqual({ chemin: '/contenu/brief/personaRef', raison: RAISON_REF_HORS_PORTEE });
    const versionsApres = (await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, projectId))).length;
    expect(versionsApres).toBe(versionsAvant);
  });

  it('patch /brief/personaRef vers la MARQUE du projet · accepté, nouvelle version', async () => {
    const { projectId, versionId } = await projetSansRef();
    const r = await enregistrerVersion(ctxUa(), { projectId, baseVersionId: versionId, changes: patchPersona(refIds.A1.personaRef), raison: 'édition' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inchange).toBe(false);
  });
});
