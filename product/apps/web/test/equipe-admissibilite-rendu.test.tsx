// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Suivi de la PR #1106 · l'admissibilité VISIBLE sur `/admin/equipe`.
 *
 * On rend la VRAIE page (« Rôles & droits », base pglite) et on lit le HTML :
 *  · I2 · chaque membre dit s'il est admissible, la date de création de son
 *    compte (ou « aucun compte »), et, quand il ne l'est pas, la consigne de
 *    réinscription · vérifier HORS du produit qu'il détient l'adresse ;
 *  · I3 · le membre concerné (accès total, non admissible) lit pourquoi il a
 *    perdu crédits illimités et Connaissances, et quoi demander.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  delete process.env.FOUNDER_EMAILS;
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
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, usePathname: () => '/admin/equipe', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('../app/actions/equipe', () => ({ enregistrerStaffAction: async () => {}, retirerStaffAction: async () => {}, enregistrerMatriceAction: async () => {} }));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { MESSAGE_NON_ADMISSIBLE } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { avecSpatial } from './spatial/fournisseur';
import DroitsSpatial from '../app/(spatial)/sp/admin/equipe/page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement;
let root: Root;
afterEach(() => { act(() => root.unmount()); hote.remove(); });

const ids = h.ids;
// Midi UTC · la date affichée ne dépend pas du fuseau.
const jour = (j: number) => new Date(Date.UTC(2026, 9, j, 12));
const MEMBRE = { legitime: 'ua@studios.test', capte: 'uv@studios.test', invite: 'invite@agence.test', dev: 'ur@studios.test' };

beforeAll(async () => {
  await semer(db, schema, ids);
  // Le compte légitime existait AVANT son inscription · le compte « capté » a été créé APRÈS.
  await db.update(schema.users).set({ createdAt: jour(1) }).where(eq(schema.users.id, ids.ua));
  await db.update(schema.users).set({ createdAt: jour(10) }).where(eq(schema.users.id, ids.uv));
  await db.update(schema.users).set({ createdAt: jour(12) }).where(eq(schema.users.id, ids.ur));
  await db.insert(schema.platformStaff).values([
    { email: MEMBRE.legitime, role: 'adminplus', createdAt: jour(5) },
    { email: MEMBRE.capte, role: 'admin', createdAt: jour(5) },
    // Invité depuis « Inviter », sans compte encore.
    { email: MEMBRE.invite, role: 'admin', createdAt: jour(5) },
    { email: MEMBRE.dev, role: 'dev', createdAt: jour(5) },
  ]);
});

async function monter(qui: 'ua' | 'uv') {
  const equipe = qui === 'ua' ? { role: 'adminplus', matrice: {}, plateformeAdmissible: true } : { role: 'admin', matrice: {}, plateformeAdmissible: false };
  h.session = session(ids, qui, { role: 'owner', equipe: equipe as SessionTest['equipe'] });
  const vue = await DroitsSpatial({ searchParams: Promise.resolve({}) });
  hote = document.createElement('div'); document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => { root.render(avecSpatial(vue)); });
}
const ligne = (email: string) => hote.querySelector(`[data-membre="${email}"]`);
const texte = (email: string) => ligne(email)?.textContent ?? `(aucune ligne pour ${email})`;

describe('I2 · /admin/equipe · admissibilité et date du compte, par membre', () => {
  it('compte antérieur à l’inscription · admissible, avec la date de son compte, sans consigne', async () => {
    await monter('ua');
    expect(texte(MEMBRE.legitime)).toContain('Admissible');
    expect(texte(MEMBRE.legitime)).not.toContain('Non admissible');
    expect(texte(MEMBRE.legitime)).toContain('compte créé le 1 oct. 2026');
    expect(ligne(MEMBRE.legitime)?.querySelector('[data-consigne]'), 'consigne affichée à un membre admissible').toBeNull();
  });

  it('compte postérieur · non admissible, date du compte, consigne de vérification hors produit', async () => {
    await monter('ua');
    expect(texte(MEMBRE.capte)).toContain('Non admissible');
    expect(texte(MEMBRE.capte)).toContain('compte créé le 10 oct. 2026');
    const consigne = ligne(MEMBRE.capte)?.querySelector('[data-consigne]')?.textContent ?? '(aucune consigne)';
    expect(consigne).toContain('vérifie hors du produit');
    expect(consigne).toContain('détient bien cette adresse');
    expect(consigne).toContain('retire-la puis réinscris-la');
  });

  it('invité sans compte · « aucun compte », non admissible, consigne', async () => {
    await monter('ua');
    expect(texte(MEMBRE.invite)).toContain('aucun compte');
    expect(texte(MEMBRE.invite)).toContain('Non admissible');
    expect(ligne(MEMBRE.invite)?.querySelector('[data-consigne]')?.textContent ?? '').toContain('vérifie hors du produit');
  });

  it('rôle gradé non admissible · dit, sans consigne (rien ne s’ouvre pour ce rôle)', async () => {
    await monter('ua');
    expect(texte(MEMBRE.dev)).toContain('Non admissible · sans effet pour ce rôle');
    expect(ligne(MEMBRE.dev)?.querySelector('[data-consigne]')).toBeNull();
  });

  it('aucun tiret cadratin, aucune marque tierce à l’écran', async () => {
    await monter('ua');
    expect(hote.textContent).not.toContain('—');
    expect(hote.textContent?.toLowerCase()).not.toContain('trendtrack');
  });
});

describe('I3 · le membre concerné sait pourquoi', () => {
  it('Admin non admissible · le message dédié est affiché', async () => {
    await monter('uv');
    const alerte = hote.querySelector('[data-non-admissible]');
    expect(alerte?.textContent ?? '(aucun message dédié)').toBe(MESSAGE_NON_ADMISSIBLE);
    expect(MESSAGE_NON_ADMISSIBLE).toContain('Demande à un fondateur de te réinscrire');
  });

  it('Admin+ admissible · aucun message dédié', async () => {
    await monter('ua');
    expect(hote.querySelector('[data-non-admissible]')).toBeNull();
    expect(hote.textContent).not.toContain(MESSAGE_NON_ADMISSIBLE);
  });
});
