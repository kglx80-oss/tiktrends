import { TYPES_MEDIA_SERVIS } from '../../medias-servis';
import { formatTaille, type DonneesDrive } from './drive';
import type { SelectionDrive } from './selection';
import { TAG_SELECTION_MAX } from './tags-couleur';

/**
 * Bibliothèque · le TÉLÉCHARGEMENT GROUPÉ en archive ZIP · RÈGLES PURES.
 *
 * Le geste « Télécharger » de la barre de sélection ouvre une archive des
 * FICHIERS et des DOSSIERS sélectionnés · un dossier y entre avec toute son
 * ARBORESCENCE vivante (sous-dossiers et fichiers hors corbeille). Ce module
 * dit, AVANT le clic et dans la route (`/api/bibliotheque/archive`), avec les
 * mêmes phrases :
 *  · la demande acceptée (des UUID, dédoublonnés, 1 à `TAG_SELECTION_MAX`
 *    fichiers ET 1 à `TAG_SELECTION_MAX` dossiers · une sélection à la main) ;
 *  · que CHAQUE élément demandé est vivant dans l'espace (ni en corbeille, ni
 *    rangé dans un dossier en corbeille) · sinon refus TOTAL, aucune archive ;
 *  · l'arborescence d'un dossier · sous-dossiers et fichiers en corbeille
 *    EXCLUS (sans refus), cycles de parents parcourus une fois, dossier inclus
 *    dans un autre dossier demandé compté une fois (`selectionArchive`) ;
 *  · le nombre de fichiers et de dossiers (`PLAFOND_ARCHIVE_FICHIERS`,
 *    `PLAFOND_ARCHIVE_DOSSIERS`) et le volume (`PLAFOND_ARCHIVE_OCTETS`) ;
 *  · le CHEMIN de chaque entrée · assaini segment par segment, doublons
 *    renommés par répertoire, longueur bornée (`CHEMIN_ARCHIVE_OCTETS_MAX`) ;
 *  · les tailles inconnues (`size_bytes` nul) · relues au stockage par la
 *    route avant la décision (`relecturesArchive`, au plus
 *    `RELECTURES_TAILLE_MAX`), refus si l'une reste illisible (`conclureArchive`).
 * L'écriture du ZIP lui-même vit dans `archive-zip.ts` (noyau, pur).
 *
 * ── Le plafond de volume · mesuré le 01/11/2026 ──────────────────────────────
 *
 * `PLAFOND_ARCHIVE_OCTETS` = 2 Gio. Ce qui le fixe :
 *
 * | Mesure ou limite                                          | Valeur              |
 * | --------------------------------------------------------- | ------------------- |
 * | ZIP sans extension 64 bits (positions et tailles 32 bits) | 4 Gio − 1 octet     |
 * | Plus gros fichier admis au dépôt (`PLAFONDS_DEPOT` vidéo)  | 1 Gio               |
 * | Écriture de 2 Gio en flux, CRC natif (`node:zlib`)        | 0,5 s · 4 339 Mo/s  |
 * | Même archive, CRC du noyau (repli)                        | 4,1 s · 497 Mo/s    |
 * | Pic de mémoire du processus pendant ces 2 Gio             | 77 Mo (constant)    |
 * | Transfert de 2 Gio à 100 Mbit/s · à 1 Gbit/s              | ≈ 172 s · ≈ 17 s    |
 *
 * (Banc : 20 fichiers de 102 Mo, morceaux de 64 Kio, consommateur qui jette ·
 * machine de développement à 4 cœurs, chargée par deux autres tâches.)
 *
 * Le processeur et la mémoire ne bornent rien · l'écriture est en flux, son
 * pic ne dépend pas du volume. Ce qui borne, c'est le FORMAT (4 Gio sans
 * ZIP64) et la durée d'un téléchargement qu'on peut encore attendre devant
 * l'écran. 2 Gio, c'est la moitié de la limite du format (marge × 2 contre une
 * `size_bytes` sous-estimée · la route coupe de toute façon le flux au
 * plafond réel), deux vidéos de taille maximale, ou cent photos de 20 Mo
 * (la borne de sélection) · et moins de trois minutes à 100 Mbit/s.
 *
 * Un fichier dont la taille est INCONNUE (`size_bytes` nul · import par lien,
 * fichier Drive sans taille) voit sa taille RELUE par la route avant la
 * décision · `HEAD` signé pour un objet du bucket de l'espace, métadonnée
 * `size` de Drive avec le jeton de l'espace. La taille relue compte dans le
 * plafond ; elle n'est PAS écrite en base · la route obéit à la règle de
 * LECTURE de la Bibliothèque, une lecture ne modifie aucune ligne (et le
 * plafond réel de `fluxZip` coupe de toute façon une taille relue qui ment). Illisible (octets embarqués sans taille, adresse
 * publique, Drive natif sans `size`, stockage muet) · refus, comme avant.
 *
 * ── Le plafond de NOMBRE · mesuré le 01/11/2026 ──────────────────────────────
 *
 * Une sélection à la main reste bornée à `TAG_SELECTION_MAX` (100) éléments.
 * Un dossier en contient plus · `PLAFOND_ARCHIVE_FICHIERS` = 500 fichiers par
 * archive, `PLAFOND_ARCHIVE_DOSSIERS` = 500 dossiers. Ce qui les fixe :
 *
 * | Mesure ou limite                                             | Valeur                 |
 * | ------------------------------------------------------------ | ---------------------- |
 * | Entrées d'un ZIP sans extension 64 bits                      | 65 535                 |
 * | Écriture `fluxZip`, 1 000 entrées · 65 535 entrées           | 20 ms · 0,8 s          |
 * | Tas ajouté par le répertoire central · 1 000 · 65 535 entrées | 4 Mo · 41 Mo           |
 * | Route complète (pglite, stockage simulé instantané), 500 objets du bucket · 500 embarqués | 108 à 204 ms · 532 à 620 ms |
 * | Délai d'un appel Drive (`files/…`), connexion gardée, 10 essais | 40 à 114 ms, médiane 43 ms |
 * | Même appel, connexion neuve, 3 essais                         | 100 à 376 ms           |
 *
 * (Le stockage S3 de l'hébergeur n'est pas joignable depuis la machine de
 * mesure · l'aller-retour vers Drive en tient lieu.)
 *
 * L'écriture et la route ne bornent rien (≈ 1 ms par fichier au plus) · c'est
 * l'ouverture SÉQUENTIELLE de chaque fichier au stockage (un aller-retour avant
 * le premier octet) qui coûte. 500 fichiers,
 * c'est ≈ 22 s d'attente à 43 ms et ≈ 190 s au pire mesuré (376 ms) · le même
 * ordre que le transfert de 2 Gio à 100 Mbit/s (≈ 172 s), qui borne déjà le
 * volume. 1 000 aurait doublé ce pire cas · 500 garde la marge × 2. Un dossier
 * est une entrée de l'archive et un paramètre de la requête qui en lit le
 * contenu · même borne.
 *
 * ── Les chemins · mesurés sur Linux (`unzip`, `zipfile` de Python) ──────────
 *
 * | Limite                                               | Valeur                    |
 * | ---------------------------------------------------- | ------------------------- |
 * | Segment (nom d'un dossier ou d'un fichier), Linux    | 255 octets passent, 256 refusés |
 * | Chemin complet, Linux (`PATH_MAX` 4 096)             | 4 025 passent, 4 226 refusés |
 * | Chemin complet, macOS (`PATH_MAX`, documenté)        | 1 024 octets, destination comprise |
 * | Chemin complet, Explorateur Windows (`MAX_PATH`)     | 260 caractères, destination comprise |
 *
 * Chaque segment est borné à `NOM_ARCHIVE_OCTETS_MAX` (200), le chemin entier
 * à `CHEMIN_ARCHIVE_OCTETS_MAX` = 900 octets · il reste 124 octets sous la
 * limite de macOS pour le dossier où l'archive est extraite
 * (« /Users/…/Downloads/bibliotheque-2026-11-01/ »). Au-delà · refus TOTAL
 * (jamais un chemin coupé qui changerait de dossier). L'Explorateur Windows
 * n'est pas garanti au-delà de 260 caractères (7-Zip l'est) · un seul nom de
 * 200 octets l'y dépasse déjà.
 */

export const PLAFOND_ARCHIVE_OCTETS = 2 * 1024 * 1024 * 1024;
/** Fichiers d'une archive, arborescence comprise · tableau mesuré ci-dessus. */
export const PLAFOND_ARCHIVE_FICHIERS = 500;
/** Dossiers d'une archive (chacun est une entrée « dossier/ ») · même borne. */
export const PLAFOND_ARCHIVE_DOSSIERS = 500;
/** Longueur d'un chemin dans l'archive, en octets UTF-8 · tableau mesuré ci-dessus. */
export const CHEMIN_ARCHIVE_OCTETS_MAX = 900;
/**
 * Tailles inconnues relues au stockage par archive · une requête de
 * métadonnées chacune (deux fois · vérification puis téléchargement). La borne
 * d'une sélection à la main · une demande ne déclenche jamais plus de cent
 * appels au stockage avant d'écrire.
 */
export const RELECTURES_TAILLE_MAX = TAG_SELECTION_MAX;

/** Un identifiant de média · `assets.id` est un UUID. */
const ID_MEDIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
/** Un volume dit à l'écran · une archive de dossiers vides pèse « 0 Ko », pas « 1 Ko ». */
const volume = (octets: number) => (octets > 0 ? formatTaille(octets) : '0 Ko');

export const RAISONS_ARCHIVE = {
  illisible: 'Sélection illisible · aucune archive n’a été créée.',
  vide: 'Aucun fichier sélectionné.',
  dossierIntrouvable: 'Un dossier de la sélection n’est plus disponible (supprimé, à la corbeille ou hors de l’espace) · aucune archive n’a été créée.',
  introuvable: 'Un fichier de la sélection n’est plus disponible (supprimé, à la corbeille ou hors de l’espace) · aucune archive n’a été créée.',
  lecture: 'Un fichier de la sélection ne peut pas être lu depuis le stockage · aucune archive n’a été créée.',
} as const;

export function refusArchiveTropDeFichiers(n: number): string {
  return `${n} fichiers sélectionnés · ${TAG_SELECTION_MAX} au plus par archive, aucune archive n’a été créée.`;
}

export function refusArchiveTropDeDossiersSelectionnes(n: number): string {
  return `${n} dossiers sélectionnés · ${TAG_SELECTION_MAX} au plus par archive, aucune archive n’a été créée.`;
}

/** L'arborescence entière dépasse le nombre de fichiers d'une archive. */
export function refusArchiveNombreFichiers(n: number): string {
  return `L’archive compterait ${n} fichiers · ${PLAFOND_ARCHIVE_FICHIERS} au plus. Télécharge les sous-dossiers un par un, rien n’a été téléchargé.`;
}

export function refusArchiveNombreDossiers(n: number): string {
  return `L’archive compterait ${n} dossiers · ${PLAFOND_ARCHIVE_DOSSIERS} au plus. Télécharge les sous-dossiers un par un, rien n’a été téléchargé.`;
}

export function refusArchiveCheminTropLong(chemin: string): string {
  return `Un chemin de l’archive dépasse ${CHEMIN_ARCHIVE_OCTETS_MAX} octets (« ${couper(chemin, 60)}… ») · des dossiers trop imbriqués, aucune archive n’a été créée.`;
}

export function refusArchiveTropARelire(n: number): string {
  return `Taille inconnue pour ${n} fichiers · l’archive en relit au plus ${RELECTURES_TAILLE_MAX} au stockage. Télécharge-les par dossiers plus petits, rien n’a été téléchargé.`;
}

export function refusArchiveVolume(octets: number): string {
  return `La sélection pèse ${formatTaille(octets)} · une archive porte au plus ${formatTaille(PLAFOND_ARCHIVE_OCTETS)}. Retire des fichiers, rien n’a été téléchargé.`;
}

export function refusArchiveTailleInconnue(n: number): string {
  return `Taille inconnue pour ${pluriel(n, 'fichier')} · l’archive ne peut pas être annoncée. Télécharge ${n > 1 ? 'ces fichiers' : 'ce fichier'} depuis son aperçu.`;
}

/** La liste reçue par la route · des UUID, dédoublonnés (casse ignorée), 1 à `TAG_SELECTION_MAX`. Tout écart refuse l'archive entière. */
export function validerIdsArchive(ids: unknown): { ok: true; ids: string[] } | { ok: false; raison: string } {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string' || !ID_MEDIA.test(x))) return { ok: false, raison: RAISONS_ARCHIVE.illisible };
  const uniques = [...new Set((ids as string[]).map((x) => x.toLowerCase()))];
  if (!uniques.length) return { ok: false, raison: RAISONS_ARCHIVE.vide };
  if (uniques.length > TAG_SELECTION_MAX) return { ok: false, raison: refusArchiveTropDeFichiers(uniques.length) };
  return { ok: true, ids: uniques };
}

export interface DemandeArchive { fichiers: string[]; dossiers: string[] }

function listeUuid(x: unknown): string[] | null {
  if (x === undefined || x === null) return [];
  if (!Array.isArray(x) || x.some((v) => typeof v !== 'string' || !ID_MEDIA.test(v))) return null;
  return [...new Set((x as string[]).map((v) => v.toLowerCase()))];
}

/**
 * La demande reçue par la route · `ids` (fichiers) et `dossiers`, des UUID
 * dédoublonnés, chacun 1 à `TAG_SELECTION_MAX` (une liste peut manquer, pas
 * les deux). Tout écart refuse l'archive entière.
 */
export function validerDemandeArchive(ids: unknown, dossiers: unknown): ({ ok: true } & DemandeArchive) | { ok: false; raison: string } {
  const f = listeUuid(ids), d = listeUuid(dossiers);
  if (!f || !d) return { ok: false, raison: RAISONS_ARCHIVE.illisible };
  if (!f.length && !d.length) return { ok: false, raison: RAISONS_ARCHIVE.vide };
  if (f.length > TAG_SELECTION_MAX) return { ok: false, raison: refusArchiveTropDeFichiers(f.length) };
  if (d.length > TAG_SELECTION_MAX) return { ok: false, raison: refusArchiveTropDeDossiersSelectionnes(d.length) };
  return { ok: true, fichiers: f, dossiers: d };
}

/* ───────────────────────────── Les noms dans l'archive ───────────────────────────── */

/** Longueur maximale d'un nom, en octets UTF-8 · 255 est la limite des systèmes de fichiers courants, la marge laisse « (100) ». */
export const NOM_ARCHIVE_OCTETS_MAX = 200;

const utf8 = new TextEncoder();
const octetsUtf8 = (s: string) => utf8.encode(s).length;

/** Caractères de contrôle (C0, DEL, C1) et de mise en forme invisibles (bidi, largeur nulle, BOM) · retirés. */
const PLAGES_INVISIBLES: ReadonlyArray<readonly [number, number]> = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2069], [0xfeff, 0xfeff]];
const echapper = (n: number) => `\\u${n.toString(16).padStart(4, '0')}`;
const INVISIBLES = new RegExp(`[${PLAGES_INVISIBLES.map(([a, b]) => `${echapper(a)}-${echapper(b)}`).join('')}]`, 'g');
/** Séparateurs de chemin et caractères interdits sous Windows · remplacés par un tiret. */
const INTERDITS = /[\\/:*?"<>|]/g;
/** Noms de périphérique réservés sous Windows, quelle que soit l'extension. */
const RESERVES = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

function couper(s: string, max: number): string {
  if (octetsUtf8(s) <= max) return s;
  const points = [...s];
  while (points.length && octetsUtf8(points.join('')) > max) points.pop();
  return points.join('');
}

function separer(nom: string): { base: string; ext: string } {
  const m = /^(.+?)(\.[A-Za-z0-9]{1,10})$/.exec(nom);
  return m ? { base: m[1]!, ext: m[2]! } : { base: nom, ext: '' };
}

/**
 * Le nom d'UN fichier dans l'archive · jamais un chemin. Les séparateurs (`/`,
 * `\`) deviennent des tirets, donc ni `../`, ni chemin absolu, ni lettre de
 * lecteur ; les caractères de contrôle et invisibles (dont l'inversion bidi,
 * qui maquille `gpj.exe` en `exe.jpg`) sont retirés ; ni point ni espace en
 * tête ou en fin ; un nom réservé sous Windows est préfixé. Sans extension,
 * celle du type connu est ajoutée. Vide après tout cela · « fichier ».
 */
export function nomFichierArchive(nom: unknown, extensionDuType?: string | null): string {
  let s = (typeof nom === 'string' ? nom : '').normalize('NFC').replace(INVISIBLES, '').replace(INTERDITS, '-');
  // Une suite de points (`..`) n'en garde qu'un · aucun segment de remontée, même à plat.
  s = s.replace(/\s+/g, ' ').replace(/\.{2,}/g, '.').replace(/^[\s.]+|[\s.]+$/g, '');
  let { base, ext } = separer(s);
  if (!ext && extensionDuType && /^[a-z0-9]{1,10}$/.test(extensionDuType)) ext = `.${extensionDuType}`;
  base = base.replace(/[\s.]+$/g, '');
  if (!base) base = 'fichier';
  if (RESERVES.test(base.split('.')[0]!)) base = `_${base}`;
  base = couper(base, NOM_ARCHIVE_OCTETS_MAX - octetsUtf8(ext)).replace(/[\s.]+$/g, '') || 'fichier';
  return base + ext;
}

/**
 * Le nom d'UN dossier (un segment de chemin) · mêmes règles qu'un fichier
 * (`nomFichierArchive` · séparateurs en tirets, donc ni `..` ni chemin absolu,
 * invisibles retirés, points de bord retirés, nom réservé préfixé, coupé à
 * `NOM_ARCHIVE_OCTETS_MAX` octets), sans extension · vide ⇒ « dossier ».
 */
export function nomDossierArchive(nom: unknown): string {
  let s = (typeof nom === 'string' ? nom : '').normalize('NFC').replace(INVISIBLES, '').replace(INTERDITS, '-');
  s = s.replace(/\s+/g, ' ').replace(/\.{2,}/g, '.').replace(/^[\s.]+|[\s.]+$/g, '');
  if (!s) s = 'dossier';
  if (RESERVES.test(s.split('.')[0]!)) s = `_${s}`;
  return couper(s, NOM_ARCHIVE_OCTETS_MAX).replace(/[\s.]+$/g, '') || 'dossier';
}

/**
 * Les noms d'une archive, dans l'ordre · assainis, et sans doublon. La
 * comparaison ignore la casse (Windows et macOS la confondent) ; la PREMIÈRE
 * occurrence garde son nom, les suivantes deviennent `nom (2).ext`,
 * `nom (3).ext`… sans jamais prendre le nom d'un autre fichier de la liste.
 */
export function nomsArchive(fichiers: ReadonlyArray<{ nom: unknown; extension?: string | null; dossier?: boolean }>): string[] {
  const propres = fichiers.map((f) => (f.dossier ? nomDossierArchive(f.nom) : nomFichierArchive(f.nom, f.extension)));
  const cle = (s: string) => s.toLowerCase();
  const pris = new Set<string>();
  const premiers = new Set<number>();
  propres.forEach((n, i) => { if (!pris.has(cle(n))) { pris.add(cle(n)); premiers.add(i); } });
  return propres.map((n, i) => {
    if (premiers.has(i)) return n;
    const { base, ext } = fichiers[i]!.dossier ? { base: n, ext: '' } : separer(n);
    for (let k = 2; ; k++) {
      const suffixe = ` (${k})`;
      const candidat = couper(base, NOM_ARCHIVE_OCTETS_MAX - octetsUtf8(ext) - octetsUtf8(suffixe)) + suffixe + ext;
      if (!pris.has(cle(candidat))) { pris.add(cle(candidat)); return candidat; }
    }
  });
}

/** L'extension d'un type connu (`TYPES_MEDIA_SERVIS`, PDF) · ajoutée à un nom qui n'en porte pas. */
export function extensionArchive(mime: string | null | undefined): string | null {
  const t = (mime ?? '').toLowerCase().split(';')[0]!.trim();
  if (t === 'application/pdf') return 'pdf';
  return (TYPES_MEDIA_SERVIS as Readonly<Record<string, { extension: string }>>)[t]?.extension ?? null;
}


/* ───────────────────────────── L'arborescence et la décision ───────────────────────────── */

export interface LigneArchive {
  id: string;
  nom: string;
  tailleOctets: number | null;
  /** `assets.deleted_at` posé · en corbeille. */
  supprime: boolean;
  dossierId: string | null;
  extension?: string | null;
}

export interface DossierArchive {
  id: string; parentId: string | null; supprime: boolean; nom?: string;
  /**
   * Hors de la portée de l'écran (dossier d'une AUTRE marque que la marque
   * active · l'écran montre la marque active et les dossiers communs). Il
   * compte pour dire si un fichier est vivant, mais n'entre jamais dans une
   * arborescence et ne se demande pas.
   */
  horsPortee?: boolean;
}

const tailleConnue = (t: number | null | undefined): t is number => t != null && Number.isSafeInteger(t) && t >= 0;
const cleId = (id: string) => id.toLowerCase();

interface IndexDossiers {
  par: Map<string, DossierArchive>;
  enfants: Map<string, DossierArchive[]>;
  /** Ni lui ni un ancêtre en corbeille · un cycle de parents est parcouru une fois. */
  vivant: (id: string | null) => boolean;
}

function indexerDossiers(dossiers: readonly DossierArchive[]): IndexDossiers {
  const par = new Map(dossiers.map((d) => [cleId(d.id), d] as const));
  const enfants = new Map<string, DossierArchive[]>();
  for (const d of dossiers) {
    const p = d.parentId ? cleId(d.parentId) : null;
    if (p && p !== cleId(d.id) && par.has(p)) enfants.set(p, [...(enfants.get(p) ?? []), d]);
  }
  const vivant = (id: string | null): boolean => {
    const vus = new Set<string>();
    let cur = id ? par.get(cleId(id)) : undefined;
    while (cur && !vus.has(cleId(cur.id))) {
      if (cur.supprime) return false;
      vus.add(cleId(cur.id));
      cur = cur.parentId ? par.get(cleId(cur.parentId)) : undefined;
    }
    return true;
  };
  return { par, enfants, vivant };
}

/** Le sous-arbre VIVANT d'un dossier (lui compris) · un sous-dossier en corbeille est écarté avec tout ce qu'il contient ; chaque dossier visité une fois. */
function sousArbre(ix: IndexDossiers, racine: string): string[] {
  const vus = new Set<string>();
  const ordre: string[] = [];
  const pile = [cleId(racine)];
  while (pile.length) {
    const id = pile.pop()!;
    if (vus.has(id)) continue;
    vus.add(id);
    ordre.push(id);
    for (const e of ix.enfants.get(id) ?? []) if (!e.supprime && !e.horsPortee && !vus.has(cleId(e.id))) pile.push(cleId(e.id));
  }
  return ordre;
}

/**
 * Les dossiers d'une archive · chaque dossier DEMANDÉ doit être un dossier
 * vivant de l'espace (sinon refus TOTAL) ; on rend les racines de l'archive et
 * TOUS les dossiers vivants de leurs arborescences (ce que la route lit
 * ensuite). Un dossier demandé qui est déjà dans l'arborescence d'un autre
 * dossier demandé n'est pas une racine (compté une fois) · dans un cycle de
 * parents, le premier demandé l'emporte. Un dossier hors de la portée de
 * l'écran (`horsPortee`) n'y entre jamais, ni ce qu'il contient.
 */
export function arborescenceArchive(demandes: readonly string[], dossiers: readonly DossierArchive[]):
  { ok: true; racines: string[]; dossiers: string[] } | { ok: false; raison: string } {
  const ix = indexerDossiers(dossiers);
  const ids = [...new Set(demandes.map(cleId))];
  for (const id of ids) if (!ix.par.has(id) || ix.par.get(id)!.horsPortee || !ix.vivant(id)) return { ok: false, raison: RAISONS_ARCHIVE.dossierIntrouvable };
  const arbres = new Map(ids.map((id) => [id, new Set(sousArbre(ix, id))] as const));
  const racines = ids.filter((r, i) => !ids.some((autre, j) => autre !== r && arbres.get(autre)!.has(r) && !(arbres.get(r)!.has(autre) && i < j)));
  const tous = new Set<string>();
  for (const r of racines) for (const d of arbres.get(r)!) tous.add(d);
  if (tous.size > PLAFOND_ARCHIVE_DOSSIERS) return { ok: false, raison: refusArchiveNombreDossiers(tous.size) };
  return { ok: true, racines, dossiers: [...tous] };
}

export interface FichierChoisi { id: string; nom: string; tailleOctets: number | null }

export interface SelectionArchive {
  /** Les fichiers, dans l'ordre de l'archive · `nom` est leur CHEMIN (`UGC/Été/photo.jpg`). */
  fichiers: FichierChoisi[];
  /** Les dossiers, chacun une entrée « chemin/ » · parents avant enfants. */
  repertoires: string[];
}

const ordreFr = (a: { nom?: string; id: string }, b: { nom?: string; id: string }) => (a.nom ?? '').localeCompare(b.nom ?? '', 'fr') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Ce que l'archive contiendra, AVANT les tailles · `lignes` sont les fichiers
 * de l'ESPACE trouvés pour les fichiers demandés et pour les dossiers de
 * l'arborescence (la requête ne lit jamais un autre espace), `dossiers` tous
 * les dossiers de l'espace.
 *
 * Refus TOTAL dès qu'un fichier ou un dossier DEMANDÉ manque ou n'est pas
 * vivant, au-delà des plafonds de nombre, ou dès qu'un chemin dépasse
 * `CHEMIN_ARCHIVE_OCTETS_MAX`. Dans l'arborescence, un fichier ou un
 * sous-dossier en corbeille est seulement EXCLU. Les fichiers demandés seuls
 * viennent d'abord, à la racine, dans l'ordre de la demande · puis chaque
 * dossier (ses fichiers par nom, puis ses sous-dossiers). Un fichier demandé
 * qui est aussi dans un dossier demandé n'y est écrit qu'une fois, à sa place
 * dans le dossier. `fichiersDansDossiers` · le compte RÉEL des fichiers
 * vivants de l'arborescence quand la route n'en a lu qu'une partie.
 */
export function selectionArchive(demande: DemandeArchive, lignes: readonly LigneArchive[], dossiers: readonly DossierArchive[], o: { fichiersDansDossiers?: number } = {}):
  ({ ok: true } & SelectionArchive) | { ok: false; raison: string } {
  const ix = indexerDossiers(dossiers);
  const parId = new Map(lignes.map((l) => [cleId(l.id), l] as const));
  const demandes: LigneArchive[] = [];
  for (const id of demande.fichiers) {
    const l = parId.get(cleId(id));
    if (!l || l.supprime || !ix.vivant(l.dossierId)) return { ok: false, raison: RAISONS_ARCHIVE.introuvable };
    demandes.push(l);
  }
  const arbre = demande.dossiers.length ? arborescenceArchive(demande.dossiers, dossiers) : { ok: true as const, racines: [] as string[], dossiers: [] as string[] };
  if (!arbre.ok) return arbre;
  if (!demandes.length && !arbre.racines.length) return { ok: false, raison: RAISONS_ARCHIVE.vide };

  const inclus = new Set(arbre.dossiers);
  const contenu = new Map<string, LigneArchive[]>();
  const vus = new Set<string>();
  for (const l of lignes) {
    const d = l.dossierId ? cleId(l.dossierId) : null;
    if (!d || !inclus.has(d) || l.supprime || vus.has(cleId(l.id))) continue;
    vus.add(cleId(l.id));
    contenu.set(d, [...(contenu.get(d) ?? []), l]);
  }
  const aLaRacine = demandes.filter((l) => !vus.has(cleId(l.id)));
  const nombre = aLaRacine.length + Math.max(vus.size, o.fichiersDansDossiers ?? 0);
  if (nombre > PLAFOND_ARCHIVE_FICHIERS) return { ok: false, raison: refusArchiveNombreFichiers(nombre) };

  const fichiers: FichierChoisi[] = [];
  const repertoires: string[] = [];
  const trop: { chemin: string | null } = { chemin: null };
  const verifier = (chemin: string) => { if (!trop.chemin && octetsUtf8(chemin) > CHEMIN_ARCHIVE_OCTETS_MAX) trop.chemin = chemin; };
  const ecrits = new Set<string>();
  // Un répertoire · ses fichiers, puis ses sous-dossiers · noms dédoublonnés ENSEMBLE (un fichier et un dossier ne partagent pas un nom).
  const remplir = (prefixe: string, lesFichiers: readonly LigneArchive[], sousDossiers: readonly DossierArchive[]) => {
    const noms = nomsArchive([
      ...lesFichiers.map((l) => ({ nom: l.nom, extension: l.extension })),
      ...sousDossiers.map((d) => ({ nom: d.nom ?? '', dossier: true })),
    ]);
    lesFichiers.forEach((l, i) => {
      const chemin = prefixe + noms[i]!;
      verifier(chemin);
      fichiers.push({ id: l.id, nom: chemin, tailleOctets: tailleConnue(l.tailleOctets) ? l.tailleOctets : null });
    });
    sousDossiers.forEach((d, i) => {
      const chemin = `${prefixe}${noms[lesFichiers.length + i]!}/`;
      verifier(chemin);
      repertoires.push(chemin);
      ecrits.add(cleId(d.id));
      // `inclus` porte déjà la règle (vivants, dans la portée) · ici, seulement « pas encore écrit ».
      const enfants = (ix.enfants.get(cleId(d.id)) ?? []).filter((e) => inclus.has(cleId(e.id)) && !ecrits.has(cleId(e.id)));
      // Marqués AVANT la descente · un cycle de parents ne réécrit jamais un dossier.
      for (const e of enfants) ecrits.add(cleId(e.id));
      remplir(chemin, [...(contenu.get(cleId(d.id)) ?? [])].sort(ordreFr), [...enfants].sort(ordreFr));
    });
  };
  const racines = arbre.racines.map((id) => ix.par.get(id)!);
  for (const r of racines) ecrits.add(cleId(r.id));
  remplir('', aLaRacine, racines);
  if (trop.chemin) return { ok: false, raison: refusArchiveCheminTropLong(trop.chemin) };
  return { ok: true, fichiers, repertoires };
}

/** Les fichiers dont la route doit RELIRE la taille au stockage · aucun au-delà de `RELECTURES_TAILLE_MAX` (le refus le dira). */
export function relecturesArchive(sel: SelectionArchive): string[] {
  const ids = sel.fichiers.filter((f) => f.tailleOctets === null).map((f) => f.id);
  return ids.length > RELECTURES_TAILLE_MAX ? [] : ids;
}

/**
 * Une taille relue au stockage · `content-length` d'un `HEAD`, `size` d'une
 * métadonnée Drive (chaîne de chiffres ou nombre). Rien d'autre n'est cru ·
 * vide, signe, décimale, notation exponentielle, au-delà d'un entier sûr ⇒ `null`.
 */
export function tailleRelue(v: unknown): number | null {
  const s = typeof v === 'number' ? (Number.isSafeInteger(v) ? String(v) : '') : typeof v === 'string' ? v.trim() : '';
  if (!/^\d{1,16}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export type DecisionArchive =
  | { ok: true; fichiers: Array<{ id: string; nom: string; tailleOctets: number }>; repertoires: string[]; octets: number }
  | { ok: false; raison: string };

/**
 * La décision · `tailles` porte les tailles RELUES par la route (identifiant
 * → octets). Refus TOTAL si une taille reste inconnue, ou si la somme dépasse
 * `PLAFOND_ARCHIVE_OCTETS`.
 */
export function conclureArchive(sel: SelectionArchive, tailles: ReadonlyMap<string, number> = new Map()): DecisionArchive {
  const relue = (id: string) => tailles.get(id) ?? tailles.get(cleId(id));
  const fichiers = sel.fichiers.map((f) => ({ ...f, tailleOctets: f.tailleOctets ?? (tailleConnue(relue(f.id)) ? relue(f.id)! : null) }));
  const inconnues = fichiers.filter((f) => f.tailleOctets === null).length;
  if (inconnues) return { ok: false, raison: inconnues > RELECTURES_TAILLE_MAX ? refusArchiveTropARelire(inconnues) : refusArchiveTailleInconnue(inconnues) };
  const octets = fichiers.reduce((a, f) => a + f.tailleOctets!, 0);
  if (octets > PLAFOND_ARCHIVE_OCTETS) return { ok: false, raison: refusArchiveVolume(octets) };
  return { ok: true, fichiers: fichiers as Array<{ id: string; nom: string; tailleOctets: number }>, repertoires: sel.repertoires, octets };
}

/**
 * Ce que la route écrit, d'un coup (sans relecture) · fichiers `ids` demandés
 * seuls, et dossiers `dossiersDemandes` avec leur arborescence.
 */
export function decisionArchive(ids: readonly string[], lignes: readonly LigneArchive[], dossiers: readonly DossierArchive[], dossiersDemandes: readonly string[] = [], tailles?: ReadonlyMap<string, number>): DecisionArchive {
  const sel = selectionArchive({ fichiers: [...ids], dossiers: [...dossiersDemandes] }, lignes, dossiers);
  return sel.ok ? conclureArchive(sel, tailles) : sel;
}

/** Le nom de l'archive téléchargée · ASCII, daté du jour (UTC). */
export function nomArchive(maintenant: Date): string {
  const j = Number.isFinite(maintenant.getTime()) ? maintenant.toISOString().slice(0, 10) : 'export';
  return `bibliotheque-${j}.zip`;
}

/* ───────────────────────────── Le geste de la barre ───────────────────────────── */

export interface GesteTelechargement {
  libelle: 'Télécharger';
  ouvert: boolean;
  /** Fermé · la raison ; ouvert · ce que contiendra l'archive. Dit dans l'infobulle. */
  titre: string;
  /** Les fichiers demandés seuls. */
  ids: string[];
  /** Les dossiers demandés (avec leur arborescence). */
  dossiers: string[];
  /** Le volume CONNU avant le clic (sans les tailles à relire). */
  octets: number;
}

const ID_RACINE_ASSETS = 'r:assets';

/**
 * « Télécharger » dans la barre · décidé sur la sélection DÉJÀ filtrée par
 * `gestesSelection` (fichiers de la bibliothèque et dossiers réels, vivants,
 * hors lecture seule) et sur l'arbre de l'écran, par les MÊMES règles que la
 * route (`selectionArchive`, `conclureArchive`). Une taille inconnue n'y ferme
 * plus le geste · la route la relira ; l'infobulle le dit.
 */
export function gesteTelechargement(d: DonneesDrive, sel: Pick<SelectionDrive, 'composition' | 'dossiers' | 'fichiers'>, lectureSeule: string | null = null): GesteTelechargement {
  const ids = sel.fichiers.map((f) => f.id);
  const demandesDossiers = sel.dossiers.map((x) => x.id);
  const ferme = (titre: string): GesteTelechargement => ({ libelle: 'Télécharger', ouvert: false, titre, ids, dossiers: demandesDossiers, octets: 0 });
  if (lectureSeule) return ferme(lectureSeule);
  if (!ids.length && !demandesDossiers.length) return ferme(RAISONS_ARCHIVE.vide);
  if (ids.length > TAG_SELECTION_MAX) return ferme(refusArchiveTropDeFichiers(ids.length));
  if (demandesDossiers.length > TAG_SELECTION_MAX) return ferme(refusArchiveTropDeDossiersSelectionnes(demandesDossiers.length));
  const reels = new Set(d.dossiers.filter((x) => x.reel).map((x) => x.id));
  const dossiers: DossierArchive[] = d.dossiers.filter((x) => x.reel).map((x) => ({ id: x.id, parentId: x.parent && reels.has(x.parent) ? x.parent : null, supprime: x.supprime, nom: x.nom }));
  const lignes: LigneArchive[] = d.fichiers.filter((f) => !f.lectureSeule).map((f) => ({
    id: f.id, nom: f.nom, tailleOctets: f.tailleOctets, supprime: !!f.supprime, dossierId: f.parent !== ID_RACINE_ASSETS && reels.has(f.parent) ? f.parent : null,
  }));
  const s = selectionArchive({ fichiers: ids, dossiers: demandesDossiers }, lignes, dossiers);
  if (!s.ok) return ferme(s.raison);
  const aRelire = s.fichiers.filter((f) => f.tailleOctets === null).length;
  if (aRelire > RELECTURES_TAILLE_MAX) return ferme(refusArchiveTropARelire(aRelire));
  const octets = s.fichiers.reduce((a, f) => a + (f.tailleOctets ?? 0), 0);
  if (octets > PLAFOND_ARCHIVE_OCTETS) return ferme(refusArchiveVolume(octets));
  const contenu = s.repertoires.length ? `${pluriel(s.repertoires.length, 'dossier')} et ${pluriel(s.fichiers.length, 'fichier')}` : pluriel(s.fichiers.length, 'fichier');
  const relue = aRelire ? ` · taille de ${pluriel(aRelire, 'fichier')} relue au lancement` : '';
  return { libelle: 'Télécharger', ouvert: true, titre: `Archive ZIP de ${contenu} · ${volume(octets)}${relue}`, ids, dossiers: demandesDossiers, octets };
}

/** Le message dit quand le navigateur prend le relais. */
export function messageTelechargement(n: number, octets: number, dossiers = 0): string {
  return `Téléchargement lancé · ${dossiers ? `${pluriel(dossiers, 'dossier')}, ` : ''}${pluriel(n, 'fichier')}, ${volume(octets)}`;
}
