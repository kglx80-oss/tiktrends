'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { PorteeConversation } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../lib/jarvis-acces';
import { logAndTranslate } from '../../lib/error-log';
import { GUARD } from '../../lib/guard-error';
import {
  creerConversation, renommerConversation,
} from '../../lib/jarvis/conversations';

/**
 * UX V5 · les conversations Jarvis · créer, renommer (la liste est lue par
 * `jarvis-chat.ts`, avec le fil).
 *
 * Chaque action relit la session, la feature `jarvis` (rôle, offre, matrice
 * d'équipe) AVANT toute lecture, et vérifie que la marque passée appartient à
 * l'espace de la session · la portée (espace + marque + personne) est ensuite
 * appliquée par le dépôt (`lib/jarvis/conversations`). Rien n'est pris du
 * navigateur sans être revérifié côté serveur.
 */

async function porteeOuRefus(brandId: string): Promise<
  | { portee: PorteeConversation }
  | { error: string }
> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  const refus = refusJarvis(s);
  if (refus) return { error: TEXTE_REFUS_JARVIS[refus] };
  if (!brandId) return { error: GUARD.noBrand() };
  // La marque passée doit être une marque de l'espace de la session (même
  // validation que `getActiveBrand`) · sinon aucune conversation n'est portée.
  const [b] = await db.select({ id: schema.brands.id }).from(schema.brands)
    .where(and(eq(schema.brands.id, brandId), eq(schema.brands.workspaceId, s.workspaceId))).limit(1);
  if (!b) return { error: GUARD.noBrand() };
  return { portee: { workspaceId: s.workspaceId, brandId, userId: s.user.id } };
}

export async function creerConversationAction(brandId: string): Promise<{ id?: string; error?: string }> {
  const r = await porteeOuRefus(brandId);
  if ('error' in r) return { error: r.error };
  try {
    return { id: await creerConversation(r.portee) };
  } catch (e) {
    return { error: logAndTranslate('jarvis:conversations:creer', e, { subject: 'une conversation', workspaceId: r.portee.workspaceId }) };
  }
}

export async function renommerConversationAction(brandId: string, id: string, titre: string): Promise<{ ok?: boolean; error?: string }> {
  const r = await porteeOuRefus(brandId);
  if ('error' in r) return { error: r.error };
  try {
    const ok = await renommerConversation(r.portee, id, titre);
    return { ok };
  } catch (e) {
    return { error: logAndTranslate('jarvis:conversations:renommer', e, { subject: 'le renommage', workspaceId: r.portee.workspaceId }) };
  }
}
