import { ROLES_INVITABLES, type CleRole } from './forfaits';

/**
 * Spatial · Réglages · Équipe · qui peut retirer un membre ou changer son rôle.
 * Pur · ni base, ni réseau. La MÊME règle sert l'écran (contrôles ouverts ou
 * fermés avec leur raison) et l'action serveur (`app/actions/membres.ts`), qui
 * la relit sur la base verrouillée avant d'écrire.
 *
 *  · réservé aux administrateurs et propriétaires (même plancher que
 *    l'invitation, `createInviteAction`) ;
 *  · jamais sur soi-même · on ne se retire pas, on ne se rétrograde pas ;
 *  · un propriétaire n'est touché que par un propriétaire, et jamais le
 *    DERNIER propriétaire de l'espace ;
 *  · le rôle donné est l'un des rôles invitables (jamais un second
 *    propriétaire · la transmission de propriété n'existe pas).
 *
 * Retirer un membre ne supprime aucun contenu · il perd l'accès à l'espace,
 * ce qu'il a créé y reste.
 */

const RANG: Record<CleRole, number> = { client_viewer: 0, member: 1, admin: 2, owner: 3 };
export const estCleRole = (r: unknown): r is CleRole => typeof r === 'string' && Object.hasOwn(RANG, r);

export type RefusMembre = 'forbidden' | 'membre_absent' | 'soi' | 'proprietaire' | 'dernier_proprietaire' | 'role';

export interface PersonneEquipe { id: string; role: CleRole }

export interface ContexteGesteMembre {
  acteur: PersonneEquipe;
  /** `null` · la personne n'est pas (ou plus) membre de CET espace. */
  cible: PersonneEquipe | null;
  /** Le nombre de propriétaires de l'espace, cible comprise. */
  proprietaires: number;
}

/** Ce qui ferme TOUT geste sur ce membre (retrait comme rôle) · `null` quand l'un et l'autre sont ouverts. */
export function refusGesteMembre(c: ContexteGesteMembre): RefusMembre | null {
  if (RANG[c.acteur.role] < RANG.admin) return 'forbidden';
  if (!c.cible) return 'membre_absent';
  if (c.cible.id === c.acteur.id) return 'soi';
  if (c.cible.role === 'owner' && c.acteur.role !== 'owner') return 'proprietaire';
  if (c.cible.role === 'owner' && c.proprietaires <= 1) return 'dernier_proprietaire';
  return null;
}

/** Pourquoi ce retrait est refusé · `null` quand il est permis. */
export function refusRetraitMembre(c: ContexteGesteMembre): RefusMembre | null {
  return refusGesteMembre(c);
}

/** Pourquoi ce changement de rôle est refusé · `null` quand il est permis. */
export function refusChangementRole(c: ContexteGesteMembre & { nouveau: unknown }): RefusMembre | null {
  const r = refusGesteMembre(c);
  if (r) return r;
  if (!(ROLES_INVITABLES as readonly unknown[]).includes(c.nouveau)) return 'role';
  return null;
}

/** La raison affichée d'un refus · la même à l'écran (infobulle) et au retour de l'action. */
export const RAISON_REFUS_MEMBRE: Readonly<Record<RefusMembre, string>> = {
  forbidden: 'Action réservée aux administrateurs.',
  membre_absent: 'Cette personne n’est plus membre de l’espace · recharge la page.',
  soi: 'Tu ne peux pas te retirer ni changer ton propre rôle.',
  proprietaire: 'Seul un propriétaire peut retirer ou changer le rôle d’un propriétaire.',
  dernier_proprietaire: 'C’est le seul propriétaire de l’espace · il ne peut être ni retiré ni rétrogradé.',
  role: 'Rôle invalide.',
};

/**
 * Les invitations en attente que le retrait annule. Un lien d'invitation
 * s'accepte sans preuve de l'adresse · une personne retirée pourrait donc
 * revenir par un lien qu'elle a gardé. Un admin ou un propriétaire voyait TOUS
 * les liens de l'espace (`/team`) · on les annule tous ; sinon, seulement les
 * siens.
 */
export function revocationInvitationsAuRetrait(role: CleRole): 'espace' | 'les_siennes' {
  return RANG[role] >= RANG.admin ? 'espace' : 'les_siennes';
}

/** Le texte de confirmation avant un retrait · ce qui part, ce qui reste. */
export function confirmationRetraitMembre(nom: string, role: CleRole = 'member'): string {
  const invitations = revocationInvitationsAuRetrait(role) === 'espace'
    ? ' Les invitations en attente de l’espace sont annulées, puisqu’il en voyait les liens.'
    : '';
  return `Retirer ${nom} de l’espace ? Il perd l’accès tout de suite. Ce qu’il a créé reste dans l’espace.${invitations} Une nouvelle invitation à la même adresse n’est pas encore possible.`;
}

/**
 * Les options du menu de rôle d'un membre · les quatre rôles, comme la
 * maquette ; « Propriétaire » reste visible mais jamais choisissable (la
 * transmission de propriété n'existe pas), il n'est que l'état d'un propriétaire.
 */
export function optionsRoleMembre(): ReadonlyArray<{ cle: CleRole; choisissable: boolean }> {
  return (['owner', 'admin', 'member', 'client_viewer'] as const).map((cle) => ({ cle, choisissable: ROLES_INVITABLES.includes(cle) }));
}
