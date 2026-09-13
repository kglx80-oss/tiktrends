/**
 * La direction artistique VISUELLE d'une marque, dérivée de son site · une règle
 * de composition de prompt, donc ici, pure et testable.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * La scène de chaque créa était décidée par un catalogue de directions
 * GÉNÉRIQUE, identique pour toutes les marques · d'où « les créas ne collent pas
 * à la DA du site ». Cette DA visuelle, elle, est propre à la marque (extraite
 * de son site) · elle décrit le STYLE (photo, ambiance, lumière, ce qu'on évite),
 * pas la scène.
 *
 * ── Contraindre, sans figer ──────────────────────────────────────────────────
 *
 * Le choix du propriétaire : la DA du site CONTRAINT chaque créa (toutes
 * respectent le style de la marque) mais ne REMPLACE pas la rotation de
 * directions · chaque créa garde une scène distincte. La contrainte se superpose
 * donc à la direction · elle dit « quel que soit le décor, voilà le style
 * maison », jamais « fais toujours le même décor ».
 */

export interface DaVisuelleMarque {
  /** Style visuel d'ensemble · ex : « éditorial minimaliste, beaucoup de blanc ». */
  style?: string;
  /** Ambiance / registre émotionnel · ex : « chaleureux, premium et rassurant ». */
  ambiance?: string;
  /** Lumière · ex : « lumière naturelle douce, ombres tenues ». */
  lumiere?: string;
  /** Style de photographie · ex : « macro produit sur fond texturé », « lifestyle ». */
  photo?: string;
  /** Description de la palette en mots (complète les couleurs hex). */
  couleurs?: string;
  /** À proscrire · ex : « pas de rendu stock, pas de surcharge, pas de dégradés criards ». */
  aEviter?: string[];
}

/** Vrai si la DA porte au moins une consigne exploitable. */
export function daVisuelleUtile(da?: DaVisuelleMarque | null): boolean {
  if (!da) return false;
  return !!(da.style?.trim() || da.ambiance?.trim() || da.lumiere?.trim() || da.photo?.trim() || da.couleurs?.trim() || (da.aEviter ?? []).some((x) => x.trim()));
}

/**
 * La DA visuelle tournée en contrainte de prompt (anglais · la langue des
 * prompts d'image). Se superpose à la direction · « applique ce style à CHAQUE
 * créa, tout en gardant chaque scène distincte ». `''` quand la DA est vide ·
 * le prompt reste léger.
 */
export function contrainteDaPourPrompt(da?: DaVisuelleMarque | null): string {
  if (!daVisuelleUtile(da)) return '';
  const d = da!;
  const bouts: string[] = [];
  if (d.style?.trim()) bouts.push(`overall style: ${d.style.trim()}`);
  if (d.photo?.trim()) bouts.push(`photography: ${d.photo.trim()}`);
  if (d.ambiance?.trim()) bouts.push(`mood: ${d.ambiance.trim()}`);
  if (d.lumiere?.trim()) bouts.push(`lighting: ${d.lumiere.trim()}`);
  if (d.couleurs?.trim()) bouts.push(`colour feel: ${d.couleurs.trim()}`);
  const eviter = (d.aEviter ?? []).map((x) => x.trim()).filter(Boolean);
  const base = `Brand visual identity · apply this house style to EVERY creative while keeping each scene distinct (this constrains the look, not the subject): ${bouts.join('; ')}.`;
  return eviter.length ? `${base} Avoid: ${eviter.join(', ')}.` : base;
}
