'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { chatAssistant, type ChatMessage } from '@tiktrends/ai';
import { costFor, refusAssistant, TEXTE_REFUS_ASSISTANT, validerHistorique } from '@tiktrends/core';
import { unlimitedCredits, reserveCredits, refundCredits } from '../../lib/credits';
import { logAndTranslate } from '../../lib/error-log';
import { guardedAnthropic } from '../../lib/spend-guard';
import { GUARD } from '../../lib/guard-error';

export interface AskResult { reply?: string; error?: string }

/**
 * Une question à l'assistant IA de la home (gated + débit crédits léger).
 *
 * ── SEC-03 / P1 · la garde de rôle ───────────────────────────────────────────
 * La session suffisait · un `client_viewer` dépensait des dollars et des
 * crédits. Rôle d'espace « member » au minimum (`refusAssistant`, noyau · la
 * même marche que `refusJarvis`), vérifié AVANT toute réservation et tout
 * appel IA.
 *
 * ── SEC-05 / P2 · l'historique vient du navigateur ───────────────────────────
 * Le type `ChatMessage[]` n'est qu'une annotation · rien ne le vérifiait à
 * l'exécution. `validerHistorique` (noyau) refuse un rôle autre que
 * `user|assistant` (un faux `system`), un contenu non textuel, un message ou
 * une question démesurés, un nombre de messages anormal · AVANT tout débit.
 * Ce qui reste est borné (12 derniers tours, 4 000 caractères), recopié champ
 * par champ et commence par `user`.
 */
export async function askAssistant(history: ChatMessage[], question: string): Promise<AskResult> {
  const s = await getSession();
  if (!s) return { error: GUARD.session() };
  if (refusAssistant({ roleEspace: s.role })) return { error: TEXTE_REFUS_ASSISTANT };

  const fil = validerHistorique(history as unknown, question as unknown);
  if (!fil.ok) {
    if (fil.raison === 'question' && typeof question === 'string' && !question.trim()) return { error: 'Pose une question.' };
    return { error: 'Cette conversation ne peut pas être envoyée telle quelle. Recharge la page et repose ta question.' };
  }

  const client = guardedAnthropic({ workspaceId: s.workspaceId, action: 'assistant' });
  if (!client) return { error: "L'assistant IA n'est pas encore activé (clé serveur manquante)." };

  // Débit atomique avant l'appel (remboursé en cas d'échec) : la vérification puis
  // le débit en deux temps laissait passer deux questions simultanées pour un crédit.
  const cost = costFor('chat');
  const unlimited = unlimitedCredits(s.user.email);
  if (!unlimited && !(await reserveCredits(s.workspaceId, cost, 'Assistant IA · question'))) {
    return { error: `Crédits insuffisants (${cost} requis).` };
  }
  // Solde restant : l'assistant s'en sert pour répondre « il te reste X crédits ».
  let credits = 0;
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    credits = w?.c ?? 0;
  }

  const brand = await getActiveBrand(s.workspaceId);
  try {
    const reply = await chatAssistant(
      client,
      fil.messages,
      { brandName: brand?.name ?? null, credits, plan: s.plan },
    );
    return { reply };
  } catch (e) {
    if (!unlimited) await refundCredits(s.workspaceId, cost, 'Remboursement · assistant IA');
    return { error: logAndTranslate('assistant', e, { subject: 'la réponse de l’assistant', workspaceId: s.workspaceId }) };
  }
}
