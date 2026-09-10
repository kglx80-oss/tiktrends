import 'server-only';
import { and, count, eq, inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { journey, relance, type Journey, type Relance } from '@tiktrends/core';

/** Le parcours ET, le cas échéant, une relance douce sur une étape qui traîne. */
export interface ParcoursState {
  journey: Journey;
  relance: Relance | null;
}

/** Jours pleins écoulés depuis une date · null si absente. */
function joursDepuis(d: Date | null | undefined): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

/**
 * Où en est réellement cet espace sur le chemin.
 *
 * ── Chaque clé se lit dans la base, jamais dans une case cochée ──────────────
 *
 * Une checklist qu'on coche soi-même ment dès la première distraction. Ici une
 * étape est faite parce que la donnée existe · on ne peut pas se tromper sur son
 * propre état, et un nouveau membre de l'équipe voit la vérité, pas l'humeur de
 * celui qui a configuré avant lui.
 *
 * ── Ce que « renseignée » veut dire ──────────────────────────────────────────
 *
 * Pour la marque : une identité utilisable ET un produit. Le seuil est bas
 * volontairement · exiger la fiche parfaite ferait stagner quelqu'un qui a de
 * quoi générer.
 */
export async function onboardingState(workspaceId: string, canAdmin: boolean): Promise<ParcoursState> {
  const done = new Set<string>();
  if (!db) return { journey: journey(done, { canAdmin }), relance: null };

  const marques = await db.select({
    id: schema.brands.id,
    logoUrl: schema.brands.logoUrl, description: schema.brands.description,
    usp: schema.brands.usp, metaToken: schema.brands.metaToken,
    creativeRules: schema.brands.creativeRules,
    createdAt: schema.brands.createdAt,
  }).from(schema.brands).where(eq(schema.brands.workspaceId, workspaceId));

  if (!marques.length) return { journey: journey(done, { canAdmin }), relance: null };
  done.add('brand');

  // Depuis quand la plus ancienne marque existe · sert à mesurer un décrochage
  // au premier palier de valeur (marque posée, aucune créa générée).
  const joursDepuisMarque = marques
    .map((m) => joursDepuis(m.createdAt))
    .filter((n): n is number => n != null)
    .reduce<number | null>((max, n) => (max == null ? n : Math.max(max, n)), null);

  const ids = marques.map((m) => m.id);
  // Meta compte dès qu'UNE marque est branchée · le parcours décrit l'espace,
  // pas chaque marque prise séparément.
  if (marques.some((m) => m.metaToken)) done.add('meta');

  const [produits, generations, ads, lots, verdicts, presets, suivies, stats] = await Promise.all([
    db.select({ n: count() }).from(schema.products).where(inArray(schema.products.brandId, ids)),
    db.select({ n: count() }).from(schema.generations).where(inArray(schema.generations.brandId, ids)),
    db.select({ n: count() }).from(schema.ads).where(eq(schema.ads.workspaceId, workspaceId)),
    db.select({ n: count() }).from(schema.batches).where(inArray(schema.batches.brandId, ids)),
    db.select({ n: count() }).from(schema.verdicts)
      .where(and(eq(schema.verdicts.workspaceId, workspaceId), eq(schema.verdicts.status, 'validated'))),
    db.select({ n: count() }).from(schema.creativePresets)
      .where(and(eq(schema.creativePresets.workspaceId, workspaceId), eq(schema.creativePresets.archived, false))),
    db.select({ n: count() }).from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, workspaceId)),
    db.select({ n: count() }).from(schema.creatives)
      .where(and(inArray(schema.creatives.brandId, ids), isNotNull(schema.creatives.analysisModel))),
  ]);

  const n = (r: Array<{ n: number }>) => Number(r[0]?.n ?? 0);

  // Identité : de quoi générer autre chose que du générique. Le seuil est bas ·
  // exiger la fiche parfaite ferait stagner quelqu'un qui peut déjà avancer.
  const identifiee = marques.some((m) => (m.logoUrl || m.description || m.usp) && true);
  if (identifiee && n(produits) > 0) done.add('identity');

  if (n(generations) > 0) done.add('generate');
  if (n(ads) > 0) done.add('map');
  if (n(lots) > 0) done.add('batch');
  if (n(verdicts) > 0) done.add('verdict');
  if (n(presets) > 0) done.add('prompt');
  if (n(suivies) > 0) done.add('competitors');

  // La mémoire de Jarvis « s'allume » quand elle a de quoi dire quelque chose ·
  // trois créas décrites ET un verdict arbitré, sinon le tableau reste vide et
  // annoncer l'étape faite serait un mensonge visible dès le clic.
  if (n(stats) >= 3 && n(verdicts) > 0) done.add('memory');

  const j = journey(done, { canAdmin });
  return { journey: j, relance: relance(j, { joursDepuisMarque }) };
}
