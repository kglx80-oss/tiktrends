'use server';

import { preflightLine, worthChecking, type Preflight } from '@tiktrends/core';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { briefConceptBeforeLaunch, jarvisStats } from '../../lib/jarvis-memory';

/**
 * Ce que la mémoire dit avant de payer la génération.
 *
 * ── Coût nul, et c'est la condition ──────────────────────────────────────────
 *
 * Aucun appel modèle · le brief de pré-lancement est calculé depuis les
 * verdicts arbitrés de la marque. Une vérification qui dépense à chaque frappe
 * serait coupée dans la semaine, et à raison.
 *
 * ── Le silence est la réponse par défaut ─────────────────────────────────────
 *
 * On ne répond quelque chose que quand la mémoire a une réserve précise. Ni le
 * texte trop court, ni la marque sans tests mesurés ne déclenchent la moindre
 * lecture · la barre reste muette, ce qui est exactement ce qu'on veut.
 */
export async function preflightAction(input: { text: string }): Promise<{ line?: Preflight | null; error?: string }> {
  const s = await getSession();
  if (!s) return { line: null };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { line: null };

  try {
    const { nAds } = await jarvisStats(brand.id, s.workspaceId);
    if (!worthChecking(input.text, nAds)) return { line: null };

    const brief = await briefConceptBeforeLaunch(brand.id, s.workspaceId, {
      // La description tient lieu d'accroche candidate · c'est le seul signal
      // disponible au moment où l'on écrit, et c'est celui qui porte le fait le
      // plus dur (« cette formulation a déjà perdu ici »).
      candidateHook: input.text.trim().slice(0, 300),
    });
    return { line: preflightLine(brief) };
  } catch {
    // Une vérification qui échoue doit se taire · elle n'a jamais empêché de
    // lancer, elle ne va pas commencer par un message d'erreur.
    return { line: null };
  }
}
