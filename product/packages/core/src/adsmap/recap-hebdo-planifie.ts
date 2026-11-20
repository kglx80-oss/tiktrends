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

export interface ServiRecap { notifies: string[]; courriels: string[] }

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

const servi = (e: EtatVerrouRecap, marque: string): ServiRecap => e.servis[marque] ?? { notifies: [], courriels: [] };

export function dejaNotifieRecap(e: EtatVerrouRecap, marque: string, utilisateur: string): boolean {
  return servi(e, marque).notifies.includes(utilisateur);
}
export function dejaEcritRecap(e: EtatVerrouRecap, marque: string, utilisateur: string): boolean {
  return servi(e, marque).courriels.includes(utilisateur);
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
