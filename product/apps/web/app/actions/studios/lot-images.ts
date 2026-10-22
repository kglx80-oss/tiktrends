'use server';
import { decisionFournisseurStudio } from '@tiktrends/core';
import { gardeStudio } from '../../../lib/studios/garde';
import { refusCapacite, refusCapacitesDevis } from '../../../lib/studios/interrupteurs';
import { getSession } from '../../../lib/auth';
import { unlimitedCredits } from '../../../lib/credits';
import { spendStatus } from '../../../lib/spend-guard';
import { preparerLotImagesPour, approuverLotImagesPour, lireLotImagesPour, type EntreeLotImages, type ConfirmationLotImages } from '../../../lib/studios/image/lot-images';
export async function preparerLotImages(e: EntreeLotImages) {
  const g = await gardeStudio('studio.generate', 'generation_image');
  if (!g.ok) return g;
  const visionCoupee = await refusCapacite(g.ctx, ['controle_visuel']);
  return preparerLotImagesPour(g.ctx, { ...e, controleVision: visionCoupee || e?.controleVision === false ? false : undefined });
}
export async function lireLotImages(e: { lotId: unknown }) {
  const g = await gardeStudio('studio.read');
  return g.ok ? lireLotImagesPour(g.ctx, e?.lotId) : g;
}
export async function approuverLotImages(e: ConfirmationLotImages) {
  const g = await gardeStudio('studio.generate', 'generation_image');
  if (!g.ok) return g;
  const [session, plafond] = await Promise.all([getSession(), spendStatus()]);
  return approuverLotImagesPour(g.ctx, e, { illimite: unlimitedCredits(session?.user.email), fournisseurImage: decisionFournisseurStudio(process.env).ok,
    plafond: { capUsd: plafond.capUsd, depenseUsd: plafond.spentUsd, bloque: plafond.blocked }, verifierDevis: id => refusCapacitesDevis(g.ctx, id) });
}
