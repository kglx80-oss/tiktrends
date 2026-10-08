import { schema, eq, and, isNull, sql } from '@tiktrends/db';
import { capaciteVideo, type DecodeurMedia, type FournisseurStudio, type StockageStudio } from '@tiktrends/core';
import { MoteurStudio } from './moteur';
import { DecodeurSharp } from './decodeur';
import { decoderVideoFfmpeg } from './decodeur-video';
import { demarrerSondeVideo } from './sonde-video';
import type { BaseStudio, EntreeJournal } from './types';

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
}): { arreter: () => void; moteur: MoteurStudio } {
  let sonde: ReturnType<typeof demarrerSondeVideo> | null = null;
  let decodeur = o.decodeur;
  if (!decodeur) {
    const s = demarrerSondeVideo({ base: o.base });
    sonde = s;
    decodeur = new DecodeurSharp({ video: (octets) => decoderVideoFfmpeg(octets), videoActif: () => capaciteVideo(s.derniere(), new Date()).decodage });
  }
  const moteur = new MoteurStudio({ base: o.base, fournisseur: o.fournisseur, stockage: o.stockage, decodeur, journal: o.journal, secretWebhook: process.env.STUDIO_WEBHOOK_SECRET ?? null });
  let enCours = false;
  const minuterie = setInterval(async () => {
    if (enCours) return;
    enCours = true;
    try {
      await moteur.tour();
      await relayerOutbox(o.base, async (e) => { console.log('[studios] événement', e.topic, e.aggregateId); });
    } catch (e) {
      console.error('[studios] tour en échec', e instanceof Error ? e.message : e);
    } finally {
      enCours = false;
    }
  }, o.intervalleMs ?? 2_000);
  return { arreter: () => { clearInterval(minuterie); sonde?.arreter(); }, moteur };
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
