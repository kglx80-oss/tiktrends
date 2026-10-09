import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema, eq } from '@tiktrends/db';
import { CLE_SONDE_VIDEO, capaciteVideo, type SondeVideo } from '@tiktrends/core';
import { publierSondeVideo, sonderVideo } from '../studios/sonde-video';
import type { BaseStudio } from '../studios/types';

/**
 * Recette Studios · E2 · sonde vidéo UNE fois, publiée et RELUE, pour
 * `ops/recette/verifier-environnement.sh` (point « la sonde vidéo publie sa
 * capacité »).
 *
 * Le worker de recette ne démarre pas la boucle Studios (aucune clé fal) :
 * sa sonde périodique ne tourne donc pas. Cette commande joue la MÊME sonde
 * (`sonderVideo` : ffmpeg, encodeurs, échantillon généré puis décodé par le
 * chemin des fournisseurs), la PUBLIE là où le site la lit (`app_settings`,
 * `publierSondeVideo`), la RELIT en base et la juge par la règle du site
 * (`capaciteVideo`). Une capacité n'est dite que relue et fraîche. Aucun
 * fournisseur appelé, rien de dépensé.
 *
 *   docker compose … run --rm workers_recette pnpm exec tsx src/recette/sonde-recette.ts
 *
 * Sortie : une ligne « OK · … » (code 0) ou « ÉCHEC · … » (code 1). Garde :
 * `test/e2-sonde-recette.test.ts`.
 */
export async function sonderPourRecette(o: {
  base: BaseStudio | null | undefined;
  sonder?: () => Promise<SondeVideo>;
  horloge?: () => Date;
}): Promise<{ ok: boolean; ligne: string }> {
  const horloge = o.horloge ?? (() => new Date());
  if (!o.base) return { ok: false, ligne: 'ÉCHEC · sonde vidéo · base de recette indisponible (DATABASE_URL), rien publié.' };
  const s = await (o.sonder ?? (() => sonderVideo()))();
  try {
    await publierSondeVideo(o.base, s);
  } catch (e) {
    return { ok: false, ligne: `ÉCHEC · sonde vidéo non publiée · ${(e as Error).message.slice(0, 160)}` };
  }
  const [l] = await o.base.select().from(schema.appSettings).where(eq(schema.appSettings.key, CLE_SONDE_VIDEO)).limit(1);
  const c = capaciteVideo(l?.value ?? null, horloge());
  if (!c.decodage) return { ok: false, ligne: `ÉCHEC · sonde vidéo publiée mais sans capacité · ${c.raison}` };
  return { ok: true, ligne: `OK · sonde vidéo publiée et relue · décodage prouvé (${s.ffmpeg ?? 'ffmpeg'}) · H.264 ${c.encodeurs.libx264 ? 'oui' : 'non'}, AAC ${c.encodeurs.aac ? 'oui' : 'non'} · ${c.sondeLe}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  import('@tiktrends/db').then(async ({ db }) => {
    const r = await sonderPourRecette({ base: (db ?? null) as BaseStudio | null });
    (r.ok ? console.log : console.error)(r.ligne);
    process.exit(r.ok ? 0 : 1);
  }, (e) => { console.error('ÉCHEC · sonde vidéo ·', (e as Error).message); process.exit(1); });
}
