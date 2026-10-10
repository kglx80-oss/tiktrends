import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L8-C · limites explicites sur une VRAIE base (pglite, migrations réelles),
 * par les VRAIES actions (`enregistrerDocument`, `creerProjet`).
 *
 * Au-delà de 1000 calques ou de 200 plans : refus `INVALID_SCHEMA` ciblé, et
 * on LIT la base après coup · aucune version, aucun projet, aucun audit de
 * plus ; la version courante, son contenu et son empreinte sont intacts. À
 * la limite exacte, l'enregistrement passe. Un document déjà au-delà
 * (antérieur aux limites, semé directement) s'OUVRE encore dans l'éditeur.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
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
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq } from '@tiktrends/db';
import {
  contenuSynthetique, documentSynthetique, plansSynthetiques, jsonCanonique, messageLimiteCalques, messageLimitePlans, CALQUES_MAX, PLANS_MAX_PROJET,
  type ContenuVersion, type CalqueTexte,
} from '@tiktrends/core';
import { semer, session } from './studios-semis';
import { ctxDe, projetVideo } from './l4a-outils';
import { creerProjet, enregistrerDocument } from '../app/actions/studios/projets';
import { lireEditeurPour } from '../lib/studios/editeur/lecture';
import type { BaseStudio } from '../lib/studios/execution/types';

const ids = h.ids;
const base = db as unknown as BaseStudio;

async function etat(projectId: string) {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const versions = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.projectId, projectId));
  const courante = versions.find((v) => v.id === p!.currentVersionId)!;
  return {
    courante: p!.currentVersionId, rowVersion: p!.rowVersion, versions: versions.length,
    contenu: jsonCanonique(courante.content), empreinte: courante.contentHash,
    audits: (await db.select().from(schema.studioAuditEvents)).length, projets: (await db.select().from(schema.studioProjects)).length,
  };
}

/** Un calque texte neuf (forme du noyau), z libre au-dessus de tout. */
const nouveauTexte = (id: string, z: number): CalqueTexte => ({
  id, kind: 'text', name: 'En trop', visible: true, locked: false, x: 10, y: 10, width: 200, height: 60, rotationDeg: 0, opacity: 1, z,
  text: 'Un de trop', fontId: 'f_sans', fontSizePx: 24, color: '#111111', align: 'left', lineHeight: 1.2,
});

beforeAll(async () => {
  await semer(db, schema, ids);
  h.session = session(ids, 'ua');
});

describe('L8-C · au-delà des limites, rien n’est écrit', () => {
  it('le 1001e calque est refusé · message de la limite, version courante intacte, aucune ligne de plus', async () => {
    const contenu = contenuSynthetique({ plans: 20, calques: CALQUES_MAX, graine: 11 });
    const { projectId, versionId } = await projetVideo(base, ids, ids.brandA1, ids.ua, contenu);
    const avant = await etat(projectId);
    const r = await enregistrerDocument({ projectId, baseVersionId: versionId, changes: [{ op: 'add', path: '/document/layers/texte_en_trop', newValue: nouveauTexte('texte_en_trop', CALQUES_MAX + 10), reason: 'un de trop' }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INVALID_SCHEMA');
    expect(r.violations).toEqual([{ chemin: '/document/layers', raison: messageLimiteCalques(1001) }]);
    expect(await etat(projectId)).toEqual(avant);
  });

  it('à la limite exacte, un enregistrement passe · la limite ne bloque pas l’usage normal', async () => {
    const contenu = contenuSynthetique({ plans: 20, calques: CALQUES_MAX - 1, graine: 12 });
    const { projectId, versionId } = await projetVideo(base, ids, ids.brandA1, ids.ua, contenu);
    const r = await enregistrerDocument({ projectId, baseVersionId: versionId, changes: [{ op: 'add', path: '/document/layers/texte_dernier', newValue: nouveauTexte('texte_dernier', CALQUES_MAX + 10), reason: 'le millième' }] });
    expect(r.ok).toBe(true);
    const apres = await etat(projectId);
    expect(apres.versions).toBe(2);
    expect(Object.keys((JSON.parse(apres.contenu) as ContenuVersion).document!.layers)).toHaveLength(CALQUES_MAX);
  });

  it('le 201e plan est refusé · même garantie', async () => {
    const contenu = contenuSynthetique({ plans: PLANS_MAX_PROJET, calques: 10, graine: 13 });
    const { projectId, versionId } = await projetVideo(base, ids, ids.brandA1, ids.ua, contenu);
    const avant = await etat(projectId);
    const p = { ...plansSynthetiques(1, 21)[0]!, shotId: 's_en_trop' };
    const r = await enregistrerDocument({
      projectId, baseVersionId: versionId,
      changes: [
        { op: 'add', path: '/shots/byId/s_en_trop', newValue: p, reason: 'un plan de trop' },
        { op: 'replace', path: '/shots/order', newValue: [...contenu.shots.order, 's_en_trop'], reason: 'un plan de trop' },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.violations).toEqual([{ chemin: '/shots', raison: messageLimitePlans(201) }]);
    expect(await etat(projectId)).toEqual(avant);
  });

  it('créer un projet de 1001 calques est refusé · aucun projet, aucune version', async () => {
    const projets = (await db.select().from(schema.studioProjects)).length;
    const versions = (await db.select().from(schema.studioProjectVersions)).length;
    const r = await creerProjet({ brandId: ids.brandA1, kind: 'image', title: 'Trop grand', contenu: contenuSynthetique({ plans: 0, calques: CALQUES_MAX + 1, graine: 14 }) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.violations).toEqual([{ chemin: '/document/layers', raison: messageLimiteCalques(1001) }]);
    expect((await db.select().from(schema.studioProjects)).length).toBe(projets);
    expect((await db.select().from(schema.studioProjectVersions)).length).toBe(versions);
  });
});

describe('L8-C · un document déjà au-delà reste accessible', () => {
  it('1005 calques semés avant les limites · l’éditeur l’ouvre, document entier', async () => {
    const contenu: ContenuVersion = { ...contenuSynthetique({ plans: 0, calques: 0 }), document: documentSynthetique(CALQUES_MAX + 5, 15) };
    const { projectId } = await projetVideo(base, ids, ids.brandA1, ids.ua, contenu);
    const l = await lireEditeurPour(ctxDe(ids, 'ua'), projectId);
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    expect(Object.keys(l.donnees.document!.layers)).toHaveLength(CALQUES_MAX + 5);
  });
});
