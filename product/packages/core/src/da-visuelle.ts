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

/** Une chaîne propre, ou '' · tolère tout (nombre, null, objet). */
function txt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * La DA nettoyée · chaque champ est une chaîne sûre, `aEviter` un tableau de
 * chaînes. Existe parce que la DA vient d'un modèle et d'un jsonb : `aEviter`
 * arrive parfois en chaîne, un champ parfois en nombre. Sans ce filtre, un
 * `.map`/`.trim` sur la mauvaise forme faisait tomber le rendu de la marque ET
 * la génération (les deux lisent cette DA). On normalise ici, une fois.
 */
export function normaliserDaVisuelle(da?: DaVisuelleMarque | null): Required<Pick<DaVisuelleMarque, 'style' | 'ambiance' | 'lumiere' | 'photo' | 'couleurs'>> & { aEviter: string[] } {
  const o = (da && typeof da === 'object') ? (da as Record<string, unknown>) : {};
  return {
    style: txt(o.style), ambiance: txt(o.ambiance), lumiere: txt(o.lumiere),
    photo: txt(o.photo), couleurs: txt(o.couleurs),
    aEviter: (Array.isArray(o.aEviter) ? o.aEviter : []).map(txt).filter(Boolean),
  };
}

/** Vrai si la DA porte au moins une consigne exploitable. */
export function daVisuelleUtile(da?: DaVisuelleMarque | null): boolean {
  const n = normaliserDaVisuelle(da);
  return !!(n.style || n.ambiance || n.lumiere || n.photo || n.couleurs || n.aEviter.length);
}

/**
 * La DA visuelle tournée en contrainte de prompt (anglais · la langue des
 * prompts d'image). Se superpose à la direction · « applique ce style à CHAQUE
 * créa, tout en gardant chaque scène distincte ». `''` quand la DA est vide ·
 * le prompt reste léger.
 */
export function contrainteDaPourPrompt(da?: DaVisuelleMarque | null): string {
  const d = normaliserDaVisuelle(da);
  const bouts: string[] = [];
  if (d.style) bouts.push(`overall style: ${d.style}`);
  if (d.photo) bouts.push(`photography: ${d.photo}`);
  if (d.ambiance) bouts.push(`mood: ${d.ambiance}`);
  if (d.lumiere) bouts.push(`lighting: ${d.lumiere}`);
  if (d.couleurs) bouts.push(`colour feel: ${d.couleurs}`);
  if (!bouts.length && !d.aEviter.length) return '';
  const base = `Brand visual identity · apply this house style to EVERY creative while keeping each scene distinct (this constrains the look, not the subject): ${bouts.join('; ')}.`;
  return d.aEviter.length ? `${base} Avoid: ${d.aEviter.join(', ')}.` : base;
}
