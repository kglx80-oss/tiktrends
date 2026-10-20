/**
 * Studios · adaptateur SERVEUR qui résout les références de portée Adsmap
 * (`persona`, `désir`, `angle`, `concept`) citées par un brief V5, en lecture
 * seule. La RÈGLE vit au noyau (`violationsReferencesAdsmapBrief`,
 * `packages/core/.../references-adsmap.ts`) ; ici ne vit que la LECTURE des
 * lignes et leur cantonnement à la session.
 *
 * Cantonnement · on ne précharge que les lignes du WORKSPACE courant. Une ligne
 * d'un autre workspace n'est jamais préchargée → le résolveur rend `null` ; une
 * ligne d'une autre MARQUE du même workspace est préchargée mais sa portée
 * `brandId` ne correspondra pas au projet → refus. Les deux donnent le même
 * refus indistinct (`RAISON_REF_HORS_PORTEE`), comme voulu : on ne révèle ni
 * l'existence ni l'appartenance d'une ligne hors de la marque du projet.
 *
 * La marque effective d'une ligne remonte toujours à `personas.brand_id`
 * (désir → persona, angle → désir → persona, concept → angle → désir → persona).
 * Le workspace vient de la colonne `workspace_id` de la ligne (ou de la marque,
 * pour un persona). Aucune écriture.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type {
  KindReferenceAdsmap, PorteeAdsmap, ResolveurReferencesAdsmap, RefAdsmapCitee,
} from '@tiktrends/core';
import type { ExecStudio } from './execution/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clef = (kind: KindReferenceAdsmap, id: string) => `${kind}:${id}`;
const uuidsUniques = (ids: readonly string[]): string[] => [...new Set(ids.filter((x) => UUID.test(x)))];

/**
 * Construit un résolveur de portée Adsmap pour les références CITÉES passées,
 * en préchargeant les seules lignes du workspace. Un id non-UUID est ignoré au
 * préchargement (il ne peut pas être une ligne réelle) · le résolveur rend
 * alors `null`, ce que le noyau traduit en refus · jamais de requête sur un id
 * malformé (qui ferait échouer la requête au lieu de refuser proprement).
 */
export async function resolveurAdsmapPourRefs(
  workspaceId: string,
  refs: ReadonlyArray<Pick<RefAdsmapCitee, 'kind' | 'ref'>>,
  base: ExecStudio = db,
): Promise<ResolveurReferencesAdsmap> {
  const parKind: Record<KindReferenceAdsmap, string[]> = { persona: [], desir: [], angle: [], concept: [] };
  for (const { kind, ref } of refs) parKind[kind].push(ref.id);
  const portee = new Map<string, PorteeAdsmap>();

  const personaIds = uuidsUniques(parKind.persona);
  if (personaIds.length) {
    const rows = await base.select({ id: schema.personas.id, brandId: schema.personas.brandId, workspaceId: schema.brands.workspaceId })
      .from(schema.personas)
      .innerJoin(schema.brands, eq(schema.personas.brandId, schema.brands.id))
      .where(and(inArray(schema.personas.id, personaIds), eq(schema.brands.workspaceId, workspaceId)));
    for (const r of rows) portee.set(clef('persona', r.id), { workspaceId: r.workspaceId, brandId: r.brandId });
  }

  const desirIds = uuidsUniques(parKind.desir);
  if (desirIds.length) {
    const rows = await base.select({ id: schema.desires.id, workspaceId: schema.desires.workspaceId, brandId: schema.personas.brandId })
      .from(schema.desires)
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(inArray(schema.desires.id, desirIds), eq(schema.desires.workspaceId, workspaceId)));
    for (const r of rows) portee.set(clef('desir', r.id), { workspaceId: r.workspaceId, brandId: r.brandId });
  }

  const angleIds = uuidsUniques(parKind.angle);
  if (angleIds.length) {
    const rows = await base.select({ id: schema.angles.id, workspaceId: schema.angles.workspaceId, brandId: schema.personas.brandId })
      .from(schema.angles)
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(inArray(schema.angles.id, angleIds), eq(schema.angles.workspaceId, workspaceId)));
    for (const r of rows) portee.set(clef('angle', r.id), { workspaceId: r.workspaceId, brandId: r.brandId });
  }

  const conceptIds = uuidsUniques(parKind.concept);
  if (conceptIds.length) {
    const rows = await base.select({ id: schema.concepts.id, workspaceId: schema.concepts.workspaceId, brandId: schema.personas.brandId })
      .from(schema.concepts)
      .innerJoin(schema.angles, eq(schema.concepts.angleId, schema.angles.id))
      .innerJoin(schema.desires, eq(schema.angles.desireId, schema.desires.id))
      .innerJoin(schema.personas, eq(schema.desires.personaId, schema.personas.id))
      .where(and(inArray(schema.concepts.id, conceptIds), eq(schema.concepts.workspaceId, workspaceId)));
    for (const r of rows) portee.set(clef('concept', r.id), { workspaceId: r.workspaceId, brandId: r.brandId });
  }

  return { resoudre: (kind: KindReferenceAdsmap, id: string): PorteeAdsmap | null => portee.get(clef(kind, id)) ?? null };
}

/**
 * Portée du projet + résolveur prêts à passer au noyau, pour un brief donné.
 * Renvoie `null` si le brief ne cite AUCUNE référence Adsmap · le caller évite
 * alors toute requête et ne contrôle rien de plus (compat ascendante : un brief
 * hérité sans `*Ref` reste valide).
 */
export async function scopeEtResolveurAdsmap(
  workspaceId: string, brandId: string, refs: ReadonlyArray<Pick<RefAdsmapCitee, 'kind' | 'ref'>>,
  base: ExecStudio = db,
): Promise<{ scope: PorteeAdsmap; resolveur: ResolveurReferencesAdsmap } | null> {
  if (refs.length === 0) return null;
  const resolveur = await resolveurAdsmapPourRefs(workspaceId, refs, base);
  return { scope: { workspaceId, brandId }, resolveur };
}
