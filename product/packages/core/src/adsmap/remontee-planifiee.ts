/**
 * ADSMAP · la REMONTÉE PLANIFIÉE des mesures Meta, et le journal des remontées.
 *
 * La planification existe déjà dans l'infrastructure · le worker (`apps/workers`,
 * file `cron`, tâche `adsmap-sync`) appelle chaque jour la route protégée
 * `/api/cron/adsmap`, qui mesure toutes les marques connectées. Rien ne la
 * montrait · ni la dernière remontée réussie, ni la prochaine, ni pourquoi la
 * dernière avait échoué. Ce module dit cet état, à partir de faits relus
 * (journal `adsmap_remontees`, `brands.adsmap_synced_at`), sans rien supposer.
 *
 * Pur · ni base, ni réseau, ni horloge (`maintenant` arrive en paramètre).
 */

/**
 * Le motif de la tâche planifiée · lu par le worker (`apps/workers/src/index.ts`)
 * ET par l'écran · une seule écriture, la prochaine remontée affichée ne peut
 * pas dériver de celle qui tourne. Le conteneur du worker n'a pas de fuseau
 * (`node:22-alpine`, aucun `TZ`) · BullMQ lit donc le motif en UTC.
 */
export const MOTIF_REMONTEE_ADSMAP = '0 7 * * *';
export const HEURE_REMONTEE_UTC = 7;

/**
 * Au-delà, la remontée nocturne est EN RETARD · dérivé du planning, pas posé :
 * une période (24 h) + la durée maximale d'un passage (15 min, délai du
 * déclencheur `triggerAdsMapSync`) + 45 min de marge pour la file (un passage
 * en cours d'une autre tâche). Mesuré sur rien d'autre que le planning lui-même.
 */
export const RETARD_REMONTEE_MS = (24 * 60 + 15 + 45) * 60_000;

export type SourceRemontee = 'meta' | 'csv';
export type DeclencheurRemontee = 'nuit' | 'bouton' | 'import';

/** Pourquoi une remontée a échoué · un CODE, jamais le message brut (il peut porter un compte, une adresse). */
export type MotifEchecRemontee = 'non_connecte' | 'jeton' | 'droits' | 'limite' | 'reseau' | 'autre';

export const PHRASE_ECHEC_REMONTEE: Record<MotifEchecRemontee, string> = {
  non_connecte: 'le compte publicitaire Meta n’est plus connecté pour cette marque',
  jeton: 'le jeton Meta a expiré ou a été révoqué · reconnecte Meta Ads',
  droits: 'le jeton n’a pas accès à ce compte publicitaire · vérifie les droits dans Meta Business',
  limite: 'Meta a limité les appels · la remontée suivante reprendra',
  reseau: 'Meta était injoignable · la remontée suivante reprendra',
  autre: 'la remontée a échoué · la suivante réessaiera',
};

/** Le code d'un échec, lu sur le message de l'erreur · rien n'est conservé du message. */
export function motifEchecRemontee(message: string | null | undefined): MotifEchecRemontee {
  const m = (message ?? '').toLowerCase();
  if (m.includes('meta_not_connected')) return 'non_connecte';
  // Les messages de l'API Graph · « Error validating access token », « (#17) User request limit reached »…
  if (/access token|oauthexception|\(#190\)|session has expired|has been invalidated/.test(m)) return 'jeton';
  if (/\(#(10|200|294)\)|permission|not authorized/.test(m)) return 'droits';
  if (/\(#(4|17|32|613)\)|request limit|rate limit|too many calls/.test(m)) return 'limite';
  if (/fetch failed|econnreset|econnrefused|etimedout|enotfound|network|aborted|timeout|http 5\d\d/.test(m)) return 'reseau';
  return 'autre';
}

/** Une remontée journalisée (`adsmap_remontees`). */
export interface RemonteeJournal {
  source: SourceRemontee;
  declencheur: DeclencheurRemontee;
  /** ISO. */
  le: string;
  ok: boolean;
  motif: MotifEchecRemontee | null;
  /** Le compte rendu · nombres seulement (variantes, journées, verdicts). */
  resume: { variantes?: number; journees?: number; verdicts?: number; lots?: number; lotsNumeros?: number[]; fichier?: string | null } | null;
}

/** La prochaine remontée planifiée après `maintenant` · ISO, à `HEURE_REMONTEE_UTC` pile. */
export function prochaineRemontee(maintenant: Date): string {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate(), HEURE_REMONTEE_UTC));
  if (d.getTime() <= maintenant.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export interface EntreeEtatRemontee {
  connecte: boolean;
  /** La clé de déclenchement (`CRON_SECRET`) est posée sur le serveur · sans elle, le worker ne déclenche rien. */
  cleDeclenchement: boolean;
  /** ISO · la remontée nocturne est suspendue pour cette marque depuis ce moment · `null` = active. */
  suspendueLe: string | null;
  /** ISO · la dernière mesure réussie de la carte (`brands.adsmap_synced_at`). */
  derniereReussie: string | null;
  /** Les remontées Meta journalisées de la marque, la plus récente d'abord. */
  journal: readonly RemonteeJournal[];
}

export type PhaseRemontee = 'a_brancher' | 'inactive' | 'suspendue' | 'planifiee' | 'en_echec' | 'en_retard';

export interface EtatRemontee {
  phase: PhaseRemontee;
  /** La ligne de la carte · « Remontée chaque nuit · prochaine … ». */
  libelle: string;
  /** ISO · `null` quand rien n'est planifié. */
  prochaine: string | null;
  /** ISO · la dernière remontée réussie, toutes origines (nuit, bouton). */
  derniere: string | null;
  /** La phrase de la dernière erreur, si la dernière tentative a échoué · `null` sinon. */
  erreur: string | null;
  /** Le réglage « chaque nuit » peut-il être basculé · sinon sa raison, écrite à côté. */
  raisonFermee: string | null;
}

const heure = (iso: string, fuseau: string) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: fuseau });
const jourHeure = (iso: string, fuseau: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: fuseau })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: fuseau })}`;
};

/** L'état de la remontée planifiée d'une marque · phrase prête pour la carte Meta de Connexions. */
export function etatRemontee(e: EntreeEtatRemontee, maintenant: Date, fuseau: string): EtatRemontee {
  const metas = e.journal.filter((j) => j.source === 'meta');
  const derniereTentative = metas[0] ?? null;
  const reussies = metas.filter((j) => j.ok).map((j) => j.le);
  const derniere = [e.derniereReussie, ...reussies].filter((x): x is string => !!x).sort().pop() ?? null;
  const erreur = derniereTentative && !derniereTentative.ok ? PHRASE_ECHEC_REMONTEE[derniereTentative.motif ?? 'autre'] : null;
  const dit = (x: string | null) => (x ? `dernière le ${jourHeure(x, fuseau)}` : 'aucune remontée réussie pour l’instant');

  if (!e.connecte) {
    return { phase: 'a_brancher', libelle: 'Remontée nocturne · connecte Meta Ads d’abord', prochaine: null, derniere, erreur: null, raisonFermee: 'Connecte Meta Ads pour planifier la remontée' };
  }
  if (!e.cleDeclenchement) {
    return { phase: 'inactive', libelle: `Remontée nocturne inactive sur ce serveur · ${dit(derniere)}`, prochaine: null, derniere, erreur,
      raisonFermee: 'La clé de déclenchement des tâches planifiées (CRON_SECRET) n’est pas posée sur le serveur · seule la mesure à la demande fonctionne' };
  }
  if (e.suspendueLe) {
    return { phase: 'suspendue', libelle: `Remontée nocturne suspendue · ${dit(derniere)}`, prochaine: null, derniere, erreur, raisonFermee: null };
  }
  const prochaine = prochaineRemontee(maintenant);
  const base = `Remontée chaque nuit · prochaine ${heure(prochaine, fuseau)} · ${dit(derniere)}`;
  if (erreur) return { phase: 'en_echec', libelle: base, prochaine, derniere, erreur, raisonFermee: null };
  const repere = derniere ?? e.suspendueLe;
  if (repere && maintenant.getTime() - Date.parse(repere) > RETARD_REMONTEE_MS) {
    return { phase: 'en_retard', libelle: base, prochaine, derniere,
      erreur: 'aucune remontée réussie depuis plus d’une nuit · le service des tâches planifiées ne tourne peut-être pas', raisonFermee: null };
  }
  return { phase: 'planifiee', libelle: base, prochaine, derniere, erreur: null, raisonFermee: null };
}

/** Les lignes « Dernières remontées » de l'écran Importer, pour le journal · « CSV · Lot #2 · 3 variantes · 14 journées ». */
export function texteRemontee(j: RemonteeJournal): string {
  const lots = j.resume?.lotsNumeros ?? [];
  const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
  if (j.source === 'csv') {
    const r = j.resume ?? {};
    const lotTxt = lots.length ? ` · ${lots.length === 1 ? `Lot #${lots[0]}` : `Lots ${lots.map((n) => `#${n}`).join(', ')}`}` : '';
    return `CSV${lotTxt} · ${pl(r.variantes ?? 0, 'variante', 'variantes')} · ${pl(r.journees ?? 0, 'journée', 'journées')}`;
  }
  const quand = j.declencheur === 'nuit' ? 'Remontée de la nuit' : 'Mesure Meta';
  if (!j.ok) return `${quand} · échec · ${PHRASE_ECHEC_REMONTEE[j.motif ?? 'autre']}`;
  return `${quand} · ${pl(j.resume?.variantes ?? 0, 'variante rattachée', 'variantes rattachées')} · ${pl(j.resume?.verdicts ?? 0, 'verdict', 'verdicts')}`;
}

/**
 * Le rattachement des ads de la marque à leurs annonces Meta, en trois comptes
 * (« Rattacher aux lots » de l'assistant de connexion) · une ad ÉPINGLÉE se
 * mesure sans deviner ; une ad NOMMÉE (nom régie posé) se rattache à la
 * première remontée ou au premier import ; une ad sans l'un ni l'autre ne se
 * mesure pas. Les brouillons ne comptent pas (rien n'a été diffusé).
 */
export function bilanRattachement(ads: ReadonlyArray<{ idMeta: string | null; nomRegie: string | null }>): { epinglees: number; nommees: number; sansRepere: number; phrase: string } {
  let epinglees = 0, nommees = 0, sansRepere = 0;
  for (const a of ads) {
    if (a.idMeta) epinglees++;
    else if (a.nomRegie?.trim()) nommees++;
    else sansRepere++;
  }
  const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
  const phrase = ads.length === 0
    ? 'Aucune ad lancée ou prête dans les lots de cette marque · rien à rattacher pour l’instant.'
    : `${pl(epinglees, 'ad épinglée', 'ads épinglées')} à l’annonce Meta · ${pl(nommees, 'rattachable', 'rattachables')} par le nom régie · ${pl(sansRepere, 'sans nom ni identifiant', 'sans nom ni identifiant')} (non mesurable${sansRepere > 1 ? 's' : ''} tant qu’elle${sansRepere > 1 ? 's' : ''} n’en a pas).`;
  return { epinglees, nommees, sansRepere, phrase };
}
