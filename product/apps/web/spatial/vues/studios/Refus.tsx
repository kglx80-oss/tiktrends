import type { ReactNode } from 'react';
import type { RefusStudiosSpatial } from '@tiktrends/core';
import { EnTete, Lien, SousNav, Vue } from '../../communs';
import { TuileVide } from './briques';

/** Un écran Studios refusé (capacité coupée, offre, rôle, panne) · en-tête de la maquette et état honnête. */
export function RefusStudios({ titre, sous, sousNav, actif, refus }: {
  titre: string; sous: string; sousNav?: ReadonlyArray<{ href: string; libelle: ReactNode }>; actif?: string; refus: RefusStudiosSpatial;
}) {
  return (
    <Vue>
      <EnTete titre={titre} sous={sous} />
      {sousNav && actif && <SousNav items={sousNav} actif={actif} />}
      <TuileVide titre={refus.titre} texte={refus.texte}
        action={refus.lien ? <Lien className="btn sm" href={refus.lien.href} style={{ marginTop: 12 }}>{refus.lien.libelle}</Lien> : undefined} />
    </Vue>
  );
}
