/**
 * Une décision à la fois · le studio Image, guidé.
 *
 * Même principe que `assistant-pub` · le studio Image était une barre unique où
 * le produit, la photo, la description, la direction, le format, le nombre et le
 * moteur se prenaient tous de front. On ordonne · une décision, puis la suivante.
 *
 * Ce fichier dit l'ORDRE, ce qui rend une étape complète, et ce qui MANQUE
 * quand elle ne l'est pas · rien d'autre (pas de couleur, pas de fenêtre). La
 * règle « on ne passe pas à la suite tant que ce n'est pas fait » vit dans une
 * fonction pure qu'un test exerce, pas dans une condition d'affichage.
 *
 * L'ordre suit ce qui CONTRAINT le reste · le produit et sa photo d'abord (ils
 * décident de la fidélité), la scène ensuite (ce qu'on veut voir), le style
 * après (il s'applique à une scène déjà décrite), le volume en dernier (il ne
 * change ni le sujet ni le style · seulement combien et avec quel moteur).
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export const ETAPES_IMAGE = ['produit', 'scene', 'style', 'volume'] as const;
export type EtapeImage = typeof ETAPES_IMAGE[number];

export const ETAPE_IMAGE_TITRE: Record<EtapeImage, string> = {
  produit: 'Le produit',
  scene: 'La scène',
  style: 'La direction artistique',
  volume: 'Combien, et avec quel moteur',
};

export const ETAPE_IMAGE_ROLE: Record<EtapeImage, string> = {
  produit: 'Le produit mis en scène et sa photo · c’est elle qui garde le vrai packaging.',
  scene: 'Ce que tu veux voir autour du produit · la description.',
  style: 'Cadrage, lumière, finition · le même catalogue que Pubs IA.',
  volume: 'Le format, le nombre de visuels et le moteur qui les produit.',
};

/** L'état réduit à ce qui décide de l'avancement. */
export interface EtatAssistantImage {
  /** « i2i » met en scène une photo produit · « t2i » part du texte seul. */
  mode: 'i2i' | 't2i';
  /** Une source produit est prête (photo téléversée, lien, ou photo enregistrée). */
  aPhotoProduit: boolean;
  /** La description de la scène. */
  description: string;
  /** Direction artistique · vide vaut « variées ». */
  direction: string;
  /** Format (ratio). */
  ratio: string;
  /** Nombre de visuels. */
  nombre: number;
  /** Moteur d'image. */
  moteur: string;
}

/**
 * Ce qui manque à une étape · une PHRASE, jamais un booléen muet. Un « Suivant »
 * grisé sans raison est le défaut qu'on corrige, pas qu'on reproduit.
 */
export function manqueImage(e: EtapeImage, s: EtatAssistantImage): string {
  switch (e) {
    case 'produit':
      // En texte→image, aucune photo n'est requise · c'est un choix légitime.
      // En mise en scène, la photo EST le sujet · l'exiger évite une génération
      // générique qui perd le vrai packaging.
      if (s.mode === 'i2i' && !s.aPhotoProduit) return 'Ajoute une photo de ton produit (ou passe en Texte → Image).';
      return '';
    case 'scene':
      if (!s.description.trim()) return 'Décris la scène que tu veux générer.';
      return '';
    case 'style':
      // « Variées » est un choix · rien à exiger.
      return '';
    case 'volume':
      if (!s.moteur) return 'Choisis un moteur d’image.';
      if (!Number.isFinite(s.nombre) || s.nombre < 1) return 'Indique combien de visuels générer.';
      return '';
  }
}

export function etapeImageComplete(e: EtapeImage, s: EtatAssistantImage): boolean {
  return manqueImage(e, s) === '';
}

export function rangEtapeImage(e: EtapeImage): number {
  return ETAPES_IMAGE.indexOf(e);
}

/** Toutes les étapes d'avant doivent être complètes · on ne saute pas une décision. */
export function etapeImageAccessible(e: EtapeImage, s: EtatAssistantImage): boolean {
  return ETAPES_IMAGE.slice(0, rangEtapeImage(e)).every((p) => etapeImageComplete(p, s));
}

/** La première étape non faite · `null` quand tout l'est. */
export function premiereImageIncomplete(s: EtatAssistantImage): EtapeImage | null {
  return ETAPES_IMAGE.find((e) => !etapeImageComplete(e, s)) ?? null;
}

/** Peut-on lancer ? Toutes les étapes, sans exception. */
export function peutGenererImage(s: EtatAssistantImage): boolean {
  return premiereImageIncomplete(s) === null;
}

export function etapeImageSuivante(e: EtapeImage): EtapeImage | null {
  return ETAPES_IMAGE[rangEtapeImage(e) + 1] ?? null;
}

export function etapeImagePrecedente(e: EtapeImage): EtapeImage | null {
  const i = rangEtapeImage(e);
  return i > 0 ? ETAPES_IMAGE[i - 1]! : null;
}

export interface LigneRecapImage { etape: EtapeImage; titre: string; valeur: string }

/** Ce qu'on s'apprête à lancer, relu avant de payer. */
export function recapitulatifImage(s: EtatAssistantImage, libelles: { direction?: string; moteur?: string }): LigneRecapImage[] {
  return [
    {
      etape: 'produit', titre: ETAPE_IMAGE_TITRE.produit,
      valeur: s.mode === 'i2i' ? (s.aPhotoProduit ? 'Photo produit prête' : 'Aucune photo') : 'Texte → Image (sans photo)',
    },
    { etape: 'scene', titre: ETAPE_IMAGE_TITRE.scene, valeur: s.description.trim() ? s.description.trim().slice(0, 70) : 'à décrire' },
    { etape: 'style', titre: ETAPE_IMAGE_TITRE.style, valeur: libelles.direction || 'Variées' },
    { etape: 'volume', titre: ETAPE_IMAGE_TITRE.volume, valeur: `${s.nombre} visuel(s) · ${s.ratio} · ${libelles.moteur || s.moteur}` },
  ];
}
