import { schema, eq, and, isNull, sql } from '@tiktrends/db';
import { capaciteVideo, cleInterrupteursEspace, type DecodeurMedia, type FournisseurStudio, type StockageStudio } from '@tiktrends/core';
import { DELAI_SOUMISSION_FAL_MS, DELAI_TRANSCRIPTION_FAL_MS } from '@tiktrends/integrations';
import { DELAI_MESURE_PRISE_MS } from './controle-parole';
import { MoteurStudio, type InterrupteursMoteur } from './moteur';
import { DecodeurSharp } from './decodeur';
import { decoderVideoFfmpeg } from './decodeur-video';
import { demarrerSondeVideo } from './sonde-video';
import type { BaseStudio, EntreeJournal } from './types';

/**
 * F1 · les interrupteurs du worker : l'environnement du processus (relu à son
 * démarrage) et le réglage plateforme de chaque espace (`app_settings`, relu à
 * chaque réclamation). Même règle que le serveur (`capaciteActive`, noyau).
 * Un réglage illisible vaut « aucun réglage » : les défauts s'appliquent, et
 * ils coupent toute nouveauté incomplète.
 */
export function interrupteursWorker(env: Readonly<Record<string, string | undefined>> = process.env): InterrupteursMoteur {
  return {
    env,
    reglagesEspace: async (ex, workspaceId) => {
      const A = schema.appSettings;
      const [l] = await ex.select({ value: A.value }).from(A).where(eq(A.key, cleInterrupteursEspace(workspaceId))).limit(1);
      return l?.value ?? null;
    },
  };
}

/**
 * Boucle du worker des studios · un tour toutes les `intervalleMs`, jamais
 * deux tours en même temps dans le même processus. Plusieurs processus peuvent
 * tourner : le bail en base les départage.
 */
export function demarrerBoucleStudio(o: {
  base: BaseStudio;
  fournisseur: FournisseurStudio;
  stockage: StockageStudio;
  /**
   * Décodage réel des sorties · par défaut `sharp` pour les images et
   * ffmpeg pour la vidéo, ce dernier ACTIF seulement tant que la sonde de ce
   * processus est fraîche et a décodé son échantillon (`capaciteVideo`).
   */
  decodeur?: DecodeurMedia;
  intervalleMs?: number;
  journal?: (e: EntreeJournal) => void;
  /** Environnement des interrupteurs · `process.env` par défaut (bancs d'essai seulement). */
  env?: Readonly<Record<string, string | undefined>>;
  /**
   * Travail après chaque tour du moteur · le contrôle de la parole des prises
   * livrées (`controlerParolesEnAttente`). Son échec est journalisé, il
   * n'arrête jamais le moteur.
   */
  apresTour?: () => Promise<unknown>;
}): { arreter: () => Promise<void>; moteur: MoteurStudio } {
  let sonde: ReturnType<typeof demarrerSondeVideo> | null = null;
  let decodeur = o.decodeur;
  if (!decodeur) {
    const s = demarrerSondeVideo({ base: o.base });
    sonde = s;
    decodeur = new DecodeurSharp({ video: (octets) => decoderVideoFfmpeg(octets), videoActif: () => capaciteVideo(s.derniere(), new Date()).decodage });
  }
  const moteur = new MoteurStudio({ base: o.base, fournisseur: o.fournisseur, stockage: o.stockage, decodeur, journal: o.journal, secretWebhook: process.env.STUDIO_WEBHOOK_SECRET ?? null, interrupteurs: interrupteursWorker(o.env ?? process.env) });
  let enCours: Promise<void> | null = null;
  const minuterie = setInterval(() => {
    if (enCours || moteur.arretDemande) return;
    enCours = (async () => {
      try {
        await moteur.tour();
        // Arrêt demandé pendant le tour · le contrôle de la parole n'est pas lancé.
        if (o.apresTour && !moteur.arretDemande) await o.apresTour().catch((e) => console.error('[studios] contrôle de la parole en échec', e instanceof Error ? e.message : e));
        await relayerOutbox(o.base, async (e) => { console.log('[studios] événement', e.topic, e.aggregateId); });
      } catch (e) {
        console.error('[studios] tour en échec', e instanceof Error ? e.message : e);
      } finally {
        enCours = null;
      }
    })();
  }, o.intervalleMs ?? 2_000);
  /**
   * Arrêt propre · plus aucun tour, le moteur n'entame plus d'étape, et la
   * promesse rend la main quand le tour EN COURS est fini (une soumission
   * partie a écrit sa requête). Idempotent.
   */
  const arreter = async () => {
    clearInterval(minuterie);
    moteur.demanderArret();
    sonde?.arreter();
    if (enCours) await enCours;
  };
  return { arreter, moteur };
}

/* ───────────────────────────── Arrêt sur signal ───────────────────────────── */

/**
 * Le pire de l'étape qu'on ne coupe JAMAIS · de la préparation à l'écriture de
 * la requête (`MoteurStudio.demarrer`). Couper entre la soumission et
 * `enregistrerRequete` laisse un job `running` sans identifiant · rapprochement
 * (borné depuis par son échéance, mais coût incertain). Valeurs du code :
 *
 * | phase                        | borne  | source                                                               |
 * | ---------------------------- | ------ | -------------------------------------------------------------------- |
 * | préparation · médias relus   |  40 s  | retouche · source et masque relus (2 × 20 s, `stockageS3.relire`) ; image · 8 logos au plus × 5 s (`verifierEmpreinteObjetEspace`) |
 * | soumission à fal             |  30 s  | `DELAI_SOUMISSION_FAL_MS`                                            |
 * | écriture de la requête       |   5 s  | une transaction Postgres locale (mesurée sous 50 ms en pglite)       |
 * | **total**                    | **75 s** |                                                                    |
 *
 * Délai d'arrêt · 1,5 × 75 s ≈ **115 s** · au-delà, le processus sort quand même
 * (un tour bloqué ailleurs · dépôt S3 sans délai) · une finalisation coupée
 * reprend sans régénérer. `docker-compose.yml` accorde **125 s**
 * (`stop_grace_period`) · Docker n'envoie SIGKILL qu'après. Le point
 * d'entrée lance `pnpm exec tsx` (le processus 1 attend son enfant) · mesuré
 * le 16/11 dans un espace de processus isolé : `pnpm start` relaie SIGTERM
 * mais sort aussitôt (ELIFECYCLE), l'enfant est tué avant d'avoir fini ;
 * `pnpm exec tsx` et `tsx` attendent la fin propre.
 */
export const PHASES_ETAPE_INSECABLE: ReadonlyArray<{ phase: string; ms: number; source: string }> = [
  { phase: 'préparation · médias relus', ms: 40_000, source: 'stockageS3.relire × 2 · verifierEmpreinteObjetEspace × 8' },
  { phase: 'soumission à fal', ms: DELAI_SOUMISSION_FAL_MS, source: 'DELAI_SOUMISSION_FAL_MS' },
  { phase: 'écriture de la requête', ms: 5_000, source: 'transaction locale' },
];
export const ETAPE_INSECABLE_PIRE_MS = PHASES_ETAPE_INSECABLE.reduce((s, p) => s + p.ms, 0);
/**
 * Le contrôle de la parole d'UNE prise (`controlerParolesEnAttente`, après le
 * tour) · lancé seulement sans arrêt demandé, l'arrêt relu avant chaque prise :
 * au pire une prise est en cours au signal. Ses bornes tiennent dans l'étape
 * insécable (garde `studios-arret-worker.test.ts`) · le délai d'arrêt ne bouge pas.
 *
 * | phase                 | borne | source                                     |
 * | --------------------- | ----- | ------------------------------------------ |
 * | relecture de la prise |  20 s | `stockageS3.relire`                        |
 * | mesure ffprobe        |  10 s | `DELAI_MESURE_PRISE_MS`                    |
 * | transcription fal     |  40 s | `DELAI_TRANSCRIPTION_FAL_MS`               |
 * | écriture du journal   |   5 s | une transaction locale                     |
 * | **total**             | **75 s** |                                         |
 */
export const PHASES_CONTROLE_PAROLE: ReadonlyArray<{ phase: string; ms: number; source: string }> = [
  { phase: 'relecture de la prise', ms: 20_000, source: 'stockageS3.relire' },
  { phase: 'mesure ffprobe', ms: DELAI_MESURE_PRISE_MS, source: 'DELAI_MESURE_PRISE_MS' },
  { phase: 'transcription fal', ms: DELAI_TRANSCRIPTION_FAL_MS, source: 'DELAI_TRANSCRIPTION_FAL_MS' },
  { phase: 'écriture du journal', ms: 5_000, source: 'transaction locale' },
];
export const DELAI_ARRET_MAX_MS = Math.ceil((1.5 * ETAPE_INSECABLE_PIRE_MS) / 5_000) * 5_000;

/**
 * SIGTERM, SIGINT · arrêt propre UNE fois (un second signal ne relance rien),
 * puis sortie 0 ; un arrêt qui dépasse `delaiMaxMs` sort en 1. Le processus
 * est injecté (bancs d'essai).
 */
export function arretPropreSurSignal(o: {
  processus: Pick<NodeJS.EventEmitter, 'on'>;
  arreter: () => Promise<void>;
  sortir: (code: number) => void;
  delaiMaxMs?: number;
  journal?: (m: string) => void;
}): void {
  const log = o.journal ?? ((m: string) => console.log(m));
  let parti = false;
  const surSignal = (signal: string) => {
    if (parti) return;
    parti = true;
    log(`[studios] ${signal} reçu · arrêt propre, le tour en cours se termine`);
    const borne = setTimeout(() => { log('[studios] arrêt trop long · sortie forcée, la finalisation reprendra au redémarrage'); o.sortir(1); }, o.delaiMaxMs ?? DELAI_ARRET_MAX_MS);
    o.arreter().then(
      () => { clearTimeout(borne); log('[studios] arrêt propre terminé'); o.sortir(0); },
      (e) => { clearTimeout(borne); log(`[studios] arrêt en échec · ${e instanceof Error ? e.message : String(e)}`); o.sortir(1); },
    );
  };
  o.processus.on('SIGTERM', () => surSignal('SIGTERM'));
  o.processus.on('SIGINT', () => surSignal('SIGINT'));
}

export type EvenementOutbox = typeof schema.studioOutbox.$inferSelect;

/**
 * Publie les événements de l'outbox dans l'ordre, au plus `limite` par appel.
 * Un envoi en échec garde l'événement (tentatives + dernière erreur) ; un
 * événement publié ne repart pas. Deux relais ne publient pas le même
 * événement (verrou `SKIP LOCKED`).
 */
export async function relayerOutbox(base: BaseStudio, envoyer: (e: EvenementOutbox) => Promise<void>, limite = 50): Promise<{ publies: number; echecs: number }> {
  const O = schema.studioOutbox;
  let publies = 0;
  let echecs = 0;
  for (let i = 0; i < limite; i++) {
    const fait = await base.transaction(async (tx) => {
      const [e] = await tx.select().from(O).where(isNull(O.publishedAt)).orderBy(O.id).limit(1).for('update', { skipLocked: true });
      if (!e) return null;
      try {
        await envoyer(e);
        await tx.update(O).set({ publishedAt: new Date(), attempts: e.attempts + 1, lastError: null }).where(and(eq(O.id, e.id), isNull(O.publishedAt)));
        return 'publie' as const;
      } catch (err) {
        await tx.update(O).set({ attempts: sql`${O.attempts} + 1`, lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500) }).where(eq(O.id, e.id));
        return 'echec' as const;
      }
    });
    if (fait === null) break;
    if (fait === 'publie') publies += 1;
    else { echecs += 1; break; }
  }
  return { publies, echecs };
}
