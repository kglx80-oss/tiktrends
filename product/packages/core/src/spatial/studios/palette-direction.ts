/**
 * Spatial · assistant Nouveau projet · étape « Style » · lot 8 V5 (PC B11,
 * « Palette (4 pastilles) »).
 *
 * Pur. Les pastilles sont les couleurs de la FICHE de la marque
 * (`brands.colors`), relues au serveur · au plus quatre, chacune une couleur
 * hexadécimale valide, sans doublon, dans l'ordre de la fiche. Aucune couleur
 * d'exemple de la maquette, aucun blanc ni noir ajouté · une fiche sans
 * couleur le dit.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const PASTILLES_PALETTE_MAX = 4;

export function palettePastilles(couleurs: readonly (string | null | undefined)[] | null | undefined): { pastilles: string[]; phrase: string } {
  const pastilles: string[] = [];
  for (const c of couleurs ?? []) {
    const v = (c ?? '').trim().toLowerCase();
    if (HEX.test(v) && !pastilles.includes(v)) pastilles.push(v);
    if (pastilles.length === PASTILLES_PALETTE_MAX) break;
  }
  return {
    pastilles,
    phrase: pastilles.length
      ? `Palette de la fiche de la marque · ${pastilles.length} couleur${pastilles.length > 1 ? 's' : ''}, à citer dans l’intention de style.`
      : 'La fiche de la marque n’a aucune couleur · ajoute-les dans son Identité pour les voir ici.',
  };
}
