import 'server-only';
import { and, eq, notInArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  choisirDirection, consigneDuContenu, controlerVarieteLot, erreurStudio, objetDansPortee, resumerPersona,
  type BriefCanonique, type ConsigneDuLot, type ContenuVersion, type ErreurStudio, type IdeeBrief, type VerdictVarieteLot,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import { estUuid, lireProjetsDeLaPortee, lireVersion } from '../depot';
import { chargerSource } from '../prompts/source';

/**
 * Studios · ce que la compilation `image.compile` RELIT pour l'idée visuelle
 * d'un angle (règles pures · `core/studios/image/idee-angle.ts`).
 *
 *  · le persona cité par `brief.personaRef`, résolu DANS LA PORTÉE · même
 *    espace, même marque que le projet, marque visible par la session, persona
 *    ni rejeté ni archivé. Une référence d'une autre marque (même par un
 *    identifiant valide) ne rend rien, indistinct de « pas de persona ». Ses
 *    sources (avis, entretiens) ne sont jamais lues ;
 *  · la direction artistique NOMMÉE par l'intention de style, parmi les
 *    `AD_DIRECTIONS` et les recettes `styleRecipes` du pack embarqué.
 *
 * Lecture seule · aucun appel, aucune écriture. Une panne de lecture du
 * persona retombe sur « pas de persona » (le contexte reste celui d'avant).
 */
export async function ideeDuBriefPour(ctx: ContexteStudio, brandId: string, brief: BriefCanonique): Promise<IdeeBrief> {
  const recettes = chargerSource().pack.styleRecipes.map((r) => ({ id: r.id, title: r.title, material: r.material, lighting: r.lighting }));
  return { persona: await personaDuBrief(ctx, brandId, brief), direction: choisirDirection(brief.styleIntent, recettes) };
}

async function personaDuBrief(ctx: ContexteStudio, brandId: string, brief: BriefCanonique) {
  const id = brief.personaRef?.id;
  if (!db || !estUuid(id) || !objetDansPortee(ctx, { workspaceId: ctx.workspaceId, brandId })) return null;
  try {
    const P = schema.personas;
    const [p] = await db
      .select({ name: P.name, segment: P.segment, description: P.description, pains: P.pains, desires: P.desires })
      .from(P)
      .innerJoin(schema.brands, eq(P.brandId, schema.brands.id))
      .where(and(eq(P.id, id), eq(P.brandId, brandId), eq(schema.brands.workspaceId, ctx.workspaceId), notInArray(P.status, ['rejected', 'archived'])))
      .limit(1);
    return resumerPersona(p ?? null);
  } catch (e) {
    console.error(`[studios:idee] ${ctx.traceId} persona`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Un LOT D'ANGLES · les consignes RETENUES de N projets peuvent-elles partir
 * ensemble ? RÈGLE PRÊTE, PAS ENCORE RACCORDÉE · aucun chemin payant
 * multi-angles n'existe aujourd'hui (les lots d'images sont mono-projet), donc
 * rien ne l'appelle encore hors de ses tests. Le futur lancement d'un lot
 * d'angles devra l'appeler AVANT son devis. Lit, dans la
 * portée, la consigne courante de chaque projet et son angle, puis applique
 * `controlerVarieteLot` · un refus dit la raison et les projets dont la
 * consigne est à régénérer (`compilerConsigneImage`, un appel texte sous la
 * barrière de dépense). Aucun appel, aucune écriture.
 */
export async function controlerVarieteLotPour(ctx: ContexteStudio, projectIds: readonly unknown[]): Promise<({ ok: true; verdict: VerdictVarieteLot }) | ErreurStudio> {
  if (!projectIds.length || projectIds.length > 24 || !projectIds.every(estUuid)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'projectIds', raison: 'de 1 à 24 identifiants de projet attendus' }] });
  if (new Set((projectIds as string[]).map((x) => x.toLowerCase())).size !== projectIds.length) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: [{ chemin: 'projectIds', raison: 'un même projet figure deux fois dans le lot' }] });
  const projets = await lireProjetsDeLaPortee(ctx, projectIds);
  const lot: ConsigneDuLot[] = [];
  for (const id of projectIds as string[]) {
    const p = projets.find((x) => x.id === id.toLowerCase());
    if (!p?.currentVersionId) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
    const v = await lireVersion(ctx, p.currentVersionId);
    if (!v.ok) return v;
    const contenu = v.version.content as ContenuVersion;
    const c = consigneDuContenu(contenu);
    if (!c) return erreurStudio('MISSING_REFERENCE', { traceId: ctx.traceId, targetIds: [p.id], message: `« ${p.title} » n’a pas de consigne image retenue · compile-la d’abord. Rien n’a été généré.` });
    const b = (contenu.brief ?? {}) as Partial<BriefCanonique>;
    // L'angle du brief seulement · jamais le titre du projet (deux projets de même titre ne sont pas un même angle).
    const angle = (typeof b.angle === 'string' && b.angle.trim()) || (typeof b.angleRef?.label === 'string' ? b.angleRef.label : '');
    lot.push({ id: p.id, angle, generationInstruction: c.consigne.generationInstruction });
  }
  return { ok: true, verdict: controlerVarieteLot(lot) };
}
