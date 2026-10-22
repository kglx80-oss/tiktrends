'use server';
import { erreurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { refusCapacite } from '../../../lib/studios/interrupteurs';
import { preparerLotImagesPour } from '../../../lib/studios/image/lot-images';
import { FORMATS_IMAGES_ATTESTES, type FormatImageAtteste } from '../../../lib/studios/image/derivations-format';
/** Le même serveur d'approbation et de suivi que les lots image ; aucune
 * génération ou compilation implicite pour ajouter un format. */
export async function preparerLotFormats(e: { projectId: unknown; formats: unknown; nombreParFormat?: unknown; controleVision?: unknown }) {
  const g = await gardeStudio('studio.generate', 'generation_image');
  if (!g.ok) return g;
  if (!Array.isArray(e?.formats) || e.formats.length < 1 || e.formats.length > 3 || e.formats.some(f => !FORMATS_IMAGES_ATTESTES.includes(f))) return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId });
  const nombre = e.nombreParFormat ?? 1;
  if (!Number.isInteger(nombre) || Number(nombre) < 1 || Number(nombre) > 4 || new Set(e.formats).size !== e.formats.length) return erreurStudio('INVALID_SCHEMA', { traceId: g.ctx.traceId });
  const formats = (e.formats as FormatImageAtteste[]).flatMap(f => Array.from({ length:Number(nombre) }, () => f));
  const visionCoupee = await refusCapacite(g.ctx, ['controle_visuel']);
  return preparerLotImagesPour(g.ctx, { projectId:e.projectId,nombre:formats.length,controleVision:visionCoupee || e.controleVision === false ? false : undefined }, undefined, undefined, formats);
}
