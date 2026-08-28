/**
 * Bibliothèque d'accroches · les mots exacts, avec ce qu'ils ont donné.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * Jarvis savait dire « les accroches chiffrées gagnent 3 fois sur 8 ici ».
 * C'est une CATÉGORIE. Personne n'a jamais écrit une publicité à partir d'une
 * catégorie · on écrit à partir d'un exemple.
 *
 * « 3 erreurs que tu fais avec ta crème » n'est pas la même chose que « accroche
 * chiffrée » : la première se réécrit, la seconde se contemple. L'agent A0
 * extrait déjà les mots exacts de chaque accroche — chez nous ET chez les
 * concurrents — et personne ne les relisait. Ce fichier les met au travail.
 *
 * ── La règle qui gouverne tout ───────────────────────────────────────────────
 *
 * **Une accroche de concurrent n'est jamais une accroche qui marche.** On sait
 * qu'un annonceur continue de la payer, rien de plus. Elle entre donc dans la
 * bibliothèque sous une étiquette différente, et le bloc injecté interdit
 * explicitement de la recopier · s'en inspirer structurellement est du métier,
 * la reprendre mot pour mot est diffuser la publicité de quelqu'un d'autre.
 *
 * Pur : ni base, ni horloge.
 */

/** D'où vient l'accroche · décide de ce qu'on a le droit d'en dire. */
export type HookOrigin = 'brand' | 'market';

export interface HookSource {
  /** Les mots exacts, tels qu'A0 les a relevés. */
  text: string;
  origin: HookOrigin;
  /** Marque uniquement · le verdict arbitré de l'ad qui portait cette accroche. */
  verdict?: string | null;
  /** Marché uniquement · qui la diffuse, et depuis combien de temps. */
  advertiser?: string | null;
  daysRunning?: number | null;
  /** Contexte utile à la réécriture. */
  hookType?: string | null;
  mechanism?: string | null;
}

/**
 * Ce qu'on peut affirmer d'une accroche.
 *
 * Quatre niveaux et pas trois : distinguer « jamais testée » de « testée et
 * perdante » est ce qui empêche de reproposer éternellement ce qui a déjà échoué.
 */
export type HookEvidence = 'proven' | 'refuted' | 'untested' | 'market';

export interface HookEntry {
  text: string;
  evidence: HookEvidence;
  /** Nombre de fois où cette formulation a été relevée. */
  occurrences: number;
  hookType: string | null;
  mechanism: string | null;
  /** Marché · nombre d'annonceurs distincts qui l'emploient. */
  advertisers: number;
  /** Marché · durée de diffusion la plus longue observée. */
  maxDaysRunning: number | null;
}

const GAGNANTS = new Set(['winner', 'baby_winner', 'relative_winner']);
const PERDANTS = new Set(['loser']);

/** Longueur minimale · en dessous, ce n'est pas une accroche, c'est un fragment. */
const MIN_LEN = 12;
const MAX_LEN = 220;

/**
 * Empreinte d'une accroche, pour regrouper deux relevés de la même phrase.
 *
 * Plus stricte que celle des libellés de nœuds : ici l'ORDRE des mots compte.
 * « Tu perds tes cheveux ? » et « Perds-tu tes cheveux » sont la même accroche ;
 * « le froid abîme ta peau » et « ta peau abîme le froid » ne le sont pas.
 */
export function hookFingerprint(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .join(' ');
}

function evidenceOf(s: HookSource): HookEvidence {
  if (s.origin === 'market') return 'market';
  if (s.verdict && GAGNANTS.has(s.verdict)) return 'proven';
  if (s.verdict && PERDANTS.has(s.verdict)) return 'refuted';
  return 'untested';
}

/** Une accroche prouvée l'emporte sur tout · un doublon ne dégrade jamais. */
const RANG: Record<HookEvidence, number> = { proven: 0, market: 1, untested: 2, refuted: 3 };

/**
 * Construit la bibliothèque.
 *
 * Une même formulation peut être relevée plusieurs fois avec des issues
 * différentes · on garde alors la MEILLEURE preuve. Une accroche qui a gagné une
 * fois et n'a rien donné une autre reste une accroche qui a gagné : c'est
 * l'existence du succès qui informe, pas sa fréquence.
 */
export function buildHookLibrary(sources: HookSource[]): HookEntry[] {
  const parEmpreinte = new Map<string, HookEntry & { annonceurs: Set<string> }>();

  for (const s of sources) {
    const texte = (s.text ?? '').replace(/\s+/g, ' ').trim();
    if (texte.length < MIN_LEN || texte.length > MAX_LEN) continue;
    const fp = hookFingerprint(texte);
    if (!fp) continue;

    const ev = evidenceOf(s);
    const deja = parEmpreinte.get(fp);
    if (!deja) {
      parEmpreinte.set(fp, {
        text: texte, evidence: ev, occurrences: 1,
        hookType: s.hookType ?? null, mechanism: s.mechanism ?? null,
        advertisers: 0, maxDaysRunning: s.daysRunning ?? null,
        annonceurs: new Set(s.advertiser ? [s.advertiser] : []),
      });
      continue;
    }
    deja.occurrences++;
    if (RANG[ev] < RANG[deja.evidence]) deja.evidence = ev;
    if (s.advertiser) deja.annonceurs.add(s.advertiser);
    if ((s.daysRunning ?? 0) > (deja.maxDaysRunning ?? 0)) deja.maxDaysRunning = s.daysRunning ?? null;
    deja.hookType ??= s.hookType ?? null;
    deja.mechanism ??= s.mechanism ?? null;
  }

  return [...parEmpreinte.values()]
    .map(({ annonceurs, ...e }) => ({ ...e, advertisers: annonceurs.size }))
    .sort((a, b) => {
      if (RANG[a.evidence] !== RANG[b.evidence]) return RANG[a.evidence] - RANG[b.evidence];
      // À preuve égale, ce qui dure le plus longtemps d'abord, puis ce qui revient.
      const jours = (b.maxDaysRunning ?? 0) - (a.maxDaysRunning ?? 0);
      return jours !== 0 ? jours : b.occurrences - a.occurrences;
    });
}

/* -------------------------------------------------------------------------- */
/*  Bloc de prompt                                                            */
/* -------------------------------------------------------------------------- */

export interface HookPromptOptions {
  /** Combien d'accroches prouvées injecter · au-delà, le prompt se dilue. */
  maxProven?: number;
  maxMarket?: number;
  maxRefuted?: number;
}

/**
 * Le bloc injecté dans les générations.
 *
 * Trois sections, et chacune répond à une question différente pour le modèle :
 * quoi reprendre, quoi éviter, de quoi s'inspirer sans copier.
 *
 * La section « marché » porte une interdiction explicite de recopier. Sans elle,
 * un modèle à qui on tend des phrases toutes faites les reprend · et on diffuse
 * la publicité d'un concurrent sous notre marque. La consigne dit donc ce qu'on
 * attend vraiment : la MÉCANIQUE de la phrase, pas ses mots.
 */
export function formatHooksForPrompt(entries: HookEntry[], opts: HookPromptOptions = {}): string {
  const proven = entries.filter((e) => e.evidence === 'proven').slice(0, opts.maxProven ?? 8);
  const refuted = entries.filter((e) => e.evidence === 'refuted').slice(0, opts.maxRefuted ?? 5);
  const market = entries.filter((e) => e.evidence === 'market').slice(0, opts.maxMarket ?? 8);

  if (!proven.length && !refuted.length && !market.length) return '';

  const lignes: string[] = [];

  if (proven.length) {
    lignes.push(
      'ACCROCHES QUI ONT GAGNÉ SUR CETTE MARQUE · ce sont des faits mesurés.',
      'Reprends ce qui les fait fonctionner : la promesse, la tension, le rythme.',
      ...proven.map((e) => `- « ${e.text} »${e.hookType ? ` (${e.hookType})` : ''}`),
      '',
    );
  }

  if (refuted.length) {
    lignes.push(
      'ACCROCHES DÉJÀ TESTÉES ET PERDANTES ICI · ne les repropose pas.',
      ...refuted.map((e) => `- « ${e.text} »`),
      '',
    );
  }

  if (market.length) {
    lignes.push(
      'ACCROCHES QUE DES CONCURRENTS DIFFUSENT DEPUIS LONGTEMPS.',
      'Ce ne sont PAS des accroches dont on sait qu’elles convertissent · on sait',
      'seulement que leur annonceur continue de les payer.',
      'INTERDIT de les recopier, même partiellement : ce sont les mots de quelqu’un',
      'd’autre. Prends-en la MÉCANIQUE (ce qui accroche, pourquoi ça retient) et',
      'écris la tienne, avec le vocabulaire de la marque.',
      ...market.map((e) => {
        const duree = e.maxDaysRunning ? `, ${e.maxDaysRunning} j en ligne` : '';
        const qui = e.advertisers > 1 ? `, ${e.advertisers} annonceurs` : '';
        return `- « ${e.text} »${duree}${qui}`;
      }),
    );
  }

  return lignes.join('\n').trim();
}

/* -------------------------------------------------------------------------- */
/*  Lecture pour l'écran                                                      */
/* -------------------------------------------------------------------------- */

export interface HookCounts { proven: number; refuted: number; untested: number; market: number }

export function countHooks(entries: HookEntry[]): HookCounts {
  const n = (e: HookEvidence) => entries.filter((x) => x.evidence === e).length;
  return { proven: n('proven'), refuted: n('refuted'), untested: n('untested'), market: n('market') };
}

/**
 * Une phrase pour l'entête.
 *
 * Elle nomme ce qui manque plutôt que ce qui est là quand la bibliothèque est
 * maigre : « 12 accroches » ne dit pas si Jarvis écrit mieux, « aucune accroche
 * gagnante » dit exactement quoi faire pour que ça change.
 */
export function summarizeHooks(counts: HookCounts): string {
  if (!counts.proven && !counts.market) {
    return 'Aucune accroche relevée · décris tes créas et celles du marché pour que Jarvis écrive à partir d’exemples, pas de catégories.';
  }
  if (!counts.proven) {
    return `${counts.market} accroche(s) du marché, aucune gagnante chez toi · arbitre tes tests pour que Jarvis sache lesquelles reprendre.`;
  }
  const bouts = [`${counts.proven} accroche(s) gagnante(s) ici`];
  if (counts.market) bouts.push(`${counts.market} du marché`);
  if (counts.refuted) bouts.push(`${counts.refuted} écartée(s) faute d’avoir marché`);
  return bouts.join(' · ') + '.';
}
