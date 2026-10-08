import 'server-only';
import { eq } from 'drizzle-orm';
import { schema } from '@tiktrends/db';
import { CLE_SONDE_VIDEO, capaciteVideo, type CapaciteVideo } from '@tiktrends/core';
import type { ExecStudio } from './types';

/**
 * Studios · L7-B · la capacité vidéo du worker, lue CÔTÉ SERVEUR.
 *
 * Le worker publie sa sonde (ffmpeg présent, échantillon réel décodé en
 * entier) dans `app_settings` ; la règle pure `capaciteVideo` la juge
 * (fraîcheur bornée). Aucune ligne, ligne illisible ou périmée ⇒
 * `decodage: false` : le devis refuse l'animation, l'écran la dit
 * indisponible. Rien n'est jamais pris du client.
 */
export async function lireCapaciteVideo(ex: ExecStudio, maintenant: Date): Promise<CapaciteVideo> {
  const [l] = await ex.select({ value: schema.appSettings.value }).from(schema.appSettings)
    .where(eq(schema.appSettings.key, CLE_SONDE_VIDEO)).limit(1);
  return capaciteVideo(l?.value ?? null, maintenant);
}
