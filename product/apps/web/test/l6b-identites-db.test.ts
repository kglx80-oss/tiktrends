import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * L6-B · identités, contradictions avant devis, voix · sur une VRAIE base
 * (pglite + migrations réelles). On lit les LIGNES : versions, audit, plans
 * d'impact, devis, approbations, jobs, registre, débits de crédits.
 *
 *  · VIDEO-02 · fiche « veste verte », plan 2 « veste jaune » : devis REFUSÉ
 *    (aucune ligne, aucun débit), résolution proposée puis appliquée (nouvelle
 *    version), devis ACCEPTÉ ensuite, débit seulement à l'approbation ;
 *  · fiches et liaisons par la commande de version L1 (409, audit, portée) ;
 *  · VIDEO-07 · lipsync refusé par le serveur, voix off posée ;
 *  · VIDEO-06 · durée d'une prise existante lue dans ses octets (WAV, MP3),
 *    prise altérée ou d'une autre marque refusée ; `voice.prepare` : registre
 *    réel, fournisseur SIMULÉ, seconde garde sur la sortie.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios, session: null as unknown }));
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
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, schema, eq, and } from '@tiktrends/db';
import { CREDIT_COSTS, detecterContradictions, type ContenuVersion } from '@tiktrends/core';
import * as depotPrompts from '../lib/studios/prompts/depot-prompts';
import { creerDevis, approuverEtMettreEnFile } from '../lib/studios/execution/commandes';
import { enregistrerIdentitePour, lierIdentitePour, resoudreContradictionPour, lireVueIdentitesPour } from '../lib/studios/identites/commandes';
import { preparerTexteVoixPour } from '../lib/studios/voix/voix';
import * as actions from '../app/actions/studios/identites';
import { semer, session } from './studios-semis';
import { ctxDe, projetVideo as projetVideoSansConsigne, compter, delta } from './l4a-outils';
import { avecConsignesPlans, attesterConsignesPlans } from './l6a-outils';
import { enregistrerVersion as enregistrerVersionDepot } from '../lib/studios/depot';
import { poserSolde, solde } from './l3-harnais';
import { publierRegistreDeTest } from './l2-outils';
import { adaptateurSimule } from './l2-adaptateur-simule';
import { contenuContradictoire, copie } from '../../../packages/core/test/l6b-fixtures';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';

const ids = etat.ids;
const V = schema.studioProjectVersions;
const fixture = (n: string) => new Uint8Array(readFileSync(join(__dirname, '../../../packages/core/test/fixtures', n)));
const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

const courante = async (projectId: string) => {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  const [v] = await db.select().from(V).where(eq(V.id, p!.currentVersionId!));
  return v!;
};


/**
 * Intégration L6-A × L6-B · une image clé de plan exige désormais une consigne
 * attestée (L6-A). Ces tests portent sur le contrôle d'identité : chaque plan
 * reçoit une consigne de semis attestée, comme le ferait « Retenir ».
 */
async function projetVideo(...a: Parameters<typeof projetVideoSansConsigne>) {
  const [base, i, brandId, userId, contenu] = a;
  const { contenu: avec, consignes } = avecConsignesPlans(contenu!);
  const p = await projetVideoSansConsigne(base, i, brandId, userId, avec);
  await attesterConsignesPlans(base, { workspaceId: i.wsA, brandId, projectId: p.projectId, userId }, consignes);
  return p;
}
/** Après une modification d'un plan, sa consigne est périmée : on en retient une neuve. */
async function consigneNeuve(projectId: string, plans: string[]) {
  const v = await courante(projectId);
  const { contenu, consignes } = avecConsignesPlans(v.content as ContenuVersion, { plans });
  const r = await enregistrerVersionDepot(ctxDe(ids, 'ua'), { projectId, baseVersionId: v.id, changes: [{ op: 'replace', path: '/styleRef', newValue: contenu.styleRef, reason: 'consigne retenue (semis)' }], raison: 'consigne retenue (semis)' });
  if (!r.ok) throw new Error(JSON.stringify(r));
  await attesterConsignesPlans(db, { workspaceId: ids.wsA, brandId: ids.brandA1, projectId, userId: ids.ua }, consignes);
  return r.version;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 50);
});
beforeEach(() => { etat.session = session(ids, 'ua'); });

describe('VIDEO-02 · contradiction fiche ↔ plan bloquée AVANT devis et débit, résolution proposée puis devis accepté', () => {
  it('devis refusé (INVARIANT_CONFLICT), 0 ligne financière ; résolution « plan » ; devis accepté ; débit à l’approbation seulement', async () => {
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, contenuContradictoire());
    const avant = await compter(db);
    const s0 = await solde(db, ids.wsA);

    const refus = await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: ['keyframe:s1', 'keyframe:s2'], variante: true });
    expect(refus).toMatchObject({
      ok: false, code: 'INVARIANT_CONFLICT', status: 409, targetIds: ['s2', 'perso_lea'],
      message: 'Contradiction d’identité · Plan s2 (sujet) : « veste jaune » contredit la fiche de Léa (tenue : veste verte). Corrige le plan ou change la fiche dans « Identités », puis redemande le devis. Rien n’a été devisé ni débité.',
    });
    // Rien : ni plan d'impact, ni devis, ni approbation, ni job, ni registre, ni débit, ni audit.
    expect(delta(avant, await compter(db))).toEqual({});
    expect(await solde(db, ids.wsA)).toBe(s0);

    // La résolution proposée, lue sur la page, puis appliquée par le serveur.
    const vue = await lireVueIdentitesPour(ctxDe(ids, 'ua'), projectId);
    if (!vue.ok) throw new Error(vue.code);
    const [k] = vue.vue.contradictions;
    expect(k!.resolutions.map((r) => r.type)).toEqual(['plan', 'identite']);
    const res = await resoudreContradictionPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, contradictionId: k!.id, choix: 'plan' });
    expect(res).toMatchObject({ ok: true, inchange: false, version: { n: 2 } });
    const v2 = await courante(projectId);
    expect((v2.content as ContenuVersion).shots.byId.s2!.subject).toBe('Léa court en veste verte, cheveux au vent');
    expect((v2.content as ContenuVersion).shots.byId.s1).toEqual((contenuContradictoire().shots.byId.s1));
    const [a] = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, projectId), eq(schema.studioAuditEvents.versionAfter, v2.id)));
    expect(a!.reason).toBe('Contradiction résolue sur le plan s2 · « veste jaune » corrigé selon la fiche de Léa');

    // Le plan s2 a changé : sa consigne d'image (L6-A) est périmée, on en retient une neuve.
    const v3 = await consigneNeuve(projectId, ['s2']);
    const d = await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: ['keyframe:s1', 'keyframe:s2'], variante: true });
    if (!d.ok) throw new Error(`${d.code} ${d.message}`);
    expect(d.devis.projectVersionId).toBe(v3.id);
    expect(d.devis.maximumCredits).toBe(2 * CREDIT_COSTS.image);
    expect(await solde(db, ids.wsA)).toBe(s0);
    const j = await approuverEtMettreEnFile(ctxDe(ids, 'ua'), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `l6b-${randomUUID()}` }, { illimite: false });
    expect(j).toMatchObject({ ok: true, job: { etat: 'queued' } });
    expect(await solde(db, ids.wsA)).toBe(s0 - 2 * CREDIT_COSTS.image);
  });

  it('un devis qui ne lit pas le plan contradictoire part (keyframe:s1 seul) ; la résolution « fiche » donne une version 2 de la fiche', async () => {
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, contenuContradictoire());
    expect(await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: ['keyframe:s1'], variante: true })).toMatchObject({ ok: true });
    const [k] = detecterContradictions(contenuContradictoire());
    const r = await resoudreContradictionPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, contradictionId: k!.id, choix: 'identite' });
    expect(r).toMatchObject({ ok: true, version: { n: 2 } });
    const c = (await courante(projectId)).content as ContenuVersion;
    expect(c.characterRefs.perso_lea).toMatchObject({ version: 2, attributs: [{ id: 'attr_1', couleur: 'jaune' }, { id: 'attr_2' }, { id: 'attr_3' }] });
    // Le plan 1 (« veste verte ») contredit désormais la fiche : son devis est refusé à son tour.
    expect(await creerDevis(ctxDe(ids, 'ua'), { projectId, operations: ['keyframe:s1'], variante: true })).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT', targetIds: ['s1', 'perso_lea'] });
  });

  it('résolution périmée ou base périmée · refus, rien d’écrit ; lecteur · FORBIDDEN ; autre espace · NOT_FOUND', async () => {
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, contenuContradictoire());
    const [k] = detecterContradictions(contenuContradictoire());
    const avant = await compter(db);
    expect(await resoudreContradictionPour(ctxDe(ids, 'uv'), { projectId, baseVersionId: versionId, contradictionId: k!.id, choix: 'plan' })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await resoudreContradictionPour(ctxDe(ids, 'ub'), { projectId, baseVersionId: versionId, contradictionId: k!.id, choix: 'plan' })).toMatchObject({ ok: false, code: 'NOT_FOUND', targetIds: [] });
    expect(await resoudreContradictionPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, contradictionId: 'inventee', choix: 'plan' })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(delta(avant, await compter(db))).toEqual({});
    expect(await resoudreContradictionPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, contradictionId: k!.id, choix: 'plan' })).toMatchObject({ ok: true });
    // Deuxième onglet, même base : 409, rien d'écrasé.
    const r = await resoudreContradictionPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, contradictionId: k!.id, choix: 'identite' });
    expect(r).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect((await courante(projectId)).n).toBe(2);
  });
});

describe('fiches et liaisons · commande de version L1', () => {
  it('créer une fiche (identifiant alloué), la lier à deux plans, la modifier (version 2 de la fiche) · trois versions, trois audits', async () => {
    const vide = copie(contenuContradictoire());
    vide.characterRefs = {};
    vide.shots.byId.s1!.referenceIds = [];
    vide.shots.byId.s2!.referenceIds = [];
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, vide);
    const r1 = await actions.enregistrerIdentite({ projectId, baseVersionId: versionId, nom: 'Zoé', attributs: [{ categorie: 'tenue', element: 'veste', couleur: 'bleue' }, { categorie: 'accessoire', element: 'lunettes', couleur: null }], vues: ['front', 'profile'], description: 'Cycliste' });
    if (!r1.ok) throw new Error(JSON.stringify(r1));
    const c1 = r1.version.content as ContenuVersion;
    const [iid] = Object.keys(c1.characterRefs);
    expect(iid).toMatch(/^perso_[0-9a-f]{8}$/);
    expect(c1.characterRefs[iid!]).toEqual({ schema: 'identite_studio/1', identityId: iid, nom: 'Zoé', version: 1, vues: ['front', 'profile'], description: 'Cycliste', attributs: [{ id: 'attr_1', categorie: 'tenue', element: 'veste', couleur: 'bleue', detail: '' }, { id: 'attr_2', categorie: 'accessoire', element: 'lunettes', couleur: null, detail: '' }] });

    const r2 = await actions.lierIdentite({ projectId, baseVersionId: r1.version.id, identityId: iid, shotIds: ['s1', 's2'] });
    if (!r2.ok) throw new Error(JSON.stringify(r2));
    expect((r2.version.content as ContenuVersion).shots.byId.s2!.referenceIds).toEqual([iid]);
    // Le plan 2 dit « veste jaune » : la contradiction apparaît pour Zoé.
    expect(detecterContradictions(r2.version.content as ContenuVersion).map((k) => [k.shotId, k.nomIdentite, k.extrait])).toEqual([['s1', 'Zoé', 'veste verte'], ['s2', 'Zoé', 'veste jaune']]);

    const r3 = await actions.enregistrerIdentite({ projectId, baseVersionId: r2.version.id, identityId: iid, nom: 'Zoé', attributs: [{ id: 'attr_1', categorie: 'tenue', element: 'veste', couleur: 'verte' }], vues: ['front'], description: 'Cycliste' });
    if (!r3.ok) throw new Error(JSON.stringify(r3));
    expect((r3.version.content as ContenuVersion).characterRefs[iid!]).toMatchObject({ version: 2, attributs: [{ id: 'attr_1', couleur: 'verte' }] });
    const audits = await db.select().from(schema.studioAuditEvents).where(and(eq(schema.studioAuditEvents.targetId, projectId), eq(schema.studioAuditEvents.action, 'project.version.create')));
    expect(audits.map((x) => x.reason)).toEqual(['Fiche d’identité « Zoé » créée', 'Liaison de « Zoé » aux plans · s1, s2', 'Fiche d’identité « Zoé » · version 2']);
    // Même saisie : aucune version.
    const r4 = await actions.enregistrerIdentite({ projectId, baseVersionId: r3.version.id, identityId: iid, nom: 'Zoé', attributs: [{ id: 'attr_1', categorie: 'tenue', element: 'veste', couleur: 'verte' }], vues: ['front'], description: 'Cycliste' });
    expect(r4).toMatchObject({ ok: true, inchange: true });
  });

  it('couleur hors lexique, base périmée, lecteur, autre espace · refus, aucune version', async () => {
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, contenuContradictoire());
    const avant = await compter(db);
    expect(await enregistrerIdentitePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, nom: 'X', attributs: [{ categorie: 'tenue', element: 'veste', couleur: 'verdâtre' }] }))
      .toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ chemin: '/attributs/0/couleur', raison: 'couleur du lexique attendue · une couleur hors liste ne serait pas contrôlée' }] });
    expect(await enregistrerIdentitePour(ctxDe(ids, 'uv'), { projectId, baseVersionId: versionId, nom: 'X', attributs: [] })).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await lierIdentitePour(ctxDe(ids, 'ub'), { projectId, baseVersionId: versionId, identityId: 'perso_lea', shotIds: [] })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await lierIdentitePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, identityId: 'perso_inconnu', shotIds: ['s1'] })).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(delta(avant, await compter(db))).toEqual({});
    await lierIdentitePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, identityId: 'perso_lea', shotIds: ['s1'] });
    expect(await lierIdentitePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, identityId: 'perso_lea', shotIds: [] })).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
  });
});

describe('VIDEO-07 · voix off et lipsync · aucun lipsync simulé', () => {
  it('lipsync refusé par le serveur (UNSUPPORTED_CAPABILITY), aucune version ; voix off posée sur le plan', async () => {
    const c = contenuContradictoire();
    c.shots.byId.s1!.speechMode = 'lipsync';
    c.shots.byId.s1!.narration = 'Salut !';
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, c);
    const avant = await compter(db);
    const r = await actions.choisirModeParole({ projectId, baseVersionId: versionId, shotIds: ['s2'], mode: 'lipsync' });
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: expect.stringContaining('Elle n’est jamais simulée') });
    expect(delta(avant, await compter(db))).toEqual({});
    const vue = await lireVueIdentitesPour(ctxDe(ids, 'ua'), projectId);
    if (!vue.ok) throw new Error(vue.code);
    expect(vue.vue.voix.plansLipsync).toEqual(['s1']);
    const ok = await actions.choisirModeParole({ projectId, baseVersionId: versionId, shotIds: vue.vue.voix.plansLipsync, mode: 'voiceover' });
    expect(ok).toMatchObject({ ok: true, version: { n: 2 } });
    expect((await courante(projectId)).content).toMatchObject({ shots: { byId: { s1: { speechMode: 'voiceover' }, s2: { speechMode: 'voiceover' } } } });
  });
});

describe('VIDEO-06 · durée réelle d’une prise existante, lue dans ses octets', () => {
  const stockage = new Map<string, Uint8Array>();
  const lecteur = { async lire(m: { storageKey: string }) { return stockage.get(m.storageKey) ?? null; } };
  async function prise(brandId: string, nom: string, o: { altere?: boolean; projectId?: string } = {}) {
    const octets = fixture(nom);
    const id = randomUUID();
    const cle = `studios/${ids.wsA}/${id}-${nom}`;
    await db.insert(schema.studioAssets).values({ id, workspaceId: ids.wsA, brandId, storageKey: cle, mime: nom.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg', bytes: octets.length, sha256: sha(octets), origin: 'import', storageState: 'stored', createdBy: ids.ua });
    const lu = octets.slice();
    if (o.altere) lu[lu.length - 1] = (lu[lu.length - 1]! + 1) % 256;
    stockage.set(cle, lu);
    return id;
  }

  it('WAV 1,70 s et MP3 2,61 s mesurés ; prise altérée et prise d’une autre marque refusées ; temps recalculés et dépassement dit', async () => {
    const c = contenuContradictoire();
    c.shots.byId.s1!.voiceAssetId = await prise(ids.brandA1, 'l6b-voix-16k.wav');
    c.shots.byId.s2!.voiceAssetId = await prise(ids.brandA1, 'l6b-voix-cbr.mp3');
    c.shots.byId.s1!.estimatedDurationMs = 1500;
    const { projectId } = await projetVideo(db, ids, ids.brandA1, ids.ua, c);
    const r = await lireVueIdentitesPour(ctxDe(ids, 'ua'), projectId, { lecteur });
    if (!r.ok) throw new Error(r.code);
    expect(r.vue.voix.prises).toEqual({
      s1: { etat: 'mesuree', assetId: c.shots.byId.s1!.voiceAssetId, format: 'wav', dureeMs: 1700, methode: 'wav_data', tronque: false },
      s2: { etat: 'mesuree', assetId: c.shots.byId.s2!.voiceAssetId, format: 'mp3', dureeMs: 2612, methode: 'mp3_trames', tronque: false },
    });
    expect(r.vue.voix.temps).toMatchObject({ cibleMs: 4500, totalMs: 4700, depassementMs: 200 });

    const c2 = contenuContradictoire();
    c2.shots.byId.s1!.voiceAssetId = await prise(ids.brandA1, 'l6b-voix-16k.wav', { altere: true });
    c2.shots.byId.s2!.voiceAssetId = await prise(ids.brandA2, 'l6b-voix-xing.mp3');
    const p2 = await projetVideo(db, ids, ids.brandA1, ids.ua, c2);
    const r2 = await lireVueIdentitesPour(ctxDe(ids, 'ua'), p2.projectId, { lecteur });
    if (!r2.ok) throw new Error(r2.code);
    expect(r2.vue.voix.prises.s1).toMatchObject({ etat: 'illisible', motif: 'prise altérée · empreinte différente de celle enregistrée' });
    expect(r2.vue.voix.prises.s2).toMatchObject({ etat: 'illisible', motif: 'prise introuvable pour la marque du projet' });
    expect(r2.vue.voix.temps.depassementMs).toBe(0);
  });
});

describe('VIDEO-06 · voice.prepare · narration validée, sans préambule ni réécriture', () => {
  let reponse: (a: AppelModele) => unknown = () => ({});
  const fournisseur = adaptateurSimule((a) => reponse(a));
  const deps = { adaptateur: fournisseur, environnement: 'test' as const, plafondAtteint: async () => false };
  const pret = (r: Record<string, unknown>) => ({ status: 'ready', questions: [], warnings: [], evidenceIds: [], result: r });
  const narration = 'On ne lâche rien.';

  it('sans release publiée · refus honnête, aucun appel, aucune trace', async () => {
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, contenuContradictoire());
    const avant = await compter(db);
    fournisseur.recues.length = 0;
    const r = await preparerTexteVoixPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, shotId: 's2', voiceId: 'voix-claire-fr' }, deps);
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', message: 'La préparation de la voix n’est pas encore activée (aucune version des consignes n’est publiée).' });
    expect(fournisseur.recues).toHaveLength(0);
    expect(delta(avant, await compter(db))).toEqual({});
  });

  it('release publiée · le texte transmis est la narration du plan ; préambule refusé (registre), prononciation hors texte refusée (seconde garde), sortie exacte acceptée', async () => {
    await publierRegistreDeTest(depotPrompts);
    const { projectId, versionId } = await projetVideo(db, ids, ids.brandA1, ids.ua, contenuContradictoire());
    const ctx = ctxDe(ids, 'ua');
    const e = { projectId, baseVersionId: versionId, shotId: 's2', voiceId: 'voix-claire-fr' };
    const sortie = (o: Record<string, unknown> = {}) => pret({ spokenText: narration, voiceId: 'voix-claire-fr', language: 'fr', deliveryNotes: 'Débit posé.', pronunciations: [], ...o });

    fournisseur.recues.length = 0;
    reponse = () => sortie({ spokenText: `Voici le texte : ${narration}` });
    const a = await preparerTexteVoixPour(ctx, e, deps);
    expect(a).toMatchObject({ ok: false, statut: 'refuse', violations: [{ code: 'NARRATION_REECRITE' }] });
    const user = fournisseur.recues[0]!.messages.find((m) => m.role === 'user')!.contenu;
    expect(user).toContain(JSON.stringify(narration));

    reponse = () => sortie({ pronunciations: [{ text: 'Lumea', pronunciation: 'lu-mé-a' }] });
    expect(await preparerTexteVoixPour(ctx, e, deps)).toMatchObject({ ok: false, statut: 'refuse', violations: [{ code: 'PRONONCIATION_HORS_TEXTE' }] });

    reponse = () => sortie();
    const ok = await preparerTexteVoixPour(ctx, e, deps);
    expect(ok).toMatchObject({ ok: true, statut: 'pret', texte: narration, synthese: { disponible: false } });
    const runs = await db.select().from(schema.studioPromptRuns).where(eq(schema.studioPromptRuns.templateKey, 'voice.prepare'));
    expect(runs.map((x) => x.status)).toEqual(['failed', 'succeeded', 'succeeded']);
    // Plan sans voix : aucun appel.
    const n = fournisseur.recues.length;
    expect(await preparerTexteVoixPour(ctx, { ...e, shotId: 's1' }, deps)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', violations: [{ raison: 'ce plan est « sans voix » · aucune narration n’est prononcée' }] });
    expect(fournisseur.recues.length).toBe(n);
  });
});
