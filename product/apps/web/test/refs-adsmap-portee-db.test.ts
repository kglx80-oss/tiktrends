import { describe, it, expect, vi, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { IdsStudios } from './studios-semis';

/**
 * Références Adsmap V5 · sur une VRAIE base (pglite + migrations), par la
 * fonction serveur `creerProjet`. On lit le RÉSULTAT (projet créé ou refus
 * INVALID_SCHEMA) et l'état en base, jamais « une fonction a été appelée ».
 *
 * Défaut reproduit sur `main` : `creerProjet` ne validait que la FORME du brief
 * · une `personaRef` inexistante OU d'une autre marque/espace passait et créait
 * le projet. Ces tests le font ÉCHOUER d'abord (cas hors marque / hors espace /
 * inexistant), puis le câblage (portée + résolveur injectés) les refuse de
 * façon INDISTINCTE, sans jamais toucher la base. Un persona de la marque du
 * projet reste accepté ; un brief hérité sans `*Ref` reste valide.
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
import { creerProjet } from '../lib/studios/depot';

const ids = etat.ids;

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

/** `creerProjet` sur la marque A1 avec un brief citant `personaRef = { id }`. */
async function creerAvecPersona(personaId: string) {
  const brief = { ...briefBase(), personaRef: { id: personaId, label: 'figé au choix' } };
  const contenu = { ...contenuVide(), brief: brief as unknown as Record<string, unknown> };
  return creerProjet(ctxUa(), { brandId: ids.brandA1, kind: 'image', title: 'Projet démo', contenu, raison: 'test' });
}

const idPersona = { a1: '', a2: '', b1: '' };

async function nbProjets(): Promise<number> {
  return (await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.workspaceId, ids.wsA))).length;
}

beforeAll(async () => {
  await semer(db as never, schema as never, ids);
  idPersona.a1 = randomUUID();
  idPersona.a2 = randomUUID();
  idPersona.b1 = randomUUID();
  await db.insert(schema.personas).values([
    { id: idPersona.a1, brandId: ids.brandA1, name: 'Persona A1' }, // marque du projet
    { id: idPersona.a2, brandId: ids.brandA2, name: 'Persona A2' }, // autre marque, même espace A
    { id: idPersona.b1, brandId: ids.brandB1, name: 'Persona B1' }, // autre espace B
  ]);
});

describe('creerProjet · portée des références Adsmap citées par le brief', () => {
  it('persona de la MARQUE du projet · accepté, projet créé', async () => {
    const avant = await nbProjets();
    const r = await creerAvecPersona(idPersona.a1);
    expect(r.ok).toBe(true);
    expect(await nbProjets()).toBe(avant + 1);
  });

  it('persona d’une AUTRE marque du même espace · refus indistinct, rien créé', async () => {
    const avant = await nbProjets();
    const r = await creerAvecPersona(idPersona.a2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('INVALID_SCHEMA');
      expect(r.violations).toContainEqual({ chemin: '/contenu/brief/personaRef', raison: RAISON_REF_HORS_PORTEE });
    }
    expect(await nbProjets()).toBe(avant);
  });

  it('persona d’un AUTRE espace · même refus (ni existence ni appartenance révélées)', async () => {
    const avant = await nbProjets();
    const r = await creerAvecPersona(idPersona.b1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContainEqual({ chemin: '/contenu/brief/personaRef', raison: RAISON_REF_HORS_PORTEE });
    expect(await nbProjets()).toBe(avant);
  });

  it('persona INEXISTANT (uuid au hasard) · même refus que hors marque', async () => {
    const avant = await nbProjets();
    const r = await creerAvecPersona(randomUUID());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContainEqual({ chemin: '/contenu/brief/personaRef', raison: RAISON_REF_HORS_PORTEE });
    expect(await nbProjets()).toBe(avant);
  });

  it('personaRef d’un id MALFORMÉ (non-uuid) · refusé proprement, aucune requête en erreur', async () => {
    const r = await creerAvecPersona('pas-un-uuid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContainEqual({ chemin: '/contenu/brief/personaRef', raison: RAISON_REF_HORS_PORTEE });
  });

  it('brief hérité SANS aucune *Ref · reste valide (compat ascendante, aucune requête)', async () => {
    const avant = await nbProjets();
    const contenu = { ...contenuVide(), brief: briefBase() as unknown as Record<string, unknown> };
    const r = await creerProjet(ctxUa(), { brandId: ids.brandA1, kind: 'image', title: 'Hérité', contenu, raison: 'test' });
    expect(r.ok).toBe(true);
    expect(await nbProjets()).toBe(avant + 1);
  });
});
