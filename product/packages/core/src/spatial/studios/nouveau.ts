import type { TypeNouveauProjet } from '../../studios/ux/nouveau-projet';
import type { EtapeAssistant } from '../../studios/ux/assistant-projet';

/**
 * Spatial · « Nouveau projet » (`/studio/projets/nouveau`, maquette `nouveau`). Pur.
 *
 * L'assistant de création RÉEL (le parcours V5 en cinq étapes : brief
 * structuré, stratégie, direction, format & devis, créations) vit dans cet
 * écran. La maquette dessine quatre étapes (Que créer ? → Style → Brief →
 * Format & devis) · on garde ses quatre puces, ALIGNÉES sur l'ordre réel :
 * le brief vient avant le style, parce que le projet se crée (gratuitement) à
 * partir du brief, et que la stratégie et la direction opèrent sur le projet
 * créé (cycle de propositions relues). La puce « Format & devis » porte le
 * devis serveur, sa confirmation et le suivi des créations.
 */

export interface LivrableSpatial { type: TypeNouveauProjet; icone: string; titre: string; sous: string }

/** Les quatre livrables de la maquette, sur les quatre types RÉELS d'un projet (`TYPES_NOUVEAU_PROJET`). */
export const LIVRABLES_SPATIAL: readonly LivrableSpatial[] = [
  { type: 'ads', icone: 'spark', titre: 'Publicité', sous: 'Visuel + textes d’annonce, Meta et TikTok' },
  { type: 'image', icone: 'img', titre: 'Image', sous: 'Visuel produit ou lifestyle' },
  { type: 'text', icone: 'text', titre: 'Textes', sous: 'Accroches, texte principal, CTA' },
  { type: 'video', icone: 'phone', titre: 'Vidéo', sous: 'Storyboard, plans et voix · devis avant génération' },
];

export type CleDepartSpatial = 'zero' | 'veille' | 'test';

export interface DepartSpatial { cle: CleDepartSpatial; icone: string; titre: string; sous: string; origine: 'veille' | 'iteration' | null }

/**
 * Les trois points de départ · « zéro » efface le départ repris ; la Veille et
 * le test ouvrent le panneau de choix (lecture seule, relue au serveur) · le
 * départ choisi pré-remplit le brief, rien n'est créé avant « Continuer ».
 */
export const DEPARTS_SPATIAL: readonly DepartSpatial[] = [
  { cle: 'zero', icone: 'brush', titre: 'Partir de zéro', sous: 'Tu écris le brief, Jarvis aide ensuite', origine: null },
  { cle: 'veille', icone: 'eye', titre: 'Depuis la Veille', sous: 'Une annonce sauvegardée devient la source du projet', origine: 'veille' },
  { cle: 'test', icone: 'loop', titre: 'Itérer sur un test', sous: 'Reprend l’apprentissage d’une gagnante arbitrée', origine: 'iteration' },
];

export interface EtapeNouveauSpatial {
  n: number;
  libelle: string;
  classe: '' | 'on' | 'done';
  /** L'étape de l'assistant où mène la puce (la première de son groupe). */
  cible: EtapeAssistant;
}

/** Les quatre puces · l'ordre RÉEL (brief avant style). */
export const ETAPES_NOUVEAU_SPATIAL: ReadonlyArray<{ libelle: string; cible: EtapeAssistant; groupe: readonly EtapeAssistant[] }> = [
  { libelle: 'Que créer ?', cible: 'start', groupe: ['start'] },
  { libelle: 'Brief', cible: 'brief', groupe: ['brief'] },
  { libelle: 'Stratégie & style', cible: 'strategie', groupe: ['strategie', 'direction'] },
  { libelle: 'Format & devis', cible: 'format', groupe: ['format', 'confirm', 'creation'] },
];

/** Le numéro de puce (1 à 4) d'une étape de l'assistant. */
export function numeroEtapeNouveau(e: EtapeAssistant): number {
  const i = ETAPES_NOUVEAU_SPATIAL.findIndex((x) => x.groupe.includes(e));
  return i < 0 ? 1 : i + 1;
}

export function etapesNouveauSpatial(courante: EtapeAssistant): EtapeNouveauSpatial[] {
  const k = numeroEtapeNouveau(courante);
  return ETAPES_NOUVEAU_SPATIAL.map((x, i) => ({ n: i + 1, libelle: x.libelle, cible: x.cible, classe: i + 1 < k ? 'done' : i + 1 === k ? 'on' : '' }));
}

/** La phrase de la barre d'action, par étape · ce qui est gratuit l'est dit, ce qui coûte n'y est jamais dit gratuit. */
export function infoEtapeNouveau(e: EtapeAssistant): string {
  const n = `Étape ${numeroEtapeNouveau(e)} sur ${ETAPES_NOUVEAU_SPATIAL.length}`;
  switch (e) {
    case 'start': return n;
    case 'brief': return `${n} · gratuit, rien n’est généré`;
    case 'strategie':
    case 'direction': return `${n} · Jarvis annonce son prix avant le clic`;
    case 'format': return `${n} · le devis ne débite rien`;
    case 'confirm': return `${n} · aucun débit avant ta confirmation`;
    case 'creation': return `${n} · suivi en lecture, rien n’est relancé`;
  }
}

/** Le titre et la phrase d'introduction de chaque étape (V5 · `wzhead`), selon le livrable. */
export function enTeteEtapeNouveau(e: EtapeAssistant, type: TypeNouveauProjet): { titre: string; texte: string } {
  switch (e) {
    case 'start': return { titre: 'Que veux-tu créer ?', texte: 'Un projet réunit le brief, les références, la direction, les créations et les exports.' };
    case 'brief': return { titre: 'Le brief', texte: 'Décris l’objectif. Jarvis s’appuie sur ces éléments à chaque étape.' };
    case 'strategie': return { titre: 'La stratégie', texte: 'Jarvis relie ton audience à un désir, puis propose des angles. Rien n’est appliqué sans ton choix.' };
    case 'direction': return { titre: 'Le style', texte: 'La direction à partir de l’angle choisi · concept, accroche, intention de style et appel à l’action. Modifie ce que tu veux avant de valider.' };
    case 'format': return type === 'video'
      ? { titre: 'Storyboard & devis', texte: 'Le storyboard et la vidéo se préparent dans l’atelier vidéo du projet · chaque appel payant y annonce son prix avant le clic.' }
      : type === 'text'
        ? { titre: 'Textes & devis', texte: 'Les textes se rédigent dans l’atelier textes du projet · chaque appel payant y annonce son prix avant le clic.' }
        : { titre: 'Formats & devis', texte: 'Choisis les formats. Le devis serveur correspond exactement à tes paramètres.' };
    case 'confirm': return { titre: 'Confirmer la génération', texte: 'Vérifie les paramètres et le coût avant tout débit.' };
    case 'creation': return { titre: 'Tes créations', texte: 'L’état réel des tâches lancées, relu tant qu’elles travaillent.' };
  }
}

/** Le bandeau Jarvis · ce que Jarvis fait VRAIMENT, et où (proposition payante annoncée, sur le projet créé). */
export const JARVIS_NOUVEAU = {
  titre: 'Jarvis propose à chaque étape',
  sous: 'Une fois le projet créé (gratuit), Jarvis propose angles et direction depuis ta fiche marque et tes sources · chaque proposition annonce son prix avant le clic.',
} as const;
