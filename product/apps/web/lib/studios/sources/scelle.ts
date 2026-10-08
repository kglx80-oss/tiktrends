import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ScellePropositions } from '@tiktrends/core';

/**
 * Scellé d'une proposition d'hypothèses · HMAC-SHA256 côté serveur.
 *
 * Les hypothèses proposées repartent au client (il les affiche, l'utilisateur
 * en choisit une) puis reviennent à la création du projet. Le scellé prouve
 * qu'elles viennent du serveur, pour CET espace, CETTE marque et CETTE
 * sélection (règle pure `propositionValidePour`). Sans lui, un client pourrait
 * présenter comme « proposée » une hypothèse de son cru, ou appliquer à la
 * marque B une réponse reçue pour la marque A (FLOW-03).
 *
 * Même clé que les sessions (`AUTH_SECRET`), dérivée par un préfixe d'usage ;
 * absente, une clé aléatoire par processus (même posture que `lib/auth.ts` :
 * jamais de secret en dur).
 */

const REPLI = randomBytes(48).toString('base64url');
function cle(): string {
  const s = process.env.AUTH_SECRET;
  return `studio-propositions:${s && s !== 'change-me' ? s : REPLI}`;
}

const signer = (corps: string) => createHmac('sha256', cle()).update(corps).digest('base64url');

export function signerScelle(s: ScellePropositions): string {
  const corps = Buffer.from(JSON.stringify(s), 'utf8').toString('base64url');
  return `${corps}.${signer(corps)}`;
}

export function lireScelle(jeton: unknown): ScellePropositions | null {
  if (typeof jeton !== 'string' || jeton.length > 8000) return null;
  const [corps, sig, reste] = jeton.split('.');
  if (!corps || !sig || reste !== undefined) return null;
  const attendu = Buffer.from(signer(corps));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const s = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8')) as ScellePropositions;
    if (s.v !== 1 || typeof s.workspaceId !== 'string' || typeof s.brandId !== 'string' || !Array.isArray(s.sourceIds) || !Array.isArray(s.hypotheses) || typeof s.expireLe !== 'number') return null;
    return s;
  } catch {
    return null;
  }
}
