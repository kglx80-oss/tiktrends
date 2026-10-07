import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SEC-10 / E5 · aucune escalade vers les permissions PLATEFORME du nouveau
 * studio par un e-mail inscrit dans `platform_staff` avant que son compte
 * existe.
 *
 * ── Le défaut reproduit ──────────────────────────────────────────────────────
 * `platform_staff` est indexé par e-mail, aucun e-mail n'est vérifié. Un accès
 * total inscrit `nouvelle.recrue@…` dans l'équipe ; quiconque crée ensuite un
 * compte avec cet e-mail (inscription libre, ou lien d'invitation affiché en
 * clair) reçoit `admin` · et `permissionsStudio` lui donnait `prompt.*`,
 * `provider.configure`, `run.inspect_redacted`.
 *
 * ── Ce qu'on mesure ──────────────────────────────────────────────────────────
 * Sur une vraie base (pglite), `equipeDeSession` :
 *  · garde le rôle et la matrice tels quels (rien n'est retiré ailleurs) ;
 *  · pose `plateformeAdmissible` selon l'antériorité du compte ;
 * puis la composition à brancher dans `lib/studios/garde.ts`
 * (`restreindrePlateforme(permissionsStudio(...), admissible)`) rend une
 * portée plateforme VIDE au compte capté, pleine au compte légitime.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import { permissionsStudio, restreindrePlateforme, PERMISSIONS_PLATEFORME } from '@tiktrends/core';
import { equipeDeSession, FONDATEURS_CODES } from '../lib/equipe-plateforme';

const JANVIER = new Date('2026-01-01T00:00:00Z');
const FEVRIER = new Date('2026-02-01T00:00:00Z');
const CAPTE = 'nouvelle.recrue@sec.test';
const LEGITIME = 'ancienne.collegue@sec.test';
const ENV_FONDATEUR = 'env.fondateur@sec.test';

beforeAll(async () => {
  process.env.FOUNDER_EMAILS = ENV_FONDATEUR;
  // Entrée staff posée en JANVIER, compte créé en FÉVRIER par n'importe qui.
  await db!.insert(schema.platformStaff).values({ email: CAPTE, role: 'admin', createdAt: JANVIER });
  await db!.insert(schema.users).values({ email: CAPTE, createdAt: FEVRIER });
  // Compte existant en JANVIER, inscrit à l'équipe en FÉVRIER · le cas légitime.
  await db!.insert(schema.users).values({ email: LEGITIME, createdAt: JANVIER });
  await db!.insert(schema.platformStaff).values({ email: LEGITIME, role: 'admin', createdAt: FEVRIER });
  // Fondateur codé, compte récent, sans ligne staff (filet adminplus).
  await db!.insert(schema.users).values({ email: FONDATEURS_CODES[0]!, createdAt: FEVRIER });
  await db!.insert(schema.users).values({ email: ENV_FONDATEUR, createdAt: FEVRIER });
});

function portee(roleEquipe: string, admissible: boolean | undefined) {
  const p = permissionsStudio({ roleEspace: 'owner', studioOuvert: true, roleEquipe });
  return [...restreindrePlateforme(p, admissible ?? false).plateforme].sort();
}

describe('SEC-10 · equipeDeSession · antériorité du compte', () => {
  it('compte créé APRÈS l’inscription staff · rôle conservé, portée plateforme du studio refusée', async () => {
    const e = await equipeDeSession(CAPTE);
    expect(e?.role, 'le rôle d’équipe ne doit pas être retiré ailleurs').toBe('admin');
    expect(e?.plateformeAdmissible, 'compte créé après l’entrée staff jugé admissible').toBe(false);
    expect(portee(e!.role, e!.plateformeAdmissible), 'le compte capté reçoit des permissions plateforme').toEqual([]);
  });

  it('compte créé AVANT l’inscription staff · admissible, portée plateforme complète', async () => {
    const e = await equipeDeSession(LEGITIME);
    expect(e?.role).toBe('admin');
    expect(e?.plateformeAdmissible).toBe(true);
    expect(portee(e!.role, e!.plateformeAdmissible)).toEqual([...PERMISSIONS_PLATEFORME].sort());
  });

  it('fondateur de la liste codée · admissible quelle que soit la date', async () => {
    const e = await equipeDeSession(FONDATEURS_CODES[0]!);
    expect(e).toMatchObject({ role: 'adminplus', plateformeAdmissible: true });
  });

  it('fondateur par FOUNDER_EMAILS seulement · rôle conservé, non admissible (liste codée exigée)', async () => {
    const e = await equipeDeSession(ENV_FONDATEUR);
    expect(e).toMatchObject({ role: 'adminplus', plateformeAdmissible: false });
  });

  it('compte client · aucune équipe, comme avant', async () => {
    expect(await equipeDeSession('client@sec.test')).toBeNull();
  });
});

describe('SEC-10 · la recopie de la liste codée suit lib/founder.ts', () => {
  it('FONDATEURS_CODES = FONDATEURS de founder.ts', () => {
    const src = readFileSync(join(__dirname, '..', 'lib', 'founder.ts'), 'utf8');
    const bloc = /const FONDATEURS = \[([\s\S]*?)\]/.exec(src)?.[1] ?? '';
    const emails = [...bloc.matchAll(/'([^']+@[^']+)'/g)].map((m) => m[1]!.toLowerCase()).sort();
    expect(emails.length).toBeGreaterThan(0);
    expect([...FONDATEURS_CODES].sort()).toEqual(emails);
  });
});
