import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { gte, sql } from 'drizzle-orm';
import {
  db, schema, reserverDepense, reglerDepense, annulerDepense, marquerAReconcilier, lireDepensesAReconcilier, type BaseDepense,
} from '@tiktrends/db';
import { anthropicFromEnv } from '@tiktrends/ai';
import { errorFamily } from './user-error';
import {
  checkBudget, costOfTokens, estimateCallCost, summarizeBudget, FIXED_COSTS, rienNaEteFacture,
  reservationTexteLiberable, VISION_JETONS_IMAGE_MAX, borneMaxAppel, causeIncertaine, vueReconciliation,
  REESSAIS_AUTOMATIQUES_PAYANTS, type FixedCostKind, type CauseAReconcilier, type VueReconciliation,
} from '@tiktrends/core';

/**
 * Barrière de dépense réelle · rien de payant ne part sans passer par ici.
 *
 * Le point important n'est pas le calcul, il est dans l'ENDROIT : le garde
 * s'installe sur le client Anthropic lui-même, pas à chaque appel. Le dépôt
 * compte trente-cinq points d'appel · un garde qu'il faut penser à invoquer
 * finit toujours par être oublié au trente-sixième, et c'est celui-là qui fait
 * la facture.
 *
 * Trois choix qui découlent de ce que ça protège :
 *
 *  - **Le plafond s'applique à TOUT LE MONDE.** Un compte fondateur a des
 *    crédits illimités · ses appels coûtent le même prix que les autres. Les
 *    crédits sont une comptabilité interne, les dollars sont réels.
 *  - **On refuse, on n'avertit pas.** Un avertissement qu'on peut ignorer n'est
 *    pas une barrière · c'est ce qui produit les factures qu'on découvre.
 *  - **En cas de doute, on refuse.** Base injoignable, modèle inconnu, tarif
 *    absent : le garde bloque. Laisser passer « parce qu'on ne sait pas » est
 *    exactement le comportement qu'on cherche à empêcher.
 */

/**
 * Plafond par défaut · le garde-fou en dur, celui qui s'applique quand
 * `AI_SPEND_CAP_USD` n'est pas posé (ou « ne prend pas » côté VPS). Relevé de
 * 10 à 50 $ sur demande explicite du propriétaire · c'est le chemin robuste
 * (déploiement par push), là où éditer `.env.deploy` ne prenait pas. Reste un
 * plafond DUR : au-delà, aucune requête payante ne part.
 */
const DEFAULT_CAP_USD = 50;
/** Fenêtre du plafond · glissante sur 30 jours, pas calendaire. */
const WINDOW_DAYS = 30;

export function spendCapUsd(): number {
  const raw = process.env.AI_SPEND_CAP_USD;
  if (raw === undefined || raw === '') return DEFAULT_CAP_USD;
  const n = Number(raw);
  // Une variable mal saisie ne doit pas ouvrir les vannes · on retombe sur le
  // défaut plutôt que sur l'infini.
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CAP_USD;
}

/** Somme dépensée sur la fenêtre · c'est `actual_usd` qui fait foi. */
export async function spentUsd(): Promise<number> {
  if (!db) return Number.POSITIVE_INFINITY;   // pas de compteur = pas d'appel
  const depuis = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${schema.aiSpend.actualUsd}), 0)` })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, depuis));
  return Number(row?.total ?? 0);
}

export interface SpendStatus { spentUsd: number; capUsd: number; summary: string; blocked: boolean }

export async function spendStatus(): Promise<SpendStatus> {
  const cap = spendCapUsd();
  const spent = await spentUsd().catch(() => Number.POSITIVE_INFINITY);
  const total = Number.isFinite(spent) ? spent : cap;
  return { spentUsd: total, capUsd: cap, summary: summarizeBudget({ spentUsd: total, capUsd: cap }), blocked: total >= cap };
}

/** Levée quand le plafond refuse un appel · message affichable tel quel. */
export class SpendBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'SpendBlockedError'; }
}

/* -------------------------------------------------------------------------- */
/*  Réservation commune (site + worker)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Réserve une dépense AVANT l'appel payant · rend l'identifiant de la ligne.
 *
 * ── Le défaut réparé (contre-recette du 8 octobre, P1) ───────────────────────
 *
 * Cette barrière lisait la somme (`spendStatus`) puis écrivait sa ligne dans
 * une AUTRE requête, sans verrou ; le worker, lui, réservait sous verrou dans
 * la même table. Les deux ne s'attendaient pas : plafond 0,20 $, déjà 0,08 $,
 * le site et le worker passaient chacun 0,08 $ ⇒ 0,24 $ (reproduit sur
 * PostgreSQL réel, `test/fa-course-mixte-pg.test.ts`). Une table commune n'est
 * pas un verrou commun.
 *
 * Désormais le site réserve par la MÊME fonction que le worker
 * (`reserverDepense`, `@tiktrends/db`) : même verrou consultatif, même somme,
 * même insertion, dans la même transaction. La décision reste `checkBudget`,
 * au plafond `spendCapUsd()` et sur la fenêtre `WINDOW_DAYS`.
 *
 * En cas de doute, on refuse : base absente ou injoignable ⇒ le même refus que
 * « plafond atteint », rien ne part (sans ligne, pas d'appel).
 */
async function reserverSousPlafond(ligne: {
  workspaceId: string; provider: string; model: string; action: string; usd: number;
}): Promise<string> {
  const cap = spendCapUsd();
  const refus = () => new SpendBlockedError(checkBudget({ spentUsd: cap, capUsd: cap }, ligne.usd).reason);
  if (!db) throw refus();
  let r: Awaited<ReturnType<typeof reserverDepense>>;
  try {
    r = await reserverDepense(db as unknown as BaseDepense, ligne, {
      depuis: new Date(Date.now() - WINDOW_DAYS * 86_400_000),
      decider: (depense) => checkBudget({ spentUsd: depense, capUsd: cap }, ligne.usd),
    });
  } catch (e) {
    console.error('[spend] réservation impossible', (e as Error).message);
    throw refus();
  }
  if (!r.ok) throw new SpendBlockedError(r.raison);
  return r.id;
}

/**
 * Règle une réservation au coût réel des jetons, une seule fois. Un règlement
 * impossible laisse la réservation (le maximum) comptée : le côté prudent.
 */
async function reglerAuReel(id: string, modele: string, entree: number, sortie: number): Promise<void> {
  if (!db) return;
  try {
    await reglerDepense(db as unknown as BaseDepense, id, { usd: costOfTokens(modele, entree, sortie), inputTokens: entree, outputTokens: sortie });
  } catch (e) {
    console.error('[spend] règlement impossible · la réservation reste comptée', (e as Error).message);
  }
}

/** Statut HTTP d'une erreur du client Anthropic · `undefined` hors réponse HTTP. */
function statutHttp(e: unknown): number | undefined {
  return e instanceof Anthropic.APIError ? e.status : undefined;
}

/* -------------------------------------------------------------------------- */
/*  Anthropic                                                                 */
/* -------------------------------------------------------------------------- */

type CreateParams = Anthropic.MessageCreateParams;

/**
 * Entrée d'un appel, telle que l'estimation la compte · les caractères du
 * texte (convertis en jetons par `estimateCallCost`, 3,5 caractères par jeton)
 * et le nombre d'images natives.
 *
 * ── Le défaut réparé (G-A, besoin F-D n° 2) ──────────────────────────────────
 *
 * Une image jointe (bloc `image`, octets en base64) comptait la longueur de
 * son base64 comme du texte. MESURÉ (`test/ga-estimation-vision.test.ts`,
 * `claude-sonnet-5`, `max_tokens` 4000) : image de 1 000 000 octets ⇒
 * 1 333 336 caractères de base64 ⇒ 1,203039 $ réservés, quand le fournisseur
 * facture l'image au plus 4 784 jetons (0,014352 $) ⇒ 0,074466 $ désormais.
 * Le plafond refusait à tort des appels vision qui tenaient largement.
 *
 * Désormais un bloc `image` compte sa BORNE de jetons, `VISION_JETONS_IMAGE_MAX`
 * (F-D, `packages/core/src/prompts/vision.ts`, source unique), quelle que soit
 * sa taille : le fournisseur réduit une image plus grande, la borne tient. Le
 * reste ne change pas : texte, système et outils comptés comme avant, et un
 * contenu sans image est mesuré exactement comme avant (même `JSON.stringify`).
 */
export function entreeAppel(p: CreateParams): { caracteres: number; images: number } {
  let images = 0;
  const contenu = (c: unknown): number => {
    if (typeof c === 'string') return c.length;
    if (!Array.isArray(c)) return JSON.stringify(c).length;
    const sansImage = c.filter((b) => (b as { type?: unknown } | null)?.type !== 'image');
    images += c.length - sansImage.length;
    return JSON.stringify(sansImage.length === c.length ? c : sansImage).length;
  };
  let n = typeof p.system === 'string' ? p.system.length : JSON.stringify(p.system ?? '').length;
  for (const m of p.messages ?? []) n += contenu(m.content);
  if (p.tools) n += JSON.stringify(p.tools).length;
  return { caracteres: n, images };
}

/**
 * Coût ESTIMÉ d'un appel · `estimateCallCost` (noyau, 3,5 caractères par
 * jeton) pour le texte et `max_tokens`, plus chaque image à sa borne de jetons
 * au tarif d'entrée. C'est l'ancienne réservation (G-A), gardée pour AFFICHER
 * un ordre de grandeur : MESURÉ (R3), ce n'est pas une borne.
 */
export function estimationAppel(p: CreateParams): number {
  const modele = String(p.model);
  const e = entreeAppel(p);
  const texte = estimateCallCost({ model: modele, promptChars: e.caracteres, maxTokens: Number(p.max_tokens ?? 1024) });
  if (!e.images) return texte;
  return Math.round((texte + costOfTokens(modele, e.images * VISION_JETONS_IMAGE_MAX, 0)) * 1e6) / 1e6;
}

/**
 * Coût MAXIMAL d'un appel, celui qu'on RÉSERVE · `borneMaxAppel` (noyau) :
 * entrée bornée en octets UTF-8 (un jeton couvre au moins un octet), cadres et
 * outils à leur marge documentée, chaque image à `VISION_JETONS_IMAGE_MAX`,
 * sortie à `max_tokens` entier.
 *
 * ── Le défaut réparé (contre-recette du 8 octobre, R3) ───────────────────────
 *
 * La réservation divisait les caractères par 3,5 : une estimation, dépassée
 * dès le texte français ordinaire (×1,02) et jusqu'à ×8,74 sur un texte
 * adverse (mesures dans `packages/core/src/depense-prudente.ts`). Le plafond
 * pouvait donc être percé par l'entrée. L'effet de la borne sur les appels les
 * plus gros du dépôt est mesuré par `test/r3-borne-mesure.test.ts`.
 */
export function coutMaximalAppel(p: CreateParams): number {
  return borneMaxAppel(p as unknown as Parameters<typeof borneMaxAppel>[0]);
}

/**
 * Client Anthropic sous plafond.
 *
 * `messages.create` est remplacé : on RÉSERVE le coût maximal de l'appel
 * (`coutMaximalAppel` : entrée bornée en octets UTF-8, `max_tokens` entier)
 * sous le verrou commun, AVANT l'envoi, SANS réessai automatique ; puis on
 * règle au coût réel des jetons, une fois. Le plafond refuse avant l'appel
 * quand le maximum ne tient pas. Un refus CERTAIN du fournisseur
 * (`reservationTexteLiberable`) rend la réservation ; une issue incertaine la
 * garde au maximum et la marque « à réconcilier » avec sa cause. Tout le reste
 * du client passe inchangé · on n'intercepte que la méthode qui coûte.
 */
/**
 * L'espace qui paie · OBLIGATOIRE (L0-B §4). Vingt-quatre appels l'omettaient,
 * et `ai_spend.workspace_id` restait nul · la génération des Pubs IA n'était
 * imputable à aucun espace. Le type l'exige désormais : un appel qui l'oublie
 * ne compile plus, et `sec-ai-spend-espace.test.ts` le vérifie au résultat
 * (ligne `ai_spend` écrite avec l'espace). Le montant et le plafond sont
 * inchangés · le plafond reste global.
 */
export interface ImputationDepense { workspaceId: string; action: string }

/**
 * Marque une réservation « à réconcilier » (R3) · jamais bloquant : un
 * marquage impossible laisse la ligne au maximum, ce qui reste le côté prudent.
 */
async function aReconcilier(id: string, cause: CauseAReconcilier): Promise<void> {
  if (!db) return;
  await marquerAReconcilier(db as unknown as BaseDepense, id, cause)
    .catch((x) => console.error('[spend] marquage à réconcilier impossible', (x as Error).message));
}

/** Nom et message d'une erreur, pour classer sa cause · jamais de clé (le SDK n'en met pas dans ses messages). */
const texteErreur = (e: unknown) => (e instanceof Error ? `${e.name} ${e.message} ${String((e as { cause?: unknown }).cause ?? '')}` : String(e ?? ''));

export function guardedAnthropic(opts: ImputationDepense): Anthropic | null {
  const client = anthropicFromEnv();
  if (!client) return null;

  const brut = client.messages.create.bind(client.messages);

  const garde = async (params: CreateParams, options?: unknown) => {
    const modele = String(params.model);
    const estime = coutMaximalAppel(params);

    // Réservation du MAXIMUM, sous le verrou commun, AVANT l'envoi.
    const id = await reserverSousPlafond({
      workspaceId: opts.workspaceId, provider: 'anthropic', model: modele, action: opts.action, usd: estime,
    });

    let res: unknown;
    try {
      // AUCUN réessai automatique (R3) : une option d'appel ne peut pas relever
      // `maxRetries` au-dessus de `REESSAIS_AUTOMATIQUES_PAYANTS` (0). Une
      // réservation couvre UNE tentative, jamais deux après une coupure ambiguë.
      const o = { ...((options as Record<string, unknown> | undefined) ?? {}), maxRetries: REESSAIS_AUTOMATIQUES_PAYANTS };
      res = await (brut as (p: CreateParams, o?: unknown) => Promise<unknown>)(params, o);
    } catch (e) {
      // Refus CERTAIN (400, 401, 403, 422) : rien n'est facturé, la réservation
      // est rendue. Tout autre échec (coupure, délai, 429, 5xx) peut suivre une
      // tentative facturée : elle reste au maximum ET se marque « à
      // réconcilier » avec sa cause (R3), sans libération automatique.
      if (db && reservationTexteLiberable(statutHttp(e))) {
        await annulerDepense(db as unknown as BaseDepense, id).catch((x) => console.error('[spend] libération impossible', (x as Error).message));
      } else {
        await aReconcilier(id, causeIncertaine({ statut: statutHttp(e) ?? null, texte: texteErreur(e) }));
      }
      throw e;
    }

    // ── Flux ────────────────────────────────────────────────────────────────
    //
    // Une conversation qui laisse l'écran muet huit secondes se lit comme une
    // panne. Le flux n'est donc pas un confort · mais il ne doit pas coûter
    // l'exactitude de la comptabilité, sans quoi le plafond fuirait par ce
    // chemin-là.
    //
    // Le maximum est déjà réservé. Les jetons d'entrée arrivent sur
    // `message_start`, ceux de sortie sur le `message_delta` final : le
    // règlement au réel n'a lieu que si ce dernier est arrivé. Un flux coupé
    // avant, ou jamais lu, garde la réservation (la sortie produite est
    // facturée, et on ne sait pas combien).
    if (params.stream) {
      const flux = res as AsyncIterable<unknown>;
      return (async function* () {
        let entree = 0;
        let sortie = 0;
        let final = false;
        try {
          for await (const ev of flux) {
            const e = ev as { type?: string; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number } };
            if (e.type === 'message_start') entree = e.message?.usage?.input_tokens ?? 0;
            if (e.type === 'message_delta' && typeof e.usage?.output_tokens === 'number') { sortie = e.usage.output_tokens; final = true; }
            yield ev;
          }
        } finally {
          if (final) await reglerAuReel(id, modele, entree, sortie);
          else await aReconcilier(id, 'flux_coupe');
        }
      })();
    }

    // Une réponse sans `usage` ne compte pas pour zéro : la réservation (le
    // maximum) reste, sinon le plafond fuit sur ce chemin-là.
    const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    if (usage && (typeof usage.input_tokens === 'number' || typeof usage.output_tokens === 'number')) {
      await reglerAuReel(id, modele, usage.input_tokens ?? 0, usage.output_tokens ?? 0);
    } else {
      await aReconcilier(id, 'usage_absent');
    }
    return res as Anthropic.Message;
  };

  // On remplace la méthode sur une copie du sous-objet · le client d'origine
  // reste intact pour qui l'utiliserait ailleurs.
  const messages = Object.create(client.messages) as typeof client.messages;
  (messages as { create: unknown }).create = garde;
  const proxy = Object.create(client) as Anthropic;
  (proxy as { messages: unknown }).messages = messages;
  return proxy;
}

/* -------------------------------------------------------------------------- */
/*  Coûts fixes (fal)                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Réserve une dépense à coût fixe · sous le verrou commun (`reserverSousPlafond`).
 *
 * Les générations d'image et de vidéo ne se comptent pas en jetons · on applique
 * un coût forfaitaire, pris haut. La vidéo est le poste qui peut faire déraper
 * une facture en quelques clics, d'où un forfait nettement supérieur.
 */
export async function guardFixedCost(
  kind: FixedCostKind, opts: ImputationDepense & { units?: number },
): Promise<string | null> {
  const cout = FIXED_COSTS[kind] * Math.max(1, Math.round(opts.units ?? 1));
  // On renvoie l'identifiant de la ligne · c'est ce qui rend la dépense
  // annulable quand l'appel qui suit est refusé sans rien produire.
  return reserverSousPlafond({ workspaceId: opts.workspaceId, provider: 'fal', model: kind, action: opts.action, usd: cout });
}

/**
 * Rend une dépense que le fournisseur n'a pas facturée.
 *
 * ── Ce que ça répare ─────────────────────────────────────────────────────────
 *
 * Le coût était compté AVANT l'appel — et il fallait qu'il le soit, sinon
 * douze images en vol passeraient toutes le même contrôle et dépasseraient le
 * plafond ensemble. Mais rien ne revenait en arrière quand l'appel était refusé
 * à la porte. Un modèle inconnu, une référence illisible, une clé morte :
 * 0,08 $ retenus, 0,16 $ avec le réessai, pour zéro image.
 *
 * Un plafond dur de 10 $ se vide ainsi en quelques lots ratés, et le produit se
 * verrouille sans avoir rien produit.
 *
 * ── Ce qu'on garde ───────────────────────────────────────────────────────────
 *
 * La ligne n'est pas supprimée · son `estimatedUsd` reste, seul `actualUsd`
 * tombe à zéro. La tentative demeure donc lisible dans le journal — « on a
 * essayé, ça n'a rien coûté » — alors qu'une suppression effacerait le fait
 * qu'on a essayé.
 *
 * La règle de décision vit dans le noyau (`rienNaEteFacture`) · elle s'y teste,
 * et le doute y est écrit une seule fois.
 */
export async function annuleCoutFixe(id: string | null, famille: string): Promise<boolean> {
  if (!id || !db || !rienNaEteFacture(famille)) return false;
  try {
    // Idempotent (`annulerDepense`) : une seconde annulation ne change rien.
    return await annulerDepense(db as unknown as BaseDepense, id);
  } catch (e) {
    // Ne rien rendre est le côté prudent de l'erreur · on le dit sans casser
    // l'action, qui vient déjà d'échouer pour une autre raison.
    console.error('[spend] annulation impossible', (e as Error).message);
    return false;
  }
}

/**
 * Exécute un appel payant sous le plafond, et rend la dépense s'il est refusé.
 *
 * ── Pourquoi un enveloppeur, et pas trois lignes à chaque endroit ────────────
 *
 * Le dépôt compte six points d'appel payants. « Penser à rendre la dépense »
 * est exactement le genre de consigne qu'on applique cinq fois sur six · et la
 * sixième est celle qui vide le plafond.
 *
 * Retenir puis rendre devient donc impossible à séparer : le seul moyen de
 * dépenser est de passer par ici, et passer par ici rend déjà.
 *
 * L'erreur est relancée telle quelle · l'appelant garde son propre traitement,
 * ses crédits à rembourser et son message à traduire. On ne s'occupe que des
 * dollars.
 */
export async function sousPlafond<T>(
  kind: FixedCostKind,
  opts: ImputationDepense & { units?: number },
  appel: () => Promise<T>,
): Promise<T> {
  const ligne = await guardFixedCost(kind, opts);
  try {
    return await appel();
  } catch (e) {
    await annuleCoutFixe(ligne, errorFamily(e));
    throw e;
  }
}

/**
 * Dépenses « à réconcilier » de la fenêtre (R3) · pour l'écran propriétaire.
 * Lecture seule ; la règle de présentation est pure (`vueReconciliation`).
 * Base absente ⇒ vue vide dite comme telle, jamais une erreur affichée.
 */
export async function depensesAReconcilier(limite = 200): Promise<VueReconciliation> {
  if (!db) return vueReconciliation([]);
  const depuis = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  return vueReconciliation(await lireDepensesAReconcilier(db as unknown as BaseDepense, depuis, limite));
}

/** Postes de dépense · dit OÙ part l'argent, pas seulement combien. */
export async function spendByAction(limit = 12): Promise<Array<{ action: string; usd: number; calls: number }>> {
  if (!db) return [];
  const depuis = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const rows = await db.select({
    action: schema.aiSpend.action,
    usd: sql<number>`coalesce(sum(${schema.aiSpend.actualUsd}), 0)`,
    calls: sql<number>`count(*)`,
  })
    .from(schema.aiSpend)
    .where(gte(schema.aiSpend.createdAt, depuis))
    .groupBy(schema.aiSpend.action)
    .orderBy(sql`sum(${schema.aiSpend.actualUsd}) desc`)
    .limit(limit);
  return rows.map((r) => ({ action: r.action, usd: Number(r.usd), calls: Number(r.calls) }));
}
