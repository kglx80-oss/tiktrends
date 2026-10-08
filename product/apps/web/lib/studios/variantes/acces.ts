import 'server-only';
import { coutMaxRelectureUsd } from '@tiktrends/core';
import { getSession } from '../../auth';
import { effectiveAccess } from '../../access';
import { canAccess, FEATURES } from '../../rbac';
import { adaptateurAnthropicGarde, modeleTexte } from '../prompts/adaptateur';
import { epinglerDevis } from '../prompts/resolveur';

/**
 * Accès annexes des commandes L4-C · relus à chaque appel, rien n'est pris du client.
 *
 *  · Adsmap est vendu à partir de l'offre Plus (`FEATURES` existant) : écrire une
 *    fiche de test exige cet accès, comme `adsmapGuard`. Aucun droit nouveau.
 *  · La relecture IA n'est annoncée disponible que si un fournisseur est
 *    configuré ET qu'une release de prompts est publiée ; sinon l'écran le dit.
 */

const ADSMAP = FEATURES.find((f) => f.key === 'adsmap')!;

export async function accesAdsmap(): Promise<boolean> {
  const s = await getSession();
  return !!s && canAccess(effectiveAccess(s), ADSMAP);
}

export interface EtatRelecture { disponible: boolean; raison: string | null; coutMaxUsd: number | null }

export async function etatRelecture(): Promise<EtatRelecture> {
  const coutMaxUsd = coutMaxRelectureUsd(modeleTexte());
  if (!adaptateurAnthropicGarde()) return { disponible: false, raison: 'Aucun fournisseur IA n’est configuré · la lecture des règles de mesure reste disponible, sans coût.', coutMaxUsd };
  const r = await epinglerDevis();
  if (!r.ok) return { disponible: false, raison: 'La relecture IA n’est pas encore activée (aucune release de prompts publiée) · la lecture des règles de mesure reste disponible, sans coût.', coutMaxUsd };
  return { disponible: true, raison: null, coutMaxUsd };
}
