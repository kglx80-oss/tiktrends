/**
 * Tour de contrôle (Spatial, rubrique Admin) · alertes, flux en direct,
 * barres d'usage, bibliothèque de prompts, matrice des droits. Pur.
 */
import type { RolePlateforme, MatriceDroits } from '../../equipe-plateforme';
import { roleVoitRubrique, CLES_RUBRIQUES } from '../../equipe-plateforme';
import { adminIlYa, adminNombre, adminPluriel } from './format';

/* ──────────────────────────────── Alertes ──────────────────────────────── */

export interface SignauxPlateforme {
  /** Dépense IA sur 30 jours glissants, en pourcents du plafond. */
  depensePct: number;
  depenseResume: string;
  depensesAReconcilier: number;
  defautsPaiement: number;
  mrrEnDefaut: number;
  ticketsSansReponse: number;
  /** Comptes payants dont le solde de crédits est épuisé. */
  payantsSansCredit: number;
}

export interface AlertePlateforme { ton: 'w' | 'r' | 'c'; icone: string; titre: string; detail: string; lien: { href: string; libelle: string } }

/**
 * Les alertes « à surveiller » · chacune naît d'un FAIT mesuré. Le seuil de la
 * dépense (80 %) est celui de l'écran Dépense IA existant (`/admin/depenses`).
 * Rien à signaler · liste vide (l'écran le dit).
 */
export function alertesPlateforme(s: SignauxPlateforme): AlertePlateforme[] {
  const a: AlertePlateforme[] = [];
  if (s.depensePct >= 80) a.push({ ton: s.depensePct >= 100 ? 'r' : 'w', icone: 'warn', titre: `Dépense IA à ${Math.round(s.depensePct)} % du plafond`, detail: s.depenseResume, lien: { href: '/admin/depenses', libelle: 'Voir les coûts' } });
  if (s.depensesAReconcilier > 0) a.push({ ton: 'w', icone: 'spark', titre: `${adminPluriel(s.depensesAReconcilier, 'dépense')} à réconcilier`, detail: 'Issue incertaine chez le fournisseur · le montant facturé reste à rapprocher.', lien: { href: '/admin/depenses', libelle: 'Réconcilier' } });
  if (s.defautsPaiement > 0) a.push({ ton: 'r', icone: 'card', titre: `${adminPluriel(s.defautsPaiement, 'paiement')} en défaut sur Stripe`, detail: `${adminNombre(s.mrrEnDefaut)} € de MRR concernés.`, lien: { href: '/admin/paiement', libelle: 'Voir les paiements' } });
  if (s.ticketsSansReponse > 0) a.push({ ton: 'r', icone: 'chat', titre: `${adminPluriel(s.ticketsSansReponse, 'ticket')} sans réponse`, detail: 'Le dernier message vient du client.', lien: { href: '/admin/sav', libelle: 'Répondre' } });
  if (s.payantsSansCredit > 0) a.push({ ton: 'c', icone: 'users', titre: `${adminPluriel(s.payantsSansCredit, 'compte payant')} sans crédit`, detail: 'Solde épuisé · une recharge ou une formule supérieure les débloque.', lien: { href: '/admin/signups', libelle: 'Voir les comptes' } });
  return a;
}

/* ──────────────────────────────── En direct ──────────────────────────────── */

export type TypeEvenementPlateforme = 'inscription' | 'onboarding' | 'ticket' | 'recharge';

export interface EvenementPlateforme { type: TypeEvenementPlateforme; espace: string; le: Date; credits?: number; detail?: string }

export interface LigneFlux { espace: string; texte: string; quand: string; pastille: { libelle: string; classe: '' | 'g' | 'w' | 'r' } }

const TEXTE: Record<TypeEvenementPlateforme, string> = {
  inscription: 's’est inscrit', onboarding: 'a terminé l’onboarding', ticket: 'a ouvert un ticket', recharge: 'a acheté des crédits',
};

/** Les derniers événements réels de la plateforme, le plus récent d'abord. */
export function fluxDirect(ev: readonly EvenementPlateforme[], maintenant: Date, n = 6): LigneFlux[] {
  return [...ev].sort((a, b) => b.le.getTime() - a.le.getTime()).slice(0, n).map((e) => ({
    espace: e.espace,
    texte: TEXTE[e.type],
    quand: adminIlYa(e.le, maintenant),
    pastille: e.type === 'recharge' ? { libelle: `+${adminNombre(e.credits ?? 0)} crédits`, classe: 'g' }
      : e.type === 'ticket' ? { libelle: e.detail ?? 'Ticket', classe: 'w' }
        : e.type === 'onboarding' ? { libelle: 'Onboarding', classe: '' }
          : { libelle: 'Inscription', classe: '' },
  }));
}

/* ──────────────────────────────── Usage ──────────────────────────────── */

/**
 * Les barres d'usage · largeur relative au plus gros poste, jamais sous 2 %
 * (la maquette garde un trait visible), 0 quand le poste est nul.
 */
export function barresUsage(lignes: ReadonlyArray<{ libelle: string; n: number }>): Array<{ libelle: string; n: number; largeur: number }> {
  const max = Math.max(0, ...lignes.map((l) => l.n));
  return lignes.map((l) => ({ ...l, largeur: max > 0 && l.n > 0 ? Math.max(2, (l.n / max) * 100) : 0 }));
}

/* ─────────────────────────── Bibliothèque de prompts ─────────────────────────── */

export type FamillePrompt = 'styles' | 'regles' | 'skills';
export type TypePromptRegistre = 'template' | 'recette' | 'socle' | 'rendu' | 'conversation';

/** Les familles de l'écran · recettes de style, consignes communes (socle, rendu, conversation), templates. */
export const FAMILLE_DU_TYPE: Readonly<Record<TypePromptRegistre, FamillePrompt>> = {
  recette: 'styles', socle: 'regles', rendu: 'regles', conversation: 'regles', template: 'skills',
};

export interface VersionRegistre { type: TypePromptRegistre; cle: string; titre: string; version: string; statut: string; creeLe: Date; auteur: string | null }

export interface EntreeBibliotheque {
  type: TypePromptRegistre; cle: string; titre: string;
  derniere: string; statut: string; versions: number;
  enProduction: string | null; majLe: Date; auteur: string | null; utilisations: number | null;
}

/**
 * Une entrée par (type, clé) · sa DERNIÈRE version (la première rencontrée
 * dans l'ordre fourni : version décroissante), le nombre de versions, la
 * version en production (release active) et ses utilisations quand on sait
 * les compter (exécutions d'un template).
 */
export function bibliothequePrompts(
  versions: readonly VersionRegistre[],
  enProduction: ReadonlyMap<string, string>,
  utilisations: ReadonlyMap<string, number>,
): Record<FamillePrompt, EntreeBibliotheque[]> {
  const parCle = new Map<string, EntreeBibliotheque>();
  for (const v of versions) {
    const k = `${v.type}:${v.cle}`;
    const e = parCle.get(k);
    if (e) { e.versions += 1; continue; }
    parCle.set(k, {
      type: v.type, cle: v.cle, titre: v.titre, derniere: v.version, statut: v.statut, versions: 1,
      enProduction: enProduction.get(k) ?? null, majLe: v.creeLe, auteur: v.auteur,
      utilisations: v.type === 'template' ? utilisations.get(v.cle) ?? 0 : null,
    });
  }
  const out: Record<FamillePrompt, EntreeBibliotheque[]> = { styles: [], regles: [], skills: [] };
  for (const e of parCle.values()) out[FAMILLE_DU_TYPE[e.type]].push(e);
  for (const f of Object.keys(out) as FamillePrompt[]) out[f].sort((a, b) => a.titre.localeCompare(b.titre));
  return out;
}

export const LIBELLE_STATUT_VERSION: Readonly<Record<string, string>> = { draft: 'Brouillon', validated: 'Validée', retired: 'Retirée' };

/* ──────────────────────────────── Droits ──────────────────────────────── */

/**
 * La case de la matrice · « Accès » (l2) quand le rôle voit la rubrique,
 * « Aucun » (l0) sinon. Le modèle réel est binaire (`roleVoitRubrique`) ·
 * aucun niveau « lecture » ou « modification » n'est inventé.
 */
export function caseDroit(role: RolePlateforme, rubrique: string, matrice?: MatriceDroits): { niveau: 0 | 2; libelle: string; voit: boolean } {
  const voit = roleVoitRubrique(role, rubrique, matrice);
  return voit ? { niveau: 2, libelle: 'Accès', voit } : { niveau: 0, libelle: 'Aucun', voit };
}

/** Les rubriques d'un rôle après un clic sur une case · ouvre si fermée, ferme si ouverte. Ordre canonique. */
export function rubriquesApresBascule(role: RolePlateforme, rubrique: string, matrice?: MatriceDroits): string[] {
  const actuelles = new Set(CLES_RUBRIQUES.filter((k) => roleVoitRubrique(role, k, matrice)));
  if (CLES_RUBRIQUES.includes(rubrique)) { if (actuelles.has(rubrique)) actuelles.delete(rubrique); else actuelles.add(rubrique); }
  return CLES_RUBRIQUES.filter((k) => actuelles.has(k));
}

/* ──────────────────────────────── Audit ──────────────────────────────── */

/** Les gestes de PLATEFORME du registre d'audit, en clair · une action inconnue reste lisible (« a fait … »). */
export const LIBELLE_AUDIT_PLATEFORME: Readonly<Record<string, string>> = {
  'prompt.import': 'a importé le pack de prompts',
  'prompt.version.brouillon': 'a enregistré un brouillon de prompt',
  'prompt.version.valider': 'a validé une version de prompt',
  'prompt.release.creer': 'a créé une release de prompts',
  'prompt.release.evaluer': 'a évalué une release',
  'prompt.release.publier': 'a publié une release',
  'prompt.release.rollback': 'a rétabli la release précédente',
  'prompt.release.retirer': 'a retiré une release',
  'prompt.release.revoquer': 'a révoqué une release',
  'prompt.benchmark.approuver': 'a approuvé un benchmark',
  'prompt.recette_manuelle.approuver': 'a approuvé une recette manuelle',
  'studios.interrupteurs': 'a changé un interrupteur Studios',
  'studios.budget_essai': 'a réglé un budget d’essai Studios',
};

export const texteAudit = (action: string) => LIBELLE_AUDIT_PLATEFORME[action] ?? `a fait « ${action} »`;
