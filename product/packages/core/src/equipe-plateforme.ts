/**
 * Les rôles de l'ÉQUIPE INTERNE (agence) qui opère TikTrends · pur, sans base ni
 * UI.
 *
 * ── Ce que ce module tranche, et ce qu'il ne touche pas ──────────────────────
 *
 * C'est un système de droits SÉPARÉ du modèle CLIENT. Un client garde sa formule
 * (starter/core/plus/business) et ses rôles d'espace (owner/admin/member/…) ·
 * rien de tout ça n'est modifié ici. Ce module ne décide QUE des droits d'un
 * membre de l'équipe plateforme, identifié ailleurs (une table e-mail → rôle).
 *
 * ── Le modèle, volontairement simple ─────────────────────────────────────────
 *
 * Huit rôles, du plus haut au plus bas. `adminplus` et `admin` voient et font
 * TOUT (finances comprises) et ont les crédits illimités · ils ne dépendent pas
 * de la matrice. Les six autres sont pilotés par une MATRICE `rôle → rubriques`
 * éditable (stockée en base, modifiable à chaud). Ce module fournit les défauts
 * de cette matrice et la seule règle qui compte : « ce rôle voit-il cette
 * rubrique ? » · un RÉSULTAT, pas un empilement de conditions dispersées.
 */

export type RolePlateforme =
  | 'adminplus' | 'admin' | 'manager' | 'dev' | 'moderateur' | 'membre' | 'freelance' | 'lecture';

/** Du plus haut pouvoir au plus bas · sert l'affichage et les listes déroulantes. */
export const ROLES_PLATEFORME: readonly RolePlateforme[] = [
  'adminplus', 'admin', 'manager', 'dev', 'moderateur', 'membre', 'freelance', 'lecture',
] as const;

export const LIBELLE_ROLE_PLATEFORME: Record<RolePlateforme, string> = {
  adminplus: 'Admin+', admin: 'Admin', manager: 'Manager', dev: 'Dev',
  moderateur: 'Modérateur', membre: 'Membre', freelance: 'Freelance', lecture: 'Lecture',
};

/**
 * Rôles à ACCÈS TOTAL · tout, y compris les finances plateforme · crédits
 * illimités. Ils ne passent PAS par la matrice (impossible de leur retirer un
 * accès par erreur · un outil qui peut se verrouiller lui-même hors de l'admin
 * n'a plus d'issue).
 */
export const ROLES_ACCES_TOTAL: readonly RolePlateforme[] = ['adminplus', 'admin'] as const;

export function accesTotal(role: RolePlateforme): boolean {
  return ROLES_ACCES_TOTAL.includes(role);
}

/** Crédits illimités · aligné sur l'accès total (Admin+ et Admin usent de l'outil sans coût). */
export function creditIllimitePourRole(role: RolePlateforme): boolean {
  return accesTotal(role);
}

/**
 * Les RUBRIQUES gouvernables · une entrée par section que la matrice peut
 * cocher. `finances` (MRR/churn/facturation plateforme) est distincte de
 * `coulisses` (diagnostic technique · déploiement, incidents) · un Dev peut voir
 * la technique sans voir l'argent.
 */
export interface RubriquePlateforme { key: string; label: string; groupe: string }

export const RUBRIQUES_PLATEFORME: readonly RubriquePlateforme[] = [
  { key: 'dashboard',  label: 'Dashboard',   groupe: 'Pilotage' },
  { key: 'analytics',  label: 'Analytics',   groupe: 'Pilotage' },
  { key: 'veille',     label: 'Veille',      groupe: 'Observatoire' },
  { key: 'radar',      label: 'Radar produits', groupe: 'Observatoire' },
  { key: 'saved',      label: 'Sauvegardes', groupe: 'Observatoire' },
  { key: 'jarvis',     label: 'Jarvis',      groupe: 'Atelier' },
  { key: 'studio',     label: 'Studio IA',   groupe: 'Atelier' },
  { key: 'assets',     label: 'Assets',      groupe: 'Atelier' },
  { key: 'adsmap',     label: 'Adsmap',      groupe: 'Laboratoire' },
  { key: 'marques',    label: 'Marques',     groupe: 'Espace' },
  { key: 'equipe',     label: 'Équipe',      groupe: 'Espace' },
  { key: 'connexions', label: 'Connexions',  groupe: 'Espace' },
  { key: 'usage',      label: 'Crédits',     groupe: 'Espace' },
  { key: 'facturation', label: 'Abonnement & factures', groupe: 'Espace' },
  { key: 'reglages',   label: 'Réglages',    groupe: 'Espace' },
  { key: 'coulisses',  label: 'Coulisses · technique', groupe: 'Plateforme' },
  { key: 'finances',   label: 'Coulisses · finances', groupe: 'Plateforme' },
] as const;

export const CLES_RUBRIQUES: readonly string[] = RUBRIQUES_PLATEFORME.map((r) => r.key);

/**
 * Droits par DÉFAUT des six rôles matriciels · le point de départ que l'écran
 * laisse ajuster. `adminplus`/`admin` ne figurent pas ici · ils ont tout par
 * `accesTotal`. Les clés hors de `CLES_RUBRIQUES` sont ignorées (un garde le
 * vérifie), pour qu'une faute de frappe n'ouvre jamais un accès fantôme.
 */
export const DROITS_DEFAUT: Record<Exclude<RolePlateforme, 'adminplus' | 'admin'>, readonly string[]> = {
  manager:    ['dashboard', 'analytics', 'veille', 'radar', 'saved', 'jarvis', 'studio', 'assets', 'adsmap', 'marques', 'equipe', 'usage'],
  dev:        ['dashboard', 'jarvis', 'studio', 'assets', 'adsmap', 'connexions', 'coulisses'],
  moderateur: ['veille', 'radar', 'saved', 'adsmap', 'jarvis'],
  membre:     ['dashboard', 'veille', 'radar', 'saved', 'jarvis', 'studio', 'assets'],
  freelance:  ['dashboard', 'studio', 'assets', 'marques'],
  lecture:    ['dashboard', 'analytics', 'saved'],
};

/** La matrice éditable · rôle matriciel → rubriques cochées. Partielle · un rôle absent retombe sur ses défauts. */
export type MatriceDroits = Partial<Record<RolePlateforme, readonly string[]>>;

/**
 * LA règle · ce rôle voit-il cette rubrique ?
 *
 * - Accès total (adminplus/admin) → toujours oui, quelle que soit la matrice.
 * - Sinon · la matrice fournie prime ; à défaut, les droits par défaut du rôle.
 * - Une rubrique inconnue (hors `CLES_RUBRIQUES`) → toujours non.
 */
export function roleVoitRubrique(role: RolePlateforme, rubrique: string, matrice?: MatriceDroits): boolean {
  if (!CLES_RUBRIQUES.includes(rubrique)) return false;
  if (accesTotal(role)) return true;
  const source = matrice?.[role] ?? DROITS_DEFAUT[role as Exclude<RolePlateforme, 'adminplus' | 'admin'>] ?? [];
  return source.includes(rubrique);
}

/** L'ensemble des rubriques VISIBLES pour un rôle · sert l'affichage (rail, écran des droits). */
export function rubriquesDuRole(role: RolePlateforme, matrice?: MatriceDroits): string[] {
  return CLES_RUBRIQUES.filter((k) => roleVoitRubrique(role, k, matrice));
}
