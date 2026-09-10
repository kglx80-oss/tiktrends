/**
 * Une décision à la fois · le studio Vidéo, guidé.
 *
 * Même principe que `assistant-pub` / `assistant-image`. La vidéo a moins de
 * leviers · le point de départ (texte seul, ou une image à animer), le mouvement
 * décrit, puis le format et la durée. On les ordonne, une décision puis la
 * suivante, et on dit ce qui MANQUE plutôt que de refuser au clic.
 *
 * L'ordre suit ce qui contraint le reste · le point de départ d'abord (une image
 * à animer change tout ce qu'on peut demander ensuite), le mouvement ensuite, le
 * format et la durée en dernier (ils ne changent ni le sujet ni le geste).
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export const ETAPES_VIDEO = ['depart', 'mouvement', 'format'] as const;
export type EtapeVideo = typeof ETAPES_VIDEO[number];

export const ETAPE_VIDEO_TITRE: Record<EtapeVideo, string> = {
  depart: 'Le point de départ',
  mouvement: 'Le mouvement',
  format: 'Format et durée',
};

export const ETAPE_VIDEO_ROLE: Record<EtapeVideo, string> = {
  depart: 'Partir d’un texte seul, ou animer une image existante (produit, pub).',
  mouvement: 'Ce qui bouge dans le plan · caméra, sujet, ambiance.',
  format: 'Le cadrage et la durée · la durée décide du prix.',
};

export interface EtatAssistantVideo {
  /** « i2v » anime une image de départ · « t2v » part du texte seul. */
  mode: 'i2v' | 't2v';
  /** Une image de départ est prête (sélectionnée, déposée ou par lien). */
  imagePrete: boolean;
  /** Le mouvement décrit · facultatif en animation d'image. */
  description: string;
  /** Format (ratio). */
  ratio: string;
  /** Durée en secondes. */
  duree: number;
}

export function manqueVideo(e: EtapeVideo, s: EtatAssistantVideo): string {
  switch (e) {
    case 'depart':
      // Animer une image SANS image est le refus qui n'apparaissait qu'au clic.
      if (s.mode === 'i2v' && !s.imagePrete) return 'Ajoute une image de départ à animer (ou passe en Texte → Vidéo).';
      return '';
    case 'mouvement':
      // En animation d'image, le moteur sait animer sans consigne · l'exiger
      // serait une contrainte inventée. En texte seul, il faut bien décrire.
      if (s.mode === 't2v' && !s.description.trim()) return 'Décris la vidéo à générer.';
      return '';
    case 'format':
      if (!Number.isFinite(s.duree) || s.duree < 1) return 'Choisis une durée.';
      return '';
  }
}

export function etapeVideoComplete(e: EtapeVideo, s: EtatAssistantVideo): boolean {
  return manqueVideo(e, s) === '';
}

export function rangEtapeVideo(e: EtapeVideo): number {
  return ETAPES_VIDEO.indexOf(e);
}

export function etapeVideoAccessible(e: EtapeVideo, s: EtatAssistantVideo): boolean {
  return ETAPES_VIDEO.slice(0, rangEtapeVideo(e)).every((p) => etapeVideoComplete(p, s));
}

export function premiereVideoIncomplete(s: EtatAssistantVideo): EtapeVideo | null {
  return ETAPES_VIDEO.find((e) => !etapeVideoComplete(e, s)) ?? null;
}

export function peutGenererVideo(s: EtatAssistantVideo): boolean {
  return premiereVideoIncomplete(s) === null;
}

export function etapeVideoSuivante(e: EtapeVideo): EtapeVideo | null {
  return ETAPES_VIDEO[rangEtapeVideo(e) + 1] ?? null;
}

export function etapeVideoPrecedente(e: EtapeVideo): EtapeVideo | null {
  const i = rangEtapeVideo(e);
  return i > 0 ? ETAPES_VIDEO[i - 1]! : null;
}

export interface LigneRecapVideo { etape: EtapeVideo; titre: string; valeur: string }

export function recapitulatifVideo(s: EtatAssistantVideo): LigneRecapVideo[] {
  return [
    { etape: 'depart', titre: ETAPE_VIDEO_TITRE.depart, valeur: s.mode === 'i2v' ? (s.imagePrete ? 'Image à animer prête' : 'Aucune image') : 'Texte → Vidéo' },
    { etape: 'mouvement', titre: ETAPE_VIDEO_TITRE.mouvement, valeur: s.description.trim() ? s.description.trim().slice(0, 70) : (s.mode === 'i2v' ? 'Mouvement libre' : 'à décrire') },
    { etape: 'format', titre: ETAPE_VIDEO_TITRE.format, valeur: `${s.ratio} · ${s.duree} s` },
  ];
}
