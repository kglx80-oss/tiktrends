import 'server-only';
import { contradictionsDuDevis, messageRefusDevis, erreurStudio, type ContenuVersion, type ErreurStudio, type LigneDevis } from '@tiktrends/core';
import type { ContexteStudio } from '../garde';

/**
 * L6-B · contrôle des identités AVANT devis (recette VIDEO-02).
 *
 * Appelé en UN point de `creerDevis` (L3), dans sa transaction, avant tout
 * insert : une contradiction entre une fiche d'identité et un plan dont une
 * opération du devis dépend ⇒ `INVARIANT_CONFLICT`, rien n'est écrit (ni plan
 * d'impact, ni devis, ni audit) et rien ne peut donc être approuvé ni débité.
 * Le message nomme le plan, la fiche et la marche à suivre ; les cibles sont
 * le plan et l'identité (même portée que le projet, déjà relu).
 */
export function refusIdentitesDevis(ctx: ContexteStudio, contenu: ContenuVersion, lignes: readonly LigneDevis[]): ErreurStudio | null {
  const k = contradictionsDuDevis(contenu, lignes.map((l) => l.operation));
  if (k.length === 0) return null;
  return erreurStudio('INVARIANT_CONFLICT', {
    traceId: ctx.traceId,
    targetIds: [...new Set(k.flatMap((x) => [x.shotId, x.identityId]))],
    message: messageRefusDevis(k),
  });
}
