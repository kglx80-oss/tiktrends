/**
 * Studios · L4 · cycle de vie d'une proposition et conditions d'application.
 *
 * Pur. La machine est celle de L1 (`transitionProposition`) :
 *
 *   draft → proposed → approved | rejected | expired
 *
 * Ce module ajoute ce que la machine ne sait pas : l'expiration par la date,
 * la PORTÉE (espace, marque, projet) et la VERSION DE BASE. Une proposition
 * n'est applicable que si les trois correspondent encore :
 *
 *  · FLOW-03 · une réponse tardive pour la marque A ne s'applique JAMAIS à la
 *    marque B : la proposition porte la portée de sa demande, l'application
 *    compare cette portée au projet visé, et toute différence est un refus ;
 *  · FLOW-06 · base périmée ⇒ `VERSION_CONFLICT` avec les différences base →
 *    courante, jamais d'écrasement ;
 *  · « Présenter sans générer » · approuver une proposition crée une VERSION
 *    du document, rien d'autre : ni devis, ni job, ni débit. La demande de
 *    devis reste un geste distinct (L3), même quand la retouche est « incluse ».
 */

import { transitionProposition, type EtatProposition, type VerdictTransition } from '../machines';
import { appliquerPatch, differencesDetaillees, verifierHorsCheminsInchanges } from '../patch';
import { validerContenuVersion, type ContenuVersion, type ViolationStudio } from '../document';
import { lireCible, cheminsDansCible, cibleExiste } from './cible';

/**
 * Durée de vie d'une proposition · CHOIX DE POLITIQUE, pas une mesure. La
 * version de base protège déjà contre l'application d'une proposition
 * périmée ; l'expiration vide seulement la liste de ce qui n'a pas été
 * tranché. Sept jours couvrent un cycle de production hebdomadaire.
 */
export const DUREE_VIE_PROPOSITION_MS = 7 * 24 * 3600 * 1000;
export const DUREE_VIE_MIN_MS = 60 * 1000;
export const DUREE_VIE_MAX_MS = 30 * 24 * 3600 * 1000;

export function expirationProposition(maintenant: Date, dureeMs: number = DUREE_VIE_PROPOSITION_MS): Date {
  const d = Number.isFinite(dureeMs) ? Math.min(Math.max(Math.trunc(dureeMs), DUREE_VIE_MIN_MS), DUREE_VIE_MAX_MS) : DUREE_VIE_PROPOSITION_MS;
  return new Date(maintenant.getTime() + d);
}

/** État lu à l'instant · une proposition ouverte dont l'échéance est passée vaut `expired`, sans écriture. */
export function etatEffectif(p: { state: EtatProposition; expiresAt: Date | null }, maintenant: Date): EtatProposition {
  if ((p.state === 'draft' || p.state === 'proposed') && p.expiresAt && p.expiresAt.getTime() <= maintenant.getTime()) return 'expired';
  return p.state;
}

/** Une proposition stockée naît `proposed` : `draft → proposed` par son auteur. */
export function etatACreation(): { etat: EtatProposition; verdict: VerdictTransition } {
  return { etat: 'proposed', verdict: transitionProposition('draft', 'proposed', 'auteur') };
}

/* ─────────────────────────────── Portée ──────────────────────────────────── */

export interface PorteeProposition {
  workspaceId: string;
  brandId: string;
  projectId: string;
}

/**
 * FLOW-03 · la portée de la demande et celle de l'objet visé sont-elles la
 * même ? Rend la liste des champs qui diffèrent (vide = même portée). On ne
 * « corrige » jamais une portée : une différence est un refus.
 */
export function differencesPortee(attendue: PorteeProposition, visee: PorteeProposition): Array<keyof PorteeProposition> {
  const out: Array<keyof PorteeProposition> = [];
  for (const k of ['workspaceId', 'brandId', 'projectId'] as const) if (!attendue[k] || attendue[k] !== visee[k]) out.push(k);
  return out;
}

/**
 * Côté écran · une réponse (proposition, liste, conflit) ne s'affiche et ne
 * s'applique que si elle concerne le projet ENCORE ouvert. L'utilisateur qui a
 * changé de marque ou de projet pendant l'attente ne voit pas arriver la
 * réponse de l'ancien projet dans le nouveau.
 */
export function reponsePourVue(vue: { projectId: string }, reponse: { projectId: string | null | undefined }): boolean {
  return typeof reponse.projectId === 'string' && reponse.projectId.length > 0 && reponse.projectId === vue.projectId;
}

/* ───────────────────────────── Application ───────────────────────────────── */

export interface PropositionStockee extends PorteeProposition {
  id: string;
  target: string;
  baseVersionId: string;
  allowedPaths: unknown;
  changes: unknown;
  state: EtatProposition;
  expiresAt: Date | null;
  appliedVersionId: string | null;
}

export interface EtatProjet extends PorteeProposition {
  versionCouranteId: string;
  contenuCourant: ContenuVersion;
  /** Contenu de la version de base de la proposition (pour le diff du conflit). */
  contenuBase: ContenuVersion | null;
}

export type DecisionApplication =
  | { ok: true; resultat: ContenuVersion; cheminsModifies: string[] }
  | { ok: false; motif: 'DEJA_APPLIQUEE'; appliedVersionId: string }
  | { ok: false; motif: 'PORTEE'; champs: Array<keyof PorteeProposition> }
  | { ok: false; motif: 'ETAT'; etat: EtatProposition; raison: string }
  | { ok: false; motif: 'VERSION_CONFLICT'; versionCouranteId: string; differences: ReturnType<typeof differencesDetaillees> }
  | { ok: false; motif: 'INVALIDE'; violations: ViolationStudio[] };

/**
 * Décide l'application d'une proposition sur l'état COURANT du projet, dans
 * cet ordre : portée, déjà appliquée, état (expiration comprise), version de
 * base, chemins bornés à la cible, patch, contenu valide, champs hors chemins
 * inchangés. Ne produit qu'un contenu : la persistance est au serveur.
 *
 * `baseAttendueParLecran` · la version que l'écran croit courante. Si elle
 * diffère de la base de la proposition, c'est aussi un conflit : l'écran
 * appliquerait sur une version qu'il n'a pas affichée.
 */
export function deciderApplication(p: PropositionStockee, projet: EtatProjet, maintenant: Date, baseAttendueParLecran?: string | null): DecisionApplication {
  const portee = differencesPortee(p, projet);
  if (portee.length) return { ok: false, motif: 'PORTEE', champs: portee };
  if (p.state === 'approved' && p.appliedVersionId) return { ok: false, motif: 'DEJA_APPLIQUEE', appliedVersionId: p.appliedVersionId };

  const etat = etatEffectif(p, maintenant);
  if (etat !== 'proposed') {
    const raison = etat === 'expired' ? 'proposition expirée' : etat === 'rejected' ? 'proposition rejetée' : `proposition ${etat}`;
    return { ok: false, motif: 'ETAT', etat, raison };
  }
  const t = transitionProposition('proposed', 'approved', 'utilisateur');
  if (!t.ok) return { ok: false, motif: 'ETAT', etat, raison: t.raison };

  const baseEcranPerimee = typeof baseAttendueParLecran === 'string' && baseAttendueParLecran !== p.baseVersionId;
  if (projet.versionCouranteId !== p.baseVersionId || baseEcranPerimee) {
    return {
      ok: false,
      motif: 'VERSION_CONFLICT',
      versionCouranteId: projet.versionCouranteId,
      differences: projet.contenuBase ? differencesDetaillees(projet.contenuBase, projet.contenuCourant) : [],
    };
  }

  const cible = lireCible(p.target);
  if (!cible) return { ok: false, motif: 'INVALIDE', violations: [{ chemin: 'target', raison: 'cible illisible' }] };
  if (!cibleExiste(cible, projet.contenuCourant)) return { ok: false, motif: 'INVALIDE', violations: [{ chemin: 'target', raison: 'cible absente de la version courante' }] };
  const horsCible = cheminsDansCible(cible, p.allowedPaths);
  if (horsCible.length) return { ok: false, motif: 'INVALIDE', violations: horsCible };

  const r = appliquerPatch(projet.contenuCourant, p.changes, p.allowedPaths);
  if (!r.ok) return { ok: false, motif: 'INVALIDE', violations: r.violations };
  const v = validerContenuVersion(r.resultat);
  if (v.length) return { ok: false, motif: 'INVALIDE', violations: v };
  // Contrôle indépendant de la façon dont le résultat a été obtenu.
  const hors = verifierHorsCheminsInchanges(projet.contenuCourant, r.resultat, p.allowedPaths as string[]);
  if (hors.length) return { ok: false, motif: 'INVALIDE', violations: hors };
  return { ok: true, resultat: r.resultat, cheminsModifies: r.cheminsModifies };
}

/** Rejet · `proposed → rejected` par l'utilisateur ; expirée ou déjà tranchée : refus. */
export function deciderRejet(p: Pick<PropositionStockee, 'state' | 'expiresAt'>, maintenant: Date): { ok: true } | { ok: false; etat: EtatProposition; raison: string } {
  const etat = etatEffectif(p, maintenant);
  if (etat !== 'proposed') return { ok: false, etat, raison: etat === 'expired' ? 'proposition expirée' : `proposition déjà ${etat === 'approved' ? 'appliquée' : etat === 'rejected' ? 'rejetée' : etat}` };
  const t = transitionProposition('proposed', 'rejected', 'utilisateur');
  return t.ok ? { ok: true } : { ok: false, etat, raison: t.raison };
}
