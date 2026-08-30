'use server';

import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { starters } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { canAccess, FEATURES, roleAtLeast } from '../../lib/rbac';
import { effectiveAccess } from '../../lib/access';
import { jarvisStats } from '../../lib/jarvis-memory';
import { logAndTranslate } from '../../lib/error-log';
import { GUARD } from '../../lib/guard-error';

/**
 * Lecture et effacement du fil.
 *
 * L'envoi passe par `/api/jarvis/chat` parce qu'il doit répondre au fur et à
 * mesure · le reste tient dans des actions serveur, qui sont plus simples à
 * appeler et n'ont rien à streamer.
 */

const adsmap = FEATURES.find((f) => f.key === 'adsmap')!;

export interface ChatTurn { id: string; role: 'user' | 'assistant'; content: string; at: string }

export interface ChatThread {
  turns: ChatTurn[];
  /** Entrées proposées quand le fil est vide · elles apprennent ce que Jarvis sait faire. */
  starters: string[];
  /** Combien de tests nourrissent ses réponses · dit ce qu'on peut en attendre. */
  measuredAds: number;
  brandName: string;
}

export async function chatThreadAction(): Promise<{ thread?: ChatThread; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'member')) return { error: GUARD.role({ needRole: 'admin' }) };

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active pour parler à Jarvis.' };

  try {
    const voitMemoire = canAccess(effectiveAccess(s), adsmap);
    const [rows, stats] = await Promise.all([
      db.select({
        id: schema.jarvisMessages.id, role: schema.jarvisMessages.role,
        content: schema.jarvisMessages.content, createdAt: schema.jarvisMessages.createdAt,
      })
        .from(schema.jarvisMessages)
        .where(and(
          eq(schema.jarvisMessages.brandId, brand.id),
          eq(schema.jarvisMessages.userId, s.user.id),
        ))
        .orderBy(asc(schema.jarvisMessages.createdAt))
        .limit(120),
      voitMemoire ? jarvisStats(brand.id, s.workspaceId).catch(() => null) : Promise.resolve(null),
    ]);

    const n = stats?.nAds ?? 0;
    return {
      thread: {
        turns: rows.map((r) => ({
          id: r.id, role: r.role as ChatTurn['role'], content: r.content,
          at: (r.createdAt as Date).toISOString(),
        })),
        starters: starters({ measuredAds: n, hasMarket: false }),
        measuredAds: n,
        brandName: brand.name,
      },
    };
  } catch (e) {
    return { error: logAndTranslate('jarvis:thread', e, { subject: 'la conversation', workspaceId: s.workspaceId }) };
  }
}

/**
 * Repart de zéro.
 *
 * Un fil long finit par tirer la conversation vers son passé · pouvoir le couper
 * fait partie de l'outil, et l'effacement est total plutôt que partiel : garder
 * la moitié d'un contexte produit des réponses qui font référence à ce qu'on
 * vient de supprimer.
 */
export async function clearChatAction(): Promise<{ ok?: boolean; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: GUARD.noBrand() };
  try {
    await db.delete(schema.jarvisMessages).where(and(
      eq(schema.jarvisMessages.brandId, brand.id),
      eq(schema.jarvisMessages.userId, s.user.id),
    ));
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('jarvis:clear', e, { subject: 'l’effacement du fil', workspaceId: s.workspaceId }) };
  }
}
