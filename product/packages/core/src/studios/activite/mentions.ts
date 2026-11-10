import { aPermissionEspace, estRoleEspace, permissionsStudio } from '../permissions';
import { objetDansPortee } from '../portee';

/**
 * Studios · les MENTIONS dans un commentaire de projet (suite du lot 10 V5).
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge. Les règles, rejouées par le
 * serveur à chaque écriture (une action serveur est appelable directement,
 * rien n'est cru du client) :
 *
 *  · QUI peut être mentionné · un membre de l'espace du projet qui VOIT le
 *    projet · `studio.read` par son rôle (`permissionsStudio`, la règle de la
 *    garde, sans droit nouveau) ET la marque du projet dans sa portée
 *    (`objetDansPortee`, ses restrictions de marque comprises) · jamais
 *    l'auteur lui-même, jamais un membre qui masque ses informations (on ne
 *    pourrait le proposer qu'en les montrant) · une mention ne donne AUCUN
 *    accès, elle ne vise que qui voit déjà le projet ;
 *  · le STOCKAGE · un IDENTIFIANT et la place de la mention dans le texte
 *    (`debut`, `longueur` · le « @Nom » tel qu'écrit), jamais le nom seul ·
 *    gardé dans le JSON existant du commentaire (`history`, une entrée à part
 *    des anciens textes · aucune colonne, aucune migration) ;
 *  · l'ANALYSE · le client envoie les identifiants qu'il a choisis dans la
 *    liste · le serveur ne garde que ceux de membres MENTIONNABLES dont le
 *    « @Nom » courant figure dans le texte normalisé (un identifiant forgé,
 *    d'un autre espace, hors de la marque, ou dont le nom a été effacé du
 *    texte · ignoré, sans erreur) ;
 *  · l'AFFICHAGE · le nom COURANT du membre (ou « un ancien membre » s'il ne
 *    voit plus le projet) · le texte reste du texte (React l'échappe), une
 *    mention n'injecte aucun HTML ;
 *  · la NOTIFICATION · une fois par commentaire et par personne (`prevenus`,
 *    cumulés · une mention retirée puis remise ne prévient pas deux fois),
 *    jamais l'auteur · le propriétaire mentionné dans un NOUVEAU commentaire
 *    reçoit la mention seule, pas en plus « Nouveau commentaire ».
 */

/** Au plus 20 mentions retenues par commentaire · au-delà, le texte reste du texte. */
export const MENTIONS_MAX_COMMENTAIRE = 20;
/** Au plus 40 identifiants demandés lus · le reste de la demande est ignoré. */
export const DEMANDES_MAX_MENTIONS = 40;
/** La requête après « @ » · 40 caractères au plus, sur une seule ligne. */
export const REQUETE_MAX_MENTION = 40;
/** Au plus 8 membres proposés à la fois dans la liste. */
export const PROPOSITIONS_MAX_MENTION = 8;
/** Le nom d'un membre tel qu'écrit après « @ » · 80 caractères au plus. */
export const NOM_MAX_MENTION = 80;

export const LIBELLE_ANCIEN_MEMBRE = 'un ancien membre';
export const LIBELLE_MEMBRE_MASQUE = 'Un membre de l’espace';
export const AIDE_MENTIONS = 'Écris @ pour mentionner un membre qui voit ce projet · il est prévenu, la mention ne lui donne aucun accès.';
export const VIDE_MENTIONS_AUCUN = 'Personne d’autre ne voit ce projet · aucun membre à mentionner.';
export const VIDE_MENTIONS_REQUETE = 'Aucun membre qui voit ce projet ne porte ce nom.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
const CONTROLES = /[\u0000-\u001F\u007F‎‏‪-‮⁦-⁩]/g;
/** Une lettre, un chiffre ou « _ » · ce qui colle un « @ » à un mot (une adresse) ou prolonge un nom. */
const MOT = /[\p{L}\p{N}_]/u;

/* ───────────────────────── qui peut être mentionné ───────────────────────── */

/** Un membre de l'espace tel que le serveur le lit · rien d'autre n'entre dans la règle. */
export interface MembreBrut {
  id: string;
  nom: string | null;
  email: string | null;
  masque: boolean;
  roleEspace: unknown;
  /** La fonction Studios ouverte à ce membre (rôle et formule de l'espace · `canAccess`). */
  studioOuvert: boolean;
  /** Ses restrictions de marque (vide = toutes les marques de l'espace). */
  restrictionsMarque: readonly string[];
}

export interface MembreMentionnable { id: string; nom: string }

/** Le nom écrit après « @ » · espaces resserrés, contrôles et « @ » de tête retirés, borné · `null` s'il ne reste rien. */
export function nomMention(nom: string | null | undefined, email?: string | null): string | null {
  const net = (x: string | null | undefined) => (typeof x === 'string' ? x.replace(CONTROLES, ' ').replace(/\s+/g, ' ').trim().replace(/^@+/, '').trim() : '');
  const n = net(nom) || net(email);
  if (!n) return null;
  return [...n].length > NOM_MAX_MENTION ? [...n].slice(0, NOM_MAX_MENTION).join('').trimEnd() : n;
}

/** Le membre VOIT-il le projet ? `studio.read` par son rôle ET la marque du projet dans sa portée. */
export function membreVoitProjet(m: Pick<MembreBrut, 'roleEspace' | 'studioOuvert' | 'restrictionsMarque'>, projet: { workspaceId: string; brandId: string }, marquesDuWorkspace: readonly string[]): boolean {
  if (!estRoleEspace(m.roleEspace)) return false;
  const p = permissionsStudio({ roleEspace: m.roleEspace, studioOuvert: m.studioOuvert, roleEquipe: null });
  if (!aPermissionEspace(p, 'studio.read')) return false;
  return objetDansPortee({ workspaceId: projet.workspaceId, marquesDuWorkspace: [...marquesDuWorkspace], restrictionsMarque: [...m.restrictionsMarque] }, projet);
}

/**
 * Les membres proposés dans la liste (et seuls admis par l'analyse) · ceux qui
 * voient le projet, sauf l'auteur et qui masque ses informations · triés par
 * nom (français, sans casse).
 */
export function membresMentionnables(membres: readonly MembreBrut[], o: { projet: { workspaceId: string; brandId: string }; marquesDuWorkspace: readonly string[]; auteurId: string }): MembreMentionnable[] {
  const vus = new Set<string>();
  const out: MembreMentionnable[] = [];
  for (const m of membres) {
    if (!UUID.test(m.id) || vus.has(m.id.toLowerCase()) || m.id.toLowerCase() === o.auteurId.toLowerCase() || m.masque) continue;
    if (!membreVoitProjet(m, o.projet, o.marquesDuWorkspace)) continue;
    const nom = nomMention(m.nom, m.email);
    if (!nom) continue;
    vus.add(m.id.toLowerCase());
    out.push({ id: m.id.toLowerCase(), nom });
  }
  return out.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/**
 * Le nom AFFICHÉ d'un mentionné · le nom courant s'il voit encore le projet
 * (« Un membre de l'espace » s'il masque ses informations), `null` sinon ·
 * l'écran dit alors « un ancien membre ».
 */
export function nomAffichageMention(m: MembreBrut | undefined, projet: { workspaceId: string; brandId: string }, marquesDuWorkspace: readonly string[]): string | null {
  if (!m || !membreVoitProjet(m, projet, marquesDuWorkspace)) return null;
  if (m.masque) return LIBELLE_MEMBRE_MASQUE;
  return nomMention(m.nom, m.email) ?? LIBELLE_MEMBRE_MASQUE;
}

/* ───────────────────────── la saisie · la liste au clavier ───────────────────────── */

const plat = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');

/**
 * La mention en cours de saisie · le « @ » le plus proche avant le curseur,
 * en début de texte ou après un caractère qui n'est ni une lettre ni un
 * chiffre (une adresse « a@b » n'ouvre rien), sur la même ligne, la requête
 * ne commence pas par une espace et fait au plus `REQUETE_MAX_MENTION`
 * caractères · `null` sinon (la liste se ferme).
 */
export function requeteMention(texte: string, curseur: number): { debut: number; requete: string } | null {
  if (typeof texte !== 'string' || !Number.isInteger(curseur) || curseur < 1 || curseur > texte.length) return null;
  const at = texte.lastIndexOf('@', curseur - 1);
  if (at < 0 || curseur - at - 1 > REQUETE_MAX_MENTION) return null;
  const avant = at > 0 ? texte[at - 1]! : '';
  if (avant && (MOT.test(avant) || avant === '@')) return null;
  const requete = texte.slice(at + 1, curseur);
  if (/[\n\r@]/.test(requete) || /^\s/.test(requete) || /\s{2}/.test(requete)) return null;
  return { debut: at, requete };
}

/** Les membres proposés pour une requête · nom ou un de ses mots qui commence par elle (sans casse ni accents), au plus `max`. */
export function filtrerMentionnables(liste: readonly MembreMentionnable[], requete: string, max = PROPOSITIONS_MAX_MENTION): MembreMentionnable[] {
  const q = plat(requete.trim());
  const garde = q ? liste.filter((m) => { const n = plat(m.nom); return n.startsWith(q) || n.split(/[\s.\-_'’]+/).some((mot) => mot.startsWith(q)); }) : [...liste];
  return garde.slice(0, Math.max(0, max));
}

/** Le texte une fois le membre choisi · « @requête » remplacé par « @Nom » suivi d'une espace, et le nouveau curseur. */
export function insererMention(texte: string, debut: number, curseur: number, nom: string): { texte: string; curseur: number } {
  const suite = texte.slice(curseur);
  const insere = `@${nom}${suite.startsWith(' ') ? '' : ' '}`;
  const t = `${texte.slice(0, debut)}${insere}${suite}`;
  return { texte: t, curseur: debut + insere.length + (suite.startsWith(' ') ? 1 : 0) };
}

/** Le pas des flèches dans la liste · boucle en haut et en bas, `-1` sans proposition. */
export function optionMentionSuivante(actif: number, sens: 1 | -1, n: number): number {
  if (n <= 0) return -1;
  if (actif < 0 || actif >= n) return sens === 1 ? 0 : n - 1;
  return (actif + sens + n) % n;
}

/* ───────────────────────── l'analyse au serveur ───────────────────────── */

export interface MentionStockee { id: string; debut: number; longueur: number }
export interface MentionsCommentaire { mentions: MentionStockee[]; prevenus: string[] }

/** Les identifiants demandés par le client, relus · uuid seulement, sans doublon, bornés. Rien n'est deviné. */
export function lireDemandeMentions(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  for (const v of x.slice(0, DEMANDES_MAX_MENTIONS)) {
    if (typeof v !== 'string' || !UUID.test(v.trim())) continue;
    const id = v.trim().toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Les mentions retenues d'un texte DÉJÀ normalisé (`validerTexteCommentaire`) ·
 * pour chaque identifiant demandé ET mentionnable, chaque « @Nom » de son nom
 * courant (bornes de mot des deux côtés) · un passage déjà pris ne l'est pas
 * deux fois (le nom le plus long d'abord, puis l'ordre de la demande · deux
 * homonymes demandés, le premier choisi l'emporte) · triées dans l'ordre du
 * texte, au plus `MENTIONS_MAX_COMMENTAIRE`.
 */
export function analyserMentions(texte: string, demande: unknown, mentionnables: readonly MembreMentionnable[]): MentionStockee[] {
  const ids = lireDemandeMentions(demande);
  const parId = new Map(mentionnables.map((m) => [m.id.toLowerCase(), m]));
  const candidats = ids.flatMap((id, rang) => { const m = parId.get(id); return m ? [{ id, jeton: `@${m.nom}`, rang }] : []; })
    .sort((a, b) => b.jeton.length - a.jeton.length || a.rang - b.rang);
  const prises: MentionStockee[] = [];
  const chevauche = (d: number, l: number) => prises.some((p) => d < p.debut + p.longueur && p.debut < d + l);
  for (const c of candidats) {
    let i = texte.indexOf(c.jeton);
    while (i >= 0) {
      const avant = i > 0 ? texte[i - 1]! : '';
      const apres = texte[i + c.jeton.length] ?? '';
      if (!(avant && (MOT.test(avant) || avant === '@')) && !(apres && MOT.test(apres)) && !chevauche(i, c.jeton.length)) prises.push({ id: c.id, debut: i, longueur: c.jeton.length });
      i = texte.indexOf(c.jeton, i + 1);
    }
  }
  return prises.sort((a, b) => a.debut - b.debut).slice(0, MENTIONS_MAX_COMMENTAIRE);
}

/** Les personnes à prévenir · chaque mentionné une fois, jamais l'auteur, jamais qui l'a déjà été pour ce commentaire. */
export function aPrevenirMentions(mentions: readonly MentionStockee[], dejaPrevenus: readonly string[], auteurId: string): string[] {
  const deja = new Set(dejaPrevenus.map((x) => x.toLowerCase()));
  const out: string[] = [];
  for (const m of mentions) {
    const id = m.id.toLowerCase();
    if (id === auteurId.toLowerCase() || deja.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Le propriétaire est-il prévenu d'un NOUVEAU commentaire par « Nouveau
 * commentaire » ? Pas s'il l'écrit, pas s'il y est mentionné (la mention le
 * prévient déjà · une notification par personne et par commentaire).
 */
export function proprietairePrevenuSansMention(proprietaireId: string | null, auteurId: string, mentionnesPrevenus: readonly string[]): boolean {
  if (!proprietaireId) return false;
  const p = proprietaireId.toLowerCase();
  return p !== auteurId.toLowerCase() && !mentionnesPrevenus.some((x) => x.toLowerCase() === p);
}

/* ───────────────────────── le JSON du commentaire ───────────────────────── */

const estEntreeMentions = (e: unknown): e is { mentions: unknown; prevenus?: unknown } => typeof e === 'object' && e !== null && !Array.isArray(e) && 'mentions' in e && !('texte' in e);

/**
 * Les mentions gardées d'un commentaire, relues DÉFENSIVEMENT contre son texte ·
 * la dernière entrée « mentions » de `history` · une mention hors du texte, qui
 * ne commence pas par « @ », qui en chevauche une autre ou à l'identifiant
 * illisible est ignorée (le passage reste du texte), jamais inventée.
 */
export function lireMentions(history: unknown, body: string): MentionsCommentaire {
  const entree = Array.isArray(history) ? [...history].reverse().find(estEntreeMentions) : undefined;
  if (!entree) return { mentions: [], prevenus: [] };
  const brutes = Array.isArray(entree.mentions) ? entree.mentions : [];
  const mentions: MentionStockee[] = [];
  for (const m of brutes) {
    if (typeof m !== 'object' || m === null) continue;
    const { id, debut, longueur } = m as Record<string, unknown>;
    if (typeof id !== 'string' || !UUID.test(id) || !Number.isInteger(debut) || !Number.isInteger(longueur)) continue;
    const d = debut as number; const l = longueur as number;
    if (d < 0 || l < 2 || d + l > body.length || body[d] !== '@') continue;
    if (mentions.some((p) => d < p.debut + p.longueur && p.debut < d + l)) continue;
    mentions.push({ id: id.toLowerCase(), debut: d, longueur: l });
  }
  const prevenus = Array.isArray(entree.prevenus) ? lireDemandeMentions(entree.prevenus.slice(0, DEMANDES_MAX_MENTIONS * 2)) : [];
  return { mentions: mentions.sort((a, b) => a.debut - b.debut).slice(0, MENTIONS_MAX_COMMENTAIRE), prevenus };
}

/**
 * `history` avec les mentions posées · les anciens textes gardés tels quels,
 * l'entrée « mentions » remplacée (une seule, à la fin) · aucune entrée quand
 * il n'y a ni mention ni personne prévenue (un commentaire sans mention garde
 * `[]`).
 */
export function historiqueAvecMentions(history: unknown, m: MentionsCommentaire): unknown[] {
  const autres = Array.isArray(history) ? history.filter((e) => !estEntreeMentions(e)) : [];
  if (m.mentions.length === 0 && m.prevenus.length === 0) return autres;
  return [...autres, { mentions: m.mentions.map((x) => ({ id: x.id, debut: x.debut, longueur: x.longueur })), prevenus: [...m.prevenus] }];
}

/** Les personnes prévenues après cette écriture · cumulées, jamais retirées. */
export function prevenusApres(avant: readonly string[], nouveaux: readonly string[]): string[] {
  return [...new Set([...avant.map((x) => x.toLowerCase()), ...nouveaux.map((x) => x.toLowerCase())])];
}

/* ───────────────────────── l'affichage ───────────────────────── */

export type SegmentCommentaire =
  | { type: 'texte'; texte: string }
  | { type: 'mention'; id: string; nom: string; ancien: boolean };

/**
 * Le texte du commentaire découpé pour l'écran · le texte tel qu'écrit, chaque
 * mention remplacée par « @ » + le nom COURANT (`nomDe`) ou « @un ancien
 * membre » · des segments de TEXTE, que l'écran rend comme du texte.
 */
export function segmentsCommentaire(body: string, mentions: readonly MentionStockee[], nomDe: (id: string) => string | null): SegmentCommentaire[] {
  const out: SegmentCommentaire[] = [];
  let i = 0;
  for (const m of [...mentions].sort((a, b) => a.debut - b.debut)) {
    if (m.debut < i || m.debut + m.longueur > body.length) continue;
    if (m.debut > i) out.push({ type: 'texte', texte: body.slice(i, m.debut) });
    const nom = nomDe(m.id);
    out.push(nom ? { type: 'mention', id: m.id, nom: `@${nom}`, ancien: false } : { type: 'mention', id: m.id, nom: `@${LIBELLE_ANCIEN_MEMBRE}`, ancien: true });
    i = m.debut + m.longueur;
  }
  if (i < body.length || out.length === 0) out.push({ type: 'texte', texte: body.slice(i) });
  return out;
}

/** Le texte affiché, d'un tenant (les mentions sous leur nom courant). */
export function texteAffiche(segments: readonly SegmentCommentaire[]): string {
  return segments.map((s) => (s.type === 'texte' ? s.texte : s.nom)).join('');
}

/**
 * Le texte proposé à la modification et les mentions déjà choisies · chaque
 * mention d'un membre qui voit encore le projet sous son nom COURANT (la
 * mention tient si le texte n'y touche pas) · celle d'un ancien membre redevient
 * du texte, telle qu'elle s'affichait.
 */
export function departEditionCommentaire(segments: readonly SegmentCommentaire[]): { texte: string; mentions: string[] } {
  const mentions: string[] = [];
  for (const s of segments) if (s.type === 'mention' && !s.ancien && !mentions.includes(s.id)) mentions.push(s.id);
  return { texte: texteAffiche(segments), mentions };
}
