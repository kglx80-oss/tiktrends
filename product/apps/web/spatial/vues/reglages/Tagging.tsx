import { EnTete, Vue } from '../../communs';
import { EtatVide } from '../veille/base';
import { TagsVeille, type DonneesTags } from './tags-client';

/**
 * « Tagging » · vague 4 · l'écran V5 `/tags` n'a pas de fragment de maquette ·
 * l'état vide de la maquette (`div.dempty`). L'écran V5 n'affichait qu'un
 * échantillon de démonstration · la règle « rien de simulé » l'emporte (aucun
 * chiffre d'exemple), la limite est dite, et la seule sortie est réelle (les
 * apprentissages de Résultats), ou absente.
 *
 * Lot 6 V5 · au-dessus, les TAGS DE VEILLE réels (VB TG01 à TG04) · le
 * vocabulaire de la marque active, compté sur ses sauvegardes · absent quand
 * le rôle n'ouvre pas la Veille (`tags` nul).
 */
export function Tagging({ etat, sortie, tags = null }: { etat: { titre: string; texte: string }; sortie: { href: string; libelle: string } | null; tags?: DonneesTags | null }) {
  return (
    <Vue>
      <EnTete titre="Tagging" sous="Tes tags de Veille, puis l’analyse de tes créas par ingrédient créatif" />
      {tags && <TagsVeille donnees={tags} />}
      <EtatVide icone="tag" titre={etat.titre} texte={etat.texte} action={sortie} />
    </Vue>
  );
}
