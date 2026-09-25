'use server';

import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { starters, personnalisationAccueil } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { canAccess, FEATURES, roleAtLeast } from '../../lib/rbac';
import { effectiveAccess } from '../../lib/access';
import { jarvisStats, jarvisHookView } from '../../lib/jarvis-memory';
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

/**
 * Le contexte de marque, à la demande · ce sur quoi Jarvis s'appuie, montré sans
 * quitter la conversation. Chaque élément est propre à la MARQUE active · c'est
 * sa portée, affichée telle quelle. Rien de nouveau n'est exposé · c'est le
 * contenu de la marque du membre, en lecture.
 */
/**
 * Les accroches, mot pour mot · ce que Jarvis injecte tel quel dans chaque
 * génération, avec ce que chacune a donné. Portée marque, derrière l'offre Plus
 * (comme la mémoire mesurée) · null quand l'accès manque ou qu'il n'y a rien.
 */
export type ChatHooks = Awaited<ReturnType<typeof jarvisHookView>>;

export interface ChatContexte {
  brandId: string;
  /** Identité déclarée · description, promesse, audience · vide si rien. */
  identity: string | null;
  /** Consignes créatives maison · injectées dans chaque génération. Portée marque. */
  rules: string | null;
  /** Accroches mesurées et de marché · portée marque, offre Plus. null sinon. */
  hooks: ChatHooks | null;
}

export interface ChatThread {
  turns: ChatTurn[];
  /** Entrées proposées quand le fil est vide · elles apprennent ce que Jarvis sait faire. */
  starters: string[];
  /** Combien de tests nourrissent ses réponses · dit ce qu'on peut en attendre. */
  measuredAds: number;
  brandName: string;
  /** Ce que Jarvis a comme contexte de marque · ouvert à la demande. */
  contexte: ChatContexte;
}

export async function chatThreadAction(): Promise<{ thread?: ChatThread; error?: string }> {
  const s = await getSession();
  if (!s || !db) return { error: GUARD.session() };
  if (!roleAtLeast(s.role, 'member')) return { error: GUARD.role({ needRole: 'admin' }) };

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { error: 'Sélectionne une marque active pour parler à Jarvis.' };

  try {
    const voitMemoire = canAccess(effectiveAccess(s), adsmap);
    const [rows, stats, ws, ident, hooks] = await Promise.all([
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
      db.select({ onboarding: schema.workspaces.onboarding }).from(schema.workspaces).where(eq(schema.workspaces.id, s.workspaceId)).limit(1),
      db.select({
        description: schema.brands.description, usp: schema.brands.usp,
        audience: schema.brands.audience, creativeRules: schema.brands.creativeRules,
      }).from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1),
      // Accroches · même provenance que la page Sources, même garde (offre Plus).
      voitMemoire ? jarvisHookView(brand.id, s.workspaceId).catch(() => null) : Promise.resolve(null),
    ]);

    const n = stats?.nAds ?? 0;
    // L'objectif déclaré à l'accueil oriente les trois suggestions · c'est ici
    // que ses réponses cessent d'être un formulaire sans effet.
    const { objectif } = personnalisationAccueil(ws[0]?.onboarding);
    const b = ident[0];
    const identity = [b?.description, b?.usp, b?.audience].filter(Boolean).join('\n').trim() || null;
    return {
      thread: {
        turns: rows.map((r) => ({
          id: r.id, role: r.role as ChatTurn['role'], content: r.content,
          at: (r.createdAt as Date).toISOString(),
        })),
        starters: starters({ measuredAds: n, hasMarket: false, objectif }),
        measuredAds: n,
        brandName: brand.name,
        contexte: { brandId: brand.id, identity, rules: b?.creativeRules?.trim() || null, hooks },
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
