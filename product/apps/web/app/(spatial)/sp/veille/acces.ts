import 'server-only';
import { FEATURES, canAccess, denyReason, PLAN_LABEL, type Access } from '../../../../lib/rbac';

const Radar = FEATURES.find((f) => f.key === 'radar')!;

/**
 * La pastille de l'onglet Radar (sous-navigation de la Veille) · l'offre qui
 * l'ouvre, en capitales, seulement quand le Radar est FERMÉ à cet espace pour
 * une raison d'offre. Ouvert, ou fermé par le rôle · aucune pastille.
 */
export function pastilleRadar(access: Access): string | null {
  if (canAccess(access, Radar) || denyReason(access, Radar) !== 'plan') return null;
  return PLAN_LABEL[Radar.minPlan].toLocaleUpperCase('fr-FR');
}
