import type { ReactNode } from 'react';
import { sousNavAtelier } from '@tiktrends/core';
import { EnTete, SousNav } from '../../communs';

/**
 * L'en-tête commun des ateliers d'un projet (produit, textes, identités et
 * voix, export) · le titre de l'atelier, la marque et le projet, puis la
 * rangée `seg subnav` de la maquette (fiche du projet, ateliers ACTIFS de
 * l'espace · `sousNavAtelier`). Sans état · rendu par les vues clientes.
 */
export function EnTeteAtelier({ titre, projet, atelier, actif, aide }: {
  titre: string;
  projet: { id: string; title: string; marque: string; versionN: number };
  atelier: ReadonlyArray<{ segment: string; href: string | null }>;
  actif: string;
  aide?: ReactNode;
}) {
  return (
    <>
      <EnTete titre={titre} sous={`${projet.marque ? `${projet.marque} · ` : ''}${projet.title} · version ${projet.versionN}`} />
      <SousNav items={sousNavAtelier(projet.id, atelier)} actif={actif} />
      {aide != null && <p className="faint" style={{ fontSize: '12.5px', margin: '0 0 14px' }}>{aide}</p>}
    </>
  );
}
