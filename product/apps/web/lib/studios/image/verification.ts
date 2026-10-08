import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import {
  lireConsignePersistee, consigneDuContenu, empreinteConsigne, empreinteEntreesCompilation, verdictConsigne,
  formatDepuisBrief, FORMATS_DOCUMENT, ACTION_CONSIGNE_COMPILEE,
  type ConsigneImagePersistee, type ContenuVersion, type VerdictConsigne,
} from '@tiktrends/core';
import type { ExecStudio } from '../execution/types';
import { resoudreReferencesImage } from './references';

/**
 * Studios · F-B · vérifier une consigne image persistée (lecture seule).
 *
 * Une consigne n'est exécutable que si son empreinte est ATTESTÉE pour ce
 * projet (journal d'audit, ajout seul, écrit par le serveur à la
 * compilation), si elle a été compilée sur le brief et le produit COURANTS,
 * et si chaque référence liée est encore là, identique et transmissible.
 * Prend l'exécuteur de l'appelant (une transaction lit dans la transaction).
 */

export interface Portee { workspaceId: string; brandId: string; projectId: string }

/** Une consigne d'empreinte donnée a-t-elle été produite par le serveur pour CE projet ? */
export async function consigneAttestee(ex: ExecStudio, p: Portee, empreinte: string): Promise<boolean> {
  const A = schema.studioAuditEvents;
  const [l] = await ex.select({ id: A.id }).from(A).where(and(
    eq(A.workspaceId, p.workspaceId), eq(A.brandId, p.brandId), eq(A.action, ACTION_CONSIGNE_COMPILEE),
    eq(A.targetType, 'studio_project'), eq(A.targetId, p.projectId), sql`${A.details}->>'empreinte' = ${empreinte}`,
  )).limit(1);
  return !!l;
}

/** La consigne attestée d'une compilation (`runId`) de ce projet · relue en base, revérifiée. */
export async function consigneDuRun(ex: ExecStudio, p: Portee, runId: string): Promise<{ consigne: ConsigneImagePersistee; empreinte: string; quand: Date } | null> {
  const A = schema.studioAuditEvents;
  const [l] = await ex.select({ details: A.details, quand: A.occurredAt }).from(A).where(and(
    eq(A.workspaceId, p.workspaceId), eq(A.brandId, p.brandId), eq(A.action, ACTION_CONSIGNE_COMPILEE),
    eq(A.targetType, 'studio_project'), eq(A.targetId, p.projectId), sql`${A.details}->>'runId' = ${runId}`,
  )).orderBy(desc(A.occurredAt)).limit(1);
  const d = l?.details as { consigne?: unknown; empreinte?: unknown } | null | undefined;
  const c = lireConsignePersistee(d?.consigne);
  if (!c || c.runId !== runId || d?.empreinte !== empreinteConsigne(c)) return null;
  return { consigne: c, empreinte: d.empreinte as string, quand: l!.quand };
}

/** La dernière consigne attestée pour une version donnée du projet (compilée, peut-être pas retenue). */
export async function derniereConsigneCompilee(ex: ExecStudio, p: Portee, versionId: string): Promise<{ consigne: ConsigneImagePersistee; empreinte: string } | null> {
  const A = schema.studioAuditEvents;
  const [l] = await ex.select({ details: A.details }).from(A).where(and(
    eq(A.workspaceId, p.workspaceId), eq(A.brandId, p.brandId), eq(A.action, ACTION_CONSIGNE_COMPILEE),
    eq(A.targetType, 'studio_project'), eq(A.targetId, p.projectId), eq(A.versionBefore, versionId),
  )).orderBy(desc(A.occurredAt)).limit(1);
  const d = l?.details as { consigne?: unknown; empreinte?: unknown } | null | undefined;
  const c = lireConsignePersistee(d?.consigne);
  if (!c || d?.empreinte !== empreinteConsigne(c)) return null;
  return { consigne: c, empreinte: d.empreinte as string };
}

export interface EtatConsigne {
  consigne: ConsigneImagePersistee | null;
  empreinte: string | null;
  verdict: VerdictConsigne;
}

/** Ce que le devis et l'approbation exigent, lu dans l'exécuteur de l'appelant. */
export async function verifierConsigne(ex: ExecStudio, p: Portee, contenu: ContenuVersion): Promise<EtatConsigne> {
  const consigne = consigneDuContenu(contenu);
  const entreesCourantes = empreinteEntreesCompilation(contenu);
  if (!consigne) return { consigne: null, empreinte: null, verdict: verdictConsigne({ consigne: null, attestee: false, entreesCourantes, resolutions: new Map() }) };
  const empreinte = empreinteConsigne(consigne);
  const attestee = await consigneAttestee(ex, p, empreinte);
  const resolutions = attestee ? await resoudreReferencesImage(ex, p, consigne.references.map((r) => r.assetId)) : new Map();
  return { consigne, empreinte, verdict: verdictConsigne({ consigne, attestee, entreesCourantes, resolutions }) };
}

/** Le format de l'image · celui que le brief dit (sinon 4:5, annoncé comme défaut). */
export function formatImageDuContenu(contenu: ContenuVersion): { largeur: number; hauteur: number; libelle: string; depuisBrief: boolean } {
  const brief = contenu?.brief as { formats?: unknown } | null;
  const f = formatDepuisBrief(Array.isArray(brief?.formats) ? brief!.formats : null);
  const d = FORMATS_DOCUMENT[f.format];
  return { largeur: d.width, hauteur: d.height, libelle: d.libelle, depuisBrief: f.depuisBrief };
}
