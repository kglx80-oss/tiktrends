import { dossiersRangement, RACINES_DRIVE, type DonneesDrive, type NoeudArbreDrive, type SectionDrive } from './drive';
import { destinationsDeplacement } from './menu-fichier';
import { destinationsDeplacementDossier, destinationsDeplacementSelection, menuDossier } from './menu-dossier';
import { fichierSelectionnable, gestesSelection } from './selection';

/**
 * Bibliothèque · le GLISSER-DÉPOSER (souris) d'un fichier, d'une sélection de
 * fichiers ou d'un dossier sur un dossier de l'arbre, de la grille ou de la
 * liste · RÈGLES PURES (ni base, ni réseau).
 *
 * Le glisser n'est qu'un RACCOURCI de « Déplacer vers… » · il n'invente aucun
 * droit, il applique les règles qui existent déjà, et la voie accessible reste
 * le menu « … » (clavier) :
 *  · ce qui PART (`chargeGlissee`) · un fichier part si « Déplacer vers… » de
 *    la barre lui est ouvert, à lui seul (`gestesSelection`, geste `ranger` ·
 *    jamais en lecture seule, jamais une sortie Studios, jamais dans la
 *    corbeille) ; s'il est SÉLECTIONNÉ, toute la sélection de fichiers part
 *    avec lui (même borne, même refus que la barre) ; un dossier part si
 *    « Déplacer vers… » de son menu est ouvert (`menuDossier` · réel, vivant,
 *    pas système, écriture ouverte) ; s'il est SÉLECTIONNÉ avec d'autres
 *    dossiers, les DOSSIERS de la sélection partent avec lui (jamais ses
 *    fichiers · même borne, même refus que « Déplacer vers… » de la barre) ;
 *  · ce qui REÇOIT (`verdictDepot`) · la cible est jugée par la liste du menu ·
 *    pour des fichiers, les destinations de rangement (`dossiersRangement`,
 *    la racine « Assets de la marque » valant « non classé ») ; pour un
 *    dossier, ses destinations jugées par la règle de l'action
 *    (`destinationsDeplacementDossier` → `validerDeplacementDossier` · lui-même,
 *    l'un de ses descendants, un dossier système ou d'une autre marque sont
 *    REFUSÉS, avec la phrase du serveur) ; pour plusieurs dossiers, la liste
 *    de la barre (`destinationsDeplacementSelection` →
 *    `validerDeplacementDossiers` · tout ou rien, la cible ne doit être ni l'un
 *    d'eux ni le descendant de l'un d'eux · le cycle CROISÉ compris). Déjà là,
 *    la cible refuse aussi · un dépôt sans effet n'envoie rien.
 *
 * Deux règles du survol, hors de la charge :
 *  · la zone d'IMPORT ne répond qu'à un glisser qui porte des fichiers de
 *    l'ordinateur (`porteDesFichiers` · le type `Files` du transfert) ;
 *  · un nœud REPLIÉ de l'arbre survolé pendant un glisser se déplie après
 *    `DELAI_DEPLIAGE_SURVOL_MS` (`deplieAuSurvol`).
 *
 * Une cible refusée ne reçoit rien · l'écran la montre « interdite » et
 * n'appelle aucune action.
 */

/** Ce qui est glissé · des fichiers (un seul, ou la sélection), un dossier, ou les dossiers de la sélection (au moins deux). */
export type ChargeGlissee =
  | { type: 'fichiers'; ids: string[] }
  | { type: 'dossier'; id: string; nom: string }
  | { type: 'dossiers'; ids: string[] };

export interface ContexteGlisser {
  section: SectionDrive;
  /** La raison de la lecture seule · null = écriture ouverte. Rien ne se glisse sans elle. */
  lectureSeule: string | null;
}

/** Le verdict d'une cible · la destination à envoyer (`null` · la racine, non classé) et son nom, ou le refus dit. */
export type VerdictDepot =
  | { ok: true; destination: string | null; nom: string }
  | { ok: false; raison: string };

export const REFUS_DEPOT = {
  cible: 'Ce dossier ne reçoit pas de dépôt · seuls les dossiers de la bibliothèque en reçoivent.',
  fichierIci: 'Le fichier est déjà ici.',
  fichiersIci: 'Les fichiers sont déjà ici.',
  dossierIci: 'Le dossier est déjà ici.',
  dossiersIci: 'Les dossiers sont déjà ici.',
} as const;

const ID_RACINE_ASSETS = RACINES_DRIVE.find((r) => r.cle === 'assets')!.id;

/** La racine « Assets de la marque » est la destination « non classé » (`null`, comme en base). */
const destinationDe = (cibleId: string): string | null => (cibleId === ID_RACINE_ASSETS ? null : cibleId);

/**
 * Ce qui part quand on glisse l'élément `id` · `null` s'il ne se glisse pas
 * (lecture seule, corbeille, sortie Studios, dossier système, racine, projet,
 * inconnu) ou si la sélection qu'il emporte est refusée par la barre (borne).
 */
export function chargeGlissee(d: DonneesDrive, id: string, selection: Iterable<string>, ctx: ContexteGlisser): ChargeGlissee | null {
  const base = { section: ctx.section, lectureSeule: ctx.lectureSeule, ia: false };
  if (d.fichiers.some((f) => f.id === id)) {
    const seul = gestesSelection(d, [id], base);
    if (seul.fichiers.length !== 1 || !seul.gestes.find((g) => g.cle === 'ranger')?.ouvert) return null;
    const ids = new Set(selection);
    if (!ids.has(id)) return { type: 'fichiers', ids: [id] };
    // Seuls les FICHIERS de la sélection partent · une sélection mixte ferme
    // « Déplacer vers… » de la barre (dossiers et fichiers ne se déplacent pas
    // par la même action), mais le glisser d'un fichier n'emporte que les fichiers.
    const groupe = gestesSelection(d, [...ids].filter((x) => d.fichiers.some((f) => f.id === x)), base);
    if (!groupe.gestes.find((g) => g.cle === 'ranger')?.ouvert) return null;
    return { type: 'fichiers', ids: groupe.fichiers.map((f) => f.id) };
  }
  const x = d.dossiers.find((y) => y.id === id);
  if (!x) return null;
  const deplacer = menuDossier(d, id, { ...ctx, variante: 'liste' }).find((e) => e.cle === 'deplacer');
  if (!deplacer?.ouvert) return null;
  const ids = new Set(selection);
  if (!ids.has(id)) return { type: 'dossier', id, nom: x.nom };
  // Seuls les DOSSIERS de la sélection partent (comme le glisser d'un fichier n'emporte que les fichiers) · la barre
  // les retient (`gestesSelection` · réels, vivants, pas système) et ferme « Déplacer vers… » au-delà de la borne.
  const groupe = gestesSelection(d, [...ids].filter((y) => d.dossiers.some((z) => z.id === y)), base);
  if (!groupe.gestes.find((g) => g.cle === 'ranger')?.ouvert) return null;
  return groupe.dossiers.length > 1 ? { type: 'dossiers', ids: groupe.dossiers.map((y) => y.id) } : { type: 'dossier', id, nom: x.nom };
}

/** L'élément se glisse-t-il (attribut `draggable`) · la même règle que `chargeGlissee`, sans sélection. */
export function glissable(d: DonneesDrive, id: string, ctx: ContexteGlisser): boolean {
  return chargeGlissee(d, id, [], ctx) !== null;
}

/**
 * Tous les éléments qui se glissent, calculés UNE fois pour l'écran · la même
 * règle que `glissable`. `glissable` relu carte par carte reparcourt toute la
 * liste à chaque carte · un rendu QUADRATIQUE, mesuré à 80 s pour 3 000 cartes
 * (tableau de `pagination.ts`). Ici · un fichier se glisse quand
 * « Déplacer vers… » lui est ouvert à lui seul (`gestesSelection` ·
 * sélectionnable, vivant, dans un dossier vivant, hors corbeille, écriture
 * ouverte) · un dossier par `glissable` (ils sont peu nombreux). L'égalité avec
 * `glissable` est gardée par un test sur des données mêlées.
 */
export function elementsGlissables(d: DonneesDrive, ctx: ContexteGlisser): Set<string> {
  const out = new Set<string>();
  if (!ctx.lectureSeule && ctx.section !== 'corbeille') {
    const par = new Map(d.dossiers.map((x) => [x.id, x] as const));
    const memo = new Map<string, boolean>();
    const vivant = (id: string): boolean => {
      const m = memo.get(id);
      if (m !== undefined) return m;
      const vus = new Set<string>();
      let cur = par.get(id);
      let ok = !!cur;
      while (cur && !vus.has(cur.id)) { if (cur.supprime) { ok = false; break; } vus.add(cur.id); cur = cur.parent ? par.get(cur.parent) : undefined; }
      memo.set(id, ok);
      return ok;
    };
    for (const f of d.fichiers) if (fichierSelectionnable(f) && !f.supprime && vivant(f.parent)) out.add(f.id);
  }
  for (const x of d.dossiers) if (glissable(d, x.id, ctx)) out.add(x.id);
  return out;
}

/** Ce que la cible `cibleId` (un dossier de l'arbre, de la grille ou de la liste) fait de la charge glissée. */
export function verdictDepot(d: DonneesDrive, charge: ChargeGlissee, cibleId: string): VerdictDepot {
  const destination = destinationDe(cibleId);
  if (charge.type === 'dossier' || charge.type === 'dossiers') {
    const liste = charge.type === 'dossier' ? destinationsDeplacementDossier(d, charge.id) : destinationsDeplacementSelection(d, charge.ids);
    const o = liste.find((x) => x.id === destination);
    if (!o) return { ok: false, raison: REFUS_DEPOT.cible };
    if (o.actuel) return { ok: false, raison: charge.type === 'dossier' ? REFUS_DEPOT.dossierIci : REFUS_DEPOT.dossiersIci };
    if (o.raison) return { ok: false, raison: o.raison };
    return { ok: true, destination, nom: o.nom };
  }
  const r = dossiersRangement(d).find((x) => x.id === destination);
  if (!r || !charge.ids.length) return { ok: false, raison: REFUS_DEPOT.cible };
  const tousIci = charge.ids.every((fid) => destinationsDeplacement(d, fid).find((x) => x.id === destination)?.actuel);
  if (tousIci) return { ok: false, raison: charge.ids.length > 1 ? REFUS_DEPOT.fichiersIci : REFUS_DEPOT.fichierIci };
  return { ok: true, destination, nom: r.nom };
}

/** La charge contient-elle le dossier `id` · la source elle-même n'est pas mise en évidence au survol. */
export function chargeContient(charge: ChargeGlissee, id: string): boolean {
  return charge.type === 'dossier' ? charge.id === id : charge.ids.includes(id);
}

/**
 * Le glisser porte-t-il des FICHIERS de l'ordinateur · le seul qui ouvre la zone d'import. Les navigateurs annoncent
 * des fichiers par le type `Files` de `dataTransfer.types` (spécification HTML, « drag data store item list ») · un
 * texte, un lien, une image glissée d'une autre page ou un glisser interne n'en portent pas · ni état, ni import.
 * `types` est un tableau figé (navigateurs actuels) ou une `DOMStringList` (anciens) · les deux se lisent par index.
 */
export function porteDesFichiers(types: ArrayLike<string> | null | undefined): boolean {
  return !!types && Array.from(types).includes('Files');
}

/**
 * Le délai avant qu'un nœud REPLIÉ de l'arbre, survolé pendant un glisser, ne se déplie · 500 ms, la valeur des
 * arbres de référence, relue dans leur source :
 *  · VS Code (`src/vs/base/browser/ui/tree/abstractTree.ts` · `disposableTimeout(…, 500)` du dépliage au survol) ;
 *  · GTK (`gtk/gtktreeview.c` · `#define AUTO_EXPAND_TIMEOUT 500`) ;
 *  · jsTree (`src/jstree.dnd.js` · `open_timeout : 500`).
 * Assez long pour qu'un survol de PASSAGE (la souris traverse l'arbre vers un autre nœud) n'ouvre rien, assez court
 * pour qu'une pause volontaire ouvre sans attente sensible. Quitter le nœud avant l'échéance l'annule.
 */
export const DELAI_DEPLIAGE_SURVOL_MS = 500;

/**
 * Le nœud `n` de l'arbre se déplie-t-il au survol prolongé de la charge · un nœud qui a des enfants et qui est
 * replié, pendant un glisser interne. Jamais un dossier qui part · ses descendants refusent tous le dépôt
 * (anti-cycle), l'ouvrir ne mènerait nulle part.
 */
export function deplieAuSurvol(n: Pick<NoeudArbreDrive, 'id' | 'aEnfants' | 'ouvert'>, charge: ChargeGlissee | null): boolean {
  if (!charge || !n.aEnfants || n.ouvert) return false;
  return charge.type === 'fichiers' || !chargeContient(charge, n.id);
}
