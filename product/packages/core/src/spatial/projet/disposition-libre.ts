/**
 * Spatial · fiche projet · la DISPOSITION LIBRE du canvas (décision du chef de
 * projet : le canevas libre de la fiche V5 est porté, pas supprimé).
 *
 * Les couloirs fixes de la maquette restent la disposition PAR DÉFAUT. Le
 * contrôle « Disposition libre » bascule sur le canvas métier de la V5 (les
 * cartes dérivées du contenu de la version, `deriverCanvas`) : déplacer une
 * carte (souris ou flèches), réinitialiser. Le STOCKAGE est celui de la V5
 * (`enregistrerDispositionCanvas` · `app_settings`, une clé par personne et par
 * projet) · une disposition déjà enregistrée est relue telle quelle.
 *
 * Pur · aucune base, aucun réseau. Les phrases dites à l'écran (annonce
 * `aria-live`, retour d'enregistrement, raisons) vivent ici, testées.
 */

import type { ErreurStudio } from '../../studios/erreurs';
import type { CarteCanvas, EtatMediaCanvas } from '../../studios/canvas/modele';
import type { PointCanvas } from '../../studios/canvas/disposition';

export type ModeDispositionProjet = 'couloirs' | 'libre';

/** Le paramètre d'adresse qui porte le mode · `?disposition=libre`. */
export const PARAM_DISPOSITION = 'disposition';

/** Le mode lu dans l'adresse · seul `libre` ouvre le canvas libre, tout le reste garde les couloirs. */
export function modeDisposition(valeur: unknown): ModeDispositionProjet {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  return v === 'libre' ? 'libre' : 'couloirs';
}

/**
 * La recherche d'adresse pour un mode · les autres paramètres (`version`…)
 * sont gardés, `disposition` est posé (libre) ou retiré (couloirs).
 */
export function rechercheDisposition(recherche: string, mode: ModeDispositionProjet): string {
  const p = new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
  if (mode === 'libre') p.set(PARAM_DISPOSITION, 'libre');
  else p.delete(PARAM_DISPOSITION);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** L'état du média d'une carte, écrit en toutes lettres (jamais porté par la seule couleur). */
export const LIBELLE_MEDIA_CARTE: Readonly<Record<EtatMediaCanvas, string | null>> = {
  lie: 'Média lié à cette version',
  absent: 'Pas encore produit',
  sans_objet: null,
};

const SENS: ReadonlyArray<[number, number, string]> = [[-1, 0, 'à gauche'], [1, 0, 'à droite'], [0, -1, 'vers le haut'], [0, 1, 'vers le bas']];

/**
 * L'annonce d'un déplacement au clavier (`aria-live`) · la carte, le sens, et
 * la position atteinte. Un lecteur d'écran sait ce qui a bougé et où.
 */
export function annonceDeplacement(titre: string, dx: number, dy: number, position: PointCanvas | null): string {
  const sens = SENS.find(([x, y]) => Math.sign(dx) === x && Math.sign(dy) === y)?.[2];
  const ou = position ? ` · position ${Math.round(position.x)}, ${Math.round(position.y)}` : '';
  return `« ${titre} » déplacée${sens ? ` ${sens}` : ''}${ou}.`;
}

export type ResultatEnregistrementLibre =
  | { ok: true; reinitialise: boolean }
  | { ok: false; conflit: boolean; message: string }
  | { ok: false; coupure: true };

/** Ce que dit la zone `aria-live` · l'annonce du déplacement (clavier), puis le retour de l'enregistrement. */
export function texteZoneLibre(annonce: string | null, retour: { ton: 'ok' | 'err'; texte: string } | null): string {
  const r = retour ? `${retour.ton === 'err' ? 'Attention · ' : ''}${retour.texte}` : annonce ? 'Enregistrement de ta disposition…' : '';
  return [annonce, r].filter(Boolean).join(' ');
}

/** Le retour d'un enregistrement · ce qui est fait, ou pourquoi rien n'est écrit (positions gardées à l'écran). */
export function messageEnregistrementLibre(r: ResultatEnregistrementLibre): { ton: 'ok' | 'err'; texte: string } {
  if (r.ok) {
    return {
      ton: 'ok',
      texte: r.reinitialise
        ? 'Disposition réinitialisée · les cartes ont repris leur place automatique.'
        : 'Position enregistrée pour toi · l’ordre et les dépendances n’ont pas changé.',
    };
  }
  if ('coupure' in r) return { ton: 'err', texte: 'Position non enregistrée · connexion interrompue. Tes positions restent affichées ; réessaie en déplaçant la carte.' };
  if (r.conflit) return { ton: 'err', texte: `${r.message} Tes positions restent affichées ici.` };
  return { ton: 'err', texte: `Position non enregistrée · ${r.message} Tes positions restent affichées ; réessaie en déplaçant la carte.` };
}

/** Pourquoi le canvas libre n'est pas offert · un refus de lecture dit en clair (le contrôle reste visible, inactif). */
export function raisonCanevasIndisponible(e: Pick<ErreurStudio, 'code' | 'message' | 'traceId'>): string {
  if (e.code === 'UNSUPPORTED_CAPABILITY') return 'La disposition libre n’est pas activée pour cet espace.';
  if (e.code === 'FORBIDDEN' || e.code === 'AUTH_REQUIRED' || e.code === 'NOT_FOUND') return 'La disposition libre n’est pas accessible pour ce projet.';
  if (e.code === 'INVALID_SCHEMA') return `${e.message} Ouvre une version antérieure dans l’historique ou corrige le plan dans l’atelier Vidéo.`;
  return `${e.message} Identifiant support : ${e.traceId}.`;
}

/** Ce que la modification d'une carte rendrait obsolète en aval · rien n'est refait sans accord. */
export function phraseAvalCarte(aval: ReadonlyArray<Pick<CarteCanvas, 'nature'>>): string {
  if (aval.length === 0) return 'La modifier ne rend aucune autre sortie obsolète.';
  const g = aval.filter((c) => c.nature === 'generation').length;
  const k = aval.filter((c) => c.nature === 'calcul').length;
  return `La modifier rendrait obsolètes ${g} génération${g > 1 ? 's' : ''} et ${k} calcul${k > 1 ? 's' : ''} en aval · rien n’est refait sans ton accord.`;
}

/** L'aide de la barre d'outils en mode libre. */
export function aideCanevasLibre(nbCartes: number, deplacees: number): string {
  const cartes = `${nbCartes} carte${nbCartes > 1 ? 's' : ''}`;
  return deplacees > 0
    ? `${cartes} · ${deplacees} placée${deplacees > 1 ? 's' : ''} à la main · ta disposition, personnelle`
    : `${cartes} · place automatique · glisse une carte ou utilise les flèches`;
}
