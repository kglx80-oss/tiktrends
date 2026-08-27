/**
 * ADSMAP · import du Google Sheet historique (§13 du cahier des charges).
 *
 * Écrit contre le fichier réel (TrueFords, 134 lignes), pas contre sa description.
 * Cinq écarts avec le §13 ont été trouvés à la lecture, et sont traités ici :
 *
 *  1. l'en-tête est en LIGNE 2 · la ligne 1 porte les trois blocs (CRÉATION &
 *     STRATÉGIE / PRODUCTION & LIVRAISON / TEST & ANALYSE), et les lignes 3 à 5
 *     sont vides ;
 *  2. les intitulés diffèrent de ceux du §1.1 : « 📎 Désire », « Ad Variable »,
 *     « Date de lancement », et la colonne d'hypothèse s'appelle en réalité
 *     « Que testez-vous et qu'est-ce qui vous donne confiance… » ;
 *  3. les valeurs portent des émojis (« 🎬 Video », « 🔄 Iteration ») ;
 *  4. les dates sont abîmées de DEUX façons, pas d'une : l'année s'incrémente
 *     ligne à ligne jusqu'en 2032 (dates futures), ET douze lignes portent
 *     « 07/052026 », à qui il manque une barre oblique ;
 *  5. les désirs composites ne se découpent pas naïvement sur « + » : « Frustration
 *     + fatigue accumulée » est UN désir, présent six fois tel quel dans le fichier.
 *
 * Tout est pur : l'appelant fournit le texte, on rend un plan et un rapport.
 * Rien n'est écrit tant que le plan n'a pas été relu.
 */

import type { AdStatus, AdType, TestedVariable } from './types';

/* -------------------------------------------------------------------------- */
/*  Lecture du CSV                                                            */
/* -------------------------------------------------------------------------- */

/** Analyse CSV tolérante (RFC 4180 : guillemets, champs multilignes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const t = text.replace(/^﻿/, '');   // BOM éventuel
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(cell); cell = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Intitulés réels du fichier · pas ceux décrits dans le cahier des charges. */
export const SHEET_HEADERS = {
  status: 'Status',
  batch: 'BATCH #',
  author: 'Autheur',
  concept: 'Ad Concept',
  desire: 'Désire',
  angle: 'Angle(s)',
  iterationReason: "Motif d'Iteration",
  hypothesis: 'Que testez-vous',
  format: 'Ad Format',
  adType: 'Ad Type',
  brief: 'Lien du Brief',
  assetLink: "Lien de l'Ad",
  results: 'Résultats',
  learnings1: 'Apprentissages',
  variable: 'Ad Variable',
  testResult: 'Test Result',
  learnings2: 'Learnings',
  date: 'Date de lancement',
  platform: 'Plateforme',
} as const;

/** Normalise un intitulé : sans émoji, sans accent, minuscules, espaces réduits. */
function normHeader(h: string): string {
  return h
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Retire les émojis d'une valeur (« 🎬 Video » → « Video »). */
export function stripEmoji(v: string): string {
  return v.replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/\s+/g, ' ').trim();
}

/**
 * Repère la ligne d'en-tête : la première qui contient « Status » ET « Ad Concept ».
 * Le fichier réel a une ligne de groupes au-dessus, et des lignes vides en dessous.
 */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const n = rows[i]!.map(normHeader);
    if (n.includes('status') && n.some((c) => c.includes('ad concept'))) return i;
  }
  return 0;
}

/** Associe chaque colonne connue à son index, par correspondance tolérante. */
export function mapColumns(header: string[]): Record<keyof typeof SHEET_HEADERS, number> {
  const n = header.map(normHeader);
  const find = (needle: string) => {
    const cible = normHeader(needle);
    const exact = n.indexOf(cible);
    return exact !== -1 ? exact : n.findIndex((c) => c.startsWith(cible) || c.includes(cible));
  };
  const out = {} as Record<keyof typeof SHEET_HEADERS, number>;
  for (const [cle, intitule] of Object.entries(SHEET_HEADERS)) {
    out[cle as keyof typeof SHEET_HEADERS] = find(intitule);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

export interface DateResult { date: string | null; repaired: boolean; rejected: boolean }

/**
 * Lit une date du fichier.
 *
 * Deux corruptions distinctes coexistent : l'année qui s'incrémente ligne à ligne
 * (jusqu'en 2032, donc dans le futur), et « 07/052026 » à qui il manque une barre.
 * La seconde est mécaniquement réparable et concerne douze lignes : on la répare
 * plutôt que de jeter, et le rapport le dit. La première est irrécupérable · on
 * ne garde que ce qui tombe dans une fenêtre plausible.
 */
export function parseSheetDate(raw: string, today = new Date()): DateResult {
  const v = (raw || '').trim();
  if (!v) return { date: null, repaired: false, rejected: false };

  let repaired = false;
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) {
    // « 07/052026 » : la barre entre mois et année manque. Sans ambiguïté.
    const mm = /^(\d{2})\/(\d{2})(\d{4})$/.exec(v);
    if (mm) { m = mm; repaired = true; }
  }
  if (!m) return { date: null, repaired: false, rejected: true };

  const [, jj, mois, annee] = m;
  const d = new Date(Number(annee), Number(mois) - 1, Number(jj));
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(mois) - 1) {
    return { date: null, repaired: false, rejected: true };
  }
  // Fenêtre plausible : ni dans le futur, ni avant l'année précédente.
  const plancher = new Date(today.getFullYear() - 1, 0, 1);
  if (d > today || d < plancher) return { date: null, repaired: false, rejected: true };

  return { date: d.toISOString().slice(0, 10), repaired, rejected: false };
}

/* -------------------------------------------------------------------------- */
/*  Désirs composites                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Découpe un désir composite.
 *
 * Le §13 dit « split sur ` + ` / ` // ` ». Appliqué tel quel au fichier réel, ça
 * casse « Frustration + fatigue accumulée » — qui est UN désir, écrit six fois
 * ainsi. On ne coupe donc sur « + » que si la partie gauche existe ailleurs dans
 * le fichier comme valeur complète : c'est le fichier lui-même qui dit ce qui est
 * atomique. Sur « // », pas d'ambiguïté possible, on coupe toujours.
 *
 * En cas de doute on NE coupe PAS : un désir composite laissé entier est un
 * détail de taxonomie, un désir inventé pollue la carte.
 */
export function splitDesire(value: string, knownWhole: ReadonlySet<string>): string[] {
  const v = value.trim();
  if (!v) return [];

  const parts: string[] = [];
  for (const bloc of v.split(/\s*\/\/\s*/)) {
    const b = bloc.trim();
    if (!b) continue;
    // Coupe sur « + » uniquement quand la gauche est une valeur connue entière.
    let reste = b;
    let coupe = true;
    while (coupe) {
      coupe = false;
      let idx = reste.indexOf(' + ');
      while (idx !== -1) {
        const gauche = reste.slice(0, idx).trim();
        if (knownWhole.has(gauche)) {
          parts.push(gauche);
          reste = reste.slice(idx + 3).trim();
          coupe = true;
          break;
        }
        idx = reste.indexOf(' + ', idx + 3);
      }
    }
    if (reste) parts.push(reste);
  }
  return parts;
}

/* -------------------------------------------------------------------------- */
/*  Traductions                                                               */
/* -------------------------------------------------------------------------- */

const STATUS_MAP: Record<string, AdStatus> = {
  'terminé': 'done', 'termine': 'done',
  'prête': 'ready', 'prete': 'ready',
  'test en cours': 'live',
  'en pause': 'paused',
};

const AD_TYPE_MAP: Record<string, AdType> = {
  'ideation': 'ideation', 'idéation': 'ideation',
  'iteration': 'iteration', 'itération': 'iteration',
  'imitation': 'imitation',
  'new': 'new', 'nouveau': 'new',
};

const FORMAT_MAP: Record<string, string> = {
  'video': 'video_ugc', 'vidéo': 'video_ugc',
  'static': 'static', 'statique': 'static',
  'carousel': 'image_carousel', 'carrousel': 'image_carousel',
  'gif': 'gif',
};

/** « Winning Ad » / « Baby Wining Ad » (la faute est dans le fichier) / « Losing Ad ». */
export function parseVerdict(raw: string): string | null {
  const v = stripEmoji(raw).toLowerCase();
  if (!v) return null;
  if (v.includes('baby')) return 'baby_winner';
  if (v.includes('winning') || v.includes('winner')) return 'winner';
  if (v.includes('losing') || v.includes('loser')) return 'loser';
  return null;
}

/**
 * Mécanisme d'angle, déduit du TITRE du concept d'abord.
 * C'est lui qui le porte réellement dans ce fichier : « 3 reasons why » est un
 * listicle, « Démonstration » une démo · la colonne Angle, elle, mélange angle,
 * bénéfice et valence (défaut D6 du cahier des charges).
 */
const MECHANISM_RULES: Array<[RegExp, string]> = [
  [/\b(3|4|5)\s*(reasons?|raisons?)\b|listicle/i, 'listicle'],
  [/d[ée]monstration|\bdemo\b|proof|écrasée|valise/i, 'demo'],
  [/storytelling|story\b|veuf|dimanche/i, 'story'],
  [/social proof|\d[\s ]*000\s*(tf\s*)?adopters?|adopters/i, 'social_proof'],
  [/\bvs\b|versus|old way|comparaison|split|before\s*\/?\s*after/i, 'comparison'],
  [/us vs them/i, 'us_vs_them'],
  [/diagnostic/i, 'diagnostic'],
  [/curiosit[ée]|pourquoi/i, 'curiosity'],
  [/raret[ée]|épuis|scarcity|limited/i, 'scarcity'],
  [/choc statistique|statistic|\bhours\b|\d+\s*h\s*par an/i, 'statistic_shock'],
  [/don'?t buy|reverse|sceptical/i, 'reverse'],
  [/mistakes|what you'?re doing wrong|erreur|problème|probleme|stop buying|hate\b/i, 'problem_agitate'],
  [/pattern inter/i, 'curiosity'],
  [/autorit[ée]|expert|savoir-faire/i, 'authority'],
];

export function inferMechanism(conceptTitle: string, angleLabel: string): { mechanism: string; inferred: boolean } {
  for (const [re, mech] of MECHANISM_RULES) {
    if (re.test(conceptTitle)) return { mechanism: mech, inferred: true };
  }
  for (const [re, mech] of MECHANISM_RULES) {
    if (re.test(angleLabel)) return { mechanism: mech, inferred: true };
  }
  // Aucun indice : on pose un mécanisme neutre et le rapport le compte.
  return { mechanism: 'demo', inferred: false };
}

/**
 * Variable testée, déduite du motif d'itération en texte libre.
 * « ITERATION HOOK 2 Uniquement » → hook ; « Testing timing à 15 Sec » → durée.
 */
export function inferVariable(motif: string): TestedVariable | null {
  const v = motif.toLowerCase();
  if (!v.trim()) return null;
  if (/\bhook\b|accroche/.test(v)) return 'hook';
  if (/timing|durée|duree|\d+\s*sec|short/.test(v)) return 'length';
  if (/\bbody\b|corps/.test(v)) return 'body';
  if (/\bcta\b/.test(v)) return 'cta';
  if (/format|ugc/.test(v)) return 'format';
  if (/offre|prix|offer/.test(v)) return 'offer';
  if (/visuel|opening/.test(v)) return 'opening_visual';
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Plan d'import                                                             */
/* -------------------------------------------------------------------------- */

export interface PlanDesire { label: string; fromComposite: string | null }
export interface PlanAngle { label: string; desireLabel: string; mechanism: string; mechanismInferred: boolean }
export interface PlanConcept { key: string; title: string; angleLabel: string; adType: AdType }
export interface PlanBatch { number: number; adCount: number }
export interface PlanAd {
  rowIndex: number;
  conceptKey: string;
  batchNumber: number | null;
  variantCode: string;
  status: AdStatus;
  format: string;
  adType: AdType;
  author: string | null;
  hypothesis: string | null;
  testedVariable: TestedVariable | null;
  iterationReason: string | null;
  iterationParentTitle: string | null;   // rattachement proposé, à confirmer
  launchedAt: string | null;
  platform: 'meta' | 'tiktok';
  verdict: string | null;
  learning: string | null;
  briefLabel: string | null;
  assetLabel: string | null;
  legacyFlags: string[];
}

export interface ImportReport {
  rowsRead: number;
  rowsSkipped: number;
  personas: number;
  desires: number;
  desiresSplit: number;
  angles: number;
  anglesWithoutMechanism: number;
  concepts: number;
  conceptsMerged: number;      // lignes regroupées en variantes · défaut D1
  batches: number;
  ads: number;
  verdicts: number;
  learnings: number;
  datesRepaired: number;
  datesRejected: number;
  demotedToDraft: number;      // « Prête » / « Test en cours » sans hypothèse
  iterationsUnlinked: number;  // motif d'itération sans parent identifiable
  warnings: string[];
}

export interface ImportPlan {
  desires: PlanDesire[];
  angles: PlanAngle[];
  concepts: PlanConcept[];
  batches: PlanBatch[];
  ads: PlanAd[];
  report: ImportReport;
}

const cle = (title: string, angle: string) => `${title.trim()}||${angle.trim()}`;

/**
 * Construit le plan d'import à partir du CSV.
 * Rien n'est écrit : le plan est destiné à être relu avant application.
 */
export function buildImportPlan(csvText: string, opts: { today?: Date } = {}): ImportPlan {
  const today = opts.today ?? new Date();
  const rows = parseCsv(csvText);
  const hIdx = findHeaderRow(rows);
  const cols = mapColumns(rows[hIdx] ?? []);
  const data = rows.slice(hIdx + 1);

  const cell = (r: string[], k: keyof typeof SHEET_HEADERS) => {
    const i = cols[k];
    return i >= 0 && i < r.length ? (r[i] ?? '').trim() : '';
  };

  // Passe 1 · valeurs de désir présentes telles quelles, pour savoir ce qui est atomique.
  const brutes = new Set<string>();
  let lues = 0, ignorees = 0;
  const utiles: string[][] = [];
  for (const r of data) {
    if (!r.some((c) => c.trim())) { ignorees++; continue; }
    if (!cell(r, 'concept')) { ignorees++; continue; }
    utiles.push(r);
    lues++;
    const d = cell(r, 'desire');
    if (d) brutes.add(d);
  }

  const report: ImportReport = {
    rowsRead: lues, rowsSkipped: ignorees, personas: 1, desires: 0, desiresSplit: 0,
    angles: 0, anglesWithoutMechanism: 0, concepts: 0, conceptsMerged: 0, batches: 0,
    ads: 0, verdicts: 0, learnings: 0, datesRepaired: 0, datesRejected: 0,
    demotedToDraft: 0, iterationsUnlinked: 0, warnings: [],
  };

  // Passe 2 · entités.
  const desires = new Map<string, PlanDesire>();
  const angles = new Map<string, PlanAngle>();
  const concepts = new Map<string, PlanConcept>();
  const batches = new Map<number, PlanBatch>();
  const ads: PlanAd[] = [];
  const variantCounter = new Map<string, number>();
  /** Titres de concept ayant produit un gagnant · sert au rattachement des itérations. */
  const titresGagnants = new Set<string>();

  for (let i = 0; i < utiles.length; i++) {
    const r = utiles[i]!;
    const title = cell(r, 'concept');
    const angleLabel = cell(r, 'angle') || '(angle non renseigné)';
    const desireRaw = cell(r, 'desire');

    // Désirs · le premier porte l'angle, les suivants sont proposés à part.
    const parts = desireRaw ? splitDesire(desireRaw, brutes) : [];
    if (parts.length > 1) report.desiresSplit++;
    const desirePrincipal = parts[0] ?? '(désir non renseigné)';
    for (const p of parts.length ? parts : [desirePrincipal]) {
      if (!desires.has(p)) desires.set(p, { label: p, fromComposite: parts.length > 1 ? desireRaw : null });
    }

    // Angle · un angle appartient à un désir (hiérarchie stricte du §2.4).
    const aKey = cle(angleLabel, desirePrincipal);
    if (!angles.has(aKey)) {
      const { mechanism, inferred } = inferMechanism(title, angleLabel);
      if (!inferred) report.anglesWithoutMechanism++;
      angles.set(aKey, { label: angleLabel, desireLabel: desirePrincipal, mechanism, mechanismInferred: inferred });
    }

    const adTypeRaw = stripEmoji(cell(r, 'adType')).toLowerCase();
    const adType = AD_TYPE_MAP[adTypeRaw] ?? 'ideation';

    // Concept · clé (titre, angle) : le même titre sous deux angles donne deux
    // concepts, puisqu'un concept n'a qu'un angle.
    const cKey = cle(title, angleLabel);
    if (!concepts.has(cKey)) concepts.set(cKey, { key: cKey, title, angleLabel, adType });
    else report.conceptsMerged++;

    const batchNum = parseInt(cell(r, 'batch'), 10);
    const batchOk = Number.isFinite(batchNum);
    if (batchOk && !batches.has(batchNum)) batches.set(batchNum, { number: batchNum, adCount: 0 });
    if (batchOk) batches.get(batchNum)!.adCount++;

    // Variante · numérotée dans le couple (concept, lot).
    const vKey = `${cKey}||${batchOk ? batchNum : 'sans'}`;
    const n = (variantCounter.get(vKey) ?? 0) + 1;
    variantCounter.set(vKey, n);

    const d = parseSheetDate(cell(r, 'date'), today);
    if (d.repaired) report.datesRepaired++;
    if (d.rejected) report.datesRejected++;

    const statutRaw = stripEmoji(cell(r, 'status')).toLowerCase();
    let status: AdStatus = STATUS_MAP[statutRaw] ?? 'draft';
    const hypothesis = cell(r, 'hypothesis') || null;
    const legacyFlags: string[] = [];

    // L'invariant n'est pas rétroactif : une ligne « Prête » sans hypothèse
    // redescend en brouillon, avec un drapeau qui dit pourquoi.
    if ((status === 'ready' || status === 'live') && !hypothesis) {
      status = 'draft';
      legacyFlags.push('legacy_missing_hypothesis');
      report.demotedToDraft++;
    }
    if (d.repaired) legacyFlags.push('date_repaired');
    if (d.rejected) legacyFlags.push('date_uncertain');

    const motif = cell(r, 'iterationReason') || null;
    const verdict = parseVerdict(cell(r, 'results') || cell(r, 'testResult'));
    if (verdict) report.verdicts++;
    if (verdict === 'winner' || verdict === 'baby_winner') titresGagnants.add(title);

    const learning = cell(r, 'learnings1') || cell(r, 'learnings2') || null;
    if (learning) report.learnings++;

    ads.push({
      rowIndex: i,
      conceptKey: cKey,
      batchNumber: batchOk ? batchNum : null,
      variantCode: `v${n}`,
      status,
      format: FORMAT_MAP[stripEmoji(cell(r, 'format')).toLowerCase()] ?? 'video_ugc',
      adType,
      author: cell(r, 'author') || null,
      hypothesis,
      testedVariable: inferVariable(motif ?? ''),
      iterationReason: motif,
      iterationParentTitle: null,   // résolu ci-dessous
      launchedAt: d.date,
      platform: /tiktok/i.test(cell(r, 'platform')) ? 'tiktok' : 'meta',
      verdict,
      learning,
      briefLabel: cell(r, 'brief') || null,
      assetLabel: cell(r, 'assetLink') || null,
      legacyFlags,
    });
  }

  // Passe 3 · rattachement des itérations.
  // On ne relie qu'à un TITRE ayant réellement produit un gagnant : l'invariant
  // du §2.4 interdit d'itérer sur un perdant, et deviner ferait pire que rien.
  for (const a of ads) {
    if (!a.iterationReason && a.adType !== 'iteration') continue;
    const c = concepts.get(a.conceptKey);
    if (c && titresGagnants.has(c.title)) a.iterationParentTitle = c.title;
    else if (a.iterationReason) report.iterationsUnlinked++;
  }

  report.desires = desires.size;
  report.angles = angles.size;
  report.concepts = concepts.size;
  report.batches = batches.size;
  report.ads = ads.length;

  // Avertissements · ce que l'humain doit regarder après l'import.
  if (report.demotedToDraft > 0) {
    report.warnings.push(`${report.demotedToDraft} ad(s) marquées « Prête » ou « Test en cours » n'ont pas d'hypothèse : elles repassent en brouillon. Écris-la avant de les relancer.`);
  }
  if (report.datesRejected > 0) {
    report.warnings.push(`${report.datesRejected} date(s) hors d'une fenêtre plausible (l'année s'incrémente ligne à ligne dans le fichier, jusqu'en 2032) : laissées vides.`);
  }
  if (report.datesRepaired > 0) {
    report.warnings.push(`${report.datesRepaired} date(s) au format « 07/052026 » réparées sans ambiguïté (barre oblique manquante).`);
  }
  if (report.anglesWithoutMechanism > 0) {
    report.warnings.push(`${report.anglesWithoutMechanism} angle(s) sans mécanisme identifiable : posés en « démonstration », à corriger.`);
  }
  if (report.iterationsUnlinked > 0) {
    report.warnings.push(`${report.iterationsUnlinked} itération(s) sans parent identifiable : le fichier ne dit pas de quelle ad elles partent. À rattacher à la main.`);
  }
  if (report.desiresSplit > 0) {
    report.warnings.push(`${report.desiresSplit} désir(s) composites découpés. Le premier porte l'angle, les autres sont proposés à part.`);
  }
  report.warnings.push('Tous les personas, désirs et angles arrivent « proposés » : rien n\'est considéré comme validé tant que tu ne l\'as pas relu.');

  return {
    desires: [...desires.values()],
    angles: [...angles.values()],
    concepts: [...concepts.values()],
    batches: [...batches.values()].sort((a, b) => a.number - b.number),
    ads,
    report,
  };
}
