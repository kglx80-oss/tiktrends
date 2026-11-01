import { sql } from 'drizzle-orm';

/**
 * Stockage · une clé d'objet du bucket est-elle encore citée par une ligne ? ·
 * LA lecture, commune au site et au worker, avant de retirer un dépôt dont
 * l'écriture a échoué (règle `decisionRetraitDepot`, noyau
 * `retrait-depot.ts`).
 *
 * Parcourt chaque colonne recensée (`RECENSEMENT_REFERENCES_STOCKAGE`,
 * passé par l'appelant · ce paquet ne dépend pas du noyau) et cherche chaque
 * forme de la clé (`formesRechercheesObjet`) en sous-chaîne exacte
 * (`strpos`, sans joker), en minuscules. Rend :
 *  - `referencee` dès qu'une ligne la cite (arrêt immédiat) ;
 *  - `inconnue` si une colonne n'a pas pu être lue (nom invalide, requête en
 *    échec) ou si rien n'est à chercher · le doute garde l'objet ;
 *  - `aucune` seulement quand TOUTES les colonnes ont été lues sans la trouver.
 */

export interface ColonneReference { table: string; colonne: string; forme: 'texte' | 'tableau' | 'json' }
export type LectureReferencesObjet = 'aucune' | 'referencee' | 'inconnue';

/** Le client minimal · `execute` d'un client drizzle (postgres-js ou pglite). */
export interface BaseLectureReferences { execute(q: ReturnType<typeof sql>): Promise<unknown> }

const NOM_SQL = /^[a-z_][a-z0-9_]*$/;

function expression(c: ColonneReference) {
  const col = sql.identifier(c.colonne);
  if (c.forme === 'tableau') return sql`array_to_string(${col}, ' ')`;
  if (c.forme === 'json') return sql`${col}::text`;
  return col;
}

const lignes = (r: unknown): unknown[] => (Array.isArray(r) ? r : ((r as { rows?: unknown[] })?.rows ?? []));

export async function lireReferencesObjet(base: BaseLectureReferences, colonnes: readonly ColonneReference[], formes: readonly string[]): Promise<LectureReferencesObjet> {
  const cherchees = formes.filter((f) => typeof f === 'string' && f.length > 0).map((f) => f.toLowerCase());
  if (!cherchees.length || !colonnes.length) return 'inconnue';
  let inconnue = false;
  for (const c of colonnes) {
    if (!NOM_SQL.test(c.table) || !NOM_SQL.test(c.colonne)) { inconnue = true; continue; }
    const e = expression(c);
    const conditions = sql.join(cherchees.map((f) => sql`strpos(lower(${e}), ${f}) > 0`), sql` or `);
    try {
      const r = await base.execute(sql`select 1 as x from ${sql.identifier(c.table)} where ${conditions} limit 1`);
      if (lignes(r).length > 0) return 'referencee';
    } catch {
      inconnue = true;
    }
  }
  return inconnue ? 'inconnue' : 'aucune';
}
