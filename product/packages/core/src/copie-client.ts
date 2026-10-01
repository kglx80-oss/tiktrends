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
 *  · QUI PEUT AGIR (lui-même, ou notre équipe via le support) ;
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

const SUPPORT: ActionClient = { libelle: 'Demander l’activation au support', href: '/support' };

/** Le repli disponible tant que la connexion automatique n'est pas activée. */
export const REPLI_IMPORT_PAR_LIEN =
  'En attendant, tu peux déjà importer tes fichiers Drive par lien · bouton « Google Drive » de la bibliothèque, juste en dessous.';

/**
 * La connexion automatique n'est pas activée pour l'espace (côté plateforme).
 * Le client n'a rien à régler · c'est notre équipe qui l'active.
 */
export const DRIVE_CONNEXION_INACTIVE: MessageClient = {
  constat: 'La connexion automatique à Google Drive n’est pas encore activée pour ton espace.',
  suite: `Rien à régler de ton côté · notre équipe l’active sur demande. ${REPLI_IMPORT_PAR_LIEN}`,
  action: SUPPORT,
};

/**
 * Le Drive est connecté, mais le choix des fichiers n'est pas activé pour
 * l'espace (côté plateforme). Même interlocuteur, même repli.
 */
export const DRIVE_SELECTEUR_INACTIF: MessageClient = {
  constat: 'Ton Drive est bien connecté, mais le choix des fichiers n’est pas encore activé pour ton espace.',
  suite: `Rien à régler de ton côté · notre équipe l’active sur demande. ${REPLI_IMPORT_PAR_LIEN}`,
  action: SUPPORT,
};

/**
 * La génération de textes (Studio Textes) n'est pas activée pour l'espace
 * (côté plateforme). Le client ne peut rien y régler · notre équipe l'active.
 */
export const TEXTES_IA_INACTIFS: MessageClient = {
  constat: 'La génération de textes n’est pas encore activée pour ton espace.',
  suite: 'Rien à régler de ton côté · notre équipe l’active sur demande. Aucun crédit n’est débité tant qu’elle est inactive.',
  action: SUPPORT,
};

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
  drive_config: `${DRIVE_CONNEXION_INACTIVE.constat} Notre équipe l’active sur demande · écris au support. L’import par lien reste disponible.`,
  drive_state: 'La connexion à Google Drive a été interrompue avant la fin. Relance « Connecter Google Drive ».',
  drive_session: 'Ta session a expiré pendant la connexion. Reconnecte-toi, puis relance « Connecter Google Drive ».',
  drive_norefresh: 'Google n’a pas confirmé l’accès. Dans ton compte Google, retire l’accès accordé à l’application, puis relance « Connecter Google Drive ».',
  drive_exchange: 'Google n’a pas pu finaliser la connexion. Réessaie dans un instant.',
  drive_nobrand: 'Choisis d’abord une marque active (sélecteur en haut), puis connecte son Drive.',
};

export const ERREUR_CONNEXION_DRIVE_REPLI =
  'La connexion à Google Drive n’a pas abouti. Réessaie · si ça persiste, écris au support.';

/** Le message client d'un code de retour Drive (`?e=drive_…`). */
export function messageErreurConnexionDrive(code: string): string {
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
