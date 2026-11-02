import 'server-only';
import { sql, lireReferencesObjet, type BaseLectureReferences } from '@tiktrends/db';
import { RECENSEMENT_REFERENCES_STOCKAGE, formesRechercheesObjet, type ReferencesObjet } from '@tiktrends/core';
import { retirerDepotsSansLigne, objectKeyFromUrl, type StorageConfig } from '@tiktrends/integrations';

/**
 * Le VERROU d'un dépôt · un jeton de dépôt ne fait entrer son objet qu'une
 * fois (`packages/core/src/jeton-depot.ts`, « Réutilisation · NON »).
 *
 * « Déjà employé » se lit dans la base (une ligne cite déjà l'objet) · entre
 * cette lecture et l'écriture, deux requêtes concurrentes du même jeton
 * liraient toutes deux « aucune ligne ». Le verrou consultatif de transaction
 * (`pg_advisory_xact_lock`), pris sur la CLÉ d'objet, les met en file ·
 * la seconde lit la ligne de la première. Même clé de verrou pour la
 * Bibliothèque (envoi, remplacement) et la charte (logo), et pour le retrait
 * d'un dépôt de logo (un retrait ne lit pas « aucune » pendant qu'une autre
 * transaction s'apprête à citer l'objet).
 */

/** Prend le verrou du dépôt `cle` jusqu'à la fin de la transaction `tx`. */
export async function verrouDepot(tx: BaseLectureReferences, cle: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`depot:${cle}`}))`);
}

/** Les références d'une clé, lues DANS la transaction `tx` (après le verrou). */
export const referencesDans = (tx: BaseLectureReferences) => (cle: string): Promise<ReferencesObjet> =>
  lireReferencesObjet(tx, RECENSEMENT_REFERENCES_STOCKAGE, formesRechercheesObjet(cle));

/** La clé d'objet d'une adresse du stockage configuré · `null` hors stockage. */
export const cleDeDepot = (storage: StorageConfig, url: string): string | null => objectKeyFromUrl(storage, url);

/**
 * `retirerDepotsSansLigne` SOUS VERROU · chaque dépôt est verrouillé, puis ses
 * références relues dans la même transaction, avant la suppression.
 */
export async function retirerDepotsSousVerrou(
  base: { transaction<T>(f: (tx: BaseLectureReferences) => Promise<T>): Promise<T> },
  o: { storage: StorageConfig | null; workspaceId: string; deposes: readonly (string | null | undefined)[] },
) {
  const storage = o.storage;
  if (!storage) return [];
  const urls = [...new Set(o.deposes.filter((u): u is string => typeof u === 'string' && u.length > 0))];
  if (!urls.length) return [];
  return base.transaction(async (tx) => {
    for (const cle of [...new Set(urls.map((u) => cleDeDepot(storage, u)).filter((c): c is string => !!c))].sort()) await verrouDepot(tx, cle);
    return retirerDepotsSansLigne({ storage, workspaceId: o.workspaceId, deposes: urls, references: referencesDans(tx) });
  });
}
