/**
 * UX V2 · lot 4c · les onglets de « Réglages » et de « Administration ».
 *
 * Pur · aucune base, aucun réseau. Ce module ne PROTÈGE rien : chaque page garde
 * son propre contrôle (redirection ou écran de refus), écrit dans la page et
 * inchangé. Il décide seulement quels onglets PROPOSER, à partir des droits que
 * le serveur a calculés avec ces mêmes contrôles, lus tels quels.
 *
 * La règle tient en une phrase · un onglet n'apparaît que si la garde réelle de
 * sa page l'ouvre au rôle courant. Une page qui proposerait un onglet qu'elle
 * refuse ensuite renvoie l'utilisateur à l'accueil · c'est ce qu'un menu de
 * compte trop large faisait avant le lot 12.
 *
 * ── Les gardes de page, nommées ──────────────────────────────────────────────
 *
 * Chaque entrée déclare la garde de SA page (`gardePage`). Un test lit la
 * source de chaque page et vérifie qu'elle porte bien ce contrôle · si une page
 * change de garde sans que ce tableau suive, le test tombe.
 *
 *  · `session`            · toute session (Mon profil).
 *  · `admin-espace`       · rôle d'espace admin ou propriétaire.
 *  · `fondateur`          · admin d'espace ET fondateur (vue plateforme).
 *  · `equipe-acces-total` · rôle d'équipe Admin+ ou Admin (`accesTotal`).
 *  · `plateforme`         · permission plateforme du registre · accès total
 *                           d'équipe ET compte admissible (SEC-10).
 *  · `jarvis`             · l'ouverture réelle de Jarvis (`refusJarvis`).
 */

export type GardePage = 'session' | 'admin-espace' | 'fondateur' | 'equipe-acces-total' | 'plateforme' | 'jarvis';

export interface OngletPage {
  cle: string;
  libelle: string;
  href: string;
  /** Vrai sur la page affichée · rendu `aria-current="page"`. */
  courant: boolean;
}

const cheminSeul = (href: string): string => href.split('#')[0]!.split('?')[0]!;
const contient = (base: string, chemin: string): boolean => chemin === base || chemin.startsWith(base + '/');

/**
 * L'entrée qui CONTIENT le chemin, la plus précise gagne · `/admin/finance`
 * allume « Finance », pas « Vue d'ensemble » (`/admin`). Aucune → `null`.
 */
export function cleCourante(entrees: ReadonlyArray<{ cle: string; href: string }>, chemin: string): string | null {
  const c = cheminSeul(chemin);
  let meilleure: { cle: string; long: number } | null = null;
  for (const e of entrees) {
    const base = cheminSeul(e.href);
    if (contient(base, c) && (!meilleure || base.length > meilleure.long)) meilleure = { cle: e.cle, long: base.length };
  }
  return meilleure?.cle ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Réglages · votre espace                                                   */
/* -------------------------------------------------------------------------- */

export interface EntreeReglages {
  /** Clé de la fonctionnalité du menu de compte (`FEATURES`, rbac), `profile` à part. */
  cle: string;
  libelle: string;
  href: string;
  /**
   * D'où vient l'ouverture · `menu-compte` = présente dans le menu de compte
   * filtré par la garde réelle (`sectionsCompteOuvertes`) ; `session` = toute
   * session connectée.
   */
  ouverture: 'menu-compte' | 'session';
  gardePage: Extract<GardePage, 'session' | 'admin-espace'>;
}

export const ONGLETS_REGLAGES: readonly EntreeReglages[] = [
  { cle: 'settings', libelle: 'Réglages', href: '/settings', ouverture: 'menu-compte', gardePage: 'admin-espace' },
  { cle: 'team', libelle: 'Membres', href: '/team', ouverture: 'menu-compte', gardePage: 'admin-espace' },
  { cle: 'connect', libelle: 'Connexions', href: '/connections', ouverture: 'menu-compte', gardePage: 'admin-espace' },
  { cle: 'usage', libelle: 'Utilisation des crédits', href: '/usage', ouverture: 'menu-compte', gardePage: 'admin-espace' },
  { cle: 'billing', libelle: 'Abonnement et factures', href: '/billing', ouverture: 'menu-compte', gardePage: 'admin-espace' },
  { cle: 'profile', libelle: 'Mon profil', href: '/profile', ouverture: 'session', gardePage: 'session' },
] as const;

/**
 * Les onglets de Réglages pour ce rôle. `menuCompte` · les clés du menu de
 * compte que la garde réelle ouvre (lues sur `sectionsCompteOuvertes`, côté
 * serveur). Moins de deux onglets → aucun · une barre d'un seul onglet ne mène
 * nulle part (un membre ou un lecteur n'a que son profil).
 */
export function ongletsReglages(menuCompte: ReadonlySet<string>, chemin: string): OngletPage[] {
  const ouverts = ONGLETS_REGLAGES.filter((e) => e.ouverture === 'session' || menuCompte.has(e.cle));
  if (ouverts.length < 2) return [];
  const courante = cleCourante(ouverts, chemin);
  return ouverts.map((e) => ({ cle: e.cle, libelle: e.libelle, href: e.href, courant: e.cle === courante }));
}

/* -------------------------------------------------------------------------- */
/*  Administration · équipe plateforme                                        */
/* -------------------------------------------------------------------------- */

/** Ce que le serveur a lu, avec les contrôles des pages eux-mêmes. */
export interface DroitsAdministration {
  /** `roleAtLeast(role, 'admin') && isFounder(email)` · garde de `/admin`, `/console`, `/credits`… */
  fondateur: boolean;
  /** `roleAtLeast(role, 'admin')` · garde des pages « Espace » (Réglages, Abonnement). */
  adminEspace: boolean;
  /** `equipe && accesTotal(equipe.role)` · garde de `/admin/equipe` et `/admin/connaissances`. */
  accesTotalEquipe: boolean;
  /** Permission plateforme (`gardePlateforme`) · accès total ET compte admissible. */
  plateforme: boolean;
  /** `refusJarvis(s) === null`. */
  jarvis: boolean;
}

export type GroupeAdministration =
  | 'Pilotage' | 'Finance' | 'Comptes et équipe' | 'Technique' | 'IA et connaissances' | 'Marché' | 'Côté espace';

export interface PageAdministration {
  cle: string;
  /** Libellé court de l'onglet. */
  onglet: string;
  /** Titre de la page, tel qu'elle l'affiche. */
  titre: string;
  /** Ce que la page fait vraiment · repris de son en-tête ou de l'ancienne carte. */
  description: string;
  href: string;
  groupe: GroupeAdministration;
  gardePage: Exclude<GardePage, 'session'>;
  /** Présentée sur la page d'entrée, jamais en onglet (page cliente, hors Administration). */
  horsOnglets?: true;
}

/** L'ordre des groupes sur la page d'entrée et dans la barre d'onglets. */
export const GROUPES_ADMINISTRATION: readonly GroupeAdministration[] = [
  'Pilotage', 'Finance', 'Comptes et équipe', 'Technique', 'IA et connaissances', 'Marché', 'Côté espace',
] as const;

export const PAGES_ADMINISTRATION: readonly PageAdministration[] = [
  { cle: 'admin', onglet: 'Vue d’ensemble', titre: 'Tableau de bord', description: 'La santé de la plateforme en un coup d’œil · revenus, espaces, activité, support.', href: '/admin', groupe: 'Pilotage', gardePage: 'fondateur' },

  { cle: 'finance', onglet: 'Finance', titre: 'Finance · MRR & marges', description: 'Revenu récurrent, bénéfice net réel, optimisation des marges par formule.', href: '/admin/finance', groupe: 'Finance', gardePage: 'fondateur' },
  { cle: 'plans', onglet: 'Formules', titre: 'Formules & crédits · pilotage', description: 'Leviers internes · appliquer une formule et créditer sans paiement, pour les tests, les démonstrations et les gestes commerciaux.', href: '/admin/plans', groupe: 'Finance', gardePage: 'fondateur' },
  { cle: 'paiement', onglet: 'Paiement', titre: 'Chaîne de paiement', description: 'Vérifications à passer avant chaque bascule de mode, et après toute modification des prix ou du webhook.', href: '/admin/paiement', groupe: 'Finance', gardePage: 'fondateur' },
  { cle: 'credits', onglet: 'Crédits et marges', titre: 'Crédits & marges', description: 'Barème, coût réel API, règle × markup et marge par action.', href: '/credits', groupe: 'Finance', gardePage: 'fondateur' },
  { cle: 'depenses', onglet: 'Dépenses IA', titre: 'Dépense IA réelle', description: 'Les dollars réellement dépensés chez les fournisseurs d’IA sur 30 jours glissants, face au plafond · réconciliation des factures.', href: '/admin/depenses', groupe: 'Finance', gardePage: 'fondateur' },

  { cle: 'signups', onglet: 'Inscriptions', titre: 'Inscriptions & onboarding', description: 'Nouveaux comptes, profils déclarés, niveau IA et objectifs.', href: '/admin/signups', groupe: 'Comptes et équipe', gardePage: 'fondateur' },
  { cle: 'equipe', onglet: 'Équipe et droits', titre: 'Équipe & droits', description: 'Rôles de l’agence (Admin+ → Lecture) et rubriques visibles par rôle.', href: '/admin/equipe', groupe: 'Comptes et équipe', gardePage: 'equipe-acces-total' },

  { cle: 'console', onglet: 'Console', titre: 'Console', description: 'État du système, intégrations, files de génération, diagnostics.', href: '/console', groupe: 'Technique', gardePage: 'fondateur' },
  { cle: 'incidents', onglet: 'Incidents', titre: 'Incidents techniques', description: 'Chaque échec rencontré par un client, regroupé par cause, pour repérer un fournisseur qui déraille · conservation 30 jours.', href: '/admin/incidents', groupe: 'Technique', gardePage: 'fondateur' },

  { cle: 'ia-studios', onglet: 'IA et Studios', titre: 'IA et Studios', description: 'Registre des prompts de Jarvis et des studios · versions, releases, évaluations, routage et traces.', href: '/admin/ia-studios', groupe: 'IA et connaissances', gardePage: 'plateforme' },
  { cle: 'interrupteurs', onglet: 'Interrupteurs', titre: 'Interrupteurs Studios', description: 'Capacités des nouveaux Studios par espace · pilotes, généralisation, coupures. Nouveautés en recette coupées par défaut.', href: '/admin/studios-interrupteurs', groupe: 'IA et connaissances', gardePage: 'plateforme' },
  { cle: 'connaissances', onglet: 'Connaissances', titre: 'Connaissances', description: 'Consignes, méthodes d’itération, savoirs et données que Jarvis lit à chaque réponse.', href: '/admin/connaissances', groupe: 'IA et connaissances', gardePage: 'equipe-acces-total' },

  { cle: 'intelligence', onglet: 'Intelligence', titre: 'Intelligence marché', description: 'Concurrents (Atria, Foreplay, Higgsfield) et notre positionnement.', href: '/admin/intelligence', groupe: 'Marché', gardePage: 'fondateur' },

  // Pages CLIENTES que l'ancien tableau de bord proposait déjà · gardées sur la
  // page d'entrée (aucun lien retiré), jamais en onglet · elles ne sont pas de
  // l'Administration et gardent leur propre thème.
  { cle: 'jarvis', onglet: 'Jarvis', titre: 'Jarvis', description: 'Règles créatives maison imposées à chaque génération, par marque.', href: '/jarvis', groupe: 'Côté espace', gardePage: 'jarvis', horsOnglets: true },
  { cle: 'billing', onglet: 'Abonnement', titre: 'Plans & Facturation', description: 'Formules, prix, allocations et abonnements.', href: '/billing', groupe: 'Côté espace', gardePage: 'admin-espace', horsOnglets: true },
  { cle: 'settings', onglet: 'Réglages', titre: 'Réglages', description: 'Paramètres de l’espace, modèles IA, clés et intégrations serveur.', href: '/settings', groupe: 'Côté espace', gardePage: 'admin-espace', horsOnglets: true },
] as const;

/** La garde de la page s'ouvre-t-elle avec ces droits ? Le défaut est le refus. */
export function gardeOuverte(garde: GardePage, d: DroitsAdministration): boolean {
  switch (garde) {
    case 'session': return true;
    case 'admin-espace': return d.adminEspace;
    case 'fondateur': return d.fondateur;
    case 'equipe-acces-total': return d.accesTotalEquipe;
    case 'plateforme': return d.accesTotalEquipe && d.plateforme;
    case 'jarvis': return d.jarvis;
    default: return false;
  }
}

/** L'utilisateur appartient-il à l'équipe plateforme au sens d'une page d'Administration ? */
export function voitAdministration(d: DroitsAdministration): boolean {
  return PAGES_ADMINISTRATION.some((p) => !p.horsOnglets && gardeOuverte(p.gardePage, d));
}

/**
 * Les onglets de l'Administration · les seules pages que leur garde ouvre, dans
 * l'ordre des groupes. Aucune page d'Administration ouverte → aucun onglet (un
 * client, propriétaire de son espace compris, n'en voit jamais).
 */
export function ongletsAdministration(d: DroitsAdministration, chemin: string): Array<OngletPage & { groupe: GroupeAdministration }> {
  const ouverts = PAGES_ADMINISTRATION.filter((p) => !p.horsOnglets && gardeOuverte(p.gardePage, d));
  if (ouverts.length < 2) return [];
  const courante = cleCourante(ouverts, chemin);
  return ouverts.map((p) => ({ cle: p.cle, libelle: p.onglet, href: p.href, courant: p.cle === courante, groupe: p.groupe }));
}

/**
 * La page d'entrée `/admin` · les pages ouvertes, regroupées, sans elle-même.
 * Un groupe sans page ouverte n'apparaît pas.
 */
export function groupesAdministration(d: DroitsAdministration): Array<{ groupe: GroupeAdministration; pages: PageAdministration[] }> {
  return GROUPES_ADMINISTRATION
    .map((groupe) => ({ groupe, pages: PAGES_ADMINISTRATION.filter((p) => p.groupe === groupe && p.cle !== 'admin' && gardeOuverte(p.gardePage, d)) }))
    .filter((g) => g.pages.length > 0);
}
