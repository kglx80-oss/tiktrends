'use server';

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { summarizeDecisions, type Decision } from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { refreshDecisions } from '../../lib/decisions';
import { logAndTranslate } from '../../lib/error-log';

/**
 * ADSMAP · file de décisions (§10).
 *
 * Le module produit maintenant beaucoup. Le risque n'est plus de manquer
 * d'information mais d'en avoir trop · une table de trois cents lignes lue tous
 * les matins finit par n'être plus lue du tout.
 *
 * Cette file répond à une seule question : **qu'est-ce que je dois décider
 * aujourd'hui ?**
 *
 * Ce fichier n'est qu'une façade : le calcul et la persistance vivent dans
 * `lib/decisions.ts`, parce que la synchro nocturne doit pouvoir rafraîchir la
 * file sans session. Une file recalculée seulement quand quelqu'un ouvre l'écran
 * arriverait toujours en retard sur la mesure · or c'est la mesure qui la remplit.
 */

export interface InboxItem extends Decision {
  id: string;
  status: string;
  createdAt: string;
}

export interface Inbox { items: InboxItem[]; summary: string; dismissed: number }

/** Recalcule la file à la demande · la synchro nocturne fait la même chose sans session. */
export async function refreshDecisionsAction(): Promise<{ inbox?: Inbox; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };
  try {
    await refreshDecisions(g.s.workspaceId, g.brand.id);
    return await listDecisionsAction();
  } catch (e) {
    return { error: logAndTranslate('adsmap:decisions-refresh', e, { subject: 'le calcul de la file', workspaceId: g.s.workspaceId }) };
  }
}

/** Lit la file telle qu'elle est · ne recalcule rien. */
export async function listDecisionsAction(): Promise<{ inbox?: Inbox; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };
  try {
    const rows = await db!.select().from(schema.decisionItems)
      .where(and(eq(schema.decisionItems.brandId, g.brand.id), eq(schema.decisionItems.status, 'open')))
      .orderBy(asc(schema.decisionItems.priority), desc(schema.decisionItems.spendAtStake))
      .limit(60);

    const items: InboxItem[] = rows.map((r) => {
      const p = (r.payload ?? {}) as { targetId?: string; targetKind?: string; title?: string; action?: string };
      return {
        id: r.id,
        type: r.type as Decision['type'],
        targetId: p.targetId ?? '',
        targetKind: (p.targetKind ?? 'ad') as Decision['targetKind'],
        priority: r.priority as Decision['priority'],
        spendAtStake: r.spendAtStake ?? null,
        title: p.title ?? '—',
        action: p.action ?? '',
        status: r.status,
        createdAt: (r.createdAt as Date).toISOString(),
      };
    });

    const [compte] = await db!.select({ n: sql<number>`count(*)` })
      .from(schema.decisionItems)
      .where(and(eq(schema.decisionItems.brandId, g.brand.id), eq(schema.decisionItems.status, 'dismissed')));

    // La marque a-t-elle été MESURÉE au moins une fois ? Une file vide ne
    // garantit « rien ne brûle » que si l'on a mesuré · sinon on le dit (CDC v6
    // · R03). On lit le MÊME signal que le bouton « Mesurer maintenant »
    // (`adsmapSyncedAt`) · sinon les deux se contredisaient · le bouton disait
    // « Jamais mesurée » pendant que l'entête concluait « rien ne brûle » sur la
    // foi d'anciens apprentissages, alors qu'aucune synchro n'avait tourné.
    const [mes] = await db!.select({ at: schema.brands.adsmapSyncedAt })
      .from(schema.brands).where(eq(schema.brands.id, g.brand.id)).limit(1);
    const aDesMesures = mes?.at != null;

    return { inbox: { items, summary: summarizeDecisions(items, { aDesMesures }), dismissed: Number(compte?.n ?? 0) } };
  } catch (e) {
    return { error: logAndTranslate('adsmap:decisions-list', e, { subject: 'la lecture de la file', workspaceId: g.s.workspaceId }) };
  }
}

/**
 * Ferme une décision.
 *
 * `done` disparaît au prochain recalcul si les faits ont suivi ; `dismissed`
 * empêche la reproposition. La distinction compte : « je l'ai fait » et « ce
 * n'est pas un problème » n'appellent pas le même comportement demain.
 */
export async function resolveDecisionAction(id: string, status: 'done' | 'dismissed'): Promise<{ ok?: true; error?: string }> {
  const g = await adsmapGuard();
  if ('error' in g) return { error: g.error };
  try {
    await db!.update(schema.decisionItems)
      .set({ status, resolvedBy: g.s.user.id })
      .where(and(eq(schema.decisionItems.id, id), eq(schema.decisionItems.brandId, g.brand.id)));
    return { ok: true };
  } catch (e) {
    return { error: logAndTranslate('adsmap:decisions-resolve', e, { subject: 'la fermeture de la décision', workspaceId: g.s.workspaceId }) };
  }
}
