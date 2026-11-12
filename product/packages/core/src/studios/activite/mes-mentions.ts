import { extraitCommentaire } from './commentaires';
import type { SegmentCommentaire } from './mentions';
import { cleNoeudNote, lienLigneeProjet } from '../../spatial/projet/notes-lignee';

/**
 * Studios · « Mes mentions » · la page qui réunit les mentions d'une personne
 * (suite de #1066, commentaires, et #1078, notes de la lignée).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge. Les règles :
 *
 *  · la SOURCE · les notifications EXISTANTES de la personne, de types
 *    `studio_comment_mention` et `studio_note_mention` (`createNotification`,
 *    aucune écriture nouvelle) · de son espace courant seulement ;
 *  · le FIL d'une mention · la notification ne porte que l'adresse du projet et
 *    l'extrait du texte au moment de la mention · le fil est RETROUVÉ parmi les
 *    commentaires (ou notes) du projet, relus dans la portée ACTUELLE de la
 *    personne, qui l'ont prévenue (`prevenus`, une fois par fil) · l'extrait de
 *    la notification désigne le fil quand un de ses textes (courant ou ancien)
 *    le redonne, l'instant le plus proche (création, modifications) départage
 *    (`filDeLaMention`) · rien trouvé dans la portée · la ligne reste, SANS
 *    extrait ni projet ni auteur (« Fil hors de ta portée ») · jamais le texte
 *    de la notification, qu'elle ne pourrait peut-être plus lire ;
 *  · l'EXTRAIT · le texte COURANT du fil, ses mentions sous le nom courant
 *    (`segmentsCommentaire`, règles de #1066), borné à `EXTRAIT_MAX_MENTION`
 *    signes visibles (la borne de l'extrait de la notification,
 *    `extraitCommentaire`) · une mention n'est jamais coupée · des segments de
 *    TEXTE, jamais du HTML ;
 *  · le LIEN · l'ancre STABLE du commentaire dans l'onglet Activité
 *    (`?commentaire=<id>#commentaire-<id>`) ou le nœud de la note dans le
 *    canvas de lignée (`&noeud=<clé>#note-<id>`) ;
 *  · les FILTRES · non lues / toutes, commentaires / notes · lus dans
 *    l'adresse, défensivement · pages de `MENTIONS_PAR_PAGE`, au plus
 *    `MENTIONS_MAX_LUES` mentions listées (les plus récentes), et c'est dit.
 */

export type GenreMention = 'commentaire' | 'note';
export type LectureMentions = 'toutes' | 'non-lues';
export type TypeMentions = 'tous' | 'commentaires' | 'notes';

export interface FiltresMentions { lecture: LectureMentions; type: TypeMentions; page: number }

/** L'adresse de la page. */
export const CHEMIN_MES_MENTIONS = '/studio/mentions';
/** Les types de notification d'une mention · ceux qu'écrivent les commentaires et les notes (`createNotification`). */
export const TYPES_NOTIF_MENTION: Readonly<Record<GenreMention, string>> = { commentaire: 'studio_comment_mention', note: 'studio_note_mention' };
/** 20 mentions par page · la page du journal du projet et la liste du centre de notifications. */
export const MENTIONS_PAR_PAGE = 20;
/** Au plus 500 mentions listées · la borne de lecture du journal (`LECTURE_MAX_JOURNAL`) · au-delà, c'est dit. */
export const MENTIONS_MAX_LUES = 500;
/** 140 signes visibles · la borne de l'extrait de la notification (`extraitCommentaire`). */
export const EXTRAIT_MAX_MENTION = 140;

export const FILTRES_DEFAUT_MENTIONS: FiltresMentions = { lecture: 'toutes', type: 'tous', page: 1 };

export const TEXTES_MES_MENTIONS = {
  titre: 'Mes mentions',
  sous: 'Studios · les commentaires et les notes où l’on te mentionne',
  explication: 'Chaque fil est relu dans ta portée à l’ouverture de la page · un fil que tu ne vois plus reste listé, sans son texte.',
  horsPortee: 'Fil hors de ta portée',
  raisonHorsPortee: 'Fil hors de ta portée · tu ne vois plus ce projet (espace, marque ou droits Studios), son texte n’est pas montré.',
  ouvrir: 'Ouvrir le fil',
  marquer: 'Marquer comme lue',
  enCours: 'Enregistrement…',
  lue: 'Lue',
  nonLue: 'Non lue',
  marquee: 'Mention marquée comme lue.',
  vide: 'Personne ne t’a encore mentionné dans cet espace.',
  videNonLues: 'Aucune mention non lue · tu es à jour.',
  videType: { commentaires: 'Aucune mention dans un commentaire.', notes: 'Aucune mention dans une note de la lignée.' },
  precedente: 'Page précédente',
  suivante: 'Page suivante',
  premiere: 'Tu lis déjà les plus récentes.',
  derniere: 'Tu es à la fin de la liste.',
  tronque: `Les ${MENTIONS_MAX_LUES} mentions les plus récentes sont listées · les plus anciennes restent dans tes notifications.`,
} as const;

const LIBELLE_GENRE: Readonly<Record<GenreMention, string>> = { commentaire: 'Commentaire', note: 'Note de la lignée' };
const ETATS: Readonly<Record<GenreMention, { ouvert: string; resolu: string }>> = {
  commentaire: { ouvert: 'Ouvert', resolu: 'Résolu' },
  note: { ouvert: 'Ouverte', resolu: 'Résolue' },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const premier = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Le genre d'une notification de mention · `null` pour tout autre type. */
export function genreDeNotif(type: string): GenreMention | null {
  return type === TYPES_NOTIF_MENTION.commentaire ? 'commentaire' : type === TYPES_NOTIF_MENTION.note ? 'note' : null;
}

/** Les types de notification lus pour un filtre. */
export function typesDuFiltre(t: TypeMentions): string[] {
  return t === 'commentaires' ? [TYPES_NOTIF_MENTION.commentaire] : t === 'notes' ? [TYPES_NOTIF_MENTION.note] : [TYPES_NOTIF_MENTION.commentaire, TYPES_NOTIF_MENTION.note];
}

/** Les filtres lus dans l'adresse · une valeur inconnue revient au défaut, la page est un entier ≥ 1. */
export function lireFiltresMentions(sp: Readonly<Record<string, unknown>> | null | undefined): FiltresMentions {
  const l = premier(sp?.lecture); const t = premier(sp?.type); const p = premier(sp?.page);
  const page = typeof p === 'string' && /^\d{1,4}$/.test(p) ? Math.max(1, Number(p)) : 1;
  return {
    lecture: l === 'non-lues' ? 'non-lues' : 'toutes',
    type: t === 'commentaires' || t === 'notes' ? t : 'tous',
    page,
  };
}

/** L'adresse de la page pour ces filtres · les valeurs par défaut sont tues. */
export function lienMesMentions(f: FiltresMentions): string {
  const q = new URLSearchParams();
  if (f.lecture !== 'toutes') q.set('lecture', f.lecture);
  if (f.type !== 'tous') q.set('type', f.type);
  if (f.page > 1) q.set('page', String(f.page));
  const s = q.toString();
  return s ? `${CHEMIN_MES_MENTIONS}?${s}` : CHEMIN_MES_MENTIONS;
}

/** Le projet d'une notification de mention · l'adresse qu'elle porte (`/studio/projets/<uuid>…`) · `null` sinon. */
export function projetDuLienMention(href: string | null | undefined): string | null {
  if (typeof href !== 'string') return null;
  const m = /^\/studio\/projets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#]|$)/i.exec(href);
  return m ? m[1]!.toLowerCase() : null;
}

/* ───────────────────────── retrouver le fil ───────────────────────── */

/** Un fil (commentaire ou note) relu DANS la portée, qui a prévenu la personne. */
export interface FilMentionnant {
  id: string;
  genre: GenreMention;
  projetId: string;
  /** Son texte courant puis ses anciens textes · celui de la mention est l'un d'eux. */
  textes: readonly string[];
  /** Ses instants (ms) · création, puis chaque modification. */
  instants: readonly number[];
}

export interface NotifMention { genre: GenreMention; projetId: string | null; corps: string | null; creeLe: number }

/**
 * Le fil d'une mention parmi ceux relus dans la portée · même genre, même
 * projet · ceux dont un texte redonne l'extrait de la notification d'abord ·
 * puis l'instant le plus proche de la notification · `null` si aucun (le fil
 * est hors de la portée, ou n'a jamais prévenu la personne).
 */
export function filDeLaMention(n: NotifMention, fils: readonly FilMentionnant[]): string | null {
  if (!n.projetId) return null;
  const projet = n.projetId.toLowerCase();
  const candidats = fils.filter((f) => f.genre === n.genre && f.projetId.toLowerCase() === projet);
  if (!candidats.length) return null;
  const corps = n.corps?.trim() || null;
  const parTexte = corps ? candidats.filter((f) => f.textes.some((t) => extraitCommentaire(t) === corps)) : [];
  const liste = parTexte.length ? parTexte : candidats;
  const ecart = (f: FilMentionnant) => (f.instants.length ? Math.min(...f.instants.map((i) => Math.abs(i - n.creeLe))) : Number.POSITIVE_INFINITY);
  return [...liste].sort((a, b) => ecart(a) - ecart(b) || a.id.localeCompare(b.id))[0]!.id;
}

/* ───────────────────────── l'extrait ───────────────────────── */

const longueur = (s: string) => [...s].length;

/**
 * Les segments du fil bornés à `max` signes VISIBLES (espaces resserrés) · une
 * mention entière ou rien · le texte coupé à la dernière espace quand elle
 * n'est pas trop loin (la règle de `extraitCommentaire`) · « … » s'il manque
 * quelque chose.
 */
export function extraitSegments(segments: readonly SegmentCommentaire[], max = EXTRAIT_MAX_MENTION): { segments: SegmentCommentaire[]; tronque: boolean } {
  const out: SegmentCommentaire[] = [];
  let n = 0;
  let tronque = false;
  for (const s of segments) {
    if (s.type === 'mention') {
      if (n + longueur(s.nom) > max) { tronque = true; break; }
      out.push(s); n += longueur(s.nom);
      continue;
    }
    let t = s.texte.replace(/\s+/g, ' ');
    if (out.length === 0) t = t.trimStart();
    if (n + longueur(t) <= max) { if (t) out.push({ type: 'texte', texte: t }); n += longueur(t); continue; }
    tronque = true;
    const reste = max - n;
    const coupe = [...t].slice(0, reste).join('');
    const i = coupe.lastIndexOf(' ');
    const garde = (i > reste * 0.6 ? coupe.slice(0, i) : coupe).trimEnd();
    if (garde) out.push({ type: 'texte', texte: garde });
    break;
  }
  const dernier = out[out.length - 1];
  if (dernier?.type === 'texte') out[out.length - 1] = { type: 'texte', texte: dernier.texte.trimEnd() };
  if (tronque) {
    const d = out[out.length - 1];
    if (d?.type === 'texte') out[out.length - 1] = { type: 'texte', texte: `${d.texte}…` };
    else out.push({ type: 'texte', texte: '…' });
  }
  return { segments: out.filter((s) => s.type === 'mention' || s.texte.length > 0), tronque };
}

/* ───────────────────────── l'adresse du fil ───────────────────────── */

/** L'ancre STABLE d'un commentaire dans l'onglet Activité. */
export const ancreCommentaire = (id: string): string => `commentaire-${id.toLowerCase()}`;
/** L'ancre STABLE d'une note dans le canvas de lignée (détail du nœud, ou « Notes sans nœud »). */
export const ancreNote = (id: string): string => `note-${id.toLowerCase()}`;

/** Le lien direct vers le fil · le commentaire dans l'onglet Activité, ou la note sur son nœud de la lignée. */
export function lienFilMention(f: { genre: GenreMention; id: string; projetId: string; noeud?: string | null }): string {
  if (f.genre === 'commentaire') {
    return `/studio/projets/${encodeURIComponent(f.projetId)}?commentaire=${encodeURIComponent(f.id.toLowerCase())}#${ancreCommentaire(f.id)}`;
  }
  const noeud = f.noeud ? cleNoeudNote(f.noeud) : null;
  return `${lienLigneeProjet(f.projetId)}${noeud ? `&noeud=${encodeURIComponent(noeud)}` : ''}#${ancreNote(f.id)}`;
}

/** Le commentaire visé par l'adresse de la fiche (`?commentaire=<uuid>`) · `null` sinon. */
export function lireCommentaireCible(sp: Readonly<Record<string, unknown>> | null | undefined): string | null {
  const v = premier(sp?.commentaire);
  return typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null;
}

/** Le nœud de la lignée visé par l'adresse (`?noeud=<clé>`) · une clé de nœud valide, sinon `null`. */
export function lireNoeudCible(sp: Readonly<Record<string, unknown>> | null | undefined): string | null {
  return cleNoeudNote(premier(sp?.noeud));
}

/* ───────────────────────── la ligne et la page ───────────────────────── */

/** Un fil relu dans la portée, tel que le serveur le remet à la règle. */
export interface FilLu {
  id: string;
  genre: GenreMention;
  projetId: string;
  projet: string;
  auteur: string;
  segments: readonly SegmentCommentaire[];
  resolu: { par: string; quand: string } | null;
  /** La clé du nœud d'une note · `null` pour un commentaire. */
  noeud: string | null;
}

export interface LigneMention {
  /** L'identifiant de la NOTIFICATION · « marquer comme lue » le renvoie au mécanisme existant. */
  id: string;
  genre: GenreMention;
  libelle: string;
  quand: string;
  lue: boolean;
  fil: {
    auteur: string;
    projet: string;
    extrait: SegmentCommentaire[];
    tronque: boolean;
    etat: 'ouvert' | 'resolu';
    libelleEtat: string;
    /** « Commentaire résolu par … · … » (« Note résolue… ») · `null` quand le fil est ouvert. */
    phraseEtat: string | null;
    href: string;
  } | null;
  /** La phrase d'un fil hors de la portée · `null` quand le fil est relu. */
  horsPortee: string | null;
}

/** Une ligne · avec son fil relu, ou sans rien de lui (hors de la portée). */
export function ligneMention(n: { id: string; genre: GenreMention; quand: string; lue: boolean }, fil: FilLu | null): LigneMention {
  const base = { id: n.id, genre: n.genre, libelle: LIBELLE_GENRE[n.genre], quand: n.quand, lue: n.lue };
  if (!fil || fil.genre !== n.genre) return { ...base, fil: null, horsPortee: TEXTES_MES_MENTIONS.horsPortee };
  const e = extraitSegments(fil.segments);
  const resolu = !!fil.resolu;
  return {
    ...base,
    horsPortee: null,
    fil: {
      auteur: fil.auteur,
      projet: fil.projet,
      extrait: e.segments,
      tronque: e.tronque,
      etat: resolu ? 'resolu' : 'ouvert',
      libelleEtat: resolu ? ETATS[n.genre].resolu : ETATS[n.genre].ouvert,
      phraseEtat: fil.resolu ? `${n.genre === 'note' ? 'Note résolue' : 'Commentaire résolu'} par ${fil.resolu.par} · ${fil.resolu.quand}` : null,
      href: lienFilMention({ genre: fil.genre, id: fil.id, projetId: fil.projetId, noeud: fil.noeud }),
    },
  };
}

/** Les comptes des mentions de la personne, par genre · toutes et non lues. */
export interface ComptesMentions { commentaire: { toutes: number; nonLues: number }; note: { toutes: number; nonLues: number } }

export const COMPTES_VIDES: ComptesMentions = { commentaire: { toutes: 0, nonLues: 0 }, note: { toutes: 0, nonLues: 0 } };

/** Combien de mentions un filtre montre. */
export function totalDuFiltre(c: ComptesMentions, f: Pick<FiltresMentions, 'lecture' | 'type'>): number {
  const k = f.lecture === 'non-lues' ? 'nonLues' : 'toutes';
  return (f.type !== 'notes' ? c.commentaire[k] : 0) + (f.type !== 'commentaires' ? c.note[k] : 0);
}

/** La page lue · bornée à `MENTIONS_MAX_LUES` mentions, la page ramenée dans [1, pages]. */
export function paginationMentions(total: number, page: number): { page: number; pages: number; debut: number; tronque: boolean } {
  const lisibles = Math.min(Math.max(0, Math.floor(total)), MENTIONS_MAX_LUES);
  const pages = Math.max(1, Math.ceil(lisibles / MENTIONS_PAR_PAGE));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { page: p, pages, debut: (p - 1) * MENTIONS_PAR_PAGE, tronque: total > MENTIONS_MAX_LUES };
}

export interface FiltreAffiche { cle: string; libelle: string; href: string; actif: boolean }

export interface VueMesMentions {
  filtres: FiltresMentions;
  lecture: FiltreAffiche[];
  types: FiltreAffiche[];
  lignes: LigneMention[];
  page: number;
  pages: number;
  /** Combien le filtre en montre (au plus `MENTIONS_MAX_LUES` listées). */
  total: number;
  tronque: string | null;
  precedente: string | null;
  suivante: string | null;
  vide: string | null;
}

/** La page · filtres (avec leur compte), lignes, pages, phrase du vide. */
export function vueMesMentions(e: { filtres: FiltresMentions; comptes: ComptesMentions; lignes: LigneMention[] }): VueMesMentions {
  const f = e.filtres;
  const total = totalDuFiltre(e.comptes, f);
  const p = paginationMentions(total, f.page);
  const filtres: FiltresMentions = { ...f, page: p.page };
  const lecture = (['toutes', 'non-lues'] as const).map((l) => ({
    cle: l, libelle: `${l === 'toutes' ? 'Toutes' : 'Non lues'} · ${totalDuFiltre(e.comptes, { lecture: l, type: f.type })}`,
    href: lienMesMentions({ lecture: l, type: f.type, page: 1 }), actif: f.lecture === l,
  }));
  const types = (['tous', 'commentaires', 'notes'] as const).map((t) => ({
    cle: t, libelle: `${t === 'tous' ? 'Tout' : t === 'commentaires' ? 'Commentaires' : 'Notes'} · ${totalDuFiltre(e.comptes, { lecture: f.lecture, type: t })}`,
    href: lienMesMentions({ lecture: f.lecture, type: t, page: 1 }), actif: f.type === t,
  }));
  const vide = e.lignes.length ? null
    : totalDuFiltre(e.comptes, { lecture: 'toutes', type: 'tous' }) === 0 ? TEXTES_MES_MENTIONS.vide
      : f.lecture === 'non-lues' ? TEXTES_MES_MENTIONS.videNonLues
        : f.type !== 'tous' ? TEXTES_MES_MENTIONS.videType[f.type] : TEXTES_MES_MENTIONS.vide;
  return {
    filtres, lecture, types, lignes: e.lignes, page: p.page, pages: p.pages, total,
    tronque: p.tronque ? TEXTES_MES_MENTIONS.tronque : null,
    precedente: p.page > 1 ? lienMesMentions({ ...filtres, page: p.page - 1 }) : null,
    suivante: p.page < p.pages ? lienMesMentions({ ...filtres, page: p.page + 1 }) : null,
    vide,
  };
}
