import { LIMITE_BIBLIOTHEQUE } from '../../studios/bibliotheque';
import {
  cheminValide, fichierDepuisMedia, FILTRES_TYPE_DRIVE, normaliserRechercheDrive, RACINES_DRIVE,
  type DonneesDrive, type DossierSource, type EtatDrive, type FiltreTypeDrive, type MediaSource, type VueDrive,
} from './drive';

/**
 * Bibliothèque · au-delà des fichiers que l'écran charge · RÈGLES PURES (ni
 * base, ni réseau).
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * La page chargeait les 400 médias les plus récents (`listAssets`) et l'écran
 * rangeait, comptait et cherchait dans ces seuls 400 · au-delà, un dossier
 * paraissait plus petit (ou vide), un compte mentait et une recherche ne
 * trouvait pas un fichier ancien, sans que rien ne le dise.
 *
 * ── La stratégie, choisie sur mesure ─────────────────────────────────────────
 *
 * Mesuré le 02/11/2026 · vraie page Spatial `/assets` sur pglite (migrations
 * du dépôt), un espace de N médias vivants (60 % à la racine, le reste dans
 * 8 dossiers), médiane de 5 passes, machine de développement à 4 cœurs
 * partagée avec deux autres tâches.
 *
 * | N fichiers                                  | 400      | 1 000    | 5 000     |
 * | ------------------------------------------- | -------- | -------- | --------- |
 * | Page actuelle (400 chargés), lecture + rendu | 182 ms   | 155 ms   | 184 ms    |
 * | Tout charger · requête                       | 6 ms     | 18 ms    | 84 ms     |
 * | Tout charger · `vueDrive`                    | 1,0 ms   | 2,6 ms   | 22,6 ms   |
 * | Tout charger · rendu de l'écran (racine)     | 145 ms   | 1 204 ms | 79 738 ms |
 * | Tout charger · HTML · données envoyées       | 243 · 154 Ko | 582 · 383 Ko | 2 841 · 1 915 Ko |
 * | Comptes agrégés (une requête GROUP BY)       | 1,7 ms   | 2,2 ms   | 4,4 ms    |
 * | Une page de 200 d'un dossier, par curseur    | 1,5 ms   | 1,6 ms   | 2,7 ms    |
 * | Recherche serveur (nom ou tag, sans accent)  | 6,9 ms   | 5,1 ms   | 16,7 ms   |
 *
 * Tout charger ne tient pas · le rendu était QUADRATIQUE (`glissable` relu
 * carte par carte sur toute la liste · 80 s pour 3 000 cartes). Il est rendu
 * linéaire (`elementsGlissables`, calculé une fois) · mesuré après coup dans
 * le tableau `PAGE_BIBLIOTHEQUE` ci-dessous. Même linéaire, envoyer 2 Mo de
 * données et rendre des milliers de cartes à chaque ouverture ne se justifie
 * pas · les comptes et une page bornée coûtent quelques millisecondes.
 *
 * Retenu · la page garde sa FENÊTRE (les `FENETRE_BIBLIOTHEQUE` médias les
 * plus récents, et autant pour la corbeille) et lit en plus les COMPTES EXACTS
 * (une requête agrégée · par dossier, type et corbeille). Chaque liste
 * partielle le dit et propose « Charger plus » · la page suivante de CE
 * dossier (ou de la corbeille, ou de la recherche), lue côté serveur par un
 * CURSEUR stable (`created_at`, `id`) · un fichier ajouté entre deux pages ne
 * décale rien (ni doublon, ni trou). La recherche et le filtre de type portent
 * sur TOUS les fichiers de l'espace (requête serveur), pas sur la page chargée.
 */

/** Ce que la page charge d'emblée · les médias vivants les plus récents (et autant pour la corbeille). */
export const FENETRE_BIBLIOTHEQUE = LIMITE_BIBLIOTHEQUE;

/**
 * Une page de « Charger plus » (dossier, corbeille, recherche) · mesurée le
 * 02/11/2026 une fois le rendu rendu linéaire (`elementsGlissables`) · écran
 * rendu côté serveur avec N cartes de fichiers visibles à la racine, 8
 * dossiers, médiane de 5 passes, même machine :
 *
 * | Cartes visibles  | 200   | 400    | 1 000  | 2 000  | 3 000                 |
 * | ---------------- | ----- | ------ | ------ | ------ | --------------------- |
 * | Rendu de l'écran | 81 ms | 114 ms | 248 ms | 424 ms | 723 ms (79 738 avant) |
 *
 * Le rendu suit le nombre de cartes (≈ 0,22 ms chacune, ≈ 40 ms de fond).
 * 200 · une page ajoute ≈ 45 ms au rendu, et cinq « Charger plus » de suite
 * (1 000 cartes, plus la fenêtre) restent sous 300 ms. 400 doublerait le pas
 * sans gain (la requête coûte 3 ms à 200) · 100 obligerait à deux fois plus
 * de clics pour le même parcours. La moitié de la fenêtre de départ.
 */
export const PAGE_BIBLIOTHEQUE = 200;

/** Une recherche plus longue n'est pas lue · aucun nom de fichier utile n'en a besoin. */
export const RECHERCHE_MAX_CARACTERES = 100;

/* ───────────────────────────── Le curseur ───────────────────────────── */

/**
 * Le curseur d'une liste · le dernier fichier lu (`created_at` à la
 * MICROSECONDE, tel que la base le garde, et son `id`). La date d'un fichier à
 * l'écran (`creeLe`) s'arrête à la milliseconde · un curseur pris sur elle
 * sauterait les fichiers créés dans la même milliseconde (un trou) · il est
 * donc toujours écrit par la requête (`FORMAT_CURSEUR_SQL`).
 */
export interface CurseurBibliotheque { t: string; id: string }

/** Le format de `to_char(created_at at time zone 'UTC', …)` · six chiffres après la seconde. */
export const FORMAT_CURSEUR_SQL = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
const HORODATAGE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un curseur venu du navigateur · la forme exacte, sinon `null` (rien d'autre n'atteint la requête). */
export function lireCurseur(raw: unknown): CurseurBibliotheque | null {
  if (!raw || typeof raw !== 'object') return null;
  const { t, id } = raw as Record<string, unknown>;
  if (typeof t !== 'string' || !HORODATAGE.test(t) || Number.isNaN(Date.parse(t))) return null;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  return { t, id: id.toLowerCase() };
}

/** Le curseur après une page lue · celui de son dernier fichier si la page est pleine, sinon `null` (la liste est finie). */
export function curseurSuivant(lignes: readonly { curseur: CurseurBibliotheque }[], limite: number): CurseurBibliotheque | null {
  return lignes.length >= limite && lignes.length ? lignes[lignes.length - 1]!.curseur : null;
}

/* ───────────────────────────── La demande ───────────────────────────── */

export type PorteePageBibliotheque =
  | { type: 'dossier'; dossier: string }
  | { type: 'corbeille' }
  | { type: 'recherche'; q: string };

export interface DemandePageBibliotheque {
  portee: PorteePageBibliotheque;
  filtre: FiltreTypeDrive;
  /** `null` · depuis le plus récent. */
  curseur: CurseurBibliotheque | null;
}

/** Ce qu'une page renvoie · des médias de la bibliothèque, le curseur suivant (`null` · fin) et, pour une recherche lue depuis le début, son total exact. */
export interface PageBibliotheque {
  medias: MediaSource[];
  suivant: CurseurBibliotheque | null;
  total?: number;
}

export const REFUS_PAGE = {
  illisible: 'Demande illisible · rien n’a été lu.',
  recherche: `Recherche trop longue · ${RECHERCHE_MAX_CARACTERES} caractères au plus.`,
} as const;

const ID_ASSETS = RACINES_DRIVE.find((r) => r.cle === 'assets')!.id;
const FILTRES = new Set<string>(FILTRES_TYPE_DRIVE.map((f) => f.cle));

/**
 * La demande d'une page, venue du navigateur · un dossier (la racine des
 * assets ou un UUID), la corbeille ou une recherche (normalisée, non vide,
 * bornée), un filtre de type du catalogue, un curseur de forme exacte. Tout
 * écart refuse la demande entière · rien n'est lu.
 */
export function lireDemandePage(raw: unknown): { ok: true; demande: DemandePageBibliotheque } | { ok: false; raison: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, raison: REFUS_PAGE.illisible };
  const r = raw as Record<string, unknown>;
  const filtre = r.filtre === undefined ? 'tous' : r.filtre;
  if (typeof filtre !== 'string' || !FILTRES.has(filtre)) return { ok: false, raison: REFUS_PAGE.illisible };
  const curseur = r.curseur == null ? null : lireCurseur(r.curseur);
  if (r.curseur != null && !curseur) return { ok: false, raison: REFUS_PAGE.illisible };
  const p = r.portee as Record<string, unknown> | null | undefined;
  let portee: PorteePageBibliotheque;
  if (p?.type === 'corbeille') portee = { type: 'corbeille' };
  else if (p?.type === 'dossier' && typeof p.dossier === 'string' && (p.dossier === ID_ASSETS || UUID.test(p.dossier))) portee = { type: 'dossier', dossier: p.dossier.toLowerCase() };
  else if (p?.type === 'recherche' && typeof p.q === 'string') {
    if (p.q.length > RECHERCHE_MAX_CARACTERES * 4) return { ok: false, raison: REFUS_PAGE.recherche };
    const q = normaliserRechercheDrive(p.q);
    if (!q) return { ok: false, raison: REFUS_PAGE.illisible };
    if (q.length > RECHERCHE_MAX_CARACTERES) return { ok: false, raison: REFUS_PAGE.recherche };
    portee = { type: 'recherche', q };
  } else return { ok: false, raison: REFUS_PAGE.illisible };
  return { ok: true, demande: { portee, filtre: filtre as FiltreTypeDrive, curseur } };
}

/** La clé d'une liste · un dossier, la corbeille ou une recherche, avec son filtre de type. */
export function clePage(portee: PorteePageBibliotheque, filtre: FiltreTypeDrive = 'tous'): string {
  const base = portee.type === 'dossier' ? `d:${portee.dossier}` : portee.type === 'corbeille' ? 'c' : `q:${portee.q}`;
  return `${base}|${filtre}`;
}

/* ───────────────────────────── La recherche côté serveur ───────────────────────────── */

/**
 * La translittération de la requête · `translate(lower(x), de, vers)` donne
 * en base le même texte que `normaliserRechercheDrive` à l'écran · lettres
 * accentuées latines (majuscules comprises, la casse de `lower()` dépendant
 * de la langue de la base), lettres latines sans décomposition ramenées en
 * minuscule, diacritiques combinants (nom écrit décomposé, macOS) retirés.
 */
export const TRANSLITTERATION_SQL: { de: string; vers: string } = (() => {
  let de = '', vers = '';
  for (let cp = 0xc0; cp <= 0x24f; cp++) {
    const ch = String.fromCodePoint(cp);
    if (cp === 0xd7 || cp === 0xf7) continue; // × et ÷ · pas des lettres
    const base = normaliserRechercheDrive(ch);
    if (base === ch || [...base].length !== 1) continue;
    de += ch; vers += base;
  }
  // Les diacritiques combinants · présents dans `de` sans correspondant, `translate` les retire.
  for (let cp = 0x300; cp <= 0x36f; cp++) de += String.fromCodePoint(cp);
  return { de, vers };
})();

/** Le motif `like` d'une recherche normalisée · `%`, `_` et `\` y sont littéraux. */
export function motifRecherche(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Les dossiers dont les fichiers ne se montrent nulle part (ni dossier, ni
 * recherche, ni compte) · en corbeille, ou sous un ancêtre en corbeille ·
 * même règle que la vue (`vueDrive`). La requête de recherche les exclut.
 */
export function dossiersEteints(dossiers: readonly Pick<DossierSource, 'id' | 'parentId' | 'deletedAt'>[]): string[] {
  const par = new Map(dossiers.map((d) => [d.id, d] as const));
  const memo = new Map<string, boolean>();
  const eteint = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const vus = new Set<string>();
    let cur = par.get(id);
    let r = false;
    while (cur && !vus.has(cur.id)) {
      if (cur.deletedAt != null) { r = true; break; }
      vus.add(cur.id);
      cur = cur.parentId ? par.get(cur.parentId) : undefined;
    }
    memo.set(id, r);
    return r;
  };
  return dossiers.filter((d) => eteint(d.id)).map((d) => d.id);
}

/* ───────────────────────────── Les fichiers chargés ensuite ───────────────────────────── */

/**
 * Les médias d'une page ajoutés aux données de l'écran · rangés par la même
 * règle que la page (`fichierDepuisMedia`), sans doublon (un fichier déjà là
 * reste tel quel). Seuls les médias de la bibliothèque s'ajoutent.
 */
export function ajouterMedias(d: DonneesDrive, medias: readonly MediaSource[]): DonneesDrive {
  const connus = new Set(d.fichiers.map((f) => f.id.toLowerCase()));
  const reels = new Set(d.dossiers.filter((x) => x.reel).map((x) => x.id));
  const nouveaux = [];
  for (const m of medias) {
    if (m.studio || m.historique) continue;
    const k = m.id.toLowerCase();
    if (connus.has(k)) continue;
    connus.add(k);
    nouveaux.push(fichierDepuisMedia(m, reels));
  }
  return nouveaux.length ? { ...d, fichiers: [...d.fichiers, ...nouveaux] } : d;
}

/** Les fenêtres de la page · le curseur du dernier fichier chargé d'emblée, `null` quand la fenêtre contient tout. */
export interface FenetresBibliotheque { vivants: CurseurBibliotheque | null; corbeille: CurseurBibliotheque | null }

export interface EtatPagesBibliotheque {
  fenetres: FenetresBibliotheque;
  /** Après une page lue · où reprendre chaque liste (`fin` · tout est chargé). */
  frontieres: Readonly<Record<string, CurseurBibliotheque | 'fin'>>;
  /** Le total exact d'une recherche, lu avec sa première page. */
  totaux: Readonly<Record<string, number>>;
}

export const pagesInitiales = (fenetres: FenetresBibliotheque): EtatPagesBibliotheque => ({ fenetres, frontieres: {}, totaux: {} });

/** L'état après une page reçue pour la liste `cle`. */
export function appliquerPage(pages: EtatPagesBibliotheque, cle: string, page: Pick<PageBibliotheque, 'suivant' | 'total'>): EtatPagesBibliotheque {
  return {
    ...pages,
    frontieres: { ...pages.frontieres, [cle]: page.suivant ?? 'fin' },
    totaux: typeof page.total === 'number' ? { ...pages.totaux, [cle]: page.total } : pages.totaux,
  };
}

/**
 * Où reprendre une liste · sa propre frontière, sinon celle de la même liste
 * sans filtre (tout fichier plus récent y est déjà chargé, de tout type),
 * sinon la fenêtre de la page (tout fichier plus récent qu'elle est chargé).
 * `fin` · rien ne reste à lire. Une recherche repart de son début.
 */
export function reprise(pages: EtatPagesBibliotheque, portee: PorteePageBibliotheque, filtre: FiltreTypeDrive): CurseurBibliotheque | 'fin' | null {
  const propre = pages.frontieres[clePage(portee, filtre)];
  if (propre) return propre;
  if (portee.type === 'recherche') return null;
  const tous = pages.frontieres[clePage(portee, 'tous')];
  if (tous) return tous;
  return (portee.type === 'corbeille' ? pages.fenetres.corbeille : pages.fenetres.vivants) ?? 'fin';
}

/* ───────────────────────────── Ce que dit l'écran ───────────────────────────── */

const fr = (n: number) => n.toLocaleString('fr-FR');
const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${fr(n)} ${n > 1 ? plusieurs : un}`;

export const MESSAGE_PAGE = {
  enCours: 'Recherche dans tous les fichiers de l’espace…',
  echec: 'Chargement impossible · réessaie dans un instant.',
  bouton: 'Charger plus',
  chargement: 'Chargement…',
} as const;

export interface SuiteListe {
  cle: string;
  /** Les fichiers de la bibliothèque affichés par la liste. */
  affiches: number;
  /** Le total exact · `null` pendant la lecture d'une recherche. */
  total: number | null;
  restants: number;
  /** La phrase sous la liste · dite dès que la liste est partielle (ou bornée). */
  texte: string;
  /** La page à demander · `null` quand rien ne reste à charger (ou pendant la recherche). */
  demande: DemandePageBibliotheque | null;
}

const BORNE_CREATIONS = `Les ${fr(LIMITE_BIBLIOTHEQUE)} créations Studios les plus récentes sont affichées · les plus anciennes restent dans leur projet.`;
const BORNE_ANCIENS = `Les ${fr(LIMITE_BIBLIOTHEQUE)} créations les plus récentes des anciens studios sont affichées.`;

/**
 * La suite de la liste affichée · combien de fichiers elle montre, combien en
 * compte l'espace, et la page à demander. `null` · la liste est complète (ou
 * l'écran est hors d'une liste de fichiers · récents, tags, racine du drive).
 * Sans `pages` (données sans pagination), seules les bornes des sources en
 * lecture seule se disent.
 */
export function suiteListe(d: DonneesDrive, e: EtatDrive, v: Pick<VueDrive, 'fichiers' | 'filtreTag'>, pages?: EtatPagesBibliotheque | null): SuiteListe | null {
  const q = normaliserRechercheDrive(e.recherche);
  const filtre = e.type ?? 'tous';
  const affiches = v.fichiers.filter((f) => !f.lectureSeule).length;
  const borne = (cle: string, texte: string): SuiteListe => ({ cle, affiches: v.fichiers.length, total: v.fichiers.length, restants: 0, texte, demande: null });
  const suite = (portee: PorteePageBibliotheque, total: number | null, suffixe = ''): SuiteListe | null => {
    const cle = clePage(portee, filtre);
    if (total === null) return { cle, affiches, total, restants: 0, texte: MESSAGE_PAGE.enCours, demande: null };
    const restants = Math.max(0, total - affiches);
    const r = pages ? reprise(pages, portee, filtre) : 'fin';
    if (!restants) return suffixe ? borne(cle, suffixe.replace(/^ · /, '')) : null;
    return {
      cle, affiches, total, restants,
      texte: `${pluriel(affiches, 'fichier affiché', 'fichiers affichés')} sur ${fr(total)} · les plus récents sont chargés d’abord, la sélection porte sur les fichiers affichés.${suffixe}`,
      demande: r === 'fin' ? null : { portee, filtre, curseur: r },
    };
  };

  if (q) {
    const recherche = { type: 'recherche' as const, q };
    const suffixe = d.bornes?.creations || d.bornes?.anciens ? ' · les créations au-delà des 400 plus récentes n’y sont pas cherchées.' : '';
    if (!pages) return suffixe ? borne(clePage(recherche, filtre), suffixe.replace(/^ · l/, 'L')) : null;
    const total = pages.totaux[clePage(recherche, filtre)];
    const s = suite(recherche, total ?? null, suffixe);
    // Recherche jamais lue · la première page part depuis le début.
    return s && total === undefined && !pages.frontieres[s.cle] ? { ...s, demande: { portee: recherche, filtre, curseur: null } } : s;
  }
  if (e.section === 'corbeille') return d.comptes && pages ? suite({ type: 'corbeille' }, d.comptes.corbeille[filtre]) : null;
  if (e.section !== 'drive' || v.filtreTag) return null;
  const chemin = cheminValide(d, e.chemin);
  const courant = chemin[chemin.length - 1];
  if (!courant) return null;
  if (chemin[0] === 'r:creations' && d.bornes?.creations) return borne(`b:creations|${filtre}`, BORNE_CREATIONS);
  if (chemin[0] === 'r:anciens' && d.bornes?.anciens) return borne(`b:anciens|${filtre}`, BORNE_ANCIENS);
  const reel = courant === ID_ASSETS || !!d.dossiers.find((x) => x.id === courant)?.reel;
  if (!reel || !d.comptes || !pages) return null;
  return suite({ type: 'dossier', dossier: courant }, d.comptes.vivants[courant]?.[filtre] ?? 0);
}

/** L'état vide n'est pas dit tant que la liste a une suite (fichiers non chargés, recherche en cours). */
export function videListe<T>(vide: T | null, suite: SuiteListe | null): T | null {
  return suite && (suite.total === null || suite.restants > 0) ? null : vide;
}

/** La phrase de la barre de sélection quand la liste est partielle · seuls les fichiers affichés se sélectionnent. */
export function noteSelectionPartielle(suite: SuiteListe | null, fichiersSelectionnes: number): string | null {
  if (!suite || !suite.restants || !fichiersSelectionnes) return null;
  return `La sélection porte sur les fichiers affichés · ${pluriel(suite.restants, 'autre fichier n’est pas chargé', 'autres fichiers ne sont pas chargés')}.`;
}
