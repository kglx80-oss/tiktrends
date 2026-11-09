import type { AffichageVeille, FiltresSauvegardes } from '@tiktrends/core';
import { EnTete, Vue } from '../../communs';
import { EtatVide, SousNavVeille } from './base';
import { CollectionsSauvegardes, type ContexteSauvegardes, type GestesSauvegarde, type SauvegardeDonnees } from './sauvegardes-client';

/**
 * « Sauvegardes » · `docs/spatial/reference/sauvegardes.html`. Les créas
 * gardées de la marque active (`saved_ads`), rangées par collection (= leur
 * dossier réel). Sans sauvegarde, un état vide qui mène à la Veille.
 */
export function Sauvegardes({ items, pastilleRadar, creerProjet, gestes, filtresInitiaux, collection, tagIgnore, contexte, affichage }: { items: ReadonlyArray<SauvegardeDonnees>; pastilleRadar: string | null; creerProjet: string; gestes?: GestesSauvegarde; filtresInitiaux?: FiltresSauvegardes; collection?: { cle: string; ignoree: boolean }; tagIgnore?: boolean; contexte?: ContexteSauvegardes; affichage?: AffichageVeille }) {
  return (
    <Vue>
      <EnTete titre="Sauvegardes" sous="Tes créas classées par collection, avec leur source" />
      <SousNavVeille actif="/saved" pastilleRadar={pastilleRadar} />
      {items.length > 0
        ? <CollectionsSauvegardes items={items} creerProjet={creerProjet} gestes={gestes} filtresInitiaux={filtresInitiaux} initiale={collection?.cle} collectionIgnoree={collection?.ignoree} tagIgnore={tagIgnore} contexte={contexte} affichage={affichage} />
        : <EtatVide icone="bookmark" titre="Aucune créa sauvegardée pour l’instant" texte="Depuis Pubs du moment, le marque-page d’une carte garde la créa ici, avec sa source." action={{ href: '/veille', libelle: 'Ouvrir les pubs du moment' }} />}
    </Vue>
  );
}
