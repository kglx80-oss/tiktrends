/**
 * Bibliothèque V5 · dossiers et droits d'usage · RÈGLES PURES (ni base, ni
 * réseau, ni modèle), donc testables. Les actions serveur
 * (`app/actions/bibliotheque-dossiers.ts`) et le schéma (`library_folders`,
 * `assets.rights`) s'appuient sur ce module · ils ne redéfinissent aucune règle.
 *
 * Trois choses vivent ici :
 *   1. le catalogue NORMATIF des droits (`DROITS_ASSET`) et la règle « quels
 *      droits passent en publicité » (`droitAutorisePub`) ;
 *   2. la validation du nom de dossier (`validerNomDossier`) ;
 *   3. la projection d'une liste plate en ARBRE (`arbreDossiers`) et la règle de
 *      déplacement sans cycle (`peutDeplacerDossier`).
 */

/* ───────────────────────────── Droits d'usage ──────────────────────────────
 *
 * Les quatre droits de l'inventaire V5 (L14), libellés EXACTS à l'écran. On
 * STOCKE une clé stable (le code garde sa propre orthographe) ; le libellé
 * français est rendu par `libelleDroit`. `autorisePub` dit si un média de ce
 * droit peut servir de référence en publicité / IA.
 */
export const DROITS_ASSET = [
  { cle: 'photo_marque',  libelle: 'Photo de la marque', autorisePub: true },
  { cle: 'ugc_accord',    libelle: 'UGC avec accord',    autorisePub: true },
  { cle: 'banque_images', libelle: "Banque d'images",    autorisePub: true },
  { cle: 'a_preciser',    libelle: 'À préciser',          autorisePub: false },
] as const;

export type DroitAsset = (typeof DROITS_ASSET)[number]['cle'];

const DROIT_PAR_CLE = new Map(DROITS_ASSET.map((d) => [d.cle, d] as const));

export function estDroitAsset(x: unknown): x is DroitAsset {
  return typeof x === 'string' && DROIT_PAR_CLE.has(x as DroitAsset);
}

export function libelleDroit(cle: DroitAsset): string {
  return DROIT_PAR_CLE.get(cle)!.libelle;
}

/** Les clés de droit qui autorisent la publicité · SOURCE UNIQUE pour le SQL. */
export const DROITS_PUB_AUTORISES: readonly DroitAsset[] =
  DROITS_ASSET.filter((d) => d.autorisePub).map((d) => d.cle);

/**
 * Un média est-il AUTORISÉ à servir de référence en publicité / IA ?
 *
 *  · `null` / `''` · non classé, hérité → OUI. On ne retire pas l'éligibilité
 *    des médias DÉJÀ présents (non-régression · à confirmer par Kevin) ;
 *  · droit explicitement autorisé → OUI ;
 *  · « À préciser » · droits incertains posés À DESSEIN → NON ;
 *  · toute autre valeur · inconnue → NON (défensif).
 */
export function droitAutorisePub(rights: string | null | undefined): boolean {
  if (rights == null || rights === '') return true;
  const d = DROIT_PAR_CLE.get(rights as DroitAsset);
  return d ? d.autorisePub : false;
}

/* ───────────────────────────── Nom de dossier ───────────────────────────── */

/** Un nom de dossier tient sur une ligne dans l'arbre · borne mesurée côté UI. */
export const LONGUEUR_MAX_NOM_DOSSIER = 80;

export type ValidationNom = { ok: true; nom: string } | { ok: false; raison: string };

export function validerNomDossier(nom: unknown): ValidationNom {
  if (typeof nom !== 'string') return { ok: false, raison: 'Nom de dossier invalide.' };
  const propre = nom.trim();
  if (!propre) return { ok: false, raison: 'Donne un nom au dossier.' };
  if (propre.length > LONGUEUR_MAX_NOM_DOSSIER) {
    return { ok: false, raison: `Nom trop long (max ${LONGUEUR_MAX_NOM_DOSSIER} caractères).` };
  }
  // Un retour à la ligne ou un caractère de contrôle casserait l'affichage en arbre.
  if (/[\u0000-\u001f\u007f]/.test(propre)) {
    return { ok: false, raison: 'Le nom ne peut pas contenir de caractère de contrôle.' };
  }
  return { ok: true, nom: propre };
}

/* ───────────────────────────── Arbre de dossiers ────────────────────────── */

export interface DossierPlat {
  id: string;
  parentId: string | null;
  name: string;
  brandId: string | null;
  locked: boolean;
}
export interface NoeudDossier extends DossierPlat {
  enfants: NoeudDossier[];
}

/**
 * `cur` descend-il (en remontant la chaîne des parents) vers `id` ? C'est-à-dire
 * `id` est-il un ANCÊTRE de `cur` ? Sert à la fois à rompre un cycle dans
 * `arbreDossiers` et à refuser un déplacement d'un dossier dans son sous-arbre.
 * La boucle est bornée par un ensemble de visités · aucune récursion infinie.
 */
function idEstAncetreDe(parents: Map<string, string | null>, id: string, depart: string | null): boolean {
  let cur: string | null | undefined = depart;
  const vus = new Set<string>();
  while (cur != null) {
    if (cur === id) return true;
    if (vus.has(cur)) return false; // boucle qui ne passe pas par `id`
    vus.add(cur);
    cur = parents.get(cur) ?? null;
  }
  return false;
}

/**
 * Projette une liste PLATE en ARBRE (lecture seule, pure) :
 *  · un dossier dont le parent est absent de la liste devient une RACINE (il ne
 *    disparaît jamais) ;
 *  · un cycle est ROMPU · un nœud dont un ancêtre reboucle est raccroché à la
 *    racine plutôt que perdu ou bouclé ;
 *  · enfants et racines triés par nom (ordre français), puis par id (stable).
 */
export function arbreDossiers(dossiers: readonly DossierPlat[]): NoeudDossier[] {
  const noeuds = new Map<string, NoeudDossier>();
  for (const d of dossiers) noeuds.set(d.id, { ...d, enfants: [] });
  const parents = new Map<string, string | null>([...noeuds.values()].map((n) => [n.id, n.parentId]));

  const racines: NoeudDossier[] = [];
  for (const n of noeuds.values()) {
    const parent = n.parentId != null ? noeuds.get(n.parentId) : undefined;
    // Parent absent, ou parent qui ferait boucler (n est ancêtre de son parent) → racine.
    if (!parent || idEstAncetreDe(parents, n.id, n.parentId)) racines.push(n);
    else parent.enfants.push(n);
  }

  const trier = (ns: NoeudDossier[]): void => {
    ns.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
    for (const e of ns) trier(e.enfants);
  };
  trier(racines);
  return racines;
}

/**
 * Peut-on déplacer `id` sous `nouveauParentId` ? Règle pure, sans base.
 *  · `null` → vers la racine : toujours permis ;
 *  · soi-même comme parent : refusé ;
 *  · parent introuvable dans la liste : refusé ;
 *  · parent situé DANS le sous-arbre de `id` (cycle) : refusé.
 */
export type DeplacementDossier = { ok: true } | { ok: false; raison: string };

export function peutDeplacerDossier(
  dossiers: readonly DossierPlat[],
  id: string,
  nouveauParentId: string | null,
): DeplacementDossier {
  if (nouveauParentId == null) return { ok: true };
  if (nouveauParentId === id) return { ok: false, raison: 'Un dossier ne peut pas être son propre parent.' };
  const parents = new Map<string, string | null>(dossiers.map((d) => [d.id, d.parentId]));
  if (!parents.has(nouveauParentId)) return { ok: false, raison: 'Dossier de destination introuvable.' };
  // Le déplacement crée un cycle si la destination est un descendant de `id`,
  // c'est-à-dire si `id` est un ancêtre de la destination.
  if (idEstAncetreDe(parents, id, nouveauParentId)) {
    return { ok: false, raison: 'On ne peut pas déplacer un dossier dans l’un de ses sous-dossiers.' };
  }
  return { ok: true };
}
