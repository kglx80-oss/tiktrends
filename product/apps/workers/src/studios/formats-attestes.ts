import { schema, and, eq } from '@tiktrends/db';
import { empreinteContenu, empreinteConsigne, consigneDuContenu, parametresDepuisConsigne, lireParametresImage, type ContenuVersion, type SnapshotJob } from '@tiktrends/core';
import type { BaseStudio, JobStudio } from './types';
/** Relecture sans écriture avant toute réservation/appel fournisseur. */
export async function refusDerivationFormat(base: BaseStudio, job: JobStudio, snap: SnapshotJob): Promise<string | null> {
  if (!job.quoteId) return null;
  const A = schema.studioAuditEvents;
  // Recherche de la preuve par devis ; la portée est ensuite exigée sur le
  // devis et la version. Une preuve copiée d'un autre espace ne devient
  // jamais un ancien devis exempté du contrôle. Aucune donnée n'est exposée.
  const [a] = await base.select({details:A.details}).from(A).where(and(eq(A.action,'quote.create'),eq(A.targetType,'studio_quote'),eq(A.targetId,job.quoteId))).limit(1);
  const d=a?.details as {inputHash?:string;derivationFormat?:{schema:string;sourceVersionId:string;parametresHash:string;sourceHash:string;effectiveHash:string}} | undefined;
  if (!d?.derivationFormat) return null; // anciens devis inchangés
  const Q=schema.studioQuotes;
  const [q]=await base.select().from(Q).where(and(eq(Q.id,job.quoteId),eq(Q.workspaceId,job.workspaceId),eq(Q.brandId,job.brandId),eq(Q.projectId,job.projectId))).limit(1);
  const V=schema.studioProjectVersions;
  const [v]=await base.select().from(V).where(and(eq(V.id,job.projectVersionId!),eq(V.projectId,job.projectId),eq(V.workspaceId,job.workspaceId),eq(V.brandId,job.brandId))).limit(1);
  if (!q || !v || d.derivationFormat.schema !== 'studio_image_format/1' || q.inputHash !== job.inputHash || d.inputHash !== q.inputHash
    || q.projectVersionId !== d.derivationFormat.sourceVersionId || snap.projectVersionId !== q.projectVersionId || v.contentHash !== snap.contentHash
    || snap.quoteId !== q.id || snap.pricingVersion !== q.pricingVersion || empreinteContenu(snap.lignes) !== empreinteContenu(q.lines)
    || empreinteContenu(snap.parametres) !== d.derivationFormat.parametresHash) return 'Dérivation de format non conforme au devis attesté.';
  const source = consigneDuContenu(v.content as ContenuVersion);
  const parametres = lireParametresImage(snap.parametres);
  if (!source || !parametres.ok || empreinteConsigne(source) !== d.derivationFormat.sourceHash) return 'Source de la dérivation altérée.';
  const effective = { ...source, format: parametres.parametres.format };
  if (empreinteConsigne(effective) !== d.derivationFormat.effectiveHash || empreinteContenu(parametresDepuisConsigne(effective)) !== d.derivationFormat.parametresHash) return 'Paramètres de format différents de la consigne source.';
  if (q.promptReleaseId) {
    const [r]=await base.select().from(schema.studioPromptReleases).where(eq(schema.studioPromptReleases.id,q.promptReleaseId)).limit(1);
    const revocation=(r?.evaluation as {revocation?:{motif?:unknown}} | null)?.revocation?.motif;
    if (!r || revocation || snap.epinglage?.promptReleaseId !== r.id || snap.epinglage.releaseHash !== r.releaseHash) return 'Release du devis indisponible ou révoquée.';
  }
  return null;
}
