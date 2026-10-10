import { contenuVide, type ContenuVersion, type PlanStudio } from '../src/studios/document';
import { SCHEMA_IDENTITE, type IdentiteStudio, type AttributIdentite } from '../src/studios/identites';

/**
 * Jeu L6-B · deux personnages structurés (Léa : veste verte, cheveux bruns,
 * lunettes ; Tom : veste rouge), deux plans vidéo qui les citent. Aucune
 * timeline : seules les images clés (et les fiches) sont générées, ce qui
 * garde le devis dans ce que le service sait vérifier (pas de clip vidéo).
 */

export function attr(id: string, categorie: AttributIdentite['categorie'], element: string, couleur: string | null): AttributIdentite {
  return { id, categorie, element, couleur, detail: '' };
}

export function lea(o: Partial<IdentiteStudio> = {}): IdentiteStudio {
  return {
    schema: SCHEMA_IDENTITE, identityId: 'perso_lea', nom: 'Léa', version: 1, vues: ['front', 'three_quarter'], description: 'Coureuse, la trentaine',
    attributs: [attr('attr_1', 'tenue', 'veste', 'verte'), attr('attr_2', 'cheveux', 'cheveux', 'bruns'), attr('attr_3', 'accessoire', 'lunettes', null)],
    ...o,
  };
}

export function tom(): IdentiteStudio {
  return { schema: SCHEMA_IDENTITE, identityId: 'perso_tom', nom: 'Tom', version: 1, vues: ['front'], description: '', attributs: [attr('attr_1', 'tenue', 'veste', 'rouge')] };
}

export function planVideo(shotId: string, refs: string[], o: Partial<PlanStudio> = {}): PlanStudio {
  return {
    shotId, purpose: 'accroche', subject: 'Léa court sur le quai', action: 'elle accélère', framing: 'plan moyen', camera: 'travelling latéral',
    lighting: 'lumière jaune du matin', environment: 'quai de gare', referenceIds: refs, narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000,
    ...o,
  };
}

/** Plan 1 cohérent (veste verte), plan 2 qui dit « jaune » : la contradiction de VIDEO-02. */
export function contenuContradictoire(): ContenuVersion {
  return {
    ...contenuVide(),
    characterRefs: { perso_lea: lea() as unknown as Record<string, unknown> },
    shots: {
      order: ['s1', 's2'],
      byId: {
        s1: planVideo('s1', ['perso_lea'], { subject: 'Léa en veste verte lace ses chaussures' }),
        s2: planVideo('s2', ['perso_lea'], { subject: 'Léa court en veste jaune, cheveux au vent', narration: 'On ne lâche rien.', speechMode: 'voiceover' }),
      },
    },
  };
}

export const copie = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
