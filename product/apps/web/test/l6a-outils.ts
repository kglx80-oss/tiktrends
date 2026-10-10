import { randomUUID } from 'node:crypto';
import { schema } from '@tiktrends/db';
import {
  construireConsignePlan, entreesConsignePlan, empreinteConsignePlan, ACTION_CONSIGNE_PLAN, CLE_CONSIGNES_PLANS, PLAN_IMAGE,
  type ConsignePlanPersistee, type ContenuVersion,
} from '@tiktrends/core';
import type { BaseStudio } from '../lib/studios/execution/types';

/**
 * Outils L6-A · consignes `shot.image` de SEMIS pour les tests qui devisent
 * des images clés de plans (L3, L4-C). Le chemin réel (compilation par le
 * registre, attestation, « retenir ») est prouvé par `l6a-video-db` ; ici, le
 * semis pose ce que ce chemin aurait écrit : la consigne dans
 * `styleRef.consignesPlans` ET son attestation au journal d'audit. Sans
 * attestation, le devis la refuse (garde intacte).
 *
 * Même consigne pour chaque plan par défaut : un lot de N images clés d'une
 * même requête reste devisable en un job (le fournisseur rend N images d'UNE
 * consigne).
 */

export const INSTRUCTION_SEMIS = 'Image clé de test · sujet du plan au centre, lumière douce, aucun texte.';

export function avecConsignesPlans(contenu: ContenuVersion, o: { plans?: string[]; instruction?: string; maintenant?: Date } = {}): { contenu: ContenuVersion; consignes: ConsignePlanPersistee[] } {
  const plans = o.plans ?? contenu.shots.order.filter((s) => s !== PLAN_IMAGE);
  const consignes: ConsignePlanPersistee[] = [];
  for (const sid of plans) {
    const r = construireConsignePlan({
      runId: randomUUID(), shotId: sid, sourceVersionId: 'semis', entrees: entreesConsignePlan(contenu, sid)!,
      resultat: { generationInstruction: o.instruction ?? INSTRUCTION_SEMIS, referenceBindings: [], protectedComponents: [] },
      references: [], composantsProteges: [], surimpression: false, largeur: 1080, hauteur: 1920, compileeLe: o.maintenant ?? new Date('2026-10-08T09:00:00Z'),
    });
    if (!r.ok) throw new Error(`consigne de semis ${sid} : ${r.violations.join(' · ')}`);
    consignes.push(r.consigne);
  }
  const style = (contenu.styleRef ?? {}) as Record<string, unknown>;
  const deja = (style[CLE_CONSIGNES_PLANS] ?? {}) as Record<string, unknown>;
  return {
    contenu: { ...contenu, styleRef: { ...style, [CLE_CONSIGNES_PLANS]: { ...deja, ...Object.fromEntries(consignes.map((c) => [c.shotId, c])) } } },
    consignes,
  };
}

/** L'attestation que le serveur écrit à la compilation (`video.consigne_plan.compilee`). */
export async function attesterConsignesPlans(base: BaseStudio, p: { workspaceId: string; brandId: string; projectId: string; userId: string }, consignes: ReadonlyArray<ConsignePlanPersistee>): Promise<void> {
  for (const c of consignes) {
    await base.insert(schema.studioAuditEvents).values({
      actorId: p.userId, effectiveRole: 'semis', workspaceId: p.workspaceId, brandId: p.brandId, action: ACTION_CONSIGNE_PLAN,
      targetType: 'studio_project', targetId: p.projectId, versionBefore: null, versionAfter: null, reason: 'semis de test', traceId: `semis_${c.runId}`,
      details: { runId: c.runId, shotId: c.shotId, empreinte: empreinteConsignePlan(c), consigne: c },
    });
  }
}
