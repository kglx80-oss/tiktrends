/**
 * ADSMAP · quand la lecture paginée de l'API Graph de Meta est COMPLÈTE, et
 * quand elle ne l'est pas.
 *
 * ── Le défaut que ce module ferme ───────────────────────────────────────────
 *
 * `graphAll` (`packages/integrations/src/meta-daily.ts`) suivait la pagination
 * sur 25 pages au plus, puis rendait ce qu'il avait lu comme si c'était tout.
 * Il s'arrêtait aussi, sans rien dire, sur une page qui annonçait une suite
 * (`paging.next`) sans curseur pour la lire. La synchro écrivait alors un jeu
 * partiel, datait la mesure (`brands.adsmap_synced_at`) et journalisait une
 * remontée RÉUSSIE · les verdicts se calculaient sur des journées manquantes et
 * aucun écran ne le disait.
 *
 * 25 pages × 500 lignes = 12 500 lignes. Une ligne d'insights vaut une annonce
 * un jour (`level: ad`, `time_increment: 1`) · sur la fenêtre de 121 jours,
 * il suffisait de 104 annonces diffusées chaque jour pour la dépasser. Le
 * chiffre 25 n'était dérivé de rien.
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 *
 *  - pas de `paging.next` · la lecture est finie ;
 *  - un `paging.next` · la suite se lit par le curseur `cursors.after`, sinon
 *    par le paramètre de suite que porte l'URL `next` (`after`, `offset`) ·
 *    l'URL n'est JAMAIS suivie telle quelle, elle porte un jeton · on n'en
 *    garde que ce paramètre, avec notre propre jeton. `__paging_token` n'est
 *    pas repris · il ne vaut qu'accompagné des `since` / `until` de la page
 *    suivante, et seul il redemanderait la même page jusqu'à la borne ;
 *  - un `paging.next` qui n'offre aucun paramètre de suite · INCOMPLÈTE
 *    (`curseur_absent`) · on ne fait pas comme si la suite n'existait pas ;
 *  - un `paging.next` alors que la borne de pages est atteinte · INCOMPLÈTE
 *    (`borne`) ;
 *  - une page en échec PASSAGER (limite d'appels, réseau, 5xx, corps coupé)
 *    se redemande, la même page, avec une attente croissante
 *    (`reprisePageMeta`) · jamais sur une erreur de jeton ou de droits, ni sur
 *    « reduce the amount of data » (code 1, la même requête échouera encore) ;
 *  - une lecture qui dépasse sa durée maximale (`DUREE_MAX_LECTURE_META_MS`)
 *    · INCOMPLÈTE (`duree`).
 *
 * Une lecture incomplète FAIT ÉCHOUER la synchro de la marque, avant toute
 * écriture · les mesures précédentes restent en place, la raison est
 * journalisée et dite à l'écran (Connexions, Importer, bouton « Mesurer
 * maintenant »). Un jeu partiel n'est jamais écrit.
 *
 * ── D'où vient la borne · le volume légitime, puis la mémoire ───────────────
 *
 * Elle n'est qu'un filet · la justesse ne dépend pas d'elle, puisque la
 * dépasser se DIT au lieu de tronquer. Deux plafonds, le plus bas gagne.
 *
 * 1 · Le plus gros volume qu'une lecture légitime peut rendre :
 *
 *   annonces max d'un compte × jours de la fenêtre / taille de page
 *   = 5 000 × 121 / 500 = 1 210 pages (605 000 lignes)
 *
 *  - 500 · la taille de page DEMANDÉE (`limit`), lue par `graphAll` ;
 *  - 121 · `FENETRE_SYNCHRO_JOURS` (120) + 1, les deux bornes de `time_range`
 *    étant inclusives · la synchro lit cette constante ;
 *  - 5 000 · le plafond d'annonces non supprimées d'un compte ordinaire, tel
 *    qu'il est relayé (guides annonceurs) · la documentation Meta n'est pas
 *    joignable depuis la session de développement, le chiffre n'y a pas été
 *    relu.
 *
 * 2 · La mémoire du serveur web, où tourne la synchro. Les lignes lues restent
 *     en mémoire jusqu'à l'écriture. Mesuré (Node 22.23, `--expose-gc`, tas
 *     retenu après `gc()`, 50 000 lignes d'insights réalistes · 20 actions,
 *     8 valeurs, 6 compteurs vidéo, noms d'annonce et de campagne longs,
 *     ~2,4 Ko de JSON par ligne, mesures répétées identiques à l’octet) :
 *
 *     | ce qui est retenu                              | octets / ligne |
 *     | ---------------------------------------------- | -------------- |
 *     | ligne BRUTE seule                              | 3 869          |
 *     | ligne convertie seule                          | 550            |
 *     | `metaDailySync` de main, au plus fort (brutes)  | 3 748          |
 *     | `metaDailySync` page par page, au plus fort     | 588            |
 *
 *     (« au plus fort » · tas relevé après `gc()` à chaque requête d'un faux
 *     `fetch` de 100 pages de 500 lignes, page en cours comprise.)
 *
 *     À 1 210 pages · 2,34 Go en brut (au-delà du tas par défaut · « heap out
 *     of memory » qui fait tomber tout le serveur web, sans `NODE_OPTIONS` ni
 *     limite dans `Dockerfile.web`), 333 Mo convertis · encore trop pour un
 *     passage de nuit dans le processus qui sert les écrans.
 *
 *     Le tas par défaut de Node 22 vaut la moitié de la mémoire physique
 *     (mesuré · 8 240 Mo de tas pour 16 088 Mo, rapport 1,95). Sur le plus
 *     petit serveur plausible (2 Go) · ~1 Go de tas. UNE lecture en garde au
 *     plus un huitième · 128 Mio / 550 o = 244 032 lignes = 488 pages. Marge
 *     prise · **400 pages** (200 000 lignes, ~118 Mo au plus fort, mesuré à
 *     588 o) · soit 1 652 annonces diffusées chaque jour des 121, ou 4 000
 *     annonces sur 50 jours. Le même volume en brut · ~750 Mo.
 *
 *     Le budget vaut pour UNE lecture. Plusieurs peuvent tourner en même
 *     temps dans le même processus (« Mesurer maintenant » sur deux marques,
 *     ou pendant la remontée de nuit) · chacune a le sien, rien ne les
 *     plafonne ensemble · huit lectures à la borne prendraient le tas entier.
 *
 * Au-delà, la synchro échoue en le disant · un tel volume demande une lecture
 * par tranches de dates, qui n'existe pas encore · la phrase envoie au support
 * sans rien promettre de plus.
 *
 * Les ensembles (`/adsets`, une ligne par ensemble) passent sous la même borne ·
 * leur volume est inférieur d'un facteur 121 à celui des insights.
 *
 * Pur · ni base, ni réseau, ni horloge.
 */

/** La taille de page demandée à l'API Graph (`limit`). */
export const TAILLE_PAGE_META = 500;

/** Au-delà, on ne redemande pas l'historique : les lots anciens sont clos. Lu par la synchro (`adsmap-sync.ts`). */
export const FENETRE_SYNCHRO_JOURS = 120;

/** Annonces non supprimées d'un compte publicitaire ordinaire · chiffre relayé, voir l'en-tête. */
export const ANNONCES_MAX_COMPTE_META = 5_000;

/** Plafond 1 · le volume légitime · ⌈5 000 × 121 / 500⌉ = 1 210 pages. */
export const PAGES_VOLUME_LEGITIME_META = Math.ceil((ANNONCES_MAX_COMPTE_META * (FENETRE_SYNCHRO_JOURS + 1)) / TAILLE_PAGE_META);

/** Tas retenu par ligne d'insights convertie · MESURÉ, voir le tableau de l'en-tête. */
export const OCTETS_PAR_LIGNE_CONVERTIE = 550;
/** Tas retenu par ligne d'insights brute · MESURÉ · ce que l'accumulation brute coûtait. */
export const OCTETS_PAR_LIGNE_BRUTE = 3_869;
/** Ce que la lecture a le droit de retenir · un huitième du tas d'un serveur de 2 Go (~1 Go), voir l'en-tête. */
export const BUDGET_MEMOIRE_LECTURE_OCTETS = 128 * 2 ** 20;

/** Plafond 2 · la mémoire · ⌊128 Mio / 550 o / 500⌋ = 488 pages. */
export const PAGES_BUDGET_MEMOIRE_META = Math.floor(BUDGET_MEMOIRE_LECTURE_OCTETS / OCTETS_PAR_LIGNE_CONVERTIE / TAILLE_PAGE_META);

/** La borne de pages d'une lecture Graph · le plus bas des deux plafonds, avec marge (488 → 400). */
export const BORNE_PAGES_META = 400;

/**
 * La durée maximale d'UNE lecture paginée (insights ou ensembles), attentes
 * de reprise comprises · 12 min. Dérivé des délais qui l'entourent, pas
 * mesuré · le déclencheur du worker abandonne l'appel à 15 min
 * (`triggerAdsMapSync`, `apps/workers/src/adsmap.ts`) et la route déclare
 * 800 s (`maxDuration`, ~13 min, non appliqué par le serveur autonome) · il
 * reste 1 à 3 min pour écrire et conclure. Sans elle, le pire cas d'une page
 * est 4 essais × 60 s + 26 s d'attentes = 266 s · à 400 pages, ~29 h.
 * Au-delà · échec propre, rien d'écrit.
 */
export const DUREE_MAX_LECTURE_META_MS = 12 * 60_000;

/** Le délai d'UNE requête Graph · 60 s, ou ce qui reste avant l'échéance de la lecture. */
export const DELAI_REQUETE_META_MS = 60_000;

export type RaisonLectureIncomplete = 'borne' | 'curseur_absent' | 'duree';

export type SuitePagination =
  | { suite: 'page'; params: Record<string, string> }
  | { suite: 'fin' }
  | { suite: 'incomplete'; raison: RaisonLectureIncomplete };

/** Les paramètres de suite qu'on accepte de l'URL `next` · rien d'autre n'en est repris (surtout pas `access_token`). */
const PARAMS_SUITE = ['after', 'offset'] as const;

/** Le paramètre de suite porté par l'URL `next` · `null` s'il n'y en a aucun (ou si l'URL est illisible). */
export function paramsDeSuite(next: string): Record<string, string> | null {
  let u: URL;
  try { u = new URL(next); } catch { return null; }
  const out: Record<string, string> = {};
  for (const k of PARAMS_SUITE) {
    const v = u.searchParams.get(k);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Après la page n° `pagesLues` (1 pour la première) · lire la suivante (avec quels paramètres), s'arrêter, ou dire que la lecture est incomplète. */
export function suitePagination(p: { pagesLues: number; next?: string | null; after?: string | null; borne?: number }): SuitePagination {
  if (!p.next) return { suite: 'fin' };
  const params = p.after ? { after: p.after } : paramsDeSuite(p.next);
  if (!params) return { suite: 'incomplete', raison: 'curseur_absent' };
  if (p.pagesLues >= (p.borne ?? BORNE_PAGES_META)) return { suite: 'incomplete', raison: 'borne' };
  return { suite: 'page', params };
}

/* ───────────────────────── reprise d'une page en échec passager ───────────────────────── */

/**
 * Les attentes avant chaque reprise d'une MÊME page · trois reprises, chacune
 * trois fois plus longue (2 s, 6 s, 18 s · 26 s d'attente au plus pour une
 * page). Pas mesuré chez Meta (injoignable depuis la session) · choisi court
 * devant le délai d'une requête (60 s) · le pire cas d'une page est donc
 * 4 × 60 s + 26 s = 266 s, et c'est `DUREE_MAX_LECTURE_META_MS` qui borne la
 * lecture entière, pas ces attentes. Avant la lecture complète, une erreur
 * d'une page sur 25 faisait échouer la marque · à 400 pages, sans reprise,
 * une seule erreur passagère la ferait échouer chaque nuit.
 */
export const ATTENTES_REPRISE_META_MS: readonly number[] = [2_000, 6_000, 18_000];

/** Codes Graph d'une erreur d'AUTORISATION · jeton (102, 190, 463, 467), droits (10, 200 à 299) · on ne redemande jamais. */
const autorisation = (code: number) => code === 102 || code === 190 || code === 463 || code === 467 || code === 10 || (code >= 200 && code <= 299);
/** Codes Graph PASSAGERS · service indisponible (2), limites d'appels (4, 17, 32, 341, 613, 80000 à 80014). */
const passager = (code: number) => [2, 4, 17, 32, 341, 613].includes(code) || (code >= 80_000 && code <= 80_014);
/**
 * Code 1 · « Please reduce the amount of data you're asking for » · la même
 * requête échouera de même, même rendue en 500 · on ne redemande pas, sauf si
 * Meta la dit lui-même passagère (`is_transient`).
 */
const tropDeDonnees = (e: EchecPageMeta) => e.code === 1 && e.transitoire !== true;

export interface EchecPageMeta {
  /** Statut HTTP · `null` si la requête n'a pas abouti (réseau, délai). */
  status: number | null;
  /** `error.code` de la réponse Graph. */
  code?: number | null;
  /** `error.is_transient` de la réponse Graph. */
  transitoire?: boolean;
  message: string;
}

/** L'attente avant de redemander la même page · `null` · ne pas redemander (erreur définitive, ou reprises épuisées). */
export function reprisePageMeta(e: EchecPageMeta, reprisesFaites: number): number | null {
  if (reprisesFaites >= ATTENTES_REPRISE_META_MS.length) return null;
  const m = e.message.toLowerCase();
  if (e.code != null && autorisation(e.code)) return null;
  if (e.status === 401 || e.status === 403) return null;
  if (tropDeDonnees(e)) return null;
  if (/access token|oauthexception|session has expired|has been invalidated|permission|not authorized/.test(m)) return null;
  const reprendre = e.status === null || e.status === 429 || e.status >= 500 || e.transitoire === true
    || (e.code != null && passager(e.code))
    || /request limit|rate limit|too many calls|fetch failed|econnreset|econnrefused|etimedout|enotfound|network|aborted|timeout/.test(m);
  return reprendre ? ATTENTES_REPRISE_META_MS[reprisesFaites]! : null;
}

/* ───────────────────────── le message, la phrase ───────────────────────── */

const MARQUE = 'meta_lecture_incomplete';

/** Le message de l'erreur levée par `graphAll` · un code et des nombres, jamais le jeton ni le compte. */
export function erreurLectureIncomplete(raison: RaisonLectureIncomplete, pagesLues: number): string {
  return `${MARQUE} raison=${raison} pages=${pagesLues}`;
}

/** Relit une erreur de lecture incomplète sur son message · `null` pour toute autre erreur. */
export function lireLectureIncomplete(message: string | null | undefined): { raison: RaisonLectureIncomplete; pages: number } | null {
  const m = /meta_lecture_incomplete raison=(borne|curseur_absent|duree) pages=(\d+)/.exec(message ?? '');
  return m ? { raison: m[1] as RaisonLectureIncomplete, pages: Number(m[2]) } : null;
}

/** La phrase de l'écran · ce qui s'est passé, que rien n'a été écrit, et quoi faire. */
export function phraseLectureIncomplete(l: { raison: RaisonLectureIncomplete; pages: number }): string {
  const n = l.pages.toLocaleString('fr-FR');
  const rien = 'rien n’a été écrit, les mesures précédentes restent en place';
  if (l.raison === 'borne') {
    return `ce compte publicitaire renvoie plus de ${n} pages de mesures Meta, au-delà de ce que la mesure lit en une fois · ${rien} · écris au support · ce volume demande une lecture par tranches, pas encore disponible`;
  }
  if (l.raison === 'duree') {
    return `la lecture des mesures Meta a dépassé ${DUREE_MAX_LECTURE_META_MS / 60_000} min (${n} pages lues) · ${rien} · la remontée suivante réessaiera, si ça persiste écris au support`;
  }
  return `Meta a annoncé une suite de mesures sans moyen de la lire (page ${n}) · ${rien} · la remontée suivante réessaiera, si ça persiste écris au support`;
}
