import { describe, it, expect, vi, beforeAll } from 'vitest';

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
import { permissionsStudio, restreindrePlateforme, PERMISSIONS_PLATEFORME, messageNonAdmissible, MESSAGE_NON_ADMISSIBLE, MESSAGE_FONDATEUR_HORS_CODE } from '@tiktrends/core';
import { equipeDeSession } from '../lib/equipe-plateforme';
import { equipeAuthentique } from '../lib/registre-equipe-session';

/** L'équipe que lit la production · le jeton de `equipeDeSession`, passé par l'accesseur (suite de #1125). */
const equipeLue = async (email: string) => equipeAuthentique({ equipe: await equipeDeSession(email) });
import { aPouvoirsFondateur, estFondateurCode, estFondateurEnvironnement } from '../lib/founder';

/** Un fondateur de la liste codée du dépôt (lib/founder.ts · FONDATEURS). */
const FONDATEUR_CODE = 'kguilbaux@agence-glx.fr';

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
  await db!.insert(schema.users).values({ email: FONDATEUR_CODE, createdAt: FEVRIER });
  await db!.insert(schema.users).values({ email: ENV_FONDATEUR, createdAt: FEVRIER });
});

function portee(roleEquipe: string, admissible: boolean | undefined) {
  const p = permissionsStudio({ roleEspace: 'owner', studioOuvert: true, roleEquipe });
  return [...restreindrePlateforme(p, admissible ?? false).plateforme].sort();
}

describe('SEC-10 · equipeDeSession · antériorité du compte', () => {
  it('compte créé APRÈS l’inscription staff · rôle conservé, portée plateforme du studio refusée', async () => {
    const e = await equipeLue(CAPTE);
    expect(e?.role, 'le rôle d’équipe ne doit pas être retiré ailleurs').toBe('admin');
    expect(e?.plateformeAdmissible, 'compte créé après l’entrée staff jugé admissible').toBe(false);
    expect(portee(e!.role, e!.plateformeAdmissible), 'le compte capté reçoit des permissions plateforme').toEqual([]);
  });

  it('compte créé AVANT l’inscription staff · admissible, portée plateforme complète', async () => {
    const e = await equipeLue(LEGITIME);
    expect(e?.role).toBe('admin');
    expect(e?.plateformeAdmissible).toBe(true);
    expect(portee(e!.role, e!.plateformeAdmissible)).toEqual([...PERMISSIONS_PLATEFORME].sort());
  });

  it('fondateur de la liste codée · admissible quelle que soit la date', async () => {
    const e = await equipeLue(FONDATEUR_CODE);
    expect(e).toMatchObject({ role: 'adminplus', plateformeAdmissible: true });
  });

  it('fondateur par FOUNDER_EMAILS seulement · rôle conservé, non admissible (liste codée exigée)', async () => {
    const e = await equipeLue(ENV_FONDATEUR);
    expect(e).toMatchObject({ role: 'adminplus', plateformeAdmissible: false });
  });

  it('le message dédié suit les faits de la session · inscrit puis compte postérieur, ou fondateur de l’environnement sans inscription', async () => {
    expect(messageNonAdmissible(await equipeLue(CAPTE))).toBe(MESSAGE_NON_ADMISSIBLE);
    const env = await equipeLue(ENV_FONDATEUR);
    expect(env?.inscritEquipe, 'un fondateur de l’environnement n’a pas de ligne d’équipe').toBe(false);
    expect(messageNonAdmissible(env), 'un fondateur de l’environnement lit « créé après ton inscription »').toBe(MESSAGE_FONDATEUR_HORS_CODE);
    expect(messageNonAdmissible(await equipeLue(LEGITIME))).toBeNull();
  });

  it('compte client · aucune équipe, comme avant', async () => {
    expect(await equipeLue('client@sec.test')).toBeNull();
  });
});

describe('SEC-10 · estFondateurCode · liste codée seule, sans FOUNDER_EMAILS', () => {
  it('fondateur codé · oui (casse et espaces ignorés) ; fondateur par variable d’environnement · non', () => {
    expect(estFondateurCode(FONDATEUR_CODE)).toBe(true);
    expect(estFondateurCode('  KGuilbaux@Agence-GLX.fr ')).toBe(true);
    expect(estFondateurEnvironnement(ENV_FONDATEUR), 'la variable d’environnement est lue (message dédié)').toBe(true);
    expect(aPouvoirsFondateur(ENV_FONDATEUR), 'la variable d’environnement n’ouvre plus aucun pouvoir fondateur (« Codé seul »)').toBe(false);
    expect(aPouvoirsFondateur(FONDATEUR_CODE)).toBe(true);
    expect(estFondateurCode(ENV_FONDATEUR), 'un fondateur par variable d’environnement n’est pas de la liste codée').toBe(false);
    expect(estFondateurCode(null)).toBe(false);
  });
});
