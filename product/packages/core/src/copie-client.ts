/**
 * La copie CLIENT d'un service absent · ce que le client lit, jamais la
 * configuration (recette #106).
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * L'écran Assets annonçait « connexion Drive non configurée (variables
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) », « Sélecteur non configuré
 * (GOOGLE_API_KEY / GOOGLE_APP_ID) » ou « scope drive.file », et le Studio
 * Textes « ajoute ANTHROPIC_API_KEY sur le serveur » · des noms de variables et
 * de service qu'un client ne peut ni comprendre ni régler, et qui exposent
 * l'envers du décor d'un produit en marque blanche.
 *
 * Chaque message dit désormais trois choses, dans les mots du client ·
 *  · CE QUI MANQUE (la connexion n'est pas activée, la session a expiré…) ;
 *  · QUI PEUT AGIR (lui-même, ou la plateforme · jamais une équipe que le
 *    support ne joint pas, lot 11) ;
 *  · QUOI FAIRE (relancer, se reconnecter, demander l'activation, importer par
 *    lien en attendant).
 *
 * Pur · ni base ni réseau. La logique de connexion et les droits ne bougent
 * pas · seuls les mots changent.
 */

/** Une action proposée au client · un libellé et sa destination interne. */
export interface ActionClient {
  libelle: string;
  href: string;
}

/** Un message client · ce qui manque, qui agit et quoi faire, sans jargon. */
export interface MessageClient {
  /** Ce qui manque, en une phrase. */
  constat: string;
  /** Qui peut agir et quoi faire. */
  suite: string;
  /** Le geste proposé, s'il y en a un (sinon la suite se suffit). */
  action: ActionClient | null;
}

/**
 * Lot 11 · le geste vers le support, nommé pour ce qu'il FAIT. Un ticket ne
 * quitte pas l'espace · ses admins le lisent, l'équipe de la plateforme non
 * (constat du lot 8). « Demander l'activation au support » promettait une
 * activation que personne au bout ne peut faire ; le lot 9 avait retiré le
 * bouton de Textes, mais c'était un accès réel au support · on le garde, avec
 * son vrai nom, et la phrase qui dit le routage.
 */
export const TICKET_INTERNE: ActionClient = { libelle: 'Ouvrir un ticket interne', href: '/support' };

/** Ce que devient un ticket · dit à côté de chaque bouton `TICKET_INTERNE`. */
export const ROUTAGE_TICKET = 'Un ticket au support reste dans ton espace · seuls ses admins le lisent, il n’active rien.';

/** Qui active · la plateforme, pas l'espace. Sans promesse de délai ni de contact. */
export const ACTIVATION_PLATEFORME = 'l’activation se fait côté plateforme, pas depuis ton espace';

/** Le repli disponible tant que la connexion automatique n'est pas activée. */
export const REPLI_IMPORT_PAR_LIEN =
  'En attendant, tu peux déjà importer tes fichiers Drive par lien · bouton « Google Drive » de la bibliothèque, juste en dessous.';

/**
 * La connexion automatique n'est pas activée pour l'espace (côté plateforme).
 * Le client n'a rien à régler · l'activation se fait côté plateforme.
 */
export const DRIVE_CONNEXION_INACTIVE: MessageClient = {
  constat: 'La connexion automatique à Google Drive n’est pas encore activée pour ton espace.',
  suite: `Rien à régler de ton côté · ${ACTIVATION_PLATEFORME}. ${REPLI_IMPORT_PAR_LIEN} ${ROUTAGE_TICKET}`,
  action: TICKET_INTERNE,
};

/**
 * Le Drive est connecté, mais le choix des fichiers n'est pas activé pour
 * l'espace (côté plateforme). Même interlocuteur, même repli.
 */
export const DRIVE_SELECTEUR_INACTIF: MessageClient = {
  constat: 'Ton Drive est bien connecté, mais le choix des fichiers n’est pas encore activé pour ton espace.',
  suite: `Rien à régler de ton côté · ${ACTIVATION_PLATEFORME}. ${REPLI_IMPORT_PAR_LIEN} ${ROUTAGE_TICKET}`,
  action: TICKET_INTERNE,
};

/**
 * La génération de textes (Studio Textes) n'est pas activée pour l'espace
 * (côté plateforme). Le client ne peut rien y régler.
 *
 * Lot 9 · la copie promettait « notre équipe l'active sur demande » avec un
 * bouton vers le support. Or un ticket du support ne quitte pas l'espace · il
 * est lu par ses admins, jamais par l'équipe de la plateforme (constat du
 * lot 8). Lot 11 · le bouton revient, nommé pour ce qu'il fait (ticket
 * interne), avec la phrase qui dit ce routage.
 */
export const TEXTES_IA_INACTIFS: MessageClient = {
  constat: 'La génération de textes n’est pas encore activée pour ton espace.',
  suite: `Elle s’active côté plateforme · rien ne se règle depuis ton espace. Aucun crédit n’est débité tant qu’elle est inactive. ${ROUTAGE_TICKET}`,
  action: TICKET_INTERNE,
};

/**
 * Le bouton de génération de Textes quand le service est inactif · lot 12. Il
 * gardait « Générer la créative · 3 crédits » (désactivé mais d'aspect actif),
 * un prix pour une action impossible. Il dit l'état, et l'explication le suit
 * immédiatement. Aucune fonction n'est retirée · elle n'est pas disponible.
 */
export const BOUTON_TEXTES_INACTIF = 'Génération inactive pour ton espace';

/**
 * Le badge des blocs réservés aux admins de l'ESPACE · lot 12. « ADMIN+ »
 * désigne le personnel de la plateforme ; un bloc ouvert aux admins d'un espace
 * client ne le prétend pas.
 */
export const BADGE_ESPACE_ADMIN = 'ESPACE ADMIN';

/** La portée de l'accès, dite sans nom de permission technique. */
export const DRIVE_PORTEE_ACCES =
  'Accès limité aux fichiers et au dossier que tu choisis · aucune autre donnée de ton Drive n’est lue.';

/** Un message en une ligne (constat + suite) · pour un retour d'action. */
export function texteMessageClient(m: MessageClient): string {
  return `${m.constat} ${m.suite}`;
}

/**
 * Le retour d'une tentative de connexion (code d'erreur de l'aller-retour
 * Google) traduit pour le client. Un code inconnu a un repli honnête · on ne
 * montre jamais le code brut.
 */
export const ERREURS_CONNEXION_DRIVE: Record<string, string> = {
  drive_config: `${DRIVE_CONNEXION_INACTIVE.constat} L’activation se fait côté plateforme, pas depuis ton espace · l’import par lien reste disponible.`,
  drive_state: 'La connexion à Google Drive a été interrompue avant la fin. Relance « Connecter Google Drive ».',
  drive_session: 'Ta session a expiré pendant la connexion. Reconnecte-toi, puis relance « Connecter Google Drive ».',
  drive_norefresh: 'Google n’a pas confirmé l’accès. Dans ton compte Google, retire l’accès accordé à l’application, puis relance « Connecter Google Drive ».',
  drive_exchange: 'Google n’a pas pu finaliser la connexion. Réessaie dans un instant.',
  drive_nobrand: 'Choisis d’abord une marque active (sélecteur en haut), puis connecte son Drive.',
};

export const ERREUR_CONNEXION_DRIVE_REPLI =
  'La connexion à Google Drive n’a pas abouti. Réessaie · si ça persiste, écris au support.';

/**
 * Ce que la page Assets montre de Drive À CE MOMENT · le message de retour doit
 * parler de cet état et des gestes réellement affichés (recette #106 · le retour
 * disait « Relance « Connecter Google Drive » » sous un bloc « connexion pas
 * encore activée » qui ne propose ni ce bouton ni cette action).
 * - `inactive` · connexion non activée pour l'espace · gestes : ticket interne, import par lien ;
 * - `sans_marque` · aucune marque active · geste : choisir une marque ;
 * - `a_connecter` · le bouton « Connecter Google Drive » est affiché ;
 * - `connecte` · déjà connecté · pas de bouton de connexion ;
 * - `hors_admin` · le bloc Drive n'est pas montré (réservé aux administrateurs).
 */
export type EtatConnexionDrive = 'inactive' | 'sans_marque' | 'a_connecter' | 'connecte' | 'hors_admin';

export function etatConnexionDrive(s: { available: boolean; needBrand: boolean; connected: boolean } | null): EtatConnexionDrive {
  if (!s) return 'hors_admin';
  if (!s.available) return 'inactive';
  if (s.needBrand) return 'sans_marque';
  return s.connected ? 'connecte' : 'a_connecter';
}

/** Le libellé exact du bouton de connexion · un message ne le cite que s'il est affiché. */
export const LIBELLE_CONNECTER_DRIVE = 'Connecter Google Drive';

const RETOUR_DRIVE_SELON_ETAT: Record<Exclude<EtatConnexionDrive, 'a_connecter'>, string> = {
  inactive: `La connexion à Google Drive n’a pas abouti · elle n’est pas encore activée pour ton espace, et ${ACTIVATION_PLATEFORME}. Importe tes fichiers Drive par lien en attendant.`,
  sans_marque: 'Choisis d’abord une marque active (sélecteur en haut) · le Drive se connecte marque par marque.',
  connecte: 'La dernière tentative de connexion à Google Drive n’a pas abouti · la connexion déjà en place reste active.',
  hors_admin: 'La connexion à Google Drive n’a pas abouti. Un administrateur de l’espace peut la relancer depuis cette page.',
};

/**
 * Le message client d'un code de retour Drive (`?e=drive_…`), selon l'état
 * affiché · le détail par code (et le bouton qu'il cite) ne vaut que lorsque le
 * bouton de connexion est à l'écran.
 */
export function messageErreurConnexionDrive(code: string, etat: EtatConnexionDrive = 'a_connecter'): string {
  if (etat !== 'a_connecter') return RETOUR_DRIVE_SELON_ETAT[etat];
  return Object.prototype.hasOwnProperty.call(ERREURS_CONNEXION_DRIVE, code)
    ? ERREURS_CONNEXION_DRIVE[code]!
    : ERREUR_CONNEXION_DRIVE_REPLI;
}

/**
 * Les marques de configuration technique qui ne doivent JAMAIS atteindre
 * l'écran client · noms de variables, de clés, de permissions ou de protocole.
 * Sert de garde (rendu lu par les tests) · une seule liste, testée elle aussi.
 */
export const MOTIFS_JARGON_TECHNIQUE: readonly RegExp[] = [
  /GOOGLE_[A-Z_]+/,
  /CLIENT_(ID|SECRET)/i,
  /API[_ ]?KEY/i,
  /APP_ID/i,
  /\bscope\b/i,
  /drive\.file/i,
  /oauth/i,
  /\bvariables?\b/i,
  /\btoken\b/i,
  /\bjeton\b/i,
  /configur/i,
  /process\.env/i,
  /\.env\b/i,
  /trendtrack/i,
  /anthropic/i,
];

/** Les fragments techniques trouvés dans un texte affiché (vide = propre). */
export function jargonTechnique(texte: string): string[] {
  const vus: string[] = [];
  for (const m of MOTIFS_JARGON_TECHNIQUE) {
    const t = texte.match(m);
    if (t) vus.push(t[0]);
  }
  return vus;
}
