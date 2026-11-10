/**
 * Tour de contrôle · lot 14 V5 · les INCIDENTS DÉCLARÉS (RJ IN01, IN02). Pur.
 *
 * Le journal des échecs (`error_log`) dit ce qui a cassé, ligne à ligne. Un
 * incident est une DÉCLARATION de l'équipe plateforme · un titre, une gravité,
 * la cause du journal qu'il regroupe (facultative), ce qu'on constate · puis
 * des notes datées, et une clôture qui dit comment il s'est résolu.
 *
 * Trois gestes · ouvrir, annoter, clore. JAMAIS de suppression (la table
 * `platform_incidents` la refuse en base, migration 0075). Un incident clos
 * s'annote encore (le retour d'expérience vient souvent après) · il ne se
 * rouvre pas d'ici (IN03 reste à instruire).
 *
 * L'état affiché est CALCULÉ · « Ouvert » tant qu'aucune note n'est écrite,
 * « En cours » dès la première note, « Clos » après la clôture. Personne ne le
 * saisit.
 */

export const GRAVITES_INCIDENT = ['mineure', 'majeure', 'critique'] as const;
export type GraviteIncident = (typeof GRAVITES_INCIDENT)[number];

export const LIBELLE_GRAVITE_INCIDENT: Readonly<Record<GraviteIncident, string>> = { mineure: 'Mineure', majeure: 'Majeure', critique: 'Critique' };
/** La pastille de la gravité · classes `.pill` de la maquette. */
export const CLASSE_GRAVITE_INCIDENT: Readonly<Record<GraviteIncident, '' | 'w' | 'r'>> = { mineure: '', majeure: 'w', critique: 'r' };

/** Bornes · le titre tient sur une ligne de la table, un texte reprend la borne des commentaires (`validerTexteCommentaire`, 2 000). */
export const LONGUEUR_MAX_TITRE_INCIDENT = 140;
export const LONGUEUR_MAX_TEXTE_INCIDENT = 2000;
/** Au-delà, l'incident n'accepte plus de note · un fil de 200 notes appelle un nouvel incident. */
export const NOTES_MAX_INCIDENT = 200;

export type StatutIncident = 'ouvert' | 'clos';
export type EtatIncident = 'ouvert' | 'en-cours' | 'clos';

export const LIBELLE_ETAT_INCIDENT: Readonly<Record<EtatIncident, string>> = { ouvert: 'Ouvert', 'en-cours': 'En cours', clos: 'Clos' };
export const CLASSE_ETAT_INCIDENT: Readonly<Record<EtatIncident, '' | 'w' | 'g'>> = { ouvert: 'w', 'en-cours': '', clos: 'g' };

/** Une note telle qu'elle est rangée (`notes`, jsonb) · l'auteur par son identifiant, jamais son adresse. */
export interface NoteIncident { texte: string; auteur: string | null; le: string }

export interface IncidentLu {
  id: string;
  titre: string;
  gravite: GraviteIncident;
  cause: string | null;
  constat: string;
  statut: StatutIncident;
  notes: readonly NoteIncident[];
  ouvertLe: Date;
  ouvertPar: string | null;
  closLe: Date | null;
  closPar: string | null;
  resolution: string | null;
}

export function etatIncident(i: Pick<IncidentLu, 'statut' | 'notes'>): EtatIncident {
  if (i.statut === 'clos') return 'clos';
  return i.notes.length > 0 ? 'en-cours' : 'ouvert';
}

/* ─────────────────────────────── Segments ─────────────────────────────── */

export const SEGMENTS_INCIDENTS = ['ouverts', 'en-cours', 'clos', 'tous'] as const;
export type SegmentIncident = (typeof SEGMENTS_INCIDENTS)[number];
export const LIBELLE_SEGMENT_INCIDENT: Readonly<Record<SegmentIncident, string>> = { ouverts: 'Ouverts', 'en-cours': 'En cours', clos: 'Clos', tous: 'Tous' };
export const DEFINITION_SEGMENT_INCIDENT: Readonly<Record<SegmentIncident, string>> = {
  ouverts: 'Pas encore clos, annotés ou non.',
  'en-cours': 'Pas encore clos, avec au moins une note.',
  clos: 'Clôturés avec leur résolution.',
  tous: 'Tous les incidents déclarés.',
};

export function dansSegmentIncident(i: Pick<IncidentLu, 'statut' | 'notes'>, s: SegmentIncident): boolean {
  const e = etatIncident(i);
  if (s === 'tous') return true;
  if (s === 'ouverts') return e !== 'clos';
  return e === s;
}

export function lireSegmentIncident(v: unknown): SegmentIncident {
  return (SEGMENTS_INCIDENTS as readonly string[]).includes(String(v ?? '')) ? (v as SegmentIncident) : 'ouverts';
}

export function segmentsIncidents(incidents: ReadonlyArray<Pick<IncidentLu, 'statut' | 'notes'>>): Array<{ cle: SegmentIncident; libelle: string; n: number; definition: string }> {
  return SEGMENTS_INCIDENTS.map((s) => ({ cle: s, libelle: LIBELLE_SEGMENT_INCIDENT[s], n: incidents.filter((i) => dansSegmentIncident(i, s)).length, definition: DEFINITION_SEGMENT_INCIDENT[s] }));
}

/* ─────────────────────────────── Saisies ─────────────────────────────── */

export type ErreurIncident = { champ: 'titre' | 'gravite' | 'cause' | 'constat' | 'texte' | 'resolution'; message: string };

const texte = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '');

function borne(v: unknown, champ: ErreurIncident['champ'], max: number, nom: string): { ok: true; v: string } | { ok: false; e: ErreurIncident } {
  const s = texte(v);
  if (!s) return { ok: false, e: { champ, message: `${nom} est vide.` } };
  if ([...s].length > max) return { ok: false, e: { champ, message: `${nom} dépasse ${max.toLocaleString('fr-FR')} caractères.` } };
  return { ok: true, v: s };
}

export interface OuvertureIncident { titre: string; gravite: GraviteIncident; cause: string | null; constat: string }

/** Ouvrir · titre (1 à 140, sur une ligne), gravité connue, cause du journal facultative mais connue, constat (1 à 2 000). */
export function validerOuvertureIncident(
  entree: { titre?: unknown; gravite?: unknown; cause?: unknown; constat?: unknown },
  causesConnues: readonly string[],
): { ok: true; saisie: OuvertureIncident } | { ok: false; erreurs: ErreurIncident[] } {
  const erreurs: ErreurIncident[] = [];
  const t = borne(typeof entree.titre === 'string' ? entree.titre.replace(/\s+/g, ' ') : entree.titre, 'titre', LONGUEUR_MAX_TITRE_INCIDENT, 'Le titre');
  if (!t.ok) erreurs.push(t.e);
  const g = String(entree.gravite ?? '');
  if (!(GRAVITES_INCIDENT as readonly string[]).includes(g)) erreurs.push({ champ: 'gravite', message: 'Choisis une gravité · mineure, majeure ou critique.' });
  const c = texte(entree.cause);
  if (c && !causesConnues.includes(c)) erreurs.push({ champ: 'cause', message: 'Cette cause n’existe pas dans le journal des échecs.' });
  const k = borne(entree.constat, 'constat', LONGUEUR_MAX_TEXTE_INCIDENT, 'Le constat');
  if (!k.ok) erreurs.push(k.e);
  if (erreurs.length || !t.ok || !k.ok) return { ok: false, erreurs };
  return { ok: true, saisie: { titre: t.v, gravite: g as GraviteIncident, cause: c || null, constat: k.v } };
}

export function validerNoteIncident(v: unknown): { ok: true; texte: string } | { ok: false; erreurs: ErreurIncident[] } {
  const r = borne(v, 'texte', LONGUEUR_MAX_TEXTE_INCIDENT, 'La note');
  return r.ok ? { ok: true, texte: r.v } : { ok: false, erreurs: [r.e] };
}

export function validerClotureIncident(v: unknown): { ok: true; resolution: string } | { ok: false; erreurs: ErreurIncident[] } {
  const r = borne(v, 'resolution', LONGUEUR_MAX_TEXTE_INCIDENT, 'La résolution');
  return r.ok ? { ok: true, resolution: r.v } : { ok: false, erreurs: [r.e] };
}

/* ─────────────────────────────── Gestes ─────────────────────────────── */

export type GesteIncident = 'annoter' | 'clore';

/** Le geste est-il permis sur cet incident ? Sinon, la raison écrite à côté du contrôle fermé. */
export function gesteIncident(i: Pick<IncidentLu, 'statut' | 'notes' | 'closLe'>, geste: GesteIncident): { permis: true } | { permis: false; raison: string } {
  if (geste === 'clore' && i.statut === 'clos') return { permis: false, raison: 'Déjà clos · un incident clos ne se rouvre pas d’ici, il s’annote.' };
  if (geste === 'annoter' && i.notes.length >= NOTES_MAX_INCIDENT) return { permis: false, raison: `${NOTES_MAX_INCIDENT} notes atteintes · ouvre un nouvel incident pour la suite.` };
  return { permis: true };
}

/* ─────────────────────────────── Affichage ─────────────────────────────── */

/** Les colonnes de la table des incidents · les MÊMES dans l'export. */
export const COLONNES_INCIDENTS = ['Incident', 'Gravité', 'État', 'Cause', 'Ouvert le', 'Ouvert par', 'Notes', 'Clos le', 'Résolution'] as const;

export interface IncidentAffiche {
  id: string;
  etat: EtatIncident;
  gravite: GraviteIncident;
  /** Une cellule par colonne de `COLONNES_INCIDENTS` · le texte exact de la table, et de l'export. */
  cellules: readonly string[];
}

/**
 * Une ligne de la table · `nom` résout un identifiant d'utilisateur en nom
 * affichable (jamais l'adresse · « Équipe plateforme » sans nom), `cause` une
 * clé du journal en libellé, `date` le format de la table.
 */
export function incidentAffiche(i: IncidentLu, f: { nom: (id: string | null) => string; cause: (cle: string) => string; date: (d: Date) => string; absent: string }): IncidentAffiche {
  const etat = etatIncident(i);
  return {
    id: i.id, etat, gravite: i.gravite,
    cellules: [
      i.titre,
      LIBELLE_GRAVITE_INCIDENT[i.gravite],
      LIBELLE_ETAT_INCIDENT[etat],
      i.cause ? f.cause(i.cause) : f.absent,
      f.date(i.ouvertLe),
      f.nom(i.ouvertPar),
      String(i.notes.length),
      i.closLe ? f.date(i.closLe) : f.absent,
      i.resolution ?? f.absent,
    ],
  };
}

/** Le nom affiché d'un membre de l'équipe · son nom s'il en a un, jamais son adresse. */
export const nomEquipePlateforme = (nom: string | null | undefined) => (nom && nom.trim() && !nom.includes('@') ? nom.trim() : 'Équipe plateforme');
