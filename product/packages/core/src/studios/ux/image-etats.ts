/**
 * L8-A · états des écrans image, produit, textes et éditeur (exigences UX-02
 * et UX-03 · cahier §153). Règles PURES, sans DOM : ce que l'écran DIT quand
 * un geste est bloqué (la prochaine action, jamais un bouton muet), et où va
 * le focus quand l'élément qui l'avait disparaît.
 *
 * Inventaire mesuré au navigateur (base locale semée, 1280/1440/390 × 720) :
 *  · « Ajouter aux textes retenus » inactif sans raison affichée ;
 *  · « Associer » inactif, fichier non choisi : aucune raison (seuls le rôle
 *    et la portée étaient nommés) ;
 *  · un calque supprimé depuis le panneau plein écran (390) : le focus
 *    tombait sur <body> ;
 *  · recharger la version courante après un conflit : le focus tombait sur
 *    <body> (le bouton « Voir le conflit » disparaît).
 */

/** Taille minimale des champs de saisie (pas de zoom forcé sur téléphone). */
export const TAILLE_CHAMP_MIN_PX = 16;

const liste = (mots: string[]): string => (mots.length <= 1 ? mots.join('') : `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`);

export interface EtatEpinglage { peutModifier: boolean; enCours: boolean; produitChoisi: boolean; photoChoisie: boolean }

/** Raison d'un épinglage impossible · `null` quand le geste est permis. */
export function raisonEpinglage(e: EtatEpinglage): string | null {
  if (!e.peutModifier) return 'Ton rôle permet de consulter, pas d’épingler.';
  if (e.enCours) return 'Enregistrement en cours · patiente.';
  if (!e.produitChoisi) return 'Choisis d’abord un produit.';
  if (!e.photoChoisie) return 'Choisis d’abord une photo.';
  return null;
}

export interface EtatAssociation { peutModifier: boolean; briefPresent: boolean; enCours: boolean; fichier: string; role: string; portee: string }

/** Raison d'une association impossible · nomme TOUT ce qui manque, dans l'ordre des champs. */
export function raisonAssociation(e: EtatAssociation): string | null {
  if (!e.peutModifier) return 'Ton rôle permet de consulter, pas d’associer.';
  if (!e.briefPresent) return 'Ce projet n’a pas de brief · les références s’y rangent.';
  if (e.enCours) return 'Enregistrement en cours · patiente.';
  const manque = [!e.fichier ? 'un fichier' : null, !e.role ? 'un rôle' : null, !e.portee ? 'une portée' : null].filter((x): x is string => x !== null);
  return manque.length ? `Choisis ${liste(manque)}.` : null;
}

export interface EtatAjoutTexte { peutEcrire: boolean; briefPresent: boolean; enCours: boolean; texte: string }

/** Raison d'un ajout de texte impossible (écriture à la main). */
export function raisonAjoutTexte(e: EtatAjoutTexte): string | null {
  if (!e.peutEcrire) return 'Ton rôle permet de lire et d’exporter, pas d’écrire.';
  if (!e.briefPresent) return 'Ce projet n’a pas de brief · les textes s’y rangent.';
  if (e.enCours) return 'Enregistrement en cours · patiente.';
  if (!e.texte.trim()) return 'Écris un texte pour pouvoir l’ajouter.';
  return null;
}

/**
 * Où va le focus quand un calque disparaît de la liste (suppression) · le
 * calque qui prend sa place (même rang), sinon le dernier, sinon `null` (la
 * liste est vide : l'écran porte le focus sur « ajouter »). `ordre` est
 * l'ordre AFFICHÉ avant le retrait.
 */
export function calqueApresRetrait(ordre: readonly string[], retire: string): string | null {
  const i = ordre.indexOf(retire);
  const reste = ordre.filter((x) => x !== retire);
  if (reste.length === 0) return null;
  if (i < 0) return reste[0]!;
  return reste[Math.min(i, reste.length - 1)]!;
}
