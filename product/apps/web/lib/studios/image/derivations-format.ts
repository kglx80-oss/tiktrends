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
  // Reconnaissance volontairement bornée des contraintes explicites de sortie.
  // « portrait d’une femme », un objet carré ou « 1/2 du cadre » décrivent le
  // sujet/composition. Ce ne sont pas des formats. Les interdits ne sont pas
  // non plus des formats exigés. Ceci n’est pas une analyse sémantique générale.
  const clauses = c.consigne.generationInstruction.toLowerCase().split(/[.;\n]/)
    .filter(t => !/\b(?:no|not|avoid|without|pas|sans|éviter|eviter)\b/.test(t));
  const explicites = clauses.flatMap(t => Array.from(t.matchAll(
    /\b(?:aspect\s+ratio|ratio|format|dimensions?|orientation|canvas\s+size|image\s+size)\s*(?:(?:de|of|is|est|en)\s+)?[:=]?\s*(\d{1,2}\s*[:/]\s*\d{1,2}|\d{3,4}\s*[x×]\s*\d{3,4}|carré|carre|square|paysage|landscape|horizontal|portrait|vertical)(?=\W|$)/g,
  ), m => m[1]!.replace(/\s/g, '').replace('/', ':').replace('×', 'x')));
  // Anglais usuel : « 4:5 aspect ratio », « portrait orientation ».
  for (const t of clauses) for (const m of t.matchAll(/\b(\d{1,2}\s*[:/]\s*\d{1,2}|square|landscape|horizontal|portrait|vertical)\s+(?:aspect\s+ratio|format|orientation)\b/g)) {
    explicites.push(m[1]!.replace(/\s/g, '').replace('/', ':'));
  }
  const contradiction = explicites.some(v => {
    if (/^\d+:\d+$/.test(v)) return v !== f;
    if (/^\d+x\d+$/.test(v)) return v !== `${dimensions.largeur}x${dimensions.hauteur}`;
    if (['carré', 'carre', 'square'].includes(v)) return f !== '1:1';
    if (['paysage', 'landscape', 'horizontal'].includes(v)) return true;
    return f === '1:1';
  });
  if (contradiction) return { ok: false, motif: `La consigne impose un autre cadrage que ${f}. Recompile et relis la consigne avant ce format.` };
  const consigne = { ...c, format: dimensions };
  return { ok: true, consigne, derivation: { schema: 'studio_image_format/1', format: f, sourceVersionId, sourceHash: empreinteConsigne(c), effectiveHash: empreinteConsigne(consigne), parametresHash: empreinteContenu(parametresDepuisConsigne(consigne)) } };
}
