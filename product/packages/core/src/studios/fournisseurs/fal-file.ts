/**
 * Studios · F-A · lecture PURE des réponses de la file fal (`queue.fal.run`).
 *
 * Ni réseau ni horloge : l'adaptateur (`packages/integrations/src/studios-fal.ts`)
 * fait les appels et confie chaque réponse ici. Ce module décide, et chaque
 * décision se teste sur une réponse rejouée.
 *
 * Protocole de la file fal (documentation publique « Queue », docs.fal.ai) :
 *  · soumission `POST https://queue.fal.run/<modèle>` → `{ request_id,
 *    status_url, response_url, cancel_url }` ;
 *  · statut `GET …/requests/<id>/status` → `{ status: IN_QUEUE | IN_PROGRESS |
 *    COMPLETED, … }` ;
 *  · résultat `GET …/requests/<id>` → la sortie du modèle (`images: [{ url,
 *    content_type, … }]`) ou l'erreur du modèle avec son statut HTTP ;
 *  · annulation `PUT …/requests/<id>/cancel` → 202 (`CANCELLATION_REQUESTED`)
 *    ou 400 (`ALREADY_COMPLETED`).
 * La file n'offre ni clé d'idempotence ni recherche d'une requête par une clé
 * à nous : `rechercheParCle` est FAUX et une réponse perdue se réconcilie.
 *
 * ── Certain ou incertain, selon le statut ET le moment ───────────────────────
 *
 * Avant toute réponse, une erreur de connexion qui prouve que rien n'est parti
 * (nom introuvable, connexion refusée, certificat) est CERTAINE ; toute autre
 * (coupure, délai) est INCERTAINE : la requête a pu être reçue. Une réponse
 * 4xx ou 500/501/503/505 dit que la file a refusé la demande : certaine (rien
 * n'est en file, rien n'est facturé). 502 et 504 viennent d'un intermédiaire
 * qui a pu transmettre la demande avant de perdre la réponse : incertaines.
 * Une fois une réponse 2xx reçue, la demande est ACCEPTÉE : tout ce qui casse
 * ensuite (corps coupé, illisible, sans identifiant) est incertain.
 */

import { suiviFalDepuisJob, urlFalSure, hotesFalAutorises, HOTE_FILE_FAL, type SuiviFal } from '../securite';
import { rienNaEteFacture } from '../../spend-refund';

export type IssueSoumission = 'acceptee' | 'certaine' | 'incertaine';

/** Statut HTTP de la réponse à une soumission. */
export function issueStatutSoumission(status: number): IssueSoumission {
  if (status >= 200 && status < 300) return 'acceptee';
  if (status === 502 || status === 504) return 'incertaine';
  if (status >= 300 && status < 600) return 'certaine';
  return 'incertaine';
}

/** Codes d'erreur de connexion qui prouvent que la requête n'a pas quitté la machine ou n'a pas été reçue. */
const CODES_JAMAIS_PARTIS = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ERR_INVALID_URL',
  'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function codeErreur(e: unknown): string | null {
  let x: unknown = e;
  for (let i = 0; i < 4 && x && typeof x === 'object'; i++) {
    const c = (x as { code?: unknown }).code;
    if (typeof c === 'string') return c;
    x = (x as { cause?: unknown }).cause;
  }
  return null;
}

/** Une exception levée par `fetch` AVANT toute réponse · certaine seulement si rien n'a pu partir. */
export function issueErreurReseau(e: unknown): Exclude<IssueSoumission, 'acceptee'> {
  const code = codeErreur(e);
  return code !== null && CODES_JAMAIS_PARTIS.has(code) ? 'certaine' : 'incertaine';
}

export interface SoumissionFal { requestId: string; statusUrl: string | null; responseUrl: string | null }

/** Corps de la réponse 2xx d'une soumission · `null` sans identifiant exploitable. */
export function lireSoumissionFal(corps: unknown): SoumissionFal | null {
  if (!corps || typeof corps !== 'object') return null;
  const c = corps as Record<string, unknown>;
  const id = c.request_id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9._~-]{1,200}$/.test(id)) return null;
  const s = typeof c.status_url === 'string' ? c.status_url : null;
  const r = typeof c.response_url === 'string' ? c.response_url : null;
  return { requestId: id, statusUrl: s, responseUrl: r };
}

/**
 * L'identifiant de requête stocké par le moteur (`studio_jobs.provider_request_id`) ·
 * `<clé fournisseur> <suivi fal>`, où le suivi est `falq|<statut>|<réponse>` (URL
 * rendues par fal, validées) ou `<modèle>::<id>`. La clé relie la requête au job
 * (et à sa ligne `ai_spend`) sans table nouvelle.
 */
export function idRequeteFal(cle: string, modele: string, s: SoumissionFal, queueUrl: string | null): string | null {
  const falq = s.statusUrl && s.responseUrl ? `falq|${s.statusUrl}|${s.responseUrl}` : null;
  const suivi = falq && suiviFalDepuisJob(falq, queueUrl) ? falq : `${modele}::${s.requestId}`;
  if (!suiviFalDepuisJob(suivi, queueUrl)) return null;
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(cle)) return null;
  return `${cle} ${suivi}`;
}

export interface RequeteFalLue extends SuiviFal { cle: string; annulationUrl: string }

/** Relit un identifiant de requête · URL RECONSTRUITES et validées (SEC-07), `null` sinon : aucune requête. */
export function lireIdRequeteFal(id: string, queueUrl: string | null): RequeteFalLue | null {
  if (typeof id !== 'string') return null;
  const i = id.indexOf(' ');
  if (i <= 0) return null;
  const cle = id.slice(0, i);
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(cle)) return null;
  const suivi = suiviFalDepuisJob(id.slice(i + 1), queueUrl);
  if (!suivi) return null;
  return { cle, ...suivi, annulationUrl: `${suivi.responseUrl}/cancel` };
}

/**
 * URL de file sûre pour une SOUMISSION · même règle que le suivi
 * (`suiviFalDepuisJob`) : l'hôte configuré s'il est sûr, sinon la file officielle.
 */
export function urlSoumissionFal(queueUrl: string | null, modele: string): string | null {
  const segments = modele.split('/');
  if (segments.length < 2 || !segments.every((s) => /^[A-Za-z0-9._~-]+$/.test(s) && s !== '.' && s !== '..')) return null;
  const conf = queueUrl ? urlFalSure(queueUrl.replace(/\/+$/, ''), hotesFalAutorises(queueUrl)) : null;
  return `https://${conf ? conf.hostname.toLowerCase() : HOTE_FILE_FAL}/${modele}`;
}

export type LectureStatutFal =
  | { etat: 'en_cours'; progression?: number }
  | { etat: 'termine' }
  /** fal ne connaît pas (ou plus) la requête, ou refuse de la montrer · issue ambiguë. */
  | { etat: 'inconnu'; motif: string }
  /** Erreur passagère (429, 5xx, réseau) · on relira, rien ne bouge. */
  | { etat: 'transitoire'; motif: string };

export function lireStatutFal(status: number, corps: unknown): LectureStatutFal {
  if (status === 404 || status === 410 || status === 401 || status === 403) return { etat: 'inconnu', motif: `statut HTTP ${status}` };
  if (status < 200 || status >= 300) return { etat: 'transitoire', motif: `statut HTTP ${status}` };
  const s = corps && typeof corps === 'object' ? String((corps as { status?: unknown }).status ?? '').toUpperCase() : '';
  if (s === 'IN_QUEUE') return { etat: 'en_cours', progression: 0 };
  if (s === 'IN_PROGRESS') return { etat: 'en_cours' };
  if (s === 'COMPLETED') return { etat: 'termine' };
  return { etat: 'inconnu', motif: `statut fal « ${s.slice(0, 40) || 'absent'} »` };
}

export type LectureResultatFal =
  | { etat: 'reussi'; urls: string[] }
  | { etat: 'echoue'; facture: boolean; motif: string }
  | { etat: 'annule'; facture: boolean }
  | { etat: 'inconnu'; motif: string }
  | { etat: 'transitoire'; motif: string };

/** Famille d'échec d'une réponse de résultat · même vocabulaire que `spend-refund.ts`. */
function familleHttp(status: number): string {
  if (status === 400 || status === 422) return 'requete';
  if (status === 401 || status === 403) return 'acces';
  if (status === 429) return 'saturation';
  if (status >= 500) return 'service';
  return 'autre';
}

/**
 * Le résultat d'une requête terminée. Rendu sans frais SEULEMENT quand la
 * famille est de celles où l'on sait que rien n'est facturé (`rienNaEteFacture`) ;
 * dans le doute, le coût reste compté. Une annulation n'est jamais dite gratuite :
 * fal ne dit pas si le calcul avait commencé.
 */
export function lireResultatFal(status: number, corps: unknown): LectureResultatFal {
  const texte = (() => { try { return JSON.stringify(corps ?? '').slice(0, 2000); } catch { return ''; } })();
  if (status === 404 || status === 410) return { etat: 'inconnu', motif: `résultat introuvable (HTTP ${status})` };
  if (status === 429 || status >= 500 || status === 401 || status === 403) return { etat: 'transitoire', motif: `résultat illisible pour l’instant (HTTP ${status})` };
  if (status >= 400) {
    if (/cancel/i.test(texte)) return { etat: 'annule', facture: true };
    return { etat: 'echoue', facture: !rienNaEteFacture(familleHttp(status)), motif: `le modèle a refusé la demande (HTTP ${status})` };
  }
  if (status < 200 || status >= 300) return { etat: 'transitoire', motif: `statut HTTP ${status}` };
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  // Images (`images`, `image`) ou vidéo (`video`, `videos`) · même lecture, une URL par sortie.
  const brut = c.images ?? c.image ?? c.video ?? c.videos ?? [];
  const liste = Array.isArray(brut) ? brut : [brut];
  const urls = liste.map((x) => (typeof x === 'string' ? x : (x as { url?: unknown } | null)?.url)).filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (urls.length === 0) return { etat: 'echoue', facture: true, motif: 'réponse terminée sans média' };
  return { etat: 'reussi', urls };
}

/** Hôtes d'où l'on télécharge une sortie fal · jamais la clé envoyée, jamais une adresse IP. */
export const HOTES_SORTIES_FAL = ['fal.media'] as const;

/** URL d'une sortie fal qu'on accepte de télécharger · `null` sinon (aucune requête). */
export function urlSortieFalSure(brut: string): URL | null {
  let u: URL;
  try { u = new URL(brut); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port !== '') return null;
  const h = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(h) || h.includes(':')) return null;
  return HOTES_SORTIES_FAL.some((d) => h === d || h.endsWith(`.${d}`)) ? u : null;
}

/** `image:<n>` · la référence d'une sortie (indice dans la réponse), jamais son URL. */
export function refSortieFal(i: number): string { return `image:${i}`; }
export function indiceSortieFal(ref: string): number | null {
  const m = /^image:(\d{1,2})$/.exec(ref);
  return m ? Number(m[1]) : null;
}
