import { CREDIT_COSTS, type CreditAction } from '../../credits';

/**
 * Spatial · Réglages · « Forfaits & crédits », « Espace », « Équipe ». Pur.
 *
 * AUCUNE offre n'est décidée ici · les prix, les crédits et les packs restent
 * ceux de l'application (`lib/rbac.ts`, `lib/credit-packs.ts`, Stripe), passés
 * en paramètres. Ce module ne fait que dire ce que l'écran affiche à partir
 * d'eux, et reprendre MOT POUR MOT le descriptif des formules de l'écran V5
 * (retiré à la vague 2) · une garde (`spatial-reglages.test.tsx`) fige l'offre mot pour mot.
 */

export type CleFormule = 'starter' | 'core' | 'plus' | 'business';
export const ORDRE_FORMULES: readonly CleFormule[] = ['starter', 'core', 'plus', 'business'];

/** Le descriptif des formules · identique à l'écran V5 (`FEATURES`, `HINT`). */
export const DESCRIPTIF_FORMULES: Record<CleFormule, { accroche: string; fonctions: readonly string[]; marques: string }> = {
  starter: { accroche: 'Pour démarrer et explorer', fonctions: ['Dashboard & Analytics', 'Tagging manuel', '1 marque', 'Support e-mail'], marques: '1 marque' },
  core: { accroche: 'Le cœur de l’offre créative', fonctions: ['Tout Starter', 'Studios (pub, image, vidéo, textes)', 'Jarvis · règles maison', 'Radar & Veille', 'Jusqu’à 3 marques'], marques: 'Jusqu’à 3 marques' },
  plus: { accroche: 'Pour les agences multi-marques', fonctions: ['Tout Core', 'Marques illimitées', 'Membres & rôles avancés', 'Clone de pubs gagnantes', 'Priorité de génération'], marques: 'Marques illimitées' },
  business: { accroche: 'Volumes et marque blanche', fonctions: ['Tout Plus', 'Marque blanche complète', 'Accès API', 'Accompagnement dédié', 'Volumes sur mesure'], marques: 'Marques illimitées' },
};

/** La formule mise en avant (« Populaire » à l'écran V5). */
export const FORMULE_MISE_EN_AVANT: CleFormule = 'core';

export const prixFormule = (eur: number) => (eur === 0 ? 'Gratuit' : `${eur.toLocaleString('fr-FR')} €`);

export function formuleSuivante(c: CleFormule): CleFormule | null {
  const i = ORDRE_FORMULES.indexOf(c);
  return i >= 0 && i < ORDRE_FORMULES.length - 1 ? ORDRE_FORMULES[i + 1]! : null;
}

/** Le bouton d'une carte de formule · même logique que l'écran V5. */
export type BoutonFormule =
  | { type: 'desactive'; libelle: string }
  | { type: 'portail'; libelle: string; primaire: boolean }
  | { type: 'abonnement'; libelle: string };

export function boutonFormule(p: {
  formule: CleFormule; actuelle: CleFormule; proprietaire: boolean; paiement: boolean; abonne: boolean; achetable: boolean;
  libelle: string; prix: number;
}): BoutonFormule {
  const estActuelle = p.formule === p.actuelle;
  if (estActuelle) return { type: 'desactive', libelle: 'Plan actuel' };
  if (!p.proprietaire) return { type: 'desactive', libelle: 'Le propriétaire gère la formule' };
  if (!p.paiement) return { type: 'desactive', libelle: 'Bientôt disponible' };
  if (p.abonne) {
    const monte = ORDRE_FORMULES.indexOf(p.formule) > ORDRE_FORMULES.indexOf(p.actuelle);
    return { type: 'portail', libelle: monte ? `Passer à ${p.libelle}` : `Revenir à ${p.libelle}`, primaire: monte };
  }
  if (p.formule === 'starter') return { type: 'desactive', libelle: 'Formule gratuite' };
  if (p.achetable) return { type: 'abonnement', libelle: `S’abonner · ${p.prix.toLocaleString('fr-FR')} € / mois` };
  return { type: 'desactive', libelle: 'Bientôt' };
}

/* ───────────────────────── Rythme de consommation ───────────────────────── */

export interface RythmeCredits {
  /** Crédits consommés par jour, en moyenne sur la période (entier, ≥ 0). */
  parJour: number;
  /** Jours restants au rythme actuel · `null` sans consommation (on ne divise pas par zéro). */
  jours: number | null;
  /** Le solde tiendra-t-il deux semaines ? */
  suffisant: boolean;
}

export const SEUIL_JOURS_CREDITS = 14;

export function rythmeCredits(solde: number, consommes: number, jours = 30): RythmeCredits {
  const parJour = Math.round(Math.max(0, consommes) / Math.max(1, jours));
  const restants = parJour > 0 ? Math.floor(Math.max(0, solde) / parJour) : null;
  return { parJour, jours: restants, suffisant: restants === null ? solde > 0 : restants >= SEUIL_JOURS_CREDITS };
}

/* ───────────────────────── Recharges ───────────────────────── */

export interface PackLu { key: string; credits: number; eur: number }

/**
 * L'économie d'un pack par rapport au PREMIER (le prix du crédit le plus haut),
 * arrondie à l'entier · `null` quand il n'y en a pas (le premier, ou un pack
 * plus cher au crédit).
 */
export function economiePack(packs: readonly PackLu[], key: string): number | null {
  const ref = packs[0];
  const p = packs.find((x) => x.key === key);
  if (!ref || !p || p === ref || !(ref.credits > 0) || !(p.credits > 0)) return null;
  const gain = 1 - p.eur / p.credits / (ref.eur / ref.credits);
  const pct = Math.round(gain * 100);
  return pct > 0 ? pct : null;
}

/** Ce qu'un pack permet · au barème RÉEL (`CREDIT_COSTS`). */
export function equivalencePack(credits: number, couts: Record<CreditAction, number> = CREDIT_COSTS): string {
  const f = (n: number) => n.toLocaleString('fr-FR');
  return `≈ ${f(Math.floor(credits / couts.suggest))} suggestions IA ou ${f(Math.floor(credits / couts.image))} images`;
}

/** La FAQ « Comment sont comptés les crédits ? » · au barème réel. */
export function texteBaremeCredits(couts: Record<CreditAction, number> = CREDIT_COSTS): string {
  const c = (n: number) => `${n} crédit${n > 1 ? 's' : ''}`;
  return `${c(couts.chat)} pour un message à l’assistant, ${couts.image} pour une image, ${couts.brief} pour un brief créatif, ${couts.video} pour une vidéo IA.`;
}

/* ───────────────────────── Équipe ───────────────────────── */

export type CleRole = 'owner' | 'admin' | 'member' | 'client_viewer';

/** Les rôles qu'une invitation peut donner (`createInviteAction` · jamais un second propriétaire). */
export const ROLES_INVITABLES: readonly CleRole[] = ['admin', 'member', 'client_viewer'];

/** Les initiales d'une personne · deux lettres, depuis le nom ou l'e-mail. */
export function initialesPersonne(nom: string | null | undefined, email: string): string {
  const base = (nom ?? '').trim() || email.split('@')[0]!;
  // Des lettres seulement · « Kevin (banc) » donne KB, jamais « K( ».
  const mots = base.split(/[^\p{L}]+/u).filter(Boolean);
  const s = mots.length >= 2 ? mots[0]![0]! + mots[1]![0]! : (mots[0] ?? '?').slice(0, 2);
  return s.toUpperCase();
}

/** Le nom court de la maquette (« Kevin G. ») · prénom + initiale du nom. */
export function nomCourt(nom: string | null | undefined, email: string): string {
  const mots = (nom ?? '').trim().split(/\s+/).filter((m) => /\p{L}/u.test(m));
  if (mots.length === 0) return email;
  if (mots.length === 1) return mots[0]!;
  return `${mots[0]} ${/\p{L}/u.exec(mots[mots.length - 1]!)![0]!.toUpperCase()}.`;
}
