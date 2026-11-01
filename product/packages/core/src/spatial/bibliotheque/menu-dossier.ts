import { REFUS_DOSSIER, validerDeplacementDossier, type DossierPlat } from '../../bibliotheque-dossiers';
import { gesteTelechargement } from './archive';
import { dossiersRangement, type CarteDossierDrive, type DonneesDrive, type SectionDrive } from './drive';
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
 *  · « Renommer » · `validerRenommageDossier` (la règle de nom de la création),
 *    puis `renommerDossierAction` · un dossier RÉEL vivant ; un dossier système
 *    (verrouillé) le montre fermé, avec la phrase du serveur ;
 *  · « Déplacer vers… » · la liste de rangement des fichiers (`dossiersRangement`),
 *    chaque destination jugée par `validerDeplacementDossier` (la règle de
 *    l'action) · lui-même, ses descendants, un dossier système ou d'une autre
 *    marque restent proposés, FERMÉS, avec leur raison ; puis `deplacerDossierAction` ;
 *  · « Tag de couleur » · la règle de la barre (`gestesSelection`, geste `tag`)
 *    appliquée à ce seul dossier, puis `definirTagDossierAction` · SEULEMENT là
 *    où la carte n'a pas déjà son propre bouton (`boutonTagSurCarte` · la carte
 *    de la grille, maquette `ftb`) ; en liste, la ligne n'en a pas ;
 *  · « Télécharger » · la règle de la barre (`gesteTelechargement`) appliquée à
 *    ce seul dossier, puis la route d'archive (`/api/bibliotheque/archive`, champ `dossiers`) ;
 *  · « Mettre à la corbeille » / « Restaurer » · la règle de la barre (gestes
 *    `corbeille` / `restaurer`), puis `supprimerDossierAction` / `restaurerDossierAction`.
 *
 * Un dossier que la barre ne retient pas (une racine, un projet Studios · dossier
 * virtuel de « Créations », un dossier verrouillé · système) n'a que « Ouvrir »,
 * « Renommer » et « Déplacer vers… » fermés pour le dossier système (jamais pour
 * un dossier virtuel · ce n'est pas un dossier de la bibliothèque), et le tag là où la barre le pose (un dossier verrouillé se tague · le tag ne
 * détruit rien ; un dossier virtuel jamais). Un geste fermé (lecture seule,
 * borne, archive refusée) reste dans le menu, fermé, avec la phrase de la barre ·
 * jamais simulé.
 */

export type CleMenuDossier = 'ouvrir' | 'renommer' | 'deplacer' | 'tag' | 'telecharger' | 'corbeille' | 'restaurer';
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
  // Renommer, déplacer · un dossier RÉEL vivant, hors corbeille · fermés en lecture seule, ou pour un dossier système.
  const range = x.reel && enVie && !corbeille;
  const fermeRange = (systeme: string) => ctx.lectureSeule ?? (x.verrouille ? systeme : null);
  const renommer = fermeRange(REFUS_DOSSIER.systemeRenommer);
  const deplacer = fermeRange(REFUS_DOSSIER.systemeDeplacer);
  return [
    ...(!corbeille && enVie ? [{ cle: 'ouvrir' as const, libelle: 'Ouvrir', icone: 'folder', ouvert: true, raison: null }] : []),
    ...(range ? [
      { cle: 'renommer' as const, libelle: 'Renommer', icone: 'text', ouvert: renommer === null, raison: renommer },
      { cle: 'deplacer' as const, libelle: 'Déplacer vers…', icone: 'folder', ouvert: deplacer === null, raison: deplacer, sousMenu: true as const },
    ] : []),
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

/**
 * Les dossiers RÉELS vivants, en forme plate pour la règle du noyau · un parent
 * virtuel (la racine « Assets de la marque ») devient `null`, comme en base.
 */
function dossiersPlats(d: DonneesDrive): DossierPlat[] {
  const vivants = d.dossiers.filter((x) => x.reel && vivant(d, x.id));
  const reels = new Set(vivants.map((x) => x.id));
  return vivants.map((x) => ({
    id: x.id, parentId: x.parent && reels.has(x.parent) ? x.parent : null, name: x.nom, brandId: x.marque ?? null, locked: x.verrouille,
  }));
}

/** Une destination de « Déplacer vers… » d'un dossier · fermée avec sa raison quand la règle du serveur la refuse. */
export interface DestinationDossier extends OptionSousMenu {
  raison: string | null;
}

/**
 * Les destinations de « Déplacer vers… » d'un DOSSIER · la MÊME liste que pour
 * un fichier (`dossiersRangement` · la racine « non classé », puis chaque
 * dossier vivant par son chemin). Le parent actuel est marqué (déjà ici) ;
 * chaque autre destination passe la règle de l'action
 * (`validerDeplacementDossier`) · refusée, elle reste dans la liste, fermée,
 * avec la phrase du serveur. `[]` pour un dossier qui ne se déplace pas.
 */
export function destinationsDeplacementDossier(d: DonneesDrive, dossierId: string): DestinationDossier[] {
  const x = d.dossiers.find((y) => y.id === dossierId);
  if (!x?.reel || x.verrouille || !vivant(d, dossierId)) return [];
  const plats = dossiersPlats(d);
  const ici = plats.find((y) => y.id === dossierId)?.parentId ?? null;
  return dossiersRangement(d).map((r) => {
    const actuel = r.id === ici;
    const v = actuel ? null : validerDeplacementDossier(plats, dossierId, r.id);
    return { id: r.id, nom: r.nom, actuel, raison: v && !v.ok ? v.raison : null };
  });
}
