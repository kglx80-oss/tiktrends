import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { faitsPortes, etatFait, versionFait, signatureFait, preuvePlusRecente, type ValidationFait, type FaitControle } from '@tiktrends/core';

/**
 * La preuve factuelle d'une pub, côté serveur · N04-suite.
 *
 * Le noyau décide (signature, complétude, caducité) · ici on lit la DERNIÈRE
 * preuve enregistrée pour chaque (rendu, fait) et on la confronte au contenu
 * ACTUEL de la pub. Une preuve dont la signature ne colle plus au contenu
 * ressort « caduque » sans qu'on ait touché à l'enregistrement · c'est la
 * lecture qui tranche, pas une écriture (l'historique approuvé reste intact).
 */

// Tous les champs texte que la génération a persistés dans `input` · le contrôle
// factuel les lit TOUS, pas seulement ceux du gabarit (CDC v8 · F02).
type Recette = {
  template?: string | null; headline?: string | null; quote?: string | null; badge?: string | null;
  subhead?: string | null; kicker?: string | null; cta?: string | null; benefits?: string[] | null;
};

/** La preuve ACTIVE (la plus récente) par (rendu, clé de fait), avec son validateur lisible. */
export async function chargerValidationsActives(
  generationIds: string[],
): Promise<Map<string, Map<string, ValidationFait>>> {
  const parGen = new Map<string, Map<string, ValidationFait>>();
  if (!db || !generationIds.length) return parGen;
  const rows = await db
    .select({
      id: schema.factValidations.id,
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
    // Défense · l'ordre SQL sur les ex æquo de date est indéfini · on tranche en
    // JS avec `preuvePlusRecente`, mais on aide déjà la base à ne pas les brasser.
    .orderBy(desc(schema.factValidations.validatedAt), desc(schema.factValidations.id));

  // On désigne l'active par la RÈGLE pure (date, puis id) plutôt que de faire
  // confiance à l'ordre que la base rend sur une égalité de date · deux preuves
  // du même fait au même instant donnaient sinon une active indéterminée.
  const actives = new Map<string, Map<string, { id: string; poseeA: number; r: (typeof rows)[number] }>>();
  for (const r of rows) {
    let m = actives.get(r.generationId);
    if (!m) { m = new Map(); actives.set(r.generationId, m); }
    const cand = { id: r.id, poseeA: (r.validatedAt as Date).getTime(), r };
    const cur = m.get(r.factCle);
    m.set(r.factCle, cur ? preuvePlusRecente(cur, cand) : cand);
  }

  for (const [genId, m] of actives) {
    const dst = new Map<string, ValidationFait>();
    for (const [cle, { r }] of m) {
      dst.set(cle, {
        source: r.source,
        // Le validateur reste identifié même si le compte a été retiré · on ne
        // laisse pas une preuve devenir anonyme et retomber « à vérifier ».
        validateur: (r.nom ?? r.email ?? 'validateur retiré').trim() || 'validateur retiré',
        date: (r.validatedAt as Date).toISOString(),
        version: r.version,
        signature: r.signature,
      });
    }
    parGen.set(genId, dst);
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
