import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * SEC-03 (partie L1) et SEC-09 · la garde studio, au résultat.
 *
 * Un lecteur (`client_viewer`) appelle DIRECTEMENT les actions d'écriture : il
 * est refusé avant tout effet (aucun projet, aucune version, aucun audit). Un
 * espace Starter (studio fermé par l'offre) ne lit même pas. Un admin d'espace
 * n'obtient aucune permission plateforme. Un membre d'équipe invité en lecteur
 * ne génère pas, même si la matrice lui ouvre le studio.
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

import { db, schema } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import { creerProjet, enregistrerDocument, listerProjets, inspecterProjet } from '../app/actions/studios/projets';
import { contexteDepuisSession, gardeStudio } from '../lib/studios/garde';

const ids = etat.ids;
let projetA = { id: '', version: '' };

beforeAll(async () => {
  await semer(db, schema, ids);
  etat.session = session(ids, 'ua');
  const c = await creerProjet({ brandId: ids.brandA1, kind: 'ads', title: 'Projet du membre' });
  if (!c.ok) throw new Error(c.code);
  projetA = { id: c.projet.id, version: c.version.id };
});

const compte = async () => ({
  projets: (await db.select().from(schema.studioProjects)).length,
  versions: (await db.select().from(schema.studioProjectVersions)).length,
  audit: (await db.select().from(schema.studioAuditEvents)).length,
});

describe('SEC-03 · un lecteur ne crée ni ne modifie rien, même en appelant l’action directement', () => {
  it('creerProjet et enregistrerDocument → FORBIDDEN, base inchangée', async () => {
    const avant = await compte();
    etat.session = session(ids, 'uv');
    const c = await creerProjet({ brandId: ids.brandA1, kind: 'image', title: 'Lecteur' });
    const e = await enregistrerDocument({ projectId: projetA.id, baseVersionId: projetA.version, changes: [{ op: 'replace', path: '/brief', newValue: {}, reason: 'x' }] });
    expect(!c.ok && c.code).toBe('FORBIDDEN');
    expect(!e.ok && e.code).toBe('FORBIDDEN');
    expect(await compte()).toEqual(avant);
  });

  it('la garde refuse studio.generate au lecteur, l’accorde au membre', async () => {
    etat.session = session(ids, 'uv');
    const g1 = await gardeStudio('studio.generate');
    expect(!g1.ok && g1.code).toBe('FORBIDDEN');
    etat.session = session(ids, 'ua');
    const g2 = await gardeStudio('studio.generate');
    expect(g2.ok).toBe(true);
  });

  it('un membre d’équipe invité en lecteur ne génère pas, même si la matrice ouvre le studio', () => {
    const ctx = contexteDepuisSession(session(ids, 'uv', { equipe: { role: 'membre', matrice: { membre: ['studio'] } } }), [ids.brandA1], [], 't');
    expect(ctx.permissions.espace.has('studio.read')).toBe(true);
    expect(ctx.permissions.espace.has('studio.generate')).toBe(false);
  });

  it('offre Starter · le studio est fermé, même en lecture', async () => {
    etat.session = session(ids, 'ua', { plan: 'starter' });
    const l = await listerProjets();
    const i = await inspecterProjet(projetA.id);
    expect(!l.ok && l.code).toBe('FORBIDDEN');
    expect(!i.ok && i.code).toBe('FORBIDDEN');
    expect(JSON.stringify(i)).not.toContain('Projet du membre');
  });

  it('sans session · AUTH_REQUIRED, aucune donnée', async () => {
    etat.session = null;
    const r = await inspecterProjet(projetA.id);
    expect(!r.ok && r.code).toBe('AUTH_REQUIRED');
    expect(!r.ok && r.targetIds).toEqual([]);
  });
});

describe('SEC-09 · admin ou owner d’espace : aucune permission plateforme', () => {
  it('owner et admin d’espace sans rôle d’équipe → ensemble plateforme vide', () => {
    for (const role of ['owner', 'admin'] as const) {
      const ctx = contexteDepuisSession(session(ids, 'ua', { role }), [ids.brandA1], [], 't');
      expect([...ctx.permissions.plateforme], role).toEqual([]);
      expect(ctx.permissions.espace.has('studio.generate')).toBe(true);
    }
  });

  it('seul l’accès total plateforme ouvre prompt.publish', () => {
    const admin = contexteDepuisSession(session(ids, 'ua', { equipe: { role: 'admin', matrice: {} } }), [ids.brandA1], [], 't');
    const manager = contexteDepuisSession(session(ids, 'ua', { equipe: { role: 'manager', matrice: {} } }), [ids.brandA1], [], 't');
    expect(admin.permissions.plateforme.has('prompt.publish')).toBe(true);
    expect(manager.permissions.plateforme.has('prompt.publish')).toBe(false);
  });
});
