/**
 * Studios · L4 · ce que l'écran montre d'une proposition.
 *
 * Pur. L'écran ne décide rien : il affiche ce que ce module calcule.
 *
 *  · avant / après PAR CHEMIN, lus dans la version de base (jamais dans ce que
 *    le modèle prétend avoir trouvé) ;
 *  · le plan d'impact RÉEL (sorties livrées pour la base : à refaire,
 *    réutilisées, obsolètes) et les sorties TOUCHÉES par le changement, avec
 *    une estimation NON EXÉCUTOIRE en crédits (grille L3, aucune invention) ;
 *  · la mention « appliquer ne génère rien et ne débite rien » ;
 *  · la disponibilité de « Demander à Jarvis », avec une raison lisible, et le
 *    coût maximal d'un appel texte, jamais annoncé gratuit.
 */

import { calculerPlanImpact, type NatureNoeud, type PlanImpact } from '../impact';
import { valeurAuChemin } from '../patch';
import type { ContenuVersion } from '../document';
import type { EtatProposition } from '../machines';
import { GRILLE_STUDIO, profilDuNoeud } from '../execution/tarifs';
import { costOfTokens } from '../../spend-guard';
import { libelleChemin, libelleCible, type CibleProposition } from './cible';
import { JETONS_ENTREE_MAX_PROPOSITION, JETONS_SORTIE_MAX_PROPOSITION } from '../bornes-taches';

export const MENTION_SANS_GENERATION =
  'Appliquer crée une nouvelle version du document. Rien n’est généré et rien n’est débité · un devis reste nécessaire avant toute génération.';

export const LIBELLES_ETAT: Readonly<Record<EtatProposition, string>> = {
  draft: 'Brouillon', proposed: 'À trancher', approved: 'Appliquée', rejected: 'Rejetée', expired: 'Expirée',
};

export const LIBELLES_ORIGINE: Readonly<Record<'jarvis' | 'agent' | 'human', string>> = {
  jarvis: 'Proposée par Jarvis', agent: 'Proposée par un agent', human: 'Saisie à la main',
};

const VALEUR_MAX = 600;

/** Une valeur JSON en texte court et lisible · `null` et absent se lisent « (vide) ». */
export function texteValeur(v: unknown): string {
  if (v === null || v === undefined) return '(vide)';
  if (typeof v === 'string') return v.length > VALEUR_MAX ? `${v.slice(0, VALEUR_MAX)}…` : (v.length ? v : '(vide)');
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.length ? texteValeur(v.join(' / ')) : '(vide)';
  let s: string;
  try { s = JSON.stringify(v); } catch { s = '(valeur illisible)'; }
  return s.length > VALEUR_MAX ? `${s.slice(0, VALEUR_MAX)}…` : s;
}

export interface ChangementLisible {
  op: 'add' | 'replace' | 'remove';
  chemin: string;
  libelle: string;
  avant: string;
  apres: string;
  raison: string;
}

/** Avant / après par chemin · l'avant vient de la VERSION DE BASE. */
export function changementsLisibles(cible: CibleProposition, contenuBase: ContenuVersion | null, changes: unknown): ChangementLisible[] {
  if (!Array.isArray(changes)) return [];
  return changes.slice(0, 100).map((c) => {
    const o = (typeof c === 'object' && c !== null ? c : {}) as Record<string, unknown>;
    const chemin = typeof o.path === 'string' ? o.path : '';
    const op = o.op === 'add' || o.op === 'remove' ? o.op : 'replace';
    return {
      op,
      chemin,
      libelle: libelleChemin(cible, chemin),
      avant: op === 'add' ? '(absent)' : texteValeur(contenuBase ? valeurAuChemin(contenuBase, chemin) : undefined),
      apres: op === 'remove' ? '(supprimé)' : texteValeur(o.newValue),
      raison: typeof o.reason === 'string' ? o.reason.slice(0, 2000) : '',
    };
  });
}

/* ──────────────────────────────── Impact ─────────────────────────────────── */

export interface EstimationNonExecutoire {
  executoire: false;
  /** Sorties dont l'empreinte change avec la proposition (toutes natures). */
  touchees: Array<{ id: string; nature: NatureNoeud }>;
  /** Parmi elles, les générations (payantes si l'on décide de les produire). */
  generations: string[];
  /** Somme indicative des crédits des générations tarifées · aucune réserve, aucun débit. */
  creditsIndicatifs: number;
  /** Générations sans tarif dans l'offre (la voix) · un devis les refuserait. */
  nonTarifees: string[];
}

/**
 * Plan d'impact d'une proposition.
 *
 *  · `plan` · le plan RÉEL, calculé avec les sorties réellement livrées pour la
 *    base (`sortiesExistantes`) : c'est celui que le serveur stocke ;
 *  · `estimation` · ce que le CHANGEMENT touche, comme si toutes les sorties de
 *    la base existaient, avec un prix indicatif tiré de la grille L3. Rien
 *    n'est exécutoire : la génération exigera un devis puis une approbation.
 */
export function impactProposition(contenuBase: ContenuVersion, contenuApres: ContenuVersion, sortiesExistantes: Iterable<string>):
  { plan: PlanImpact; estimation: EstimationNonExecutoire } {
  const plan = calculerPlanImpact(contenuBase, contenuApres, { sortiesExistantes });
  const touchees = calculerPlanImpact(contenuBase, contenuApres).aRefaire;
  const generations = touchees.filter((n) => n.nature === 'generation').map((n) => n.id);
  let credits = 0;
  const nonTarifees: string[] = [];
  for (const id of generations) {
    const profil = profilDuNoeud(id, 'generation');
    const tarif = profil ? GRILLE_STUDIO[profil] : null;
    if (!tarif || tarif.credits === null) nonTarifees.push(id);
    else credits += tarif.credits;
  }
  return { plan, estimation: { executoire: false, touchees, generations, creditsIndicatifs: credits, nonTarifees } };
}

/** « keyframe:s_produit » → « Image clé · Plan 2 ». */
export function libelleNoeud(id: string, contenu: ContenuVersion | null): string {
  const [prefixe, reste] = [id.slice(0, id.indexOf(':') < 0 ? id.length : id.indexOf(':')), id.includes(':') ? id.slice(id.indexOf(':') + 1) : ''];
  const plan = (sid: string) => libelleCible({ type: 'shot', id: sid }, contenu);
  switch (prefixe) {
    case 'keyframe': return `Image clé · ${plan(reste)}`;
    case 'clip': return `Clip animé · ${plan(reste)}`;
    case 'voix': return `Voix · ${plan(reste)}`;
    case 'identite': return `Fiche d’identité · ${reste}`;
    case 'composition': return 'Composition';
    case 'montage': return 'Montage';
    case 'mix': return 'Mixage';
    case 'sous_titres': return 'Sous-titres';
    case 'export': return 'Export';
    default: return id;
  }
}

/* ─────────────────────────── Demander à Jarvis ───────────────────────────── */

/**
 * Bornes d'un appel texte de proposition · ce sont celles du résolveur
 * (`resolveur.ts` : budget de contexte 24 000 jetons, sortie 4 000). Le coût
 * maximal en découle, pessimiste : entrée pleine, sortie pleine.
 */

export function coutMaximalDemandeJarvis(modele: string): number {
  return costOfTokens(modele, JETONS_ENTREE_MAX_PROPOSITION, JETONS_SORTIE_MAX_PROPOSITION);
}

/** « 0,13 $ » · arrondi au centime SUPÉRIEUR (on annonce un plafond, pas un rabais). */
export function formatUsd(usd: number): string {
  const c = Math.ceil(Math.max(0, usd) * 100) / 100;
  return `${c.toFixed(2).replace('.', ',')} $`;
}

export type MotifIndisponibilite = 'RELEASE_ACTIVE_ABSENTE' | 'FOURNISSEUR_NON_CONFIGURE' | 'PLAFOND_ATTEINT' | 'DROIT_PROPOSER';

export interface DisponibiliteJarvis {
  disponible: boolean;
  motif: MotifIndisponibilite | null;
  raison: string;
  /** Coût maximal d'un appel · affiché AVANT le clic, jamais « gratuit ». */
  coutMaxUsd: number;
  mentionCout: string;
}

/** Disponibilité de « Demander à Jarvis » · la première cause bloquante, dite en clair. */
export function disponibiliteJarvis(e: { releasePubliee: boolean; fournisseurConfigure: boolean; plafondAtteint: boolean; peutProposer: boolean; modele: string }): DisponibiliteJarvis {
  const coutMaxUsd = coutMaximalDemandeJarvis(e.modele);
  const mentionCout = `Appel texte payant · ${formatUsd(coutMaxUsd)} au plus, imputé au plafond de dépense. Aucun média, aucun crédit, rien d’appliqué sans ton accord.`;
  const indispo = (motif: MotifIndisponibilite, raison: string): DisponibiliteJarvis => ({ disponible: false, motif, raison, coutMaxUsd, mentionCout });
  if (!e.peutProposer) return indispo('DROIT_PROPOSER', 'Ton rôle permet de lire les propositions, pas d’en demander.');
  if (!e.releasePubliee) return indispo('RELEASE_ACTIVE_ABSENTE', 'Jarvis n’est pas encore activé pour les studios (aucune version de ses consignes n’est publiée) · propose la modification à la main.');
  if (!e.fournisseurConfigure) return indispo('FOURNISSEUR_NON_CONFIGURE', 'Le fournisseur de texte n’est pas configuré sur ce serveur · propose la modification à la main.');
  if (e.plafondAtteint) return indispo('PLAFOND_ATTEINT', 'Le plafond de dépense est atteint · propose la modification à la main ou attends le prochain cycle.');
  return { disponible: true, motif: null, raison: '', coutMaxUsd, mentionCout };
}
