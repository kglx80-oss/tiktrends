/**
 * Studios · contrôle de la PAROLE d'une prise parlée · la transcription mot à
 * mot de la prise livrée comparée à la réplique VALIDÉE du plan.
 *
 * Pur. Le modèle vidéo à audio natif ne garantit pas de dire la réplique
 * exacte : il peut sauter un mot (« sans sulfate » devient « sulfate »), en
 * ajouter (« Bonjour, »), en remplacer. La transcription (Scribe v2, horodatée
 * par mot) dit ce qui a VRAIMENT été prononcé ; ce module dit si c'est la
 * réplique, et sinon ce qui manque et ce qui est en trop. Même esprit que
 * `copie-conforme.ts` (texte demandé ↔ texte rendu), appliqué à l'oreille.
 *
 * ── Ce qu'on ne compte pas comme un écart ────────────────────────────────────
 *
 * Seulement ce que l'oreille et l'écriture ne distinguent pas (`cleParole`) :
 *  · casse, ponctuation, tirets, apostrophes droites ou typographiques ;
 *  · accents (« à » et « a », « où » et « ou » sonnent pareil) ;
 *  · nombres en chiffres ou en lettres (« 20 % » et « vingt pour cent »,
 *    « 1 000 » et « mille », « 3,5 » et « trois virgule cinq », « 9,99 € » et
 *    « neuf euros quatre-vingt-dix-neuf », « 14h30 » et « quatorze heures
 *    trente », « 2e » et « deuxième », « n°1 » et « numéro un ») ;
 *  · s et x finals muets (« produit » et « produits »), terminaisons -er et -ez
 *    (« hydrater », « hydratez », « hydraté ») ;
 *  · une courte liste FERMÉE d'homophones grammaticaux (`HOMOPHONES`) : la
 *    transcription choisit une graphie, l'audio ne la tranche pas ;
 *  · un mot écrit en un ou deux morceaux (« week-end », « weekend »,
 *    « Glow Up », « Glowup ») : même suite de lettres.
 * Tout le reste est un écart : mot manquant, ajouté ou remplacé.
 *
 * ── Le seuil, MESURÉ ─────────────────────────────────────────────────────────
 *
 * Corpus `CORPUS_PAROLE` (`corpus-parole.ts`) : paires (réplique,
 * transcription) étiquetées à la main, en variantes à accepter et en vrais
 * écarts. Écarts comptés après normalisation par `test/parole-controle.test.ts`,
 * qui exige l'égalité avec ce tableau (`MESURE_CORPUS_PAROLE`) :
 *
 *   | famille                                  | paires | écarts min | écarts max | taux min | taux max |
 *   |------------------------------------------|--------|------------|------------|----------|----------|
 *   | variante · casse et ponctuation          |      6 |          0 |          0 |    0,000 |    0,000 |
 *   | variante · apostrophes et tirets         |      5 |          0 |          0 |    0,000 |    0,000 |
 *   | variante · nombres                       |     11 |          0 |          0 |    0,000 |    0,000 |
 *   | variante · homophones et finales muettes |      8 |          0 |          0 |    0,000 |    0,000 |
 *   | variante · mots soudés ou coupés         |      4 |          0 |          0 |    0,000 |    0,000 |
 *   | écart · mot manquant                     |      6 |          1 |          2 |    0,048 |    0,250 |
 *   | écart · mot ajouté                       |      5 |          1 |          2 |    0,250 |    0,500 |
 *   | écart · mot remplacé                     |      7 |          1 |          2 |    0,167 |    0,500 |
 *   | écart · réplique tronquée                |      3 |          3 |          4 |    0,429 |    0,571 |
 *   | écart · autre réplique ou silence        |      4 |          4 |          9 |    0,800 |    1,333 |
 *
 * Toute variante tombe à 0 écart, tout vrai écart en compte au moins 1. Un
 * TAUX ne sépare pas les deux familles : un mot manquant (« ni ») sur une
 * réplique de 21 mots fait 0,048, et c'est souvent le mot qui porte le sens
 * (« sans », « ne », le nom du produit). La frontière se pose donc sur le
 * NOMBRE d'écarts : `ECARTS_TOLERES = 0`. C'est la seule valeur qui sépare
 * les familles (1 accepterait déjà 14 des 25 vrais écarts du corpus) ; la
 * marge vient de la normalisation, qui absorbe les variantes AVANT le compte,
 * jamais d'une tolérance sur le compte.
 */

import type { MotHorodate } from './sous-titres';
import type { ContenuVersion, PlanStudio } from '../document';
import { estPriseParlee, voixNativeDemandee } from './prise-parlee';
import { langueDuProjet } from '../fournisseurs/catalogue-video';

/*
 * « euh » (et toute hésitation) est un ÉCART, pas une variante : une hésitation
 * audible dans une publicité est un défaut de la prise, et la réplique validée
 * n'en contient jamais. Décision documentée, gardée par le corpus (« Une peau
 * euh douce »).
 *
 * ── Observation d'abord ──────────────────────────────────────────────────────
 *
 * Le corpus ci-dessous est ÉCRIT À LA MAIN : il prouve que la normalisation
 * absorbe les variantes connues, il ne mesure pas le bruit d'un vrai
 * transcripteur sur de vraies prises. Tant que `PRISES_REELLES_MESUREES` n'a
 * pas `EFFECTIF_PRISES_REELLES_MIN` paires, le contrôle est en OBSERVATION
 * (`modeControleParole`) : il écrit son verdict, ses écarts et les mots
 * horodatés au journal, mais ne met aucun plan « à reprendre » et ne propose
 * aucune reprise. Le seuil ne décide qu'une fois mesuré sur le terrain.
 */

/**
 * Paires (réplique, transcription Scribe RÉELLE) relevées sur de vraies prises
 * parlées, étiquetées à l'écoute. VIDE : aucune prise parlée réelle n'a encore
 * été transcrite (fal est bloqué depuis la session de développement, et la
 * voix native n'est pas encore livrée). À remplir depuis le journal
 * `media.speech.control` du mode observation.
 */
export const PRISES_REELLES_MESUREES: ReadonlyArray<{ famille: string; replique: string; transcription: string }> = [];
/** Effectif avant que le seuil ait le droit de décider · politique (une trentaine de prises), pas une mesure. */
export const EFFECTIF_PRISES_REELLES_MIN = 30;

export type ModeControleParole = 'observation' | 'decision';
/** Observation tant que l'effectif de vraies prises mesurées n'est pas atteint. */
export function modeControleParole(prises: ReadonlyArray<unknown> = PRISES_REELLES_MESUREES): ModeControleParole {
  return prises.length >= EFFECTIF_PRISES_REELLES_MIN ? 'decision' : 'observation';
}

/** Écarts tolérés après normalisation · mesuré sur le corpus (voir l'en-tête). */
export const ECARTS_TOLERES = 0;

/** Le tableau de l'en-tête, tel que mesuré · le test le recompte et exige l'égalité. */
export const MESURE_CORPUS_PAROLE: Readonly<Record<string, { paires: number; min: number; max: number; tauxMin: number; tauxMax: number }>> = {
  'variante · casse et ponctuation': { paires: 6, min: 0, max: 0, tauxMin: 0, tauxMax: 0 },
  'variante · apostrophes et tirets': { paires: 5, min: 0, max: 0, tauxMin: 0, tauxMax: 0 },
  'variante · nombres': { paires: 11, min: 0, max: 0, tauxMin: 0, tauxMax: 0 },
  'variante · homophones et finales muettes': { paires: 8, min: 0, max: 0, tauxMin: 0, tauxMax: 0 },
  'variante · mots soudés ou coupés': { paires: 4, min: 0, max: 0, tauxMin: 0, tauxMax: 0 },
  'écart · mot manquant': { paires: 6, min: 1, max: 2, tauxMin: 0.048, tauxMax: 0.25 },
  'écart · mot ajouté': { paires: 5, min: 1, max: 2, tauxMin: 0.25, tauxMax: 0.5 },
  'écart · mot remplacé': { paires: 7, min: 1, max: 2, tauxMin: 0.167, tauxMax: 0.5 },
  'écart · réplique tronquée': { paires: 3, min: 3, max: 4, tauxMin: 0.429, tauxMax: 0.571 },
  'écart · autre réplique ou silence': { paires: 4, min: 4, max: 9, tauxMin: 0.8, tauxMax: 1.333 },
};

/** Borne de calcul · la réplique d'une prise courte reste très en deçà (un plan dure moins de 90 s). */
export const MOTS_PAROLE_MAX = 400;

/** Au plus UNE reprise d'une prise parlée dont la parole s'écarte de la réplique. */
export const REPRISES_PAROLE_MAX = 1;

/* ─────────────────────────── Nombres en lettres ─────────────────────────── */

const UNITES = ['zero', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre vingt', 'quatre vingt'];

function moinsDeCent(n: number): string {
  if (n <= 16) return UNITES[n]!;
  if (n < 20) return `dix ${UNITES[n - 10]}`;
  const d = Math.floor(n / 10);
  let u = n % 10;
  if (d === 7 || d === 9) u += 10;
  const base = DIZAINES[d]!;
  if (u === 0) return base;
  if ((u === 1 && d !== 8 && d !== 9) || (u === 11 && d === 7)) return `${base} et ${UNITES[u]}`;
  return `${base} ${moinsDeCent(u)}`;
}

function moinsDeMille(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const centaine = c === 0 ? '' : c === 1 ? 'cent' : `${UNITES[c]} cent`;
  if (r === 0) return centaine || 'zero';
  return centaine ? `${centaine} ${moinsDeCent(r)}` : moinsDeCent(r);
}

/**
 * Un entier en lettres, forme normalisée (sans tirets ni « s » de pluriel : la
 * clé les retire de toute façon). 0 à 999 999 999 ; au-delà, `null`.
 */
export function nombreEnLettres(n: number): string | null {
  if (!Number.isSafeInteger(n) || n < 0 || n > 999_999_999) return null;
  if (n < 1000) return moinsDeMille(n);
  const millions = Math.floor(n / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;
  const p: string[] = [];
  if (millions) p.push(`${moinsDeMille(millions)} million`);
  if (milliers) p.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers)} mille`);
  if (reste) p.push(moinsDeMille(reste));
  return p.join(' ');
}

/* ─────────────────────────── Normalisation ──────────────────────────────── */

/**
 * Homophones grammaticaux, après retrait des accents et des finales muettes →
 * une forme commune. Liste courte et FERMÉE : seulement des mots que l'audio
 * ne départage pas. Un mot absent de la liste n'est jamais rapproché d'un autre.
 */
export const HOMOPHONES: Readonly<Record<string, string>> = {
  est: 'et', // /e/ · /ɛ/
  ce: 'se', // /sə/
  ces: 'ses', cest: 'ses', sest: 'ses', sait: 'ses', sai: 'ses', // /sɛ/
  sont: 'son', ont: 'on', // /sɔ̃/ · /ɔ̃/
  peut: 'peu', // /pø/ (« peux » perd son x muet)
  as: 'a', // /a/ (« à » perd son accent)
  quelle: 'quel', // /kɛl/ (« quels », « quelles » perdent leur s)
  cette: 'cet', // /sɛt/
  vert: 'ver', verre: 'ver', // /vɛʁ/ (« vers » perd son s)
  quant: 'quand', quen: 'quand', // /kɑ̃/
  tou: 'tout', // /tu/ (« tous » perd son s)
  okay: 'ok', oke: 'ok', // « OK », « Okay », « Oké »
};

const APOSTROPHES = /['’ʼ‘`´]/g;
const ESPACES_MILLIERS = /(\d{1,3})((?:[   ]\d{3})+)(?!\d)/g;

/** Un ordinal en lettres (« 2 » → « deuxieme »), forme sans accent. */
function ordinalEnLettres(n: number): string | null {
  const l = nombreEnLettres(n);
  if (l === null || n < 2) return null;
  const mots = l.split(' ');
  let d = mots.pop()!;
  if (d === 'cinq') d = 'cinqu';
  else if (d === 'neuf') d = 'neuv';
  else if (d.endsWith('e')) d = d.slice(0, -1);
  return [...mots, `${d}ieme`].join(' ');
}

/** Les nombres, heures, ordinaux, numéros, pourcentages et prix d'un texte, écrits en lettres. */
function nombresEnLettres(texte: string): string {
  const lettres = (s: string) => nombreEnLettres(Number(s)) ?? s;
  return texte
    .replace(ESPACES_MILLIERS, (_, a: string, b: string) => `${a}${b.replace(/[   ]/g, '')}`)
    .replace(/(^|[\s(])[-−–](?=\d)/g, '$1 moins ')
    .replace(/\b1(?:er|ᵉʳ)\b/gi, ' premier ')
    .replace(/\b1(?:re|ère|ʳᵉ)\b/gi, ' premiere ')
    .replace(/(\d+),(\d{2})\s*€/g, (_, a: string, b: string) => ` ${lettres(a)} euros ${lettres(b)} `)
    .replace(/(\d+)\s*€\s*(\d{2})(?!\d)/g, (_, a: string, b: string) => ` ${lettres(a)} euros ${lettres(b)} `)
    .replace(/(\d+),(\d+)/g, (_, a: string, b: string) => ` ${lettres(a)} virgule ${lettres(b)} `)
    .replace(/\b(\d{1,2})\s*h\s*(\d{2})\b/gi, (_, a: string, b: string) => ` ${lettres(a)} heures ${lettres(b)} `)
    .replace(/(\d+)\s*h\b/gi, (_, a: string) => ` ${lettres(a)} heures `)
    .replace(/\b(\d+)\s*(?:ème|eme|è|e|ᵉ)(?![\p{L}\d])/giu, (m: string, a: string) => { const o = ordinalEnLettres(Number(a)); return o ? ` ${o} ` : m; })
    .replace(/\bn[°º]\s*(?=\d)/gi, ' numero ')
    .replace(/%/g, ' pour cent ')
    .replace(/€/g, ' euros ')
    .replace(/&/g, ' et ')
    .replace(/\+/g, ' plus ')
    .replace(/\d+/g, (d) => ` ${lettres(d)} `);
}

/** Le mot tel qu'on l'écrit sans accent, sans apostrophe, en minuscules. */
function plier(mot: string): string {
  return mot.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(APOSTROPHES, '').replace(/[^a-z0-9]/g, '');
}

/**
 * La clé d'un mot · ce que l'oreille entend. Accents, apostrophes et casse
 * retirés ; s et x finals muets retirés, -er et -ez ramenés à -e (mots de 4
 * lettres et plus) ; homophones grammaticaux rapprochés (`HOMOPHONES`).
 */
export function cleParole(mot: string): string {
  let m = plier(mot);
  if (m.length >= 4) {
    if (m.endsWith('er') || m.endsWith('ez')) m = `${m.slice(0, -2)}e`;
    else if (m.endsWith('s') || m.endsWith('x')) m = m.slice(0, -1);
  }
  return HOMOPHONES[m] ?? m;
}

export interface MotParole { brut: string; cle: string }

/** Les mots d'un texte, dans l'ordre · nombres en lettres, ponctuation et tirets retirés. */
export function motsParole(texte: string): MotParole[] {
  const t = nombresEnLettres(texte.normalize('NFC'));
  const out: MotParole[] = [];
  for (const brut of t.replace(APOSTROPHES, '\u0001').split(/[^\p{L}\p{N}\u0001]+/u)) {
    if (!brut) continue;
    const b = brut.replace(/\u0001/g, '’');
    const cle = cleParole(b);
    if (cle) out.push({ brut: b.replace(/^’+|’+$/g, ''), cle });
  }
  return out;
}

/* ─────────────────────────── Alignement ─────────────────────────────────── */

type Op = { t: 'eq' | 'sub'; r: MotParole; h: MotParole } | { t: 'del'; r: MotParole } | { t: 'ins'; h: MotParole };

/** Alignement mot à mot (distance d'édition), départage stable : égalité, puis remplacement, suppression, ajout. */
function aligner(ref: MotParole[], hyp: MotParole[]): Op[] {
  const n = ref.length;
  const m = hyp.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const egal = ref[i - 1]!.cle === hyp[j - 1]!.cle;
      d[i]![j] = Math.min(d[i - 1]![j - 1]! + (egal ? 0 : 1), d[i - 1]![j]! + 1, d[i]![j - 1]! + 1);
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i]![j] === d[i - 1]![j - 1]! + (ref[i - 1]!.cle === hyp[j - 1]!.cle ? 0 : 1)) {
      ops.push({ t: ref[i - 1]!.cle === hyp[j - 1]!.cle ? 'eq' : 'sub', r: ref[i - 1]!, h: hyp[j - 1]! });
      i -= 1; j -= 1;
    } else if (i > 0 && d[i]![j] === d[i - 1]![j]! + 1) {
      ops.push({ t: 'del', r: ref[i - 1]! });
      i -= 1;
    } else {
      ops.push({ t: 'ins', h: hyp[j - 1]! });
      j -= 1;
    }
  }
  return ops.reverse();
}

/* ─────────────────────────── Verdict ────────────────────────────────────── */

export interface VerdictParole {
  conforme: boolean;
  /** Écarts comptés après normalisation (manquants + ajoutés + remplacés). */
  ecarts: number;
  /** Écarts rapportés au nombre de mots de la réplique · lisible, ne décide RIEN (voir l'en-tête). */
  taux: number;
  motsReplique: number;
  motsDits: number;
  manquants: string[];
  ajoutes: string[];
  remplaces: Array<{ attendu: string; dit: string }>;
  /** Ce que l'écran dit · vide quand la prise est conforme. */
  raison: string;
}

const cite = (mots: readonly string[], max = 6) => {
  const l = mots.slice(0, max).map((m) => `« ${m} »`).join(', ');
  return mots.length > max ? `${l} et ${mots.length - max} autre${mots.length - max > 1 ? 's' : ''}` : l;
};

/**
 * La prise dit-elle la réplique validée ? `replique` = la narration du plan
 * dans la version DU job ; `transcription` = les mots RÉELLEMENT prononcés,
 * dans l'ordre (texte de la transcription, jamais une reformulation).
 */
export function controlerParole(replique: string, transcription: string): VerdictParole {
  const ref = motsParole(replique).slice(0, MOTS_PAROLE_MAX);
  const hyp = motsParole(transcription).slice(0, MOTS_PAROLE_MAX);
  const ops = aligner(ref, hyp);

  // Blocs d'écarts consécutifs · un bloc dont les lettres se suivent à l'identique
  // (mot soudé ou coupé) ne compte pas.
  const manquants: string[] = [];
  const ajoutes: string[] = [];
  const remplaces: Array<{ attendu: string; dit: string }> = [];
  let ecarts = 0;
  let k = 0;
  while (k < ops.length) {
    if (ops[k]!.t === 'eq') { k += 1; continue; }
    const debut = k;
    while (k < ops.length && ops[k]!.t !== 'eq') k += 1;
    const bloc = ops.slice(debut, k);
    const lettresRef = bloc.map((o) => ('r' in o ? o.r.cle : '')).join('');
    const lettresHyp = bloc.map((o) => ('h' in o ? o.h.cle : '')).join('');
    if (lettresRef && lettresRef === lettresHyp) continue;
    for (const o of bloc) {
      ecarts += 1;
      if (o.t === 'del') manquants.push(o.r.brut);
      else if (o.t === 'ins') ajoutes.push(o.h.brut);
      else if (o.t === 'sub') remplaces.push({ attendu: o.r.brut, dit: o.h.brut });
    }
  }
  const conforme = ref.length > 0 && ecarts <= ECARTS_TOLERES;
  const morceaux: string[] = [];
  if (hyp.length === 0) morceaux.push('aucun mot n’est prononcé dans la prise');
  else {
    if (manquants.length) morceaux.push(`manque${manquants.length > 1 ? 'nt' : ''} ${cite(manquants)}`);
    if (ajoutes.length) morceaux.push(`en trop ${cite(ajoutes)}`);
    if (remplaces.length) morceaux.push(remplaces.slice(0, 4).map((x) => `« ${x.attendu} » dit « ${x.dit} »`).join(', ') + (remplaces.length > 4 ? ` et ${remplaces.length - 4} autre${remplaces.length > 5 ? 's' : ''}` : ''));
  }
  return {
    conforme, ecarts, taux: ref.length ? ecarts / ref.length : 1, motsReplique: ref.length, motsDits: hyp.length,
    manquants, ajoutes, remplaces,
    raison: conforme ? '' : ref.length === 0 ? 'Aucune réplique validée à comparer.' : `La prise ne dit pas la réplique validée · ${morceaux.join(' · ')}.`,
  };
}

/* ─────────────────────────── Suite à donner ─────────────────────────────── */

export interface PrixReprise { credits: number; usdMicros: number }

export type SuiteParole =
  | { suite: 'conforme'; raison: '' }
  /** Mode observation · l'écart est noté au journal, rien d'autre (ni « à reprendre », ni proposition). */
  | { suite: 'observation'; raison: string }
  /** Reprise déjà approuvée dans le devis, pas encore faite · elle peut partir sans nouveau clic. */
  | { suite: 'reprendre'; raison: string }
  /** Aucune reprise approuvée · le plan est « à reprendre », la reprise est PROPOSÉE avec son prix, jamais lancée. */
  | { suite: 'proposer_reprise'; raison: string; prix: PrixReprise }
  /** La reprise autorisée a déjà eu lieu · plus aucune relance, revue humaine. */
  | { suite: 'revue'; raison: string };

/**
 * Ce qui suit un contrôle · au plus `REPRISES_PAROLE_MAX` reprise, et
 * seulement si elle est DÉJÀ dans le devis approuvé ; sinon proposition de
 * reprise avec son prix (annoncé avant le clic, jamais débité ici).
 */
export function suiteControleParole(e: { verdict: Pick<VerdictParole, 'conforme' | 'raison'>; reprisesFaites: number; repriseApprouvee: boolean; prixReprise: PrixReprise; mode?: ModeControleParole }): SuiteParole {
  if (e.verdict.conforme) return { suite: 'conforme', raison: '' };
  const raison = e.verdict.raison;
  if ((e.mode ?? modeControleParole()) === 'observation') return { suite: 'observation', raison };
  if (!(e.reprisesFaites < REPRISES_PAROLE_MAX)) return { suite: 'revue', raison: `${raison} La reprise autorisée a déjà eu lieu · à revoir à la main, aucune relance.` };
  if (e.repriseApprouvee) return { suite: 'reprendre', raison: `${raison} Reprise prévue au devis approuvé.` };
  return { suite: 'proposer_reprise', raison, prix: { credits: e.prixReprise.credits, usdMicros: e.prixReprise.usdMicros } };
}

/* ─────────────────────────── Prises à contrôler ────────────────────────── */

/**
 * La prise est-elle PARLÉE À L'IMAGE au sens de la prise (`prise-parlee.ts`) ?
 * Trois conditions, la règle de `priseDuClip` RÉUTILISÉE : voix native
 * demandée au clip ET rendue par son modèle dans la langue
 * (`voixNativeDemandee`), plan parlé avec sa réplique (`estPriseParlee`), et
 * parole synchronisée (`lipsync`) · c'est alors la réplique qui a été envoyée
 * au modèle, mot pour mot. Une piste audio seule ne suffit JAMAIS : un modèle
 * muet (Kling) livre parfois une piste silencieuse ou d'ambiance, et la
 * transcrire ferait payer pour « aucun mot ». La voix off n'est pas contrôlée.
 */
export function priseAControler(parametres: { audio?: unknown; modele?: string | null }, plan: Pick<PlanStudio, 'speechMode' | 'narration'>, langue: string): boolean {
  return voixNativeDemandee(parametres, langue) && estPriseParlee(plan) && plan.speechMode === 'lipsync';
}

/**
 * Les prises à contrôler d'un devis de clip (un clip se devise seul) · celle
 * du clip si `priseAControler`, à la durée du clip (la réserve en dépend).
 */
export function prisesParleesDuDevis(
  contenu: Pick<ContenuVersion, 'shots' | 'brief'>,
  parametres: { operation: string; shotId: string; audio?: unknown; modele?: string | null; dureeS: number } | null,
): Array<{ operation: string; dureeMs: number }> {
  if (!parametres) return [];
  const p = contenu.shots.byId[parametres.shotId];
  if (!p || !priseAControler(parametres, p, langueDuProjet(contenu))) return [];
  return [{ operation: parametres.operation, dureeMs: parametres.dureeS * 1000 }];
}

/**
 * Une reprise de la prise `operation` est-elle DÉJÀ approuvée dans le devis
 * (ligne `reprise:<operation>`) ? Aucun devis ne porte encore cette ligne :
 * aujourd'hui la suite est donc toujours la PROPOSITION de reprise avec son
 * prix, jamais une relance que personne n'a acceptée.
 */
export const PREFIXE_REPRISE_PAROLE = 'reprise:';
export function repriseParoleApprouvee(lignes: unknown, operation: string): boolean {
  if (!Array.isArray(lignes)) return false;
  return lignes.some((l) => typeof l === 'object' && l !== null && (l as { operation?: unknown }).operation === `${PREFIXE_REPRISE_PAROLE}${operation}`
    && Number.isInteger((l as { unites?: unknown }).unites) && ((l as { unites: number }).unites) >= 1);
}

/* ─────────────────────────── Journal du contrôle ────────────────────────── */

/** Action d'audit écrite par le worker pour chaque prise contrôlée (une ligne par prise). */
export const ACTION_AUDIT_CONTROLE_PAROLE = 'media.speech.control';
/** Un essai NON conclusif (erreur passagère) · compté pour borner les nouvelles tentatives, n'arrête pas le contrôle. */
export const ACTION_AUDIT_CONTROLE_PAROLE_ESSAI = 'media.speech.control.retry';

/** Les mots horodatés gardés au journal · `[texte, début ms, fin ms]`, compacts. */
export function motsPourJournal(mots: ReadonlyArray<MotHorodate>, max = 600): Array<[string, number, number]> {
  return mots.slice(0, max).map((m) => [m.texte, m.debutMs, m.finMs]);
}

/** Relecture défensive des mots d'un journal de contrôle · `null` si absents ou illisibles. */
export function motsDuJournal(details: unknown): MotHorodate[] | null {
  const mots = (details as { mots?: unknown } | null)?.mots;
  if (!Array.isArray(mots) || mots.length === 0) return null;
  const out: MotHorodate[] = [];
  for (const m of mots) {
    if (!Array.isArray(m) || m.length !== 3 || typeof m[0] !== 'string' || !Number.isFinite(m[1]) || !Number.isFinite(m[2])) return null;
    out.push({ texte: m[0], debutMs: m[1] as number, finMs: m[2] as number });
  }
  return out;
}

/**
 * Le prix d'une reprise · celui que la personne a RÉELLEMENT approuvé pour ce
 * clip (ligne `clip:<plan>` de l'instantané : modèle, durée et tarif figés au
 * devis), plus le contrôle de la parole de la nouvelle prise. Jamais la grille.
 */
export function prixRepriseDuClip(lignes: unknown, operation: string, controleUsdMicros: number): PrixReprise {
  const l = Array.isArray(lignes) ? (lignes as Array<{ operation?: unknown; unites?: unknown; credits?: unknown; usdMicros?: unknown } | null>).find((x) => x?.operation === operation) : undefined;
  const n = (x: unknown) => (Number.isInteger(x) && (x as number) >= 0 ? (x as number) : 0);
  const unites = Math.max(1, n(l?.unites));
  return { credits: n(l?.credits) * unites, usdMicros: n(l?.usdMicros) * unites + n(controleUsdMicros) };
}
