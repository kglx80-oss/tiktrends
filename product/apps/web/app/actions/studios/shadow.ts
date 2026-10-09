'use server';

import { createHash } from 'node:crypto';
import { erreurStudio, MODES_IMAGE, type ErreurStudio, type ModeImage } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { modeleTexte, PROFILS_ROUTES_ANTHROPIC } from '../../../lib/studios/prompts/adaptateur';
import { requeteCompilationPas1 } from '../../../scripts/recette/devis';

/**
 * F1 · mode SHADOW (cahier 01 §14) · « résolution contexte/prompts sans nouvel
 * appel payant ».
 *
 * Reconstruit, À BLANC, la requête `image.compile` que la compilation
 * enverrait maintenant pour ce projet (même release, même résolution de
 * gabarit, même contexte, même compilation · `requeteCompilationPas1`, E2) :
 * aucun appel au modèle, aucune écriture (ni trace, ni réserve, ni audit).
 *
 * Capacité « shadow », COUPÉE par défaut (outil de recette interne) ;
 * permission `studio.read` dans la portée de l'espace. Ne rend JAMAIS le texte
 * compilé (il contient les prompts de la plateforme, cahier §12 : accès au
 * prompt compilé limité et tracé) : seulement sa FORME (modèle, profil, nombre
 * et taille des messages, empreinte, borne de coût), ce qui suffit à comparer
 * deux résolutions sur des données synthétiques.
 */

export interface ResolutionAblanc {
  modele: string;
  profil: string;
  messages: number;
  caracteres: number;
  /** sha256 des messages compilés · deux résolutions identiques ont la même. */
  empreinte: string;
  maxJetonsSortie: number;
  /** Borne de coût de l'appel qui N'A PAS été fait, en dollars. */
  borneUsd: number;
}

export async function resoudreCompilationAblanc(entree: { projectId: unknown; mode: unknown }): Promise<({ ok: true; resolution: ResolutionAblanc }) | ErreurStudio> {
  const g = await gardeStudio('studio.read', 'shadow');
  if (!g.ok) return g;
  if (typeof entree?.projectId !== 'string' || !MODES_IMAGE.includes(entree?.mode as ModeImage)) {
    return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId, violations: [{ chemin: 'mode', raison: `projet et mode attendus (${MODES_IMAGE.join(', ')})` }] });
  }
  const r = await requeteCompilationPas1(g.ctx, {
    projectId: entree.projectId, mode: entree.mode as ModeImage, maintenant: new Date(),
    modelePour: (p) => (PROFILS_ROUTES_ANTHROPIC.includes(p) ? modeleTexte() : null),
  });
  if (!r.ok) return erreurStudio('MISSING_REFERENCE', { traceId: g.ctx.traceId, message: `Résolution à blanc impossible · ${r.raison}. Rien n’a été appelé ni écrit.` });
  const q = r.requete;
  return {
    ok: true,
    resolution: {
      modele: q.modele, profil: q.profil, messages: q.messages.length,
      caracteres: q.messages.reduce((n, m) => n + m.contenu.length, 0),
      empreinte: createHash('sha256').update(JSON.stringify(q.messages)).digest('hex'),
      maxJetonsSortie: q.maxJetonsSortie, borneUsd: q.borneUsd,
    },
  };
}
