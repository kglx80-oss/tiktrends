import 'server-only';
import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  CAPACITES_STUDIOS, ENV_INTERRUPTEURS, PREFIXE_CLE_INTERRUPTEURS,
  capacitesCoupees, capacitesDeListe, capacitesDesLignes, cleInterrupteursEspace, decisionCapacite, erreurStudio, lireListeEnv,
  lireReglagesEspace, messageCapaciteCoupee, validerReglagesEspace,
  type CapaciteStudio, type DecisionCapacite, type ErreurStudio,
} from '@tiktrends/core';
import type { ContexteStudio } from './garde';

/**
 * F1 · le côté serveur des interrupteurs (règle pure : `packages/core/src/studios/interrupteurs.ts`).
 *
 * Deux sources, relues à CHAQUE appel (aucun cache : couper doit prendre
 * effet à la requête suivante) :
 *  · l'environnement du serveur (`process.env`) · généralisation, coupure
 *    globale, espaces pilotes ;
 *  · le réglage de l'espace posé par la plateforme · `app_settings`, clé
 *    `studios_interrupteurs:<espace>` (aucune migration).
 *
 * Un refus est `UNSUPPORTED_CAPABILITY` avec la phrase du noyau et les
 * capacités coupées dans `targetIds` (l'écran les lit par `capacitesDuRefus`),
 * AVANT toute écriture, tout devis, toute dépense. L'espace vient du contexte serveur
 * (session relue), jamais du navigateur.
 */

export async function lireReglagesEspaceEnBase(workspaceId: string): Promise<unknown> {
  if (!db) return null;
  const A = schema.appSettings;
  const [l] = await db.select({ value: A.value }).from(A).where(eq(A.key, cleInterrupteursEspace(workspaceId))).limit(1);
  return l?.value ?? null;
}

export interface EtatInterrupteurs {
  espace: string;
  actif: (c: CapaciteStudio) => boolean;
  decisions: Record<CapaciteStudio, DecisionCapacite>;
}

/** L'état de toutes les capacités pour un espace · une lecture de réglage. */
export async function etatInterrupteurs(workspaceId: string, env: Readonly<Record<string, string | undefined>> = process.env): Promise<EtatInterrupteurs> {
  const reglages = await lireReglagesEspaceEnBase(workspaceId);
  const decisions = Object.fromEntries(CAPACITES_STUDIOS.map((c) => [c, decisionCapacite(c, { env, espace: workspaceId, reglages })])) as Record<CapaciteStudio, DecisionCapacite>;
  return { espace: workspaceId, actif: (c) => decisions[c].active, decisions };
}

/** Refus si l'une des capacités est coupée pour l'espace du contexte · `null` sinon. */
export async function refusCapacite(ctx: Pick<ContexteStudio, 'workspaceId' | 'traceId'>, capacites: readonly CapaciteStudio[]): Promise<ErreurStudio | null> {
  if (!capacites.length) return null;
  const reglages = await lireReglagesEspaceEnBase(ctx.workspaceId);
  const coupees = capacitesCoupees(capacites, { env: process.env, espace: ctx.workspaceId, reglages });
  if (!coupees.length) return null;
  return erreurStudio('UNSUPPORTED_CAPABILITY', { traceId: ctx.traceId, message: messageCapaciteCoupee(coupees), targetIds: coupees });
}

/**
 * Refus si un DEVIS exige une capacité coupée (lignes relues dans la portée).
 * Devis inconnu ou hors portée ⇒ `null` : la commande rendra elle-même son
 * 404 neutre, rien n'est révélé ici.
 */
export async function refusCapacitesDevis(ctx: ContexteStudio, quoteId: unknown): Promise<ErreurStudio | null> {
  if (!db || typeof quoteId !== 'string' || !ctx.marques.length) return null;
  const Q = schema.studioQuotes;
  try {
    const [q] = await db.select({ lines: Q.lines }).from(Q)
      .where(and(eq(Q.id, quoteId), eq(Q.workspaceId, ctx.workspaceId), inArray(Q.brandId, ctx.marques))).limit(1);
    return q ? refusCapacite(ctx, capacitesDesLignes(q.lines)) : null;
  } catch {
    return null; // identifiant mal formé · la commande le refuse elle-même
  }
}

/** Refus si un JOB livré exige une capacité coupée (instantané relu dans la portée). */
export async function refusCapacitesJob(ctx: ContexteStudio, jobId: unknown, seulement?: readonly CapaciteStudio[]): Promise<ErreurStudio | null> {
  if (!db || typeof jobId !== 'string' || !ctx.marques.length) return null;
  const J = schema.studioJobs;
  try {
    const [j] = await db.select({ snapshot: J.snapshot }).from(J)
      .where(and(eq(J.id, jobId), eq(J.workspaceId, ctx.workspaceId), inArray(J.brandId, ctx.marques))).limit(1);
    if (!j) return null;
    const lignes = (j.snapshot as { lignes?: unknown } | null)?.lignes;
    const exigees = capacitesDesLignes(lignes).filter((c) => !seulement || seulement.includes(c));
    return refusCapacite(ctx, exigees);
  } catch {
    return null;
  }
}

/* ────────────────────────── Vue de la plateforme (ADMIN) ────────────────────────── */

export interface LigneEspaceInterrupteurs {
  id: string;
  nom: string;
  plan: string;
  /** Un réglage plateforme existe pour cet espace. */
  regle: boolean;
  pilote: boolean;
  reglages: ReturnType<typeof lireReglagesEspace>;
  decisions: Record<CapaciteStudio, DecisionCapacite>;
}

export interface VueInterrupteurs {
  env: Array<{ nom: string; valeurs: string[]; inconnues: string[] }>;
  /** Décision de la plateforme (aucun espace) · défaut, généralisation, coupure globale. */
  global: Record<CapaciteStudio, DecisionCapacite>;
  espaces: LigneEspaceInterrupteurs[];
  total: number;
}

const ESPACES_MAX = 100;

/**
 * LECTURE · l'état des interrupteurs, tel que le serveur le décide, pour la
 * plateforme et pour les espaces (réglés et pilotes d'abord, puis par nom).
 * Aucune écriture. Réservée à l'appelant qui a déjà passé la garde plateforme.
 */
export async function vueInterrupteurs(o: { recherche?: string | null; espace?: string | null } = {}, env: Readonly<Record<string, string | undefined>> = process.env): Promise<VueInterrupteurs> {
  const pilotes = lireListeEnv(env[ENV_INTERRUPTEURS.espacesPilotes]).map((x) => x.toLowerCase());
  const vueEnv = (Object.values(ENV_INTERRUPTEURS) as string[]).map((nom) => {
    const brut = env[nom];
    if (nom === ENV_INTERRUPTEURS.espacesPilotes) return { nom, valeurs: lireListeEnv(brut), inconnues: [] };
    const l = capacitesDeListe(brut);
    return { nom, valeurs: l.capacites, inconnues: l.inconnues };
  });
  const global = Object.fromEntries(CAPACITES_STUDIOS.map((c) => [c, decisionCapacite(c, { env, espace: null })])) as Record<CapaciteStudio, DecisionCapacite>;
  if (!db) return { env: vueEnv, global, espaces: [], total: 0 };

  const A = schema.appSettings;
  const W = schema.workspaces;
  const lignes = await db.select({ key: A.key, value: A.value }).from(A).where(like(A.key, `${PREFIXE_CLE_INTERRUPTEURS}%`));
  const reglesParEspace = new Map(lignes.map((l) => [l.key.slice(PREFIXE_CLE_INTERRUPTEURS.length).toLowerCase(), l.value]));
  const tous = await db.select({ id: W.id, nom: W.name, plan: W.plan }).from(W).orderBy(asc(W.name));
  const q = (o.recherche ?? '').trim().toLowerCase();
  const filtres = tous.filter((w) => !q || w.nom.toLowerCase().includes(q) || w.id.toLowerCase().startsWith(q) || w.id === o.espace);
  const poids = (w: { id: string }) => (w.id === o.espace ? 0 : reglesParEspace.has(w.id.toLowerCase()) || pilotes.includes(w.id.toLowerCase()) ? 1 : 2);
  const tries = [...filtres].sort((a, b) => poids(a) - poids(b));
  const espaces = tries.slice(0, ESPACES_MAX).map((w) => {
    const brut = reglesParEspace.get(w.id.toLowerCase()) ?? null;
    return {
      id: w.id, nom: w.nom, plan: String(w.plan),
      regle: brut !== null, pilote: pilotes.includes(w.id.toLowerCase()),
      reglages: lireReglagesEspace(brut),
      decisions: Object.fromEntries(CAPACITES_STUDIOS.map((c) => [c, decisionCapacite(c, { env, espace: w.id, reglages: brut })])) as Record<CapaciteStudio, DecisionCapacite>,
    };
  });
  return { env: vueEnv, global, espaces, total: filtres.length };
}

/**
 * ÉCRITURE plateforme · le réglage d'UN espace, audité dans la même
 * transaction (`studio_audit_events`, action `studios.interrupteurs`, cible
 * l'espace, avant/après). La garde (permission plateforme) est posée par
 * l'action appelante ; ici la validation et l'écriture.
 */
export async function enregistrerReglagesEspace(
  acteur: { userId: string; roleEffectif: string; traceId: string },
  e: { workspaceId: unknown; actives: unknown; coupees: unknown; motif: unknown },
): Promise<{ ok: true; reglages: ReturnType<typeof lireReglagesEspace> } | { ok: false; raisons: string[] }> {
  if (!db) return { ok: false, raisons: ['base indisponible'] };
  const ws = typeof e.workspaceId === 'string' ? e.workspaceId : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ws)) return { ok: false, raisons: ['espace inconnu'] };
  const motif = typeof e.motif === 'string' ? e.motif.trim() : '';
  if (motif.length < 3) return { ok: false, raisons: ['motif obligatoire (3 caractères au moins) · il est écrit au journal'] };
  const v = validerReglagesEspace({ actives: e.actives, coupees: e.coupees });
  if (!v.ok) return v;
  const [w] = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(eq(schema.workspaces.id, ws)).limit(1);
  if (!w) return { ok: false, raisons: ['espace inconnu'] };
  const A = schema.appSettings;
  const cle = cleInterrupteursEspace(ws);
  const valeur = { v: 1, actives: v.reglages.actives, coupees: v.reglages.coupees, majPar: acteur.userId, majLe: new Date().toISOString() };
  await db.transaction(async (tx) => {
    const [avant] = await tx.select({ value: A.value }).from(A).where(eq(A.key, cle)).limit(1).for('update');
    await tx.insert(A).values({ key: cle, value: valeur }).onConflictDoUpdate({ target: A.key, set: { value: valeur, updatedAt: new Date() } });
    const resume = (x: unknown) => { const r = lireReglagesEspace(x); return `actives:${r.actives.join('+') || '-'} coupees:${r.coupees.join('+') || '-'}`; };
    await tx.insert(schema.studioAuditEvents).values({
      actorId: acteur.userId, effectiveRole: acteur.roleEffectif, workspaceId: ws, brandId: null,
      action: 'studios.interrupteurs', targetType: 'workspace', targetId: ws,
      versionBefore: avant ? resume(avant.value) : null, versionAfter: resume(valeur),
      reason: motif.slice(0, 2000), traceId: acteur.traceId,
      details: { avant: avant ? lireReglagesEspace(avant.value) : null, apres: v.reglages },
    });
  });
  return { ok: true, reglages: v.reglages };
}
