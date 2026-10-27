import type { ReactNode } from 'react';
import { EnTete, Ic, SousNav, Vue } from '../../communs';

/**
 * L'écran fermé d'une page de la Veille · même contrôle que l'ancienne
 * interface (`canAccess` sur la fonctionnalité Veille), la raison RÉELLE dite ·
 * formule ou rôle. Aucun lien d'achat ici, comme l'ancienne interface.
 */
export function AccesFerme({ titre, sousNav, actif, raison }: { titre: string; sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>; actif: string; raison: 'plan' | 'role' }) {
  return (
    <Vue>
      <EnTete titre={titre} />
      <SousNav items={sousNav} actif={actif} />
      <div className="dempty"><span className="ico"><Ic n="lock" s={false} /></span>
        <h3>{raison === 'plan' ? 'Inclus dès la formule Core' : 'Accès réservé'}</h3>
        <p className="muted">{raison === 'plan' ? 'Les formats et les tendances font partie de la Veille, ouverte à partir de la formule Core.' : 'Ton rôle ne permet pas d’accéder à la Veille.'}</p>
      </div>
    </Vue>
  );
}
