import 'server-only';
import sharp from 'sharp';
import { capaciteDetourage, controlerDetourage, type CapaciteDetourage, type ControleDetourage } from '@tiktrends/core';

/**
 * Studios · L5-A · détourage côté serveur (recette IMG-09).
 *
 * Aucun moteur n'est déployé (`capaciteDetourage()` le dit, avec ses replis).
 * Ce qui existe : le CONTRÔLE d'un PNG déjà détouré importé par la personne,
 * fait ici en Node (décodage `sharp`, pas de WebGPU, pas de thread d'interface
 * bloqué), et rendu comme un verdict avec ses constats.
 */

/** Plafond d'analyse · 40 mégapixels (un import plus grand est refusé, pas tronqué). */
export const PIXELS_MAX_DETOURAGE = 40_000_000;

export type AnalyseDetourage =
  | { ok: true; capacite: CapaciteDetourage; largeur: number; hauteur: number; controle: ControleDetourage }
  | { ok: false; capacite: CapaciteDetourage; raison: string };

export async function analyserDetourage(octets: Uint8Array): Promise<AnalyseDetourage> {
  const capacite = capaciteDetourage();
  let meta: sharp.Metadata;
  try { meta = await sharp(octets).metadata(); } catch { return { ok: false, capacite, raison: 'image illisible' }; }
  if (!meta.width || !meta.height) return { ok: false, capacite, raison: 'image sans dimensions' };
  if (meta.width * meta.height > PIXELS_MAX_DETOURAGE) return { ok: false, capacite, raison: `image trop grande pour l’analyse (${PIXELS_MAX_DETOURAGE} pixels au plus)` };
  if (!meta.hasAlpha) return { ok: false, capacite, raison: 'aucun canal de transparence · ce n’est pas une image détourée (importe un PNG transparent)' };
  const { data, info } = await sharp(octets).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  return { ok: true, capacite, largeur: info.width, hauteur: info.height, controle: controlerDetourage(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height) };
}
