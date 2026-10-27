import type { ReactNode } from 'react';
import { EnTete, Lien, SousNav, Vue } from '../../communs';

/**
 * « Accès partenaires » · `docs/spatial/reference/partenaires.html` (maquette :
 * `vPart`). Aucune donnée de partenaire n'existe en base (ni accès externe, ni
 * droits fins, ni plafond par personne, ni journal d'activité) · l'écran montre
 * l'état vide de la maquette (« Aucun partenaire pour l’instant ») et la seule
 * voie réelle aujourd'hui : inviter la personne comme membre de l'équipe.
 */
export interface PropsPartenaires {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  /** L'invitation réelle d'un membre (`/team`) · `null` sans droit. */
  equipe: string | null;
}

export function Partenaires(p: PropsPartenaires) {
  return (
    <Vue>
      <EnTete titre="Accès partenaires" sous="Ton agence ou ton freelance travaille dans ton compte · tu décides de ce qu’il peut faire" />
      <SousNav items={p.sousNav} actif="/settings/partenaires" />
      <div style={{ display: 'grid', gap: 16 }}>
        <section className="tile">
          <p className="faint" style={{ margin: 0 }}>Aucun partenaire pour l’instant · les accès partenaires (droits à la carte, plafond de crédits, fin d’accès) ne sont pas encore disponibles. En attendant, invite ton agence ou ton freelance comme membre de l’équipe, avec le rôle qui convient.</p>
        </section>
        {p.equipe && <div><Lien className="btn sm" href={p.equipe}>Inviter depuis l’équipe</Lien></div>}
      </div>
    </Vue>
  );
}
