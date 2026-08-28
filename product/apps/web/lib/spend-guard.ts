import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { anthropicFromEnv } from '@tiktrends/ai';
import {
  checkBudget, costOfTokens, estimateCallCost, summarizeBudget, FIXED_COSTS,
  type FixedCostKind,
} from '@tiktrends/core';

/**
 * Barrière de dépense réelle · rien de payant ne part sans passer par ici.
 *
 * Le point important n'est pas le calcul, il est dans l'ENDROIT : le garde
 * s'installe sur le client Anthropic lui-même, pas à chaque appel. Le dépôt
 * compte trente-cinq points d'appel · un garde qu'il faut penser à invoquer
 * finit toujours par être oublié au trente-sixième, et c'est celui-là qui fait
 * la facture.
 *
 * Trois choix qui découlent de ce que ça protège :
 *
 *  - **Le plafond s'applique à TOUT LE MONDE.** Un compte fondateur a des
 *    crédits illimités · ses appels coûtent le même prix que les autres. Les
 *    crédits sont une comptabilité interne, les dollars sont réels.
 *  - **On refuse, on n'avertit pas.** Un avertissement qu'on peut ignorer n'est
 *    pas une barrière · c'est ce qui produit les factures qu'on découvre.
 *  - **En cas de doute, on refuse.** Base injoignable, modèle inconnu, tarif
 *    absent : le garde bloque. Laisser passer « parce qu'on ne sait pas » est
 *    exactement le comportement qu'on cherche à empêcher.
 */

/** Plafond par défaut · délibérément bas tant que le produit n'est pas lancé. */
const DEFAULT_CAP_USD = 10;
/** Fenêtre du plafond · glissante sur 30 jours, pas calendaire. */
const WINDOW_DAYS = 30;

export function spendCapUsd(): number {
  const raw = process.env.AI_SPEND_CAP_USD;
  if (raw === undefined || raw === '') return DEFAULT_CAP_USD;
  const n = Number(raw);
  // Une variable mal saisie ne doit pas ouvrir les vannes · on retombe sur le
  // défaut plutôt que sur l'infini.
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CAP_USD;
}

/** Somme dépensée sur la fenêtre · c'est `actual_usd` qui fait foi. */
export async function spentUsd(): Promise<number> {
  if (!db) return Number.POSITIVE_INFINITY;   // pas de compteur = pas d'appel
  const depuis = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${schema.aiSpend.actualUsd}), 0)` })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, depuis));
  return Number(row?.total ?? 0);
}

export interface SpendStatus { spentUsd: number; capUsd: number; summary: string; blocked: boolean }

export async function spendStatus(): Promise<SpendStatus> {
  const cap = spendCapUsd();
  const spent = await spentUsd().catch(() => Number.POSITIVE_INFINITY);
  const total = Number.isFinite(spent) ? spent : cap;
  return { spentUsd: total, capUsd: cap, summary: summarizeBudget({ spentUsd: total, capUsd: cap }), blocked: total >= cap };
}

/** Écrit une ligne de dépense · best-effort, jamais bloquant pour l'appelant. */
async function record(row: {
  workspaceId?: string | null; provider: string; model?: string | null; action: string;
  estimatedUsd: number; actualUsd: number; inputTokens?: number | null; outputTokens?: number | null;
}): Promise<void> {
  if (!db) return;
  try {
    await db.insert(schema.aiSpend).values({
      workspaceId: row.workspaceId ?? null,
      provider: row.provider, model: row.model ?? null, action: row.action,
      estimatedUsd: row.estimatedUsd, actualUsd: row.actualUsd,
      inputTokens: row.inputTokens ?? null, outputTokens: row.outputTokens ?? null,
    });
  } catch (e) {
    // Une écriture ratée fait perdre la trace d'une dépense · c'est grave, et
    // ça se voit dans les journaux plutôt que de casser la requête en cours.
    console.error('[spend] écriture impossible', (e as Error).message);
  }
}

/** Levée quand le plafond refuse un appel · message affichable tel quel. */
export class SpendBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'SpendBlockedError'; }
}

/* -------------------------------------------------------------------------- */
/*  Anthropic                                                                 */
/* -------------------------------------------------------------------------- */

type CreateParams = Anthropic.MessageCreateParams;

/** Taille du prompt en caractères · sert l'estimation d'entrée. */
function promptChars(p: CreateParams): number {
  let n = typeof p.system === 'string' ? p.system.length : JSON.stringify(p.system ?? '').length;
  for (const m of p.messages ?? []) {
    n += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
  }
  if (p.tools) n += JSON.stringify(p.tools).length;
  return n;
}

/**
 * Client Anthropic sous plafond.
 *
 * `messages.create` est remplacé : on estime, on demande l'autorisation, puis on
 * réconcilie avec les jetons réellement consommés. Tout le reste du client passe
 * inchangé · on n'intercepte que la méthode qui coûte.
 */
export function guardedAnthropic(opts: { workspaceId?: string | null; action: string }): Anthropic | null {
  const client = anthropicFromEnv();
  if (!client) return null;

  const brut = client.messages.create.bind(client.messages);

  const garde = async (params: CreateParams, options?: unknown) => {
    const modele = String(params.model);
    const estime = estimateCallCost({
      model: modele,
      promptChars: promptChars(params),
      maxTokens: Number(params.max_tokens ?? 1024),
    });

    const status = await spendStatus();
    const decision = checkBudget({ spentUsd: status.spentUsd, capUsd: status.capUsd }, estime);
    if (!decision.allowed) throw new SpendBlockedError(decision.reason);

    const res = await (brut as (p: CreateParams, o?: unknown) => Promise<Anthropic.Message>)(params, options);

    const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    const reel = costOfTokens(modele, usage?.input_tokens ?? 0, usage?.output_tokens ?? 0);
    await record({
      workspaceId: opts.workspaceId, provider: 'anthropic', model: modele, action: opts.action,
      // On enregistre au moins l'estimation : une réponse sans `usage` ne doit
      // pas compter pour zéro, sinon le plafond fuit sur ce chemin-là.
      estimatedUsd: estime, actualUsd: usage ? reel : estime,
      inputTokens: usage?.input_tokens ?? null, outputTokens: usage?.output_tokens ?? null,
    });
    return res;
  };

  // On remplace la méthode sur une copie du sous-objet · le client d'origine
  // reste intact pour qui l'utiliserait ailleurs.
  const messages = Object.create(client.messages) as typeof client.messages;
  (messages as { create: unknown }).create = garde;
  const proxy = Object.create(client) as Anthropic;
  (proxy as { messages: unknown }).messages = messages;
  return proxy;
}

/* -------------------------------------------------------------------------- */
/*  Coûts fixes (fal)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Autorise une dépense à coût fixe, puis l'enregistre.
 *
 * Les générations d'image et de vidéo ne se comptent pas en jetons · on applique
 * un coût forfaitaire, pris haut. La vidéo est le poste qui peut faire déraper
 * une facture en quelques clics, d'où un forfait nettement supérieur.
 */
export async function guardFixedCost(
  kind: FixedCostKind, opts: { workspaceId?: string | null; action: string; units?: number },
): Promise<void> {
  const cout = FIXED_COSTS[kind] * Math.max(1, Math.round(opts.units ?? 1));
  const status = await spendStatus();
  const decision = checkBudget({ spentUsd: status.spentUsd, capUsd: status.capUsd }, cout);
  if (!decision.allowed) throw new SpendBlockedError(decision.reason);

  await record({
    workspaceId: opts.workspaceId, provider: 'fal', model: kind, action: opts.action,
    estimatedUsd: cout, actualUsd: cout,
  });
}

/** Traduit une erreur de plafond en message utilisateur · null si autre chose. */
export function spendErrorMessage(e: unknown): string | null {
  return e instanceof SpendBlockedError ? e.message : null;
}

/** Dépense par espace sur la fenêtre · pour l'écran d'administration. */
export async function spendByWorkspace(): Promise<Array<{ workspaceId: string | null; usd: number; calls: number }>> {
  if (!db) return [];
  const depuis = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const rows = await db.select({
    workspaceId: schema.aiSpend.workspaceId,
    usd: sql<number>`coalesce(sum(${schema.aiSpend.actualUsd}), 0)`,
    calls: sql<number>`count(*)`,
  })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, depuis))
    .groupBy(schema.aiSpend.workspaceId);
  return rows.map((r) => ({ workspaceId: r.workspaceId, usd: Number(r.usd), calls: Number(r.calls) }));
}

/** Postes de dépense · dit OÙ part l'argent, pas seulement combien. */
export async function spendByAction(limit = 12): Promise<Array<{ action: string; usd: number; calls: number }>> {
  if (!db) return [];
  const depuis = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const rows = await db.select({
    action: schema.aiSpend.action,
    usd: sql<number>`coalesce(sum(${schema.aiSpend.actualUsd}), 0)`,
    calls: sql<number>`count(*)`,
  })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, depuis))
    .groupBy(schema.aiSpend.action)
    .orderBy(sql`sum(${schema.aiSpend.actualUsd}) desc`)
    .limit(limit);
  return rows.map((r) => ({ action: r.action, usd: Number(r.usd), calls: Number(r.calls) }));
}
