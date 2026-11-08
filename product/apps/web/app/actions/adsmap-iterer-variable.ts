'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  lienPreparationIteration, lireValeurVariable, lireVariableChoisie, parentDepuisPlan, variablesIteration, verifierChoixVariable,
  RAISON_AUTRE_MARQUE, RAISON_HORS_PLAN, type TestedVariable,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { adsDeLaMarque } from '../../lib/adsmap-marque';
import { createIterationAction, iterationPlanAction } from './adsmap-iterate';

/**
 * Créer l’itération d’une gagnante en CHOISISSANT la variable (écran Itérer,
 * étape « Ce qu’on change »).
 *
 * Rien de neuf n’écrit ici · on rejoue les gardes existantes, puis on délègue
 * à `createIterationAction` (ad en brouillon, arête de filiation) :
 *  · `adsmapGuard({ minRole: 'member' })` · la garde de la création d’itération ;
 *  · la marque active (`adsDeLaMarque`) · une pub d’une autre marque est refusée ;
 *  · le plan d’itération RÉEL de la marque (`iterationPlanAction`, verdicts
 *    arbitrés seulement) · la règle du noyau (`variablesIteration`) décide si la
 *    variable est admise, et la raison du refus est la même qu’à l’écran ;
 *  · UNE variable · un choix multiple est refusé (`lireVariableChoisie`).
 * Aucun appel à un modèle, aucun débit · le devis de génération reste celui du
 * projet, calculé par le serveur avant tout lancement.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReponseIterationChoisie =
  | { ok: true; adId: string; code: string; variable: TestedVariable; valeur: string; preparer: string }
  | { ok: false; error: string };

export async function creerIterationChoisieAction(entree: { parentAdId: unknown; variable: unknown; valeur: unknown; hypothese: unknown }): Promise<ReponseIterationChoisie> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { ok: false, error: g.error };

  const parentAdId = typeof entree?.parentAdId === 'string' && UUID.test(entree.parentAdId) ? entree.parentAdId.toLowerCase() : null;
  if (!parentAdId) return { ok: false, error: 'Pub introuvable.' };
  const v = lireVariableChoisie(entree.variable);
  if (!v.ok) return { ok: false, error: v.raison };
  const valeur = lireValeurVariable(entree.valeur);
  if (!valeur.ok) return { ok: false, error: valeur.raison };

  if (!(await adsDeLaMarque(g.s.workspaceId, g.brand.id, [parentAdId])).has(parentAdId)) return { ok: false, error: RAISON_AUTRE_MARQUE };

  const plan = await iterationPlanAction();
  if (plan.error || !plan.view) return { ok: false, error: plan.error ?? 'Le plan d’itération n’a pas pu être lu · réessaie.' };
  const parent = parentDepuisPlan(plan.view.rows, parentAdId);
  if (!parent) return { ok: false, error: RAISON_HORS_PLAN };
  const choix = verifierChoixVariable(variablesIteration(parent), parent, v.variable);
  if (!choix.ok) return { ok: false, error: choix.raison };

  const r = await createIterationAction({
    parentAdId, mode: choix.mode, changedVariable: v.variable, stageTargeted: choix.etape,
    hypothesis: typeof entree.hypothese === 'string' ? entree.hypothese : '', variableValue: valeur.valeur,
  });
  if (r.error || !r.adId) return { ok: false, error: r.error ?? 'La création n’a rien renvoyé.' };

  const [enfant] = await db!.select({ code: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.id, r.adId)).limit(1);
  const code = enfant?.code ?? 'nouvelle';
  return { ok: true, adId: r.adId, code, variable: v.variable, valeur: valeur.valeur, preparer: lienPreparationIteration({ parentAdId, code, variable: v.variable, valeur: valeur.valeur }) };
}
