import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Contre-recette du 8 octobre · P1 décodabilité média (#736).
 *
 * Constat : le worker livrait (`completed`, média relié, règlement) un MP4 de
 * 88 octets sans piste, et toute image aux CRC justes même si ses pixels ne se
 * décodaient pas. Ici le worker complet tourne sur une base pglite aux
 * migrations réelles, fournisseur et stockage SIMULÉS (aucun réseau, 0 $), et
 * le décodeur de PRODUCTION (`DecodeurSharp`, pixels complets).
 *
 * On compte ce qui SORT : état du job, motif écrit, médias reliés, règlement
 * et crédits rendus, téléchargements servis, soumissions chez le fournisseur.
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

import sharp from 'sharp';
import { db, schema, eq } from '@tiktrends/db';
import { CREDIT_COSTS, TELECHARGEMENTS_MEDIA_MAX, inspecterMedia, type DecodeurMedia } from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe, poserSolde, solde, projetTest, banc, jusquAuBout, etatEnBase } from './l3-harnais';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { DecodeurSharp } from '../../workers/src/studios/decodeur';
import { pngSimule } from '../../../packages/integrations/src/studios-simule';
import { mp4Recette88, mp4StructurePlausible, pngIdatCorrompu, jpegScanCoupe } from '../../../packages/core/test/l3-fixtures-media';

const ids = etat.ids;
const IMAGE = CREDIT_COSTS.image;
let projet = { projectId: '', versionId: '' };
let JPEG_REEL = new Uint8Array();
let PNG_REEL = new Uint8Array();

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 1000);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
  // Images RÉELLES produites par sharp (32×24, motif non uni).
  const brut = Buffer.alloc(32 * 24 * 3);
  for (let i = 0; i < brut.length; i++) brut[i] = (i * 37) & 0xff;
  JPEG_REEL = new Uint8Array(await sharp(brut, { raw: { width: 32, height: 24, channels: 3 } }).jpeg({ quality: 90 }).toBuffer());
  PNG_REEL = new Uint8Array(await sharp(brut, { raw: { width: 32, height: 24, channels: 3 } }).png().toBuffer());
});

async function jobEnFile(operations: string[] = ['keyframe:s_ouverture']): Promise<string> {
  const d = await creerDevis(ctxDe(ids, 'ua'), { projectId: projet.projectId, operations, variante: true });
  if (!d.ok) throw new Error(d.code);
  const r = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `k-${d.devis.id}` }, { illimite: false });
  if (!r.ok) throw new Error(r.code);
  return r.job.id;
}

beforeEach(async () => {
  const restants = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.state, 'queued'));
  expect(restants.map((j) => j.id), 'un job est resté en file').toEqual([]);
});

/** Un job dont le fournisseur rend `octets` à chaque téléchargement. */
async function avecSortie(octets: Uint8Array, decodeur?: DecodeurMedia) {
  const id = await jobEnFile();
  const s0 = await solde(db, ids.wsA);
  const w = banc(db, { decodeur });
  w.fournisseur.prochaine('sortie_imposee');
  w.fournisseur.octetsImposes = octets;
  return { id, s0, w };
}

/** Le refus borné, au résultat : persisting sans rien livrer, puis failed sans débit. */
async function prouverRefusBorne(octets: Uint8Array, motif: RegExp) {
  const { id, s0, w } = await avecSortie(octets);
  // Premier passage : le fichier est refusé, le job ATTEND (persisting), rien n'est livré ni réglé.
  for (let i = 0; i < 6 && (await etatEnBase(db, id)).job.state !== 'persisting'; i++) await w.moteur.tour();
  let e = await etatEnBase(db, id);
  expect(e.job.state, 'un média non décodé a terminé le job').toBe('persisting');
  expect((e.job.error as { code?: string; motif?: string }).code).toBe('PERSISTENCE_FAILED');
  expect((e.job.error as { motif?: string }).motif).toMatch(motif);
  expect(e.assets, 'un média non décodé a été relié').toEqual([]);
  expect(e.reglements, 'un média non décodé a été réglé').toBe(0);
  expect(w.stockage.depots, 'un média non décodé a été déposé').toBe(0);
  // Puis re-téléchargement borné, et échec SANS débit client.
  expect(await jusquAuBout(db, w.moteur, id)).toBe('failed');
  e = await etatEnBase(db, id);
  expect(w.fournisseur.telechargements).toBe(TELECHARGEMENTS_MEDIA_MAX);
  expect(e.assets).toEqual([]);
  expect(w.stockage.depots).toBe(0);
  const settle = e.registre.filter((m) => m.kind === 'settle');
  expect(settle.map((m) => m.credits), 'crédits débités pour un média jamais livré').toEqual([0]);
  expect(await solde(db, ids.wsA)).toBe(s0 + IMAGE);
  expect((e.job.error as { motif?: string }).motif).toMatch(new RegExp(`${TELECHARGEMENTS_MEDIA_MAX} téléchargements refusés`));
  expect(w.fournisseur.soumissions).toBe(1);
  expect(e.violations).toEqual([]);
  return e;
}

describe('contre-recette P1 · le MP4 de 88 octets n’est jamais livré', () => {
  it('ftyp + moov et mdat à zéro, aucune piste ⇒ persisting puis failed, 0 média, 0 crédit réglé', async () => {
    expect(mp4Recette88().length).toBe(88);
    await prouverRefusBorne(mp4Recette88(), /incomplète ou sans contenu \(88 octets\)/);
  });
});

describe('CRC justes, charge utile abîmée · refusées par le DÉCODAGE réel', () => {
  it('PNG à IDAT corrompu (CRC recalculés) ⇒ le premier filtre le laisse passer, le décodeur le refuse', async () => {
    const abime = pngIdatCorrompu(PNG_REEL);
    expect(inspecterMedia(abime), 'précondition : structure plausible').not.toBeNull();
    await prouverRefusBorne(abime, /non décodée · décodage refusé/);
  });

  it('PNG simulé à IDAT corrompu ⇒ idem', async () => {
    await prouverRefusBorne(pngSimule(undefined, { corrompreIdat: true }), /non décodée · décodage refusé/);
  });

  it('JPEG au scan coupé (EOI conservé) ⇒ le premier filtre le laisse passer, le décodeur le refuse', async () => {
    const abime = jpegScanCoupe(JPEG_REEL);
    expect(inspecterMedia(abime), 'précondition : structure plausible').not.toBeNull();
    await prouverRefusBorne(abime, /non décodée · décodage refusé/);
  });
});

describe('vraies images ⇒ completed, dimensions décodées', () => {
  for (const [nom, octets, mime] of [['PNG', () => PNG_REEL, 'image/png'], ['JPEG', () => JPEG_REEL, 'image/jpeg']] as const) {
    it(`${nom} réel (sharp, 32×24) ⇒ completed, 1 média, réglé une fois`, async () => {
      const { id, w } = await avecSortie(octets());
      expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
      const e = await etatEnBase(db, id);
      expect(e.assets).toHaveLength(1);
      expect(e.assets[0]).toMatchObject({ mime, width: 32, height: 24, storageState: 'stored' });
      expect(e.reglements).toBe(1);
      expect(w.fournisseur.telechargements).toBe(1);
      expect(e.violations).toEqual([]);
    });
  }
});

describe('vidéo · aucun décodeur vidéo ⇒ jamais livrée, jamais soumise', () => {
  it('un MP4 à structure plausible (fabriqué) ⇒ refusé comme non vérifiable, failed, 0 média, motif sans « lisible »', async () => {
    const { id, s0, w } = await avecSortie(mp4StructurePlausible());
    expect(await jusquAuBout(db, w.moteur, id)).toBe('failed');
    const e = await etatEnBase(db, id);
    const motif = (e.job.error as { motif?: string }).motif ?? '';
    expect(motif).toMatch(/non vérifiable · aucun décodeur vidéo/);
    expect(motif).not.toMatch(/(?<!non )lisible|décodable/);
    expect(e.assets).toEqual([]);
    expect(w.stockage.depots).toBe(0);
    expect(e.registre.filter((m) => m.kind === 'settle').map((m) => m.credits)).toEqual([0]);
    expect(await solde(db, ids.wsA)).toBe(s0 + IMAGE);
  });

  it('une opération d’animation n’est PAS soumise sans décodeur vidéo ⇒ failed avant soumission, 0 $, tout rendu', async () => {
    const id = await jobEnFile(['clip:s_ouverture']);
    const s0 = await solde(db, ids.wsA);
    const [j] = await db.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id));
    const reserve = (await etatEnBase(db, id)).registre.find((m) => m.kind === 'reserve')!;
    expect((j!.snapshot as { lignes: Array<{ profil: string }> }).lignes.some((l) => l.profil === 'animation')).toBe(true);
    const w = banc(db);
    expect(await jusquAuBout(db, w.moteur, id)).toBe('failed');
    const e = await etatEnBase(db, id);
    expect([w.fournisseur.soumissions, w.fournisseur.appelsSoumettre], 'une animation invérifiable a été soumise').toEqual([0, 0]);
    expect((e.job.error as { issue?: string; motif?: string })).toMatchObject({ issue: 'echec_sans_frais' });
    expect((e.job.error as { motif?: string }).motif).toMatch(/aucun décodeur vidéo.*rien n'a été soumis/);
    const settle = e.registre.find((m) => m.kind === 'settle');
    expect([settle?.credits ?? 0, Number(settle?.usdMicros ?? 0)]).toEqual([0, 0]);
    expect(await solde(db, ids.wsA)).toBe(s0 + reserve.credits);
    expect(e.violations).toEqual([]);
  });
});

describe('décodeur indisponible (binaire absent) ⇒ attente, jamais livré, jamais compté abîmé', () => {
  it('le job reste persisting tant que le décodeur manque, puis se livre quand il revient', async () => {
    let absent = true;
    const reel = new DecodeurSharp();
    const decodeur: DecodeurMedia = {
      decoderImage: (o) => (absent ? Promise.resolve({ ok: false, cause: 'decodeur', raison: 'sharp introuvable (simulé)' }) : reel.decoderImage(o)),
    };
    const { id, w } = await avecSortie(PNG_REEL, decodeur);
    for (let i = 0; i < 2 * TELECHARGEMENTS_MEDIA_MAX + 2; i++) await w.moteur.tour();
    let e = await etatEnBase(db, id);
    expect(e.job.state).toBe('persisting');
    expect((e.job.error as { motif?: string }).motif).toMatch(/décodage impossible · sharp introuvable/);
    expect((e.job.error as { essaisMedia?: number }).essaisMedia).toBeUndefined();
    expect([e.assets.length, e.reglements]).toEqual([0, 0]);
    absent = false;
    expect(await jusquAuBout(db, w.moteur, id)).toBe('completed');
    e = await etatEnBase(db, id);
    expect([e.assets.length, e.reglements]).toEqual([1, 1]);
  });
});
