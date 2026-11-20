/**
 * Le récapitulatif hebdomadaire · QUAND il part, et pourquoi il ne part qu'une
 * fois par semaine.
 *
 * ── Le manque ────────────────────────────────────────────────────────────────
 *
 * La route `/api/cron/digest` existait et était protégée, mais rien ne
 * l'appelait · le worker planifiait la synchro, Adsmap, le radar, le tracker,
 * les vidéos historiques et la facturation, pas le récap. Aucune notification
 * `digest`, aucun courriel, et « Quoi de neuf » et la cloche, qui le relisent,
 * restaient vides. Le worker le planifie désormais (`weekly-digest`).
 *
 * ── Une semaine, un passage ──────────────────────────────────────────────────
 *
 * La route écrit des notifications et envoie des courriels · la relancer les
 * doublait. Or une crontab hors dépôt peut déjà la taper, et le worker la tape
 * aussi désormais. Le premier passage d'une semaine ISO pose donc un verrou
 * (`cleVerrouRecap`) · tout passage suivant de la même semaine ne renvoie rien.
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

/**
 * Un passage interrompu par une erreur · faut-il rendre le verrou ?
 *
 * Seulement si RIEN n'est parti · le passage suivant de la semaine repart alors
 * de zéro sans rien doubler. Dès qu'une notification ou un courriel est parti,
 * le verrou reste · relancer renverrait la lettre à ceux qui l'ont déjà, et
 * une lettre en double coûte plus cher qu'une lettre manquée (la semaine
 * suivante la rattrape, sa fenêtre n'oublie pas le stock en attente).
 */
export function verrouRecapALiberer(parti: { notifiees: number; envoyees: number }): boolean {
  return parti.notifiees === 0 && parti.envoyees === 0;
}
