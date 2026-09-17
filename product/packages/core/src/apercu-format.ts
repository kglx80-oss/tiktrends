import type { ProductionMode } from './production-mode';

/**
 * Consulter et exporter une pub à un FORMAT · ce qui est honnête, décidé ici.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 *
 * Le détail d'une pub propose des cadres (9:16, 4:5, 1:1). Pour une COMPOSÉE,
 * c'est nous qui écrivons le texte · la maquette se recompose au cadre demandé,
 * le texte reste en zones sûres · une vraie adaptation. Pour une ENTIÈRE, le
 * modèle a cuit le texte DANS l'image à son propre ratio · aucun cadre ne la
 * recompose sans régénérer (chemin payant). Lui proposer d'autres cadres laissait
 * croire à une adaptation là où il n'y a qu'un recadrage · et exporter un cadre
 * différent de celui consulté trahit « aperçu = fichier ».
 *
 * Cette règle tranche · pour une entière, un seul format vaut (l'origine), on le
 * consulte ET on l'exporte, et la limite est dite. Pure, éprouvable sans rendu.
 */

export type RatioApercu = '9:16' | '4:5' | '1:1';
export const RATIOS_APERCU: readonly RatioApercu[] = ['9:16', '4:5', '1:1'] as const;

export interface FormatApercu {
  /** Le cadre se choisit-il · faux pour une entière (un seul format vaut). */
  choixCadre: boolean;
  /** Vrai si changer de cadre RECOMPOSE (composée) · faux si ça ne fait qu'ajouter
   *  des marges autour de l'origine (entière). */
  adaptation: boolean;
  /** Ce que le bouton de téléchargement annonce. */
  libelleTelechargement: string;
  /** La limite dite en clair · vide quand il n'y a rien à préciser (composée). */
  note: string;
}

export function formatApercu(mode: ProductionMode | null | undefined, ratio: RatioApercu): FormatApercu {
  if (mode !== 'entiere') {
    return { choixCadre: true, adaptation: true, libelleTelechargement: `Télécharger (${ratio})`, note: '' };
  }
  return {
    choixCadre: false,
    adaptation: false,
    libelleTelechargement: 'Télécharger l’original',
    note: 'Pub entière · le texte est dans l’image. Elle se consulte et s’exporte à son format d’origine · les autres cadres n’ajouteraient que des marges, sans recomposer. Une vraie adaptation demanderait de régénérer.',
  };
}
