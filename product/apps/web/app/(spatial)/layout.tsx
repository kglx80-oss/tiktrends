import type { ReactNode } from 'react';
import { chargerCoquille } from '../../lib/spatial/coquille';
import { Coquille } from '../../spatial/coquille/Coquille';
// Les SEULES feuilles de l'arbre Spatial · celle de la maquette, telle quelle,
// puis ses dérivées mécaniques (couleurs par adresse, `deriverRoutesCss` ;
// thème clair sous `html[data-theme="clair"]`, `deriverThemeClairCss`). Ni
// Tailwind ni les jetons V5 (`globals.css`) n'entrent ici · c'est ce qui
// garantit le pixel perfect (garde `spatial-fondation`).
import '../../spatial/spatial.css';
import '../../spatial/spatial-routes.css';
import '../../spatial/spatial-clair.css';

export const dynamic = 'force-dynamic';

/**
 * L'arbre Spatial (nouvelle DA, mandat Kevin du 27/10). Servi sous `/sp/…`,
 * jamais vu du navigateur · le middleware y réécrit les écrans PORTÉS quand
 * `tt_ui=spatial` (`ecranSpatial`, noyau). Mêmes gardes que la coquille V5.
 */
export default async function SpatialLayout({ children }: { children: ReactNode }) {
  const donnees = await chargerCoquille();
  return <Coquille donnees={donnees}>{children}</Coquille>;
}
