'use server';

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { refusVersRegles, regleDepuisApprentissage } from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { GUARD } from '../../lib/guard-error';
import { saveJarvisRulesAction } from './jarvis';

/**
 * ADSMAP · ce qu'on fait d'un apprentissage APRÈS l'avoir écrit.
 *
 * Deux gestes, chacun explicite (un clic de la personne), rien d'automatique :
 *  · le passer dans les règles de la marque · le texte est écrit par
 *    `saveJarvisRulesAction`, exactement comme une règle ajoutée à la main
 *    (mêmes gardes · admin, Jarvis ouvert, marque active), et l'apprentissage
 *    garde la trace du passage (`evidence.regle` · quand, par qui) ;
 *  · le rejeter, ou le rétablir · `refuted` est un drapeau, rien n'est effacé ·
 *    un apprentissage rejeté sort de la mémoire que Jarvis relit.
 *
 * L'apprentissage doit appartenir à la marque ACTIVE · sinon il « n'existe pas ».
 */

async function apprentissageDeLaMarque(id: string, workspaceId: string, brandId: string) {
  const [row] = await db!.select({
    id: schema.learnings.id, brandId: schema.learnings.brandId, statement: schema.learnings.statement,
    status: schema.learnings.status, refuted: schema.learnings.refuted, evidence: schema.learnings.evidence,
  }).from(schema.learnings)
    .where(and(eq(schema.learnings.id, id), eq(schema.learnings.workspaceId, workspaceId), eq(schema.learnings.brandId, brandId)))
    .limit(1);
  return row ?? null;
}

const evidenceDe = (e: unknown): Record<string, unknown> => (e && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string, unknown>) : {});

/** Passe un apprentissage validé dans les règles de la marque (une « Préférence »). */
export async function apprentissageVersReglesAction(input: { learningId: string }): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard({ minRole: 'admin' });
  if ('error' in g) return { error: g.error };
  try {
    const a = await apprentissageDeLaMarque(input.learningId, g.s.workspaceId, g.brand.id);
    if (!a) return { error: GUARD.notFound('cet apprentissage') };
    const refus = refusVersRegles({ statut: a.status, refute: a.refuted }, false);
    if (refus) return { error: refus };

    // Le doublon se lit dans le texte RÉEL des règles (`regleDepuisApprentissage`) · une règle retirée à la main peut revenir.
    const [b] = await db!.select({ regles: schema.brands.creativeRules }).from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1);
    const r = regleDepuisApprentissage(b?.regles ?? '', a.statement);
    if (!r.ok) return { error: r.raison };

    // L'écriture des règles, telle quelle · ses propres gardes repassent (admin, Jarvis, marque active).
    const ecrit = await saveJarvisRulesAction({ creativeRules: r.suivant });
    if (ecrit.error) return { error: ecrit.error };

    await db!.update(schema.learnings)
      .set({ evidence: { ...evidenceDe(a.evidence), regle: { le: new Date().toISOString(), par: g.s.user.id, type: 'pref' } } })
      .where(eq(schema.learnings.id, a.id));
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:learning-rules', e, { subject: 'le passage de l’apprentissage dans les règles', workspaceId: g.s.workspaceId }) };
  }
}

/** Rejette un apprentissage (`refute: true`) ou le rétablit · mêmes droits que la validation d'un verdict. */
export async function rejeterApprentissageAction(input: { learningId: string; refute: boolean }): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };
  try {
    const a = await apprentissageDeLaMarque(input.learningId, g.s.workspaceId, g.brand.id);
    if (!a) return { error: GUARD.notFound('cet apprentissage') };
    if (a.status !== 'validated') return { error: 'Seul un apprentissage validé se rejette · celui-ci s’écrit encore en concluant le lot.' };
    if (a.refuted === input.refute) return { error: input.refute ? 'Cet apprentissage est déjà rejeté.' : 'Cet apprentissage n’est pas rejeté.' };
    await db!.update(schema.learnings).set({ refuted: input.refute }).where(eq(schema.learnings.id, a.id));
    invalidateJarvisMemory(g.brand.id);
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:learning-refute', e, { subject: 'le rejet de l’apprentissage', workspaceId: g.s.workspaceId }) };
  }
}
