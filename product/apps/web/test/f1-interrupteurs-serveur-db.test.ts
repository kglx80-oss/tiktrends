import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * F1 · garde SERVEUR des interrupteurs (cahier 01 §14).
 *
 * Vraies actions serveur sur une vraie base (pglite, migrations réelles) ;
 * seuls la session et le plafond dollars sont posés. On lit les LIGNES :
 * devis, approbations, jobs, registre, crédits, versions, traces de prompt,
 * dépenses, audit, réglages. Capacité coupée ⇒ `UNSUPPORTED_CAPABILITY`
 * nommant la capacité, ET aucune ligne écrite.
 *
 * La configuration vitest généralise les capacités (suites existantes) ;
 * chaque cas ici la VIDE pour éprouver les défauts.
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
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { cleInterrupteursEspace } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { poserSolde, solde, projetTest } from './l3-harnais';
import * as execution from '../app/actions/studios/execution';
import * as image from '../app/actions/studios/image';
import * as video from '../app/actions/studios/video';
import * as identites from '../app/actions/studios/identites';
import * as textes from '../app/actions/studios/textes';
import * as shadow from '../app/actions/studios/shadow';
import { enregistrerInterrupteursEspaceAction } from '../app/actions/studios/interrupteurs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CAPACITES_STUDIOS, DEFINITIONS_CAPACITES } from '@tiktrends/core';

const ids = etat.ids;
let projet = { projectId: '', versionId: '' };

const BRANCHE = {
  FAL_KEY: 'cle-factice-f1:sans-valeur', STUDIO_FOURNISSEUR_REEL: 'autorise',
  S3_ENDPOINT: 'http://stockage.invalide', S3_BUCKET: 'seau-factice', S3_ACCESS_KEY_ID: 'factice', S3_SECRET_ACCESS_KEY: 'factice',
};
const poser = (env: Record<string, string>) => { for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v); };
const defauts = () => poser({ STUDIOS_CAPACITES_GENERALES: '', STUDIOS_CAPACITES_COUPEES: '', STUDIOS_ESPACES_PILOTES: '', STUDIOS_CAPACITES_PILOTES: '' });
const generalise = () => vi.stubEnv('STUDIOS_CAPACITES_GENERALES', 'generation_image controle_visuel video voix');

const lignes = async () => ({
  devis: (await db.select().from(schema.studioQuotes)).length,
  approbations: (await db.select().from(schema.studioApprovals)).length,
  jobs: (await db.select().from(schema.studioJobs)).length,
  registre: (await db.select().from(schema.studioBudgetLedger)).length,
  credits: (await db.select().from(schema.creditLedger)).length,
  outbox: (await db.select().from(schema.studioOutbox)).length,
  versions: (await db.select().from(schema.studioProjectVersions)).length,
  traces: (await db.select().from(schema.studioPromptRuns)).length,
  depenses: (await db.select().from(schema.aiSpend)).length,
  audit: (await db.select().from(schema.studioAuditEvents)).length,
  solde: await solde(db, ids.wsA),
});
const reglage = async (ws: string, value: unknown) => {
  await db.insert(schema.appSettings).values({ key: cleInterrupteursEspace(ws), value }).onConflictDoUpdate({ target: schema.appSettings.key, set: { value } });
};
const effacerReglage = (ws: string) => db.delete(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ws)));

const VIDEO = '« Vidéo · storyboard et images clés » · non activé pour cet espace. Rien n’a été écrit ni débité.';
const IMAGE = '« Génération d’images » · non activé pour cet espace. Rien n’a été écrit ni débité.';

beforeAll(async () => {
  await semer(db, schema, ids);
  await poserSolde(db, ids.wsA, 100);
  projet = await projetTest(db, ids, ids.brandA1, ids.ua);
});
beforeEach(() => { etat.session = session(ids, 'ua'); defauts(); });
afterEach(async () => { vi.unstubAllEnvs(); await effacerReglage(ids.wsA); });

describe('défauts · nouveautés incomplètes refusées AVANT toute écriture', () => {
  it('devis générique d’une image clé vidéo · refus nommé, aucun devis', async () => {
    const avant = await lignes();
    const r = await execution.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
    expect(!r.ok && [r.code, r.message, r.targetIds]).toEqual(['UNSUPPORTED_CAPABILITY', VIDEO, ['video']]);
    expect(await lignes(), 'un devis refusé a écrit').toEqual(avant);
  });

  it('parcours image · lecture, compilation, devis refusés ; aucun devis, aucune trace, aucune dépense', async () => {
    const avant = await lignes();
    for (const r of [
      await image.lireParcoursImage({ projectId: projet.projectId }),
      await image.compilerConsigneImage({ projectId: projet.projectId, mode: 'faithful_composite' }),
      await image.demanderDevisImage({ projectId: projet.projectId }),
    ]) expect(!r.ok && [r.code, r.message]).toEqual(['UNSUPPORTED_CAPABILITY', IMAGE]);
    expect(await lignes()).toEqual(avant);
  });

  it('studio vidéo · lecture, storyboard (appel texte payant), devis refusés ; rien écrit ni appelé', async () => {
    const avant = await lignes();
    for (const r of [
      await video.lireVideo({ projectId: projet.projectId }),
      await video.planifierStoryboard({ projectId: projet.projectId, nbPlans: 3, dureeCibleMs: 15_000, speechMode: 'none' }),
      await video.demanderDevisKeyframe({ projectId: projet.projectId, shotId: 's1' }),
    ]) expect(!r.ok && [r.code, r.message]).toEqual(['UNSUPPORTED_CAPABILITY', VIDEO]);
    expect(await lignes()).toEqual(avant);
  });

  it('voix · le mode de parole est refusé, aucune version', async () => {
    const avant = await lignes();
    const r = await identites.choisirModeParole({ projectId: projet.projectId, baseVersionId: projet.versionId, shotIds: ['s1'], mode: 'voiceover' });
    expect(!r.ok && [r.code, r.targetIds]).toEqual(['UNSUPPORTED_CAPABILITY', ['voix']]);
    expect(await lignes()).toEqual(avant);
    // Les identités elles-mêmes (complètes) restent ouvertes.
    expect((await identites.lireIdentitesProjet({ projectId: projet.projectId })).ok).toBe(true);
  });

  it('résolution à blanc (shadow) · coupée par défaut', async () => {
    const r = await shadow.resoudreCompilationAblanc({ projectId: projet.projectId, mode: 'faithful_composite' });
    expect(!r.ok && r.targetIds).toEqual(['shadow']);
  });

  it('l’ordre des gardes tient · un lecteur reçoit FORBIDDEN, pas un refus de capacité', async () => {
    etat.session = session(ids, 'uv');
    const r = await execution.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
    expect(!r.ok && r.code).toBe('FORBIDDEN');
  });
});

describe('approbation · un devis émis quand la capacité était active, approuvé après la coupure', () => {
  it('refus, aucune approbation, aucun job, aucun débit ; réactivée, la même approbation passe', async () => {
    poser(BRANCHE);
    generalise();
    const d = await execution.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
    if (!d.ok) throw new Error(`${d.code} ${d.message}`);
    const q = d.devis;
    defauts();
    const avant = await lignes();
    const r = await execution.approuverEtMettreEnFile({ quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `f1-${q.id}` });
    expect(!r.ok && [r.code, r.message]).toEqual(['UNSUPPORTED_CAPABILITY', VIDEO]);
    expect(await lignes(), 'une approbation refusée a écrit ou débité').toEqual(avant);
    // Pilote par le réglage plateforme de l'espace · effet immédiat.
    await reglage(ids.wsA, { actives: ['video'], coupees: [] });
    const ok = await execution.approuverEtMettreEnFile({ quoteId: q.id, inputHash: q.inputHash, creditsAnnonces: q.maximumCredits, idempotencyKey: `f1-${q.id}` });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
    const apres = await lignes();
    expect({ approbations: apres.approbations - avant.approbations, jobs: apres.jobs - avant.jobs, debit: avant.solde - apres.solde }).toEqual({ approbations: 1, jobs: 1, debit: q.maximumCredits });
  });
});

describe('pilote et coupure par espace', () => {
  it('un réglage de l’espace A n’ouvre rien à l’espace B', async () => {
    await reglage(ids.wsA, { actives: ['video'], coupees: [] });
    const a = await execution.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
    expect(a.ok, JSON.stringify(a)).toBe(true);
    etat.session = session(ids, 'ub');
    const b = await execution.creerDevis({ projectId: projet.projectId, operations: ['keyframe:s_ouverture'], variante: true });
    expect(!b.ok && b.code).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('coupure d’urgence d’une capacité COMPLÈTE (textes) pour un espace · refus, aucune version', async () => {
    expect((await textes.lireTextesProjet({ projectId: projet.projectId })).ok).toBe(true);
    await reglage(ids.wsA, { actives: [], coupees: ['textes'] });
    const avant = await lignes();
    const r = await textes.enregistrerTextes({ projectId: projet.projectId, baseVersionId: projet.versionId, textes: [] });
    expect(!r.ok && [r.code, r.targetIds]).toEqual(['UNSUPPORTED_CAPABILITY', ['textes']]);
    expect(await lignes()).toEqual(avant);
  });

  it('coupure globale par l’environnement', async () => {
    vi.stubEnv('STUDIOS_CAPACITES_COUPEES', 'textes');
    const r = await textes.lireTextesProjet({ projectId: projet.projectId });
    expect(!r.ok && r.targetIds).toEqual(['textes']);
  });
});

describe('réglage plateforme · action auditée, réservée à la plateforme', () => {
  const plateforme = () => session(ids, 'ua', { role: 'owner', equipe: { role: 'adminplus', matrice: {}, plateformeAdmissible: true } as SessionTest['equipe'] });
  const reglages = async () => (await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsB))));
  const audits = async () => (await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'studios.interrupteurs')));

  it('un owner d’espace (non plateforme) est refusé, rien n’est écrit', async () => {
    etat.session = session(ids, 'ua', { role: 'owner' });
    const r = await enregistrerInterrupteursEspaceAction({ workspaceId: ids.wsA, actives: ['video'], coupees: [], motif: 'je m’ouvre la vidéo', confirme: true });
    expect(r.ok).toBe(false);
    expect((await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, cleInterrupteursEspace(ids.wsA)))).length).toBe(0);
    expect((await audits()).length).toBe(0);
  });

  it('la plateforme règle l’espace B · réglage écrit, audit avant/après, effet immédiat pour B', async () => {
    etat.session = plateforme();
    expect((await enregistrerInterrupteursEspaceAction({ workspaceId: ids.wsB, actives: ['video'], coupees: [], motif: 'x', confirme: true })).ok, 'motif trop court accepté').toBe(false);
    expect((await enregistrerInterrupteursEspaceAction({ workspaceId: ids.wsB, actives: ['benchmark_reel'], coupees: [], motif: 'pilote', confirme: true })).ok, 'capacité de plateforme réglée par espace').toBe(false);
    expect((await enregistrerInterrupteursEspaceAction({ workspaceId: ids.wsB, actives: ['video'], coupees: [], motif: 'pilote', confirme: false })).ok, 'sans confirmation').toBe(false);
    expect(await reglages()).toEqual([]);
    const r = await enregistrerInterrupteursEspaceAction({ workspaceId: ids.wsB, actives: ['video'], coupees: ['textes'], motif: 'Espace pilote vidéo', confirme: true });
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    const [l] = await reglages();
    expect(l!.value).toMatchObject({ actives: ['video'], coupees: ['textes'] });
    const [a] = await audits();
    expect(a).toMatchObject({ workspaceId: ids.wsB, targetType: 'workspace', targetId: ids.wsB, versionBefore: null, versionAfter: 'actives:video coupees:textes', reason: 'Espace pilote vidéo', actorId: ids.ua });
    etat.session = session(ids, 'ub');
    const d = await execution.creerDevis({ projectId: 'inconnu', operations: ['keyframe:s_ouverture'], variante: true });
    expect(!d.ok && d.code, 'la vidéo devrait être ouverte pour B (refus attendu : projet inconnu, pas capacité)').not.toBe('UNSUPPORTED_CAPABILITY');
    const t = await textes.lireTextesProjet({ projectId: 'inconnu' });
    expect(!t.ok && t.code).toBe('UNSUPPORTED_CAPABILITY');
    await effacerReglage(ids.wsB);
  });
});

/**
 * Couverture au RÉSULTAT · chaque action serveur des Studios, appelée par un
 * membre d'un espace où TOUTES les capacités d'espace sont coupées, doit
 * répondre `UNSUPPORTED_CAPABILITY`, sauf les gestes qu'on ne coupe JAMAIS
 * (un job payé doit pouvoir être suivi, annulé, tranché ; l'ADMIN plateforme
 * n'est pas une capacité d'espace). Une action ajoutée sans garde fait tomber
 * ce test, nommée.
 */
const JAMAIS_COUPEES: Record<string, string> = {
  'execution.estimerImpact': 'lecture et calcul, aucun devis ni débit',
  'execution.annulerJob': 'un job payé doit toujours pouvoir être annulé',
  'execution.etatJob': 'un job payé doit toujours pouvoir être suivi',
  'execution.accepterMedia': 'trancher un média déjà livré',
  'execution.rejeterMedia': 'trancher un média déjà livré',
  'produit.trancherComposants': 'trancher un média déjà livré',
  'image.controlerMediaImage': 'contrôle des composants d’un média livré · la vision seule est coupée (cas dédié)',
};
const PLATEFORME = new Set(['prompts', 'interrupteurs']);

describe('couverture · toute action d’espace des Studios est coupable', () => {
  it('toutes les capacités d’espace coupées ⇒ chaque action refuse, sauf la liste nommée', async () => {
    await reglage(ids.wsA, { actives: [], coupees: CAPACITES_STUDIOS.filter((c) => DEFINITIONS_CAPACITES[c].portee === 'espace') });
    const dossier = join(__dirname, '../app/actions/studios');
    const avant = await lignes();
    const passees: string[] = [];
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.ts')).sort()) {
      const nom = f.replace(/\.ts$/, '');
      if (PLATEFORME.has(nom)) continue;
      const mod = await import(`../app/actions/studios/${nom}`) as Record<string, unknown>;
      for (const [exp, fn] of Object.entries(mod)) {
        if (typeof fn !== 'function' || JAMAIS_COUPEES[`${nom}.${exp}`]) continue;
        const r = await (fn as (e: unknown) => Promise<{ ok: boolean; code?: string }>)({ projectId: projet.projectId });
        if (!(r && r.ok === false && r.code === 'UNSUPPORTED_CAPABILITY')) passees.push(`${nom}.${exp} → ${JSON.stringify(r).slice(0, 80)}`);
      }
    }
    // L'action de l'éditeur vit hors du dossier (lib/studios/editeur/actions.ts).
    const editeur = await import('../lib/studios/editeur/actions');
    const re = await editeur.relireDocumentEditeur(projet.projectId);
    if (!(re.ok === false && re.code === 'UNSUPPORTED_CAPABILITY')) passees.push('editeur.relireDocumentEditeur');
    expect(passees, 'action des Studios non coupée par les interrupteurs').toEqual([]);
    expect(await lignes(), 'une action coupée a écrit').toEqual(avant);
  });
});
