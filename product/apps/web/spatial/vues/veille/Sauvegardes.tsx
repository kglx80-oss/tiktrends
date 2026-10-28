import { EnTete, Vue } from '../../communs';
import { EtatVide, SousNavVeille } from './base';
import { CollectionsSauvegardes, type GestesSauvegarde, type SauvegardeDonnees } from './sauvegardes-client';

/**
 * « Sauvegardes » · `docs/spatial/reference/sauvegardes.html`. Les créas
 * gardées de la marque active (`saved_ads`), rangées par collection (= leur
 * dossier réel). Sans sauvegarde, un état vide qui mène à la Veille.
 */
export function Sauvegardes({ items, pastilleRadar, creerProjet, gestes }: { items: ReadonlyArray<SauvegardeDonnees>; pastilleRadar: string | null; creerProjet: string; gestes?: GestesSauvegarde }) {
  return (
    <Vue>
      <EnTete titre="Sauvegardes" sous="Tes créas classées par collection, avec leur source" />
      <SousNavVeille actif="/saved" pastilleRadar={pastilleRadar} />
      {items.length > 0
        ? <CollectionsSauvegardes items={items} creerProjet={creerProjet} gestes={gestes} />
        : <EtatVide icone="bookmark" titre="Aucune créa sauvegardée pour l’instant" texte="Depuis Pubs du moment, le marque-page d’une carte garde la créa ici, avec sa source." action={{ href: '/veille', libelle: 'Ouvrir les pubs du moment' }} />}
    </Vue>
  );
}
