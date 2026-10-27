import type { CalqueStudio, DocumentStudio } from '../../studios/document';
import { FORMATS_DOCUMENT, ID_CALQUE_PRODUIT, type FormatDocument } from '../../studios/calques/formats';
import { TEXTE_MIN_PX } from '../../studios/calques/operations';

/**
 * Spatial · les règles de l'ÉDITEUR d'image (maquette `editeur`). Pur.
 *
 * Les gestes eux-mêmes (déplacer, modifier un texte, annuler, enregistrer…)
 * restent les opérations du noyau studios (`calques/`) · ici, seulement ce
 * que l'écran Spatial décide : quel format est actif, quelle icône pour quel
 * calque, quelles couleurs proposer, comment dire la longueur d'un texte.
 */

/** Les trois boutons de format de la maquette, dans son ordre. */
export const FORMATS_EDITEUR: ReadonlyArray<{ format: FormatDocument; libelle: string }> = [
  { format: '1:1', libelle: '1:1' },
  { format: '4:5', libelle: '4:5' },
  { format: '9:16', libelle: '9:16' },
];

/** Le format d'un document existant · `null` s'il ne correspond à aucun des trois (document importé). */
export function formatDuDocument(doc: Pick<DocumentStudio, 'width' | 'height'>): FormatDocument | null {
  for (const { format } of FORMATS_EDITEUR) {
    const f = FORMATS_DOCUMENT[format];
    if (f.width * doc.height === f.height * doc.width) return format;
  }
  return null;
}

/** La classe de proportion de la maquette (`.ad.r11`, `.ad.r916`, rien pour 4:5). */
export function classeFormat(f: FormatDocument | null): '' | 'r11' | 'r916' {
  return f === '1:1' ? 'r11' : f === '9:16' ? 'r916' : '';
}

/**
 * Icône du sprite pour un calque (`#i-…`) · la photo PRODUIT (calque
 * `produit`, posé par le noyau) et le logo portent l'étiquette, un texte le
 * T, une forme l'étincelle, toute autre image l'image.
 */
export function iconeCalque(c: Pick<CalqueStudio, 'id' | 'kind'>): 'img' | 'text' | 'tag' | 'spark' {
  if (c.kind === 'text') return 'text';
  if (c.kind === 'shape') return 'spark';
  if (c.kind === 'logo' || c.id === ID_CALQUE_PRODUIT) return 'tag';
  return 'img';
}

/** La note sous la liste des calques · ce que le verrou garantit, ou le geste à faire. */
export function noteCalques(doc: DocumentStudio | null): string {
  if (!doc || Object.keys(doc.layers).length === 0) return 'Ajoute un texte, une forme ou un média du projet pour commencer.';
  const verrou = Object.values(doc.layers).find((c) => c.locked);
  if (!verrou) return 'Choisis un calque pour le modifier · rien n’est généré ici.';
  return verrou.id === ID_CALQUE_PRODUIT
    ? 'Le produit est verrouillé : il ne bouge pas et n’est jamais régénéré.'
    : `« ${verrou.name} » est verrouillé : il ne bouge pas tant qu’il n’est pas déverrouillé.`;
}

/** Titre de l'inspecteur selon le calque choisi. */
export function titreInspecteur(c: Pick<CalqueStudio, 'kind' | 'name'> | null): string {
  if (!c) return 'Aucun calque choisi';
  return c.name.trim() || ({ text: 'Texte', image: 'Image', logo: 'Logo', shape: 'Forme' } as const)[c.kind];
}

/** `61 caractères` · la longueur dite, sans seuil inventé. */
export function longueurTexte(t: string): string {
  const n = [...t].length;
  return `${n} caractère${n > 1 ? 's' : ''}`;
}

const HEX = /^#[0-9a-f]{6}$/;

/**
 * Les couleurs proposées · d'abord celles de la MARQUE (fiche), puis celles
 * déjà présentes dans le document, puis le blanc et le noir. Dédoublonnées,
 * au plus `max`. Aucune couleur d'exemple de la maquette.
 */
export function nuancier(couleursMarque: readonly string[], doc: DocumentStudio | null, max = 6): string[] {
  const out: string[] = [];
  const pousse = (c: string | null | undefined) => {
    const v = (c ?? '').trim().toLowerCase();
    if (HEX.test(v) && !out.includes(v)) out.push(v);
  };
  couleursMarque.forEach(pousse);
  if (doc) {
    for (const c of Object.values(doc.layers)) {
      if (c.kind === 'text') pousse(c.color);
      else if (c.kind === 'shape') pousse(c.fill);
    }
  }
  pousse('#ffffff');
  pousse('#000000');
  return out.slice(0, max);
}

/**
 * Bornes du curseur « Taille du texte », en pixels du document · le plancher
 * est celui du noyau (`TEXTE_MIN_PX`) ; le plafond, un quart de la largeur
 * (une ligne de quatre caractères), jamais sous la taille actuelle.
 */
export function bornesTailleTexte(doc: Pick<DocumentStudio, 'width'>, actuelle: number): { min: number; max: number } {
  return { min: TEXTE_MIN_PX, max: Math.max(Math.round(doc.width / 4), Math.round(actuelle)) };
}
