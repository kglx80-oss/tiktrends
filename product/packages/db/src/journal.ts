/**
 * Combien de migrations ce build embarque.
 *
 * ── Pourquoi un nombre écrit à la main ───────────────────────────────────────
 *
 * Le journal (`drizzle/meta/_journal.json`) est la source · mais l'importer
 * depuis l'application ferait dépendre un bundle de navigateur d'un fichier de
 * migrations. On recopie donc le compte, et **un test le compare au journal** ·
 * c'est le doublon rattrapé au bon endroit, pas dans un commentaire.
 *
 * À incrémenter en même temps qu'une migration est ajoutée. Le test échoue
 * sinon, en disant quoi écrire.
 */
export const MIGRATIONS_IN_BUILD = 46;
