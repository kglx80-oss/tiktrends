'use server';

import {
  preflightAcross, preflightLine, worthChecking, mechanismForTemplate, isStudioTemplate,
  TEMPLATE_LABEL, type Preflight, type PreflightOption, type StudioTemplate,
} from '@tiktrends/core';
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
 *
 * ── Le concept, pas seulement sa description ─────────────────────────────────
 *
 * On n'envoyait que le texte. `prelaunchScore` sait pourtant situer un
 * mécanisme et un format · les gabarits cochés juste au-dessus de la barre
 * étaient ignorés, et la seule réserve possible portait sur l'accroche.
 *
 * Un brief par gabarit envisagé, donc. Ça ne coûte rien de plus : la mémoire
 * d'une marque est lue une fois et mise en cache, les briefs suivants ne font
 * que du calcul.
 */
export interface PreflightRequest {
  text: string;
  /** Gabarits cochés dans le composeur · les inconnus sont ignorés. */
  templates?: string[];
  /**
   * Format de l'ad qui sortira.
   *
   * Seul `static` est transmis aujourd'hui, et c'est délibéré : la passerelle
   * Studio → ADSMAP n'écrit que des ads statiques, donc la dimension `format` de
   * la mémoire ne contient rien d'autre pour ces créas. Envoyer `video_ugc`
   * depuis le studio vidéo comparerait à une case vide en ayant l'air de
   * comparer à quelque chose.
   */
  format?: 'static';
}

/** Ce qu'on accepte du navigateur · le reste est écarté sans bruit. */
function gabarits(input: PreflightRequest): StudioTemplate[] {
  // Six au plus · au-delà, ce n'est plus un concept qu'on vérifie, et la liste
  // vient du navigateur.
  return [...new Set((input.templates ?? []).filter(isStudioTemplate))].slice(0, 6);
}

export async function preflightAction(input: PreflightRequest): Promise<{ line?: Preflight | null; error?: string }> {
  const s = await getSession();
  if (!s) return { line: null };
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { line: null };

  try {
    const { nAds } = await jarvisStats(brand.id, s.workspaceId);
    if (!worthChecking(input.text, nAds)) return { line: null };

    // La description tient lieu d'accroche candidate · c'est ce qui porte le
    // fait le plus dur (« cette formulation a déjà perdu ici »).
    const commun = {
      candidateHook: input.text.trim().slice(0, 300),
      format: input.format ?? null,
    };

    const choisis = gabarits(input);
    if (!choisis.length) {
      // Aucun gabarit coché · on en revient à ce qu'on faisait, la description
      // seule. Se taire ici serait pire : l'accroche réfutée resterait tue.
      return { line: preflightLine(await briefConceptBeforeLaunch(brand.id, s.workspaceId, commun)) };
    }

    const options: PreflightOption[] = await Promise.all(
      choisis.map(async (t) => ({
        label: TEMPLATE_LABEL[t],
        brief: await briefConceptBeforeLaunch(brand.id, s.workspaceId, {
          ...commun, mechanism: mechanismForTemplate(t),
        }),
      })),
    );
    return { line: preflightAcross(options) };
  } catch {
    // Une vérification qui échoue doit se taire · elle n'a jamais empêché de
    // lancer, elle ne va pas commencer par un message d'erreur.
    return { line: null };
  }
}
