/**
 * Studios · transcription MOT À MOT d'une prise parlée · Scribe v2
 * (ElevenLabs) sur fal, règles pures.
 *
 * Pur. L'adaptateur (`packages/integrations/src/transcription-fal.ts`) fait
 * l'appel sous la barrière de dépense et confie chaque réponse ici.
 *
 * Modèle relevé le 16/11 (pages fal du modèle, lues par recherche : fal est
 * bloqué depuis la session de développement, aucun appel réel n'a été fait) :
 *  · `fal-ai/elevenlabs/speech-to-text/scribe-v2`, 99 langues, horodatage par
 *    mot, locuteurs, 0,008 $ par minute d'audio (`TARIF_TRANSCRIPTION_MICROS_PAR_MINUTE`) ;
 *  · entrée `audio_url` (un fichier vidéo est accepté : l'audio en est extrait),
 *    `language_code`, `tag_audio_events`, `diarize` ;
 *  · sortie `text`, `language_code`, `words: [{ text, start, end, type,
 *    speaker_id }]`, `start` et `end` en SECONDES, `type` parmi `word`,
 *    `spacing`, `audio_event`.
 * La lecture est STRICTE sur ce qu'on utilise (chaque mot : texte borné,
 * temps finis, ordonnés) et tolérante sur le reste (champs ajoutés ignorés) :
 * une réponse qui ne se lit pas est refusée, jamais complétée.
 *
 * Appel SYNCHRONE (`https://fal.run/<modèle>`) : une prise dure quelques
 * secondes, la réponse arrive dans la même requête. Pas de file, donc pas de
 * suivi ; une réponse perdue après l'envoi est INCERTAINE (la réserve reste,
 * aucune seconde transcription pour la même prise et le même essai).
 */

import type { MotHorodate } from '../video/sous-titres';
import { sha256Hex } from '../version';

export const MODELE_FAL_TRANSCRIPTION = 'fal-ai/elevenlabs/speech-to-text/scribe-v2';
export const HOTE_FAL_SYNCHRONE = 'fal.run';
export const URL_TRANSCRIPTION_FAL = `https://${HOTE_FAL_SYNCHRONE}/${MODELE_FAL_TRANSCRIPTION}`;
/** ISO 639-3 · langue des répliques du studio. */
export const LANGUE_TRANSCRIPTION = 'fra';
/** Bornes de lecture · une prise courte (90 s au plus) compte quelques centaines de mots. */
export const MOTS_TRANSCRIPTION_MAX = 4_000;
export const LONGUEUR_MOT_MAX = 200;
/** Tolérance d'ordre entre deux mots consécutifs (horodatages arrondis du modèle). */
export const RECUL_MOT_TOLERE_MS = 50;

/** Le corps envoyé · l'adresse de la prise (signée, temporaire), langue fixée, ni événements sonores ni locuteurs. */
export function corpsTranscriptionFal(e: { audioUrl: string; langue?: string }): Record<string, unknown> {
  return { audio_url: e.audioUrl, language_code: e.langue ?? LANGUE_TRANSCRIPTION, tag_audio_events: false, diarize: false };
}

export interface TranscriptionLue {
  /** Le texte reconstitué des MOTS, dans l'ordre · ce qui est comparé à la réplique. */
  texte: string;
  langue: string | null;
  mots: MotHorodate[];
}

export type LectureTranscription = { ok: true; transcription: TranscriptionLue } | { ok: false; motif: string };

const fini = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** La réponse 2xx de Scribe v2 · lue strictement (voir l'en-tête). */
export function lireTranscriptionFal(corps: unknown): LectureTranscription {
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) return { ok: false, motif: 'réponse de transcription illisible (objet attendu)' };
  const c = corps as Record<string, unknown>;
  if (!Array.isArray(c.words)) return { ok: false, motif: 'réponse de transcription sans liste de mots horodatés' };
  if (c.words.length > MOTS_TRANSCRIPTION_MAX) return { ok: false, motif: `réponse de transcription trop longue (${c.words.length} éléments)` };
  const mots: MotHorodate[] = [];
  let dernier = -Infinity;
  for (let i = 0; i < c.words.length; i++) {
    const w = c.words[i] as Record<string, unknown> | null;
    if (!w || typeof w !== 'object') return { ok: false, motif: `mot ${i} illisible` };
    if (w.type !== undefined && w.type !== 'word') continue;
    if (typeof w.text !== 'string' || w.text.length > LONGUEUR_MOT_MAX) return { ok: false, motif: `mot ${i} sans texte lisible` };
    if (!fini(w.start) || !fini(w.end) || w.start < 0 || w.end < w.start) return { ok: false, motif: `mot ${i} mal horodaté` };
    const debutMs = Math.round(w.start * 1000);
    const finMs = Math.round(w.end * 1000);
    if (debutMs + RECUL_MOT_TOLERE_MS < dernier) return { ok: false, motif: `mot ${i} hors d’ordre` };
    dernier = Math.max(dernier, debutMs);
    const texte = w.text.trim();
    if (texte) mots.push({ texte, debutMs, finMs });
  }
  const langue = typeof c.language_code === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(c.language_code) ? c.language_code : null;
  return { ok: true, transcription: { texte: mots.map((m) => m.texte).join(' '), langue, mots } };
}

/**
 * Identifiant de la ligne `ai_spend` d'UNE transcription · dérivé du job, de
 * la prise et de l'essai (UUID de forme v8, comme `idDepenseDuJob`) : une
 * seconde réservation pour la même prise retombe sur la même ligne, jamais
 * deux dépenses comptées ; la transcription d'une reprise a son propre essai.
 */
export function idDepenseControleParole(jobId: string, operation: string, essai: number): string {
  const h = sha256Hex(`ai_spend:studio-parole:${jobId}:${operation}:${essai}`);
  const variante = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
