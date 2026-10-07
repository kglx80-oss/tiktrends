/**
 * Studios · permissions logiques (cahier 01 §8.1), DÉRIVÉES des droits existants.
 *
 * Pur. Aucun rôle nouveau, aucun droit nouveau : chaque permission se lit sur ce
 * que la session a déjà.
 *
 * ── Les trois sources, et elles seules ───────────────────────────────────────
 *
 *  · `studioOuvert` · le résultat de `canAccess(effectiveAccess(s), studio)`
 *    calculé côté serveur avec le catalogue existant (`lib/rbac.ts`) : rôle
 *    d'espace « member » et offre Core pour un client, rubrique `studio` de la
 *    matrice pour l'équipe plateforme, fondateur forcé en Business. Ce module ne
 *    le recalcule pas · il le reçoit.
 *  · `roleEspace` · le rôle `workspace_members.role`. Comme pour Jarvis
 *    (`lib/jarvis-acces.ts`), on exige EN PLUS « member » pour tout geste
 *    d'écriture : avec une session d'équipe, `canAccess` ne lit que la matrice,
 *    et un membre d'équipe invité en `client_viewer` ne doit pas générer.
 *  · `roleEquipe` · le rôle plateforme ; seul l'ACCÈS TOTAL (adminplus, admin)
 *    ouvre les permissions de portée plateforme, comme `peutGererConnaissances`
 *    et `/admin/equipe` aujourd'hui.
 *
 * ── Ce qui n'est PAS ouvert, volontairement ──────────────────────────────────
 *
 * Aucune permission de portée « espace » sur les prompts, les fournisseurs, les
 * traces ou les connaissances n'est accordée à un admin ou owner d'espace : ce
 * droit n'existe pas aujourd'hui (toute inscription libre crée un owner). Les
 * personnalisations d'espace (cahier 8.1) demanderont une décision de Kevin et
 * passeront par ce module, en un seul endroit.
 */

export type RoleEspace = 'owner' | 'admin' | 'member' | 'client_viewer';

/** Permissions qui ne s'exercent que sur la plateforme entière. */
export const PERMISSIONS_PLATEFORME = [
  'prompt.read',
  'prompt.draft',
  'prompt.evaluate',
  'prompt.publish',
  'prompt.rollback',
  'provider.configure',
  'run.inspect_redacted',
  'knowledge.manage',
] as const;

/**
 * Permissions d'espace. `studio.read` s'ajoute à la liste du cahier : lister et
 * inspecter un projet demandent une règle explicite ; elle reprend exactement
 * l'ouverture actuelle des pages studio, sans l'élargir.
 */
export const PERMISSIONS_ESPACE = ['studio.read', 'studio.propose', 'studio.generate', 'studio.export'] as const;

export type PermissionPlateforme = (typeof PERMISSIONS_PLATEFORME)[number];
export type PermissionEspace = (typeof PERMISSIONS_ESPACE)[number];
export type PermissionStudio = PermissionPlateforme | PermissionEspace;

export interface SujetStudio {
  roleEspace: RoleEspace;
  /** `canAccess(effectiveAccess(session), FEATURE studio)` · calculé par le serveur. */
  studioOuvert: boolean;
  /** Rôle d'équipe plateforme, `null` pour un compte client. */
  roleEquipe: string | null;
}

export interface PermissionsStudio {
  espace: ReadonlySet<PermissionEspace>;
  plateforme: ReadonlySet<PermissionPlateforme>;
}

const RANG_ROLE: Readonly<Record<RoleEspace, number>> = { client_viewer: 0, member: 1, admin: 2, owner: 3 };

/** Recopie de `ROLES_ACCES_TOTAL` (equipe-plateforme.ts), éprouvée par un test d'égalité. */
const ACCES_TOTAL_PLATEFORME: readonly string[] = ['adminplus', 'admin'];

export function estRoleEspace(x: unknown): x is RoleEspace {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(RANG_ROLE, x);
}

/** La règle, en un seul endroit. */
export function permissionsStudio(s: SujetStudio): PermissionsStudio {
  const espace = new Set<PermissionEspace>();
  const plateforme = new Set<PermissionPlateforme>();

  // Rôle inconnu (valeur forgée) → rien. Le défaut est le refus.
  const rang = estRoleEspace(s.roleEspace) ? RANG_ROLE[s.roleEspace] : -1;

  if (s.studioOuvert && rang >= 0) {
    espace.add('studio.read');
    if (rang >= RANG_ROLE.member) {
      espace.add('studio.propose');
      espace.add('studio.generate');
      espace.add('studio.export');
    }
  }

  if (s.roleEquipe !== null && ACCES_TOTAL_PLATEFORME.includes(s.roleEquipe)) {
    for (const p of PERMISSIONS_PLATEFORME) plateforme.add(p);
  }

  return { espace, plateforme };
}

export function aPermissionEspace(p: PermissionsStudio, permission: PermissionEspace): boolean {
  return p.espace.has(permission);
}

export function aPermissionPlateforme(p: PermissionsStudio, permission: PermissionPlateforme): boolean {
  return p.plateforme.has(permission);
}

/** Liste triée, pour l'affichage ou une trace d'audit. */
export function listerPermissions(p: PermissionsStudio): string[] {
  return [...[...p.espace].map((x) => `espace:${x}`), ...[...p.plateforme].map((x) => `plateforme:${x}`)].sort();
}
