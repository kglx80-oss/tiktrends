/**
 * Recette Studios · E2 · REGISTRE CUMULATIF du budget d'essai (15 $ au total).
 *
 * « J'autorise 15 $ maximum au total pour tous les tests nécessaires au
 * chantier TikTrends, tous fournisseurs, étapes et relances confondus. Ce
 * plafond remplace la précédente limite de 1 $ : ce n'est pas 15 $ par test
 * ou par session. Déduis toute dépense déjà engagée et conserve les
 * réservations dont le coût reste incertain. Aucune recharge ni dépassement
 * autorisé. » (propriétaire, 9 octobre)
 *
 * ── Pourquoi un fichier, hors de la base ─────────────────────────────────────
 *
 * Le plafond de la barrière commune (`AI_SPEND_CAP_USD`) se compare à la somme
 * `ai_spend` de LA base. Or la base de recette vit dans un volume que
 * `down -v` détruit : après une destruction, une base neuve dirait « 0 $
 * dépensé » et rouvrirait 15 $. Le cumul vit donc dans
 * `ops/recette/registre/budget-essais.json`, sur la machine, ignoré par git,
 * JAMAIS touché par la commande de nettoyage du runbook (garde :
 * `test/e2-registre-budget.test.ts`). Il survit aux commandes, aux
 * redémarrages du conteneur et aux destructions de l'environnement.
 *
 *  · écriture ATOMIQUE (fichier temporaire, `fsync`, copie de la version
 *    précédente en `.prec`, `rename`) ;
 *  · JOURNAL en ajout seul (`budget-essais.journal.jsonl`) : chaque
 *    initialisation, synchronisation et saisie, avec le bilan ;
 *  · alimenté depuis `ai_spend` AVANT et APRÈS chaque commande payante : une
 *    ligne vue une fois reste au registre même si sa base disparaît, à son
 *    dernier état (une réservation sans issue reste au maximum) ;
 *  · une dépense ANTÉRIEURE connue par facture se saisit (`recette:budget:saisir`).
 *
 * Les règles d'argent (classement d'une ligne, bilan, décision) vivent dans
 * le noyau (`classerLigneEssai`, `bilanBudgetEssai`, `decisionDepenseEssai`).
 */

import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUDGET_ESSAIS_TOTAL_USD_MICROS, bilanBudgetEssai, classerLigneEssai, decisionDepenseEssai,
  type BilanBudgetEssai, type EtatLigneEssai,
} from '@tiktrends/core';

export const FORMAT_REGISTRE = 'registre-budget-essais/1';
export const FICHIER_REGISTRE = 'budget-essais.json';
export const FICHIER_JOURNAL = 'budget-essais.journal.jsonl';
export const CITATION_AUTORISATION = 'J’autorise 15 $ maximum au total pour tous les tests nécessaires au chantier TikTrends, tous fournisseurs, étapes et relances confondus. Ce plafond remplace la précédente limite de 1 $ : ce n’est pas 15 $ par test ou par session. Déduis toute dépense déjà engagée et conserve les réservations dont le coût reste incertain. Aucune recharge ni dépassement autorisé.';

/** Le dossier du registre · `RECETTE_REGISTRE` (monté dans le service d'outils), sinon `ops/recette/registre`. */
export function dossierRegistre(env: Readonly<Record<string, string | undefined>>): string {
  return env.RECETTE_REGISTRE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'ops', 'recette', 'registre');
}

export interface LigneRegistre {
  id: string;
  provider: string;
  model: string | null;
  action: string;
  reserveMicros: number;
  actualMicros: number;
  etat: EtatLigneEssai;
  regleMicros: number;
  incertainMicros: number;
  cause: string | null;
  creeeLe: string;
  /** Base où la ligne a été vue (identifiant du cluster Postgres et nom). */
  base: string;
  vueLe: string;
}

export interface DepenseAnterieure { id: string; usdMicros: number; motif: string; saisieLe: string }

export interface RegistreBudget {
  format: typeof FORMAT_REGISTRE;
  autorisation: { usdMicros: number; le: string; citation: string };
  anterieures: DepenseAnterieure[];
  lignes: Record<string, LigneRegistre>;
  bases: Record<string, { premiereVue: string; derniereVue: string }>;
  majLe: string;
}

/** Une ligne `ai_spend` telle que la base la rend. */
export interface LigneBase {
  id: string; provider: string; model: string | null; action: string;
  estimatedUsd: number; actualUsd: number; inputTokens: number | null; outputTokens: number | null;
  reconcileReason: string | null; createdAt: Date;
}

/* ───────────────────────────── règles pures ─────────────────────────────── */

export function registreVierge(maintenant: Date): RegistreBudget {
  return {
    format: FORMAT_REGISTRE,
    autorisation: { usdMicros: BUDGET_ESSAIS_TOTAL_USD_MICROS, le: '2026-10-09', citation: CITATION_AUTORISATION },
    anterieures: [], lignes: {}, bases: {}, majLe: maintenant.toISOString(),
  };
}

const entier = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Lit le texte du registre · `null` si illisible (format, autorisation modifiée, montants invalides). */
export function lireRegistre(texte: string): RegistreBudget | null {
  let o: unknown;
  try { o = JSON.parse(texte); } catch { return null; }
  const r = o as Partial<RegistreBudget> | null;
  if (!r || r.format !== FORMAT_REGISTRE) return null;
  // L'autorisation n'est pas un réglage : un registre qui la relève est refusé.
  if (!r.autorisation || r.autorisation.usdMicros !== BUDGET_ESSAIS_TOTAL_USD_MICROS) return null;
  if (!Array.isArray(r.anterieures) || r.anterieures.some((a) => !a || !entier(a.usdMicros) || typeof a.motif !== 'string')) return null;
  if (!r.lignes || typeof r.lignes !== 'object' || Array.isArray(r.lignes)) return null;
  for (const l of Object.values(r.lignes)) {
    if (!l || typeof l.id !== 'string' || !entier(l.regleMicros) || !entier(l.incertainMicros)) return null;
  }
  if (!r.bases || typeof r.bases !== 'object') return null;
  return r as RegistreBudget;
}

/**
 * Fusionne l'état COURANT des lignes d'une base dans le registre. Une ligne
 * présente en base y prend son dernier état (une réservation réglée descend
 * au coût réel) ; une ligne absente (base détruite) garde son dernier état
 * connu. Rend le registre neuf et les identifiants changés.
 */
export function fusionnerRegistre(reg: RegistreBudget, lignes: readonly LigneBase[], base: string, maintenant: Date): { registre: RegistreBudget; changees: string[] } {
  const t = maintenant.toISOString();
  const out: RegistreBudget = { ...reg, lignes: { ...reg.lignes }, bases: { ...reg.bases }, majLe: t };
  const changees: string[] = [];
  for (const l of lignes) {
    const c = classerLigneEssai(l);
    const n: LigneRegistre = {
      id: l.id, provider: l.provider, model: l.model, action: l.action,
      reserveMicros: Math.max(0, Math.round(Number(l.estimatedUsd) * 1_000_000)), actualMicros: Math.max(0, Math.round(Number(l.actualUsd) * 1_000_000)),
      etat: c.etat, regleMicros: c.regleMicros, incertainMicros: c.incertainMicros, cause: l.reconcileReason,
      creeeLe: l.createdAt.toISOString(), base, vueLe: t,
    };
    const a = out.lignes[l.id];
    if (!a || a.etat !== n.etat || a.regleMicros !== n.regleMicros || a.incertainMicros !== n.incertainMicros || a.cause !== n.cause) changees.push(l.id);
    out.lignes[l.id] = n;
  }
  out.bases[base] = { premiereVue: reg.bases[base]?.premiereVue ?? t, derniereVue: t };
  return { registre: out, changees };
}

export function bilanRegistre(reg: RegistreBudget): BilanBudgetEssai {
  return bilanBudgetEssai({
    autoriseMicros: reg.autorisation.usdMicros,
    anterieuresMicros: reg.anterieures.reduce((s, a) => s + a.usdMicros, 0),
    lignes: Object.values(reg.lignes),
  });
}

export type EtatFichier = { etat: 'absent' } | { etat: 'illisible' } | { etat: 'lisible'; registre: RegistreBudget };

/**
 * Le registre peut-il servir de point de départ ?
 *  · absent, base SANS dépense ⇒ on l'initialise (premier essai) ;
 *  · absent ou illisible, base AVEC dépenses ⇒ INCOHÉRENCE, refus ;
 *  · illisible, même base vide ⇒ refus (il a existé : l'historique est
 *    peut-être ailleurs que dans cette base) ;
 *  · lisible ⇒ il fait foi, même si la base est neuve (il garde le cumul des
 *    bases détruites).
 */
export function coherenceRegistre(f: EtatFichier, lignesEnBase: number, dossier: string): { ok: true; initialiser: boolean } | { ok: false; raison: string } {
  const ou = join(dossier, FICHIER_REGISTRE);
  if (f.etat === 'lisible') return { ok: true, initialiser: false };
  if (f.etat === 'illisible') return { ok: false, raison: `Registre du budget d’essai illisible (${ou}) · rien ne part. Restaure ${FICHIER_REGISTRE}.prec du même dossier, ou reconstruis-le d’après ${FICHIER_JOURNAL}, puis relance.` };
  if (lignesEnBase > 0) return { ok: false, raison: `Registre du budget d’essai absent (${ou}) alors que la base de recette contient ${lignesEnBase} dépense(s) · incohérence, rien ne part. Restaure le registre (ou sa copie ${FICHIER_REGISTRE}.prec) avant toute commande payante.` };
  return { ok: true, initialiser: true };
}

const usd2 = (micros: number) => `${(micros / 1_000_000).toFixed(2).replace('.', ',')} $`;
const usd4 = (micros: number) => `${(micros / 1_000_000).toFixed(4).replace('.', ',')} $`;

/** Le texte de `recette:budget` · autorisé, réglé, incertain, restant, puis le détail. */
export function texteBilan(reg: RegistreBudget, b: BilanBudgetEssai = bilanRegistre(reg)): string {
  const incertaines = Object.values(reg.lignes).filter((l) => l.incertainMicros > 0);
  return [
    'Budget d’essai · registre cumulatif (toutes bases, tous passages)',
    `  autorisé            · ${usd2(b.autoriseMicros)} au total (propriétaire, ${reg.autorisation.le})`,
    `  antérieur (saisi)   · ${usd4(b.anterieuresMicros)}`,
    `  réglé               · ${usd4(b.regleMicros)}`,
    `  incertain conservé  · ${usd4(b.incertainMicros)} (au maximum réservé, à réconcilier)`,
    `  RESTANT             · ${usd4(b.restantMicros)}${b.depasse ? ' · DÉPASSÉ, aucune commande payante ne part' : ''}`,
    `  lignes connues      · ${Object.keys(reg.lignes).length} · bases vues : ${Object.keys(reg.bases).length} · mis à jour ${reg.majLe}`,
    ...(incertaines.length ? ['  à réconcilier :', ...incertaines.map((l) => `    - ${l.id} · ${l.provider} · ${l.action} · ${usd4(l.incertainMicros)} · ${l.cause ?? 'réservée sans issue (processus interrompu)'} · ${l.creeeLe}`)] : []),
    ...(reg.anterieures.length ? ['  dépenses antérieures saisies :', ...reg.anterieures.map((a) => `    - ${usd4(a.usdMicros)} · ${a.motif} · ${a.saisieLe}`)] : []),
  ].join('\n');
}

/* ───────────────────────────── fichier ──────────────────────────────────── */

export function lireFichierRegistre(dossier: string): EtatFichier {
  const f = join(dossier, FICHIER_REGISTRE);
  if (!existsSync(f)) return { etat: 'absent' };
  let texte: string;
  try { texte = readFileSync(f, 'utf8'); } catch { return { etat: 'illisible' }; }
  const r = lireRegistre(texte);
  return r ? { etat: 'lisible', registre: r } : { etat: 'illisible' };
}

/** Ajout SEUL au journal · une ligne JSON, `fsync`. */
export function journaliser(dossier: string, entree: Record<string, unknown>): void {
  mkdirSync(dossier, { recursive: true });
  const fd = openSync(join(dossier, FICHIER_JOURNAL), 'a', 0o600);
  try { writeSync(fd, `${JSON.stringify(entree)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
}

/** Écriture ATOMIQUE · temporaire + `fsync`, version précédente gardée en `.prec`, puis `rename`. */
export function ecrireRegistre(dossier: string, reg: RegistreBudget): void {
  mkdirSync(dossier, { recursive: true });
  const f = join(dossier, FICHIER_REGISTRE);
  const tmp = `${f}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w', 0o600);
  try { writeSync(fd, `${JSON.stringify(reg, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  if (existsSync(f)) copyFileSync(f, `${f}.prec`);
  renameSync(tmp, f);
}

/* ───────────────────────────── base ─────────────────────────────────────── */

/** Lecture SEULE de la base de recette · toutes les lignes `ai_spend`, identité du cluster. */
export async function lireBase(): Promise<{ lignes: LigneBase[]; base: string; depenseFenetreUsd: number }> {
  const { db, schema, sql } = await import('@tiktrends/db');
  if (!db) throw new Error('Base indisponible (DATABASE_URL).');
  const A = schema.aiSpend;
  const rows = await db.select().from(A).orderBy(A.createdAt);
  let base = 'base-inconnue';
  try {
    const r = await db.execute(sql`select (select system_identifier::text from pg_control_system()) as id, current_database() as nom`);
    const x = ((Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ id: string; nom: string }>)[0];
    if (x) base = `${x.nom}@${x.id}`;
  } catch { /* identité facultative */ }
  const { spentUsd } = await import('../../lib/spend-guard');
  return {
    lignes: rows.map((l) => ({ id: l.id, provider: l.provider, model: l.model, action: l.action, estimatedUsd: Number(l.estimatedUsd), actualUsd: Number(l.actualUsd), inputTokens: l.inputTokens, outputTokens: l.outputTokens, reconcileReason: l.reconcileReason, createdAt: l.createdAt })),
    base, depenseFenetreUsd: await spentUsd(),
  };
}

/* ─────────────────────── avant / après une commande payante ─────────────── */

export type EtatEssai =
  | { ok: true; registre: RegistreBudget; bilan: BilanBudgetEssai; depenseFenetreUsd: number; base: string; initialiser: boolean; changees: string[] }
  | { ok: false; raison: string };

/**
 * LECTURE SEULE · cohérence fichier/base, puis fusion EN MÉMOIRE de l'état
 * courant de la base dans le registre, puis bilan. Rien n'est écrit.
 */
export async function lireEtatEssai(dossier: string, maintenant: Date = new Date()): Promise<EtatEssai> {
  const lu = await lireBase();
  const f = lireFichierRegistre(dossier);
  const c = coherenceRegistre(f, lu.lignes.length, dossier);
  if (!c.ok) return c;
  const depart = f.etat === 'lisible' ? f.registre : registreVierge(maintenant);
  const { registre, changees } = fusionnerRegistre(depart, lu.lignes, lu.base, maintenant);
  return { ok: true, registre, bilan: bilanRegistre(registre), depenseFenetreUsd: lu.depenseFenetreUsd, base: lu.base, initialiser: c.initialiser, changees };
}

/**
 * Juste AVANT la première dépense d'une commande payante (décision prise) ·
 * le registre fusionné est ÉCRIT (atomique) et l'événement journalisé.
 */
export function engagerEssai(dossier: string, e: Extract<EtatEssai, { ok: true }>, commande: string, reservationMicros: number, maintenant: Date = new Date()): void {
  ecrireRegistre(dossier, e.registre);
  journaliser(dossier, { le: maintenant.toISOString(), type: e.initialiser ? 'initialisation' : 'synchro-avant', commande, base: e.base, changees: e.changees, reservationMaximaleUsdMicros: reservationMicros, bilan: e.bilan });
}

/** Après la commande (y compris en échec) · le registre absorbe les lignes nées pendant la commande. */
export async function cloreEssai(dossier: string, commande: string, maintenant: Date = new Date()): Promise<BilanBudgetEssai | null> {
  const f = lireFichierRegistre(dossier);
  if (f.etat !== 'lisible') return null;
  const lu = await lireBase();
  const { registre, changees } = fusionnerRegistre(f.registre, lu.lignes, lu.base, maintenant);
  const bilan = bilanRegistre(registre);
  ecrireRegistre(dossier, registre);
  journaliser(dossier, { le: maintenant.toISOString(), type: 'synchro-apres', commande, base: lu.base, changees, bilan });
  return bilan;
}

/**
 * Le plafond du PROCESSUS (`AI_SPEND_CAP_USD`, comparé à la somme de LA base)
 * · ce que la base compte déjà, plus la réservation maximale confirmée. La
 * décision a déjà vérifié que cette réservation tient dans le restant du
 * registre (toutes bases), qui inclut ce que la base compte.
 */
export function plafondProcessusUsd(depenseFenetreUsd: number, reservationMicros: number): number {
  return Math.round((depenseFenetreUsd + reservationMicros / 1_000_000) * 1_000_000) / 1_000_000;
}

export { decisionDepenseEssai };

export const resoudreDossier = (env: Readonly<Record<string, string | undefined>>) => resolve(dossierRegistre(env));
