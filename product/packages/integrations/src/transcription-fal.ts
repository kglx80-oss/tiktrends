/**
 * Studios · transcription mot à mot d'une prise parlée · Scribe v2 sur fal,
 * appel RÉEL, sous la barrière de dépense.
 *
 * Même idiome que le fournisseur image et vidéo (`studios-fal.ts`) :
 *  · `fetch` INJECTÉ (aucun appel réseau implicite ; les tests parlent à un
 *    faux serveur local) ; `Authorization: Key <FAL_KEY>` ; aucune redirection ;
 *  · la barrière (`BarriereDepenseStudio`, obligatoire) réserve AVANT l'envoi
 *    la réserve de la prise (durée × 0,008 $/min, arrondie au cent supérieur,
 *    `reserveControleParoleMicros`), la rend si l'échec est CERTAIN, la garde
 *    s'il est incertain ; plafond atteint ⇒ aucune requête ;
 *  · la réserve ne dépasse jamais la ligne « contrôle de la parole »
 *    APPROUVÉE au devis : au-delà, refus avant tout appel ;
 *  · la réponse est lue par la règle pure `lireTranscriptionFal` (schéma
 *    strict sur les mots) ; une réponse 2xx illisible est INCERTAINE (fal a pu
 *    facturer), jamais complétée ;
 *  · une ligne `ai_spend` par (job, prise, essai) : la même prise ne se
 *    transcrit pas deux fois pour le même essai.
 * La clé n'apparaît dans aucun message d'erreur ni aucun journal.
 */

import {
  ErreurFournisseurCertaine, ErreurFournisseurIncertaine, issueStatutSoumission, issueErreurReseau,
  corpsTranscriptionFal, lireTranscriptionFal, idDepenseControleParole, reserveControleParoleMicros,
  URL_TRANSCRIPTION_FAL, MODELE_FAL_TRANSCRIPTION, type TranscriptionLue,
} from '@tiktrends/core';
import type { BarriereDepenseStudio } from './plafond-depense';

/**
 * Délai d'une transcription synchrone · une prise dure au plus 90 s. Borné pour
 * que le contrôle d'UNE prise (relecture, ffprobe, transcription, écriture)
 * tienne dans l'étape insécable du worker (`PHASES_CONTROLE_PAROLE`,
 * `boucle.ts`) : un arrêt (SIGTERM) n'attend jamais plus. Le temps réel de
 * Scribe n'est pas mesuré (fal bloqué depuis la session) ; un délai dépassé
 * est INCERTAIN (réserve gardée, aucune seconde transcription du même essai).
 */
export const DELAI_TRANSCRIPTION_FAL_MS = 40_000;
/** Essais d'une même prise · une erreur PASSAGÈRE est retentée par le worker, chaque essai a sa ligne de dépense. */
export const ESSAIS_TRANSCRIPTION_MAX = 3;

/** Statuts d'un refus passager · fal surchargé ou indisponible, rien n'est facturé, un nouvel essai a un sens. */
const PASSAGERS = new Set([408, 425, 429, 500, 503]);
const passagere = (e: ErreurFournisseurCertaine) => Object.assign(e, { passagere: true as const });

export interface DemandeTranscription {
  workspaceId: string;
  jobId: string;
  /** `clip:<plan>` · la prise contrôlée. */
  operation: string;
  /** Essai de cette prise · 1, puis 2 et 3 après une erreur passagère (`ESSAIS_TRANSCRIPTION_MAX`). */
  essai: number;
  /** Adresse temporaire signée de la prise (bucket privé). */
  audioUrl: string;
  /** Durée MESURÉE de la prise livrée. */
  dureeMs: number;
  /** Montant par prise de la ligne approuvée au devis (`controleParoleApprouve`). */
  approuveUsdMicros: number;
}

export interface OptionsTranscripteurFal {
  apiKey: string;
  fetch: typeof fetch;
  barriere: BarriereDepenseStudio;
  /** Adresse du modèle · défaut `https://fal.run/<modèle>` ; seuls les tests la changent. */
  url?: string;
  journal?: (e: { appel: string; detail: string }) => void;
}

export class TranscripteurFal {
  readonly nom = 'fal';
  readonly modele = MODELE_FAL_TRANSCRIPTION;
  private readonly cle: string;
  private readonly f: typeof fetch;
  private readonly barriere: BarriereDepenseStudio;
  private readonly url: string;
  private readonly noter: (e: { appel: string; detail: string }) => void;

  constructor(o: OptionsTranscripteurFal) {
    if (!o.apiKey || /^simule/i.test(o.apiKey) || /\s/.test(o.apiKey)) throw new Error('transcripteur fal refusé · clé absente ou de simulation');
    if (!o.barriere) throw new Error('transcripteur fal refusé · barrière de dépense absente');
    if (typeof o.fetch !== 'function') throw new Error('transcripteur fal refusé · fetch non fourni');
    this.cle = o.apiKey;
    this.f = o.fetch;
    this.barriere = o.barriere;
    this.url = o.url ?? URL_TRANSCRIPTION_FAL;
    this.noter = o.journal ?? (() => {});
  }

  /** Transcrit UNE prise · lève `ErreurFournisseurCertaine` (rien n'est dû) ou `ErreurFournisseurIncertaine`. */
  async transcrire(d: DemandeTranscription): Promise<{ transcription: TranscriptionLue; reserveUsdMicros: number }> {
    const reserve = reserveControleParoleMicros(d.dureeMs);
    if (reserve === null) throw new ErreurFournisseurCertaine('durée de la prise illisible ou hors borne · rien n’est envoyé');
    if (!(Number.isInteger(d.approuveUsdMicros) && reserve <= d.approuveUsdMicros)) {
      throw new ErreurFournisseurCertaine(`réserve de la transcription (${reserve} µ$) au-delà de la ligne approuvée (${d.approuveUsdMicros} µ$) · rien n’est envoyé`);
    }
    if (!Number.isInteger(d.essai) || d.essai < 1 || d.essai > ESSAIS_TRANSCRIPTION_MAX) throw new ErreurFournisseurCertaine('essai de transcription hors borne · rien n’est envoyé');

    return this.barriere.sousPlafondStudio({
      workspaceId: d.workspaceId, jobId: d.jobId, usd: reserve / 1_000_000, modele: 'fal_transcription',
      idDepense: idDepenseControleParole(d.jobId, d.operation, d.essai),
    }, async () => {
      this.noter({ appel: 'transcrire', detail: `${this.modele} · ${d.operation} · essai ${d.essai}` });
      let res: Response;
      try {
        res = await this.f(this.url, {
          method: 'POST', headers: { authorization: `Key ${this.cle}`, 'content-type': 'application/json' },
          body: JSON.stringify(corpsTranscriptionFal({ audioUrl: d.audioUrl })),
          redirect: 'manual', signal: AbortSignal.timeout(DELAI_TRANSCRIPTION_FAL_MS),
        });
      } catch (e) {
        if (issueErreurReseau(e) === 'certaine') throw passagere(new ErreurFournisseurCertaine('connexion à fal impossible · rien n’est parti'));
        throw new ErreurFournisseurIncertaine('réponse de fal perdue après envoi · la transcription a pu être facturée');
      }
      const issue = issueStatutSoumission(res.status);
      if (issue === 'certaine') {
        const e = new ErreurFournisseurCertaine(`fal a refusé la transcription (HTTP ${res.status})`);
        throw PASSAGERS.has(res.status) ? passagere(e) : e;
      }
      if (issue === 'incertaine') throw new ErreurFournisseurIncertaine(`réponse ambiguë de fal (HTTP ${res.status}) · la transcription a pu être facturée`);
      let corps: unknown;
      try { corps = await res.json(); } catch { throw new ErreurFournisseurIncertaine('transcription acceptée par fal, réponse coupée ou illisible'); }
      const lu = lireTranscriptionFal(corps);
      if (!lu.ok) throw new ErreurFournisseurIncertaine(`transcription acceptée par fal mais illisible · ${lu.motif}`);
      return { transcription: lu.transcription, reserveUsdMicros: reserve };
    });
  }
}
