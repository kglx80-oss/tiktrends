/**
 * Le récapitulatif hebdomadaire · QUAND il part, et comment il ne part qu'une
 * fois par semaine sans jamais en perdre un morceau.
 *
 * ── Le manque ────────────────────────────────────────────────────────────────
 *
 * La route `/api/cron/digest` existait et était protégée, mais rien ne
 * l'appelait · le worker planifiait la synchro, Adsmap, le radar, le tracker,
 * les vidéos historiques et la facturation, pas le récap. Aucune notification
 * `digest`, aucun courriel, et « Quoi de neuf » et la cloche, qui le relisent,
 * restaient vides. Le worker le planifie désormais (`weekly-digest`).
 *
 * ── Une semaine, un passage, qui REPREND où il s'est arrêté ──────────────────
 *
 * La route écrit des notifications et envoie des courriels · la relancer les
 * doublait. Or une crontab hors dépôt peut déjà la taper, le worker la tape
 * aussi, et BullMQ la retente quand elle échoue. Le premier passage d'une
 * semaine ISO pose donc un verrou (`cleVerrouRecap`) qui porte sa PROGRESSION :
 * la liste des marques retenues, et pour chacune les destinataires déjà
 * notifiés et déjà écrits. Une relance ne refait rien de ce qui est noté.
 *
 * Le verrou peut rester « en cours » sans que personne ne travaille · le timer
 * de déploiement recrée les conteneurs à chaque commit sur main, et tue la
 * requête au milieu du passage. Un verrou dont le dernier battement est plus
 * vieux que `SEUIL_ABANDON_RECAP_MS` est donc REPRIS, pas déclaré « déjà
 * passé ». Un passage qui finit en erreur le dit (`interrompu`) et se laisse
 * reprendre aussitôt.
 *
 * Pur · ni base, ni réseau, ni horloge (la date arrive en paramètre).
 */

/** Le fuseau dans lequel on parle de « lundi matin » · celui des marques servies. */
export const FUSEAU_RECAP_HEBDO = 'Europe/Paris';

/**
 * Lundi 07:47, heure de Paris · lu par le worker (`apps/workers/src/index.ts`,
 * tâche `weekly-digest`, avec `tz: FUSEAU_RECAP_HEBDO`) · une seule écriture.
 *
 * Pourquoi cette heure, dérivée du planning existant (le conteneur du worker
 * n'a pas de fuseau · les autres motifs sont lus en UTC) :
 *  · APRÈS le radar (05:00 UTC, 10 min au plus, délai de `triggerRadar`) ·
 *    soit 07:10 Paris en été au plus tard, 06:10 en hiver. Le récap compte les
 *    trouvailles du radar de la semaine (`reportedAt`), celles de la nuit de
 *    dimanche à lundi comprises ;
 *  · AVANT la journée · la lettre est là quand on ouvre sa boîte, pas à midi ;
 *  · hors de l'heure pile · minute 47, pas 0 ni 30, où tombent les autres
 *    tâches et la plupart des crons d'une machine.
 */
export const MOTIF_RECAP_HEBDO = '47 7 * * 1';

/** Délai du déclencheur worker → web (`triggerDigest`) · la durée maximale de la route (`maxDuration`). */
export const DELAI_DECLENCHEUR_RECAP_MS = 5 * 60_000;

/**
 * Au-delà, un verrou « en cours » est abandonné · le passage qui le tenait est
 * mort. Dérivé, pas posé : trois fois le délai du déclencheur. Un passage
 * vivant bat à chaque destinataire servi (`battement`) · rester muet trois
 * délais entiers, c'est qu'il n'y a plus personne. Plus court, on risquerait
 * de reprendre une marque qu'un passage lent sert encore.
 */
export const SEUIL_ABANDON_RECAP_MS = 3 * DELAI_DECLENCHEUR_RECAP_MS;

/**
 * Tentatives BullMQ de `weekly-digest` · attente exponentielle depuis
 * `ATTENTE_RECAP_MS` (1, 2, 4, 8, 16 min). Dérivé du seuil d'abandon : la
 * somme des attentes (31 min) le dépasse, donc un passage tué au milieu est
 * repris par une tentative du même lundi, sans attendre une crontab ni la
 * semaine suivante. Éprouvé au noyau (`recap-hebdo-planifie.test.ts`).
 */
export const TENTATIVES_RECAP = 6;
export const ATTENTE_RECAP_MS = 60_000;

/**
 * La durée d'un passage COMPLET qu'on s'engage à servir · un passage de 500
 * marques est estimé à 17-50 min (relecture de #1112 : ~6 lectures par marque
 * plus les envois) · 60 min laissent 20 % sur l'estimation haute. Une reprise
 * relit TOUTES les marques (`weeklyDigests`) avant de servir ce qui manque ·
 * elle dure donc autant que la lecture du premier passage, pas 3 minutes.
 */
export const DUREE_PASSAGE_MAX_MS = 60 * 60_000;

/**
 * Un 409 `en_cours` n'est PAS un échec · un passage vivant travaille. Le
 * worker ne consomme alors aucune tentative · il reprogramme une vérification
 * différée de `REPORT_EN_COURS_MS` (au-delà du seuil d'abandon · si le passage
 * meurt entre-temps, la vérification suivante le trouve reprenable). Le nombre
 * de reports est DÉRIVÉ du pire calendrier servi : un premier passage de
 * `DUREE_PASSAGE_MAX_MS` qui meurt à la fin, le seuil d'abandon, une reprise
 * aussi longue, une période de vérification · (2 × 60 + 15 + 16) / 16 ⇒ 10.
 * Éprouvé par la simulation du calendrier (`recap-hebdo-planifie.test.ts`).
 * Au-delà, le worker ALERTE au lieu de se taire.
 */
export const REPORT_EN_COURS_MS = SEUIL_ABANDON_RECAP_MS + 60_000;
export const REPORTS_EN_COURS_MAX = Math.ceil((2 * DUREE_PASSAGE_MAX_MS + SEUIL_ABANDON_RECAP_MS + REPORT_EN_COURS_MS) / REPORT_EN_COURS_MS);

/**
 * Délai SMTP explicite · connexion, accueil, et chaque SILENCE du serveur
 * (inactivité). Les défauts de nodemailer (2 min, 30 s, 10 min) laissaient un
 * envoi muet plus longtemps que le seuil d'abandon · un passage VIVANT passait
 * pour mort, une tentative le reprenait, et les deux écrivaient au même
 * destinataire. Avec 30 s, un serveur injoignable ou muet coupe l'envoi en
 * moins de 90 s (connexion, puis accueil, puis un silence). Un serveur qui
 * répond au compte-gouttes peut faire durer un envoi au-delà · chaque silence
 * reste borné, pas la durée totale. C'est le battement AVANT chaque envoi qui
 * garde le passage vivant, ce délai borne seulement l'attente muette.
 */
export const DELAI_SMTP_MS = 30_000;

/** Le nom du préfixe de la clé de verrou dans `app_settings`. */
export const PREFIXE_VERROU_RECAP = 'digest:';

/**
 * La semaine ISO 8601 d'un instant, lue dans `fuseau` · « 2026-W47 ».
 *
 * Lue à Paris et non en UTC : dimanche 23:30 UTC est déjà lundi 00:30 à Paris,
 * la semaine suivante · une crontab réglée sur l'heure de Paris et le worker
 * tombent ainsi dans la même semaine, donc sous le même verrou.
 */
export function semaineIso(instant: Date, fuseau: string = FUSEAU_RECAP_HEBDO): string {
  const parties = new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(instant);
  const lire = (t: string) => Number(parties.find((p) => p.type === t)?.value);
  const jour = new Date(Date.UTC(lire('year'), lire('month') - 1, lire('day')));
  // ISO · lundi = 0 … dimanche = 6 ; la semaine appartient à l'année de son jeudi.
  const rang = (jour.getUTCDay() + 6) % 7;
  const jeudi = new Date(jour.getTime() + (3 - rang) * 86_400_000);
  const annee = jeudi.getUTCFullYear();
  const premierJanvier = Date.UTC(annee, 0, 1);
  const semaine = 1 + Math.floor((jeudi.getTime() - premierJanvier) / (7 * 86_400_000));
  return `${annee}-W${String(semaine).padStart(2, '0')}`;
}

/** La clé du verrou hebdomadaire · `digest:2026-W47`. */
export function cleVerrouRecap(instant: Date, fuseau: string = FUSEAU_RECAP_HEBDO): string {
  return `${PREFIXE_VERROU_RECAP}${semaineIso(instant, fuseau)}`;
}

/* ───────────────────────────── le verrou et sa progression ───────────────────────────── */

export interface ServiRecap {
  notifies: string[];
  courriels: string[];
  /** Courriels refusés DÉFINITIVEMENT (5xx sur le destinataire ou le contenu) · plus retentés. */
  abandons: string[];
}

/** La valeur du verrou dans `app_settings` · réécrite à chaque destinataire servi. */
export interface EtatVerrouRecap {
  etat: 'en_cours' | 'interrompu' | 'fait';
  /** Le passage qui tient le verrou · seules ses écritures portent (`value->>'jeton'`). */
  jeton: string;
  /** Le premier passage de la semaine · il fixe la fenêtre lue, reprise comprise. */
  debut: string;
  /** Le dernier pas écrit · au-delà de `SEUIL_ABANDON_RECAP_MS`, le passage est mort. */
  battement: string;
  reprises: number;
  /** Les marques retenues au premier passage · figées pour la semaine (`null` · pas encore lues). */
  marques: string[] | null;
  /** Par marque, ceux qui ont déjà reçu la notification, et le courriel. */
  servis: Record<string, ServiRecap>;
}

export function etatInitialRecap(jeton: string, maintenant: Date): EtatVerrouRecap {
  const t = maintenant.toISOString();
  return { etat: 'en_cours', jeton, debut: t, battement: t, reprises: 0, marques: null, servis: {} };
}

/** Lit une valeur de verrou relue en base · `null` si elle n'a pas la forme attendue. */
export function lireEtatRecap(v: unknown): EtatVerrouRecap | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!['en_cours', 'interrompu', 'fait'].includes(String(o.etat))) return null;
  if (typeof o.jeton !== 'string' || typeof o.debut !== 'string' || typeof o.battement !== 'string') return null;
  if (Number.isNaN(Date.parse(o.debut)) || Number.isNaN(Date.parse(o.battement))) return null;
  const marques = Array.isArray(o.marques) ? o.marques.map(String) : null;
  const servis: Record<string, ServiRecap> = {};
  if (o.servis && typeof o.servis === 'object') {
    for (const [k, s] of Object.entries(o.servis as Record<string, unknown>)) {
      const x = (s ?? {}) as Record<string, unknown>;
      servis[k] = {
        notifies: Array.isArray(x.notifies) ? x.notifies.map(String) : [],
        courriels: Array.isArray(x.courriels) ? x.courriels.map(String) : [],
        abandons: Array.isArray(x.abandons) ? x.abandons.map(String) : [],
      };
    }
  }
  return { etat: o.etat as EtatVerrouRecap['etat'], jeton: o.jeton, debut: o.debut, battement: o.battement, reprises: Number(o.reprises) || 0, marques, servis };
}

export type DecisionVerrouRecap =
  | { action: 'deja_passe' }
  | { action: 'en_cours' }
  | { action: 'reprendre'; precedent: EtatVerrouRecap | null };

/**
 * Un verrou de la semaine existe déjà · que faire de cet appel ?
 *  · `fait` · rien, la semaine est servie ;
 *  · `en_cours` qui bat encore · un autre passage travaille, on ne le double pas
 *    (la route répond 409, le worker retentera) ;
 *  · `en_cours` muet depuis `SEUIL_ABANDON_RECAP_MS`, ou `interrompu` · on
 *    REPREND, progression comprise ;
 *  · valeur illisible et pas `fait` · on reprend sans progression connue.
 */
export function decisionVerrouRecap(valeur: unknown, maintenant: Date): DecisionVerrouRecap {
  const e = lireEtatRecap(valeur);
  if (!e) {
    const etat = valeur && typeof valeur === 'object' ? (valeur as Record<string, unknown>).etat : undefined;
    return etat === 'fait' ? { action: 'deja_passe' } : { action: 'reprendre', precedent: null };
  }
  if (e.etat === 'fait') return { action: 'deja_passe' };
  if (e.etat === 'interrompu') return { action: 'reprendre', precedent: e };
  const muet = maintenant.getTime() - Date.parse(e.battement);
  return muet > SEUIL_ABANDON_RECAP_MS ? { action: 'reprendre', precedent: e } : { action: 'en_cours' };
}

/** La reprise · nouveau jeton, même début (même fenêtre), progression gardée. */
export function repriseRecap(precedent: EtatVerrouRecap | null, jeton: string, maintenant: Date): EtatVerrouRecap {
  if (!precedent) return { ...etatInitialRecap(jeton, maintenant), reprises: 1 };
  return { ...precedent, etat: 'en_cours', jeton, battement: maintenant.toISOString(), reprises: precedent.reprises + 1 };
}

export function avecMarquesRecap(e: EtatVerrouRecap, marques: string[], maintenant: Date): EtatVerrouRecap {
  return { ...e, marques: [...marques], battement: maintenant.toISOString() };
}

const servi = (e: EtatVerrouRecap, marque: string): ServiRecap => e.servis[marque] ?? { notifies: [], courriels: [], abandons: [] };

export function dejaNotifieRecap(e: EtatVerrouRecap, marque: string, utilisateur: string): boolean {
  return servi(e, marque).notifies.includes(utilisateur);
}
/** Déjà écrit · ou abandonné après un refus définitif (on ne réessaie pas une boîte qui n'existe pas). */
export function dejaEcritRecap(e: EtatVerrouRecap, marque: string, utilisateur: string): boolean {
  const s = servi(e, marque);
  return s.courriels.includes(utilisateur) || s.abandons.includes(utilisateur);
}

export function avecNotificationRecap(e: EtatVerrouRecap, marque: string, utilisateur: string, maintenant: Date): EtatVerrouRecap {
  const s = servi(e, marque);
  if (s.notifies.includes(utilisateur)) return e;
  return { ...e, battement: maintenant.toISOString(), servis: { ...e.servis, [marque]: { ...s, notifies: [...s.notifies, utilisateur] } } };
}
export function avecCourrielRecap(e: EtatVerrouRecap, marque: string, utilisateur: string, maintenant: Date): EtatVerrouRecap {
  const s = servi(e, marque);
  if (s.courriels.includes(utilisateur)) return e;
  return { ...e, battement: maintenant.toISOString(), servis: { ...e.servis, [marque]: { ...s, courriels: [...s.courriels, utilisateur] } } };
}

export function avecAbandonRecap(e: EtatVerrouRecap, marque: string, utilisateur: string, maintenant: Date): EtatVerrouRecap {
  const s = servi(e, marque);
  if (s.abandons.includes(utilisateur)) return e;
  return { ...e, battement: maintenant.toISOString(), servis: { ...e.servis, [marque]: { ...s, abandons: [...s.abandons, utilisateur] } } };
}

/** Le passage bat · rien d'autre ne change. */
export function avecBattementRecap(e: EtatVerrouRecap, maintenant: Date): EtatVerrouRecap {
  return { ...e, battement: maintenant.toISOString() };
}

/**
 * Un refus SMTP DÉFINITIF pour CE destinataire · et seulement lui : réponse
 * 5xx à `RCPT TO` portant un code étendu qui désigne l'adresse du DESTINATAIRE
 * (RFC 3463) · 5.1.1 boîte inexistante, 5.1.2 domaine inexistant, 5.1.3
 * adresse mal formée, 5.1.6 boîte déplacée, 5.1.10 domaine nul (RFC 7505).
 * Les autres 5.1.x parlent de l'EXPÉDITEUR, même renvoyés au RCPT par Postfix
 * (5.1.0 « Sender address rejected », 5.1.7, 5.1.8) · ils frappent tout le
 * monde. Tout le reste est PASSAGER, `DATA` compris · `554 5.7.1 Relay access
 * denied` au RCPT, quota en 550 5.2.x, « address not verified » d'un relais
 * après `DATA`, filtre de contenu · l'abandonner ferait taire la semaine.
 */
export function refusDefinitifSmtp(e: { responseCode?: unknown; command?: unknown; response?: unknown } | null | undefined): boolean {
  const code = Number(e?.responseCode);
  const commande = String(e?.command ?? '').toUpperCase();
  const reponse = String(e?.response ?? '');
  return code >= 500 && code < 600 && commande.startsWith('RCPT') && /^\d{3}[ -]5\.1\.(1|2|3|6|10)\b/.test(reponse.trim());
}

/**
 * Le disjoncteur des abandons · un refus « définitif » qui frappe beaucoup de
 * monde n'est plus une boîte morte, c'est une cause commune (relais, quota,
 * politique du serveur) mal classée. On n'abandonne alors PERSONNE · le
 * passage finit `interrompu` et le worker finit par alerter.
 *
 * Seuil DÉRIVÉ, pas posé : les destinataires sont des propriétaires et
 * administrateurs qui se sont inscrits avec cette adresse · une boîte morte
 * parmi eux est l'exception. Quand les refus « définitifs » DÉPASSENT les
 * envois réussis (la majorité des décisions), la cause commune est plus
 * probable que la coïncidence · et sans aucun envoi réussi, il n'y a même pas
 * de référence pour dire que le serveur fonctionne. Strictement · à égalité
 * (un espace de deux personnes, une boîte morte), la boîte morte est notée,
 * sinon cet espace resterait `interrompu` chaque semaine pour une seule
 * adresse.
 *
 * Et seulement à partir de `EFFECTIF_DISJONCTEUR` refus · la doctrine du dépôt
 * (un groupe n'a le droit de parler qu'avec un effectif minimum). Les comptes
 * sont ceux de TOUTE l'installation · avant le lancement, une installation
 * compte une poignée de destinataires, dont souvent des comptes de test
 * (`@example.com`, 556 5.1.10) ou une adresse mal saisie. Un ou deux refus
 * concordants s'expliquent par une ou deux mauvaises adresses · les traiter en
 * cause commune laisserait la semaine `interrompu` chaque lundi, sans recours
 * autre que corriger l'adresse. Trois boîtes mortes en même temps, plus
 * nombreuses que les envois réussis, sont moins plausibles qu'un relais ou un
 * quota. Une erreur dans l'autre sens est rattrapée · sous le seuil, les
 * abandons sont notés ET le worker crie « abandonnés » (ALERTE).
 */
export const EFFECTIF_DISJONCTEUR = 3;
export function disjoncteurAbandons(c: { envoyes: number; abandons: number }): boolean {
  return c.abandons >= EFFECTIF_DISJONCTEUR && (c.envoyes === 0 || c.abandons > c.envoyes);
}

/** Courriels notés partis, toutes reprises confondues. */
export function courrielsNotesRecap(e: EtatVerrouRecap): number {
  return Object.values(e.servis).reduce((n, s) => n + s.courriels.length, 0);
}
/** Courriels notés abandonnés, toutes reprises confondues. */
export function abandonsNotesRecap(e: EtatVerrouRecap): number {
  return Object.values(e.servis).reduce((n, s) => n + s.abandons.length, 0);
}

/** Ce que le worker fait de la réponse de la route. */
export type SuiteRecap =
  | { action: 'fini' }
  | { action: 'sans_smtp' }
  | { action: 'reporter'; delaiMs: number; reports: number }
  | { action: 'retenter' }
  | { action: 'abandon'; raison: string; disjoncteur?: boolean };

/**
 * La suite d'un déclenchement de `weekly-digest`.
 *  · servi (ou déjà servi) · fini ;
 *  · 409 `en_cours` / `verrou_perdu` · un passage vivant tient la semaine ·
 *    REPORTER sans consommer de tentative, au plus `REPORTS_EN_COURS_MAX` fois ;
 *  · 503 `smtp_absent` · une CONFIGURATION, pas une panne · les lettres sont
 *    servies dans l'application, les courriels ne peuvent pas partir. Rien à
 *    retenter (chaque retente relirait toutes les marques pour rien) · une
 *    ligne au journal, pas d'ALERTE « non servi » (crier chaque lundi pour un
 *    état connu apprend à ignorer l'alerte) ;
 *  · disjoncteur déclenché · une cause commune côté SMTP · abandon immédiat,
 *    ALERTE précise (pas « non servi » · les lettres sont dans l'application) ;
 *  · tout autre échec (500, délai dépassé, injoignable) · RETENTER (BullMQ,
 *    une tentative) tant qu'il en reste ;
 *  · plus rien · ABANDON, que le worker crie (la semaine n'est pas `fait`).
 */
export function suiteRecap(
  issue: { ok: boolean; status?: number; detail?: string; corps?: Record<string, unknown> },
  c: { reports: number; tentative: number; tentativesMax: number },
): SuiteRecap {
  if (issue.ok) return { action: 'fini' };
  if (issue.status === 503 && issue.detail === 'smtp_absent') return { action: 'sans_smtp' };
  if (issue.corps?.disjoncteur === true) {
    return { action: 'abandon', disjoncteur: true, raison: `disjoncteur des courriels · ${Number(issue.corps.refused) || 0} refus « définitif(s) » pour ${Number(issue.corps.sent) || 0} courriel(s) parti(s) cette semaine · cause commune probable (relais, quota, politique du serveur) · aucune adresse abandonnée, lettres servies dans l'application · vérifier la configuration SMTP puis relancer GET /api/cron/digest` };
  }
  if (issue.status === 409 && (issue.detail === 'en_cours' || issue.detail === 'verrou_perdu')) {
    return c.reports < REPORTS_EN_COURS_MAX
      ? { action: 'reporter', delaiMs: REPORT_EN_COURS_MS, reports: c.reports + 1 }
      : { action: 'abandon', raison: `un passage tient la semaine depuis ${REPORTS_EN_COURS_MAX} vérifications (${Math.round(REPORTS_EN_COURS_MAX * REPORT_EN_COURS_MS / 60_000)} min)` };
  }
  return c.tentative < c.tentativesMax
    ? { action: 'retenter' }
    : { action: 'abandon', raison: `dernière tentative (${c.tentative}/${c.tentativesMax}) en échec · ${issue.detail ?? issue.status ?? 'inconnu'}` };
}

/**
 * La fin du passage · `fait` seulement si rien n'a échoué. Une marque en
 * erreur ou un courriel refusé laissent le verrou `interrompu` · la tentative
 * suivante (BullMQ, crontab, relance à la main) reprend ce qui manque, et
 * seulement ça. Une lettre manquée n'est rattrapée par personne d'autre · le
 * passage du lundi suivant lit sa propre semaine.
 */
export function finRecap(e: EtatVerrouRecap, echecs: number, maintenant: Date): EtatVerrouRecap {
  return { ...e, etat: echecs > 0 ? 'interrompu' : 'fait', battement: maintenant.toISOString() };
}
