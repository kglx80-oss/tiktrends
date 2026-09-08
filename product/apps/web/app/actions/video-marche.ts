'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import {
  grammaireVideo, resumeGrammaireVideo,
  normalizeHookType, normalizeOpeningType, normalizeTalent,
  type ObservationVideo, type LigneGrammaire,
} from '@tiktrends/core';

/**
 * La grammaire VIDÉO gagnante de la catégorie · la carte d'identité, côté vidéo.
 *
 * Les dimensions vidéo (accroche, ouverture, personne à l'écran) sont des
 * COLONNES sur les créas concurrentes analysées · pas besoin de lire le jsonb.
 * On les relit, on les agrège (`grammaireVideo`, noyau pur), et on rend les
 * lignes lisibles. Zéro dépense · on lit ce qui a déjà été décrit. Muette tant
 * que la catégorie n'a pas de créas vidéo analysées.
 *
 * Best-effort · une lecture en échec rend le vide, jamais une erreur bloquante.
 */

const LIMITE = 400;

export async function grammaireVideoAction(): Promise<{ lignes: LigneGrammaire[]; n: number }> {
  const s = await getSession();
  if (!s || !db) return { lignes: [], n: 0 };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { lignes: [], n: 0 };

  const rows = await db.select({
    hookType: schema.marketCreatives.hookType,
    openingType: schema.marketCreatives.openingType,
    talent: schema.marketCreatives.talent,
  })
    .from(schema.marketCreatives)
    .where(and(
      eq(schema.marketCreatives.workspaceId, s.workspaceId),
      eq(schema.marketCreatives.brandId, brand.id),
    ))
    .orderBy(desc(schema.marketCreatives.analyzedAt))
    .limit(LIMITE);
  if (!rows.length) return { lignes: [], n: 0 };

  const obs: ObservationVideo[] = rows.map((r) => ({
    hookType: normalizeHookType(r.hookType),
    openingType: normalizeOpeningType(r.openingType),
    talent: normalizeTalent(r.talent),
  }));
  const g = grammaireVideo(obs);
  return { lignes: resumeGrammaireVideo(g), n: g.n };
}
