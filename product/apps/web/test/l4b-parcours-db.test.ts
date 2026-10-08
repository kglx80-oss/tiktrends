import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';
import type { AdaptateurModele } from '../lib/studios/prompts/adaptateur';

/**
 * L4-B · parcours Veille → sources → hypothèse → brief → projet, sur une VRAIE
 * base (pglite + les 55 migrations) et par les ACTIONS serveur. On lit les
 * réponses, les lignes en base et l'audit · jamais « une fonction a été appelée ».
 *
 *  FLOW-01 · sources, dates, droits et hypothèse persistés (projet + version 1).
 *  FLOW-02 · image seule sans transcription · narration ABSENTE, jamais affirmée.
 *  FLOW-03 · une proposition faite pour la marque A1 ne crée rien sur A2.
 *  FLOW-05 · seconde session · brief complet et références restaurés du serveur.
 *  FLOW-10 · export du brief sans génération, sans crédit, sans devis.
 *  SEC-01 / SEC-02 · autre espace, marque restreinte · NOT_FOUND neutre, sans fuite.
 */

const etat = vi.hoisted(() => ({
  ids: null as unknown as IdsStudios,
  session: null as SessionTest | null,
  marqueActive: null as string | null,
  adaptateur: null as AdaptateurModele | null,
}));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
  process.env.STUDIOS_PROMPTS_RECETTE_LOCALE = '1';
  process.env.DATABASE_URL = 'postgres://test@127.0.0.1:5433/l4b_pglite';
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('../lib/brands', () => ({
  getActiveBrand: async () => (etat.marqueActive ? { id: etat.marqueActive, name: 'active' } : null),
  listBrands: async () => [],
}));
vi.mock('../lib/studios/prompts/adaptateur', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/studios/prompts/adaptateur')>();
  return { ...actual, adaptateurAnthropicGarde: () => etat.adaptateur };
});

import { db, schema, eq } from '@tiktrends/db';
import { idSource, ID_HYPOTHESE_SAISIE, type HypotheseQualifiee } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { acteurPlateforme, publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { preparerCreation, proposerHypotheses, creerProjetDepuisSources, lireProjetDetail, exporterBrief, listerProjetsCartes } from '../app/actions/studios/sources';
import { MESSAGE_SANS_RELEASE } from '../lib/studios/sources/hypotheses';
import { lireProjetDetailPour } from '../lib/studios/sources/projet';
import { contexteDepuisSession } from '../lib/studios/garde';

const ids = etat.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub', s: Partial<SessionTest> = {}) => { etat.session = session(ids, q, s); };

/** Annonce de Veille · image seule, aucune transcription. */
const ANNONCE = {
  id: '9001', platform: 'meta', status: 'active', daysRunning: 64, mediaType: 'image',
  thumbnailUrl: 'https://cdn.exemple.test/v.jpg', mediaUrl: 'https://cdn.exemple.test/v.jpg',
  advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux. Notre sérum à 12 % de vitamine C efface les taches en 14 jours.',
  callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr', landingUrl: 'https://lbcosmetiques.fr/serum',
};
const SRC_VEILLE = { type: 'veille', annonce: ANNONCE, retour: 'q=serum&p=meta&page=2#ad-meta-9001' };
const ID_SRC = idSource('veille_ad', 'meta:9001');
const P = { a1: '', a1SansPhoto: '', a2: '', b1: '' };
const SAUV = { a1: '', a2: '', b1: '' };

const sortieHypotheses = {
  status: 'ready', questions: [], warnings: ['Aucune donnée de volume · règle de décision à paramétrer.'], evidenceIds: [],
  result: {
    hypotheses: [1, 2, 3].map((i) => ({
      id: `hyp_${i}`, statement: `Hypothèse ${i} · une accroche chiffrée augmente le clic.`, sourceIds: [ID_SRC],
      variable: i === 3 ? 'Accroche et visuel' : `Accroche ${i}`, control: 'Accroche bénéfice', treatment: `Accroche chiffrée ${i}`,
      invariants: ['Même visuel', 'Même offre'], metric: 'Taux de clic (CTR)', decisionRule: 'À paramétrer selon le volume', limitations: ['Pas de volume connu'],
    })),
  },
};

async function compte() {
  const n = async (t: any) => (await db.select().from(t)).length;
  return {
    projets: await n(schema.studioProjects), versions: await n(schema.studioProjectVersions), audit: await n(schema.studioAuditEvents),
    runs: await n(schema.studioPromptRuns), jobs: await n(schema.studioJobs), devis: await n(schema.studioQuotes), depense: await n(schema.aiSpend),
    sauvegardes: await n(schema.savedAds), ledger: await n(schema.creditLedger),
  };
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await db.update(schema.brands).set({ audience: 'Femmes 30-45 ans, peau sèche' }).where(eq(schema.brands.id, ids.brandA1));
  const [p1, p1b, p2, pb] = await db.insert(schema.products).values([
    { brandId: ids.brandA1, name: 'Crème Douce', usp: 'Hydrate 24 h', price: 29, description: 'Crème hydratante visage', imageUrl: 'data:image/png;base64,AAAA' },
    { brandId: ids.brandA1, name: 'Baume Nuit', usp: null, price: null },
    { brandId: ids.brandA2, name: 'Produit A2' },
    { brandId: ids.brandB1, name: 'Produit B secret' },
  ]).returning();
  P.a1 = p1!.id; P.a1SansPhoto = p1b!.id; P.a2 = p2!.id; P.b1 = pb!.id;
  const [s1, s2, sb] = await db.insert(schema.savedAds).values([
    { workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA1, platform: 'meta', externalId: '7001', snapshot: { ...ANNONCE, id: '7001', mediaType: 'video', formatCreatif: { id: 'avant_apres', version: 1, date: '2026-10-01T00:00:00Z', auteur: 'ua' } } },
    { workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA2, platform: 'meta', externalId: '7002', snapshot: { ...ANNONCE, id: '7002' } },
    { workspaceId: ids.wsB, userId: ids.ub, brandId: ids.brandB1, platform: 'meta', externalId: '7003', snapshot: { ...ANNONCE, id: '7003', advertiserName: 'Concurrent B secret' } },
  ]).returning();
  SAUV.a1 = s1!.id; SAUV.a2 = s2!.id; SAUV.b1 = sb!.id;
});

describe('préparer · lecture, ressources réellement disponibles (FLOW-02)', () => {
  it('image seule · image, texte, lien · narration et son absents · marque active visible · produits avec faits et manques', async () => {
    qui('ua'); etat.marqueActive = ids.brandA1;
    const avant = await compte();
    const r = await preparerCreation({ sources: [SRC_VEILLE] });
    if (!r.ok) throw new Error(r.code);
    expect(r.brandId).toBe(ids.brandA1);
    expect(r.marques.map((m) => m.nom)).toEqual(['Marque A1', 'Marque A2']);
    const s = r.sources[0]!;
    expect(s).toMatchObject({ sourceId: ID_SRC, type: 'veille_ad', droit: 'observation_publique', modalites: ['image', 'texte', 'lien'], annonceur: 'Lumière Botanique' });
    expect(s.absents.find((a) => a.element === 'narration')?.raison).toBe('Aucune transcription ni piste audio · la narration n’est pas observable.');
    expect(s.observations.map((o) => o.element)).not.toContain('narration');
    expect(r.produits.map((p) => [p.nom, p.photoDisponible, p.manques.map((m) => m.cle)])).toEqual([
      ['Baume Nuit', false, ['description', 'promesse', 'prix', 'page', 'photo']],
      ['Crème Douce', true, ['page']],
    ]);
    expect(r.ia).toMatchObject({ disponible: false, plafondUsd: 0.14 });
    expect(r.ia.raison).toMatch(/aucune version des consignes n’est publiée/);
    expect(await compte(), 'la préparation a écrit').toEqual(avant);
  });

  it('changer de marque · les produits suivent la marque demandée', async () => {
    qui('ua');
    const r = await preparerCreation({ sources: [SRC_VEILLE], brandId: ids.brandA2 });
    expect(r.ok && r.produits.map((p) => p.nom)).toEqual(['Produit A2']);
  });

  it('sauvegarde classée · le format déclaré et la vidéo sont lus EN BASE, pas chez le client', async () => {
    qui('ua');
    const r = await preparerCreation({ sources: [{ type: 'sauvegarde', id: SAUV.a1, annonce: { advertiserName: 'Forgé' } }] });
    if (!r.ok) throw new Error(r.code);
    expect(r.sources[0]).toMatchObject({ type: 'saved_ad', savedAdId: SAUV.a1, annonceur: 'Lumière Botanique', format: { id: 'avant_apres', libelle: 'Avant / après' } });
    expect(r.sources[0]!.modalites).toContain('video');
    expect(r.metriques).toContain('Taux d’accroche vidéo (3 secondes)');
  });
});

describe('proposer · sans release publiée, refus honnête et saisie manuelle', () => {
  it('UNSUPPORTED_CAPABILITY qui le dit · aucune trace, aucune dépense', async () => {
    qui('ua');
    etat.adaptateur = adaptateurSimule(() => sortieHypotheses);
    const avant = await compte();
    const r = await proposerHypotheses({ sources: [SRC_VEILLE], brandId: ids.brandA1 });
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: MESSAGE_SANS_RELEASE, saisieManuelle: true });
    expect((etat.adaptateur as ReturnType<typeof adaptateurSimule>).recues).toHaveLength(0);
    expect(await compte()).toEqual(avant);
  });
});

let projetSaisie = '';
let versionSaisie = '';

describe('FLOW-01 · créer le projet · sources, dates, droits, hypothèse persistés', () => {
  it('hypothèse rédigée · projet, version 1 avec brief canonique, source_refs, produit, audit', async () => {
    qui('ua');
    const r = await creerProjetDepuisSources({
      sources: [SRC_VEILLE], brandId: ids.brandA1, kind: 'ads', titre: 'Accroche chiffrée Crème Douce', productId: P.a1, cleClic: 'clic-saisie-0001',
      hypothese: { origine: 'saisie', saisie: { statement: 'Une accroche chiffrée augmente le taux de clic.', variable: 'Accroche', control: 'Accroche bénéfice', treatment: 'Accroche chiffrée', metric: 'Taux de clic (CTR)' } },
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.deja).toBe(false);
    projetSaisie = r.projet.id; versionSaisie = r.versionId;
    const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projetSaisie));
    expect(p).toMatchObject({ workspaceId: ids.wsA, brandId: ids.brandA1, kind: 'ads', title: 'Accroche chiffrée Crème Douce', currentVersionId: versionSaisie, ownerId: ids.ua });
    const refs = p!.sourceRefs as any[];
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ sourceId: ID_SRC, droit: 'observation_publique', statut: 'active', portee: { workspaceId: ids.wsA, brandId: null }, retourVeille: 'q=serum&p=meta&page=2#ad-meta-9001' });
    expect(Date.parse(refs[0].observeLe)).not.toBeNaN();
    expect(refs[0].empreinte).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(refs), 'URL de média stockée').not.toContain('cdn.exemple.test');
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, versionSaisie));
    const c = v!.content as any;
    expect(v!.n).toBe(1);
    expect(c.brief).toMatchObject({ hypothesisId: ID_HYPOTHESE_SAISIE, testedVariable: 'Accroche', variables: ['Accroche'], audience: 'Femmes 30-45 ans, peau sèche' });
    expect(c.brief.facts.find((f: any) => f.id === ID_HYPOTHESE_SAISIE)).toMatchObject({ kind: 'hypothesis', claim: 'Une accroche chiffrée augmente le taux de clic.', sourceIds: [ID_SRC] });
    expect(c.brief.facts.find((f: any) => f.id === `${ID_SRC}.obs.diffusion`)).toMatchObject({ kind: 'measured' });
    expect(c.productRef).toMatchObject({ productId: P.a1, nom: 'Crème Douce', photoDisponible: true });
    expect(JSON.stringify(c), 'data URI de la photo copiée dans la version').not.toContain('base64');
    const audit = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, projetSaisie));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'project.create_from_sources', actorId: ids.ua, brandId: ids.brandA1, versionAfter: versionSaisie });
    expect(audit[0]!.details).toMatchObject({ cleClic: 'clic-saisie-0001', sourceIds: [ID_SRC], hypothesisId: ID_HYPOTHESE_SAISIE, origineHypothese: 'saisie', productId: P.a1 });
  });

  it('idempotent par clé de clic · rejoué et en parallèle, UN projet', async () => {
    qui('ua');
    const avant = await compte();
    const e = {
      sources: [SRC_VEILLE], brandId: ids.brandA1, productId: P.a1, cleClic: 'clic-saisie-0001',
      hypothese: { origine: 'saisie', saisie: { statement: 'Autre texte rejoué', variable: 'Prix' } },
    };
    const [a, b] = await Promise.all([creerProjetDepuisSources(e), creerProjetDepuisSources(e)]);
    expect(a.ok && b.ok && [a.projet.id, b.projet.id, a.deja, b.deja]).toEqual([projetSaisie, projetSaisie, true, true]);
    expect(await compte()).toEqual(avant);
    const n = await Promise.all([1, 2, 3].map(() => creerProjetDepuisSources({ ...e, cleClic: 'clic-parallele-01' })));
    expect(new Set(n.map((x) => (x.ok ? x.projet.id : x.code))).size, 'deux clics simultanés · deux projets').toBe(1);
    expect((await compte()).projets).toBe(avant.projets + 1);
  });

  it('hypothèse rédigée vide · refus, rien écrit', async () => {
    qui('ua');
    const avant = await compte();
    const r = await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA1, cleClic: 'clic-vide-00001', hypothese: { origine: 'saisie', saisie: { statement: '', variable: '' } } });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ chemin: 'hypothese/saisie', raison: 'énoncé et variable testée requis' }] });
    expect(await compte()).toEqual(avant);
  });
});

describe('FLOW-05 · reprise durable · seconde session', () => {
  it('fermer puis rouvrir dans une autre session · brief complet, hypothèse, produit et sources restaurés du serveur', async () => {
    // Seconde session : nouveau contexte serveur, rien en mémoire de la première.
    etat.session = null;
    qui('ua');
    const [v] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, versionSaisie));
    const r = await lireProjetDetail({ projectId: projetSaisie });
    if (!r.ok) throw new Error(r.code);
    const d = r.detail;
    expect(d.brief, 'brief différent de la base').toEqual((v!.content as any).brief);
    expect(d.version).toMatchObject({ id: versionSaisie, n: 1 });
    expect(d.projet).toMatchObject({ title: 'Accroche chiffrée Crème Douce', marque: 'Marque A1', libelleType: 'Pub statique' });
    expect(d.hypothese).toMatchObject({ id: ID_HYPOTHESE_SAISIE, statement: 'Une accroche chiffrée augmente le taux de clic.', variable: 'Accroche', control: 'Accroche bénéfice', treatment: 'Accroche chiffrée', metric: 'Taux de clic (CTR)' });
    expect(d.produit).toMatchObject({ productId: P.a1, nom: 'Crème Douce' });
    expect(d.sources[0]).toMatchObject({ sourceId: ID_SRC, statut: 'active', lienSource: '/veille?q=serum&p=meta&page=2#ad-meta-9001' });
    expect(d.versions.map((x) => [x.n, x.courante])).toEqual([[1, true]]);
    expect(d.completude.etape).toBe('brief_pret');
    // Un autre membre de l'espace voit la même chose.
    const autre = await lireProjetDetailPour(contexteDepuisSession(session(ids, 'ur'), [ids.brandA1, ids.brandA2], [ids.brandA1], 'st_seconde'), projetSaisie, { veilleOuverte: true, maintenant: new Date() });
    expect(autre.ok && autre.detail.brief).toEqual(d.brief);
  });

  it('les cartes de reprise disent marque, type, étape, manques et date · sans écrire', async () => {
    qui('ua');
    const avant = await compte();
    const r = await listerProjetsCartes();
    if (!r.ok) throw new Error(r.code);
    const c = r.cartes.find((x) => x.id === projetSaisie)!;
    expect(c).toMatchObject({ marque: 'Marque A1', libelleType: 'Pub statique', libelleEtape: 'Brief prêt', versionN: 1, sources: 1 });
    expect(c.manques.map((m) => m.cle)).toEqual(expect.arrayContaining(['reference_visuelle']));
    expect(await compte()).toEqual(avant);
  });
});

describe('tombstone · une source retirée n’est plus lisible, ses observations restent', () => {
  it('sauvegarde retirée · statut supprimée, plus d’aperçu ni de lien, observations conservées, base inchangée', async () => {
    qui('ua');
    const r = await creerProjetDepuisSources({ sources: [{ type: 'sauvegarde', id: SAUV.a1 }], brandId: ids.brandA1, cleClic: 'clic-sauvegarde-1', hypothese: null });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const avantRetrait = await lireProjetDetail({ projectId: r.projet.id });
    expect(avantRetrait.ok && avantRetrait.detail.sources[0]).toMatchObject({ statut: 'active', apercu: 'https://cdn.exemple.test/v.jpg', lienSource: '/veille/formats' });
    expect(avantRetrait.ok && avantRetrait.detail.completude.etape).toBe('brief_a_completer');
    await db.delete(schema.savedAds).where(eq(schema.savedAds.id, SAUV.a1));
    const [ligneAvant] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, r.projet.id));
    const apres = await lireProjetDetail({ projectId: r.projet.id });
    if (!apres.ok) throw new Error(apres.code);
    const s = apres.detail.sources[0]!;
    expect(s).toMatchObject({ statut: 'supprimee', apercu: null, lienSource: null, retourVeille: null });
    expect(s.revoqueeLe).not.toBeNull();
    expect(s.observations.length).toBeGreaterThan(0);
    expect(s.extraitAutorise).toContain('Votre peau mérite mieux.');
    expect(apres.detail.completude.manques.map((m) => m.cle)).toContain('source_inaccessible');
    const [ligneApres] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, r.projet.id));
    expect(ligneApres, 'la lecture a réécrit le projet').toEqual(ligneAvant);
  });

  it('accès Veille retiré · la source Veille devient « accès retiré »', async () => {
    const ctx = contexteDepuisSession(session(ids, 'ua'), [ids.brandA1, ids.brandA2], [], 'st_veille_fermee');
    const d = await lireProjetDetailPour(ctx, projetSaisie, { veilleOuverte: false, maintenant: new Date() });
    expect(d.ok && d.detail.sources[0]).toMatchObject({ statut: 'revoquee', lienSource: null });
    expect(d.ok && d.detail.brief?.facts.length).toBeGreaterThan(0);
  });
});

describe('SEC-01 / SEC-02 · hors portée, NOT_FOUND neutre et sans fuite', () => {
  const sansFuite = (x: unknown) => {
    const t = JSON.stringify(x);
    for (const s of [projetSaisie, versionSaisie, 'Accroche chiffrée Crème Douce', ID_SRC, 'Marque A1', P.a1]) expect(t, `fuite « ${s} »`).not.toContain(s);
  };

  it('SEC-01 · espace B lit, exporte, prend une sauvegarde ou une marque de A · NOT_FOUND, rien écrit', async () => {
    qui('ub');
    const avant = await compte();
    for (const r of [
      await lireProjetDetail({ projectId: projetSaisie }),
      await exporterBrief({ projectId: projetSaisie }),
      await preparerCreation({ sources: [{ type: 'sauvegarde', id: SAUV.a2 }] }),
      await preparerCreation({ sources: [SRC_VEILLE], brandId: ids.brandA1 }),
      await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA1, cleClic: 'clic-intrus-0001' }),
      await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandB1, productId: P.a1, cleClic: 'clic-intrus-0002' }),
    ]) {
      expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
      sansFuite(r);
    }
    const cartes = await listerProjetsCartes();
    expect(cartes.ok && cartes.cartes).toEqual([]);
    expect(await compte()).toEqual(avant);
  });

  it('SEC-02 · restreint à A1 · projet, sauvegarde et marque A2 · NOT_FOUND', async () => {
    qui('ua');
    const a2 = await creerProjetDepuisSources({ sources: [{ type: 'sauvegarde', id: SAUV.a2 }], brandId: ids.brandA2, cleClic: 'clic-a2-000001' });
    if (!a2.ok) throw new Error(a2.code);
    qui('ur');
    for (const r of [
      await lireProjetDetail({ projectId: a2.projet.id }),
      await exporterBrief({ projectId: a2.projet.id }),
      await preparerCreation({ sources: [{ type: 'sauvegarde', id: SAUV.a2 }] }),
      await preparerCreation({ sources: [SRC_VEILLE], brandId: ids.brandA2 }),
      await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA2, cleClic: 'clic-restreint-1' }),
    ]) expect(r).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    const cartes = await listerProjetsCartes();
    expect(cartes.ok && cartes.cartes.map((c) => c.marque)).not.toContain('Marque A2');
  });

  it('lecteur (client_viewer) · le Studio lui est fermé (règle existante) · ni lecture, ni création, ni export', async () => {
    qui('uv');
    expect(await lireProjetDetail({ projectId: projetSaisie })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA1, cleClic: 'clic-lecteur-01' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await exporterBrief({ projectId: projetSaisie })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});

describe('FLOW-10 · exporter le brief sans accès à la génération', () => {
  it('espace sans crédit · Markdown et JSON complets, aucune génération, aucun devis, aucun débit', async () => {
    await db.update(schema.workspaces).set({ creditsBalance: 0 }).where(eq(schema.workspaces.id, ids.wsA));
    qui('ua');
    const avant = await compte();
    const md = await exporterBrief({ projectId: projetSaisie, format: 'markdown' });
    if (!md.ok) throw new Error(md.code);
    expect(md.nomFichier).toBe('brief-accroche-chiffree-creme-douce-v1.md');
    for (const a of ['Une accroche chiffrée augmente le taux de clic.', '- Variable testée : Accroche', '- Témoin : Accroche bénéfice', '**Crème Douce**', 'Lumière Botanique', 'Narration non observable']) {
      expect(md.contenu, `export sans « ${a} »`).toContain(a);
    }
    const js = await exporterBrief({ projectId: projetSaisie, format: 'json' });
    expect(js.ok && JSON.parse(js.contenu).brief.hypothesisId).toBe(ID_HYPOTHESE_SAISIE);
    expect(await compte(), 'l’export a écrit ou débité').toEqual(avant);
  });
});

describe('proposer · release publiée, fournisseur simulé · au plus trois, scellées par marque (FLOW-03)', () => {
  let hypotheses: HypotheseQualifiee[] = [];
  let jeton = '';

  beforeAll(async () => {
    await publierRegistreDeTest(depot, acteurPlateforme());
  });

  it('trois hypothèses, la combinée marquée exploratoire, une trace de run sur la marque A1', async () => {
    qui('ua');
    const f = adaptateurSimule(() => sortieHypotheses);
    etat.adaptateur = f;
    const r = await proposerHypotheses({ sources: [SRC_VEILLE], brandId: ids.brandA1 });
    if (!r.ok || !r.jeton) throw new Error(JSON.stringify(r));
    hypotheses = r.hypotheses; jeton = r.jeton;
    expect(r.brandId).toBe(ids.brandA1);
    expect(r.hypotheses.map((h) => [h.id, h.isolee])).toEqual([['hyp_1', true], ['hyp_2', true], ['hyp_3', false]]);
    expect(r.avertissements).toEqual(['Aucune donnée de volume · règle de décision à paramétrer.']);
    expect(f.recues).toHaveLength(1);
    const envoye = f.recues[0]!.messages.map((m) => m.contenu).join('\n');
    expect(envoye).toContain('"trust":"untrusted_data"');
    expect(envoye).toContain('Narration non observable');
    const [run] = await db.select().from(schema.studioPromptRuns).where(eq(schema.studioPromptRuns.id, r.runId!));
    expect(run).toMatchObject({ templateKey: 'test.hypothesize', brandId: ids.brandA1, workspaceId: ids.wsA, status: 'succeeded' });
  });

  it('FLOW-03 · la proposition de A1 appliquée à A2 · refus, rien écrit ; sur A1 · créé', async () => {
    qui('ua');
    const avant = await compte();
    const surA2 = await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA2, cleClic: 'clic-tardif-0001', hypothese: { origine: 'proposee', hypothese: hypotheses[1], jeton } });
    expect(surA2).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT', message: 'Cette proposition a été faite pour une autre marque · repropose des hypothèses pour la marque choisie.' });
    const modifiee = await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA1, cleClic: 'clic-modifie-001', hypothese: { origine: 'proposee', hypothese: { ...hypotheses[1], variable: 'Visuel' }, jeton } });
    expect(modifiee).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    const forge = await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA1, cleClic: 'clic-forge-0001', hypothese: { origine: 'proposee', hypothese: hypotheses[1], jeton: `${jeton.split('.')[0]}.AAAA` } });
    expect(forge).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    expect(await compte()).toEqual(avant);
    const surA1 = await creerProjetDepuisSources({ sources: [SRC_VEILLE], brandId: ids.brandA1, cleClic: 'clic-propose-001', productId: P.a1SansPhoto, hypothese: { origine: 'proposee', hypothese: hypotheses[1], jeton } });
    if (!surA1.ok) throw new Error(JSON.stringify(surA1));
    const d = await lireProjetDetail({ projectId: surA1.projet.id });
    expect(d.ok && d.detail.hypothese).toMatchObject({ id: 'hyp_2', variable: 'Accroche 2', metric: 'Taux de clic (CTR)' });
    expect(d.ok && d.detail.completude.manques.map((m) => m.cle)).toEqual(expect.arrayContaining(['photo_produit', 'faits_produit']));
    const [a] = await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.targetId, surA1.projet.id));
    expect(a!.details).toMatchObject({ origineHypothese: 'proposee', hypothesisId: 'hyp_2' });
    expect((a!.details as { runId: string | null }).runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('une sortie de plus de trois hypothèses est rejetée, rien n’est retenu', async () => {
    qui('ua');
    etat.adaptateur = adaptateurSimule(() => ({ ...sortieHypotheses, result: { hypotheses: [...sortieHypotheses.result.hypotheses, { ...sortieHypotheses.result.hypotheses[0], id: 'hyp_4' }] } }));
    const r = await proposerHypotheses({ sources: [SRC_VEILLE], brandId: ids.brandA1 });
    expect(r).toMatchObject({ ok: false, saisieManuelle: true });
  });
});
