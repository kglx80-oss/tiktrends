/**
 * Dépense prudente · trois règles qui ferment les limites relevées par la
 * contre-recette du 8 octobre (R3) sur le plafond de dépense.
 *
 *  1. **Aucun réessai payant implicite.** Un client qui rejoue de lui-même une
 *     requête après une coupure ambiguë peut faire facturer deux, trois fois ce
 *     qu'une seule réservation couvre. Le SDK Anthropic rejoue par défaut deux
 *     fois (`maxRetries` 2) · il est désormais construit à 0, et un réessai
 *     n'est permis que s'il est PROUVÉ non facturable ou idempotent côté
 *     fournisseur (`reessaiPermis`).
 *  2. **Une issue incertaine se voit et se réconcilie.** La réservation reste
 *     au maximum (côté prudent), la ligne `ai_spend` porte la CAUSE, et une
 *     lecture la rend au propriétaire (`vueReconciliation`). Rien ne la libère
 *     automatiquement.
 *  3. **Une borne d'entrée qui en est une.** `estimateCallCost` divise les
 *     caractères par 3,5 : c'est une ESTIMATION, pas une borne (mesures
 *     ci-dessous). La réservation utilise `borneMaxAppel`, calculée en octets
 *     UTF-8.
 *
 * Pur : ni base, ni réseau, ni horloge.
 */

import { costOfTokens } from './spend-guard';
import { rienNaEteFacture } from './spend-refund';
import { VISION_JETONS_IMAGE_MAX } from './prompts/vision';

/* ═══════════════════════════ 1 · Réessais payants ═══════════════════════════ */

/**
 * Réessais AUTOMATIQUES d'un client payant · zéro. C'est la valeur que
 * `anthropicFromEnv` passe au SDK (`maxRetries`) et que `guardedAnthropic`
 * impose à chaque appel (une option d'appel ne peut pas la relever).
 *
 * Garde au RÉSULTAT : `apps/web/test/r3-reessai-anthropic.test.ts` monte un
 * faux serveur HTTP qui coupe la connexion après réception, et compte les
 * requêtes reçues par le VRAI client du SDK · exactement 1.
 */
export const REESSAIS_AUTOMATIQUES_PAYANTS = 0;

export interface IssueEchec {
  /** Famille d'échec (`errorFamily` du site, classée par `spend-refund.ts`). */
  famille: string;
  /**
   * Vrai seulement si rejouer ne peut PAS soumettre une seconde fois : même
   * requête, même identifiant chez le fournisseur (ex. relecture du statut
   * d'une file fal, soumission retrouvée par une clé d'idempotence).
   */
  idempotent: boolean;
}

/**
 * Un réessai d'une requête payante est-il permis ?
 *
 *  · idempotent côté fournisseur ⇒ oui (relire n'achète rien) ;
 *  · échec CERTAIN avant traitement (`rienNaEteFacture` : requête refusée,
 *    accès refusé, image illisible, adresse refusée, saturation 429, contenu
 *    refusé) ⇒ oui, rien n'a été facturé ;
 *  · tout le reste (délai, coupure réseau, 5xx, quota, réponse vide, inconnu)
 *    ⇒ NON : la première tentative a pu être facturée, la rejouer peut la
 *    faire payer deux fois pour une seule réservation.
 *
 * Une famille inconnue n'autorise rien : le doute se paie une fois, pas deux.
 */
export function reessaiPermis(e: IssueEchec): boolean {
  return e.idempotent === true || rienNaEteFacture(e.famille);
}

/* ═══════════════════════ 2 · Issue incertaine, réconciliation ════════════════ */

/**
 * Causes d'une ligne `ai_spend` « à réconcilier » · une issue où le
 * fournisseur a PU facturer sans qu'on sache combien. La réservation (le
 * maximum) reste comptée ; la cause est écrite sur la ligne pour qu'un humain
 * la rapproche de la facture.
 */
export const CAUSES_A_RECONCILIER = {
  coupure: 'connexion coupée ou réponse perdue après envoi',
  delai: 'délai dépassé · le fournisseur a pu terminer et facturer',
  saturation: 'refus 429 · une tentative antérieure a pu être facturée',
  service: 'erreur 5xx du fournisseur · le calcul a pu commencer',
  flux_coupe: 'flux interrompu avant le décompte final (message_delta)',
  usage_absent: 'réponse sans décompte de jetons',
  inconnue: 'échec non classé',
} as const;

export type CauseAReconcilier = keyof typeof CAUSES_A_RECONCILIER;

/**
 * La cause d'un échec INCERTAIN d'un appel texte. `statut` est le code HTTP
 * de l'erreur du client (absent hors réponse HTTP) ; `texte` est son nom et
 * son message. Pur : la classification ne dépend que de ces deux valeurs.
 */
export function causeIncertaine(e: { statut?: number | null; texte?: string | null }): CauseAReconcilier {
  const s = typeof e.statut === 'number' ? e.statut : null;
  if (s === 429) return 'saturation';
  if (s !== null && s >= 500) return 'service';
  if (s === 408) return 'delai';
  const t = (e.texte ?? '').toLowerCase();
  if (/timeout|timed out|etimedout|deadline|aborted|abort ?error/.test(t)) return 'delai';
  if (/connection|econnreset|socket|network|fetch failed|econnrefused|epipe|terminated|hang up/.test(t)) return 'coupure';
  return 'inconnue';
}

export interface LigneAReconcilier {
  id: string;
  createdAt: Date;
  provider: string;
  model: string | null;
  action: string;
  workspaceId: string | null;
  estimatedUsd: number;
  actualUsd: number;
  cause: string;
}

export interface VueReconciliation {
  lignes: Array<LigneAReconcilier & { causeLisible: string }>;
  /** Somme comptée au plafond pour ces lignes (le maximum réservé). */
  totalUsd: number;
  /** Phrase d'état · dit le nombre ET le montant, ou le silence. */
  resume: string;
}

const usd2 = (n: number) => `${n.toFixed(2).replace('.', ',')} $`;

/**
 * La lecture que l'écran propriétaire affiche · les plus récentes d'abord. Une
 * cause hors liste (écrite par une version future) reste lisible telle quelle.
 */
export function vueReconciliation(lignes: readonly LigneAReconcilier[]): VueReconciliation {
  const triees = [...lignes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const totalUsd = Math.round(triees.reduce((s, l) => s + Math.max(0, l.actualUsd), 0) * 1e6) / 1e6;
  const resume = triees.length === 0
    ? 'Aucune dépense à réconcilier.'
    : `${triees.length} dépense${triees.length > 1 ? 's' : ''} à réconcilier · ${usd2(totalUsd)} comptés au plafond au maximum, en attendant la facture.`;
  return {
    lignes: triees.map((l) => ({ ...l, causeLisible: (CAUSES_A_RECONCILIER as Record<string, string>)[l.cause] ?? l.cause })),
    totalUsd,
    resume,
  };
}

/* ═══════════════════════════ 3 · Borne d'entrée ═════════════════════════════ */

/**
 * ── L'hypothèse, et sa vérification ──────────────────────────────────────────
 *
 * Un tokenizer BPE au niveau de l'octet (ou SentencePiece avec repli sur
 * l'octet) part d'un vocabulaire de base de 256 octets et ne fait que FUSIONNER
 * des octets : chaque jeton couvre au moins un octet. Donc
 *
 *     jetons(texte) ≤ octets UTF-8(texte)
 *
 * et PAS ≤ caractères : un caractère fait jusqu'à 4 octets (emoji, CJK hors
 * plan de base), et une unité UTF-16 (`String.length`) jusqu'à 3.
 *
 * MESURÉ hors ligne, sans appel payant, avec le seul tokenizer Claude publié
 * (`@anthropic-ai/tokenizer` 0.0.4, vocabulaire historique ; celui des modèles
 * actuels n'est pas public · la propriété est structurelle, pas propre à un
 * vocabulaire) :
 *
 *   corpus                       car.    octets  jetons  car/3,5  jetons/octet  jetons/estim.
 *   cahier des charges (fr)     43 629   45 299  12 683  12 466   0,280         1,02
 *   pack 02-PROMPTS.json        49 718   50 853  14 732  14 206   0,290         1,04
 *   emojis                      18 000   38 000  22 000   5 143   0,579         4,28
 *   CJK                         18 000   54 000  24 000   5 143   0,444         4,67
 *   accents et « · »            39 000   81 000  42 000  11 143   0,519         3,77
 *   points de code dispersés    20 000   56 561  49 938   5 715   0,883         8,74
 *   caractères de contrôle       5 000    5 000   4 844   1 429   0,969         3,39
 *   base64                      40 000   40 000   5 003  11 429   0,125         0,44
 *
 * Lecture : l'estimation à 3,5 caractères par jeton est DÉPASSÉE dès le texte
 * français ordinaire (×1,02) et jusqu'à ×8,74 sur un texte adverse · ce n'est
 * pas une borne. Le rapport jetons/octet ne dépasse jamais 1 (max 0,969) : la
 * borne tient.
 *
 * ── Ce que la borne ajoute au texte ──────────────────────────────────────────
 *
 * Le fournisseur encadre la requête (rôles, séparateurs, jetons spéciaux) et,
 * quand des outils sont déclarés, ajoute un prompt système d'outils. Ces
 * ajouts ne sont pas mesurables sans clé (le compteur de jetons du
 * fournisseur exige une clé, ce lot n'en lit aucune) : ils sont pris d'après la
 * documentation, avec une marge ×2, et dits ici.
 *  · `JETONS_SYSTEME_OUTILS_MAX` · prompt d'outils documenté au plus 530 jetons
 *    (le plus élevé de la table publiée) · ×2 ⇒ 1 060 ;
 *  · `FACTEUR_RENDU_OUTILS` · les définitions sont rendues par le fournisseur
 *    dans un format qui n'est pas le JSON compact envoyé · ×2 sur leurs octets ;
 *  · `JETONS_CADRE_BLOC` · marqueur de rôle ≤ 16 octets plus jetons spéciaux
 *    par message ou bloc · ×2 ⇒ 32 ; `JETONS_CADRE_REQUETE` · 64 par requête.
 *  · image · `VISION_JETONS_IMAGE_MAX` (4 784), plafond documenté par image
 *    (le fournisseur réduit une image plus grande).
 */
/*
 * ── L'effet sur la réservation, MESURÉ (sans appel payant) ───────────────────
 *
 * Plus gros appels du dépôt, champs à leur longueur maximale (`slice` du code),
 * requête capturée avant envoi (`apps/web/test/r3-borne-mesure.test.ts`), au
 * tarif `claude-sonnet-5` :
 *
 *   appel                                         max_tokens  estimation  borne      ×
 *   Pubs IA · generateAdConcepts ×12 (fr)          6 600      0,111867 $  0,156963 $ 1,40
 *   Pubs IA · generateAdConcepts ×12 (emojis)      6 600      0,111156 $  0,176799 $ 1,59
 *   Pubs IA · analyzeCompetitor 14 000 car. (fr)   3 000      0,058563 $  0,104646 $ 1,79
 *   Pubs IA · analyzeCompetitor 14 000 car. (emo.) 3 000      0,058563 $  0,144978 $ 2,48
 *   Marque · generateBrandProfile 8 000 car.       3 000      0,054153 $  0,089742 $ 1,66
 *   Pubs IA · controlePubEntiere 2 images 1 Mo       700      0,013828 $  0,019304 $ 1,40
 *   Studios · quality.visual, 1 sortie (L6-B)      4 000          ·       0,089604 $   ·
 *   Studios · tâche au budget plein (24 000 « jetons » estimés = 84 000 unités
 *   UTF-16 de données, plus les consignes `brief.build` du pack ;
 *   `packages/core/test/r3-borne-entree.test.ts`) :
 *       texte français                              4 000      0,132000 $  0,355131 $ 2,69
 *       pire cas théorique (3 octets/unité)         4 000      0,132000 $  0,824910 $ 6,25
 *
 * Décision : la réservation passe à la borne. Le plus gros appel réel des Pubs
 * IA réserve 0,18 $ (0,35 % du plafond de 50 $) ; même le pire cas théorique
 * d'une tâche studio (0,82 $) reste sous 2 % du plafond. Le surcoût de réservation est
 * rendu au règlement (coût réel des jetons) : aucun appel normal n'est bloqué,
 * et l'entrée ne peut plus percer le plafond.
 */
export const JETONS_CADRE_REQUETE = 64;
export const JETONS_CADRE_BLOC = 32;
export const JETONS_SYSTEME_OUTILS_MAX = 1_060;
export const FACTEUR_RENDU_OUTILS = 2;

/** Octets UTF-8 d'une chaîne JavaScript · paires de substitution comprises, sans `Buffer`. */
export function octetsUtf8(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3; // BMP, ou demi-paire isolée (encodée U+FFFD, 3 octets)
  }
  return n;
}

/** Ce que la borne compte dans une requête. */
export interface EntreeMesuree {
  /** Octets UTF-8 du texte (blocs texte, chaînes, autres blocs en JSON). */
  octets: number;
  images: number;
  /** Messages, blocs système et blocs de contenu · chacun paie son cadre. */
  blocs: number;
  /** Octets du JSON des outils déclarés (0 sans outil). */
  octetsOutils: number;
}

const json = (x: unknown) => { try { return JSON.stringify(x) ?? ''; } catch { return ''; } };

function mesurerContenu(c: unknown, m: EntreeMesuree): void {
  if (typeof c === 'string') { m.octets += octetsUtf8(c); m.blocs += 1; return; }
  if (!Array.isArray(c)) { m.octets += octetsUtf8(json(c)); m.blocs += 1; return; }
  for (const b of c) {
    m.blocs += 1;
    const t = (b as { type?: unknown } | null)?.type;
    if (t === 'image') { m.images += 1; continue; }
    const texte = (b as { text?: unknown } | null)?.text;
    // Bloc texte : son texte. Tout autre bloc (outil, résultat, document) :
    // son JSON entier, qui contient tout ce qu'il transporte.
    m.octets += octetsUtf8(t === 'text' && typeof texte === 'string' ? texte : json(b));
  }
}

/** Mesure une requête Messages (forme de l'API, sans dépendre du SDK). */
export function mesurerRequete(p: { system?: unknown; messages?: unknown; tools?: unknown }): EntreeMesuree {
  const m: EntreeMesuree = { octets: 0, images: 0, blocs: 0, octetsOutils: 0 };
  if (p.system !== undefined && p.system !== null && p.system !== '') mesurerContenu(p.system, m);
  for (const msg of Array.isArray(p.messages) ? p.messages : []) {
    m.blocs += 1;
    mesurerContenu((msg as { content?: unknown } | null)?.content ?? '', m);
  }
  if (Array.isArray(p.tools) && p.tools.length > 0) m.octetsOutils = octetsUtf8(json(p.tools));
  return m;
}

/** Jetons d'entrée AU PLUS d'une requête mesurée. */
export function borneJetonsEntree(m: EntreeMesuree): number {
  const outils = m.octetsOutils > 0 ? JETONS_SYSTEME_OUTILS_MAX + FACTEUR_RENDU_OUTILS * m.octetsOutils : 0;
  return JETONS_CADRE_REQUETE + m.blocs * JETONS_CADRE_BLOC + m.octets + m.images * VISION_JETONS_IMAGE_MAX + outils;
}

export interface RequeteChiffrable {
  model: string;
  max_tokens?: number | null;
  system?: unknown;
  messages?: unknown;
  tools?: unknown;
}

/**
 * Coût MAXIMAL d'un appel · ce qu'on RÉSERVE. Entrée à sa borne (octets UTF-8,
 * cadres, outils, images à leur plafond), sortie à `max_tokens` entier, au
 * tarif du modèle (un modèle inconnu est présumé cher, `rateFor`).
 */
export function borneMaxAppel(p: RequeteChiffrable): number {
  return costOfTokens(String(p.model), borneJetonsEntree(mesurerRequete(p)), Math.max(0, Number(p.max_tokens ?? 1024)));
}

/* ════════════════════ 4 · Nature d'un montant affiché ════════════════════ */

/**
 * Un montant de devis est une BORNE (on prouve que la dépense ne la dépasse
 * pas : prix fixe connu, ou borne en octets appliquée à l'exécution) ou une
 * ESTIMATION (rien ne l'empêche d'être dépassée). Une ligne sans nature dite
 * est une estimation : ne pas savoir n'est pas savoir borner.
 */
export type NatureCout = 'borne' | 'estimation';

export interface QualificationTotal {
  nature: NatureCout;
  /** « maximum », ou « estimation · maximum non garanti ». */
  libelle: string;
  /** Pourquoi ce n'est pas un maximum · `null` quand c'en est un. */
  raison: string | null;
}

export const LIBELLE_TOTAL_BORNE = 'maximum';
export const LIBELLE_TOTAL_ESTIME = 'estimation · maximum non garanti';

/**
 * Le total ne dit « maximum » que si TOUTES ses lignes sont des bornes. Sinon
 * il dit « estimation · maximum non garanti », et nomme les lignes en cause.
 */
export function qualifierTotal(lignes: ReadonlyArray<{ nom: string; natureCout?: unknown; motifEstimation?: string | null }>): QualificationTotal {
  const estimees = lignes.filter((l) => l.natureCout !== 'borne');
  if (lignes.length > 0 && estimees.length === 0) return { nature: 'borne', libelle: LIBELLE_TOTAL_BORNE, raison: null };
  const motifs = [...new Set(estimees.map((l) => l.motifEstimation ?? 'nature du coût non établie'))];
  const noms = estimees.map((l) => l.nom);
  const raison = lignes.length === 0
    ? 'aucune ligne chiffrée'
    : `${noms.slice(0, 3).join(', ')}${noms.length > 3 ? ` et ${noms.length - 3} autre${noms.length > 4 ? 's' : ''}` : ''} · ${motifs.join(' ; ')}`;
  return { nature: 'estimation', libelle: LIBELLE_TOTAL_ESTIME, raison };
}

/* ═══════════════ 5 · Borne d'une requête compilée (studios) ═══════════════ */

/**
 * La requête Messages que l'adaptateur réel construit à partir d'une requête
 * compilée (`apps/web/lib/studios/prompts/adaptateur.ts`) : messages système
 * en blocs texte, images natives d'abord dans le PREMIER message utilisateur,
 * puis son texte. Les octets d'image ne comptent pas (borne par image) : un
 * bloc `{ type: 'image' }` suffit à la mesure.
 */
export function requeteDepuisMessagesCompiles(a: {
  modele: string;
  messages: ReadonlyArray<{ role: string; contenu: string }>;
  images: number;
  maxJetonsSortie: number;
}): RequeteChiffrable {
  const system = a.messages.filter((m) => m.role === 'system').map((m) => ({ type: 'text', text: m.contenu }));
  const users = a.messages.filter((m) => m.role === 'user').map((m, i) => ({
    role: 'user',
    content: i === 0 && a.images > 0
      ? [...Array.from({ length: a.images }, () => ({ type: 'image' })), { type: 'text', text: m.contenu }]
      : m.contenu,
  }));
  return { model: a.modele, max_tokens: a.maxJetonsSortie, system, messages: users };
}

/**
 * Une requête dépasse-t-elle le montant APPROUVÉ ? Rend le motif du refus, ou
 * `null`. Comparaison en micro-dollars entiers, borne arrondie au supérieur :
 * c'est ce refus, appliqué AVANT l'appel, qui fait d'une ligne de devis une
 * borne et non une estimation.
 */
export function depasseMontantApprouve(borneUsd: number, approuveMicros: number): string | null {
  const borne = Math.ceil(borneUsd * 1_000_000 - 1e-6);
  if (Number.isFinite(borne) && Number.isFinite(approuveMicros) && borne <= approuveMicros) return null;
  return `la requête peut coûter jusqu’à ${(borne / 1e6).toFixed(3).replace('.', ',')} $, au-delà des ${(approuveMicros / 1e6).toFixed(3).replace('.', ',')} $ approuvés au devis`;
}

/* ───────────── Annonce d'un appel texte avant le clic (raccord vague 7) ───── */

/**
 * Coût d'un appel TEXTE annoncé avant le clic, dans les écrans Studios.
 *
 * Contre-recette du 8 octobre sur 0f6f836 : « devis présenté comme estimation
 * sauf borne prouvée ». Le montant affiché (`coutMaximalTexte`,
 * `plafondPropositionUsd`) compte l'entrée à 3,5 caractères par jeton : c'est
 * une ESTIMATION. Mesuré plus haut, une tâche au budget plein peut réserver
 * 0,355 $ (texte français) à 0,825 $ (pire cas) pour 0,132 $ annoncés. Il ne
 * se dit donc jamais « au plus ». Ce qui EST garanti : la borne exacte de la
 * requête réelle est réservée avant l'envoi sous le plafond commun, et réglée
 * au coût réel ensuite.
 */
export function libelleCoutTexteEstime(usd: number): string {
  // Arrondi au centime SUPÉRIEUR (côté prudent), comme les autres montants annoncés.
  return `environ ${(Math.ceil(usd * 100 - 1e-9) / 100).toFixed(2).replace('.', ',')} $ (estimation)`;
}
export const NOTE_BORNE_TEXTE = 'borne exacte réservée avant l’envoi, sous le plafond';

/* ═════════════ 6 · Contrôle visuel · reprise, exclusion, issue incertaine (E2) ═════════════ */

/**
 * ── Le défaut réparé (Codex/propriétaire, 9 octobre, avant l'essai réel) ─────
 *
 * « Si l'image est déjà produite après une interruption, reprends uniquement
 * le contrôle approuvé qui manque. Aucune seconde génération ni double
 * facturation. Un résultat incertain doit être réconcilié avant toute
 * relance. » La garde du contrôle visuel ne lisait que le statut qualité :
 * deux clics simultanés sur un média `pending` pouvaient lancer deux
 * contrôles payants, et une issue incertaine ne laissait aucune trace sur le
 * job.
 *
 * Désormais un MARQUEUR est posé sur le job (`result.controleVision`) par une
 * écriture conditionnelle atomique AVANT l'appel : un seul lancement le prend,
 * l'autre lit « engagé » et n'appelle rien. Après l'appel, le marqueur dit
 * l'issue : `conclu` (réponse reçue, ou refus certain : rien de facturé) ou
 * `incertain` (la requête a pu être facturée sans qu'on sache combien). Ces
 * règles sont pures ; l'écriture vit dans `apps/web/lib/studios/produit/qualite.ts`.
 */

/** Clé du marqueur dans `studio_jobs.result` · ajout seul, le reste du résultat n'est jamais réécrit. */
export const CLE_MARQUEUR_CONTROLE_VISION = 'controleVision';

export type MarqueurControleVision =
  | { etat: 'engage'; le: string; trace: string }
  | { etat: 'conclu'; le: string; fin: string; trace: string }
  | { etat: 'incertain'; le: string; fin: string; trace: string; cause: string };

/**
 * Le marqueur du job · `null` s'il n'y en a pas, `'illisible'` s'il y a QUELQUE
 * CHOSE qu'on ne sait pas lire (traité comme engagé : le doute ne relance rien).
 */
export function lireMarqueurControleVision(result: unknown): MarqueurControleVision | 'illisible' | null {
  if (result === null || typeof result !== 'object') return null;
  const m = (result as Record<string, unknown>)[CLE_MARQUEUR_CONTROLE_VISION];
  if (m === undefined || m === null) return null;
  if (typeof m !== 'object') return 'illisible';
  const o = m as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : null);
  const le = s('le'); const trace = s('trace'); const fin = s('fin');
  if (!le || !trace) return 'illisible';
  if (o.etat === 'engage') return { etat: 'engage', le, trace };
  if (o.etat === 'conclu' && fin) return { etat: 'conclu', le, fin, trace };
  if (o.etat === 'incertain' && fin) return { etat: 'incertain', le, fin, trace, cause: s('cause') ?? 'inconnue' };
  return 'illisible';
}

export type MotifRefusControleVision = 'hors_devis' | 'incertain' | 'deja_tranche' | 'deja_controle' | 'engage';

export type DecisionControleVision =
  | { lancer: true; reprise?: true }
  | { lancer: false; motif: MotifRefusControleVision };

/**
 * Le contrôle visuel d'un job peut-il PARTIR (appel payant) ? Dans l'ordre :
 *
 *  1. aucune ligne « contrôle visuel » au devis approuvé ⇒ `hors_devis` ;
 *  2. un contrôle précédent à l'issue INCERTAINE ⇒ `incertain` (à réconcilier
 *     avant toute relance, même si le média a été tranché depuis) ;
 *  3. statut qualité déjà tranché ⇒ `deja_tranche` (aucun appel) ;
 *  4. un contrôle CONCLU dont le verdict n'a pas été enregistré ⇒
 *     `deja_controle` (il a été payé : on ne le rachète pas) ;
 *  5. un contrôle ENGAGÉ (en cours ailleurs, ou interrompu sans issue
 *     écrite), ou un marqueur illisible ⇒ `engage` ;
 *  6. sinon ⇒ on lance, et SEULEMENT le contrôle (jamais une génération).
 *
 * R5 · une issue incertaine dont TOUTES les lignes de dépense sont
 * réconciliées avec la facture (`incertainReconcilie`, calculé par
 * `controleIncertainReconcilie`) n'est plus incertaine : si le média n'a pas
 * été tranché par un humain depuis (qualité `pending`, ou `requires_review`
 * laissée par ce contrôle sans verdict), le contrôle peut REPARTIR
 * (`reprise`) ; tranché depuis ⇒ `deja_tranche`.
 *
 * Le job non terminé n'est pas tranché ici : sans média, l'appelant refuse
 * avant de prendre le marqueur (aucun appel possible).
 */
export function decisionControleVision(e: {
  visionApprouvee: boolean;
  qualite: string;
  marqueur: MarqueurControleVision | 'illisible' | null;
  /** R5 · toutes les lignes de dépense du contrôle incertain sont réconciliées. */
  incertainReconcilie?: boolean;
}): DecisionControleVision {
  if (!e.visionApprouvee) return { lancer: false, motif: 'hors_devis' };
  const m = e.marqueur;
  if (m !== null && m !== 'illisible' && m.etat === 'incertain') {
    if (e.incertainReconcilie !== true) return { lancer: false, motif: 'incertain' };
    if (e.qualite === 'pending' || e.qualite === 'requires_review') return { lancer: true, reprise: true };
    return { lancer: false, motif: 'deja_tranche' };
  }
  if (e.qualite !== 'pending') return { lancer: false, motif: 'deja_tranche' };
  if (m !== null && m !== 'illisible' && m.etat === 'conclu') return { lancer: false, motif: 'deja_controle' };
  if (m !== null) return { lancer: false, motif: 'engage' };
  return { lancer: true };
}

export type IssueEchecAppel = 'avant_envoi' | 'refus_certain' | 'incertaine';

/**
 * L'issue d'un appel texte qui a ÉCHOUÉ, vue de l'appelant :
 *  · `avant_envoi` · refusé avant de partir (plafond, borne approuvée
 *    dépassée, pièces refusées) : aucune ligne `ai_spend`, rien de facturé ;
 *  · `refus_certain` · le fournisseur a refusé à la porte (`refusCertain`,
 *    calculé par l'appelant avec `reservationTexteLiberable`) : la
 *    réservation est rendue, rien de facturé ;
 *  · `incertaine` · tout le reste : la requête a pu être facturée, la ligne
 *    reste au maximum, marquée à réconcilier (`guardedAnthropic`).
 */
export function issueEchecAppel(e: { nom: string | null | undefined; refusCertain: boolean }): IssueEchecAppel {
  if (e.nom === 'SpendBlockedError' || e.nom === 'PiecesInvalides') return 'avant_envoi';
  if (e.refusCertain) return 'refus_certain';
  return 'incertaine';
}

export interface LigneDepenseLiee {
  id: string;
  createdAt: Date;
  actualUsd: number;
  cause: string | null;
}

const usd4v = (n: number) => `${n.toFixed(4).replace('.', ',')} $`;

/**
 * Ce qu'on dit quand un contrôle précédent est à l'issue incertaine · QUOI
 * réconcilier (les lignes de dépense nées pendant ce contrôle, leur montant
 * compté au maximum, leur cause) et COMMENT (rapprochement avec l'usage
 * facturé par le fournisseur, aucune relance automatique, relecture humaine).
 */
export function messageControleIncertain(m: { le: string; fin?: string | null; cause?: string | null }, lignes: readonly LigneDepenseLiee[]): string {
  const cause = m.cause ? ((CAUSES_A_RECONCILIER as Record<string, string>)[m.cause] ?? m.cause) : 'issue non écrite (contrôle interrompu)';
  const quoi = lignes.length
    ? `Ligne${lignes.length > 1 ? 's' : ''} de dépense à réconcilier · ${lignes.map((l) => `${l.id} (${usd4v(l.actualUsd)} comptés au maximum${l.cause ? `, ${(CAUSES_A_RECONCILIER as Record<string, string>)[l.cause] ?? l.cause}` : ''})`).join(' ; ')}.`
    : 'Aucune ligne de dépense retrouvée pour cette fenêtre · vérifie quand même l’usage du fournisseur sur cette période.';
  return [
    `Contrôle visuel précédent à l’issue incertaine (engagé le ${m.le}${m.fin ? `, terminé le ${m.fin}` : ''} · ${cause}).`,
    quoi,
    'Comment · compare ce montant à l’usage facturé par le fournisseur de texte sur cette période, puis note l’écart ; tant que ce n’est pas fait, aucun nouveau contrôle payant n’est lancé pour ce média.',
    'Relis le média toi-même (composant par composant) : la relecture humaine reste ouverte.',
  ].join(' ');
}

/* ═════════════════ 7 · Budget d'essai cumulatif (E2, 9 octobre) ═════════════════ */

/**
 * « J'autorise 15 $ maximum au total pour tous les tests nécessaires au
 * chantier TikTrends, tous fournisseurs, étapes et relances confondus. Ce
 * plafond remplace la précédente limite de 1 $ : ce n'est pas 15 $ par test
 * ou par session. Déduis toute dépense déjà engagée et conserve les
 * réservations dont le coût reste incertain. Aucune recharge ni dépassement
 * autorisé. » (propriétaire, 9 octobre)
 */
export const BUDGET_ESSAIS_TOTAL_USD_MICROS = 15_000_000;

export type EtatLigneEssai = 'reglee' | 'prix_fixe' | 'rendue' | 'a_reconcilier' | 'reservee_sans_issue';

/**
 * Une ligne `ai_spend` vue par le budget d'essai · ce qui est RÉGLÉ et ce qui
 * reste INCERTAIN (compté au maximum réservé, jamais libéré ici) :
 *  · `a_reconcilier` (cause écrite) · incertain, au montant réservé ;
 *  · montant nul · `rendue`, 0 ;
 *  · jetons écrits · `reglee`, au coût réel ;
 *  · fournisseur à prix fixe (fal…) · `prix_fixe`, réglé au prix fixe ;
 *  · texte réservé sans règlement ni cause (processus interrompu pendant
 *    l'appel) · `reservee_sans_issue`, incertain au maximum.
 */
export function classerLigneEssai(l: {
  provider: string; actualUsd: number; inputTokens: number | null; outputTokens: number | null; reconcileReason: string | null;
}): { etat: EtatLigneEssai; regleMicros: number; incertainMicros: number } {
  const micros = Math.max(0, Math.round(Number(l.actualUsd) * 1_000_000));
  if (l.reconcileReason) return { etat: 'a_reconcilier', regleMicros: 0, incertainMicros: micros };
  if (micros === 0) return { etat: 'rendue', regleMicros: 0, incertainMicros: 0 };
  if (l.inputTokens !== null || l.outputTokens !== null) return { etat: 'reglee', regleMicros: micros, incertainMicros: 0 };
  if (l.provider !== 'anthropic') return { etat: 'prix_fixe', regleMicros: micros, incertainMicros: 0 };
  return { etat: 'reservee_sans_issue', regleMicros: 0, incertainMicros: micros };
}

export interface BilanBudgetEssai {
  autoriseMicros: number;
  /** Dépenses antérieures saisies par le propriétaire (factures), hors base. */
  anterieuresMicros: number;
  regleMicros: number;
  incertainMicros: number;
  /** autorisé − antérieures − réglé − incertain, jamais négatif. */
  restantMicros: number;
  /** Vrai si le cumul dépasse déjà l'autorisation (restant 0, et le dire). */
  depasse: boolean;
}

export function bilanBudgetEssai(e: {
  autoriseMicros: number; anterieuresMicros: number; lignes: ReadonlyArray<{ regleMicros: number; incertainMicros: number }>;
}): BilanBudgetEssai {
  const regleMicros = e.lignes.reduce((s, l) => s + Math.max(0, l.regleMicros), 0);
  const incertainMicros = e.lignes.reduce((s, l) => s + Math.max(0, l.incertainMicros), 0);
  const brut = e.autoriseMicros - Math.max(0, e.anterieuresMicros) - regleMicros - incertainMicros;
  return { autoriseMicros: e.autoriseMicros, anterieuresMicros: Math.max(0, e.anterieuresMicros), regleMicros, incertainMicros, restantMicros: Math.max(0, brut), depasse: brut < 0 };
}

const usd2v = (micros: number) => `${(micros / 1_000_000).toFixed(2).replace('.', ',')} $`;

/**
 * Une dépense de `reservationMicros` (la RÉSERVATION MAXIMALE du parcours,
 * jamais l'estimation) peut-elle partir ? `antérieures + réglé + incertain +
 * réservation ≤ autorisé`, sinon refus, avant tout appel.
 */
export function decisionDepenseEssai(b: BilanBudgetEssai, reservationMicros: number): { ok: true; resteApresMicros: number } | { ok: false; message: string } {
  if (!Number.isFinite(reservationMicros) || reservationMicros <= 0) return { ok: false, message: 'Réservation maximale absente ou nulle · rien ne part sans montant borné.' };
  const engage = b.anterieuresMicros + b.regleMicros + b.incertainMicros;
  if (engage + reservationMicros > b.autoriseMicros) {
    return { ok: false, message: `Budget d’essai insuffisant · autorisé ${usd2v(b.autoriseMicros)}, déjà engagé ${usd2v(engage)} (antérieur ${usd2v(b.anterieuresMicros)}, réglé ${usd2v(b.regleMicros)}, incertain conservé ${usd2v(b.incertainMicros)}), reste ${usd2v(b.restantMicros)} < réservation maximale ${usd2v(reservationMicros)} · rien n’est lancé.` };
  }
  return { ok: true, resteApresMicros: b.autoriseMicros - engage - reservationMicros };
}
