import { voisinsDetail, type MotsVoisins, type VoisinsDetail } from '../veille/filtres-locaux';
import { lienNouveauProjet } from '../../studios/anciennes-adresses';
import { LIBELLE_TYPE_FICHIER, formatTaille, pastilleDroit, type DonneesDrive, type FichierDrive } from './drive';
import { RAISONS_VERSEMENT, refusFichiersVersement, versementApercu, type LigneMediaVersement } from './versement';

/**
 * Bibliothèque · l'APERÇU COMPLET d'un fichier (lot 12 V5 · VB L25, L26, L30,
 * PC A21). Règles PURES · ni base, ni réseau.
 *
 *  · la navigation · « Précédent » / « Suivant » et les flèches du clavier dans
 *    la liste AFFICHÉE (filtrée, dans l'ordre de la grille ou de la liste) · la
 *    règle de la Veille (#1044, `voisinsDetail`, `toucheNavigationDetail`),
 *    seuls les mots changent (`MOTS_VOISINS_FICHIER`) · arrêt aux bornes, sans
 *    boucler, la raison dite ;
 *  · les métadonnées utiles · type, dimensions LUES À L'AFFICHAGE (aucune
 *    colonne · l'image ou la vidéo chargée les donne, VB L30), poids, date
 *    d'ajout complète, source, dossier, droits ;
 *  · le fond (damier, fond de l'écran, fond inversé) et le zoom (ajusté,
 *    taille réelle) · VB L25 ;
 *  · « Ajouter au brief » · la règle de « Utiliser dans un projet »
 *    (`versementApercu`) appliquée à ce fichier, et le lien vers l'assistant
 *    « Nouveau projet » armé de ce fichier (`lienNouveauProjet`, `media`) ·
 *    rien n'est créé ni généré à l'ouverture.
 */

export const MOTS_VOISINS_FICHIER: MotsVoisins = {
  absent: 'Ce fichier n’est plus dans la liste affichée',
  seul: 'Seul fichier de la liste', premier: 'Premier fichier de la liste', dernier: 'Dernier fichier de la liste',
  position: (k, n) => `Fichier ${k} sur ${n}`,
};

/** Précédent / suivant d'un fichier dans la liste AFFICHÉE (`VueDrive.fichiers`, dans leur ordre). */
export function navigationApercu(affiches: ReadonlyArray<{ id: string }>, id: string): VoisinsDetail {
  return voisinsDetail(affiches.map((f) => f.id), id, MOTS_VOISINS_FICHIER);
}

export type FondApercu = 'damier' | 'ecran' | 'inverse';
export type ZoomApercu = 'ajuste' | 'reel';

/**
 * Les fonds · par JETONS (aucune couleur littérale) · « fond de l'écran » et
 * « fond inversé » suivent le thème (clair ou sombre), le damier révèle la
 * transparence d'un PNG ou d'un logo.
 */
export const FONDS_APERCU: ReadonlyArray<{ cle: FondApercu; libelle: string; style: string }> = [
  { cle: 'damier', libelle: 'Damier', style: 'repeating-conic-gradient(var(--paper) 0 25%, var(--surface) 0 50%) 0 0 / 20px 20px' },
  { cle: 'ecran', libelle: 'Fond de l’écran', style: 'var(--bg)' },
  { cle: 'inverse', libelle: 'Fond inversé', style: 'var(--ink)' },
];
export const ZOOMS_APERCU: ReadonlyArray<{ cle: ZoomApercu; libelle: string }> = [
  { cle: 'ajuste', libelle: 'Ajusté' },
  { cle: 'reel', libelle: 'Taille réelle' },
];

/** Ce que l'aperçu complet montre en grand · une image ou une vidéo se lit, un son s'écoute, le reste se télécharge. */
export function renduApercu(f: Pick<FichierDrive, 'type'>): 'image' | 'video' | 'audio' | 'fichier' {
  if (f.type === 'image' || f.type === 'svg') return 'image';
  if (f.type === 'video') return 'video';
  if (f.type === 'audio') return 'audio';
  return 'fichier';
}

/** Le fond et le zoom ne valent que pour ce qui s'affiche en grand (image ou vidéo) · fermés sinon, avec leur raison. */
export function reglagesApercu(f: Pick<FichierDrive, 'type'>): { ouvert: boolean; raison: string | null } {
  const r = renduApercu(f);
  return r === 'image' || r === 'video' ? { ouvert: true, raison: null } : { ouvert: false, raison: r === 'audio' ? 'Un son n’a ni fond ni zoom.' : 'Ce type de fichier ne s’affiche pas en grand · télécharge-le.' };
}

/** Dimensions lues à l'affichage · « 1080 × 1920 px » · rien d'inventé quand le navigateur ne les donne pas. */
export function libelleDimensions(l: number | null | undefined, h: number | null | undefined): string | null {
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
  if (!ok(l) || !ok(h)) return null;
  return `${Math.round(l).toLocaleString('fr-FR')} × ${Math.round(h).toLocaleString('fr-FR')} px`;
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** La date d'ajout complète · « 18 octobre 2026 » (UTC, comme `libelleJour`). */
export function dateAjoutComplete(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date inconnue';
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export type EtatDimensions = { etat: 'lues'; largeur: number; hauteur: number } | { etat: 'attente' } | { etat: 'illisibles' };

/** Les métadonnées utiles, dans l'ordre de la maquette (Dimensions, Poids, Source, Ajouté) puis le rangement et les droits. */
export function metaApercuComplet(f: FichierDrive, o: { dossier: string; dimensions: EtatDimensions }): Array<{ cle: string; libelle: string; valeur: string }> {
  const r = renduApercu(f);
  const dims = r !== 'image' && r !== 'video' ? 'Sans objet pour ce type'
    : o.dimensions.etat === 'lues' ? (libelleDimensions(o.dimensions.largeur, o.dimensions.hauteur) ?? 'Non données par le fichier')
      : o.dimensions.etat === 'attente' ? 'Lues à l’affichage…' : 'Non données par le fichier';
  return [
    { cle: 'type', libelle: 'Type', valeur: LIBELLE_TYPE_FICHIER[f.type] },
    { cle: 'dimensions', libelle: 'Dimensions', valeur: dims },
    { cle: 'poids', libelle: 'Poids', valeur: formatTaille(f.tailleOctets) },
    { cle: 'source', libelle: 'Source', valeur: f.source },
    { cle: 'ajoute', libelle: 'Ajouté', valeur: dateAjoutComplete(f.creeLe) },
    { cle: 'dossier', libelle: 'Dossier', valeur: f.projet ? `Projet « ${f.projet.titre} »` : o.dossier },
    { cle: 'droits', libelle: 'Droits', valeur: f.lectureSeule ? 'Création des Studios · lecture seule' : pastilleDroit(f.droit).libelle },
  ];
}

/* ───────────────────────── « Ajouter au brief » ───────────────────────── */

export const RAISONS_AJOUT_BRIEF = {
  lectureSeule: 'Une création des Studios ou d’un ancien studio reste dans son projet · seuls les médias de la Bibliothèque deviennent des références.',
  corbeille: 'Ce fichier est à la corbeille · restaure-le avant de l’ajouter à un brief.',
} as const;

export interface AjoutBrief {
  ouvert: boolean;
  raison: string | null;
  /** L'assistant « Nouveau projet » armé de ce fichier · seulement quand le geste est ouvert. */
  nouveauProjet: string | null;
}

/**
 * « Ajouter au brief » d'un fichier · la règle de « Utiliser dans un projet »
 * (image, droits autorisant la publicité, écriture ouverte · `versementApercu`)
 * et, ouverte, l'adresse de l'assistant avec ce fichier en référence. Fermé,
 * la raison est dite à côté (jamais un bouton muet).
 */
export function ajoutBriefApercu(d: DonneesDrive, id: string, lectureSeule: string | null): AjoutBrief {
  const f = d.fichiers.find((x) => x.id === id);
  if (!f) return { ouvert: false, raison: RAISONS_AJOUT_BRIEF.lectureSeule, nouveauProjet: null };
  if (f.lectureSeule) return { ouvert: false, raison: RAISONS_AJOUT_BRIEF.lectureSeule, nouveauProjet: null };
  if (f.supprime) return { ouvert: false, raison: RAISONS_AJOUT_BRIEF.corbeille, nouveauProjet: null };
  const v = versementApercu(d, id, lectureSeule);
  if (!v) return { ouvert: false, raison: RAISONS_AJOUT_BRIEF.lectureSeule, nouveauProjet: null };
  if (!v.ouvert) return { ouvert: false, raison: v.raison, nouveauProjet: null };
  return { ouvert: true, raison: null, nouveauProjet: lienNouveauProjet({ type: 'ads', medias: [id] }) };
}

/**
 * L'assistant « Nouveau projet » ouvert avec des médias (`media`) · chacun est
 * relu dans l'espace de la session et jugé pour la MARQUE ACTIVE par la règle
 * du versement (`refusFichiersVersement` · introuvable, corbeille, pas une
 * image, autre marque, droits) · seuls les retenus sont proposés comme
 * références, dans l'ordre de l'adresse · les autres sont comptés, jamais
 * nommés (un fichier d'une autre marque ne se révèle pas).
 */
export function mediasRetenusBrief(lignes: readonly LigneMediaVersement[], ids: readonly string[], brandActive: string | null): Array<{ id: string; nom: string }> {
  if (!brandActive) return [];
  const parId = new Map(lignes.map((l) => [l.id.toLowerCase(), l] as const));
  return ids.flatMap((id) => {
    const l = parId.get(id.toLowerCase());
    return l && refusFichiersVersement([l], [id], brandActive).length === 0 ? [{ id: l.id.toLowerCase(), nom: l.name }] : [];
  });
}

/**
 * Ce qui manque avant que l'assistant verse les médias de la Bibliothèque dans
 * les références du projet · le rôle puis la portée, CHOISIS (jamais déduits ·
 * mêmes phrases que la fenêtre « Utiliser dans un projet »). `null` · rien ne
 * manque (ou aucun média à verser).
 */
export function raisonMediasBrief(n: number, role: string | null | undefined, scope: string | null | undefined): string | null {
  if (n <= 0) return null;
  if (!role) return `Références de la Bibliothèque · ${RAISONS_VERSEMENT.role}`;
  if (!scope) return `Références de la Bibliothèque · ${RAISONS_VERSEMENT.portee}`;
  return null;
}
