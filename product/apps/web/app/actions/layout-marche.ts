'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import {
  grammaireLayout, briefLayout,
  normalizeHeadlinePosition, normalizeComposition, normalizeTextDensity, normalizeBackground,
  type ObservationLayout,
} from '@tiktrends/core';

/**
 * La grammaire de layout gagnante de la catégorie, prête à injecter en génération.
 *
 * ── Sans migration, sans dépense ─────────────────────────────────────────────
 *
 * #265 range désormais les quatre dimensions de layout en clés structurées dans
 * le jsonb `analysis` des créas concurrentes analysées. Ce lecteur les relit, les
 * agrège (`grammaireLayout`, noyau pur), et rend la consigne de tendance
 * (`briefLayout`). Aucune colonne à promouvoir, aucun modèle appelé · on lit ce
 * qui a déjà été décrit.
 *
 * Inerte tant que la catégorie n'a pas été décrite · sans créa analysée, pas
 * d'observation, donc pas de consigne. C'est le lot market-learn (payé, annoncé,
 * cliqué par le propriétaire) qui remplit la donnée · le jour où il tourne, ceci
 * s'allume tout seul.
 *
 * Best-effort · une lecture en échec rend `[]`, jamais une erreur qui bloquerait
 * la génération.
 */

// On borne la lecture · au-delà, on ne lit pas plus de marché, on lit plus vieux.
const LIMITE = 400;

export async function tendancesLayoutMarcheAction(): Promise<string[]> {
  const s = await getSession();
  if (!s || !db) return [];
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return [];

  const rows = await db.select({ analysis: schema.marketCreatives.analysis })
    .from(schema.marketCreatives)
    .where(and(
      eq(schema.marketCreatives.workspaceId, s.workspaceId),
      eq(schema.marketCreatives.brandId, brand.id),
    ))
    .orderBy(desc(schema.marketCreatives.analyzedAt))
    .limit(LIMITE);

  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const obs: ObservationLayout[] = rows.map((r) => {
    const a = (r.analysis ?? {}) as Record<string, unknown>;
    return {
      headlinePosition: normalizeHeadlinePosition(str(a.headlinePosition)),
      composition: normalizeComposition(str(a.composition)),
      textDensity: normalizeTextDensity(str(a.textDensity)),
      background: normalizeBackground(str(a.background)),
    };
  });

  return briefLayout(grammaireLayout(obs));
}
