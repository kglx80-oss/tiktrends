/**
 * Formats créatifs · la liste UNIQUE (lot 18, dossier décisionnel · lot 19C, v1).
 *
 * ── Ce que ce module tranche ─────────────────────────────────────────────────
 *
 * Une seule taxonomie des formats créatifs : 25 formats et `autre`, chacun avec
 * les MÉDIAS auxquels il s'applique (image, vidéo) et une définition visible.
 * Ce n'est pas « 15 statiques + 10 vidéo » en deux listes · c'est une liste,
 * filtrée par média au moment du choix.
 *
 * Les 18 valeurs de l'ancienne énumération (`packages/ai/src/taxonomy.ts`) sont
 * reprises une à une (17) · `ai_generated` est retirée (c'est un MODE de
 * fabrication, pas une composition). `taxonomy.ts` importe désormais cette
 * liste · aucune seconde taxonomie.
 *
 * Trois états distincts de `autre` :
 * - `non_classe` · rien n'a été tenté (le défaut, et toute valeur illisible) ;
 * - `incertain` · une classification sous le seuil de confiance (réservé à la
 *   v2 IA · la v1 manuelle ne l'écrit pas, mais on le LIT sans le confondre) ;
 * - `autre` · classée, et aucun format de la liste ne convient.
 *
 * ── Où ça s'écrit ────────────────────────────────────────────────────────────
 *
 * `saved_ads.snapshot_json.formatCreatif` = `{ id, version, date, auteur }` ·
 * aucune migration. La lecture est SÛRE : une forme inattendue, un id inconnu,
 * une valeur `null` rendent `non_classe` · jamais d'exception.
 *
 * Pur · ni base, ni réseau, ni modèle.
 */

import type { AdFormat } from './adsmap/format-generation';
import { SHEET_FORMAT } from './adsmap/sheet';

export type MediaFormat = 'image' | 'video';

/** Version de la liste · à incrémenter à chaque changement de la liste. Un
 *  classement fait avec une version antérieure reste lisible et est signalé. */
export const VERSION_FORMATS_CREATIFS = 1;

export const IDS_FORMATS_CREATIFS = [
  'packshot', 'mise_en_situation', 'avant_apres', 'comparatif', 'avis_client', 'promo',
  'callout', 'ingredients', 'liste', 'infographie', 'texte_seul', 'advertorial',
  'conversation', 'meme', 'brut', 'face_camera', 'pov', 'demo', 'deballage', 'tutoriel',
  'fondateur', 'micro_trottoir', 'recit', 'fond_incruste', 'asmr', 'autre',
] as const;

export type FormatCreatifId = (typeof IDS_FORMATS_CREATIFS)[number];

export const FORMAT_NON_CLASSE = 'non_classe' as const;
export const FORMAT_INCERTAIN = 'incertain' as const;
export const FORMAT_AUTRE: FormatCreatifId = 'autre';

export interface FormatCreatif {
  id: FormatCreatifId;
  libelle: string;
  medias: readonly MediaFormat[];
  /** La définition affichée à côté du choix · ce qui distingue ce format. */
  definition: string;
}

const I: readonly MediaFormat[] = ['image'];
const V: readonly MediaFormat[] = ['video'];
const IV: readonly MediaFormat[] = ['image', 'video'];

/** Typé `Record` · un id ajouté sans définition (ou l'inverse) ne compile pas. */
const DEFINITIONS: Record<FormatCreatifId, Omit<FormatCreatif, 'id'>> = {
  packshot: { libelle: 'Packshot', medias: I, definition: 'Le produit seul, fond neutre ou détouré, texte minimal.' },
  mise_en_situation: { libelle: 'Mise en situation', medias: IV, definition: 'Le produit dans une scène de vie.' },
  avant_apres: { libelle: 'Avant / après', medias: IV, definition: 'Deux états du même sujet.' },
  comparatif: { libelle: 'Nous contre eux', medias: IV, definition: 'Notre produit face à une alternative.' },
  avis_client: { libelle: 'Avis client', medias: IV, definition: 'Un avis montré comme tel (étoiles, capture, citation signée).' },
  promo: { libelle: 'Promo / offre', medias: IV, definition: 'L’offre est le sujet visuel (prix, remise, code).' },
  callout: { libelle: 'Bénéfices pointés', medias: I, definition: 'Étiquettes ou flèches sur le produit.' },
  ingredients: { libelle: 'Ingrédients', medias: IV, definition: 'Actifs ou composition montrés.' },
  liste: { libelle: 'Liste', medias: IV, definition: 'Puces ou cases cochées.' },
  infographie: { libelle: 'Infographie', medias: I, definition: 'Chiffres ou schémas mis en forme.' },
  texte_seul: { libelle: 'Texte seul', medias: I, definition: 'Le message occupe l’image.' },
  advertorial: { libelle: 'Advertorial', medias: I, definition: 'Imite une page éditoriale.' },
  conversation: { libelle: 'Conversation', medias: IV, definition: 'Messagerie ou commentaires mis en scène.' },
  meme: { libelle: 'Mème', medias: IV, definition: 'Gabarit de mème reconnaissable.' },
  brut: { libelle: 'Volontairement brut', medias: IV, definition: 'Esthétique amateur assumée.' },
  face_camera: { libelle: 'Face caméra', medias: V, definition: 'Une personne parle à l’objectif.' },
  pov: { libelle: 'Point de vue', medias: V, definition: 'Filmé à la première personne.' },
  demo: { libelle: 'Démonstration', medias: V, definition: 'Le produit utilisé, geste montré.' },
  deballage: { libelle: 'Déballage', medias: V, definition: 'Ouverture du colis ou du produit.' },
  tutoriel: { libelle: 'Tutoriel', medias: V, definition: 'Étapes expliquées.' },
  fondateur: { libelle: 'Fondateur', medias: V, definition: 'Le fondateur présente.' },
  micro_trottoir: { libelle: 'Micro-trottoir', medias: V, definition: 'Passants interrogés.' },
  recit: { libelle: 'Récit', medias: V, definition: 'Une histoire racontée.' },
  fond_incruste: { libelle: 'Fond incrusté', medias: V, definition: 'Une personne devant une image incrustée.' },
  asmr: { libelle: 'ASMR', medias: V, definition: 'Sons et gestes rapprochés.' },
  autre: { libelle: 'Autre', medias: IV, definition: 'Classée · aucun format de la liste ne convient.' },
};

/** La liste, dans l'ordre d'affichage (`autre` en dernier). */
export const FORMATS_CREATIFS: readonly FormatCreatif[] = IDS_FORMATS_CREATIFS.map((id) => ({ id, ...DEFINITIONS[id] }));

const PAR_ID = new Map<string, FormatCreatif>(FORMATS_CREATIFS.map((f) => [f.id, f]));

export function estFormatCreatif(v: unknown): v is FormatCreatifId {
  return typeof v === 'string' && PAR_ID.has(v);
}

export function formatCreatif(id: FormatCreatifId): FormatCreatif {
  return PAR_ID.get(id)!;
}

/**
 * Les 18 valeurs de l'ancienne énumération (`FORMAT`, `ai/taxonomy.ts`) ·
 * 17 reprises une à une, `ai_generated` retirée (`null`).
 */
export const ANCIENNES_VALEURS_FORMAT: Readonly<Record<string, FormatCreatifId | null>> = {
  ugc_talking_head: 'face_camera',
  pov: 'pov',
  before_after: 'avant_apres',
  green_screen: 'fond_incruste',
  listicle: 'liste',
  storytime: 'recit',
  demo: 'demo',
  founder: 'fondateur',
  testimonial: 'avis_client',
  static_product: 'packshot',
  static_text: 'texte_seul',
  meme: 'meme',
  comparison: 'comparatif',
  unboxing: 'deballage',
  asmr: 'asmr',
  tutorial: 'tutoriel',
  street_interview: 'micro_trottoir',
  ai_generated: null,
};

/** Une ancienne valeur → le format de la liste, ou `null` (retirée / inconnue). */
export function formatDepuisAncienneValeur(v: unknown): FormatCreatifId | null {
  if (typeof v !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(ANCIENNES_VALEURS_FORMAT, v) ? ANCIENNES_VALEURS_FORMAT[v]! : null;
}

/**
 * Le média d'une annonce, depuis le `mediaType` de la source · `video` → vidéo,
 * `image` / `carousel` / `photo` → image, sinon `null` (inconnu · on ne
 * restreint pas la liste plutôt que de deviner).
 */
export function mediaAnnonce(mediaType: unknown): MediaFormat | null {
  if (typeof mediaType !== 'string') return null;
  const m = mediaType.trim().toLowerCase();
  if (!m) return null;
  if (m.includes('vid')) return 'video';
  if (m.includes('image') || m.includes('carousel') || m.includes('carrousel') || m.includes('photo') || m === 'static') return 'image';
  return null;
}

/** Les formats proposés pour un média · média inconnu → toute la liste. `autre` est toujours là. */
export function formatsPourMedia(media: MediaFormat | null): FormatCreatif[] {
  return FORMATS_CREATIFS.filter((f) => media === null || f.medias.includes(media));
}

export function formatCompatible(id: FormatCreatifId, media: MediaFormat | null): boolean {
  return media === null || formatCreatif(id).medias.includes(media);
}

/* ── Lecture sûre ─────────────────────────────────────────────────────────── */

export type EtatFormat = 'classe' | typeof FORMAT_NON_CLASSE | typeof FORMAT_INCERTAIN;

export interface FormatEnregistre { id: FormatCreatifId | typeof FORMAT_INCERTAIN; version: number; date: string; auteur: string | null }

export interface LectureFormat {
  etat: EtatFormat;
  /** Le format quand `etat === 'classe'`, sinon `null`. */
  id: FormatCreatifId | null;
  version: number | null;
  /** Classé avec une version antérieure de la liste · lisible, à signaler. */
  versionAncienne: boolean;
  date: string | null;
  auteur: string | null;
}

export const LECTURE_NON_CLASSE: LectureFormat = { etat: FORMAT_NON_CLASSE, id: null, version: null, versionAncienne: false, date: null, auteur: null };

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Lit `snapshot_json.formatCreatif` · forme attendue `{ id, version, date, auteur }`.
 * Tolère une ancienne valeur (`static_product` → `packshot`) et une chaîne nue.
 * Tout le reste (id inconnu, nombre, tableau, objet vide, snapshot absent) →
 * `non_classe`. Ne lève jamais.
 *
 * `versionAncienne` · tout classement qui n'a pas été choisi dans la liste
 * COURANTE est signalé « à revoir » (message 55 · e) · version antérieure,
 * absence de version (l'action v1 en écrit toujours une), valeur de l'ancienne
 * taxonomie reprise par `ANCIENNES_VALEURS_FORMAT`, ou valeur RETIRÉE
 * (`ai_generated` · lue non classée, mais le classement perdu se dit). Une
 * reprise n'est jamais un reclassement silencieux.
 */
export function lireFormatCreatif(snapshot: unknown): LectureFormat {
  if (!estObjet(snapshot)) return LECTURE_NON_CLASSE;
  const brut = snapshot.formatCreatif;
  const rec = estObjet(brut) ? brut : typeof brut === 'string' ? { id: brut } : null;
  if (!rec) return LECTURE_NON_CLASSE;

  const version = typeof rec.version === 'number' && Number.isFinite(rec.version) ? rec.version : null;
  const date = typeof rec.date === 'string' && !Number.isNaN(Date.parse(rec.date)) ? rec.date : null;
  const auteur = typeof rec.auteur === 'string' && rec.auteur ? rec.auteur : null;
  const avantListe = version === null || version < VERSION_FORMATS_CREATIFS;
  const meta = { version, versionAncienne: avantListe, date, auteur };

  if (rec.id === FORMAT_INCERTAIN) return { etat: FORMAT_INCERTAIN, id: null, ...meta };
  if (estFormatCreatif(rec.id)) return { etat: 'classe', id: rec.id, ...meta };
  const ancienne = typeof rec.id === 'string' && Object.prototype.hasOwnProperty.call(ANCIENNES_VALEURS_FORMAT, rec.id);
  if (!ancienne) return LECTURE_NON_CLASSE;
  const repris = formatDepuisAncienneValeur(rec.id);
  if (repris) return { etat: 'classe', id: repris, ...meta, versionAncienne: true };
  // Retirée de la liste · non classée, signalée.
  return { ...LECTURE_NON_CLASSE, version, versionAncienne: true, date, auteur };
}

/**
 * Retire `formatCreatif` d'un snapshot fourni par le client · un classement ne
 * s'écrit QUE par l'action dédiée (validée, datée, signée), jamais en passager
 * d'une sauvegarde.
 */
export function sansFormatCreatif<T>(snapshot: T): T {
  if (!estObjet(snapshot) || !('formatCreatif' in snapshot)) return snapshot;
  const { formatCreatif: _retire, ...reste } = snapshot;
  void _retire;
  return reste as T;
}

/* ── Écriture validée ─────────────────────────────────────────────────────── */

export type ChoixFormat = { ok: true; id: FormatCreatifId | null } | { ok: false; raison: string };

/**
 * Valide un choix manuel · `non_classe` → `null` (le classement est retiré).
 * Un id hors liste est refusé · un format qui ne s'applique pas au média de
 * l'annonce aussi (un packshot n'est pas une vidéo).
 */
export function validerChoixFormat(valeur: unknown, media: MediaFormat | null): ChoixFormat {
  if (valeur === FORMAT_NON_CLASSE) return { ok: true, id: null };
  if (!estFormatCreatif(valeur)) return { ok: false, raison: 'Format inconnu · recharge la page et choisis dans la liste.' };
  if (!formatCompatible(valeur, media)) {
    return { ok: false, raison: `« ${formatCreatif(valeur).libelle} » ne s’applique pas à une annonce ${media === 'video' ? 'vidéo' : 'image'} · choisis un format proposé.` };
  }
  return { ok: true, id: valeur };
}

/** Ce qu'on écrit dans `snapshot_json.formatCreatif`. */
export function enregistrementFormat(id: FormatCreatifId, auteur: string | null, maintenant: Date): FormatEnregistre {
  return { id, version: VERSION_FORMATS_CREATIFS, date: maintenant.toISOString(), auteur };
}

/* ── Critères (URL) ───────────────────────────────────────────────────────── */

export type VueFormat = FormatCreatifId | typeof FORMAT_NON_CLASSE | typeof FORMAT_INCERTAIN;
export type TriFormats = 'recent' | 'ancien' | 'classe' | 'duree';
export const TRIS_FORMATS: ReadonlyArray<{ id: TriFormats; libelle: string }> = [
  { id: 'recent', libelle: 'Sauvegardées récemment' },
  { id: 'ancien', libelle: 'Sauvegardées en premier' },
  { id: 'classe', libelle: 'Classées récemment' },
  { id: 'duree', libelle: 'Plus longue diffusion' },
];

export interface CriteresFormats {
  /** `null` · la liste des formats ; sinon la grille de ce format (ou des non classées). */
  format: VueFormat | null;
  media: MediaFormat | null;
  plateforme: string | null;
  tri: TriFormats;
}

export const CRITERES_FORMATS_DEFAUT: CriteresFormats = { format: null, media: null, plateforme: null, tri: 'recent' };

type Params = string | URLSearchParams | Record<string, string | string[] | undefined>;

function versParams(p: Params): URLSearchParams {
  if (typeof p === 'string') return new URLSearchParams(p.startsWith('?') ? p.slice(1) : p);
  if (p instanceof URLSearchParams) return p;
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (typeof s === 'string') out.set(k, s);
  }
  return out;
}

const PLATEFORME_SURE = /^[a-z][a-z0-9_-]{0,23}$/;

/** Critères lus depuis l'URL · toute valeur inconnue revient au défaut. */
export function lireCriteresFormats(p: Params): CriteresFormats {
  const q = versParams(p);
  const f = q.get('format');
  const format: VueFormat | null = f === FORMAT_NON_CLASSE || f === FORMAT_INCERTAIN || estFormatCreatif(f) ? f : null;
  const m = q.get('media');
  const media: MediaFormat | null = m === 'image' || m === 'video' ? m : null;
  const pl = q.get('plateforme');
  const plateforme = pl && PLATEFORME_SURE.test(pl) ? pl : null;
  const t = q.get('tri');
  const tri: TriFormats = TRIS_FORMATS.some((x) => x.id === t) ? (t as TriFormats) : 'recent';
  return { format, media, plateforme, tri };
}

/** Seuls les écarts au défaut sont écrits · une vue non filtrée garde une URL nue. */
export function ecrireCriteresFormats(c: CriteresFormats): string {
  const q = new URLSearchParams();
  if (c.format) q.set('format', c.format);
  if (c.media) q.set('media', c.media);
  if (c.plateforme) q.set('plateforme', c.plateforme);
  if (c.tri !== 'recent') q.set('tri', c.tri);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function libellePlateforme(p: string): string {
  if (p === 'meta' || p === 'facebook') return 'Meta';
  if (p === 'tiktok') return 'TikTok';
  if (p === 'google') return 'Google';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export function libelleVueFormat(v: VueFormat): string {
  if (v === FORMAT_NON_CLASSE) return 'Non classées';
  if (v === FORMAT_INCERTAIN) return 'Incertaines';
  return formatCreatif(v).libelle;
}

export interface CritereActif { cle: 'format' | 'media' | 'plateforme' | 'tri'; libelle: string; /** La recherche d'URL SANS ce critère. */ sansLui: string }

/** Les critères posés, chacun avec l'URL qui le retire. */
export function criteresActifsFormats(c: CriteresFormats): CritereActif[] {
  const out: CritereActif[] = [];
  if (c.format) out.push({ cle: 'format', libelle: `Format · ${libelleVueFormat(c.format)}`, sansLui: ecrireCriteresFormats({ ...c, format: null }) });
  if (c.media) out.push({ cle: 'media', libelle: `Média · ${c.media === 'video' ? 'Vidéo' : 'Image'}`, sansLui: ecrireCriteresFormats({ ...c, media: null }) });
  if (c.plateforme) out.push({ cle: 'plateforme', libelle: `Source · ${libellePlateforme(c.plateforme)}`, sansLui: ecrireCriteresFormats({ ...c, plateforme: null }) });
  if (c.tri !== 'recent') out.push({ cle: 'tri', libelle: `Tri · ${TRIS_FORMATS.find((t) => t.id === c.tri)!.libelle}`, sansLui: ecrireCriteresFormats({ ...c, tri: 'recent' }) });
  return out;
}

/* ── Comptage et grille ───────────────────────────────────────────────────── */

export interface AnnonceFormat {
  platform: string;
  mediaType?: string | null;
  daysRunning?: number | null;
  /** Date de sauvegarde (ISO). */
  sauvegardeLe: string;
  format: LectureFormat;
}

/** Une annonce passe-t-elle les filtres de PÉRIMÈTRE (média, source) ? Le format est à part. */
function dansPerimetre(a: AnnonceFormat, c: Pick<CriteresFormats, 'media' | 'plateforme'>): boolean {
  if (c.media && mediaAnnonce(a.mediaType) !== c.media) return false;
  if (c.plateforme && a.platform !== c.plateforme) return false;
  return true;
}

export interface CompteFormats {
  /** Annonces dans le périmètre (média, source). */
  total: number;
  classees: number;
  nonClassees: number;
  incertaines: number;
  /** Formats qui ont AU MOINS une annonce · décroissant, puis ordre de la liste. */
  avecAnnonces: Array<{ format: FormatCreatif; n: number }>;
  /** Formats du média qui n'ont aucune annonce · jamais présentés comme tendance. */
  sansAnnonce: FormatCreatif[];
}

/**
 * Le nombre RÉEL d'annonces par format, dans le périmètre (média, source).
 * Les non classées et les incertaines sont comptées à part · jamais dans un format.
 */
export function compterFormats(annonces: readonly AnnonceFormat[], c: Pick<CriteresFormats, 'media' | 'plateforme'> = CRITERES_FORMATS_DEFAUT): CompteFormats {
  const n = new Map<FormatCreatifId, number>();
  let total = 0; let classees = 0; let nonClassees = 0; let incertaines = 0;
  for (const a of annonces) {
    if (!dansPerimetre(a, c)) continue;
    total++;
    if (a.format.etat === 'classe' && a.format.id) { classees++; n.set(a.format.id, (n.get(a.format.id) ?? 0) + 1); }
    else if (a.format.etat === FORMAT_INCERTAIN) incertaines++;
    else nonClassees++;
  }
  const ordre = new Map(IDS_FORMATS_CREATIFS.map((id, i) => [id, i]));
  const avecAnnonces = [...n.entries()]
    .map(([id, k]) => ({ format: formatCreatif(id), n: k }))
    .sort((a, b) => b.n - a.n || ordre.get(a.format.id)! - ordre.get(b.format.id)!);
  const vus = new Set(n.keys());
  const sansAnnonce = formatsPourMedia(c.media).filter((f) => !vus.has(f.id));
  return { total, classees, nonClassees, incertaines, avecAnnonces, sansAnnonce };
}

function appartient(a: AnnonceFormat, v: VueFormat): boolean {
  if (v === FORMAT_NON_CLASSE) return a.format.etat === FORMAT_NON_CLASSE;
  if (v === FORMAT_INCERTAIN) return a.format.etat === FORMAT_INCERTAIN;
  return a.format.etat === 'classe' && a.format.id === v;
}

const temps = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? -Infinity : t; };

/** La grille d'un format · filtres de périmètre, puis tri. Sans format choisi, rien. */
export function grilleFormat<T extends AnnonceFormat>(annonces: readonly T[], c: CriteresFormats): T[] {
  if (!c.format) return [];
  const v = c.format;
  const out = annonces.filter((a) => dansPerimetre(a, c) && appartient(a, v));
  const cmp: Record<TriFormats, (a: T, b: T) => number> = {
    recent: (a, b) => temps(b.sauvegardeLe) - temps(a.sauvegardeLe),
    ancien: (a, b) => temps(a.sauvegardeLe) - temps(b.sauvegardeLe),
    classe: (a, b) => temps(b.format.date) - temps(a.format.date) || temps(b.sauvegardeLe) - temps(a.sauvegardeLe),
    duree: (a, b) => (b.daysRunning ?? -1) - (a.daysRunning ?? -1) || temps(b.sauvegardeLe) - temps(a.sauvegardeLe),
  };
  return out.sort(cmp[c.tri]);
}

/** Les sources présentes · on ne propose pas un filtre qui ne trouverait rien. */
export function plateformesPresentes(annonces: readonly AnnonceFormat[]): string[] {
  return [...new Set(annonces.map((a) => a.platform))].sort((a, b) => libellePlateforme(a).localeCompare(libellePlateforme(b), 'fr'));
}

/** « 05/10/2026 » · lu en UTC pour un rendu identique serveur et client. */
export function dateCourteFormat(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const z = (x: number) => String(x).padStart(2, '0');
  return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/* ── Accord des sauvegardes à classer (message 56) ───────────────────────── */

/**
 * Le geste qui mène aux non classées · « mes » appelle le pluriel · au
 * singulier, « ma sauvegarde » (mesuré avant · « Classer mes 1 sauvegarde »).
 */
export function libelleClasserSauvegardes(n: number): string {
  if (n <= 0) return 'Rien à classer';
  return n === 1 ? 'Classer ma sauvegarde' : `Classer mes ${n} sauvegardes`;
}

/**
 * Le bandeau des non classées · nom ET participe s'accordent (0 et 1 au
 * singulier, à la française) · mesuré avant · « 1 sauvegarde à classer ·
 * comptées à part ».
 */
export function libelleSauvegardesAClasser(n: number): string {
  return n > 1
    ? `${n} sauvegardes à classer · comptées à part, dans aucun format`
    : `${n} sauvegarde à classer · comptée à part, dans aucun format`;
}

/* ── Pont Adsmap refusé · la raison RÉELLE, dite (message 60) ────────────── */

export type RaisonPontAdsmap = 'offre' | 'role' | 'marque';

/**
 * Pourquoi « Préparer un test · Adsmap » n'est pas proposé · la raison de refus
 * de la fonctionnalité `adsmap` (`denyReason` · rôle avant offre, comme au
 * rbac), sinon l'absence de marque active (le pont écrit dans une marque).
 * `null` = pont ouvert. Avant, le bouton disparaissait sans rien dire.
 */
export function raisonPontAdsmap(refus: 'role' | 'plan' | null, marqueActive: boolean): RaisonPontAdsmap | null {
  if (refus === 'role') return 'role';
  if (refus === 'plan') return 'offre';
  return marqueActive ? null : 'marque';
}

/**
 * Message 71 · « Suivre dans Adsmap » (Sauvegardes) · un nouvel essai est-il
 * permis ? Seuls un envoi EN COURS (`busy`) et un succès (`done`, définitif)
 * le bloquent · une erreur (le texte du refus) se retente · le nouvel essai
 * repasse par l'action et sa garde. Avant, toute valeur bloquait · une erreur
 * de garde (marque active absente) rendait le bouton actif mais muet.
 */
export function suiviAdsmapRelancable(etat: string | undefined): boolean {
  return etat !== 'busy' && etat !== 'done';
}

/**
 * L'explication courte affichée à la place du bouton · aucun lien d'achat.
 * `geste` · le geste que le bouton aurait proposé, tel qu'il s'affiche sur
 * l'écran qui l'utilise · « Préparer un test dans Adsmap » sur
 * `/veille/formats`, « Suivre dans Adsmap » dans Sauvegardes (lot 20B) · la
 * raison est la même, seul le geste nommé change.
 */
export function explicationPontAdsmap(raison: RaisonPontAdsmap | null, geste = 'Préparer un test dans Adsmap'): string | null {
  switch (raison) {
    case 'offre': return `${geste} · inclus dans l’offre Plus.`;
    case 'role': return `${geste} · réservé aux rôles qui ont accès à Adsmap.`;
    case 'marque': return `${geste} · choisis d’abord une marque active.`;
    default: return null;
  }
}

/* ── Pont Sauvegarde → Adsmap · le type d'ad, sans rien inventer (lot 21) ── */

/**
 * Deux notions distinctes, jamais confondues :
 * - le TYPE DE MÉDIA (`mediaAnnonce`, plus le GIF lu à part) · lu dans la source ;
 * - le FORMAT CRÉATIF QUALIFIÉ (`lireFormatCreatif`) · la composition, choisie
 *   à la main dans la liste ci-dessus · conservé à part, dans la provenance.
 *
 * La colonne `adsmap_ads.format` (énumération, NOT NULL, aucune migration) ne
 * connaît que sept TYPES D'AD · leurs libellés sont ceux du contrat Sheet
 * (`SHEET_FORMAT`, `adsmap/sheet.ts`). Aucun outil d'Adsmap ne corrige ce type
 * après coup · une valeur inventée resterait fausse dans les statistiques.
 *
 * Avant (lot 20, R3) · le pont écrivait `video_ugc` en dur · une annonce IMAGE
 * qualifiée « Packshot » devenait une « Vidéo UGC ».
 *
 * ── Automatique, seulement là où rien n'est inventé ──────────────────────────
 *
 * | Source                                              | Type d'ad        |
 * | --------------------------------------------------- | ---------------- |
 * | image, et la source dit « carousel » / « carrousel » | `image_carousel` |
 * | image (photo, image, static)                        | `static`         |
 * | vidéo qualifiée `demo` « Démonstration · Le produit | `video_demo`     |
 * |   utilisé, geste montré. »                          |                  |
 *
 * ── Sinon, CHOIX EXPLICITE de l'utilisateur (message 77) ──────────────────────
 *
 * Jamais un refus définitif pour une ambiguïté, jamais un type présélectionné,
 * jamais UGC par défaut · l'utilisateur choisit parmi les types COMPATIBLES
 * avec le média, avant toute création :
 *
 * | Cas                                         | Types proposés (contrat Sheet)                          |
 * | ------------------------------------------- | ------------------------------------------------------- |
 * | vidéo non qualifiée, `incertain`, ou format | `video_ugc` Vidéo UGC, `video_vsl` Vidéo VSL,           |
 * |   sans correspondance sûre (ci-dessous)     | `video_demo` Vidéo démo, `video_story` Vidéo story      |
 * | GIF (la source dit « gif »)                 | `gif` GIF · le seul type du contrat pour ce média       |
 * |                                             |   (import Sheet `gif` → `gif`) · confirmé, pas déduit   |
 * | média inconnu (ni image, ni vidéo, ni GIF)  | les SEPT types · le choix le dit (média inconnu)        |
 *
 * `gif` n'est proposé ni pour une vidéo ni pour une image · rien dans le
 * contrat ne relie un GIF à une source vidéo ou image fixe (la synchro le range
 * en créa `image`, sans en faire un type d'image fixe).
 *
 * Formats vidéo qualifiés SANS correspondance sûre (donc choix) · leur
 * définition ne désigne pas un seul type :
 * - `face_camera` « Une personne parle à l'objectif. » · UGC, VSL ou acteur
 *   selon QUI parle (Adsmap distingue créateur UGC, fondateur, acteur ·
 *   `talentTypeEnum`) ;
 * - `recit` « Une histoire racontée. » · « story » désigne aussi le placement
 *   Stories · ambigu avec `video_story` ;
 * - `tutoriel` « Étapes expliquées. » · démonstration OU face caméra ;
 * - `fondateur`, `pov`, `deballage`, `micro_trottoir`, `fond_incruste`, `asmr`,
 *   les formats image + vidéo et `autre` · aucun type ne les nomme.
 */
export const FORMAT_AD_VIDEO_QUALIFIEE: Readonly<Partial<Record<FormatCreatifId, AdFormat>>> = {
  demo: 'video_demo',
};

/** Le média tel que le pont le distingue · le GIF est lu à part (`mediaAnnonce` ne le connaît pas). */
export type MediaPont = MediaFormat | 'gif' | null;

const TOUS_TYPES_AD: readonly AdFormat[] = ['video_ugc', 'video_vsl', 'video_demo', 'video_story', 'static', 'image_carousel', 'gif'];

/** Les types d'ad compatibles avec un média (tableau ci-dessus) · média inconnu → tous. */
export const TYPES_AD_PAR_MEDIA: Readonly<Record<'image' | 'video' | 'gif' | 'inconnu', readonly AdFormat[]>> = {
  video: ['video_ugc', 'video_vsl', 'video_demo', 'video_story'],
  image: ['static', 'image_carousel'],
  gif: ['gif'],
  inconnu: TOUS_TYPES_AD,
};

export interface OptionTypeAd { id: AdFormat; libelle: string }

export function typesAdCompatibles(media: MediaPont): OptionTypeAd[] {
  return TYPES_AD_PAR_MEDIA[media ?? 'inconnu'].map((id) => ({ id, libelle: SHEET_FORMAT[id] ?? id }));
}

/** Le média de la source, GIF compris. */
export function mediaPont(mediaType: unknown): MediaPont {
  if (typeof mediaType === 'string' && /\bgif\b/i.test(mediaType)) return 'gif';
  return mediaAnnonce(mediaType);
}

export type CauseChoixTypeAd = 'media_inconnu' | 'gif' | 'video_non_qualifiee' | 'video_sans_correspondance';

export type DecisionTypeAd =
  | { etat: 'auto'; format: AdFormat; media: MediaPont; /** Le format qualifié, conservé à part (`null` si non classée). */ formatCreatif: FormatCreatifId | null }
  | { etat: 'choix'; cause: CauseChoixTypeAd; media: MediaPont; options: OptionTypeAd[]; raison: string; formatCreatif: FormatCreatifId | null };

const estCarrousel = (mediaType: unknown) => typeof mediaType === 'string' && /carousel|carrousel/i.test(mediaType);

/**
 * Le type d'ad d'une annonce sauvegardée · automatique quand rien n'est
 * inventé, sinon un CHOIX à demander (liste compatible, rien de présélectionné).
 * Lit `snapshot.mediaType` et `snapshot.formatCreatif` · ne lève jamais.
 */
export function formatAdDepuisSauvegarde(snapshot: unknown): DecisionTypeAd {
  const snap = estObjet(snapshot) ? snapshot : {};
  const media = mediaPont(snap.mediaType);
  const lecture = lireFormatCreatif(snapshot);
  const qualifie = lecture.etat === 'classe' ? lecture.id : null;
  const choix = (cause: CauseChoixTypeAd, raison: string): DecisionTypeAd => ({ etat: 'choix', cause, media, options: typesAdCompatibles(media), raison, formatCreatif: qualifie });

  if (media === 'image') {
    return { etat: 'auto', media, format: estCarrousel(snap.mediaType) ? 'image_carousel' : 'static', formatCreatif: qualifie };
  }
  if (media === 'gif') return choix('gif', 'GIF · confirme son type d’ad Adsmap avant de créer la fiche.');
  if (media === null) {
    return choix('media_inconnu', 'Type de média inconnu dans la source · choisis son type d’ad parmi tous les types Adsmap · rien n’est déduit.');
  }
  if (!qualifie) return choix('video_non_qualifiee', 'Vidéo non qualifiée · choisis son type d’ad Adsmap · rien n’est déduit.');
  const format = FORMAT_AD_VIDEO_QUALIFIEE[qualifie];
  if (!format) {
    return choix('video_sans_correspondance', `Format « ${formatCreatif(qualifie).libelle} » · aucun type vidéo d’Adsmap ne lui correspond sans ambiguïté · choisis-le.`);
  }
  return { etat: 'auto', media, format, formatCreatif: qualifie };
}

export type ResolutionTypeAd =
  | { ok: true; format: AdFormat; /** Le type vient d'un choix explicite de l'utilisateur. */ choisi: boolean; formatCreatif: FormatCreatifId | null }
  | { ok: false; cause: 'choix_requis'; options: OptionTypeAd[]; raison: string }
  | { ok: false; cause: 'choix_incompatible'; raison: string };

/**
 * Le type d'ad à ÉCRIRE · la décision, plus le choix reçu du client, VALIDÉ ici
 * contre la liste compatible avec le média lu en base (jamais confiance au
 * client). Automatique · le choix reçu est ignoré (la règle décide). Choix
 * requis · absent → on le demande ; hors liste → refus.
 */
export function resoudreTypeAd(snapshot: unknown, choixClient: unknown): ResolutionTypeAd {
  const d = formatAdDepuisSauvegarde(snapshot);
  if (d.etat === 'auto') return { ok: true, format: d.format, choisi: false, formatCreatif: d.formatCreatif };
  if (choixClient === undefined || choixClient === null || choixClient === '') return { ok: false, cause: 'choix_requis', options: d.options, raison: d.raison };
  const option = d.options.find((o) => o.id === choixClient);
  if (!option) {
    return { ok: false, cause: 'choix_incompatible', raison: `Type d’ad non proposé pour ce média · choisis parmi ${d.options.map((o) => `« ${o.libelle} »`).join(', ')} · rien n’a été créé.` };
  }
  return { ok: true, format: option.id, choisi: true, formatCreatif: d.formatCreatif };
}
