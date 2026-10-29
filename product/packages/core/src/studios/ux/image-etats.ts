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

/*
 * Planche finale · D3 · atelier Produit, trois choses que l'écran disait mal.
 */

/** L'état « prêt » de la carte produit · une seule règle, celle du contrôle avant compilation. */
export interface EtatProduitPret { pret: boolean; titre: string; remede: string | null }

/**
 * La carte disait « Ton produit est prêt » dès qu'un produit était épinglé, à
 * côté d'un contrôle avant compilation « Bloqué » sur les DEUX modes. Le cas
 * est réel hors banc · un brief reconstruit après l'épinglage
 * (`propositionDepuisBrief`) remplace ses références et sort la photo du rôle
 * Produit. « Prêt » veut donc dire ce que « Préparer mon visuel » exige · au
 * moins un mode passe le contrôle. Sinon le titre le dit et nomme le geste qui
 * répare, sans rien deviner de plus que les chemins des violations.
 */
export function etatProduitPret(e: {
  epingle: boolean;
  peutModifier: boolean;
  modes: ReadonlyArray<{ ok: boolean; violations: ReadonlyArray<{ chemin: string }> }>;
}): EtatProduitPret {
  if (!e.epingle) return { pret: false, titre: 'Produit du visuel', remede: null };
  if (e.modes.some((m) => m.ok)) return { pret: true, titre: 'Ton produit est prêt', remede: null };
  const chemins = new Set(e.modes.flatMap((m) => m.violations.map((v) => v.chemin)));
  const titre = 'Ton produit n’est pas encore prêt';
  if (!e.peutModifier) return { pret: false, titre, remede: 'Une personne qui peut modifier le projet peut le corriger · le contrôle avant compilation dit quoi.' };
  if (chemins.has('/brief')) return { pret: false, titre, remede: 'Le projet n’a pas encore de brief · construis-le depuis la fiche du projet, puis reviens ici.' };
  if (chemins.has('/productRef/photo')) return { pret: false, titre, remede: 'La photo épinglée a changé dans le catalogue · choisis une photo ci-dessous, puis « Utiliser cette photo et continuer ».' };
  if (chemins.has('/brief/references')) return { pret: false, titre, remede: 'Clique « Utiliser cette photo et continuer » ci-dessous · la photo redevient la référence Produit du brief.' };
  return { pret: false, titre, remede: 'Corrige les points du contrôle avant compilation · chaque mode dit ce qui bloque.' };
}

/**
 * Le message d'un job commence par son état (« Échec · … », « Terminé · … »,
 * `vueJob`) · posé après la pastille du même état, l'écran disait « Échec ·
 * Échec · ». On garde le détail seul, sa première lettre relevée ; un message
 * qui n'est QUE l'état (« Annulé. ») ne dit rien de plus · chaîne vide.
 */
export function detailSansEtat(libelleEtat: string, message: string): string {
  const m = message.trim();
  if (m === libelleEtat || m === `${libelleEtat}.`) return '';
  const prefixe = `${libelleEtat} · `;
  if (!m.startsWith(prefixe)) return m;
  const reste = m.slice(prefixe.length);
  return reste.charAt(0).toUpperCase() + reste.slice(1);
}

/**
 * Ce que l'écran dit de la version de la photo épinglée. Il affichait
 * l'empreinte brute (« Version sha256-4648864bdc1a6804 · empreinte de
 * l'adresse … 4648864bdc1a… ») · un identifiant technique, rien que
 * l'utilisateur puisse lire ou vérifier. Ce qui compte pour lui : la photo est
 * figée à l'épinglage, et une photo distante n'est suivie que par son adresse.
 */
export function resumeVersionPhoto(nature: 'contenu' | 'adresse'): string {
  return nature === 'adresse'
    ? 'Photo distante, figée à l’épinglage · suivie par son adresse, pas par son contenu'
    : 'Photo figée à l’épinglage · une nouvelle photo du catalogue ne la remplace pas sans ton geste';
}
