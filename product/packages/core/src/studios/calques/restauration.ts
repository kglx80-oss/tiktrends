/**
 * Studios · restauration NON DESTRUCTIVE d'une version (spec UX V2 § 3).
 *
 * Pur. Restaurer la version N ne réécrit rien : on enregistre une NOUVELLE
 * version dont le contenu est celui de N, par le chemin d'enregistrement
 * existant (`enregistrerVersion` · garde `studio.propose`, version de base
 * obligatoire, 409 si elle n'est plus la courante). La table des versions
 * reste en ajout seul : N, la courante et toutes les autres restent lisibles,
 * et la restauration se défait en restaurant l'ancienne courante.
 *
 * Le patch est calculé par le SERVEUR à partir des contenus qu'il relit en
 * base (le client n'envoie que des identifiants) : une clé de contenu par
 * changement, remplacée en entier par celle de N.
 */

import { CLES_CONTENU, type ContenuVersion, type DocumentStudio } from '../document';
import { differencesDetaillees, type ChangementPatch } from '../patch';
import { decrireDifference } from './conflit';
import { memeValeur } from './patch-document';

export interface VersionARestaurer { id: string; n: number; contenu: ContenuVersion }

export type PlanRestauration =
  | { ok: true; changes: ChangementPatch[]; raison: string; cles: string[] }
  | { ok: false; motif: 'deja-courante' | 'identique'; message: string };

export const raisonRestauration = (n: number) => `Restauration de la version ${n}`;

/**
 * Le patch courante → cible · `replace` (ou `add`/`remove` pour une clé
 * absente d'un côté) de chaque clé de contenu qui diffère. Refus si la cible
 * EST la courante, ou si elle a déjà le même contenu (rien à créer).
 */
export function planRestauration(courante: VersionARestaurer, cible: VersionARestaurer): PlanRestauration {
  if (cible.id === courante.id) {
    return { ok: false, motif: 'deja-courante', message: `La version ${cible.n} est déjà la version courante · il n’y a rien à restaurer.` };
  }
  const raison = raisonRestauration(cible.n);
  const a = courante.contenu as unknown as Record<string, unknown>;
  const b = cible.contenu as unknown as Record<string, unknown>;
  const a_ = (k: string) => Object.prototype.hasOwnProperty.call(a, k);
  const b_ = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  const changes: ChangementPatch[] = [];
  for (const k of CLES_CONTENU) {
    if (!a_(k) && !b_(k)) continue;
    if (a_(k) && b_(k) && memeValeur(a[k], b[k])) continue;
    const op: ChangementPatch['op'] = !a_(k) ? 'add' : !b_(k) ? 'remove' : 'replace';
    changes.push({ op, path: `/${k}`, newValue: op === 'remove' ? null : b[k], reason: raison });
  }
  if (changes.length === 0) {
    return { ok: false, motif: 'identique', message: `La version ${cible.n} a déjà le même contenu que la version courante (${courante.n}) · restaurer ne créerait rien.` };
  }
  return { ok: true, changes, raison, cles: changes.map((c) => c.path.slice(1)) };
}

/* ─────────────────────────── Avant le clic ───────────────────────────────── */

export type DecisionRestauration = { permis: true } | { permis: false; raison: string };

/**
 * Le bouton « Restaurer cette version » est-il utilisable · jamais par-dessus
 * des modifications non enregistrées (elles seraient perdues de vue), jamais
 * pendant un enregistrement ou un conflit, jamais sans `studio.propose`.
 */
export function decisionRestauration(o: {
  editable: boolean;
  modifie: boolean;
  enCours: boolean;
  conflit: boolean;
  estCourante: boolean;
  /** La comparaison ne trouve aucune différence avec la courante · restaurer ne créerait rien. */
  sansDifference?: boolean;
}): DecisionRestauration {
  if (!o.editable) return { permis: false, raison: 'Ton rôle permet de consulter les versions, pas de les restaurer.' };
  if (o.estCourante) return { permis: false, raison: 'C’est la version courante · il n’y a rien à restaurer.' };
  if (o.sansDifference) return { permis: false, raison: 'Même contenu que la version courante · restaurer ne créerait rien.' };
  if (o.conflit) return { permis: false, raison: 'Un conflit de version est ouvert · tranche-le d’abord.' };
  if (o.enCours) return { permis: false, raison: 'Un enregistrement est en cours · attends qu’il se termine.' };
  if (o.modifie) return { permis: false, raison: 'Tu as des modifications non enregistrées · enregistre-les ou annule-les avant de restaurer.' };
  return { permis: true };
}

/** Ce qui va se passer, dit AVANT le clic. */
export function annonceRestauration(cibleN: number, couranteN: number): string {
  return `Restaurer crée la version ${couranteN + 1}, copie exacte de la version ${cibleN} (document, brief et références). `
    + `Les versions 1 à ${couranteN} restent dans l’historique, rien n’est effacé · pour revenir en arrière, restaure la version ${couranteN}.`;
}

/* ─────────────────────────── Comparaison ─────────────────────────────────── */

/** Au-delà, la comparaison dit qu'il y a d'autres différences plutôt que de toutes les lister. */
export const DIFFERENCES_COMPAREES_MAX = 50;

export interface ComparaisonVersions { phrases: string[]; tronquee: boolean }

/**
 * Ce que la restauration changerait par rapport à la version courante, en
 * phrases · « Calque « CTA » · texte : « actuel » → « restauré » ».
 */
export function comparerPourRestauration(courante: ContenuVersion, cible: ContenuVersion, cibleN: number): ComparaisonVersions {
  const diffs = differencesDetaillees(courante, cible, DIFFERENCES_COMPAREES_MAX + 1);
  const tronquee = diffs.length > DIFFERENCES_COMPAREES_MAX;
  const docs: Array<DocumentStudio | null> = [cible.document ?? null, courante.document ?? null];
  const phrases = diffs.slice(0, DIFFERENCES_COMPAREES_MAX).map((d) => {
    if (d.chemin === '/document') {
      if (d.courant === null) return `La version ${cibleN} n’a pas de document image · restaurer retire le document de la version courante.`;
      if (d.base === null) return `La version ${cibleN} a un document image · restaurer le remet.`;
    }
    return decrireDifference(d, docs);
  });
  return { phrases: [...new Set(phrases)], tronquee };
}

/* ─────────────────────────── Liste des versions ──────────────────────────── */

/**
 * Qui a créé une version, en mots · « Toi », le nom, sinon l'adresse ; un
 * membre qui masque ses informations personnelles reste « Un membre de
 * l’espace » ; une version sans auteur (création système) le dit.
 */
export function libelleAuteurVersion(a: { authorId: string | null; nom: string | null; email: string | null; masque: boolean }, moi: string): string {
  if (!a.authorId) return 'Création automatique';
  if (a.authorId === moi) return 'Toi';
  if (a.masque) return 'Un membre de l’espace';
  const nom = a.nom?.trim();
  return nom || a.email || 'Un membre de l’espace';
}
