import { EnTete, Vue } from '../../communs';
import { EtatVide } from '../veille/base';

/**
 * « Tagging » · vague 4 · l'écran V5 `/tags` n'a pas de fragment de maquette ·
 * l'état vide de la maquette (`div.dempty`). L'écran V5 n'affichait qu'un
 * échantillon de démonstration · la règle « rien de simulé » l'emporte (aucun
 * chiffre d'exemple), la limite est dite, et la seule sortie est réelle (les
 * apprentissages de Résultats), ou absente.
 */
export function Tagging({ etat, sortie }: { etat: { titre: string; texte: string }; sortie: { href: string; libelle: string } | null }) {
  return (
    <Vue>
      <EnTete titre="Tagging" sous="Tes créas analysées par ingrédient créatif" />
      <EtatVide icone="tag" titre={etat.titre} texte={etat.texte} action={sortie} />
    </Vue>
  );
}
