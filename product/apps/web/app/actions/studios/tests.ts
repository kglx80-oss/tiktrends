'use server';

import { erreurStudio, type ErreurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { rattacherVarianteAuTest as rattacherCmd, type LienPresente } from '../../../lib/studios/variantes/tests';
import {
  lireApprentissage as lireCmd, relireApprentissage as relireCmd, type LectureDuTest, type ResultatRelecture,
} from '../../../lib/studios/variantes/apprentissage';
import { accesAdsmap } from '../../../lib/studios/variantes/acces';
import { preparerLotEssai as preparerCmd } from '../../../lib/studios/variantes/essai';
import type { PlanLotEssai } from '@tiktrends/core';
import { adaptateurAnthropicGarde, modeleTexte } from '../../../lib/studios/prompts/adaptateur';
import { environnementPrompts } from '../../../lib/studios/prompts/environnement';

/**
 * Tests et apprentissage (plan 06 §3 `linkVariantToTest`, cahier 01 §4.8).
 *
 *  · `rattacherVarianteAuTest` · relie une variante précise à une fiche Adsmap
 *    (relue ou créée en brouillon), idempotent ; exige l'accès Adsmap existant ;
 *  · `lireApprentissage` · LECTURE PURE, règles de mesure Adsmap, sans coût ;
 *  · `relireApprentissage` · tâche `learning.review` par le résolveur unique,
 *    sous la barrière de dépense, coût annoncé avant le clic et revérifié ;
 *  · `preparerLotEssai` · LECTURE PURE · un lot d'essai (une seule variable :
 *    accroche, mise en page ou ambiance) sur des variantes existantes, sans
 *    génération ni coût, et la saisie à reprendre au rattachement.
 */

type Reponse<T> = ({ ok: true } & T) | ErreurStudio;

export async function rattacherVarianteAuTest(entree: { variantId: unknown; saisie: unknown }): Promise<Reponse<{ lien: LienPresente; deja: boolean }>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  if (!(await accesAdsmap())) {
    return erreurStudio('FORBIDDEN', { traceId: g.ctx.traceId, message: 'Le rattachement à un test passe par Adsmap, disponible à partir de l’offre Plus.' });
  }
  return rattacherCmd(g.ctx, { variantId: entree?.variantId, saisie: entree?.saisie });
}

export async function lireApprentissage(entree: { linkId?: unknown; variantId?: unknown }): Promise<Reponse<{ test: LectureDuTest }>> {
  const g = await gardeStudio('studio.read', 'projets');
  if (!g.ok) return g;
  return lireCmd(g.ctx, { linkId: entree?.linkId, variantId: entree?.variantId });
}

export async function relireApprentissage(entree: { linkId: unknown; coutAnnonceUsd: unknown; notes?: unknown }): Promise<Reponse<ResultatRelecture>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  return relireCmd(g.ctx, { linkId: entree?.linkId, coutAnnonceUsd: entree?.coutAnnonceUsd, notes: entree?.notes }, {
    adaptateur: adaptateurAnthropicGarde(),
    environnement: environnementPrompts(process.env),
    modele: modeleTexte(),
  });
}

export async function preparerLotEssai(entree: { projectId: unknown; variable: unknown; variantIds: unknown }): Promise<Reponse<{ plan: PlanLotEssai }>> {
  const g = await gardeStudio('studio.propose', 'projets');
  if (!g.ok) return g;
  return preparerCmd(g.ctx, { projectId: entree?.projectId, variable: entree?.variable, variantIds: entree?.variantIds }, { adsmapAcces: await accesAdsmap() });
}
