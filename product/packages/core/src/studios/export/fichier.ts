/**
 * Studios · L7-A · contrat du fichier exporté et sa vérification
 * (EXPORT-04 « fichier complet », EXPORT-05 « historique »).
 *
 * Pur. L'export est un fichier DÉRIVÉ d'une version : il ne la modifie pas,
 * et il n'est pas le document éditable (cahier 01 §7).
 *
 * ── Identité ≠ nom de fichier ────────────────────────────────────────────────
 *
 * Le nom `<projet>-v<numero>-<format>.<ext>` est une commodité de lecture : deux
 * projets de même titre donnent le même nom. L'IDENTITÉ d'un export est
 * `versionId` + `format` + `sha256` des octets ; c'est elle que le
 * téléchargement exige, jamais le nom.
 *
 * ── Vérification d'un RÉSULTAT ───────────────────────────────────────────────
 *
 * Le serveur DÉCODE réellement les octets produits (tous les pixels, au moindre
 * avertissement du décodeur : refus) et mesure type réel, dimensions,
 * empreinte, écart aux pixels du rendu. `verifierExport` juge cette mesure :
 * un fichier qui ne se décode pas, n'a pas les dimensions du document, ou dont
 * l'empreinte n'est pas celle annoncée n'est JAMAIS déclaré terminé.
 */

import { EMPREINTE_VALIDE } from '../version';

export const FORMATS_EXPORT = ['png', 'jpeg'] as const;
export type FormatExport = (typeof FORMATS_EXPORT)[number];

export interface ContratFormat { mime: 'image/png' | 'image/jpeg'; extension: string; libelle: string; sansPerte: boolean }

export const CONTRAT_FORMAT: Readonly<Record<FormatExport, ContratFormat>> = {
  png: { mime: 'image/png', extension: 'png', libelle: 'PNG', sansPerte: true },
  jpeg: { mime: 'image/jpeg', extension: 'jpg', libelle: 'JPEG', sansPerte: false },
};

/**
 * JPEG · pas de transparence : aplati sur blanc, qualité 90, sans
 * sous-échantillonnage de la chrominance (4:4:4, les bords de texte restent
 * nets). Choix éditoriaux documentés, pas des mesures de qualité.
 */
export const JPEG_EXPORT = { qualite: 90, fond: '#ffffff', chrominance: '4:4:4' } as const;

export function estFormatExport(x: unknown): x is FormatExport {
  return typeof x === 'string' && (FORMATS_EXPORT as readonly string[]).includes(x);
}

/** Partie lisible du nom · minuscules ASCII, tirets, 60 caractères au plus. */
export function segmentNom(titre: string): string {
  return titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'projet';
}

/** `<projet>-v<numero>-<format>.<ext>` · DÉRIVÉ, jamais un identifiant. */
export function nomFichierExport(titreProjet: string, numeroVersion: number, format: FormatExport): string {
  const n = Number.isInteger(numeroVersion) && numeroVersion > 0 ? numeroVersion : 0;
  return `${segmentNom(titreProjet)}-v${n}-${format}.${CONTRAT_FORMAT[format].extension}`;
}

/** L'identité d'un export · ce qui le désigne sans ambiguïté. */
export interface IdentiteExport { versionId: string; format: FormatExport; sha256: string }

export function cleExport(i: IdentiteExport): string {
  return `${i.versionId}:${i.format}:${i.sha256}`;
}

/** Empreinte courte affichée · 12 caractères hexadécimaux. */
export function empreinteCourte(sha256: string): string {
  return sha256.slice(0, 12);
}

export interface AttenduExport {
  format: FormatExport;
  largeur: number;
  hauteur: number;
  /** Empreinte annoncée (re-téléchargement d'un export audité) · `null` au premier export. */
  sha256: string | null;
}

export interface MesureExport {
  /** Type relu dans les octets (`inspecterMedia`), jamais déclaré. */
  mimeReel: string | null;
  octets: number;
  /** Empreinte recalculée sur les octets livrés. */
  sha256: string;
  decodage: { ok: true; largeur: number; hauteur: number } | { ok: false; raison: string };
  /**
   * Plus grand écart d'un canal entre les pixels décodés et ceux du rendu
   * (format sans perte seulement) · `null` si non mesuré.
   */
  ecartPixelsMax: number | null;
}

export type VerdictExport = { ok: true } | { ok: false; raisons: string[] };

export function attenduExport(doc: { width: number; height: number }, format: FormatExport, sha256: string | null = null): AttenduExport {
  return { format, largeur: doc.width, hauteur: doc.height, sha256 };
}

/** Le fichier est-il COMPLET et CONFORME ? Toutes les raisons, jamais la première seule. */
export function verifierExport(a: AttenduExport, m: MesureExport): VerdictExport {
  const r: string[] = [];
  const contrat = CONTRAT_FORMAT[a.format];
  if (!contrat) return { ok: false, raisons: [`format inconnu « ${String(a.format)} »`] };
  if (!(m.octets > 0)) r.push('fichier vide');
  if (m.mimeReel !== contrat.mime) r.push(`type réel ${m.mimeReel ?? 'inconnu'} au lieu de ${contrat.mime}`);
  if (!EMPREINTE_VALIDE.test(m.sha256)) r.push('empreinte du fichier illisible');
  else if (a.sha256 !== null && m.sha256 !== a.sha256) r.push('empreinte différente de celle de l’export');
  if (!m.decodage.ok) r.push(`fichier non décodable · ${m.decodage.raison}`);
  else if (m.decodage.largeur !== a.largeur || m.decodage.hauteur !== a.hauteur) {
    r.push(`dimensions ${m.decodage.largeur} × ${m.decodage.hauteur} au lieu de ${a.largeur} × ${a.hauteur}`);
  }
  if (contrat.sansPerte) {
    if (m.ecartPixelsMax === null) r.push('pixels non comparés au rendu');
    else if (m.ecartPixelsMax !== 0) r.push(`pixels différents du rendu (écart ${m.ecartPixelsMax})`);
  }
  return r.length ? { ok: false, raisons: r } : { ok: true };
}


/** Ce que l'audit d'un export retient · relu pour l'historique et le re-téléchargement. */
export interface TraceExport extends IdentiteExport {
  projectId: string;
  versionN: number;
  mime: string;
  largeur: number;
  hauteur: number;
  octets: number;
  nomFichier: string;
  /**
   * R4 · identifiant de l'archive (`studio_assets`, origine `render`) du
   * fichier vérifié · `null` ou absent pour un export non conservé (antérieur
   * à R4, ou stockage indisponible au moment de l'export).
   */
  assetId?: string | null;
}

export const ACTION_AUDIT_EXPORT = 'project.export';

const UUID_ARCHIVE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lecture défensive d'un `details` d'audit · `null` si la forme n'est pas celle d'un export. */
export function lireTraceExport(x: unknown): TraceExport | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const d = x as Record<string, unknown>;
  const entierPositif = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;
  if (typeof d.projectId !== 'string' || typeof d.versionId !== 'string' || !estFormatExport(d.format)) return null;
  if (typeof d.sha256 !== 'string' || !EMPREINTE_VALIDE.test(d.sha256)) return null;
  if (!entierPositif(d.versionN) || !entierPositif(d.largeur) || !entierPositif(d.hauteur) || !entierPositif(d.octets)) return null;
  if (typeof d.nomFichier !== 'string' || typeof d.mime !== 'string') return null;
  const assetId = typeof d.assetId === 'string' && UUID_ARCHIVE.test(d.assetId) ? d.assetId.toLowerCase() : null;
  return {
    projectId: d.projectId, versionId: d.versionId, format: d.format, sha256: d.sha256, versionN: d.versionN as number,
    mime: d.mime, largeur: d.largeur as number, hauteur: d.hauteur as number, octets: d.octets as number, nomFichier: d.nomFichier,
    ...(assetId ? { assetId } : {}),
  };
}

/** Taille lisible · « 812 Ko », « 2,4 Mo » (base 1024, virgule décimale). */
export function tailleLisible(octets: number): string {
  if (!(octets >= 0)) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
