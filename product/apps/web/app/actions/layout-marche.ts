'use server';

import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import {
  grammaireLayout, briefLayout, resumeGrammaire,
  normalizeHeadlinePosition, normalizeComposition, normalizeTextDensity, normalizeBackground,
  normalizeTypoRegister, normalizePalette,
  type ObservationLayout, type GrammaireLayout, type LigneGrammaire,
} from '@tiktrends/core';

/**
 * La grammaire de layout et de charte gagnante de la catégorie.
 *
 * ── Sans migration, sans dépense ─────────────────────────────────────────────
 *
 * #265/#268 rangent les dimensions (mise en page + charte) en clés structurées
 * dans le jsonb `analysis` des créas concurrentes analysées. Ce lecteur les
 * relit et les agrège (`grammaireLayout`, noyau pur). Aucune colonne à promouvoir,
 * aucun modèle appelé · on lit ce qui a déjà été décrit.
 *
 * Deux sorties, un seul calcul · la consigne pour la GÉNÉRATION (`briefLayout`,
 * anglais, injectée dans le prompt d'entière) et la carte d'identité pour
 * l'ÉCRAN (`resumeGrammaire`, français, montrée dans la Veille).
 *
 * Inerte tant que la catégorie n'a pas été décrite · c'est le lot market-learn
 * (payé, annoncé, cliqué par le propriétaire) qui remplit la donnée.
 *
 * Best-effort · une lecture en échec rend le vide, jamais une erreur bloquante.
 */

// On borne la lecture · au-delà, on ne lit pas plus de marché, on lit plus vieux.
const LIMITE = 400;

/** Lit et agrège · la grammaire de la catégorie active, ou `null` si rien à lire. */
async function grammaireCategorie(): Promise<GrammaireLayout | null> {
  const s = await getSession();
  if (!s || !db) return null;
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return null;

  const rows = await db.select({ analysis: schema.marketCreatives.analysis })
    .from(schema.marketCreatives)
    .where(and(
      eq(schema.marketCreatives.workspaceId, s.workspaceId),
      eq(schema.marketCreatives.brandId, brand.id),
    ))
    .orderBy(desc(schema.marketCreatives.analyzedAt))
    .limit(LIMITE);
  if (!rows.length) return null;

  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const obs: ObservationLayout[] = rows.map((r) => {
    const a = (r.analysis ?? {}) as Record<string, unknown>;
    return {
      headlinePosition: normalizeHeadlinePosition(str(a.headlinePosition)),
      composition: normalizeComposition(str(a.composition)),
      textDensity: normalizeTextDensity(str(a.textDensity)),
      background: normalizeBackground(str(a.background)),
      typoRegister: normalizeTypoRegister(str(a.typoRegister)),
      palette: normalizePalette(str(a.palette)),
    };
  });
  return grammaireLayout(obs);
}

/** La consigne de tendance pour la GÉNÉRATION · vide tant que rien ne domine. */
export async function tendancesLayoutMarcheAction(): Promise<string[]> {
  const g = await grammaireCategorie();
  return g ? briefLayout(g) : [];
}

/** La carte d'identité de la catégorie pour l'ÉCRAN · lignes lisibles + effectif. */
export async function grammaireCategorieAction(): Promise<{ lignes: LigneGrammaire[]; n: number }> {
  const g = await grammaireCategorie();
  return g ? { lignes: resumeGrammaire(g), n: g.n } : { lignes: [], n: 0 };
}
