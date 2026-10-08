import type { DecodeurMedia, ResultatDecodage } from '@tiktrends/core';

/**
 * Décodeur RÉEL des médias du worker (recette du 8 octobre).
 *
 * Images · `sharp` (libvips) décode TOUS les pixels (`.raw().toBuffer()`) ;
 * le moindre avertissement du décodeur (`failOn: 'warning'`) est un refus :
 * flux zlib d'un PNG qui ne concorde plus avec sa somme, flux JPEG coupé avant
 * son marqueur de fin… Lire seulement l'en-tête (`metadata()`) ne prouverait
 * rien : c'est exactement ce que faisait le premier filtre.
 *
 * Vidéo · décodeur RÉEL ffmpeg/ffprobe (`decodeur-video.ts`, L7-B), branché
 * par la boucle du worker SEULEMENT quand la sonde du démarrage l'a prouvé
 * (`videoActif`) : version lue, échantillon généré puis décodé en entier.
 * Sans preuve fraîche, `decoderVideo` est ABSENT : une vidéo n'est jamais
 * déclarée lisible, elle est refusée comme non vérifiable, et le worker ne
 * soumet aucune opération d'animation. Jamais un faux décodeur.
 *
 * `sharp` est chargé à la demande : c'est un module natif, et un binaire absent
 * ne doit pas faire tomber le worker. Il rend alors `cause: 'decodeur'` : le
 * média reste en attente (`persisting`), il n'est ni livré ni compté abîmé.
 */
export class DecodeurSharp implements DecodeurMedia {
  readonly #video?: (octets: Uint8Array) => Promise<ResultatDecodage>;
  readonly #videoActif: () => boolean;

  /**
   * `video` · le décodeur vidéo réel ; `videoActif` · la preuve qu'il marche
   * MAINTENANT (sonde fraîche). Sans `videoActif`, un décodeur fourni est
   * toujours actif (tests, injection explicite).
   */
  constructor(options: { video?: (octets: Uint8Array) => Promise<ResultatDecodage>; videoActif?: () => boolean } = {}) {
    if (options.video) this.#video = options.video;
    this.#videoActif = options.videoActif ?? (() => true);
  }

  /** Absent tant que la capacité vidéo n'est pas prouvée · le moteur refuse alors l'animation avant soumission. */
  get decoderVideo(): ((octets: Uint8Array) => Promise<ResultatDecodage>) | undefined {
    return this.#video && this.#videoActif() ? this.#video : undefined;
  }

  async decoderImage(octets: Uint8Array): Promise<ResultatDecodage> {
    let sharp: typeof import('sharp');
    try {
      ({ default: sharp } = await import('sharp'));
    } catch (e) {
      return { ok: false, cause: 'decodeur', raison: `décodeur d'images indisponible · ${(e as Error).message}` };
    }
    try {
      const { data, info } = await sharp(octets, { failOn: 'warning' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { ok: true, largeur: info.width, hauteur: info.height, canaux: info.channels, octetsPixels: data.length };
    } catch (e) {
      return { ok: false, cause: 'contenu', raison: `décodage refusé · ${((e as Error).message ?? '').split('\n')[0]!.slice(0, 200)}` };
    }
  }
}
