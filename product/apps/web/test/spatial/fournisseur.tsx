import type { ReactNode } from 'react';
import { FournisseurSpatial, type CtxSpatial } from '../../spatial/coquille/contexte';

/**
 * Les tests PORTÉS de l'ancienne interface vers Spatial · une vue Spatiale se
 * rend dans le contexte de la coquille (toast, crédits, surcouches). Ce
 * fournisseur minimal n'ajoute aucun comportement · `toast` est observable.
 */
export const CTX_TEST: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 100, dotation: 200, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};

export function avecSpatial(n: ReactNode, ctx: CtxSpatial = CTX_TEST) {
  return <FournisseurSpatial value={ctx}>{n}</FournisseurSpatial>;
}
