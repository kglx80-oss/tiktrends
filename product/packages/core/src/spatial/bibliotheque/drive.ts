import { droitAutorisePub, estDroitAsset, libelleDroit } from '../../bibliotheque-dossiers';
import { derniereTentativeDriveEnEchec, type DernierSyncDrive } from '../../connecteurs-catalogue';
import { estTagCouleur, tagCouleur, tagsEnUsage, type CleTagCouleur, type TagCouleur } from './tags-couleur';

/**
 * Spatial · la Bibliothèque « rangée comme un drive » (maquette `bibliotheque`).
 * RÈGLES PURES · ni base, ni réseau. La page lit les vraies sources (dossiers
 * `library_folders`, médias `assets`, sorties livrées des projets Studios,
 * créations des anciens studios) et ce module les range en arbre, calcule ce
 * que montre l'écran (onglets, arbre, fil d'Ariane, dossiers, fichiers, vide)
 * selon l'état de navigation. Le JSX ne décide rien.
 *
 * Trois racines, toutes RÉELLES · la maquette en montre quatre, « Exports
 * Meta » n'a aucune source (aucun export n'est conservé) · elle n'existe pas ici.
 *  · « Assets de la marque » · les dossiers de la bibliothèque et les médias ;
 *    un média non classé est à la racine de cet espace ;
 *  · « Créations » · les sorties livrées des projets Studios, un dossier par
 *    projet (lecture seule) ;
 *  · « Anciens studios » · les créations des studios retirés le 10/10 (lecture seule).
 */

export type CleRacineDrive = 'assets' | 'creations' | 'anciens';

export const RACINES_DRIVE: ReadonlyArray<{ cle: CleRacineDrive; id: string; nom: string; icone: string }> = [
  { cle: 'assets', id: 'r:assets', nom: 'Assets de la marque', icone: 'bookmark' },
  { cle: 'creations', id: 'r:creations', nom: 'Créations', icone: 'img' },
  { cle: 'anciens', id: 'r:anciens', nom: 'Anciens studios', icone: 'loop' },
];
const ID_ASSETS = 'r:assets';
const estRacine = (id: string) => RACINES_DRIVE.some((r) => r.id === id);

export type TypeFichierDrive = 'image' | 'video' | 'audio' | 'pdf' | 'svg' | 'autre';

/** Un dossier · réel (`library_folders`) ou virtuel (racine, projet Studios). */
export interface DossierDrive {
  id: string;
  nom: string;
  /** Le parent · un id de dossier, ou d'une racine. `null` pour une racine. */
  parent: string | null;
  /** Dossier réel de la bibliothèque · seuls eux se créent, se suppriment, se restaurent. */
  reel: boolean;
  verrouille: boolean;
  /** En corbeille (réversible) · `library_folders.deleted_at`. */
  supprime: boolean;
  creeLe: string;
  /** Tag de couleur (`library_folders.color_tag`) · seul un dossier réel en porte un. */
  tag: CleTagCouleur | null;
}

export interface FichierDrive {
  id: string;
  nom: string;
  type: TypeFichierDrive;
  parent: string;
  tailleOctets: number | null;
  creeLe: string;
  /** Adresse servie (proxy gardé) · jamais le contenu brut. */
  url: string;
  vignette: string | null;
  /** Clé de droit d'usage (`DROITS_ASSET`) ou null (non classé). */
  droit: string | null;
  /** Libellé de provenance · « Téléversé », « Google Drive », « Studios »… */
  source: string;
  /** Sortie Studios ou ancienne création · ni droit, ni rangement, ni suppression. */
  lectureSeule: boolean;
  /** Où mène « Ouvrir » pour une sortie Studios (le projet). */
  projet?: { href: string; titre: string };
  /** Téléchargement d'une ancienne création. */
  telecharger?: string;
  /**
   * L'usage par l'IA d'un média de la bibliothèque (repris de l'écran V5) ·
   * utilisable par l'IA, rangé en template, tags posés par l'analyse. Absent
   * pour une sortie Studios ou une ancienne création (lecture seule).
   */
  ia?: { utilisable: boolean; template: boolean; tags: readonly string[] };
}

export interface DonneesDrive {
  dossiers: DossierDrive[];
  fichiers: FichierDrive[];
}

/* ───────────────────────────── Construction ───────────────────────────── */

export interface DossierSource { id: string; parentId: string | null; name: string; locked: boolean; deletedAt: string | null; createdAt: string; colorTag?: string | null }
export interface MediaSource {
  id: string; name: string; kind: string; mimeType?: string | null; source: string; url: string; thumbUrl: string | null;
  sizeBytes: number | null; createdAt: string; folderId?: string | null; rights?: string | null;
  studio?: { projetId: string; projetTitre: string; href: string };
  historique?: { libelle: string; telecharger: string };
  ia?: { utilisable: boolean; template: boolean; tags: readonly string[] };
}

const LIBELLE_SOURCE: Record<string, string> = { upload: 'Téléversé', url: 'Lien', drive: 'Google Drive', studios: 'Studios', historique: 'Ancien studio' };

export function typeFichier(kind: string, mime?: string | null): TypeFichierDrive {
  if (mime === 'application/pdf') return 'pdf';
  // Un SVG (logo vectoriel) se montre comme un fichier, jamais en vignette · comme la maquette.
  if (mime === 'image/svg+xml') return 'svg';
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  return 'autre';
}

/**
 * Range les sources réelles en un seul arbre. Un dossier dont le parent est
 * absent remonte à la racine « Assets de la marque » (il ne disparaît jamais) ;
 * un média rangé dans un dossier inconnu aussi. Une sortie Studios rejoint le
 * dossier virtuel de son projet, sous « Créations ».
 */
export function donneesDrive(src: { dossiers: readonly DossierSource[]; medias: readonly MediaSource[] }): DonneesDrive {
  const ids = new Set(src.dossiers.map((d) => d.id));
  const dossiers: DossierDrive[] = RACINES_DRIVE.map((r) => ({ id: r.id, nom: r.nom, parent: null, reel: false, verrouille: true, supprime: false, creeLe: '', tag: null }));
  for (const d of src.dossiers) {
    dossiers.push({
      id: d.id, nom: d.name, parent: d.parentId && ids.has(d.parentId) && d.parentId !== d.id ? d.parentId : ID_ASSETS,
      reel: true, verrouille: d.locked, supprime: d.deletedAt != null, creeLe: d.createdAt,
      // Une valeur hors catalogue (impossible sous la contrainte CHECK) ne s'affiche pas.
      tag: estTagCouleur(d.colorTag) ? d.colorTag : null,
    });
  }
  const projets = new Map<string, DossierDrive>();
  const fichiers: FichierDrive[] = [];
  for (const m of src.medias) {
    const base = {
      id: m.id, nom: m.name, type: typeFichier(m.kind, m.mimeType), tailleOctets: m.sizeBytes, creeLe: m.createdAt,
      url: m.url, vignette: typeFichier(m.kind, m.mimeType) === 'svg' ? null : (m.thumbUrl ?? (m.kind === 'image' ? m.url : null)), source: LIBELLE_SOURCE[m.source] ?? m.source,
    };
    if (m.studio) {
      const pid = `p:${m.studio.projetId}`;
      const p = projets.get(pid);
      if (!p) projets.set(pid, { id: pid, nom: m.studio.projetTitre, parent: 'r:creations', reel: false, verrouille: true, supprime: false, creeLe: m.createdAt, tag: null });
      else if (m.createdAt > p.creeLe) p.creeLe = m.createdAt;
      fichiers.push({ ...base, parent: pid, droit: null, lectureSeule: true, projet: { href: m.studio.href, titre: m.studio.projetTitre } });
    } else if (m.historique) {
      fichiers.push({ ...base, parent: 'r:anciens', droit: null, lectureSeule: true, telecharger: m.historique.telecharger });
    } else {
      fichiers.push({ ...base, parent: m.folderId && ids.has(m.folderId) ? m.folderId : ID_ASSETS, droit: m.rights ?? null, lectureSeule: false, ...(m.ia ? { ia: m.ia } : {}) });
    }
  }
  dossiers.push(...projets.values());
  return { dossiers, fichiers };
}

/* ───────────────────────────── Lecture de l'arbre ───────────────────────────── */

interface Index {
  parDossier: Map<string, DossierDrive>;
  enfants: Map<string, DossierDrive[]>;
  fichiersDe: Map<string, FichierDrive[]>;
  /** Un dossier est-il visible (ni lui ni un ancêtre en corbeille) ? */
  vivant: (id: string) => boolean;
}

function indexer(d: DonneesDrive): Index {
  const parDossier = new Map(d.dossiers.map((x) => [x.id, x] as const));
  const enfants = new Map<string, DossierDrive[]>();
  for (const x of d.dossiers) if (x.parent) enfants.set(x.parent, [...(enfants.get(x.parent) ?? []), x]);
  const fichiersDe = new Map<string, FichierDrive[]>();
  for (const f of d.fichiers) fichiersDe.set(f.parent, [...(fichiersDe.get(f.parent) ?? []), f]);
  const memo = new Map<string, boolean>();
  const vivant = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const vus = new Set<string>();
    let cur: DossierDrive | undefined = parDossier.get(id);
    let ok = !!cur;
    while (cur) {
      if (cur.supprime) { ok = false; break; }
      if (vus.has(cur.id)) break; // garde-fou · données incohérentes, pas de boucle
      vus.add(cur.id);
      cur = cur.parent ? parDossier.get(cur.parent) : undefined;
    }
    memo.set(id, ok);
    return ok;
  };
  return { parDossier, enfants, fichiersDe, vivant };
}

const sousDossiersVivants = (ix: Index, id: string) => (ix.enfants.get(id) ?? []).filter((x) => !x.supprime);

/** Fichiers d'un dossier et de tout son sous-arbre (visités une fois). */
function fichiersSousArbre(ix: Index, id: string, inclureSupprimes = false): FichierDrive[] {
  const out: FichierDrive[] = [];
  const pile = [id];
  const vus = new Set<string>();
  while (pile.length) {
    const x = pile.pop()!;
    if (vus.has(x)) continue;
    vus.add(x);
    out.push(...(ix.fichiersDe.get(x) ?? []));
    for (const e of ix.enfants.get(x) ?? []) if (inclureSupprimes || !e.supprime) pile.push(e.id);
  }
  return out;
}

/* ───────────────────────────── Formats ───────────────────────────── */

const dec1 = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** La taille comme la maquette · « 2,4 Mo », « 860 Ko », « 1,2 Go ». */
export function formatTaille(octets: number | null | undefined): string {
  if (octets == null || !Number.isFinite(octets) || octets < 0) return 'Taille inconnue';
  const mo = octets / 1_048_576;
  if (mo >= 1024) return `${dec1(mo / 1024)} Go`;
  if (mo >= 1) return `${dec1(mo)} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const jourDe = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** « Aujourd’hui », « Hier », sinon « 18 oct. » (maquette `DDAY`). Jours calendaires UTC. */
export function libelleJour(iso: string, maintenant: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ecart = Math.round((jourDe(maintenant) - jourDe(d)) / 86_400_000);
  if (ecart <= 0) return 'Aujourd’hui';
  if (ecart === 1) return 'Hier';
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** La pastille de droit d'usage · libellés EXACTS du catalogue normatif. */
export function pastilleDroit(droit: string | null): { classe: '' | 'g' | 'w'; libelle: string } {
  if (droit == null || droit === '') return { classe: '', libelle: 'Droits non classés' };
  if (!estDroitAsset(droit)) return { classe: 'w', libelle: 'Droit inconnu' };
  return { classe: droitAutorisePub(droit) ? 'g' : 'w', libelle: libelleDroit(droit) };
}

export const LIBELLE_TYPE_FICHIER: Record<TypeFichierDrive, string> = {
  image: 'Image', video: 'Vidéo', audio: 'Audio', pdf: 'Document PDF', svg: 'Logo vectoriel', autre: 'Fichier',
};

/* ───────────────────────────── La vue ───────────────────────────── */

export type SectionDrive = 'drive' | 'recents' | 'corbeille';
export const SECTIONS_DRIVE: ReadonlyArray<{ cle: SectionDrive; icone: string; nom: string }> = [
  { cle: 'drive', icone: 'folder', nom: 'Mon drive' },
  { cle: 'recents', icone: 'cal', nom: 'Récents' },
  { cle: 'corbeille', icone: 'x', nom: 'Corbeille' },
];
export type TriDrive = 'nom' | 'date' | 'taille';

export interface EtatDrive {
  section: SectionDrive;
  /** Le chemin ouvert, depuis « Mon drive » · `[]` = la racine du drive. */
  chemin: string[];
  recherche: string;
  tri: TriDrive;
  /** Les nœuds dépliés dans l'arbre. */
  ouverts: ReadonlySet<string>;
  /** Filtre par type de fichier (geste de l'écran V5) · absent ou `tous` = aucun filtre. */
  type?: FiltreTypeDrive;
  /**
   * Filtre par tag de couleur (maquette · puces « Tags » de l'arbre, adresse
   * `?tag=`) · les dossiers RÉELS vivants qui le portent, toutes racines
   * confondues. Sans effet hors de « Mon drive » ou pendant une recherche.
   */
  tag?: CleTagCouleur | null;
}

/** Le filtre par type de l'écran V5 (images, vidéos, audio, autres). */
export type FiltreTypeDrive = 'tous' | 'image' | 'video' | 'audio' | 'autre';
export const FILTRES_TYPE_DRIVE: ReadonlyArray<{ cle: FiltreTypeDrive; libelle: string }> = [
  { cle: 'tous', libelle: 'Tous les types' }, { cle: 'image', libelle: 'Images' }, { cle: 'video', libelle: 'Vidéos' }, { cle: 'audio', libelle: 'Audio' }, { cle: 'autre', libelle: 'Autres fichiers' },
];
/** Un fichier passe-t-il le filtre ? Un SVG est une image, un PDF un « autre » fichier. */
export function passeFiltreType(t: TypeFichierDrive, f: FiltreTypeDrive | undefined): boolean {
  if (!f || f === 'tous') return true;
  if (f === 'image') return t === 'image' || t === 'svg';
  if (f === 'autre') return t === 'pdf' || t === 'autre';
  return t === f;
}

export const ETAT_DRIVE_INITIAL: EtatDrive = {
  section: 'drive', chemin: [ID_ASSETS], recherche: '', tri: 'nom', ouverts: new Set(RACINES_DRIVE.map((r) => r.id)),
};

export interface NoeudArbreDrive {
  id: string; nom: string; niveau: number; racine: boolean; icone: string;
  aEnfants: boolean; ouvert: boolean; actif: boolean; compte: number; separateurAvant: boolean;
  /** Pastille du tag de couleur, à droite du nom. */
  tag: TagCouleur | null;
}

export interface CarteDossierDrive {
  id: string; nom: string; compte: number; sousDossiers: number;
  vignettes: Array<{ url: string | null; type: TypeFichierDrive }>;
  /** Dossier réel non verrouillé · sélectionnable (corbeille, restauration). */
  selectionnable: boolean;
  /** Le tag posé (étiquette de la carte, teinte de la carte). */
  tag: TagCouleur | null;
  /** Dossier réel hors corbeille · le bouton « Tag de couleur » s'y propose (verrouillé compris · le tag ne détruit rien). */
  taggable: boolean;
}

export interface VueDrive {
  onglets: Array<{ id: string; nom: string; icone: string; compte: number; actif: boolean }>;
  banniere: boolean;
  arbre: NoeudArbreDrive[];
  fil: Array<{ libelle: string; index: number | null }>;
  dossiers: CarteDossierDrive[];
  fichiers: FichierDrive[];
  /** « Nouveau sous-dossier » · où il sera créé (`parentId` null = racine des assets). */
  nouveau: { dans: string; parentId: string | null } | null;
  vide: { titre: string; texte: string; icone: string } | null;
  /** Où arrivent les fichiers importés · les actions d'import ne rangent pas, ils vont aux assets. */
  depot: string;
  /** Le volume réellement mesuré (les tailles connues) · aucun quota n'existe. */
  volume: string;
  /** Le filtre par tag APPLIQUÉ (bandeau « Dossiers tagués … ») · null sans filtre. */
  filtreTag: TagCouleur | null;
  /** Les puces de filtre · les tags en usage sur les dossiers vivants, avec leur nombre. */
  tags: Array<TagCouleur & { compte: number; actif: boolean }>;
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function trierDossiers(ix: Index, ds: DossierDrive[], tri: TriDrive): DossierDrive[] {
  const taille = (id: string) => fichiersSousArbre(ix, id).reduce((a, f) => a + (f.tailleOctets ?? 0), 0);
  const parNom = (a: DossierDrive, b: DossierDrive) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id);
  const cmp = tri === 'date' ? (a: DossierDrive, b: DossierDrive) => (b.creeLe.localeCompare(a.creeLe) || parNom(a, b))
    : tri === 'taille' ? (a: DossierDrive, b: DossierDrive) => (taille(b.id) - taille(a.id) || parNom(a, b)) : parNom;
  return [...ds].sort(cmp);
}

function trierFichiers(fs: FichierDrive[], tri: TriDrive): FichierDrive[] {
  const parNom = (a: FichierDrive, b: FichierDrive) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id);
  const cmp = tri === 'date' ? (a: FichierDrive, b: FichierDrive) => (b.creeLe.localeCompare(a.creeLe) || parNom(a, b))
    : tri === 'taille' ? (a: FichierDrive, b: FichierDrive) => ((b.tailleOctets ?? -1) - (a.tailleOctets ?? -1) || parNom(a, b)) : parNom;
  return [...fs].sort(cmp);
}

function carte(ix: Index, d: DossierDrive, avecSupprimes = false): CarteDossierDrive {
  const tous = fichiersSousArbre(ix, d.id, avecSupprimes);
  return {
    id: d.id, nom: d.nom, compte: tous.length,
    sousDossiers: (ix.enfants.get(d.id) ?? []).filter((x) => avecSupprimes || !x.supprime).length,
    vignettes: tous.slice(0, 3).map((f) => ({ url: f.type === 'image' ? f.vignette : null, type: f.type })),
    selectionnable: d.reel && !d.verrouille,
    tag: tagCouleur(d.tag),
    taggable: d.reel && !avecSupprimes && !d.supprime,
  };
}

/** Le chemin demandé, borné aux dossiers vivants · un dossier disparu ramène à son dernier ancêtre valide. */
export function cheminValide(d: DonneesDrive, chemin: readonly string[]): string[] {
  const ix = indexer(d);
  const out: string[] = [];
  for (const id of chemin) {
    const x = ix.parDossier.get(id);
    if (!x || !ix.vivant(id) || (x.parent ?? null) !== (out[out.length - 1] ?? null)) break;
    out.push(id);
  }
  return out;
}

/** Le chemin complet jusqu'à un dossier (racine comprise) · pour ouvrir un dossier depuis l'arbre. */
export function cheminVers(d: DonneesDrive, id: string): string[] {
  const ix = indexer(d);
  const out: string[] = [];
  const vus = new Set<string>();
  let cur = ix.parDossier.get(id);
  while (cur && !vus.has(cur.id)) { vus.add(cur.id); out.unshift(cur.id); cur = cur.parent ? ix.parDossier.get(cur.parent) : undefined; }
  return out;
}

export function vueDrive(d: DonneesDrive, e: EtatDrive): VueDrive {
  const ix = indexer(d);
  const chemin = cheminValide(d, e.chemin);
  const courant = chemin[chemin.length - 1] ?? null;
  const q = normaliser(e.recherche);
  // Le filtre par tag ne vaut que dans « Mon drive », hors recherche (la maquette efface l'un quand l'autre arrive).
  const filtreTag = e.section === 'drive' && !q ? tagCouleur(e.tag) : null;
  const enDrive = e.section === 'drive' && !q && !filtreTag;

  const onglets = RACINES_DRIVE.map((r) => ({
    id: r.id, nom: r.nom, icone: r.icone, compte: fichiersSousArbre(ix, r.id).length,
    actif: enDrive && chemin[0] === r.id,
  }));

  const arbre: NoeudArbreDrive[] = [];
  const noeud = (x: DossierDrive, niveau: number, sep: boolean) => {
    const enfants = trierDossiers(ix, sousDossiersVivants(ix, x.id), 'nom');
    const ouvert = e.ouverts.has(x.id);
    arbre.push({
      id: x.id, nom: x.nom, niveau, racine: niveau === 0, icone: RACINES_DRIVE.find((r) => r.id === x.id)?.icone ?? 'folder',
      aEnfants: enfants.length > 0, ouvert, actif: enDrive && courant === x.id, compte: fichiersSousArbre(ix, x.id).length, separateurAvant: sep,
      tag: tagCouleur(x.tag),
    });
    if (ouvert) for (const c of enfants) noeud(c, niveau + 1, false);
  };
  RACINES_DRIVE.forEach((r, i) => noeud(ix.parDossier.get(r.id)!, 0, i > 0));

  const nomSection = SECTIONS_DRIVE.find((s) => s.cle === e.section)!.nom;
  const fil = q ? [{ libelle: `Résultats pour « ${e.recherche.trim()} »`, index: null }]
    : filtreTag ? [{ libelle: `Dossiers tagués « ${filtreTag.libelle} »`, index: null }]
    : e.section !== 'drive' ? [{ libelle: nomSection, index: null }]
      : [{ libelle: 'Mon drive', index: 0 }, ...chemin.map((id, i) => ({ libelle: ix.parDossier.get(id)!.nom, index: i + 1 }))];

  let dossiers: DossierDrive[] = [];
  let fichiers: FichierDrive[] = [];
  const fichiersVivants = () => d.fichiers.filter((f) => ix.vivant(f.parent));
  if (q) {
    dossiers = d.dossiers.filter((x) => !estRacine(x.id) && ix.vivant(x.id) && normaliser(x.nom).includes(q));
    // Le nom, ou un tag posé par l'analyse (la recherche V5 portait sur les deux).
    fichiers = fichiersVivants().filter((f) => normaliser(f.nom).includes(q) || (f.ia?.tags ?? []).some((t) => normaliser(t).includes(q)));
  } else if (filtreTag) {
    dossiers = d.dossiers.filter((x) => x.reel && x.tag === filtreTag.cle && ix.vivant(x.id));
  } else if (e.section === 'recents') {
    fichiers = [...fichiersVivants()].sort((a, b) => b.creeLe.localeCompare(a.creeLe) || a.id.localeCompare(b.id)).slice(0, 12);
  } else if (e.section === 'corbeille') {
    // Seuls les sommets de la corbeille · un sous-dossier parti avec son parent revient avec lui.
    dossiers = d.dossiers.filter((x) => x.reel && x.supprime && !(x.parent && ix.parDossier.get(x.parent)?.supprime));
  } else if (courant) {
    dossiers = sousDossiersVivants(ix, courant);
    fichiers = ix.fichiersDe.get(courant) ?? [];
  } else {
    dossiers = RACINES_DRIVE.map((r) => ix.parDossier.get(r.id)!);
  }

  const cartes = trierDossiers(ix, dossiers, e.tri).map((x) => carte(ix, x, e.section === 'corbeille'));
  fichiers = fichiers.filter((f) => passeFiltreType(f.type, e.type));
  const triés = e.section === 'recents' ? fichiers : trierFichiers(fichiers, e.tri);

  const cur = courant ? ix.parDossier.get(courant)! : null;
  const creable = enDrive && !!cur && (cur.id === ID_ASSETS || cur.reel);
  const nouveau = creable ? { dans: cur!.nom, parentId: cur!.id === ID_ASSETS ? null : cur!.id } : null;

  const vide = cartes.length || triés.length ? null
    : e.section === 'corbeille' ? { titre: 'La corbeille est vide', texte: 'Un dossier supprimé reste ici, restaurable, avec son contenu.', icone: 'x' }
      : q ? { titre: 'Aucun fichier trouvé', texte: 'Essaie un autre nom de fichier ou de dossier.', icone: 'down' }
        : filtreTag ? { titre: `Aucun dossier tagué « ${filtreTag.libelle} »`, texte: 'Pose un tag depuis le bouton « Tag de couleur » d’un dossier.', icone: 'tag' }
        : { titre: 'Ce dossier est vide', texte: creable ? 'Glisse des fichiers ici ou utilise « Nouveau ».' : 'Rien n’a encore été livré ici.', icone: 'down' };

  const tailles = d.fichiers.filter((f) => !f.lectureSeule);
  const connu = tailles.reduce((a, f) => a + (f.tailleOctets ?? 0), 0);
  const inconnus = tailles.filter((f) => f.tailleOctets == null).length;
  const volume = `${connu > 0 ? formatTaille(connu) : '0 Ko'} de médias importés${inconnus ? ` · taille inconnue pour ${inconnus}` : ''}`;

  return {
    onglets, banniere: enDrive && courant === ID_ASSETS, arbre, fil, dossiers: cartes, fichiers: triés,
    nouveau, vide, depot: ix.parDossier.get(ID_ASSETS)!.nom, volume,
    filtreTag, tags: tagsEnUsage(d.dossiers.filter((x) => x.reel && ix.vivant(x.id)).map((x) => x.tag), filtreTag?.cle ?? null),
  };
}

/**
 * Les destinations de rangement d'un média · la racine « Assets de la marque »
 * (non classé, `id` null) puis chaque dossier RÉEL vivant, nommé par son chemin
 * (« Photos › Packshots »), dans l'ordre de l'arbre.
 */
export function dossiersRangement(d: DonneesDrive): Array<{ id: string | null; nom: string }> {
  const ix = indexer(d);
  const out: Array<{ id: string | null; nom: string }> = [{ id: null, nom: `${ix.parDossier.get(ID_ASSETS)!.nom} · non classé` }];
  const parcourir = (id: string, prefixe: string) => {
    for (const x of trierDossiers(ix, sousDossiersVivants(ix, id), 'nom')) {
      if (!x.reel) continue;
      const nom = prefixe ? `${prefixe} › ${x.nom}` : x.nom;
      out.push({ id: x.id, nom });
      parcourir(x.id, nom);
    }
  };
  parcourir(ID_ASSETS, '');
  return out;
}

/**
 * La tuile Google Drive · son état à partir de l'état RÉEL de la connexion
 * (`getDriveState`, admin seulement · `null` pour un non-admin). Jamais un
 * « connecté » sans jeton, jamais une synchro sans dossier choisi.
 */
export interface ConnexionDriveSpatiale { etat: 'connecte' | 'a-connecter' | 'indisponible'; resume: string; peutSynchroniser: boolean }

export function connexionDrive(s: { available: boolean; needBrand: boolean; connected: boolean; folderId: string | null; folderName: string | null; syncedAt?: string | null; dernier?: DernierSyncDrive | null } | null, fuseau = 'Europe/Paris'): ConnexionDriveSpatiale {
  if (!s) return { etat: 'indisponible', resume: 'Réservé aux administrateurs', peutSynchroniser: false };
  if (!s.available) return { etat: 'indisponible', resume: 'Pas encore activé pour ton espace', peutSynchroniser: false };
  if (s.needBrand) return { etat: 'indisponible', resume: 'Choisis d’abord une marque active', peutSynchroniser: false };
  if (!s.connected) return { etat: 'a-connecter', resume: 'Connecter', peutSynchroniser: false };
  // L'état de la synchro (repris de l'écran V5) · le dernier SUCCÈS, et une dernière tentative en échec dite comme telle.
  const quand = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: fuseau });
  const echec = derniereTentativeDriveEnEchec({ syncedAt: s.syncedAt ?? null, dernier: s.dernier ?? null });
  const suite = !s.folderId ? '' : echec ? ' · dernière synchro en échec' : s.syncedAt ? ` · synchronisé le ${quand(s.syncedAt)}` : ' · jamais synchronisé';
  return { etat: 'connecte', resume: s.folderName ? `Dossier « ${s.folderName} »${suite}` : 'Aucun dossier choisi', peutSynchroniser: !!s.folderId };
}
