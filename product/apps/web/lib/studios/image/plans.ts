import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import {
  exigencePlansDuDevis, consigneDuPlan, empreinteConsignePlan, entreesConsignePlan, verdictConsignePlan, parametresDesPlans,
  empreinteConsignesDevis, lireParametresImage, erreurStudio, ACTION_CONSIGNE_PLAN,
  type ContenuVersion, type ConsignePlanPersistee, type ErreurStudio, type LigneDevis, type VerdictConsignePlan,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import type { ExecStudio } from '../execution/types';
import { resoudreReferencesImage } from './references';

/**
 * Studios · L6-A · raccord des images clés des PLANS vidéo (`keyframe:<plan>`
 * hors `keyframe:s_image`) aux commandes L3, sur le modèle exact de F-B.
 * Appelé par `execution/commandes.ts` · sans effet sur un devis qui ne
 * contient pas d'image clé de plan.
 *
 *  · au devis : chaque image clé exige une consigne `shot.image` retenue,
 *    ATTESTÉE pour ce projet, compilée sur les entrées courantes de l'image
 *    clé, références intactes ; l'empreinte des consignes entre dans
 *    `inputHash` ;
 *  · à l'approbation : `snapshot.parametres` = `studio_image/1` construit à
 *    partir des consignes de la version DEVISÉE, revérifiées maintenant ·
 *    jamais `{}`. Sans consigne exécutable : refus, rien débité.
 */

export interface Portee { workspaceId: string; brandId: string; projectId: string }

const pasDePlan = { ok: true as const, empreinte: null, parametres: null };

/** Une consigne de plan d'empreinte donnée a-t-elle été produite par le serveur pour CE projet et CE plan ? */
export async function consignePlanAttestee(ex: ExecStudio, p: Portee, shotId: string, empreinte: string): Promise<boolean> {
  const A = schema.studioAuditEvents;
  const [l] = await ex.select({ id: A.id }).from(A).where(and(
    eq(A.workspaceId, p.workspaceId), eq(A.brandId, p.brandId), eq(A.action, ACTION_CONSIGNE_PLAN),
    eq(A.targetType, 'studio_project'), eq(A.targetId, p.projectId),
    sql`${A.details}->>'empreinte' = ${empreinte}`, sql`${A.details}->>'shotId' = ${shotId}`,
  )).limit(1);
  return !!l;
}

export interface EtatConsignePlan { shotId: string; consigne: ConsignePlanPersistee | null; empreinte: string | null; verdict: VerdictConsignePlan }

/** Ce que le devis et l'approbation exigent pour l'image clé d'un plan, lu dans l'exécuteur de l'appelant. */
export async function verifierConsignePlan(ex: ExecStudio, p: Portee, contenu: ContenuVersion, shotId: string): Promise<EtatConsignePlan> {
  const consigne = consigneDuPlan(contenu, shotId);
  const rang = contenu.shots.order.indexOf(shotId) + 1;
  const entreesCourantes = entreesConsignePlan(contenu, shotId);
  if (!consigne) return { shotId, consigne: null, empreinte: null, verdict: verdictConsignePlan({ shotId, rang, consigne: null, attestee: false, entreesCourantes, resolutions: new Map() }) };
  const empreinte = empreinteConsignePlan(consigne);
  const attestee = await consignePlanAttestee(ex, p, shotId, empreinte);
  const resolutions = attestee ? await resoudreReferencesImage(ex, p, consigne.references.map((r) => r.assetId)) : new Map();
  return { shotId, consigne, empreinte, verdict: verdictConsignePlan({ shotId, rang, consigne, attestee, entreesCourantes, resolutions }) };
}

function refusMelange(ctx: ContexteStudio, horsImage: string[]): ErreurStudio {
  return erreurStudio('INVALID_SCHEMA', {
    traceId: ctx.traceId,
    violations: [{ chemin: 'operations', raison: `l’image clé d’un plan se devise seule · retire ${horsImage.join(', ')} de ce devis` }],
  });
}

async function consignesExecutables(ex: ExecStudio, ctx: ContexteStudio, p: Portee, contenu: ContenuVersion, plans: string[], suffixe = ''):
  Promise<{ ok: true; consignes: ConsignePlanPersistee[] } | ErreurStudio> {
  const consignes: ConsignePlanPersistee[] = [];
  for (const sid of plans) {
    const e = await verifierConsignePlan(ex, p, contenu, sid);
    if (!e.verdict.ok) return erreurStudio(e.verdict.code, { traceId: ctx.traceId, targetIds: e.verdict.cibles, message: `${e.verdict.motif}${suffixe}` });
    consignes.push(e.consigne!);
  }
  return { ok: true, consignes };
}

/** Au devis · consignes exécutables, une requête par job ; leur empreinte entre dans `inputHash`. */
export async function raccordPlansDevis(
  ex: ExecStudio, ctx: ContexteStudio,
  e: { projet: { id: string; workspaceId: string; brandId: string }; contenu: ContenuVersion; lignes: ReadonlyArray<LigneDevis> },
): Promise<{ ok: true; empreinte: string | null } | ErreurStudio> {
  const x = exigencePlansDuDevis(e.lignes);
  if (!x.concerne) return { ok: true, empreinte: null };
  if (x.horsImage.length) return refusMelange(ctx, x.horsImage);
  const c = await consignesExecutables(ex, ctx, { workspaceId: e.projet.workspaceId, brandId: e.projet.brandId, projectId: e.projet.id }, e.contenu, x.plans);
  if (!c.ok) return c;
  const p = parametresDesPlans(c.consignes);
  if (!p.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, targetIds: p.cibles, violations: [{ chemin: 'operations', raison: p.motif }] });
  return { ok: true, empreinte: empreinteConsignesDevis(c.consignes) };
}

/** À l'approbation · `studio_image/1` relu des données SERVEUR de la version devisée · `null` hors images clés de plans. */
export async function parametresPlansApprobation(
  ex: ExecStudio, ctx: ContexteStudio,
  q: { workspaceId: string; brandId: string; projectId: string; projectVersionId: string; lines: unknown },
): Promise<{ ok: true; parametres: Record<string, unknown> | null } | ErreurStudio> {
  const x = exigencePlansDuDevis(Array.isArray(q.lines) ? (q.lines as LigneDevis[]) : []);
  if (!x.concerne) return pasDePlan;
  if (x.horsImage.length) return refusMelange(ctx, x.horsImage);
  const V = schema.studioProjectVersions;
  const [v] = await ex.select({ content: V.content }).from(V)
    .where(and(eq(V.id, q.projectVersionId), eq(V.projectId, q.projectId), eq(V.workspaceId, q.workspaceId), eq(V.brandId, q.brandId))).limit(1);
  if (!v) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const c = await consignesExecutables(ex, ctx, { workspaceId: q.workspaceId, brandId: q.brandId, projectId: q.projectId }, v.content as ContenuVersion, x.plans, ' Rien n’a été débité.');
  if (!c.ok) return c;
  const p = parametresDesPlans(c.consignes);
  if (!p.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, targetIds: p.cibles, violations: [{ chemin: 'operations', raison: p.motif }], message: 'Rien n’a été débité.' });
  const lu = lireParametresImage(p.parametres);
  if (!lu.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: lu.violations.map((raison) => ({ chemin: 'parametres', raison })) });
  return { ok: true, parametres: p.parametres as unknown as Record<string, unknown> };
}
