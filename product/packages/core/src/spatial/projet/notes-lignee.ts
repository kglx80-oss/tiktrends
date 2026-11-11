import { LIBELLES_TYPE_LIGNEE, type ModeleLignee, type NoeudLignee } from '../../studios/canvas/lignee';
import type { TextesFil } from '../../studios/activite/commentaires';
import { estIdLignee } from './lignee-canvas';

/**
 * Spatial · fiche projet · lot 11 V5 (PC E11) · les NOTES du canvas de lignée.
 * Pur · ni base, ni réseau, ni horloge.
 *
 * ── Une note est attachée à UN NŒUD, jamais à un lien, jamais libre ─────────
 *
 * La lignée reste une PROJECTION en lecture seule (`projeterLignee`) · une note
 * n'y ajoute ni nœud ni lien. Elle désigne un nœud par sa CLÉ STABLE, son
 * identifiant de lignée (`brief:<version>`, `creation:<variante>`,
 * `groupe:<tâche>`, `resultat:<variante>`, `reference:<source>`, `marque`…) ·
 * cet identifiant est fait du type du nœud et de la clé primaire de la donnée
 * qu'il projette, jamais d'un rang, d'une colonne ou d'un ordre · la même donnée
 * redonne le même identifiant à chaque projection, quoi qu'on ajoute ailleurs.
 * C'est déjà la clé des positions personnelles du canvas
 * (`enregistrerDispositionCanvas`, `estIdLignee`).
 *
 *  · poser · seulement sur un nœud PRÉSENT dans la lignée relue par le serveur
 *    au moment du geste (`noeudPourNote`) · un identifiant de lien (`de>vers`),
 *    un identifiant inventé ou d'un autre projet est refusé ;
 *  · nœud disparu (donnée retirée) · la note reste LISIBLE, rangée dans
 *    « Notes sans nœud » (`repartirNotes`) sous le libellé du nœud au moment où
 *    elle a été écrite · jamais supprimée en silence ;
 *  · écrire, modifier la sienne (ancien texte gardé), résoudre / rouvrir · les
 *    RÈGLES des commentaires du projet (`validerTexteCommentaire`,
 *    `droitsCommentaire`, `C/studios/activite/commentaires.ts`), seules les
 *    phrases changent (`TEXTES_NOTE`) · jamais de suppression.
 */

/** La borne d'une clé de nœud · un identifiant de lignée (type, deux-points, uuid) tient très largement. */
export const LONGUEUR_MAX_CLE_NOEUD = 200;

/** La borne du libellé gardé avec la note · le titre d'un nœud de lignée, préfixé de son type. */
export const LONGUEUR_MAX_LIBELLE_NOEUD = 300;

/** Les phrases des notes · la règle est celle des commentaires. */
export const TEXTES_NOTE: TextesFil = {
  pasUnTexte: 'La note doit être un texte · recharge la page puis recommence.',
  vide: 'La note est vide · écris ce que tu veux retenir sur ce nœud.',
  tropLong: (n, max) => `La note fait ${n} caractères · ${max} au plus, raccourcis-la.`,
  lecteur: 'Ton rôle permet de lire les notes de cette lignée, pas d’en écrire ni d’en résoudre · demande à un membre de l’espace.',
  pasLAuteur: 'Seule la personne qui l’a écrite peut la modifier · ajoute une nouvelle note.',
  resoluAModifier: 'Cette note est résolue · rouvre-la pour la modifier.',
  tropDeModifications: (max) => `Déjà modifiée ${max} fois · écris une nouvelle note.`,
  dejaResolu: 'Cette note est déjà résolue.',
  encoreOuvert: 'Cette note est encore ouverte.',
  sansCible: 'Choisis le nœud de la lignée que tu annotes.',
};

export const RAISON_LECTEUR_NOTE = TEXTES_NOTE.lecteur;

/** Un nœud qui n'est pas (ou plus) dans la lignée relue · dit sans rien révéler d'autre. */
export const RAISON_NOEUD_ABSENT = 'Ce nœud n’est plus dans la lignée de ce projet · recharge la page, la note n’a pas été posée.';

/** Une clé qui n'est pas celle d'un nœud de lignée (un lien, un texte libre, une carte de production). */
export const RAISON_PAS_UN_NOEUD = 'Une note se pose sur un nœud de la lignée · jamais sur un lien, jamais à côté.';

/**
 * La FORME d'une clé de nœud · un identifiant de lignée (`estIdLignee`), sans
 * espace ni `>` (un lien s'écrit `de>vers`), borné · sinon `null`. Ne dit pas
 * si le nœud existe · `noeudPourNote` le dit, contre la lignée relue.
 */
export function cleNoeudNote(x: unknown): string | null {
  if (typeof x !== 'string' || x.length === 0 || x.length > LONGUEUR_MAX_CLE_NOEUD) return null;
  if (/[>\s]/.test(x) || !estIdLignee(x)) return null;
  return x;
}

/** Le libellé gardé avec la note · « Brief · version 1 », « Création · Image 1 du lot 1 » · lisible même quand le nœud a disparu. */
export function libelleNoeudNote(n: Pick<NoeudLignee, 'type' | 'titre'>): string {
  const type = LIBELLES_TYPE_LIGNEE[n.type];
  const t = n.titre.replace(/\s+/g, ' ').trim();
  const l = t.startsWith(type) ? t : `${type} · ${t}`;
  return [...l].length > LONGUEUR_MAX_LIBELLE_NOEUD ? `${[...l].slice(0, LONGUEUR_MAX_LIBELLE_NOEUD - 1).join('')}…` : l;
}

export type NoeudDeNote = { ok: true; cle: string; libelle: string } | { ok: false; raison: string };

/**
 * Le nœud qu'une note désigne, relu dans la lignée du projet (projetée par le
 * serveur au moment du geste) · un lien, une clé inventée, un nœud absent sont
 * refusés avec leur raison · rien n'est créé.
 */
export function noeudPourNote(m: Pick<ModeleLignee, 'noeuds'>, x: unknown): NoeudDeNote {
  const cle = cleNoeudNote(x);
  if (!cle) return { ok: false, raison: RAISON_PAS_UN_NOEUD };
  const n = m.noeuds.find((y) => y.id === cle);
  if (!n) return { ok: false, raison: RAISON_NOEUD_ABSENT };
  return { ok: true, cle, libelle: libelleNoeudNote(n) };
}

/**
 * Les notes rangées · sous leur nœud quand il est dans la lignée affichée,
 * sinon dans « Notes sans nœud » · l'ordre de lecture est gardé · aucune note
 * n'est perdue (chaque note est dans exactement une des deux listes).
 */
export function repartirNotes<T extends { noeud: string }>(notes: readonly T[], m: Pick<ModeleLignee, 'noeuds'>): { parNoeud: Map<string, T[]>; sansNoeud: T[] } {
  const presents = new Set(m.noeuds.map((n) => n.id));
  const parNoeud = new Map<string, T[]>();
  const sansNoeud: T[] = [];
  for (const n of notes) {
    if (!presents.has(n.noeud)) { sansNoeud.push(n); continue; }
    const l = parNoeud.get(n.noeud);
    if (l) l.push(n); else parNoeud.set(n.noeud, [n]);
  }
  return { parNoeud, sansNoeud };
}

/** Le nombre de notes OUVERTES · ce que l'indicateur d'un nœud compte. */
export function notesOuvertes(notes: readonly { resolu: unknown }[] | undefined): number {
  return (notes ?? []).filter((n) => !n.resolu).length;
}

/** « 1 note ouverte » · « 3 notes ouvertes » · l'indicateur et le nom accessible de la carte. */
export function phraseIndicateurNotes(n: number): string {
  return `${n} note${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''}`;
}

/** Ce que la tuile d'un nœud dit de ses notes · « Aucune note sur ce nœud. » ou le compte, résolues comprises. */
export function resumeNotesNoeud(notes: readonly { resolu: unknown }[] | undefined): string {
  const l = notes ?? [];
  if (l.length === 0) return 'Aucune note sur ce nœud.';
  const o = notesOuvertes(l);
  const r = l.length - o;
  return [o ? phraseIndicateurNotes(o) : null, r ? `${r} résolue${r > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ');
}

/** L'explication de « Notes sans nœud » · la note reste, la donnée est partie. */
export const EXPLICATION_NOTES_SANS_NOEUD = 'Le nœud de ces notes n’est plus dans la lignée (la donnée a été retirée) · elles restent lisibles ici, sous le nom du nœud au moment de leur écriture. Rien n’est supprimé.';

/** L'adresse du canvas de lignée d'un projet · le lien du journal vers les notes. */
export const lienLigneeProjet = (projectId: string): string => `/studio/projets/${encodeURIComponent(projectId)}?disposition=libre&graphe=lignee`;
