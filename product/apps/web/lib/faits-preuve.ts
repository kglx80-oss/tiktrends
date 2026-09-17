import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { faitsPortes, etatFait, versionFait, signatureFait, type ValidationFait, type FaitControle } from '@tiktrends/core';

/**
 * La preuve factuelle d'une pub, côté serveur · N04-suite.
 *
 * Le noyau décide (signature, complétude, caducité) · ici on lit la DERNIÈRE
 * preuve enregistrée pour chaque (rendu, fait) et on la confronte au contenu
 * ACTUEL de la pub. Une preuve dont la signature ne colle plus au contenu
 * ressort « caduque » sans qu'on ait touché à l'enregistrement · c'est la
 * lecture qui tranche, pas une écriture (l'historique approuvé reste intact).
 */

type Recette = { template?: string | null; headline?: string | null; quote?: string | null; badge?: string | null };

/** La preuve ACTIVE (la plus récente) par (rendu, clé de fait), avec son validateur lisible. */
export async function chargerValidationsActives(
  generationIds: string[],
): Promise<Map<string, Map<string, ValidationFait>>> {
  const parGen = new Map<string, Map<string, ValidationFait>>();
  if (!db || !generationIds.length) return parGen;
  const rows = await db
    .select({
      generationId: schema.factValidations.generationId,
      factCle: schema.factValidations.factCle,
      source: schema.factValidations.source,
      signature: schema.factValidations.signature,
      version: schema.factValidations.version,
      validatedAt: schema.factValidations.validatedAt,
      nom: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.factValidations)
    .leftJoin(schema.users, eq(schema.factValidations.validatedBy, schema.users.id))
    .where(inArray(schema.factValidations.generationId, generationIds))
    .orderBy(desc(schema.factValidations.validatedAt));
  // Trié du plus récent au plus ancien · la première vue pour un (rendu, fait)
  // est l'active · les suivantes sont l'historique, qu'on ne survend pas.
  for (const r of rows) {
    let m = parGen.get(r.generationId);
    if (!m) { m = new Map(); parGen.set(r.generationId, m); }
    if (m.has(r.factCle)) continue;
    m.set(r.factCle, {
      source: r.source,
      // Le validateur reste identifié même si le compte a été retiré · on ne
      // laisse pas une preuve devenir anonyme et retomber « à vérifier ».
      validateur: (r.nom ?? r.email ?? 'validateur retiré').trim() || 'validateur retiré',
      date: (r.validatedAt as Date).toISOString(),
      version: r.version,
      signature: r.signature,
    });
  }
  return parGen;
}

/** Les faits d'une pub, chacun avec son état confronté à sa dernière preuve. */
export function faitsAvecEtat(rec: Recette, validations?: Map<string, ValidationFait>): FaitControle[] {
  return faitsPortes(rec).map((f) => {
    const v = validations?.get(f.cle) ?? null;
    const etat = etatFait(f.contenu, v);
    return {
      cle: f.cle,
      label: f.label,
      etat,
      source: v?.source ?? null,
      validateur: v?.validateur ?? null,
      date: v?.date ?? null,
      // Une version vérifiée montre la version validée ; une caduque montre la
      // version ACTUELLE (celle qui ne colle plus), pour dire ce qui a bougé.
      version: etat === 'invalidee' ? versionFait(signatureFait(f.contenu)) : (v?.version ?? null),
    };
  });
}

/** Le contenu exact d'un fait donné d'une pub · sert à signer une validation. */
export function contenuFait(rec: Recette, factCle: string): string | null {
  return faitsPortes(rec).find((f) => f.cle === factCle)?.contenu ?? null;
}

/** Vérifie qu'un rendu appartient bien à la marque active · isolation. */
export async function renduDeLaMarque(id: string, brandId: string): Promise<Recette | null> {
  if (!db) return null;
  const [g] = await db
    .select({ input: schema.generations.input })
    .from(schema.generations)
    .where(and(eq(schema.generations.id, id), eq(schema.generations.brandId, brandId), eq(schema.generations.kind, 'ad')))
    .limit(1);
  return g ? ((g.input ?? {}) as Recette) : null;
}
