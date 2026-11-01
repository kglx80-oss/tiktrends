import { gesteTelechargement } from './archive';
import type { CarteDossierDrive, DonneesDrive, SectionDrive } from './drive';
import type { EntreeMenu, OptionSousMenu } from './menu-fichier';
import { gestesSelection } from './selection';
import { TAGS_COULEUR } from './tags-couleur';

/**
 * Bibliothèque · le MENU « … » d'une carte de DOSSIER (grille et liste) ·
 * RÈGLES PURES (ni base, ni réseau).
 *
 * Le menu porte, à l'unité, les gestes qui EXISTENT déjà sur un dossier ·
 * rien n'y est inventé, aucun geste sans action :
 *  · « Ouvrir » · la navigation de la carte (hors corbeille · un dossier jeté ne s'ouvre pas) ;
 *  · « Tag de couleur » · la règle de la barre (`gestesSelection`, geste `tag`)
 *    appliquée à ce seul dossier, puis `definirTagDossierAction` · SEULEMENT là
 *    où la carte n'a pas déjà son propre bouton (`boutonTagSurCarte` · la carte
 *    de la grille, maquette `ftb`) ; en liste, la ligne n'en a pas ;
 *  · « Télécharger » · la règle de la barre (`gesteTelechargement`) appliquée à
 *    ce seul dossier, puis la route d'archive (`/api/bibliotheque/archive`, champ `dossiers`) ;
 *  · « Mettre à la corbeille » / « Restaurer » · la règle de la barre (gestes
 *    `corbeille` / `restaurer`), puis `supprimerDossierAction` / `restaurerDossierAction`.
 *
 * Renommer n'y est PAS · aucune action serveur ne renomme un dossier.
 *
 * Un dossier que la barre ne retient pas (une racine, un projet Studios · dossier
 * virtuel de « Créations », un dossier verrouillé · système) n'a que « Ouvrir »,
 * et le tag là où la barre le pose (un dossier verrouillé se tague · le tag ne
 * détruit rien ; un dossier virtuel jamais). Un geste fermé (lecture seule,
 * borne, archive refusée) reste dans le menu, fermé, avec la phrase de la barre ·
 * jamais simulé.
 */

export type CleMenuDossier = 'ouvrir' | 'tag' | 'telecharger' | 'corbeille' | 'restaurer';
export type EntreeMenuDossier = EntreeMenu<CleMenuDossier>;

export interface ContexteMenuDossier {
  section: SectionDrive;
  /** La raison de la lecture seule · null = écriture ouverte. */
  lectureSeule: string | null;
  /** La carte de la grille ou la ligne de la liste · seule la carte porte son bouton de tag. */
  variante: 'grille' | 'liste';
}

/** La carte de la grille porte son propre bouton « Tag de couleur » (maquette `ftb`) · le menu ne le double pas. */
export function boutonTagSurCarte(carte: Pick<CarteDossierDrive, 'taggable'>, lectureSeule: string | null): boolean {
  return carte.taggable && lectureSeule === null;
}

/** Ni lui ni un ancêtre en corbeille (même règle que la vue et la barre). */
function vivant(d: DonneesDrive, id: string): boolean {
  const par = new Map(d.dossiers.map((x) => [x.id, x] as const));
  const vus = new Set<string>();
  let cur = par.get(id);
  while (cur && !vus.has(cur.id)) { if (cur.supprime) return false; vus.add(cur.id); cur = cur.parent ? par.get(cur.parent) : undefined; }
  return par.has(id);
}

/** Le menu « … » d'un dossier · `[]` pour un dossier inconnu (disparu depuis). */
export function menuDossier(d: DonneesDrive, dossierId: string, ctx: ContexteMenuDossier): EntreeMenuDossier[] {
  const x = d.dossiers.find((y) => y.id === dossierId);
  if (!x) return [];
  const corbeille = ctx.section === 'corbeille';
  const enVie = vivant(d, dossierId);
  const s = gestesSelection(d, [dossierId], { section: ctx.section, lectureSeule: ctx.lectureSeule, ia: false });
  const unitaire = s.dossiers.length === 1;
  const geste = (cle: 'tag' | 'corbeille' | 'restaurer', icone: string, extra: Partial<EntreeMenuDossier> = {}): EntreeMenuDossier[] => {
    const g = s.gestes.find((y) => y.cle === cle);
    return g ? [{ cle, libelle: g.libelle, icone, ouvert: g.ouvert, raison: g.raison, ...extra }] : [];
  };
  // Le tag · un dossier RÉEL vivant (celui que `selectionATaguer` retient), hors corbeille, là où la carte n'a pas son bouton.
  const taggable = x.reel && enVie && !corbeille;
  const tagIci = taggable && !(ctx.variante === 'grille' && boutonTagSurCarte({ taggable }, ctx.lectureSeule));
  const archive = unitaire && !corbeille ? gesteTelechargement(d, s, ctx.lectureSeule) : null;
  return [
    ...(!corbeille && enVie ? [{ cle: 'ouvrir' as const, libelle: 'Ouvrir', icone: 'folder', ouvert: true, raison: null }] : []),
    ...(tagIci ? geste('tag', 'tag', { sousMenu: true }) : []),
    ...(archive ? [{
      cle: 'telecharger' as const, libelle: archive.libelle, icone: 'down', ouvert: archive.ouvert,
      raison: archive.ouvert ? null : archive.titre, ...(archive.ouvert ? { detail: archive.titre } : {}),
    }] : []),
    ...(unitaire ? (corbeille ? geste('restaurer', 'check') : geste('corbeille', 'x')) : []),
  ];
}

/** Les options de « Tag de couleur » · les 8 tags (le tag porté marqué), puis « Retirer le tag » s'il en porte un. */
export function optionsTagDossier(d: DonneesDrive, dossierId: string): OptionSousMenu[] {
  const x = d.dossiers.find((y) => y.id === dossierId);
  if (!x?.reel) return [];
  return [
    ...TAGS_COULEUR.map((t) => ({ id: t.cle, nom: t.libelle, actuel: x.tag === t.cle, teinte: t.teinte })),
    ...(x.tag ? [{ id: null, nom: 'Retirer le tag', actuel: false, icone: 'x' }] : []),
  ];
}
