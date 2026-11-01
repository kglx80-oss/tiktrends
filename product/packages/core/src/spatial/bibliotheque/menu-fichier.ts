import { dossiersRangement, type DonneesDrive, type SectionDrive } from './drive';
import { DETAIL_LIEN_INTERNE, lienInterneFichier } from './lien-interne';
import { gestesSelection } from './selection';
import { versementApercu } from './versement';

/**
 * Bibliothèque · le MENU « … » d'une carte de fichier (grille et liste) ·
 * RÈGLES PURES (ni base, ni réseau).
 *
 * Le menu porte, à l'unité, les gestes qui EXISTENT déjà · rien n'y est
 * inventé, aucun geste sans action :
 *  · « Aperçu » · ouvre l'aperçu du fichier ;
 *  · « Ouvrir le projet » · une sortie Studios, vers son projet (le lien de l'aperçu) ;
 *  · « Déplacer vers… » · la règle de la barre (`gestesSelection`, geste `ranger`)
 *    appliquée à ce seul fichier, puis l'action groupée `affecterAssetsDossierAction` ;
 *  · « Utiliser dans un projet » · la règle de l'aperçu (`versementApercu`), puis
 *    la fenêtre de versement ;
 *  · « Télécharger » · le lien de l'aperçu (le fichier lui-même, adresse gardée) ;
 *  · « Copier le lien » · le lien INTERNE de l'écran qui rouvre son aperçu
 *    (`lienInterneFichier`) · seulement s'il le rouvre (fichier de la
 *    bibliothèque, vivant), ouvert en lecture seule aussi (c'est une lecture) ;
 *  · « Mettre à la corbeille » / « Restaurer » · la règle de la barre (gestes
 *    `corbeille` / `restaurer`) appliquée à ce seul fichier, puis la même action
 *    que l'aperçu (réversible, aucun objet du bucket effacé).
 *
 * Un fichier qui ne se sélectionne pas (sortie Studios, ancienne création) ou
 * qui n'est pas dans la section affichée n'a que l'aperçu, son projet et le
 * téléchargement. Un geste fermé (lecture seule, borne, écart) reste dans le
 * menu, fermé, avec la phrase de la barre · jamais simulé. La suppression
 * DÉFINITIVE, les droits, l'IA et l'analyse restent dans l'aperçu.
 */

export type CleMenuFichier = 'apercu' | 'ouvrir-projet' | 'ranger' | 'projet' | 'telecharger' | 'copier-lien' | 'corbeille' | 'restaurer';

/** Une entrée d'un menu « … » de la Bibliothèque (fichier ou dossier) · même forme, même composant. */
export interface EntreeMenu<C extends string = string> {
  cle: C;
  libelle: string;
  /** Une icône du jeu partagé (sprite Spatial). */
  icone: string;
  ouvert: boolean;
  /** Pourquoi le geste est fermé · null quand il est ouvert. */
  raison: string | null;
  /** Un lien plutôt qu'un geste · « Ouvrir le projet », « Télécharger ». */
  href?: string;
  /** Ouvre une liste dans le menu · « Déplacer vers… » (les dossiers), « Tag de couleur » (les tags) · un menu peut en porter plusieurs. */
  sousMenu?: true;
  /** Ouvert · ce que le geste fera, dit dans l'infobulle (« Archive ZIP de … »). */
  detail?: string;
}

export type EntreeMenuFichier = EntreeMenu<CleMenuFichier>;

const ouvert = (cle: CleMenuFichier, libelle: string, icone: string, extra: Partial<EntreeMenuFichier> = {}): EntreeMenuFichier =>
  ({ cle, libelle, icone, ouvert: true, raison: null, ...extra });

/** Le menu « … » d'un fichier · `[]` pour un fichier inconnu (disparu depuis). */
export function menuFichier(d: DonneesDrive, fichierId: string, ctx: { section: SectionDrive; lectureSeule: string | null }): EntreeMenuFichier[] {
  const f = d.fichiers.find((x) => x.id === fichierId);
  if (!f) return [];
  const s = gestesSelection(d, [fichierId], { section: ctx.section, lectureSeule: ctx.lectureSeule, ia: false });
  const unitaire = s.fichiers.length === 1;
  const geste = (cle: 'ranger' | 'corbeille' | 'restaurer', icone: string, extra: Partial<EntreeMenuFichier> = {}): EntreeMenuFichier[] => {
    const g = s.gestes.find((x) => x.cle === cle);
    return g ? [{ cle, libelle: g.libelle, icone, ouvert: g.ouvert, raison: g.raison, ...extra }] : [];
  };
  const corbeille = ctx.section === 'corbeille';
  const versement = unitaire && !corbeille ? versementApercu(d, fichierId, ctx.lectureSeule) : null;
  return [
    ouvert('apercu', 'Aperçu', 'eye'),
    ...(f.projet ? [ouvert('ouvrir-projet', 'Ouvrir le projet', 'brush', { href: f.projet.href })] : []),
    ...(unitaire && !corbeille ? geste('ranger', 'folder', { sousMenu: true }) : []),
    ...(versement ? [{ cle: 'projet' as const, libelle: versement.libelle, icone: 'brush', ouvert: versement.ouvert, raison: versement.raison }] : []),
    ouvert('telecharger', 'Télécharger', 'down', { href: f.telecharger ?? f.url }),
    ...(lienInterneFichier(d, fichierId) ? [ouvert('copier-lien', 'Copier le lien', 'copy', { detail: DETAIL_LIEN_INTERNE })] : []),
    ...(unitaire ? (corbeille ? geste('restaurer', 'check') : geste('corbeille', 'x')) : []),
  ];
}

/** Une option de la liste ouverte dans un menu (un dossier de destination, un tag) · même forme pour le composant. */
export interface OptionSousMenu {
  id: string | null;
  nom: string;
  /** Déjà le cas · proposé, mais sans effet (fermé). */
  actuel: boolean;
  /** La teinte d'un tag de couleur (pastille de l'option). */
  teinte?: string;
  /** Une icône du jeu partagé, à la place de celle par défaut. */
  icone?: string;
  /** Proposée mais FERMÉE · pourquoi (une destination interdite d'un dossier · lui-même, un descendant). */
  raison?: string | null;
}

export interface DestinationDeplacement extends OptionSousMenu {
  /** Le dossier · `null` pour « Assets de la marque · non classé ». */
  id: string | null;
}

/** Les dossiers de « Déplacer vers… » · ceux de la barre (`dossiersRangement`), le dossier actuel marqué. */
export function destinationsDeplacement(d: DonneesDrive, fichierId: string): DestinationDeplacement[] {
  const f = d.fichiers.find((x) => x.id === fichierId);
  if (!f) return [];
  const reels = new Set(d.dossiers.filter((x) => x.reel).map((x) => x.id));
  const ici = reels.has(f.parent) ? f.parent : null;
  return dossiersRangement(d).map((r) => ({ id: r.id, nom: r.nom, actuel: r.id === ici }));
}

/** La touche qui déplace le focus dans un menu · l'index suivant (boucle), ou `null` pour une autre touche. */
export function focusMenuSuivant(touche: string, courant: number, n: number): number | null {
  if (n <= 0) return null;
  if (touche === 'ArrowDown') return (courant + 1 + n) % n;
  if (touche === 'ArrowUp') return (courant - 1 + n) % n;
  if (touche === 'Home') return 0;
  if (touche === 'End') return n - 1;
  return null;
}
