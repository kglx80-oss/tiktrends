'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@tiktrends/db';
import {
  lienPreparationInspiration, lienPreparationIteration, lireInspiration, lireValeurVariable, lireVariableChoisie, parentDepuisPlan, parentInspiration,
  refOrigineHypothese, refSourceVeille, variablesIteration, verifierChoixVariable,
  RAISON_AUTRE_MARQUE, RAISON_DEUX_SOURCES, RAISON_HORS_PLAN, RAISON_VEILLE_AUTRE_MARQUE, RAISON_VEILLE_NON_GARDEE, type TestedVariable,
} from '@tiktrends/core';
import { adsmapGuard, type AdsMapGuardOk } from '../../lib/adsmap-guard';
import { adsDeLaMarque } from '../../lib/adsmap-marque';
import { nextVariant } from '../../lib/adsmap-path';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { trackSavedAdAction } from './adsmap-bridge';
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
 *
 * ── Depuis une pub de la Veille (VB F26) · ajout, le contrat ne change pas ──
 *
 * `inspiration: { platform, externalId }` à la place de `parentAdId` · la pub
 * concurrente est une SOURCE, pas une ad de la marque · rien n'est écrit sur sa
 * sauvegarde. Ce qui naît est une ad en brouillon de la marque ACTIVE, dans le
 * concept « imitation » du pont existant (`trackSavedAdAction`, provenance
 * Veille sur le concept), avec la variable remplacée, sa valeur, l'hypothèse et
 * la provenance Veille sur l'ad (`refOrigineHypothese`, comme une hypothèse née
 * de la Veille). La règle des variables est la même (`variablesIteration`,
 * source sans verdict · `parentInspiration`). Pas d'arête de filiation · il n'y
 * a pas de parent dans la marque. Mêmes gardes, aucune nouvelle permission.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReponseIterationChoisie =
  | { ok: true; adId: string; code: string; variable: TestedVariable; valeur: string; preparer: string }
  | { ok: false; error: string };

export async function creerIterationChoisieAction(entree: {
  parentAdId?: unknown; variable: unknown; valeur: unknown; hypothese: unknown;
  /** Une pub de la Veille en source, à la place de `parentAdId` (VB F26). */
  inspiration?: unknown;
}): Promise<ReponseIterationChoisie> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return { ok: false, error: g.error };
  if (entree?.inspiration !== undefined) {
    if (entree.parentAdId !== undefined) return { ok: false, error: RAISON_DEUX_SOURCES };
    return depuisVeille(g, entree);
  }

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

/** Le geste existant de `createIterationAction` · une hypothèse qui ne dit rien n'apprend rien. */
const HYPOTHESE_REQUISE = 'Écris l’hypothèse : sans elle, le résultat de ce test n’apprendra rien à personne.';

async function depuisVeille(g: AdsMapGuardOk, entree: { inspiration?: unknown; variable: unknown; valeur: unknown; hypothese: unknown }): Promise<ReponseIterationChoisie> {
  const src = lireInspiration(entree.inspiration);
  if (!src.ok) return { ok: false, error: src.raison };
  const v = lireVariableChoisie(entree.variable);
  if (!v.ok) return { ok: false, error: v.raison };
  const valeur = lireValeurVariable(entree.valeur);
  if (!valeur.ok) return { ok: false, error: valeur.raison };
  const hypothese = typeof entree.hypothese === 'string' ? entree.hypothese.replace(/\s+/g, ' ').trim().slice(0, 900) : '';
  if (hypothese.length < 10) return { ok: false, error: HYPOTHESE_REQUISE };

  const ws = g.s.workspaceId;
  try {
    // La sauvegarde, lue dans l'espace · de la marque ACTIVE ou sans marque (même porte que `creerHypotheseAction`).
    const [sauvee] = await db!.select({ id: schema.savedAds.id, brandId: schema.savedAds.brandId, snapshot: schema.savedAds.snapshot })
      .from(schema.savedAds)
      .where(and(eq(schema.savedAds.workspaceId, ws), eq(schema.savedAds.platform, src.ref.platform), eq(schema.savedAds.externalId, src.ref.externalId)))
      .limit(1);
    if (!sauvee) return { ok: false, error: RAISON_VEILLE_NON_GARDEE };
    if (sauvee.brandId && sauvee.brandId !== g.brand.id) return { ok: false, error: RAISON_VEILLE_AUTRE_MARQUE };

    const parent = parentInspiration(`${src.ref.platform}:${src.ref.externalId}`);
    const choix = verifierChoixVariable(variablesIteration(parent), parent, v.variable);
    if (!choix.ok) return { ok: false, error: choix.raison };

    const snap = (sauvee.snapshot ?? {}) as { advertiserName?: string; id?: string; mediaType?: string };
    const annonceur = snap.advertiserName?.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Annonceur';
    const pont = await trackSavedAdAction({ platform: src.ref.platform, externalId: src.ref.externalId });
    if (pont.error || !pont.conceptId) return { ok: false, error: pont.error ?? 'Rattachement impossible.' };

    const champs = {
      hypothesis: hypothese, testedVariable: v.variable, variableValue: valeur.valeur, status: 'draft' as const,
      sourceRef: refOrigineHypothese({ type: 'veille', annonceur, savedAdId: sauvee.id }),
    };
    let adId = pont.adId ?? null;
    if (adId) {
      await db!.update(schema.ads).set({ ...champs, updatedAt: new Date() }).where(and(eq(schema.ads.id, adId), eq(schema.ads.workspaceId, ws)));
    } else {
      // Le concept de cette pub existait · une itération de plus en est une nouvelle variante.
      const [ad] = await db!.insert(schema.ads).values({
        workspaceId: ws, conceptId: pont.conceptId, variantCode: await nextVariant(pont.conceptId),
        format: 'video_ugc', adType: 'imitation', platform: src.ref.platform === 'tiktok' ? 'tiktok' : 'meta', ...champs,
      }).returning({ id: schema.ads.id });
      adId = ad?.id ?? null;
    }
    if (!adId) return { ok: false, error: 'La création n’a rien renvoyé.' };
    const [enfant] = await db!.select({ code: schema.ads.variantCode }).from(schema.ads).where(eq(schema.ads.id, adId)).limit(1);
    const code = enfant?.code ?? 'nouvelle';
    invalidateJarvisMemory(g.brand.id);
    revalidatePath('/adsmap/hypotheses');
    return {
      ok: true, adId, code, variable: v.variable, valeur: valeur.valeur,
      preparer: lienPreparationInspiration({
        savedAdId: sauvee.id, source: refSourceVeille({ platform: src.ref.platform, id: snap.id ?? src.ref.externalId, advertiserName: snap.advertiserName }),
        video: (snap.mediaType ?? '').toLowerCase().includes('vid'), code, variable: v.variable, valeur: valeur.valeur,
      }),
    };
  } catch (e) {
    return { ok: false, error: logAndTranslate('adsmap:iteration-veille', e, { subject: 'la création de l’itération', workspaceId: ws }) };
  }
}
