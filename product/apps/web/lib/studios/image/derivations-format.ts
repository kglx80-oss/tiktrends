import 'server-only';
import { empreinteConsigne, empreinteContenu, parametresDepuisConsigne, type ConsigneImagePersistee } from '@tiktrends/core';

export const FORMATS_IMAGES_ATTESTES = ['1:1', '4:5', '9:16'] as const;
export type FormatImageAtteste = typeof FORMATS_IMAGES_ATTESTES[number];
const DIMENSIONS = { '1:1': { largeur: 1080, hauteur: 1080 }, '4:5': { largeur: 1080, hauteur: 1350 }, '9:16': { largeur: 1080, hauteur: 1920 } };
export interface DerivationFormat {
  schema: 'studio_image_format/1'; format: FormatImageAtteste; sourceVersionId: string;
  sourceHash: string; effectiveHash: string; parametresHash: string;
}
/** Ne réécrit jamais une consigne compilée. La dérivation n'existe que dans le
 * devis attesté ; seules ses dimensions changent, depuis une liste fermée. */
export function deriverFormat(c: ConsigneImagePersistee, sourceVersionId: string, format: unknown): { ok: true; derivation: DerivationFormat; consigne: ConsigneImagePersistee } | { ok: false; motif: string } {
  if (!FORMATS_IMAGES_ATTESTES.includes(format as FormatImageAtteste)) return { ok: false, motif: 'Format non pris en charge.' };
  const f = format as FormatImageAtteste;
  const dimensions = DIMENSIONS[f];
  const texte = [c.consigne.generationInstruction, ...c.consigne.negativeConstraints].join('\n').toLowerCase();
  // Une instruction explicitement cadrée doit être recompilée, pas contredite.
  const ratios = texte.match(/\b\d{1,2}\s*[:/]\s*\d{1,2}\b/g) ?? [];
  const tailles = texte.match(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/g) ?? [];
  const contradiction = ratios.some(r => r.replace(/\s/g, '').replace('/', ':') !== f)
    || tailles.some(r => r.replace(/\s/g, '').replace('×', 'x') !== `${dimensions.largeur}x${dimensions.hauteur}`)
    || (/\b(carré|carre|square)(?=\W|$)/.test(texte) && f !== '1:1')
    || (/\b(paysage|landscape|horizontal)\b/.test(texte))
    || (/\b(portrait|vertical)\b/.test(texte) && f === '1:1');
  if (contradiction) return { ok: false, motif: `La consigne impose un autre cadrage que ${f}. Recompile et relis la consigne avant ce format.` };
  const consigne = { ...c, format: dimensions };
  return { ok: true, consigne, derivation: { schema: 'studio_image_format/1', format: f, sourceVersionId, sourceHash: empreinteConsigne(c), effectiveHash: empreinteConsigne(consigne), parametresHash: empreinteContenu(parametresDepuisConsigne(consigne)) } };
}
