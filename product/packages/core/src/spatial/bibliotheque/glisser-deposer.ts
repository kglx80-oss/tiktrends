import { dossiersRangement, RACINES_DRIVE, type DonneesDrive, type SectionDrive } from './drive';
import { destinationsDeplacement } from './menu-fichier';
import { destinationsDeplacementDossier, menuDossier } from './menu-dossier';
import { gestesSelection } from './selection';

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
 *    pas système, écriture ouverte) ;
 *  · ce qui REÇOIT (`verdictDepot`) · la cible est jugée par la liste du menu ·
 *    pour des fichiers, les destinations de rangement (`dossiersRangement`,
 *    la racine « Assets de la marque » valant « non classé ») ; pour un
 *    dossier, ses destinations jugées par la règle de l'action
 *    (`destinationsDeplacementDossier` → `validerDeplacementDossier` · lui-même,
 *    l'un de ses descendants, un dossier système ou d'une autre marque sont
 *    REFUSÉS, avec la phrase du serveur). Déjà là, la cible refuse aussi · un
 *    dépôt sans effet n'envoie rien.
 *
 * Une cible refusée ne reçoit rien · l'écran la montre « interdite » et
 * n'appelle aucune action.
 */

/** Ce qui est glissé · des fichiers (un seul, ou la sélection), ou un dossier. */
export type ChargeGlissee =
  | { type: 'fichiers'; ids: string[] }
  | { type: 'dossier'; id: string; nom: string };

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
  return deplacer?.ouvert ? { type: 'dossier', id, nom: x.nom } : null;
}

/** L'élément se glisse-t-il (attribut `draggable`) · la même règle que `chargeGlissee`, sans sélection. */
export function glissable(d: DonneesDrive, id: string, ctx: ContexteGlisser): boolean {
  return chargeGlissee(d, id, [], ctx) !== null;
}

/** Ce que la cible `cibleId` (un dossier de l'arbre, de la grille ou de la liste) fait de la charge glissée. */
export function verdictDepot(d: DonneesDrive, charge: ChargeGlissee, cibleId: string): VerdictDepot {
  const destination = destinationDe(cibleId);
  if (charge.type === 'dossier') {
    const o = destinationsDeplacementDossier(d, charge.id).find((x) => x.id === destination);
    if (!o) return { ok: false, raison: REFUS_DEPOT.cible };
    if (o.actuel) return { ok: false, raison: REFUS_DEPOT.dossierIci };
    if (o.raison) return { ok: false, raison: o.raison };
    return { ok: true, destination, nom: o.nom };
  }
  const r = dossiersRangement(d).find((x) => x.id === destination);
  if (!r || !charge.ids.length) return { ok: false, raison: REFUS_DEPOT.cible };
  const tousIci = charge.ids.every((fid) => destinationsDeplacement(d, fid).find((x) => x.id === destination)?.actuel);
  if (tousIci) return { ok: false, raison: charge.ids.length > 1 ? REFUS_DEPOT.fichiersIci : REFUS_DEPOT.fichierIci };
  return { ok: true, destination, nom: r.nom };
}
