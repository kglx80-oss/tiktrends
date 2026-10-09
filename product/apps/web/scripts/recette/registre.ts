/**
 * Recette Studios · E2/E3 · REGISTRE CUMULATIF du budget d'essai (15 $ au total).
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
 * ── La séquence d'une commande payante (E3) ─────────────────────────────────
 *
 *   lire la base (hors verrou)
 *   → VERROU → lire le registre → fusionner → décider (restant ≥ réservation)
 *     → écrire l'ENGAGEMENT (fichier temporaire, `fsync`, `rename`) → RELÂCHER
 *   → appel payant
 *   → lire la base → VERROU → rattacher les lignes nées → régler / libérer /
 *     incertain (idempotent par identifiant) → RELÂCHER
 *
 * L'engagement est COMPTÉ au bilan dès son écriture (au maximum réservé). Un
 * processus tué pendant l'appel laisse un engagement ouvert, compté au
 * maximum même après la destruction de la base (garde :
 * `test/e3-registre-verrou.test.ts`, processus enfant tué par SIGKILL). Le
 * verrou (`verrou.ts`) rend la lecture, la décision et l'écriture
 * indivisibles entre processus, bases et conteneurs.
 *
 *  · écriture ATOMIQUE (fichier temporaire, `fsync`, copie de la version
 *    précédente en `.prec`, `rename`), après confirmation que le verrou est
 *    toujours tenu ;
 *  · JOURNAL en ajout seul (`budget-essais.journal.jsonl`) : initialisation,
 *    engagement, clôture, saisie, avec le bilan ;
 *  · une ligne `ai_spend` vue une fois reste au registre même si sa base
 *    disparaît, à son dernier état (une réservation sans issue reste au
 *    maximum) ;
 *  · une dépense ANTÉRIEURE connue par facture se saisit (`recette:budget:saisir`).
 *
 * Les règles d'argent (classement d'une ligne, engagements, bilan, décision)
 * vivent dans le noyau (`classerLigneEssaiReconciliee`, `bilanEssaiReconcilie`,
 * `cloreEngagementEssai`, `decisionDepenseEssai`).
 *
 * R6 · la lecture de la base joint `ai_spend_reconciliations` (R5, 0056) : une
 * ligne réconciliée par le propriétaire compte son montant FACTURÉ, et un
 * engagement incertain dont toutes les lignes sont réconciliées aussi (garde :
 * `test/r6-registre-reconciliation.test.ts`).
 */

import { randomUUID } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUDGET_ESSAIS_TOTAL_USD_MICROS, bilanEssaiReconcilie, classerLigneEssaiReconciliee, cloreEngagementEssai, decisionDepenseEssai, engagementIncertainReconcilie, engagementValide, lignesARattacher,
  type BilanEssaiEngage, type EngagementEssai, type EtatLigneEssaiReconciliee, type IssueEngagement,
} from '@tiktrends/core';
import { sousVerrou, type Verrou } from './verrou';

export const FORMAT_REGISTRE = 'registre-budget-essais/2';
/** Format E2 (sans engagements) · relu et porté au format courant. */
export const FORMAT_REGISTRE_V1 = 'registre-budget-essais/1';
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
  etat: EtatLigneEssaiReconciliee;
  /** R6 · montant FACTURÉ de la réconciliation (R5), `null` sans réconciliation. */
  factureMicros?: number | null;
  regleMicros: number;
  incertainMicros: number;
  cause: string | null;
  creeeLe: string;
  /** Base où la ligne a été vue (identifiant du cluster Postgres et nom). */
  base: string;
  vueLe: string;
  /** Engagement auquel la ligne a été rattachée à sa clôture (E3). */
  engagement?: string | null;
}

export interface DepenseAnterieure { id: string; usdMicros: number; motif: string; saisieLe: string }

export interface RegistreBudget {
  format: typeof FORMAT_REGISTRE;
  autorisation: { usdMicros: number; le: string; citation: string };
  anterieures: DepenseAnterieure[];
  lignes: Record<string, LigneRegistre>;
  /** Engagements pris AVANT chaque dépense (E3) · comptés au bilan dès leur écriture. */
  engagements: Record<string, EngagementEssai>;
  bases: Record<string, { premiereVue: string; derniereVue: string }>;
  majLe: string;
}

/** Une ligne `ai_spend` telle que la base la rend. */
export interface LigneBase {
  id: string; provider: string; model: string | null; action: string;
  estimatedUsd: number; actualUsd: number; inputTokens: number | null; outputTokens: number | null;
  reconcileReason: string | null; createdAt: Date;
  /** R6 · `billed_micros` de la réconciliation de la ligne (`ai_spend_reconciliations`), `null` ou absent sans. */
  factureMicros?: number | null;
}

/** Ce qu'une lecture de la base de recette rend. */
export interface LectureBase { lignes: LigneBase[]; base: string; depenseFenetreUsd: number }

/* ───────────────────────────── règles pures ─────────────────────────────── */

export function registreVierge(maintenant: Date): RegistreBudget {
  return {
    format: FORMAT_REGISTRE,
    autorisation: { usdMicros: BUDGET_ESSAIS_TOTAL_USD_MICROS, le: '2026-10-09', citation: CITATION_AUTORISATION },
    anterieures: [], lignes: {}, engagements: {}, bases: {}, majLe: maintenant.toISOString(),
  };
}

const entier = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Lit le texte du registre · `null` si illisible (format, autorisation modifiée, montants invalides). Un registre E2 est porté au format courant. */
export function lireRegistre(texte: string): RegistreBudget | null {
  let o: unknown;
  try { o = JSON.parse(texte); } catch { return null; }
  const r = o as (Omit<Partial<RegistreBudget>, 'format'> & { format?: string }) | null;
  if (!r || (r.format !== FORMAT_REGISTRE && r.format !== FORMAT_REGISTRE_V1)) return null;
  // L'autorisation n'est pas un réglage : un registre qui la relève est refusé.
  if (!r.autorisation || r.autorisation.usdMicros !== BUDGET_ESSAIS_TOTAL_USD_MICROS) return null;
  if (!Array.isArray(r.anterieures) || r.anterieures.some((a) => !a || !entier(a.usdMicros) || typeof a.motif !== 'string')) return null;
  if (!r.lignes || typeof r.lignes !== 'object' || Array.isArray(r.lignes)) return null;
  for (const l of Object.values(r.lignes)) {
    if (!l || typeof l.id !== 'string' || !entier(l.regleMicros) || !entier(l.incertainMicros)) return null;
  }
  if (!r.bases || typeof r.bases !== 'object') return null;
  const engagements = r.format === FORMAT_REGISTRE_V1 ? {} : r.engagements;
  if (!engagements || typeof engagements !== 'object' || Array.isArray(engagements)) return null;
  for (const [id, g] of Object.entries(engagements)) if (!engagementValide(g) || g.id !== id) return null;
  return { ...(r as RegistreBudget), format: FORMAT_REGISTRE, engagements };
}

/**
 * Fusionne l'état COURANT des lignes d'une base dans le registre. Une ligne
 * présente en base y prend son dernier état (une réservation réglée descend
 * au coût réel) ; une ligne absente (base détruite) garde son dernier état
 * connu ; un rattachement à un engagement est conservé. Rend le registre neuf
 * et les identifiants changés.
 */
export function fusionnerRegistre(reg: RegistreBudget, lignes: readonly LigneBase[], base: string, maintenant: Date): { registre: RegistreBudget; changees: string[] } {
  const t = maintenant.toISOString();
  const out: RegistreBudget = { ...reg, lignes: { ...reg.lignes }, engagements: { ...reg.engagements }, bases: { ...reg.bases }, majLe: t };
  const changees: string[] = [];
  for (const l of lignes) {
    const c = classerLigneEssaiReconciliee({ ...l, factureMicros: l.factureMicros ?? null });
    const a = out.lignes[l.id];
    const n: LigneRegistre = {
      id: l.id, provider: l.provider, model: l.model, action: l.action,
      reserveMicros: Math.max(0, Math.round(Number(l.estimatedUsd) * 1_000_000)), actualMicros: Math.max(0, Math.round(Number(l.actualUsd) * 1_000_000)),
      etat: c.etat, regleMicros: c.regleMicros, incertainMicros: c.incertainMicros, cause: l.reconcileReason, factureMicros: l.factureMicros ?? null,
      creeeLe: l.createdAt.toISOString(), base: a?.base ?? base, vueLe: t, engagement: a?.engagement ?? null,
    };
    if (!a || a.etat !== n.etat || a.regleMicros !== n.regleMicros || a.incertainMicros !== n.incertainMicros || a.cause !== n.cause) changees.push(l.id);
    out.lignes[l.id] = n;
  }
  out.bases[base] = { premiereVue: reg.bases[base]?.premiereVue ?? t, derniereVue: t };
  return { registre: out, changees };
}

export function bilanRegistre(reg: RegistreBudget): BilanEssaiEngage {
  return bilanEssaiReconcilie({
    autoriseMicros: reg.autorisation.usdMicros,
    anterieuresMicros: reg.anterieures.reduce((s, a) => s + a.usdMicros, 0),
    lignes: Object.values(reg.lignes),
    engagements: Object.values(reg.engagements ?? {}),
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

/** Le texte de `recette:budget` · autorisé, réglé, engagé, incertain, restant, puis le détail. */
export function texteBilan(reg: RegistreBudget, b: BilanEssaiEngage = bilanRegistre(reg)): string {
  const incertaines = Object.values(reg.lignes).filter((l) => l.incertainMicros > 0);
  const ouverts = Object.values(reg.engagements ?? {}).filter((g) => g.etat === 'engage');
  const engIncertains = Object.values(reg.engagements ?? {}).filter((g) => g.etat === 'incertain');
  const lignes = Object.values(reg.lignes);
  const reconciliees = lignes.filter((l) => l.etat === 'reconciliee');
  return [
    'Budget d’essai · registre cumulatif (toutes bases, tous passages)',
    `  autorisé            · ${usd2(b.autoriseMicros)} au total (propriétaire, ${reg.autorisation.le})`,
    `  antérieur (saisi)   · ${usd4(b.anterieuresMicros)}`,
    `  réglé               · ${usd4(b.regleMicros)}`,
    `  engagé (ouvert)     · ${usd4(b.engageMicros)} (${b.engagementsOuverts} engagement(s) pris avant l’appel et jamais clos, au maximum réservé)`,
    `  incertain conservé  · ${usd4(b.incertainMicros - b.engageMicros)} (au maximum réservé, à réconcilier)`,
    `  RESTANT             · ${usd4(b.restantMicros)}${b.depasse ? ' · DÉPASSÉ, aucune commande payante ne part' : ''}`,
    `  lignes connues      · ${Object.keys(reg.lignes).length} · engagements : ${Object.keys(reg.engagements ?? {}).length} · bases vues : ${Object.keys(reg.bases).length} · mis à jour ${reg.majLe}`,
    ...(ouverts.length ? ['  engagements ouverts (commande en cours, ou interrompue avant sa clôture · comptés au maximum) :', ...ouverts.map((g) => `    - ${g.id} · ${g.commande} · ${usd4(g.reserveMicros)} · pris le ${g.creeLe} · processus ${g.pid} (${g.hote}) · base ${g.base}`)] : []),
    ...(engIncertains.length ? ['  engagements à l’issue incertaine :', ...engIncertains.map((g) => `    - ${g.id} · ${g.commande} · ${usd4(g.reserveMicros)} · ${g.cause ?? 'issue inconnue'} · ${g.creeLe}${engagementIncertainReconcilie(g, lignes) ? ' · lignes toutes réconciliées, compté au facturé' : ''}`)] : []),
    ...(incertaines.length ? ['  à réconcilier :', ...incertaines.map((l) => `    - ${l.id} · ${l.provider} · ${l.action} · ${usd4(l.incertainMicros)} · ${l.cause ?? 'réservée sans issue (processus interrompu)'} · ${l.creeeLe}`)] : []),
    ...(reconciliees.length ? ['  réconciliées avec la facture (comptées au facturé) :', ...reconciliees.map((l) => `    - ${l.id} · ${l.provider} · ${l.action} · réservé ${usd4(l.actualMicros)} → facturé ${usd4(l.regleMicros)} · ${l.creeeLe}`)] : []),
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

/**
 * Écriture ATOMIQUE, SOUS VERROU · temporaire + `fsync`, version précédente
 * gardée en `.prec`, confirmation que le verrou est toujours à nous, puis
 * `rename`. Sans verrou tenu, rien n'est écrit.
 */
export function ecrireRegistre(dossier: string, reg: RegistreBudget, verrou: Verrou): void {
  mkdirSync(dossier, { recursive: true });
  const f = join(dossier, FICHIER_REGISTRE);
  const tmp = `${f}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w', 0o600);
  try { writeSync(fd, `${JSON.stringify(reg, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  verrou.confirmer();
  if (existsSync(f)) copyFileSync(f, `${f}.prec`);
  renameSync(tmp, f);
  // Le renommage lui-même est rendu durable (entrée de répertoire).
  try { const d = openSync(dossier, 'r'); try { fsyncSync(d); } finally { closeSync(d); } } catch { /* système sans fsync de dossier */ }
}

/* ───────────────────────────── base ─────────────────────────────────────── */

type BaseRecette = NonNullable<typeof import('@tiktrends/db')['db']>;

/**
 * Lecture SEULE d'une base · toutes les lignes `ai_spend`, identité du
 * cluster. `depenseFenetre` · somme comptée par la barrière commune (défaut :
 * la même somme sur 30 jours, calculée ici).
 */
export async function lireBaseDepuis(db: BaseRecette, depenseFenetre?: () => Promise<number>): Promise<LectureBase> {
  const { schema, sql, eq } = await import('@tiktrends/db');
  const A = schema.aiSpend;
  const R = schema.aiSpendReconciliations;
  // R6 · jointure à GAUCHE : une ligne réconciliée (R5) porte son montant facturé, les autres `null`.
  const lues = await db.select({ l: A, facture: R.billedMicros }).from(A).leftJoin(R, eq(R.aiSpendId, A.id)).orderBy(A.createdAt, A.id);
  const rows = lues.map((x) => ({ ...x.l, factureMicros: x.facture === null || x.facture === undefined ? null : Number(x.facture) }));
  let base = 'base-inconnue';
  try {
    const r = await db.execute(sql`select (select system_identifier::text from pg_control_system()) as id, current_database() as nom`);
    const x = ((Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ id: string; nom: string }>)[0];
    if (x) base = `${x.nom}@${x.id}`;
  } catch { /* identité facultative */ }
  const depuis = Date.now() - 30 * 86_400_000;
  return {
    lignes: rows.map((l) => ({ id: l.id, provider: l.provider, model: l.model, action: l.action, estimatedUsd: Number(l.estimatedUsd), actualUsd: Number(l.actualUsd), inputTokens: l.inputTokens, outputTokens: l.outputTokens, reconcileReason: l.reconcileReason, createdAt: l.createdAt, factureMicros: l.factureMicros })),
    base,
    // Même montant RETENU que le plafond commun (`montantRetenuSql`) · le facturé d'une ligne réconciliée.
    depenseFenetreUsd: depenseFenetre ? await depenseFenetre() : rows.filter((l) => l.createdAt.getTime() >= depuis).reduce((s, l) => s + (l.factureMicros !== null ? l.factureMicros / 1_000_000 : Number(l.actualUsd)), 0),
  };
}

/** Lecture SEULE de la base de recette du processus (`DATABASE_URL`), somme comptée par la barrière commune. */
export async function lireBase(): Promise<LectureBase> {
  const { db } = await import('@tiktrends/db');
  if (!db) throw new Error('Base indisponible (DATABASE_URL).');
  const { spentUsd } = await import('../../lib/spend-guard');
  return lireBaseDepuis(db, spentUsd);
}

/* ─────────────────────── avant / après une commande payante ─────────────── */

export type EtatEssai =
  | { ok: true; registre: RegistreBudget; bilan: BilanEssaiEngage; depenseFenetreUsd: number; base: string; initialiser: boolean; changees: string[]; lu: LectureBase }
  | { ok: false; raison: string };

/** Pur · cohérence fichier/base puis fusion EN MÉMOIRE et bilan. */
function etatDepuis(dossier: string, f: EtatFichier, lu: LectureBase, maintenant: Date): EtatEssai {
  const c = coherenceRegistre(f, lu.lignes.length, dossier);
  if (!c.ok) return c;
  const depart = f.etat === 'lisible' ? f.registre : registreVierge(maintenant);
  const { registre, changees } = fusionnerRegistre(depart, lu.lignes, lu.base, maintenant);
  return { ok: true, registre, bilan: bilanRegistre(registre), depenseFenetreUsd: lu.depenseFenetreUsd, base: lu.base, initialiser: c.initialiser, changees, lu };
}

/**
 * LECTURE SEULE · cohérence fichier/base, puis fusion EN MÉMOIRE de l'état
 * courant de la base dans le registre, puis bilan. Rien n'est écrit, aucun
 * verrou n'est pris (une lecture ne décide rien).
 */
export async function lireEtatEssai(dossier: string, maintenant: Date = new Date(), lecteur: () => Promise<LectureBase> = lireBase): Promise<EtatEssai> {
  const lu = await lecteur();
  return etatDepuis(dossier, lireFichierRegistre(dossier), lu, maintenant);
}

export type ResultatEngagement =
  | { ok: true; engagement: EngagementEssai; bilan: BilanEssaiEngage; registre: RegistreBudget; deja: boolean; depenseFenetreUsd: number }
  | { ok: false; raison: string };

/**
 * AVANT l'appel payant · sous VERROU : relit le registre, fusionne la base
 * (lue juste avant, hors verrou), DÉCIDE (`antérieur + réglé + engagé +
 * incertain + réservation ≤ 15 $`) et ÉCRIT l'engagement (atomique) avant de
 * relâcher. Idempotent par identifiant : un engagement déjà écrit est rendu
 * tel quel, sans seconde réservation. Un refus n'écrit rien.
 */
export async function engagerEssai(dossier: string, o: {
  commande: string; reservationMicros: number; lu: LectureBase; maintenant?: Date; id?: string;
  /** Crochet de test · appelé sous verrou entre la décision et l'écriture (élargit une course). */
  avantEcriture?: () => Promise<void>;
}): Promise<ResultatEngagement> {
  const id = o.id ?? `${o.commande}:${randomUUID()}`;
  return sousVerrou(dossier, async (verrou) => {
    const maintenant = o.maintenant ?? new Date();
    const e = etatDepuis(dossier, lireFichierRegistre(dossier), o.lu, maintenant);
    if (!e.ok) return e;
    const existant = e.registre.engagements[id];
    if (existant) return { ok: true, engagement: existant, bilan: e.bilan, registre: e.registre, deja: true, depenseFenetreUsd: e.depenseFenetreUsd };
    const d = decisionDepenseEssai(e.bilan, o.reservationMicros);
    if (!d.ok) return { ok: false, raison: d.message };
    const engagement: EngagementEssai = {
      id, commande: o.commande, reserveMicros: o.reservationMicros, etat: 'engage', regleMicros: null,
      creeLe: maintenant.toISOString(), closLe: null, cause: null, base: e.base, pid: process.pid, hote: hostname(),
    };
    const registre: RegistreBudget = { ...e.registre, engagements: { ...e.registre.engagements, [id]: engagement }, majLe: maintenant.toISOString() };
    const bilan = bilanRegistre(registre);
    if (o.avantEcriture) await o.avantEcriture();
    ecrireRegistre(dossier, registre, verrou);
    if (e.initialiser) journaliser(dossier, { le: maintenant.toISOString(), type: 'initialisation', commande: o.commande, base: e.base });
    journaliser(dossier, { le: maintenant.toISOString(), type: 'engagement', commande: o.commande, engagement: id, reservationMaximaleUsdMicros: o.reservationMicros, base: e.base, changees: e.changees, bilan });
    return { ok: true, engagement, bilan, registre, deja: false, depenseFenetreUsd: e.depenseFenetreUsd };
  });
}

export type ResultatCloture =
  | { ok: true; engagement: EngagementEssai; bilan: BilanEssaiEngage; change: boolean }
  | { ok: false; raison: string };

/**
 * APRÈS l'appel (y compris en échec) · relit la base (hors verrou), puis sous
 * VERROU : fusionne, rattache à l'engagement les lignes nées depuis lui (même
 * base), règle / libère / passe en incertain, IDEMPOTENT par identifiant.
 * Base illisible au moment de régler ⇒ l'engagement passe « incertain » et
 * reste compté au maximum (ses lignes n'ont pas pu être relevées).
 */
export async function cloreEssai(dossier: string, id: string, issue: IssueEngagement, o: {
  lecteur?: (() => Promise<LectureBase>) | null; maintenant?: Date;
} = {}): Promise<ResultatCloture> {
  let lu: LectureBase | null = null;
  let cause = '';
  if (o.lecteur !== null) {
    try { lu = await (o.lecteur ?? lireBase)(); } catch (e) { cause = (e as Error).message; }
  }
  const issueEffective: IssueEngagement = !lu && issue.etat === 'regle' && issue.montantMicros === undefined
    ? { etat: 'incertain', cause: `base illisible à la clôture${cause ? ` (${cause})` : ''} · lignes non relevées` }
    : issue;
  return sousVerrou(dossier, async (verrou) => {
    const maintenant = o.maintenant ?? new Date();
    const f = lireFichierRegistre(dossier);
    if (f.etat !== 'lisible') return { ok: false, raison: `Registre ${f.etat} à la clôture de l’engagement ${id} · rien n’est écrit ; lance recette:budget.` };
    let reg = f.registre;
    if (lu) reg = fusionnerRegistre(reg, lu.lignes, lu.base, maintenant).registre;
    const g = reg.engagements[id];
    if (!g) return { ok: false, raison: `Engagement ${id} inconnu du registre · rien n’est réglé.` };
    const lignes = { ...reg.lignes };
    const aRattacher = g.etat === 'engage' || g.etat === 'incertain' ? lignesARattacher(Object.values(lignes), g) : [];
    for (const lid of aRattacher) lignes[lid] = { ...lignes[lid]!, engagement: id };
    const rattache = Object.values(lignes).filter((l) => l.engagement === id).reduce((s, l) => s + l.regleMicros + l.incertainMicros, 0);
    const t = cloreEngagementEssai(g, issueEffective, rattache, maintenant);
    if (!t.ok) return { ok: false, raison: t.message };
    const neuf: RegistreBudget = { ...reg, lignes, engagements: { ...reg.engagements, [id]: t.engagement }, majLe: maintenant.toISOString() };
    const bilan = bilanRegistre(neuf);
    // Écritures IDEMPOTENTES · rejouer la même clôture ne change ni l'état ni le montant ; seule la fusion des lignes est rafraîchie.
    if (t.change || aRattacher.length > 0 || lu !== null) ecrireRegistre(dossier, neuf, verrou);
    if (t.change || aRattacher.length > 0) {
      journaliser(dossier, { le: maintenant.toISOString(), type: 'cloture', engagement: id, commande: g.commande, issue: t.engagement.etat, regleUsdMicros: t.engagement.regleMicros, cause: t.engagement.cause, rattachees: aRattacher, base: lu?.base ?? null, bilan });
    }
    return { ok: true, engagement: t.engagement, bilan, change: t.change };
  });
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
