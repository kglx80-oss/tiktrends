'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { anthropicFromEnv, chatAssistant, type ChatMessage } from '@tiktrends/ai';
import { costFor } from '@tiktrends/core';
import { unlimitedCredits } from '../../lib/credits';

export interface AskResult { reply?: string; error?: string }

/** Une question à l'assistant IA de la home (gated + débit crédits léger). */
export async function askAssistant(history: ChatMessage[], question: string): Promise<AskResult> {
  const s = await getSession();
  if (!s) return { error: 'Session expirée, reconnecte-toi.' };
  const q = question.trim();
  if (!q) return { error: 'Pose une question.' };

  const client = anthropicFromEnv();
  if (!client) return { error: "L'assistant IA n'est pas encore activé (clé serveur manquante)." };

  const cost = costFor('chat');
  const unlimited = unlimitedCredits(s.user.email);
  let credits = 0;
  if (db) {
    const [w] = await db.select({ c: schema.workspaces.creditsBalance }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1);
    credits = w?.c ?? 0;
    if (!unlimited && credits < cost) return { error: `Crédits insuffisants (${cost} requis).` };
  }

  const brand = await getActiveBrand(s.workspaceId);
  try {
    const reply = await chatAssistant(
      client,
      [...history, { role: 'user', content: q }],
      { brandName: brand?.name ?? null, credits, plan: s.plan },
    );
    if (db && !unlimited) {
      try {
        await db.update(schema.workspaces).set({ creditsBalance: Math.max(0, credits - cost) }).where(eq(schema.workspaces.id, s.workspaceId));
        await db.insert(schema.creditLedger).values({ workspaceId: s.workspaceId, delta: -cost, reason: 'Assistant IA · question' });
      } catch { /* débit best-effort */ }
    }
    return { reply };
  } catch (e) {
    return { error: 'Échec de la réponse : ' + (e as Error).message };
  }
}
