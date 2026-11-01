import { cleDuDepot, decisionRetraitDepot, type DecisionRetraitDepot, type ReferencesObjet } from '@tiktrends/core';
import { basePubliqueStockage, deleteObjectByUrl, type StorageConfig } from './storage';

/**
 * Stockage · écrire en base APRÈS un dépôt, et retirer ce dépôt si l'écriture
 * échoue · le geste, commun à tous les chemins `retrait_si_echec`
 * (`CHEMINS_DEPOT_PUIS_ECRITURE`, noyau `retrait-depot.ts`).
 *
 * La lecture des références est injectée (`references`) · le site et le
 * worker passent `lireReferencesObjet` sur LEUR base et le recensement du
 * noyau. Le retrait passe par `deleteObjectByUrl` (refus hors espace, aucune
 * requête). Tout est au mieux : un retrait qui échoue laisse l'objet, compté
 * par l'inventaire · il ne masque jamais l'erreur d'écriture, qui remonte
 * telle quelle.
 */

/** Lit les références d'UNE clé du bucket dans les colonnes recensées. */
export type LecteurReferencesObjet = (cle: string) => Promise<ReferencesObjet>;

export interface RetraitDepot { url: string; decision: DecisionRetraitDepot; retire: boolean }

/** Retire les objets déposés par CE chemin que plus aucune ligne ne cite · jamais d'exception. */
export async function retirerDepotsSansLigne(o: {
  storage: StorageConfig | null; workspaceId: string; deposes: readonly (string | null | undefined)[]; references: LecteurReferencesObjet;
}): Promise<RetraitDepot[]> {
  const out: RetraitDepot[] = [];
  if (!o.storage) return out;
  const base = basePubliqueStockage(o.storage);
  for (const url of new Set(o.deposes.filter((u): u is string => typeof u === 'string' && u.length > 0))) {
    const cle = cleDuDepot(url, base, o.workspaceId);
    let refs: ReferencesObjet = 'inconnue';
    if (cle) { try { refs = await o.references(cle); } catch { refs = 'inconnue'; } }
    const decision = decisionRetraitDepot(cle, refs);
    let retire = false;
    if (decision.retirer) { try { retire = await deleteObjectByUrl(o.storage, url, o.workspaceId); } catch { retire = false; } }
    out.push({ url, decision, retire });
  }
  return out;
}

/**
 * Exécute `ecrire` · s'il échoue, retire les `deposes` sans ligne
 * (`retirerDepotsSansLigne`), puis relance L'erreur d'origine.
 */
export async function ecrireApresDepot<T>(o: {
  storage: StorageConfig | null; workspaceId: string; deposes: readonly (string | null | undefined)[]; references: LecteurReferencesObjet;
  ecrire: () => Promise<T>;
}): Promise<T> {
  try {
    return await o.ecrire();
  } catch (e) {
    try { await retirerDepotsSansLigne(o); } catch { /* au mieux · l'erreur d'écriture prime */ }
    throw e;
  }
}
