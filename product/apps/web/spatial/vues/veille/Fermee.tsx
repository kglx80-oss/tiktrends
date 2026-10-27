import { EnTete, Vue } from '../../communs';
import { EtatVide, SousNavVeille } from './base';

/**
 * Un écran de la Veille FERMÉ à cette session (offre ou rôle) · la raison
 * réelle (`denyReason`), et la seule sortie qui existe pour ce rôle. Aucun
 * aperçu des données, aucun bouton d'achat simulé.
 */
export function VeilleFermee({ titre, actif, pastilleRadar, raison, texte, action }: {
  titre: string; actif: string; pastilleRadar: string | null; raison: string; texte: string; action: { href: string; libelle: string } | null;
}) {
  return (
    <Vue>
      <EnTete titre={titre} sous={raison} />
      <SousNavVeille actif={actif} pastilleRadar={pastilleRadar} />
      <EtatVide icone="lock" titre={raison} texte={texte} action={action} />
    </Vue>
  );
}
