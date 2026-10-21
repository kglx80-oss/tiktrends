import 'server-only';
import { and, eq } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import {
  exigenceImageDuDevis, parametresDepuisConsigne, lireParametresImage, erreurStudio,
  type ContenuVersion, type ErreurStudio, type LigneDevis,
} from '@tiktrends/core';
import type { ContexteStudio } from '../garde';
import type { ExecStudio } from '../execution/types';
import { deriverFormat, type DerivationFormat } from './derivations-format';
import { verifierConsigne } from './verification';

/**
 * Studios · F-B · raccord de l'image du studio aux commandes L3 (devis,
 * approbation). Appelé par `execution/commandes.ts` · sans effet sur un devis
 * qui ne contient pas `keyframe:s_image` (les autres opérations gardent leur
 * comportement L3).
 */

const pasDImage = { ok: true as const, empreinte: null, parametres: {} as Record<string, unknown> };

function refusMelange(ctx: ContexteStudio, horsImage: string[]): ErreurStudio {
  return erreurStudio('INVALID_SCHEMA', {
    traceId: ctx.traceId,
    violations: [{ chemin: 'operations', raison: `l’image du studio se devise seule · retire ${horsImage.join(', ')} de ce devis` }],
  });
}

/** Au devis · la consigne retenue doit être exécutable ; son empreinte entre dans `inputHash`. */
export async function raccordImageDevis(
  ex: ExecStudio, ctx: ContexteStudio,
  e: { projet: { id: string; workspaceId: string; brandId: string }; contenu: ContenuVersion; lignes: ReadonlyArray<LigneDevis>; versionId?: string; formatImage?: unknown },
): Promise<{ ok: true; empreinte: string | null; derivation?: DerivationFormat } | ErreurStudio> {
  const x = exigenceImageDuDevis(e.lignes);
  if (!x.concerne) return pasDImage;
  if (x.horsImage.length) return refusMelange(ctx, x.horsImage);
  const c = await verifierConsigne(ex, { workspaceId: e.projet.workspaceId, brandId: e.projet.brandId, projectId: e.projet.id }, e.contenu);
  if (!c.verdict.ok) return erreurStudio(c.verdict.code, { traceId: ctx.traceId, targetIds: c.verdict.cibles, message: c.verdict.motif });
  if (e.formatImage !== undefined) {
    if (!e.versionId) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId });
    const d = deriverFormat(c.consigne!, e.versionId, e.formatImage);
    if (!d.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: d.motif });
    return { ok: true, empreinte: d.derivation.effectiveHash, derivation: d.derivation };
  }
  return { ok: true, empreinte: c.empreinte };
}

/**
 * À l'approbation · les paramètres `studio_image/1` construits à partir des
 * données SERVEUR (consigne de la version devisée, attestée, références
 * relues maintenant : même version, même empreinte, même marque). Jamais `{}`
 * pour l'image du studio : sans consigne exécutable, refus, rien débité.
 */
export async function parametresImageApprobation(
  ex: ExecStudio, ctx: ContexteStudio,
  q: { id: string; inputHash: string; workspaceId: string; brandId: string; projectId: string; projectVersionId: string; lines: unknown },
): Promise<{ ok: true; parametres: Record<string, unknown> } | ErreurStudio> {
  const x = exigenceImageDuDevis(Array.isArray(q.lines) ? (q.lines as LigneDevis[]) : []);
  if (!x.concerne) return pasDImage;
  if (x.horsImage.length) return refusMelange(ctx, x.horsImage);
  const V = schema.studioProjectVersions;
  const [v] = await ex.select({ content: V.content }).from(V)
    .where(and(eq(V.id, q.projectVersionId), eq(V.projectId, q.projectId), eq(V.workspaceId, q.workspaceId), eq(V.brandId, q.brandId))).limit(1);
  if (!v) return erreurStudio('NOT_FOUND', { traceId: ctx.traceId });
  const c = await verifierConsigne(ex, { workspaceId: q.workspaceId, brandId: q.brandId, projectId: q.projectId }, v.content as ContenuVersion);
  if (!c.verdict.ok) return erreurStudio(c.verdict.code, { traceId: ctx.traceId, targetIds: c.verdict.cibles, message: `${c.verdict.motif} Rien n’a été débité.` });
  const A = schema.studioAuditEvents;
  const [a] = await ex.select({ details: A.details }).from(A).where(and(eq(A.workspaceId, q.workspaceId), eq(A.brandId, q.brandId), eq(A.action, 'quote.create'), eq(A.targetType, 'studio_quote'), eq(A.targetId, q.id))).limit(1);
  const details = a?.details as { derivationFormat?: DerivationFormat; inputHash?: string } | undefined;
  let retenue = c.consigne!;
  if (details?.derivationFormat) {
    const d = deriverFormat(retenue, q.projectVersionId, details.derivationFormat.format);
    if (!d.ok || details.inputHash !== q.inputHash || Object.entries(d.derivation).some(([k,v]) => details.derivationFormat![k as keyof DerivationFormat] !== v)) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, message: 'La dérivation du format ne correspond plus au devis.' });
    if (d.ok) retenue = d.consigne;
  }
  const parametres = parametresDepuisConsigne(retenue);
  const lu = lireParametresImage(parametres);
  if (!lu.ok) return erreurStudio('INVALID_SCHEMA', { traceId: ctx.traceId, violations: lu.violations.map((raison) => ({ chemin: 'parametres', raison })) });
  return { ok: true, parametres: parametres as unknown as Record<string, unknown> };
}
