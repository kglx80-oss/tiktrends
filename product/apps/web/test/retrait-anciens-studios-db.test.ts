import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Retrait des anciens studios (mandat du 10/10) · sur une VRAIE base (pglite +
 * migrations réelles). Aucun réseau, aucune dépense. On lit les lignes et les
 * réponses, jamais « une fonction a été appelée ».
 *
 *  · Préparer un projet depuis un ANCIEN lien · objectif seul ⇒ un projet (brief
 *    repris, audité, idempotent par clé de clic) ; sans objectif ni source ⇒
 *    refus, rien d'écrit ; l'annonce sauvegardée du lien devient la source,
 *    celle d'un autre espace est refusée. La création depuis la Veille garde son
 *    exigence d'au moins une source.
 *  · Bibliothèque · les créations historiques terminées de l'espace (marque
 *    active) y entrent en lecture seule, jamais celles d'un autre espace ; le
 *    texte d'un ancien script se télécharge, 404 hors portée.
 *  · Vidéos historiques en cours · la vidéo prête reçoit son adresse, l'échec
 *    et l'attente trop longue sont remboursés UNE fois, au bon espace.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as null | { id: string; name: string } }));
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
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => (etat.marque ? { ...etat.marque, logoUrl: null, url: null, category: null } : null) }));

import { randomUUID } from 'node:crypto';
import { db, schema, eq, and } from '@tiktrends/db';
import { contexteDepuisSession, type ContexteStudio } from '../lib/studios/garde';
import { creerProjetDepuisContextePour, creerProjetDepuisSourcesPour, ACTION_CREATION } from '../lib/studios/sources/projet';
import { listerCreationsHistoriques } from '../lib/creations-historiques';
import { reconcilierVideosHistoriques } from '../lib/videos-historiques';
import { GET as texteHistorique } from '../app/api/creations-historiques/[id]/texte/route';
import { semer, session } from './studios-semis';

const ids = etat.ids;
const O = { veilleOuverte: true, maintenant: new Date('2026-10-10T08:00:00Z') };
const ANNONCE = {
  id: '9001', platform: 'meta', status: 'active', daysRunning: 64, mediaType: 'image',
  thumbnailUrl: 'https://cdn.exemple.test/v.jpg', mediaUrl: 'https://cdn.exemple.test/v.jpg',
  advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux. Notre sérum efface les taches en 14 jours.',
  callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr', landingUrl: 'https://lbcosmetiques.fr/serum',
};
const SAUV = { a1: '', b1: '' };
const GEN = { pubA1: randomUUID(), imageA1: randomUUID(), archiveeA1: randomUUID(), scriptA1: randomUUID(), pubA2: randomUUID(), pubB1: randomUUID(), scriptB1: randomUUID() };

function ctxDe(qui: 'ua' | 'ub'): ContexteStudio {
  const marques = qui === 'ub' ? [ids.brandB1] : [ids.brandA1, ids.brandA2];
  return contexteDepuisSession(session(ids, qui), marques, [], `st_test_${randomUUID()}`);
}
const projetsDe = async (ws: string) => db.select().from(schema.studioProjects).where(eq(schema.studioProjects.workspaceId, ws));

beforeAll(async () => {
  await semer(db, schema, ids);
  const [s1, sb] = await db.insert(schema.savedAds).values([
    { workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA1, platform: 'meta', externalId: '7001', snapshot: { ...ANNONCE, id: '7001' } },
    { workspaceId: ids.wsB, userId: ids.ub, brandId: ids.brandB1, platform: 'meta', externalId: '7003', snapshot: { ...ANNONCE, id: '7003', advertiserName: 'Concurrent B secret' } },
  ]).returning();
  SAUV.a1 = s1!.id; SAUV.b1 = sb!.id;
  const g = (id: string, brandId: string, kind: 'ad' | 'image' | 'video' | 'script', o: Record<string, unknown> = {}) => ({
    id, brandId, kind, status: 'completed', assetUrls: [`https://cdn.fal.media/${id}.png`], input: {}, ...o,
  });
  await db.insert(schema.generations).values([
    g(GEN.pubA1, ids.brandA1, 'ad'),
    g(GEN.imageA1, ids.brandA1, 'image'),
    g(GEN.archiveeA1, ids.brandA1, 'image', { status: 'archived' }),
    g(GEN.scriptA1, ids.brandA1, 'script', { assetUrls: null, output: { hooks: ['Tu dors mal ?'], angles: ['Sommeil'] } }),
    g(GEN.pubA2, ids.brandA2, 'ad'),
    g(GEN.pubB1, ids.brandB1, 'ad'),
    g(GEN.scriptB1, ids.brandB1, 'script', { assetUrls: null, output: { hooks: ['SECRET_B'] } }),
  ]);
});

describe('préparer un projet depuis un ancien lien', () => {
  it('objectif seul ⇒ un projet, brief repris, audité ; même clé de clic ⇒ le même projet', async () => {
    const e = { brandId: ids.brandA1, kind: 'video', titre: 'Depuis Vidéo IA', objectif: 'Plan serré sur le flacon', cleClic: `clic-${randomUUID()}` };
    const r = await creerProjetDepuisContextePour(ctxDe('ua'), e, O);
    expect(r.ok, !r.ok ? `${r.code} ${JSON.stringify(r.violations ?? r.message)}` : '').toBe(true);
    if (!r.ok) return;
    expect(r.projet).toMatchObject({ title: 'Depuis Vidéo IA', kind: 'video', brandId: ids.brandA1 });
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, r.versionId));
    expect((v!.content as { brief: { objective: string } }).brief.objective).toBe('Plan serré sur le flacon');
    const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, r.projet.id));
    expect(p!.sourceRefs).toEqual([]);
    const audit = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.action, ACTION_CREATION), eq(schema.studioAuditEvents.targetId, r.projet.id)));
    expect(audit.map((a) => a.reason)).toEqual(['création depuis un objectif']);
    const encore = await creerProjetDepuisContextePour(ctxDe('ua'), e, O);
    expect(encore).toMatchObject({ ok: true, deja: true, projet: { id: r.projet.id } });
  });

  it('ni objectif ni source ⇒ refus, rien n’est écrit ; la création depuis la Veille exige toujours une source', async () => {
    const avant = (await projetsDe(ids.wsA)).length;
    expect(await creerProjetDepuisContextePour(ctxDe('ua'), { brandId: ids.brandA1, kind: 'ads', objectif: '   ', cleClic: `clic-${randomUUID()}` }, O))
      .toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ chemin: 'objectif' }] });
    expect(await creerProjetDepuisSourcesPour(ctxDe('ua'), { sources: [], brandId: ids.brandA1, objectif: 'x', cleClic: `clic-${randomUUID()}` }, O))
      .toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ chemin: 'sources' }] });
    expect((await projetsDe(ids.wsA)).length).toBe(avant);
  });

  it('annonce sauvegardée du lien ⇒ source du projet ; celle d’un autre espace ⇒ NOT_FOUND, rien d’écrit', async () => {
    const r = await creerProjetDepuisContextePour(ctxDe('ua'), { brandId: ids.brandA1, kind: 'ads', objectif: 'Avant/après', ref: SAUV.a1, retourVeille: 'q=serum', cleClic: `clic-${randomUUID()}` }, O);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, r.projet.id));
    expect(p!.sourceRefs).toEqual([expect.objectContaining({ type: 'saved_ad', savedAdId: SAUV.a1 })]);
    const avantB = (await projetsDe(ids.wsA)).length;
    expect(await creerProjetDepuisContextePour(ctxDe('ua'), { brandId: ids.brandA1, kind: 'ads', objectif: 'x', ref: SAUV.b1, cleClic: `clic-${randomUUID()}` }, O))
      .toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect((await projetsDe(ids.wsA)).length).toBe(avantB);
  });
});

describe('bibliothèque · les créations historiques, en lecture seule', () => {
  it('marque active A1 ⇒ ses créations terminées seulement (ni archivée, ni A2, ni l’autre espace)', async () => {
    etat.session = session(ids, 'ua');
    etat.marque = { id: ids.brandA1, name: 'A1' };
    const l = await listerCreationsHistoriques();
    expect(l.map((e) => e.id).sort()).toEqual([GEN.pubA1, GEN.imageA1, GEN.scriptA1].sort());
    expect(l.find((e) => e.id === GEN.pubA1)).toMatchObject({ kind: 'image', url: `/api/ad/${GEN.pubA1}`, historique: { libelle: 'Création historique · pub' } });
    etat.marque = null;
    expect((await listerCreationsHistoriques()).map((e) => e.id)).toContain(GEN.pubA2);
    expect((await listerCreationsHistoriques()).map((e) => e.id)).not.toContain(GEN.pubB1);
    etat.session = session(ids, 'uv');
    expect(await listerCreationsHistoriques()).toEqual([]);
  });

  it('texte d’un ancien script · téléchargé dans son espace, 404 neutre hors portée ou sans session', async () => {
    const lire = (id: string) => texteHistorique(new Request(`http://x/api/creations-historiques/${id}/texte`), { params: Promise.resolve({ id }) });
    etat.session = session(ids, 'ua');
    const ok = await lire(GEN.scriptA1);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-disposition')).toMatch(/^attachment; filename="texte-/);
    expect(await ok.text()).toBe('Angles\n- Sommeil\n\nHooks\n- Tu dors mal ?\n');
    const autre = await lire(GEN.scriptB1);
    expect(autre.status).toBe(404);
    expect(await autre.text()).not.toContain('SECRET_B');
    expect((await lire(GEN.pubA1)).status).toBe(404);
    etat.session = null;
    expect((await lire(GEN.scriptA1)).status).toBe(404);
  });
});

describe('vidéos historiques en cours · terminées ou remboursées une fois, au bon espace', () => {
  it('prête ⇒ adresse ; échec et attente trop longue ⇒ échec + remboursement UNE fois ; en attente ⇒ rien', async () => {
    const maintenant = new Date('2026-10-10T12:00:00Z');
    const il = (min: number) => new Date(maintenant.getTime() - min * 60_000);
    const V = { prete: randomUUID(), echec: randomUUID(), vieille: randomUUID(), recente: randomUUID(), dejaFaite: randomUUID() };
    const v = (id: string, brandId: string, jobId: string, createdAt: Date, o: Record<string, unknown> = {}) => ({ id, brandId, kind: 'video' as const, status: 'processing', jobId, creditsCost: 12, createdAt, assetUrls: [], ...o });
    await db.insert(schema.generations).values([
      v(V.prete, ids.brandA1, 'falq|prete', il(3)),
      v(V.echec, ids.brandB1, 'falq|echec', il(3)),
      v(V.vieille, ids.brandA1, 'falq|vieille', il(16)),
      v(V.recente, ids.brandA1, 'falq|recente', il(2)),
      v(V.dejaFaite, ids.brandA1, 'falq|fait', il(30), { status: 'completed', assetUrls: ['https://v.fal.media/garde.mp4'] }),
    ]);
    const statuts: Record<string, { status: 'completed' | 'failed' | 'processing'; videoUrl?: string; error?: string }> = {
      'falq|prete': { status: 'completed', videoUrl: 'https://v.fal.media/prete.mp4' },
      'falq|echec': { status: 'failed', error: 'Refus du fournisseur' },
      'falq|vieille': { status: 'processing' }, 'falq|recente': { status: 'processing' },
      'falq|fait': { status: 'completed', videoUrl: 'https://v.fal.media/autre.mp4' },
    };
    const remboursements: Array<[string, number, string]> = [];
    const deps = { lire: async (j: string) => statuts[j] ?? null, maintenant, rembourser: async (ws: string, n: number, _r: string, ref: string) => { remboursements.push([ws, n, ref]); } };

    const b = await reconcilierVideosHistoriques(deps);
    expect(b).toMatchObject({ terminees: 1, echouees: 2, remboursees: 2, enAttente: 1 });
    const lu = async (id: string) => (await db.select().from(schema.generations).where(eq(schema.generations.id, id)))[0]!;
    expect(await lu(V.prete)).toMatchObject({ status: 'completed', assetUrls: ['https://v.fal.media/prete.mp4'] });
    expect(await lu(V.echec)).toMatchObject({ status: 'failed', output: { error: 'Refus du fournisseur · Crédits remboursés.' } });
    expect(await lu(V.vieille)).toMatchObject({ status: 'failed' });
    expect(await lu(V.recente)).toMatchObject({ status: 'processing' });
    expect(await lu(V.dejaFaite)).toMatchObject({ status: 'completed', assetUrls: ['https://v.fal.media/garde.mp4'] });
    expect(remboursements.sort()).toEqual([[ids.wsA, 12, V.vieille], [ids.wsB, 12, V.echec]].sort());

    // Un second passage (ou deux en même temps) ne rembourse jamais deux fois.
    await Promise.all([reconcilierVideosHistoriques(deps), reconcilierVideosHistoriques(deps)]);
    expect(remboursements).toHaveLength(2);
  });
});
