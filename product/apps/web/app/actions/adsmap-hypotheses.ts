'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@tiktrends/db';
import {
  inferMechanism, refOrigineHypothese, validerSaisieHypothese,
  type OrigineHypotheseLibre, type SaisieHypotheseLibre,
} from '@tiktrends/core';
import { adsmapGuard } from '../../lib/adsmap-guard';
import { ensureGraphPath, nextVariant } from '../../lib/adsmap-path';
import { logAndTranslate } from '../../lib/error-log';
import { invalidateJarvisMemory } from '../../lib/jarvis-memory';
import { trackSavedAdAction } from './adsmap-bridge';

/**
 * Hypothèses LIBRES (lot 1 V5) · écrire une hypothèse sans passer par un test
 * arbitré · à partir de rien, d'une pub de la Veille, d'une accroche de persona
 * ou d'un apprentissage. Elle entre dans « À formuler » du tableau des
 * hypothèses (`cartesHypotheses`).
 *
 * ── Ce qu'est une hypothèse, ici ─────────────────────────────────────────────
 *
 * Aucune entité nouvelle · comme partout dans l'outil, une hypothèse est le
 * texte porté par une ad (`adsmap_ads.hypothesis`, avec `tested_variable`) · une
 * hypothèse libre est une ad en BROUILLON de son concept. La phrase, sa
 * complétude et la validation sont au noyau (`validerSaisieHypothese`) · la
 * provenance est gardée sur l'ad (`source_ref_json.hypotheseLibre`).
 *
 * ── Droits ───────────────────────────────────────────────────────────────────
 *
 * Exactement la garde de `createIterationAction` · `adsmapGuard({ minRole:
 * 'member' })` (formule Plus, rôle membre, marque ACTIVE). Tout ce qui est
 * désigné (persona, sauvegarde, apprentissage, ad) est relu dans la marque
 * active de la session · une référence d'une autre marque est refusée,
 * jamais rattachée en silence.
 *
 * ── Dépense ──────────────────────────────────────────────────────────────────
 *
 * 0 $ · aucun modèle n'est appelé. Le pont Veille (`trackSavedAdAction`) ne fait
 * qu'écrire et lire des statistiques (`briefConceptBeforeLaunch`, pur).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const PLATEFORMES = new Set(['meta', 'tiktok', 'google']);

/** D'où part l'hypothèse · ce que l'écran désigne, relu côté serveur. */
export type SourceHypothese =
  | { type: 'libre' }
  | { type: 'veille'; platform: string; externalId: string }
  | { type: 'persona'; personaId: string; accroche?: string | null }
  | { type: 'apprentissage'; learningId: string };

export interface ResultatHypothese { ok?: true; adId?: string; error?: string }

/** Le chemin de rangement par défaut · provisoire, « proposé », que l'humain corrige (comme `ensureGraphPath`). */
const DESIR_HYPOTHESES = 'À qualifier (hypothèses)';
const ANGLE_HYPOTHESES = 'Hypothèses libres';

const pas = (e: string): ResultatHypothese => ({ error: e });

/**
 * Crée une hypothèse libre · ad en brouillon, rangée dans « À formuler ».
 *
 * Réutilisable telle quelle depuis un autre écran · le lot 3 (Apprentissages ·
 * « En tirer une hypothèse ») appelle `creerHypotheseAction({ source: { type:
 * 'apprentissage', learningId }, saisie })`, avec la phrase de départ du noyau
 * (`departDepuisApprentissage`), et le formulaire `FormulaireHypothese`
 * (`spatial/vues/resultats/hypothese-client.tsx`).
 */
export async function creerHypotheseAction(input: { source: SourceHypothese; saisie: SaisieHypotheseLibre }): Promise<ResultatHypothese> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return pas(g.error);

  const v = validerSaisieHypothese(input?.saisie ?? {});
  if (!v.ok) return pas(v.erreur);
  const src = input?.source as SourceHypothese | undefined;

  try {
    const ws = g.s.workspaceId;
    const brandId = g.brand.id;
    const champs = {
      hypothesis: v.texte,
      testedVariable: v.variable,
      iceImpact: v.estimation.impact, iceConfidence: v.estimation.confiance, iceEffort: v.estimation.effort,
      status: 'draft' as const,
    };

    /* ── Veille · le pont existant fait le concept « imitation » ── */
    if (src?.type === 'veille') {
      if (typeof src.platform !== 'string' || !PLATEFORMES.has(src.platform) || typeof src.externalId !== 'string' || !src.externalId || src.externalId.length > 300) {
        return pas('Pub de la Veille illisible · rouvre-la puis réessaie.');
      }
      // La sauvegarde est cherchée dans l'espace · elle doit être de la marque ACTIVE
      // (ou sans marque) · une pub gardée pour une autre marque n'y entre pas.
      const [sauvee] = await db!.select({ id: schema.savedAds.id, brandId: schema.savedAds.brandId, snapshot: schema.savedAds.snapshot })
        .from(schema.savedAds)
        .where(and(eq(schema.savedAds.workspaceId, ws), eq(schema.savedAds.platform, src.platform), eq(schema.savedAds.externalId, src.externalId)))
        .limit(1);
      if (!sauvee) return pas('Garde d’abord la pub dans tes sauvegardes · l’hypothèse en garde la source.');
      if (sauvee.brandId && sauvee.brandId !== brandId) return pas('Cette pub est sauvegardée pour une autre marque de l’espace · ouvre cette marque pour en faire une hypothèse.');

      const pont = await trackSavedAdAction({ platform: src.platform, externalId: src.externalId });
      if (pont.error || !pont.conceptId) return pas(pont.error ?? 'Rattachement impossible.');
      const annonceur = ((sauvee.snapshot ?? {}) as { advertiserName?: string }).advertiserName?.trim() || 'Annonceur';
      const origine: OrigineHypotheseLibre = { type: 'veille', annonceur: annonceur.slice(0, 80), savedAdId: sauvee.id };

      let adId = pont.adId ?? null;
      if (adId) {
        await db!.update(schema.ads).set({ ...champs, sourceRef: refOrigineHypothese(origine), updatedAt: new Date() })
          .where(and(eq(schema.ads.id, adId), eq(schema.ads.workspaceId, ws)));
      } else {
        // Le concept de cette pub existait · une nouvelle hypothèse en est une nouvelle variante.
        const [ad] = await db!.insert(schema.ads).values({
          workspaceId: ws, conceptId: pont.conceptId, variantCode: await nextVariant(pont.conceptId),
          format: 'video_ugc', adType: 'imitation', platform: src.platform === 'tiktok' ? 'tiktok' : 'meta',
          ...champs, sourceRef: refOrigineHypothese(origine),
        }).returning({ id: schema.ads.id });
        adId = ad?.id ?? null;
      }
      if (!adId) return pas('La création n’a rien renvoyé.');
      return fin(brandId, adId);
    }

    /* ── Rien, persona ou apprentissage · un concept à lui, sous le bon chemin ── */
    let origine: OrigineHypotheseLibre;
    let angleId: string | null = null;
    let callout: string | null = null;

    if (!src || src.type === 'libre') {
      origine = { type: 'libre' };
    } else if (src.type === 'persona') {
      if (!estId(src.personaId)) return pas('Persona introuvable dans la marque active.');
      const [p] = await db!.select({ id: schema.personas.id, nom: schema.personas.name }).from(schema.personas)
        .where(and(eq(schema.personas.id, src.personaId), eq(schema.personas.brandId, brandId))).limit(1);
      if (!p) return pas('Persona introuvable dans la marque active.');
      const accroche = typeof src.accroche === 'string' ? src.accroche.replace(/\s+/g, ' ').trim().slice(0, 280) || null : null;
      origine = { type: 'persona', persona: p.nom.slice(0, 80), personaId: p.id, accroche };
      callout = accroche;
      const path = await ensureGraphPath({ workspaceId: ws, brandId, personaId: p.id, desireLabel: DESIR_HYPOTHESES, angleLabel: ANGLE_HYPOTHESES, mechanism: inferMechanism(v.texte, '').mechanism });
      angleId = path?.angleId ?? null;
    } else if (src.type === 'apprentissage') {
      if (!estId(src.learningId)) return pas('Apprentissage introuvable dans la marque active.');
      const [l] = await db!.select({ id: schema.learnings.id, enonce: schema.learnings.statement, angleId: schema.learnings.angleId }).from(schema.learnings)
        .where(and(eq(schema.learnings.id, src.learningId), eq(schema.learnings.workspaceId, ws), eq(schema.learnings.brandId, brandId))).limit(1);
      if (!l) return pas('Apprentissage introuvable dans la marque active.');
      origine = { type: 'apprentissage', enonce: l.enonce.replace(/\s+/g, ' ').trim().slice(0, 200), learningId: l.id };
      // L'apprentissage porte son angle · on y range l'hypothèse s'il est bien de la marque.
      if (l.angleId) {
        const [a] = await db!.select({ id: schema.angles.id }).from(schema.angles)
          .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
          .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
          .where(and(eq(schema.angles.id, l.angleId), eq(schema.angles.workspaceId, ws), eq(schema.personas.brandId, brandId))).limit(1);
        angleId = a?.id ?? null;
      }
    } else {
      return pas('Point de départ inconnu.');
    }

    if (!angleId) {
      const path = await ensureGraphPath({ workspaceId: ws, brandId, desireLabel: DESIR_HYPOTHESES, angleLabel: ANGLE_HYPOTHESES, mechanism: inferMechanism(v.texte, '').mechanism });
      if (!path) return pas('Rattachement impossible.');
      angleId = path.angleId;
    }

    const [concept] = await db!.insert(schema.concepts).values({
      workspaceId: ws, angleId, title: `Hypothèse · ${v.texte}`.slice(0, 160), callout,
      adType: 'ideation', status: 'proposed', sourceRef: refOrigineHypothese(origine),
    }).returning({ id: schema.concepts.id });
    if (!concept) return pas('Création impossible.');
    const [ad] = await db!.insert(schema.ads).values({
      workspaceId: ws, conceptId: concept.id, variantCode: 'v1', adType: 'ideation',
      ...champs, sourceRef: refOrigineHypothese(origine),
    }).returning({ id: schema.ads.id });
    if (!ad) return pas('La création n’a rien renvoyé.');
    return fin(brandId, ad.id);
  } catch (e) {
    return pas(logAndTranslate('adsmap:hypothese-create', e, { subject: 'la création de l’hypothèse', workspaceId: g.s.workspaceId }));
  }
}

/**
 * « Compléter la phrase » · réécrit la phrase, la variable et l'estimation
 * d'une hypothèse ENCORE EN BROUILLON de la marque active. Une ad prête, en
 * test ou conclue garde son hypothèse · la changer réécrirait ce qu'un test a
 * déjà mesuré.
 */
export async function completerHypotheseAction(input: { adId: string; saisie: SaisieHypotheseLibre }): Promise<ResultatHypothese> {
  const g = await adsmapGuard({ minRole: 'member' });
  if ('error' in g) return pas(g.error);
  if (!estId(input?.adId)) return pas('Hypothèse introuvable dans la marque active.');
  const v = validerSaisieHypothese(input.saisie ?? {});
  if (!v.ok) return pas(v.erreur);

  try {
    const [ad] = await db!.select({ id: schema.ads.id, statut: schema.ads.status })
      .from(schema.ads)
      .innerJoin(schema.concepts, eq(schema.ads.conceptId, schema.concepts.id))
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(eq(schema.ads.id, input.adId), eq(schema.ads.workspaceId, g.s.workspaceId), eq(schema.personas.brandId, g.brand.id)))
      .limit(1);
    if (!ad) return pas('Hypothèse introuvable dans la marque active.');
    if (ad.statut !== 'draft') return pas('Cette hypothèse a quitté le brouillon · sa phrase ne se réécrit plus.');

    await db!.update(schema.ads).set({
      hypothesis: v.texte, testedVariable: v.variable,
      iceImpact: v.estimation.impact, iceConfidence: v.estimation.confiance, iceEffort: v.estimation.effort,
      updatedAt: new Date(),
    }).where(and(eq(schema.ads.id, ad.id), eq(schema.ads.status, 'draft')));
    return fin(g.brand.id, ad.id);
  } catch (e) {
    return pas(logAndTranslate('adsmap:hypothese-update', e, { subject: 'la mise à jour de l’hypothèse', workspaceId: g.s.workspaceId }));
  }
}

function fin(brandId: string, adId: string): ResultatHypothese {
  invalidateJarvisMemory(brandId);
  revalidatePath('/adsmap/hypotheses');
  return { ok: true, adId };
}
