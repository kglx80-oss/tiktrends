import { db, lireReferencesObjet } from '@tiktrends/db';
import { RECENSEMENT_REFERENCES_STOCKAGE, formesRechercheesObjet, type ReferencesObjet } from '@tiktrends/core';

/**
 * Les références d'UNE clé du bucket, lues sur la base du site dans TOUTES les
 * colonnes recensées (`RECENSEMENT_REFERENCES_STOCKAGE`) · le lecteur que les
 * chemins « dépôt puis écriture » passent à `ecrireApresDepot`. Sans base :
 * `inconnue`, donc rien n'est retiré.
 */
export async function referencesObjetEnBase(cle: string): Promise<ReferencesObjet> {
  if (!db) return 'inconnue';
  return lireReferencesObjet(db, RECENSEMENT_REFERENCES_STOCKAGE, formesRechercheesObjet(cle));
}
