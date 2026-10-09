/**
 * Studios · L7-A · préflight de l'export image (cahier 01 §11.2 « Préflight
 * vérifie ressources téléchargées, polices, durées, dimensions », EXPORT-01).
 *
 * Pur. Le serveur relit ce qui est RÉELLEMENT disponible au moment de l'export
 * (polices embarquées chargeables, médias lus dans la portée et décodés) et le
 * passe ici ; ce module décide, calque par calque, et dit la CIBLE de chaque
 * refus : quel calque, de quel type, quel média ou quelle police, pourquoi.
 *
 * Aucune substitution : une police absente n'est pas remplacée, un média
 * absent ne laisse pas un trou. Le préflight liste TOUT ce qui manque (le plan
 * de rendu s'arrête au premier défaut), pour qu'on corrige en une fois.
 *
 * Une version est « validée » quand son contenu passe le validateur du noyau
 * ET que son empreinte relue égale celle enregistrée (une ligne altérée hors du
 * chemin des commandes n'est pas exportée).
 */

import {
  validerContenuVersion, validerDocument,
  type CalqueStudio, type ContenuVersion, type DocumentStudio,
} from '../document';
import { empreinteContenu } from '../version';
import { POLICES_EMBARQUEES } from '../rendu/polices';
import { PIXELS_MAX_RENDU } from '../rendu/plan';

export type CauseExport =
  | 'version_non_validee'
  | 'document_absent'
  | 'document_invalide'
  | 'dimensions_nulles'
  | 'document_trop_grand'
  | 'police_absente'
  | 'police_televersee'
  | 'media_absent'
  | 'media_illisible'
  | 'media_dimensions'
  /** R4 · média retiré depuis l'export · l'export conservé n'est plus servi. */
  | 'media_revoque';

export interface CibleExport {
  type: 'version' | 'document' | 'calque';
  calqueId?: string;
  nom?: string;
  kind?: CalqueStudio['kind'];
  assetId?: string;
  fontId?: string;
  famille?: string;
}

export interface ViolationExport {
  cible: CibleExport;
  cause: CauseExport;
  /** Phrase lisible, en français, qui nomme la cible. */
  message: string;
}

/** État d'un média tel que le serveur l'a relu à l'instant (portée, octets, décodage). */
export type EtatMediaExport =
  | { etat: 'ok'; largeur: number; hauteur: number }
  | { etat: 'absent' }
  | { etat: 'illisible' };

export interface DisponiblesExport {
  /** Familles que le serveur sait dessiner MAINTENANT (fichier présent, empreinte juste). */
  polices: readonly string[];
  /** Par identifiant de média du document · absent de la table = absent. */
  medias: Readonly<Record<string, EtatMediaExport>>;
}

export type ResultatPreflight =
  | { ok: true; document: DocumentStudio; medias: number; polices: number }
  | { ok: false; violations: ViolationExport[] };

const LIBELLE_KIND: Readonly<Record<CalqueStudio['kind'], string>> = { image: 'image', text: 'texte', shape: 'forme', logo: 'logo' };

function cibleCalque(l: CalqueStudio, extra: Partial<CibleExport> = {}): CibleExport {
  return { type: 'calque', calqueId: l.id, nom: l.name, kind: l.kind, ...extra };
}

function designation(l: CalqueStudio): string {
  return `Calque ${LIBELLE_KIND[l.kind]} « ${l.name || l.id} »`;
}

/** Médias que le serveur doit relire · calques image et logo VISIBLES (même règle que le chargement du rendu). */
export function mediasAVerifier(doc: DocumentStudio): string[] {
  return [...new Set(Object.values(doc.layers)
    .filter((l): l is Extract<CalqueStudio, { kind: 'image' | 'logo' }> => l.visible && (l.kind === 'image' || l.kind === 'logo'))
    .map((l) => l.assetId))].sort();
}

/**
 * La version elle-même · contenu valide, empreinte relue égale à l'enregistrée,
 * document image présent. Renvoie le document à vérifier calque par calque.
 */
export function versionExportable(v: { content: unknown; contentHash: string }): { ok: true; document: DocumentStudio } | { ok: false; violations: ViolationExport[] } {
  const refus = (cause: CauseExport, message: string, type: CibleExport['type'] = 'version') => ({ ok: false as const, violations: [{ cible: { type }, cause, message }] });
  const defauts = validerContenuVersion(v.content);
  if (defauts.length) return refus('version_non_validee', `Version non validée · son contenu ne passe pas le contrôle du projet (${defauts.slice(0, 3).map((d) => d.chemin || '/').join(', ')}).`);
  let empreinte: string;
  try { empreinte = empreinteContenu(v.content); } catch { return refus('version_non_validee', 'Version non validée · contenu illisible.'); }
  if (empreinte !== v.contentHash) return refus('version_non_validee', 'Version non validée · son empreinte ne correspond plus à celle enregistrée.');
  const doc = (v.content as ContenuVersion).document;
  if (!doc) return refus('document_absent', 'Cette version n’a pas de document image · rien à exporter.', 'document');
  return { ok: true, document: doc };
}

/**
 * Préflight d'un document · toutes les violations, chacune ciblée. `ok`
 * seulement si le rendu peut produire le fichier complet sans substitution.
 */
export function preflightExport(doc: DocumentStudio, disponibles: DisponiblesExport): ResultatPreflight {
  const v: ViolationExport[] = [];
  if (!(doc.width >= 1) || !(doc.height >= 1)) {
    return { ok: false, violations: [{ cible: { type: 'document' }, cause: 'dimensions_nulles', message: `Document sans dimensions (${doc.width} × ${doc.height}) · rien à exporter.` }] };
  }
  if (doc.width * doc.height > PIXELS_MAX_RENDU) {
    v.push({ cible: { type: 'document' }, cause: 'document_trop_grand', message: `Document trop grand pour l’export (${doc.width} × ${doc.height}, ${PIXELS_MAX_RENDU} pixels au plus).` });
  }

  const policesDispo = new Set(disponibles.polices);
  const calquesPolice = new Set<string>();
  const fonts = doc.fonts ?? {};
  const visibles = Object.values(doc.layers ?? {}).filter((l) => l && l.visible).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let medias = 0;
  const polices = new Set<string>();

  for (const l of visibles) {
    if (l.kind === 'text') {
      if (l.opacity === 0) continue; // non dessiné · même règle que le plan de rendu
      const f = Object.prototype.hasOwnProperty.call(fonts, l.fontId) ? fonts[l.fontId] : undefined;
      calquesPolice.add(l.id);
      if (!f) {
        v.push({ cible: cibleCalque(l, { fontId: l.fontId }), cause: 'police_absente', message: `${designation(l)} · police « ${l.fontId} » non déclarée dans le document.` });
      } else if (f.assetId !== null) {
        v.push({ cible: cibleCalque(l, { fontId: l.fontId, famille: f.family, assetId: f.assetId }), cause: 'police_televersee', message: `${designation(l)} · police téléversée « ${f.family} » non prise en charge par l’export (aucune police de repli).` });
      } else if (!Object.prototype.hasOwnProperty.call(POLICES_EMBARQUEES, f.family) || !policesDispo.has(f.family)) {
        v.push({ cible: cibleCalque(l, { fontId: l.fontId, famille: f.family }), cause: 'police_absente', message: `${designation(l)} · police « ${f.family} » absente du serveur d’export.` });
      } else {
        polices.add(f.family);
      }
    } else if (l.kind === 'image' || l.kind === 'logo') {
      const m = Object.prototype.hasOwnProperty.call(disponibles.medias, l.assetId) ? disponibles.medias[l.assetId] : undefined;
      const cible = cibleCalque(l, { assetId: l.assetId });
      if (!m || m.etat === 'absent') {
        v.push({ cible, cause: 'media_absent', message: `${designation(l)} · média introuvable ou hors de la marque du projet.` });
      } else if (m.etat === 'illisible') {
        v.push({ cible, cause: 'media_illisible', message: `${designation(l)} · média illisible (fichier incomplet ou d’un type non pris en charge).` });
      } else if (!(m.largeur >= 1) || !(m.hauteur >= 1)) {
        v.push({ cible, cause: 'dimensions_nulles', message: `${designation(l)} · média sans dimensions.` });
      } else if (l.kind === 'image' && (m.largeur !== l.sourceWidth || m.hauteur !== l.sourceHeight)) {
        v.push({ cible, cause: 'media_dimensions', message: `${designation(l)} · média de ${m.largeur} × ${m.hauteur}, le calque attend ${l.sourceWidth} × ${l.sourceHeight}.` });
      } else {
        medias++;
      }
    }
  }

  // Le reste du schéma · chaque défaut rattaché à son calque quand il en a un.
  for (const d of validerDocument(doc)) {
    const m = /^\/document\/layers\/([^/]+)(\/.*)?$/.exec(d.chemin);
    const l = m ? doc.layers[m[1]!] : undefined;
    if (l && m![2] === '/fontId' && calquesPolice.has(l.id)) continue; // déjà ciblé ci-dessus
    v.push({
      cible: l ? cibleCalque(l) : { type: 'document' },
      cause: 'document_invalide',
      message: `${l ? designation(l) : 'Document'} · ${d.raison} (${d.chemin}).`,
    });
  }

  if (v.length) return { ok: false, violations: v };
  return { ok: true, document: doc, medias, polices: polices.size };
}

/** Préflight complet d'une version · la version d'abord, puis son document. */
export function preflightVersion(v: { content: unknown; contentHash: string }, disponibles: DisponiblesExport): ResultatPreflight {
  const e = versionExportable(v);
  if (!e.ok) return e;
  return preflightExport(e.document, disponibles);
}

/** Code d'erreur commun d'un préflight refusé · décidé par la PREMIÈRE cause. */
export function codeRefusPreflight(violations: readonly ViolationExport[]): 'MISSING_REFERENCE' | 'UNSUPPORTED_CAPABILITY' | 'INVARIANT_CONFLICT' {
  const c = violations[0]?.cause;
  if (c === 'media_absent' || c === 'media_illisible' || c === 'media_dimensions' || c === 'police_absente' || c === 'media_revoque') return 'MISSING_REFERENCE';
  if (c === 'police_televersee' || c === 'document_trop_grand' || c === 'document_absent') return 'UNSUPPORTED_CAPABILITY';
  return 'INVARIANT_CONFLICT';
}

/** Phrase de refus · la première cible, et le nombre des autres. */
export function messageRefusPreflight(violations: readonly ViolationExport[]): string {
  const premier = violations[0]?.message ?? 'Export impossible.';
  const autres = violations.length - 1;
  return `Export refusé · ${premier}${autres > 0 ? ` Et ${autres} autre${autres > 1 ? 's' : ''} point${autres > 1 ? 's' : ''} à corriger.` : ''} Aucun fichier n’a été produit.`;
}
