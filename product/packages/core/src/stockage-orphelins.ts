/**
 * Stockage · INVENTAIRE des objets candidats orphelins · la règle, pure (ni
 * base, ni réseau). LECTURE SEULE : rien ici ne supprime, et aucun appelant de
 * ce module n'a le droit de supprimer (garde `stockage-orphelins-ecran`).
 *
 * ── Le défaut ────────────────────────────────────────────────────────────────
 *
 * Un dépôt direct range l'objet sous `assets/<espace>/…`
 * (`presignAssetUploadAction`) AVANT que le client ne l'enregistre
 * (`registerUploadedAssetAction`). Un onglet fermé entre les deux, un
 * enregistrement refusé, une coupure entre `putObject` et l'insertion (synchro
 * Drive, migration des images embarquées) · l'objet reste dans le bucket sans
 * qu'aucune ligne ne le pointe. Personne ne savait combien, ni quel volume.
 *
 * ── Ce qui est « référencé » · le recensement ────────────────────────────────
 *
 * `RECENSEMENT_REFERENCES_STOCKAGE` est la SOURCE DE VÉRITÉ : chaque colonne
 * de la base où une adresse ou une clé d'objet du bucket peut se trouver. Deux
 * natures :
 *  - `ecrit` · un chemin du code y écrit une adresse ou une clé du bucket
 *    (recensé par grep de `putObject(`, `presignPutUrl(`, `newAssetKey(`,
 *    `` `assets/ ``, `storageKey:` · le test `stockage-orphelins-ecran`
 *    refuse un nouvel appelant de `putObject`/`presignPutUrl` absent d'ici) ;
 *  - `libre` · aucun écrivain du bucket, mais un texte libre ou un JSON où
 *    une adresse du bucket peut avoir été COLLÉE ou recopiée (photo de profil,
 *    image produit, contenu d'un projet, message Jarvis…). Lu par prudence :
 *    une référence de trop retire un candidat, jamais l'inverse.
 * Le lecteur (`apps/web/lib/stockage-inventaire.ts`) extrait de chaque
 * colonne tout fragment `assets/…` (ou `assets%2F…`), la règle ci-dessous les
 * normalise (`clesReferencees`).
 *
 * ── La règle (`verdictObjetStocke`) ──────────────────────────────────────────
 *
 * Un objet est CANDIDAT orphelin seulement si TOUT est vrai :
 *  1. sa clé est exactement `assets/<uuid d'espace>/<fichier>` (un seul
 *     segment de fichier, `[A-Za-z0-9._-]`), le format de `newAssetKey` et de
 *     la synchro Drive · sinon `hors_format` ;
 *  2. l'espace existe en base · sinon `espace_inconnu` (un espace supprimé,
 *     `_healthcheck`, un préfixe inattendu : on ne sait pas, donc non) ;
 *  3. sa date de dernière modification est connue · sinon `date_inconnue` ;
 *  4. il est plus vieux que `DELAI_GRACE_ORPHELIN_MS` · sinon `recent` ;
 *  5. aucune référence recensée ne le pointe · sinon `reference` ;
 *  6. TOUTES les colonnes recensées ont été lues entièrement · sinon
 *     `references_incompletes` (une lecture tronquée ou en échec peut cacher
 *     la seule référence).
 * Tout doute est un NON. Le silence (zéro candidat) est une réponse valable.
 *
 * ── Le délai de grâce, mesuré ────────────────────────────────────────────────
 *
 * Entre le dépôt (date de l'objet) et l'enregistrement de la ligne, le pire
 * cas réel est un dépôt direct du plus gros fichier admis, sur une connexion
 * lente, commencé à la dernière seconde du lien d'envoi :
 *
 * | Mesure                                             | Valeur      | Où                                 |
 * | -------------------------------------------------- | ----------- | ---------------------------------- |
 * | Validité du lien d'envoi signé                     | 900 s       | `presignPutUrl` (défaut, plafond 900) |
 * | Plus gros dépôt admis (vidéo, son, document)       | 1 Gio       | `PLAFONDS_DEPOT`                   |
 * | Plus grosse image admise                           | 64 Mio      | `PLAFONDS_DEPOT.image`             |
 * | 1 Gio à 1 Mbit/s                                   | 8 590 s · 143 min | calcul                       |
 * | 1 Gio à 5 Mbit/s                                   | 1 718 s · 29 min  | calcul                       |
 * | 64 Mio à 1 Mbit/s                                  | 537 s · 9 min     | calcul                       |
 * | Synchro Drive, migration · `putObject` puis ligne  | quelques s  | `drive-sync.ts`, `storage.ts`      |
 * | Pire cas · lien + 1 Gio à 1 Mbit/s                 | 9 490 s · 2 h 38  | `PIRE_CAS_DEPOT_MS`            |
 *
 * Retenu : 24 h, soit plus de neuf fois le pire cas (la garde exige au moins
 * trois fois) · un dépôt en cours n'est jamais compté, un dépôt abandonné
 * l'est le lendemain.
 */

import { adminIlYa, adminNombre } from './spatial/admin/format';
import { formatTaille } from './spatial/bibliotheque/drive';
import { PLAFONDS_DEPOT } from './depot-fichiers';

/** Validité du lien d'envoi signé · `presignPutUrl` (défaut 900 s, plafond 900 s). */
export const VALIDITE_LIEN_DEPOT_S = 900;

/** Plus gros dépôt direct admis · le plus haut de `PLAFONDS_DEPOT` (1 Gio · vidéo, son, document). */
export const DEPOT_MAX_OCTETS = Math.max(...Object.values(PLAFONDS_DEPOT));

/** Débit lent retenu pour le pire cas · 1 Mbit/s montant. */
export const DEBIT_LENT_BITS_S = 1_000_000;

/** Pire cas mesuré entre la date de l'objet et sa ligne · lien entier + transfert du plus gros fichier au débit lent. */
export const PIRE_CAS_DEPOT_MS = Math.ceil(VALIDITE_LIEN_DEPOT_S * 1000 + (DEPOT_MAX_OCTETS * 8 / DEBIT_LENT_BITS_S) * 1000);

/** Délai de grâce · 24 h (≈ 9 × le pire cas mesuré). */
export const DELAI_GRACE_ORPHELIN_MS = 24 * 3_600_000;

/** Les 50 plus gros candidats montrés à l'écran. */
export const PLUS_GROS_ORPHELINS = 50;

/** Le préfixe inventorié · celui des dépôts, de la synchro Drive et des migrations. */
export const PREFIXE_OBJETS_ESPACES = 'assets/';

export type NatureReference = 'ecrit' | 'libre';
export type FormeColonne = 'texte' | 'tableau' | 'json';

export interface ReferenceRecensee {
  /** Nom SQL de la table. */
  table: string;
  /** Nom SQL de la colonne. */
  colonne: string;
  forme: FormeColonne;
  nature: NatureReference;
  /** Fichiers (chemins depuis `product/`) qui y écrivent une adresse ou une clé du bucket · vide pour `libre`. */
  ecrivains: readonly string[];
  note: string;
}

/**
 * LE recensement · toute colonne où une adresse (`https://…/assets/<espace>/…`)
 * ou une clé (`assets/<espace>/…`) d'objet du bucket peut se trouver.
 */
export const RECENSEMENT_REFERENCES_STOCKAGE: readonly ReferenceRecensee[] = [
  // ── Écrivains du bucket ───────────────────────────────────────────────────
  {
    table: 'assets', colonne: 'url', forme: 'texte', nature: 'ecrit',
    ecrivains: [
      'apps/web/app/actions/assets.ts',          // registerUploadedAssetAction · dépôt direct (presign → PUT → ligne)
      'apps/web/app/actions/storage.ts',         // migrateEmbeddedImagesAction · data URI → putObject → ligne réécrite
      'apps/web/app/actions/drive.ts',           // import Drive manuel · putObject `drive-<id>.<ext>` → ligne
      'packages/integrations/src/drive-sync.ts', // synchro Drive (web et workers/src/sync.ts) · putObject → insertAsset
    ],
    note: 'Bibliothèque · l’adresse publique de l’objet (téléversement, copie Drive, image migrée).',
  },
  {
    table: 'assets', colonne: 'thumb_url', forme: 'texte', nature: 'ecrit',
    ecrivains: ['packages/integrations/src/drive-sync.ts'], // storeDriveThumb · `drive-<id>-thumb.jpg`
    note: 'Vignette Drive rangée dans le bucket à la synchro.',
  },
  {
    table: 'brands', colonne: 'logo_url', forme: 'texte', nature: 'ecrit',
    ecrivains: ['apps/web/app/actions/brand-detail.ts'], // saveBrandDAAction · import d'un fichier de logo (dépôt de la Bibliothèque, sans ligne `assets`)
    note: 'Logo par défaut de la charte · un logo importé est un objet du bucket SANS ligne dans la Bibliothèque.',
  },
  {
    table: 'brands', colonne: 'logos', forme: 'tableau', nature: 'ecrit',
    ecrivains: ['apps/web/app/actions/brand-detail.ts'],
    note: 'Variantes de logo de la charte · mêmes adresses que ci-dessus.',
  },
  {
    table: 'studio_assets', colonne: 'storage_key', forme: 'texte', nature: 'ecrit',
    ecrivains: [
      'apps/workers/src/studios/moteur.ts',         // sorties générées · `studios/…` ou `simule/…`
      'apps/web/lib/studios/export/export.ts',      // archives d'export · `exports/…`
      'apps/web/lib/studios/video/rendu-final.ts',  // vidéo finale · `studios/…`
    ],
    note: 'Clé brute (sans adresse) · hors `assets/` aujourd’hui, lue par prudence si un préfixe changeait.',
  },
  // ── Champs libres (copie possible d'une adresse) ──────────────────────────
  { table: 'users', colonne: 'avatar_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Photo de profil · adresse saisie (saveProfileAction).' },
  { table: 'workspaces', colonne: 'white_label_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Marque blanche · logo éventuel.' },
  { table: 'brands', colonne: 'brand_kit_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Direction artistique de la marque.' },
  { table: 'scenarios', colonne: 'image_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Visuel de scénario (sortie fournisseur).' },
  { table: 'products', colonne: 'image_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Image produit.' },
  { table: 'products', colonne: 'image_urls', forme: 'tableau', nature: 'libre', ecrivains: [], note: 'Galerie produit.' },
  { table: 'creatives', colonne: 'storage_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Créative synchronisée.' },
  { table: 'creatives', colonne: 'thumb_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Vignette de créative.' },
  { table: 'library_ads', colonne: 'media_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Média d’annonce de veille.' },
  { table: 'library_ads', colonne: 'storage_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Copie d’annonce de veille.' },
  { table: 'followed_brands', colonne: 'logo_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Logo d’une marque suivie.' },
  { table: 'generations', colonne: 'asset_urls', forme: 'tableau', nature: 'libre', ecrivains: [], note: 'Sorties d’une génération.' },
  { table: 'generations', colonne: 'input_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Entrées d’une génération (références d’images).' },
  { table: 'generations', colonne: 'output_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Sorties détaillées d’une génération.' },
  { table: 'adsmap_ads', colonne: 'asset_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Adsmap · média d’une annonce.' },
  { table: 'adsmap_ads', colonne: 'brief_url', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Adsmap · brief d’une annonce.' },
  { table: 'adsmap_ads', colonne: 'source_ref_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Adsmap · source d’une annonce.' },
  { table: 'adsmap_concepts', colonne: 'source_ref_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Adsmap · asset d’origine d’un concept.' },
  { table: 'briefs', colonne: 'content_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Contenu d’un brief.' },
  { table: 'saved_ads', colonne: 'snapshot_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Annonce enregistrée.' },
  { table: 'brand_tracker_events', colonne: 'snapshot_json', forme: 'json', nature: 'libre', ecrivains: [], note: 'Événement de suivi de marque.' },
  { table: 'studio_assets', colonne: 'legacy_ref', forme: 'json', nature: 'libre', ecrivains: [], note: 'Studios · référence héritée d’un média.' },
  { table: 'studio_projects', colonne: 'source_refs', forme: 'json', nature: 'libre', ecrivains: [], note: 'Studios · sources d’un projet.' },
  { table: 'studio_project_versions', colonne: 'content', forme: 'json', nature: 'libre', ecrivains: [], note: 'Studios · contenu d’une version.' },
  { table: 'studio_jobs', colonne: 'snapshot', forme: 'json', nature: 'libre', ecrivains: [], note: 'Studios · instantané d’un travail.' },
  { table: 'studio_jobs', colonne: 'result', forme: 'json', nature: 'libre', ecrivains: [], note: 'Studios · résultat d’un travail.' },
  { table: 'agent_threads', colonne: 'messages_jsonb', forme: 'json', nature: 'libre', ecrivains: [], note: 'Fils d’agent.' },
  { table: 'jarvis_messages', colonne: 'content', forme: 'texte', nature: 'libre', ecrivains: [], note: 'Messages Jarvis.' },
  { table: 'app_settings', colonne: 'value', forme: 'json', nature: 'libre', ecrivains: [], note: 'Réglages de la plateforme.' },
];

/**
 * Appelants du dépôt (`putObject`, `presignPutUrl`) qui n'écrivent AUCUNE
 * colonne eux-mêmes · soit un relais (la clé et la ligne viennent d'un
 * écrivain recensé ci-dessus), soit un objet hors `assets/` sans ligne SQL.
 * Avec les `ecrivains` du recensement, c'est la liste FERMÉE des appelants ·
 * le test `stockage-orphelins-ecran` refuse un appelant absent des deux.
 */
export const APPELANTS_DEPOT_SANS_COLONNE: readonly { fichier: string; prefixe: string; note: string }[] = [
  { fichier: 'apps/web/lib/ad-store.ts', prefixe: 'renders/', note: 'Cache des rendus de maquette · clé déterministe, aucune écriture SQL.' },
  { fichier: 'apps/workers/src/studios/fournisseurs.ts', prefixe: 'studios/', note: 'Relais `stockageS3.deposer` du moteur · la clé et la ligne viennent de `moteur.ts` (studio_assets.storage_key).' },
];

/**
 * Le motif d'un fragment de référence, pour Postgres (ARE) · `assets/` ou
 * `assets%2F`, puis tout jusqu'à un blanc, un guillemet, `<`, `>`, `?`, `#` ou
 * `\`. Passé en PARAMÈTRE de la requête, jamais concaténé.
 */
export const MOTIF_REFERENCE_SQL = 'assets(?:/|%2[Ff])[^[:space:]"\'<>?#\\\\]+';

/** Le même motif en JavaScript · la garde pglite vérifie que les deux extraient pareil. */
const MOTIF_REFERENCE_JS = /assets(?:\/|%2[Ff])[^\s"'<>?#\\]+/g;

const PONCTUATION_FINALE = /[.,;:!)\]}]+$/;

function decode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Les fragments `assets/…` d'un texte quelconque (adresse, JSON, message). */
export function referencesDansTexte(texte: string): string[] {
  if (typeof texte !== 'string' || !texte) return [];
  return texte.match(MOTIF_REFERENCE_JS) ?? [];
}

/**
 * Les clés référencées · chaque fragment donne plusieurs formes (brut, décodé
 * une et deux fois, ponctuation finale retirée) · une forme de trop ne fait
 * que retirer un candidat.
 */
export function clesReferencees(fragments: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of fragments) {
    if (typeof f !== 'string' || !f) continue;
    for (const v of new Set([f, decode(f), decode(decode(f))])) {
      for (const m of [v, ...referencesDansTexte(v)]) {
        out.add(m);
        out.add(m.replace(PONCTUATION_FINALE, ''));
      }
    }
  }
  return out;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const CLE_ESPACE = new RegExp(`^assets/(${UUID})/([A-Za-z0-9._-]+)$`);

/** L'espace d'une clé au format exact `assets/<uuid>/<fichier>` · `null` sinon. */
export function espaceDeLaCle(cle: string): string | null {
  if (typeof cle !== 'string') return null;
  const m = CLE_ESPACE.exec(cle);
  if (!m || m[2] === '.' || m[2] === '..') return null;
  return m[1]!;
}

export interface ObjetStocke {
  cle: string;
  /** Taille en octets. */
  taille: number;
  modifieLe: Date | null;
}

export interface ContexteOrphelins {
  maintenant: Date;
  /** Identifiants des espaces existant en base. */
  espaces: ReadonlySet<string>;
  /** Clés référencées (`clesReferencees`). */
  references: ReadonlySet<string>;
  /** Toutes les colonnes recensées ont été lues, sans troncature ni échec. */
  referencesCompletes: boolean;
  delaiGraceMs?: number;
}

export type MotifObjet = 'candidat' | 'hors_format' | 'espace_inconnu' | 'date_inconnue' | 'recent' | 'reference' | 'references_incompletes';

export const LIBELLES_MOTIFS: Readonly<Record<MotifObjet, string>> = {
  candidat: 'Candidats orphelins',
  reference: 'Référencés en base',
  recent: 'Récents (délai de grâce)',
  hors_format: 'Clé hors format',
  espace_inconnu: 'Espace inconnu',
  date_inconnue: 'Date inconnue',
  references_incompletes: 'Lecture des références incomplète',
};

/** Le verdict d'UN objet · tout doute est un non. */
export function verdictObjetStocke(o: ObjetStocke, ctx: ContexteOrphelins): { motif: MotifObjet; espace: string | null } {
  const espace = espaceDeLaCle(o?.cle);
  if (!espace || !Number.isSafeInteger(o.taille) || o.taille < 0) return { motif: 'hors_format', espace: null };
  if (!ctx.espaces.has(espace)) return { motif: 'espace_inconnu', espace };
  const t = o.modifieLe instanceof Date ? o.modifieLe.getTime() : NaN;
  if (!Number.isFinite(t)) return { motif: 'date_inconnue', espace };
  const grace = ctx.delaiGraceMs ?? DELAI_GRACE_ORPHELIN_MS;
  if (ctx.maintenant.getTime() - t < grace) return { motif: 'recent', espace };
  if (ctx.references.has(o.cle)) return { motif: 'reference', espace };
  if (!ctx.referencesCompletes) return { motif: 'references_incompletes', espace };
  return { motif: 'candidat', espace };
}

export interface CompteOctets { nombre: number; octets: number }

export interface InventaireOrphelins {
  /** Objets examinés sous `assets/`. */
  objets: CompteOctets;
  candidats: CompteOctets;
  motifs: Record<MotifObjet, CompteOctets>;
  /** Candidats par espace, le plus lourd d'abord. */
  parEspace: Array<{ espace: string } & CompteOctets>;
  /** Les `PLUS_GROS_ORPHELINS` plus gros candidats. */
  plusGros: Array<{ cle: string; espace: string; taille: number; modifieLe: Date }>;
  referencesCompletes: boolean;
}

const ORDRE_MOTIFS: readonly MotifObjet[] = ['candidat', 'reference', 'recent', 'hors_format', 'espace_inconnu', 'date_inconnue', 'references_incompletes'];

/** L'inventaire d'une liste d'objets · des comptes, jamais une action. */
export function inventaireOrphelins(objets: Iterable<ObjetStocke>, ctx: ContexteOrphelins): InventaireOrphelins {
  const motifs = Object.fromEntries(ORDRE_MOTIFS.map((m) => [m, { nombre: 0, octets: 0 }])) as Record<MotifObjet, CompteOctets>;
  const total = { nombre: 0, octets: 0 };
  const parEspace = new Map<string, CompteOctets>();
  const candidats: Array<{ cle: string; espace: string; taille: number; modifieLe: Date }> = [];
  for (const o of objets) {
    const v = verdictObjetStocke(o, ctx);
    const taille = Number.isSafeInteger(o.taille) && o.taille > 0 ? o.taille : 0;
    total.nombre++; total.octets += taille;
    motifs[v.motif].nombre++; motifs[v.motif].octets += taille;
    if (v.motif !== 'candidat') continue;
    const e = parEspace.get(v.espace!) ?? { nombre: 0, octets: 0 };
    e.nombre++; e.octets += taille;
    parEspace.set(v.espace!, e);
    candidats.push({ cle: o.cle, espace: v.espace!, taille, modifieLe: o.modifieLe! });
  }
  candidats.sort((a, b) => b.taille - a.taille || a.cle.localeCompare(b.cle));
  return {
    objets: total,
    candidats: motifs.candidat,
    motifs,
    parEspace: [...parEspace].map(([espace, c]) => ({ espace, ...c })).sort((a, b) => b.octets - a.octets || a.espace.localeCompare(b.espace)),
    plusGros: candidats.slice(0, PLUS_GROS_ORPHELINS),
    referencesCompletes: ctx.referencesCompletes,
  };
}

/* ───────────────────────── L'écran (Admin+ · lecture seule) ───────────────────────── */

export interface EtatLectures {
  listeComplete: boolean;
  erreurListe: string | null;
  /** Colonnes recensées non lues entièrement · `table.colonne`. */
  colonnesIncompletes: readonly string[];
}

export interface VueInventaireStockage {
  kpis: Array<{ lbl: string; v: string; d: string; c: '' | 'up' | 'w' }>;
  /** Pourquoi le chiffre peut être partiel · chaque phrase dit ce qui manque. */
  avertissements: string[];
  motifs: Array<{ cle: MotifObjet; libelle: string; nombre: string; volume: string }>;
  parEspace: Array<{ espace: string; nom: string; nombre: string; volume: string; part: number }>;
  plusGros: Array<{ cle: string; nom: string; volume: string; age: string }>;
}

/** Ce que l'écran montre · des comptes et des tailles, aucun geste. */
export function vueInventaireStockage(inv: InventaireOrphelins, l: EtatLectures, noms: Readonly<Record<string, string>>, maintenant: Date): VueInventaireStockage {
  const nom = (e: string) => noms[e] ?? e;
  const avertissements: string[] = [];
  if (!l.listeComplete) avertissements.push(`Liste des fichiers partielle (${l.erreurListe ?? 'interrompue'}) · les chiffres ne portent que sur les fichiers lus.`);
  if (!inv.referencesCompletes) {
    avertissements.push(`Lecture des références incomplète (${l.colonnesIncompletes.join(', ') || 'colonne inconnue'}) · par prudence, aucun fichier n’est compté comme orphelin.`);
  }
  const maxEspace = inv.parEspace[0]?.octets || 1;
  return {
    kpis: [
      { lbl: 'Fichiers examinés', v: adminNombre(inv.objets.nombre), d: formatTaille(inv.objets.octets), c: '' },
      { lbl: 'Candidats orphelins', v: adminNombre(inv.candidats.nombre), d: inv.candidats.nombre ? 'aucune ligne ne les pointe' : 'aucun', c: inv.candidats.nombre ? 'w' : 'up' },
      { lbl: 'Volume candidat', v: formatTaille(inv.candidats.octets), d: `délai de grâce ${DELAI_GRACE_ORPHELIN_MS / 3_600_000} h`, c: '' },
      { lbl: 'Référencés', v: adminNombre(inv.motifs.reference.nombre), d: formatTaille(inv.motifs.reference.octets), c: '' },
    ],
    avertissements,
    motifs: ORDRE_MOTIFS.filter((m) => inv.motifs[m].nombre > 0).map((m) => ({
      cle: m, libelle: LIBELLES_MOTIFS[m], nombre: adminNombre(inv.motifs[m].nombre), volume: formatTaille(inv.motifs[m].octets),
    })),
    parEspace: inv.parEspace.map((e) => ({ espace: e.espace, nom: nom(e.espace), nombre: adminNombre(e.nombre), volume: formatTaille(e.octets), part: (e.octets / maxEspace) * 100 })),
    plusGros: inv.plusGros.map((o) => ({ cle: o.cle, nom: nom(o.espace), volume: formatTaille(o.taille), age: adminIlYa(o.modifieLe, maintenant) })),
  };
}
