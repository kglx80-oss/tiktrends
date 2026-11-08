/**
 * Spatial · Radar · « Suivre une marque » en saisie libre (lot 7 V5 · VB RD01).
 * Pur, testé. La saisie devient le même suivi qu'un « Suivre » posé depuis une
 * pub (`followBrand` · table `followed_brands`) · aucune option d'alerte par
 * marque (elle demanderait une colonne · hors lot), aucun nouvel appel.
 */

export const PLATEFORMES_SUIVI: ReadonlyArray<[string, string]> = [['meta', 'Meta'], ['tiktok', 'TikTok'], ['google', 'Google']];
export const LONGUEUR_MAX_SUIVI = 80;

export type SaisieSuivi =
  | { ok: true; nom: string; plateforme: string; domaine: string | null }
  | { ok: false; raison: string };

/**
 * Le nom (ou le domaine) tapé et la plateforme choisie → ce que le suivi
 * enregistre. Un domaine (« marque.fr », « https://www.marque.fr/x ») est
 * gardé comme domaine ET comme nom cherché · le relevé cherche par nom.
 */
export function saisieSuiviMarque(brut: string, plateforme: string): SaisieSuivi {
  const t = (brut ?? '').replace(/\s+/g, ' ').trim();
  if (!PLATEFORMES_SUIVI.some(([k]) => k === plateforme)) return { ok: false, raison: 'Choisis une plateforme · Meta, TikTok ou Google.' };
  if (t.length < 2) return { ok: false, raison: 'Écris le nom de la marque ou son domaine (2 caractères au moins).' };
  if (t.length > LONGUEUR_MAX_SUIVI) return { ok: false, raison: `${LONGUEUR_MAX_SUIVI} caractères au plus.` };
  const url = /^https?:\/\//i.test(t);
  const dom = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#].*)?$/i.exec(t);
  if (dom && (url || !t.includes(' '))) {
    const domaine = dom[1]!.toLowerCase();
    return { ok: true, nom: domaine, plateforme, domaine };
  }
  return { ok: true, nom: t, plateforme, domaine: null };
}
