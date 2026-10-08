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
 * Vidéo · AUCUN décodeur : ni ffmpeg ni ffprobe dans le worker ni sur la
 * machine de développement. `decoderVideo` est donc absent : une vidéo n'est
 * jamais déclarée lisible, elle est refusée comme non vérifiable, et le worker
 * ne soumet aucune opération d'animation. Le point d'injection existe
 * (`options.video`) ; le brancher demande un décodeur réel sur le VPS
 * (ffprobe/ffmpeg, décision du propriétaire), jamais un faux.
 *
 * `sharp` est chargé à la demande : c'est un module natif, et un binaire absent
 * ne doit pas faire tomber le worker. Il rend alors `cause: 'decodeur'` : le
 * média reste en attente (`persisting`), il n'est ni livré ni compté abîmé.
 */
export class DecodeurSharp implements DecodeurMedia {
  readonly decoderVideo?: (octets: Uint8Array) => Promise<ResultatDecodage>;

  constructor(options: { video?: (octets: Uint8Array) => Promise<ResultatDecodage> } = {}) {
    if (options.video) this.decoderVideo = options.video;
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
