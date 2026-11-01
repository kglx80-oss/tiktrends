import { TYPES_MEDIA_SERVIS } from '../../medias-servis';
import { formatTaille, type DonneesDrive } from './drive';
import type { SelectionDrive } from './selection';
import { TAG_SELECTION_MAX } from './tags-couleur';

/**
 * Bibliothèque · le TÉLÉCHARGEMENT GROUPÉ en archive ZIP · RÈGLES PURES.
 *
 * Le geste « Télécharger » de la barre de sélection ouvre une archive des
 * FICHIERS sélectionnés (jamais un dossier). Ce module dit, AVANT le clic et
 * dans la route (`/api/bibliotheque/archive`), avec les mêmes phrases :
 *  · la liste acceptée (des UUID, dédoublonnés, 1 à `TAG_SELECTION_MAX`) ;
 *  · que CHAQUE fichier est vivant dans l'espace (ni en corbeille, ni rangé
 *    dans un dossier en corbeille) · sinon refus TOTAL, aucune archive ;
 *  · le volume, calculé sur `size_bytes` · au-delà du plafond, refus ;
 *  · le nom de chaque fichier DANS l'archive · assaini, doublons renommés.
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
 * fichier Drive sans taille) n'entre pas dans une archive · le volume ne
 * pourrait pas être annoncé avant le clic. Il reste téléchargeable depuis son
 * aperçu.
 */

export const PLAFOND_ARCHIVE_OCTETS = 2 * 1024 * 1024 * 1024;

/** Un identifiant de média · `assets.id` est un UUID. */
const ID_MEDIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

export const RAISONS_ARCHIVE = {
  illisible: 'Sélection illisible · aucune archive n’a été créée.',
  vide: 'Aucun fichier sélectionné.',
  dossiers: 'Un dossier ne se télécharge pas · seuls les fichiers entrent dans l’archive.',
  introuvable: 'Un fichier de la sélection n’est plus disponible (supprimé, à la corbeille ou hors de l’espace) · aucune archive n’a été créée.',
  lecture: 'Un fichier de la sélection ne peut pas être lu depuis le stockage · aucune archive n’a été créée.',
} as const;

export function refusArchiveTropDeFichiers(n: number): string {
  return `${n} fichiers sélectionnés · ${TAG_SELECTION_MAX} au plus par archive, aucune archive n’a été créée.`;
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
 * Les noms d'une archive, dans l'ordre · assainis, et sans doublon. La
 * comparaison ignore la casse (Windows et macOS la confondent) ; la PREMIÈRE
 * occurrence garde son nom, les suivantes deviennent `nom (2).ext`,
 * `nom (3).ext`… sans jamais prendre le nom d'un autre fichier de la liste.
 */
export function nomsArchive(fichiers: ReadonlyArray<{ nom: unknown; extension?: string | null }>): string[] {
  const propres = fichiers.map((f) => nomFichierArchive(f.nom, f.extension));
  const cle = (s: string) => s.toLowerCase();
  const pris = new Set<string>();
  const premiers = new Set<number>();
  propres.forEach((n, i) => { if (!pris.has(cle(n))) { pris.add(cle(n)); premiers.add(i); } });
  return propres.map((n, i) => {
    if (premiers.has(i)) return n;
    const { base, ext } = separer(n);
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

/* ───────────────────────────── La décision de la route ───────────────────────────── */

export interface LigneArchive {
  id: string;
  nom: string;
  tailleOctets: number | null;
  /** `assets.deleted_at` posé · en corbeille. */
  supprime: boolean;
  dossierId: string | null;
  extension?: string | null;
}

export interface DossierArchive { id: string; parentId: string | null; supprime: boolean }

export type DecisionArchive =
  | { ok: true; fichiers: Array<{ id: string; nom: string; tailleOctets: number }>; octets: number }
  | { ok: false; raison: string };

/**
 * Ce que la route écrit · `lignes` sont les fichiers de l'ESPACE de la session
 * trouvés pour ces identifiants (la requête ne lit jamais un autre espace).
 * Refus TOTAL dès qu'un identifiant manque, qu'un fichier est en corbeille ou
 * rangé sous un dossier en corbeille, qu'une taille est inconnue, ou que le
 * volume dépasse le plafond. L'ordre de l'archive suit celui de la demande.
 */
export function decisionArchive(ids: readonly string[], lignes: readonly LigneArchive[], dossiers: readonly DossierArchive[]): DecisionArchive {
  const parId = new Map(lignes.map((l) => [l.id.toLowerCase(), l] as const));
  const parDossier = new Map(dossiers.map((d) => [d.id, d] as const));
  const dossierVivant = (id: string | null): boolean => {
    const vus = new Set<string>();
    let cur = id ? parDossier.get(id) : undefined;
    while (cur && !vus.has(cur.id)) {
      if (cur.supprime) return false;
      vus.add(cur.id);
      cur = cur.parentId ? parDossier.get(cur.parentId) : undefined;
    }
    return true;
  };
  const retenues: LigneArchive[] = [];
  for (const id of ids) {
    const l = parId.get(id.toLowerCase());
    if (!l || l.supprime || !dossierVivant(l.dossierId)) return { ok: false, raison: RAISONS_ARCHIVE.introuvable };
    retenues.push(l);
  }
  if (!retenues.length) return { ok: false, raison: RAISONS_ARCHIVE.vide };
  const inconnues = retenues.filter((l) => l.tailleOctets == null || !Number.isSafeInteger(l.tailleOctets) || l.tailleOctets < 0).length;
  if (inconnues) return { ok: false, raison: refusArchiveTailleInconnue(inconnues) };
  const octets = retenues.reduce((a, l) => a + l.tailleOctets!, 0);
  if (octets > PLAFOND_ARCHIVE_OCTETS) return { ok: false, raison: refusArchiveVolume(octets) };
  const noms = nomsArchive(retenues.map((l) => ({ nom: l.nom, extension: l.extension })));
  return { ok: true, fichiers: retenues.map((l, i) => ({ id: l.id, nom: noms[i]!, tailleOctets: l.tailleOctets! })), octets };
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
  ids: string[];
  octets: number;
}

/**
 * « Télécharger » dans la barre · décidé sur la sélection DÉJÀ filtrée par
 * `gestesSelection` (fichiers de la bibliothèque, vivants, hors lecture seule)
 * et sur les tailles connues de l'écran. Mêmes phrases que la route. Une
 * sélection mixte télécharge ses fichiers seuls, et le dit.
 */
export function gesteTelechargement(d: DonneesDrive, sel: Pick<SelectionDrive, 'composition' | 'dossiers' | 'fichiers'>, lectureSeule: string | null = null): GesteTelechargement {
  const ids = sel.fichiers.map((f) => f.id);
  const ferme = (titre: string): GesteTelechargement => ({ libelle: 'Télécharger', ouvert: false, titre, ids, octets: 0 });
  if (lectureSeule) return ferme(lectureSeule);
  if (!ids.length) return ferme(sel.composition === 'dossiers' ? RAISONS_ARCHIVE.dossiers : RAISONS_ARCHIVE.vide);
  if (ids.length > TAG_SELECTION_MAX) return ferme(refusArchiveTropDeFichiers(ids.length));
  const tailles = new Map(d.fichiers.map((f) => [f.id, f.tailleOctets] as const));
  const connues = ids.map((id) => tailles.get(id));
  const inconnues = connues.filter((t) => t == null || !Number.isSafeInteger(t) || t < 0).length;
  if (inconnues) return ferme(refusArchiveTailleInconnue(inconnues));
  const octets = (connues as number[]).reduce((a, t) => a + t, 0);
  if (octets > PLAFOND_ARCHIVE_OCTETS) return ferme(refusArchiveVolume(octets));
  const hors = sel.dossiers.length ? ` · ${pluriel(sel.dossiers.length, 'dossier')} n’y ${sel.dossiers.length > 1 ? 'entrent' : 'entre'} pas` : '';
  return { libelle: 'Télécharger', ouvert: true, titre: `Archive ZIP de ${pluriel(ids.length, 'fichier')} · ${formatTaille(octets)}${hors}`, ids, octets };
}

/** Le message dit quand le navigateur prend le relais. */
export function messageTelechargement(n: number, octets: number): string {
  return `Téléchargement lancé · ${pluriel(n, 'fichier')}, ${formatTaille(octets)}`;
}
