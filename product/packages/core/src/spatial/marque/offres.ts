import type { FaitBrief } from '../../studios/brief';

/**
 * Marque · OFFRES et ALLÉGATIONS (lot 9 bis V5 · VB M07, PR04).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── Ce que la règle dit ──────────────────────────────────────────────────────
 *
 *  · `validerOffre` · une offre de la marque · un intitulé (obligatoire), un
 *    TYPE (`TYPES_OFFRE` · remise, bundle, garantie, livraison, retours,
 *    essai, cadeau, autre) et ses conditions en clair. Validée AVANT toute
 *    écriture · rien n'est tronqué en silence, l'erreur dit le champ.
 *  · `validerAllegation` · ce que la marque affirme, sa preuve ou sa source, et
 *    son statut · « à prouver » (défaut) ou « prouvée ». Une allégation
 *    PROUVÉE cite sa preuve · sans preuve, elle reste « à prouver ».
 *  · `signalAllegation` · une allégation « à prouver » se SIGNALE partout où
 *    elle est proposée (fiche, assistant) · jamais présentée comme acquise.
 *  · `manquesOffres` · les conditions que la V5 attend d'une marque
 *    (livraison, retours, garantie · M07) et qu'aucune offre ACTIVE ne couvre.
 *  · Le brief · une offre choisie au lancement d'un projet y entre comme
 *    TEXTE, en FAIT DÉCLARÉ du brief canonique (`faitOffre` · identifiant
 *    `offre.<id>`, comme les faits `produit.<clé>` d'un produit épinglé). Aucun
 *    champ nouveau, aucun contrat de modèle touché · le fait suit le brief
 *    partout où il va déjà. `offreDuBrief` le RELIT (l'identifiant seul compte ·
 *    le texte figé n'est jamais repris pour nommer l'offre).
 *
 * Une seule table d'offres (`adsmap_offers`, déjà citée par l'ad Adsmap ·
 * `offer_id`). « Archiver » est son `active = false` · rien ne se supprime ·
 * une offre archivée n'est plus proposée au brief, elle reste lue sur les lots.
 */

export const TYPES_OFFRE = ['remise', 'bundle', 'garantie', 'livraison', 'retours', 'essai', 'cadeau', 'autre'] as const;
export type TypeOffre = (typeof TYPES_OFFRE)[number];

export const LIBELLES_TYPE_OFFRE: Readonly<Record<TypeOffre, string>> = {
  remise: 'Remise', bundle: 'Bundle', garantie: 'Garantie', livraison: 'Livraison', retours: 'Retours',
  essai: 'Essai', cadeau: 'Cadeau', autre: 'Autre',
};

export const estTypeOffre = (t: unknown): t is TypeOffre => typeof t === 'string' && (TYPES_OFFRE as readonly string[]).includes(t);

export const INTITULE_OFFRE_MAX = 120;
export const CONDITIONS_OFFRE_MAX = 600;
export const TEXTE_ALLEGATION_MAX = 300;
export const PREUVE_ALLEGATION_MAX = 600;

/** Le refus d'une offre ou d'une allégation hors de la marque (autre marque, autre espace, inconnue) · une seule phrase, rien ne fuit. */
export const REFUS_OFFRE_INTROUVABLE = 'Cette offre n’existe pas dans cette marque.';
export const REFUS_ALLEGATION_INTROUVABLE = 'Cette allégation n’existe pas dans cette marque.';

export type ChampOffre = 'intitule' | 'type' | 'conditions';
export interface OffreValide { intitule: string; type: TypeOffre; conditions: string | null }
export type ValidationOffre = { ok: true; offre: OffreValide } | { ok: false; erreurs: Array<{ champ: ChampOffre; raison: string }> };

const CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]+/g;
const ligne = (v: string) => v.replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim();
const bloc = (v: string) => v.replace(CONTROLE, ' ').trim();
const objet = (brut: unknown) => (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;

/** La saisie d'une offre (création ou modification) · tout est vérifié avant d'écrire. */
export function validerOffre(brut: unknown): ValidationOffre {
  const x = objet(brut);
  const erreurs: Array<{ champ: ChampOffre; raison: string }> = [];
  const intitule = typeof x.intitule === 'string' ? ligne(x.intitule) : '';
  if (!intitule) erreurs.push({ champ: 'intitule', raison: 'L’intitulé de l’offre est obligatoire.' });
  else if (intitule.length > INTITULE_OFFRE_MAX) erreurs.push({ champ: 'intitule', raison: `L’intitulé tient en ${INTITULE_OFFRE_MAX} signes au plus.` });
  if (!estTypeOffre(x.type)) erreurs.push({ champ: 'type', raison: `Choisis le type de l’offre · ${TYPES_OFFRE.map((t) => LIBELLES_TYPE_OFFRE[t].toLocaleLowerCase('fr')).join(', ')}.` });
  const conditions = typeof x.conditions === 'string' ? bloc(x.conditions) : x.conditions == null ? '' : null;
  if (conditions === null) erreurs.push({ champ: 'conditions', raison: 'Les conditions doivent être un texte.' });
  else if (conditions.length > CONDITIONS_OFFRE_MAX) erreurs.push({ champ: 'conditions', raison: `Les conditions tiennent en ${CONDITIONS_OFFRE_MAX} signes au plus.` });
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, offre: { intitule, type: x.type as TypeOffre, conditions: conditions || null } };
}

export const STATUTS_ALLEGATION = ['a_prouver', 'prouvee'] as const;
export type StatutAllegation = (typeof STATUTS_ALLEGATION)[number];
export const LIBELLES_STATUT_ALLEGATION: Readonly<Record<StatutAllegation, string>> = { a_prouver: 'À prouver', prouvee: 'Prouvée' };
/** Un statut lu en base · tout ce qui n'est pas « prouvée » se lit « à prouver » (jamais l'inverse). */
export const statutAllegation = (s: unknown): StatutAllegation => (s === 'prouvee' ? 'prouvee' : 'a_prouver');

export type ChampAllegation = 'texte' | 'preuve' | 'statut';
export interface AllegationValide { texte: string; preuve: string | null; statut: StatutAllegation }
export type ValidationAllegation = { ok: true; allegation: AllegationValide } | { ok: false; erreurs: Array<{ champ: ChampAllegation; raison: string }> };

/** La saisie d'une allégation · une allégation PROUVÉE cite sa preuve ou sa source. */
export function validerAllegation(brut: unknown): ValidationAllegation {
  const x = objet(brut);
  const erreurs: Array<{ champ: ChampAllegation; raison: string }> = [];
  const texte = typeof x.texte === 'string' ? ligne(x.texte) : '';
  if (!texte) erreurs.push({ champ: 'texte', raison: 'Le texte de l’allégation est obligatoire.' });
  else if (texte.length > TEXTE_ALLEGATION_MAX) erreurs.push({ champ: 'texte', raison: `L’allégation tient en ${TEXTE_ALLEGATION_MAX} signes au plus.` });
  const preuve = typeof x.preuve === 'string' ? bloc(x.preuve) : x.preuve == null ? '' : null;
  if (preuve === null) erreurs.push({ champ: 'preuve', raison: 'La preuve doit être un texte.' });
  else if (preuve.length > PREUVE_ALLEGATION_MAX) erreurs.push({ champ: 'preuve', raison: `La preuve tient en ${PREUVE_ALLEGATION_MAX} signes au plus.` });
  const statut = x.statut == null || x.statut === '' ? 'a_prouver' : x.statut;
  if (!(STATUTS_ALLEGATION as readonly unknown[]).includes(statut)) erreurs.push({ champ: 'statut', raison: 'Le statut est « à prouver » ou « prouvée ».' });
  else if (statut === 'prouvee' && !preuve) erreurs.push({ champ: 'preuve', raison: 'Une allégation prouvée cite sa preuve ou sa source · sans elle, elle reste « à prouver ».' });
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, allegation: { texte, preuve: preuve || null, statut: statut as StatutAllegation } };
}

/** Ce que l'écran écrit À CÔTÉ d'une allégation « à prouver » · partout où elle est proposée. */
export const SIGNAL_ALLEGATION_A_PROUVER = 'À prouver · ne l’affirme pas telle quelle tant que sa preuve manque';

/** Le signal d'une allégation · `null` pour une allégation prouvée. */
export function signalAllegation(statut: unknown): string | null {
  return statutAllegation(statut) === 'a_prouver' ? SIGNAL_ALLEGATION_A_PROUVER : null;
}

/* ─────────────────────────── Lecture des offres ─────────────────────────── */

export interface OffreLue { id: string; intitule: string; type: string | null; conditions: string | null; active: boolean }

/** Le type d'une offre en clair · une offre d'avant 0072 (type absent ou inconnu) le dit. */
export const libelleTypeOffre = (t: string | null | undefined): string => (estTypeOffre(t) ? LIBELLES_TYPE_OFFRE[t] : 'Type non précisé');

/** La ligne d'une offre · « Remise · −20 % dès 2 achetés » (le type, puis les conditions quand il y en a). */
export function detailOffre(o: Pick<OffreLue, 'type' | 'conditions'>): string {
  const c = (o.conditions ?? '').trim();
  return c ? `${libelleTypeOffre(o.type)} · ${c}` : libelleTypeOffre(o.type);
}

/** L'ordre de lecture des offres, partout · les actives d'abord, chacune dans l'ordre reçu (création). */
export function ordonnerOffres<T extends { active: boolean }>(offres: readonly T[]): T[] {
  return [...offres.filter((o) => o.active), ...offres.filter((o) => !o.active)];
}

/** Les conditions que la V5 attend d'une marque (« Offres & preuves » · M07). */
export const CONDITIONS_ESSENTIELLES: readonly TypeOffre[] = ['livraison', 'retours', 'garantie'];

/** Les conditions essentielles qu'aucune offre ACTIVE ne couvre, dans l'ordre de `CONDITIONS_ESSENTIELLES`. */
export function manquesOffres(offres: ReadonlyArray<Pick<OffreLue, 'type' | 'active'>>): TypeOffre[] {
  const couvertes = new Set(offres.filter((o) => o.active).map((o) => o.type));
  return CONDITIONS_ESSENTIELLES.filter((t) => !couvertes.has(t));
}

/** La pastille de la tuile · « Garantie manquante », « Retours et garantie manquants », … · `null` quand rien ne manque. */
export function pastilleManquesOffres(manques: readonly TypeOffre[]): string | null {
  if (!manques.length) return null;
  const noms = manques.map((t, i) => (i ? LIBELLES_TYPE_OFFRE[t].toLocaleLowerCase('fr') : LIBELLES_TYPE_OFFRE[t]));
  const liste = noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms[0]!;
  // « Garantie » et « Livraison » sont féminins, « Retours » masculin pluriel · l'accord suit le dernier nom, comme à l'oral.
  const seul = manques.length === 1;
  const accord = seul ? (manques[0] === 'retours' ? 'manquants' : 'manquante') : 'manquants';
  return `${liste} ${accord}`;
}

/* ─────────────────────────── L'offre dans le brief ───────────────────────── */

/** Le préfixe de l'identifiant du fait d'offre · comme `produit.` pour les faits d'un produit épinglé. */
export const PREFIXE_FAIT_OFFRE = 'offre.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** La borne d'un texte du contrat (`TEXTE_MAX` du brief). */
const TEXTE_BRIEF_MAX = 12_000;

/** L'offre portée par le brief · son identifiant (ligne `adsmap_offers`) et son texte FIGÉ au choix. */
export interface OffreBrief { id: string; texte: string }

/** Le TEXTE d'une offre dans le brief · « Offre de la marque · Duo sérum · Remise · −20 % dès 2 achetés ». */
export function texteOffreBrief(o: Pick<OffreLue, 'intitule' | 'type' | 'conditions'>): string {
  return `Offre de la marque · ${o.intitule.trim()} · ${detailOffre(o)}`.slice(0, TEXTE_BRIEF_MAX);
}

/** L'offre choisie, prête pour le brief · `null` si l'identifiant n'est pas celui d'une ligne. */
export function offreBriefDepuis(o: Pick<OffreLue, 'id' | 'intitule' | 'type' | 'conditions'>): OffreBrief | null {
  return UUID.test(o.id) ? { id: o.id.toLowerCase(), texte: texteOffreBrief(o) } : null;
}

export const estFaitOffre = (f: { id: string }): boolean => f.id.startsWith(PREFIXE_FAIT_OFFRE);

/** Le FAIT DÉCLARÉ d'une offre · la marque le déclare, aucune source du projet à citer (comme un fait déclaré). */
export function faitOffre(o: OffreBrief): FaitBrief {
  return { id: `${PREFIXE_FAIT_OFFRE}${o.id}`, claim: o.texte.slice(0, TEXTE_BRIEF_MAX), sourceIds: [], kind: 'declared', confidence: 'high' };
}

/** Les faits du brief avec CETTE offre (ou sans offre) · les autres faits (hypothèse, produit, sources) restent tels quels. */
export function faitsAvecOffre(faits: readonly FaitBrief[], offre: OffreBrief | null): FaitBrief[] {
  return [...faits.filter((f) => !estFaitOffre(f)), ...(offre ? [faitOffre(offre)] : [])].slice(0, 100);
}

/**
 * L'offre d'un brief relu (ou de ses faits) · le PREMIER fait d'offre dont
 * l'identifiant est bien formé · `null` sans offre. Lecture tolérante · une
 * valeur qui n'a pas la forme d'une liste de faits ne porte pas d'offre.
 */
export function offreDuBrief(brief: unknown): OffreBrief | null {
  const faits = Array.isArray(brief) ? brief : brief && typeof brief === 'object' ? (brief as { facts?: unknown }).facts : null;
  if (!Array.isArray(faits)) return null;
  for (const f of faits) {
    if (!f || typeof f !== 'object') continue;
    const { id, claim } = f as { id?: unknown; claim?: unknown };
    if (typeof id !== 'string' || !id.startsWith(PREFIXE_FAIT_OFFRE)) continue;
    const brut = id.slice(PREFIXE_FAIT_OFFRE.length);
    if (UUID.test(brut)) return { id: brut.toLowerCase(), texte: typeof claim === 'string' ? claim : '' };
  }
  return null;
}
