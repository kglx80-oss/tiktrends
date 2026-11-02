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
import { retirerNeutralisation, toCsv } from './sheet';

/* -------------------------------------------------------------------------- */
/*  Lecture du CSV                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Séparateurs reconnus à l'import, dans l'ordre de préférence en cas d'égalité
 * NON départagée (voir `detecterSeparateur`) · la virgule d'abord, parce que
 * c'est ce que l'import lisait seul jusqu'ici : un fichier ambigu se lit comme
 * avant, aucune régression.
 */
export const SEPARATEURS_CSV = [',', ';', '\t'] as const;
export type SeparateurCsv = (typeof SEPARATEURS_CSV)[number];

/** Pourquoi ce séparateur · `defaut-*` = l'en-tête ne permettait pas de trancher. */
export type RaisonSeparateur = 'seul-present' | 'coherence' | 'majorite' | 'defaut-aucun' | 'defaut-egalite';
export interface SeparateurDetecte { separateur: SeparateurCsv; raison: RaisonSeparateur }

/** Lignes examinées pour trouver l'en-tête · la même fenêtre que `findHeaderRow`. */
const FENETRE_ENTETE = 20;
/** Lignes suivantes consultées pour départager plusieurs séparateurs présents. */
const FENETRE_COHERENCE = 10;

/** BOM UTF-8 qu'Excel écrit en tête de fichier. */
const BOM = /^\uFEFF/;

/**
 * Compte, ligne LOGIQUE par ligne logique, les séparateurs hors guillemets · un
 * `;` dans `"a;b"` ne compte pas, et un saut de ligne entre guillemets ne coupe
 * pas la ligne. Même lecture des guillemets que `parseCsv`. S'arrête dès que
 * `max` lignes ont été lues · le reste du fichier n'est pas parcouru.
 */
function compterParLigne(t: string, max: number): Array<{ vide: boolean; n: Record<SeparateurCsv, number> }> {
  const lignes: Array<{ vide: boolean; n: Record<SeparateurCsv, number> }> = [];
  const neuve = () => ({ vide: true, n: { ',': 0, ';': 0, '\t': 0 } as Record<SeparateurCsv, number> });
  let cur = neuve();
  let quoted = false;
  for (let i = 0; i < t.length && lignes.length < max; i++) {
    const c = t[i]!;
    if (c === '"') { quoted = !quoted; cur.vide = false; continue; }
    if (quoted) continue;
    if (c === '\n') { lignes.push(cur); cur = neuve(); continue; }
    if (c === ',' || c === ';' || c === '\t') { cur.n[c]++; cur.vide = false; } else if (!/\s/.test(c)) cur.vide = false;
  }
  if (lignes.length < max) lignes.push(cur);
  return lignes;
}

/**
 * Le séparateur du fichier, lu sur sa ligne d'en-tête.
 *
 * Mesuré sur les en-têtes RÉELS (séparateurs hors guillemets, par ligne) :
 *
 * | fichier                                        | `;` | `,` | tab |
 * | ---------------------------------------------- | --- | --- | --- |
 * | export Résultats, 29 colonnes (`toCsv`)        |  28 |   0 |   0 |
 * | export Résultats, 19 colonnes du Sheet         |  18 |   0 |   0 |
 * | modèle TrueFords, ligne 1 (blocs)              |   0 |  18 |   0 |
 * | modèle TrueFords, ligne 2 (en-tête)            |   0 |  18 |   0 |
 * | modèle TrueFords, lignes 3 à 22 (données)      |   0 |  18 |   0 |
 * | export, ligne de données (`-12,5`, `1 234,5`)  |  28 |   2 |   0 |
 *
 * Sur un en-tête réel, un seul séparateur est présent : la règle tranche sans
 * marge à discuter. Les lignes de DONNÉES, elles, ne votent pas au compte · un
 * export au point-virgule y porte des virgules décimales non entourées.
 *
 * La règle, dans l'ordre :
 *  1. la ligne de référence est la première ligne logique (sur 20) qui porte au
 *     moins un séparateur hors guillemets · la ligne des blocs du Sheet a la même
 *     structure que l'en-tête, une ligne de titre sans séparateur est sautée ;
 *  2. aucun séparateur sur 20 lignes (fichier d'une seule colonne) → virgule,
 *     comme l'import l'a toujours lu (`defaut-aucun`) ;
 *  3. un seul séparateur présent dans la référence → lui (`seul-present`) ;
 *  4. plusieurs (« Prix, TTC;Prix, HT ») → celui qui découpe les lignes suivantes
 *     (10 au plus) en AUTANT de colonnes que la référence, le plus souvent
 *     (`coherence`) · c'est ce qui définit un séparateur ;
 *  5. cohérence à égalité (fichier réduit à l'en-tête) → le plus fréquent dans la
 *     référence (`majorite`) ;
 *  6. égalité encore → l'ordre de `SEPARATEURS_CSV`, virgule d'abord
 *     (`defaut-egalite`) · l'import le signale dans son rapport.
 */
export function detecterSeparateur(text: string): SeparateurDetecte {
  const lignes = compterParLigne(text.replace(BOM, ''), FENETRE_ENTETE + FENETRE_COHERENCE);
  const iRef = lignes.slice(0, FENETRE_ENTETE).findIndex((l) => SEPARATEURS_CSV.some((s) => l.n[s] > 0));
  if (iRef === -1) return { separateur: ',', raison: 'defaut-aucun' };

  const ref = lignes[iRef]!.n;
  const presents = SEPARATEURS_CSV.filter((s) => ref[s] > 0);
  if (presents.length === 1) return { separateur: presents[0]!, raison: 'seul-present' };

  const suivantes = lignes.slice(iRef + 1).filter((l) => !l.vide).slice(0, FENETRE_COHERENCE);
  const meilleurs = (score: (s: SeparateurCsv) => number, parmi: readonly SeparateurCsv[]) => {
    const max = Math.max(...parmi.map(score));
    return parmi.filter((s) => score(s) === max);
  };
  const coherents = meilleurs((s) => suivantes.filter((l) => l.n[s] === ref[s]).length, presents);
  if (coherents.length === 1) return { separateur: coherents[0]!, raison: 'coherence' };
  const frequents = meilleurs((s) => ref[s], coherents);
  if (frequents.length === 1) return { separateur: frequents[0]!, raison: 'majorite' };
  return { separateur: frequents[0]!, raison: 'defaut-egalite' };
}

/** Le séparateur en toutes lettres, pour le rapport d'import. */
export const LIBELLE_SEPARATEUR: Record<SeparateurCsv, string> = {
  ',': 'à la virgule', ';': 'au point-virgule', '\t': 'à la tabulation',
};

/**
 * Analyse CSV tolérante (RFC 4180 : guillemets, champs multilignes).
 *
 * Le séparateur est détecté sur l'en-tête (`detecterSeparateur`) · l'export
 * Résultats sort au point-virgule (Excel en français), un tableur le
 * réenregistre souvent à la virgule, un copier-coller donne des tabulations :
 * les trois se relisent. Le BOM UTF-8 de tête (Excel) est retiré, et les fins
 * de ligne `\r\n` ne laissent pas de `\r` dans la dernière cellule.
 *
 * Chaque champ perd l'apostrophe que `csvCell` ajoute devant un début de
 * formule (`retirerNeutralisation`) · un export Adsmap repris tel quel, ou
 * réenregistré par un tableur qui a gardé l'apostrophe, redonne la valeur
 * saisie (`=…` et non `'=…`). Seule une apostrophe SUIVIE d'un début de formule est
 * retirée : « 'Hook' gagnant » d'un tableur historique reste intact.
 */
export function parseCsv(text: string, separateur: SeparateurCsv = detecterSeparateur(text).separateur): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const fin = () => { row.push(retirerNeutralisation(cell)); cell = ''; };

  const t = text.replace(BOM, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === separateur) { fin(); continue; }
    if (c === '\r') continue;
    if (c === '\n') { fin(); rows.push(row); row = []; continue; }
    cell += c;
  }
  if (cell || row.length) { fin(); rows.push(row); }
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

/* -------------------------------------------------------------------------- */
/*  Colonnes reconnues · refus d'un fichier mal découpé                       */
/* -------------------------------------------------------------------------- */

/**
 * La colonne du tableau que nomme une cellule d'en-tête, au sens STRICT ·
 * l'intitulé normalisé EST l'intitulé attendu, ou COMMENCE par lui (« Lien du
 * Brief créa », « Que testez-vous et qu'est-ce qui… »). Jamais quand il le
 * CONTIENT seulement · c'est la tolérance de `mapColumns`, et c'est elle qui
 * laissait une ligne entière rabattue dans une cellule « contenir » les 19
 * intitulés à la fois.
 */
function colonneNommee(cellule: string): keyof typeof SHEET_HEADERS | null {
  const c = normHeader(cellule);
  if (!c) return null;
  for (const [cle, intitule] of Object.entries(SHEET_HEADERS)) {
    const cible = normHeader(intitule);
    if (c === cible || c.startsWith(cible)) return cle as keyof typeof SHEET_HEADERS;
  }
  return null;
}

/** Ce que l'en-tête laisse reconnaître · cellules non vides, colonnes du tableau retrouvées (distinctes), et la colonne « Ad Concept » à part. */
export interface LectureColonnes { cellules: number; reconnues: number; concept: boolean }

export function lireColonnes(header: readonly string[]): LectureColonnes {
  const vues = new Set<keyof typeof SHEET_HEADERS>();
  let cellules = 0;
  for (const h of header) {
    if (h.trim()) cellules++;
    const k = colonneNommee(h);
    if (k) vues.add(k);
  }
  return { cellules, reconnues: vues.size, concept: vues.has('concept') };
}

/** Les colonnes du tableau d'origine, au total · `SHEET_HEADERS`. */
export const COLONNES_ATTENDUES = Object.keys(SHEET_HEADERS).length;

/**
 * Colonnes du tableau qu'un en-tête doit laisser reconnaître (`lireColonnes`,
 * au sens strict) pour que l'import le lise · en plus d'« Ad Concept », exigée
 * à part (sans elle, aucune ligne n'a de concept).
 *
 * Mesuré sur les fichiers réels, ligne d'en-tête retenue par `findHeaderRow`
 * (`packages/core/test/adsmap-import-colonnes.test.ts` refait la mesure) :
 *
 * | fichier                                                    | cellules | reconnues | concept |
 * | ---------------------------------------------------------- | -------- | --------- | ------- |
 * | export Résultats, 29 colonnes (`toCsv`, `;`)               |       29 |        19 | oui     |
 * | export Résultats, 19 colonnes du Sheet (`;`)               |       19 |        19 | oui     |
 * | modèle TrueFords (`,`, en-tête en ligne 2)                 |       19 |        19 | oui     |
 * | modèle TrueFords réenregistré `;` ou tabulation            |       19 |        19 | oui     |
 * | en-tête minimal (Status, BATCH #, Ad Concept, date)        |        4 |         4 | oui     |
 * | export Résultats réenregistré à la barre verticale                       |        1 |         1 | non     |
 * | modèle TrueFords réenregistré à la barre verticale (ligne des blocs)     |        1 |         0 | non     |
 * | export Résultats, chaque ligne entourée de guillemets      |        1 |         1 | non     |
 * | export Textes du studio (`type,langue,texte,sources`)      |        4 |         0 | non     |
 * | export Meta Ads (en-tête type, en français)                |       12 |         1 | non     |
 * | export TikTok Ads (en-tête type, en anglais)               |       10 |         2 | non     |
 *
 * Un bon fichier réel retrouve les 19 colonnes, un mauvais 2 au plus (« Status »
 * et « Ad format » d'un export TikTok), et aucun mauvais n'a « Ad Concept » en
 * colonne à part · le seuil se pose avec de la marge des deux côtés, à 4 · le
 * double du pire mauvais fichier mesuré, et l'en-tête minimal qu'écrit un
 * tableur réduit aux colonnes de structure passe encore.
 */
export const SEUIL_COLONNES_RECONNUES = 4;

/** Le début d'une cellule d'en-tête, pour la montrer sans tout recopier. */
const extrait = (v: string, n = 40) => {
  const t = [...v.replace(/\s+/g, ' ').trim()];   // par point de code · un émoji n'est jamais coupé en deux
  return t.length > n ? `${t.slice(0, n).join('')}…` : t.join('');
};

/**
 * Le refus d'un en-tête que l'import ne sait pas lire, en une phrase · `null`
 * quand il passe. Refusé avant tout aperçu · un fichier mal découpé montrait
 * sinon une variante dont le « concept » valait la ligne entière.
 */
export function refusColonnes(header: readonly string[]): string | null {
  const l = lireColonnes(header);
  if (l.concept && l.reconnues >= SEUIL_COLONNES_RECONNUES) return null;
  if (l.cellules <= 1) {
    const premiere = header.find((h) => h.trim()) ?? '';
    return `Colonnes non reconnues · tout l'en-tête tient dans une seule cellule${premiere ? ` (« ${extrait(premiere)} »)` : ''} : le fichier n'est pas découpé en colonnes. Réenregistre-le en CSV depuis ton tableur (séparé par des virgules, des points-virgules ou des tabulations).`;
  }
  const manque = l.concept ? '' : ', et « Ad Concept » n\'y est pas';
  return `Colonnes non reconnues · ${l.reconnues} colonne(s) du tableau retrouvée(s) sur ${COLONNES_ATTENDUES} dans l'en-tête${manque} (il en faut au moins ${SEUIL_COLONNES_RECONNUES}, dont « Ad Concept »). Vérifie que c'est bien l'export de Résultats ou le tableau historique.`;
}

/**
 * Comment le fichier a été lu, en une phrase pour l'aperçu · dite à chaque
 * import, pas seulement quand l'en-tête est ambigu.
 */
export function lectureSeparateur(d: SeparateurDetecte): string {
  const base = `Fichier lu ${LIBELLE_SEPARATEUR[d.separateur]}`;
  if (d.raison === 'defaut-aucun') return `${base} · aucun séparateur trouvé dans l'en-tête`;
  if (d.raison === 'majorite' || d.raison === 'defaut-egalite') return `${base} · choisi par défaut, l'en-tête en mélange plusieurs`;
  return base;
}

/* -------------------------------------------------------------------------- */
/*  Ce qu'il faut corriger · intitulés lus, colonnes absentes                 */
/* -------------------------------------------------------------------------- */

/**
 * Intitulés lus montrés au plus, et longueur au-delà de laquelle un intitulé
 * est coupé (par point de code, `extrait`), quand l'écran dit ce qu'il a lu.
 *
 * Mesuré sur les fichiers réels du tableau de `SEUIL_COLONNES_RECONNUES`
 * (`packages/core/test/adsmap-import-colonnes.test.ts` refait la mesure) :
 *
 * | fichier                                                       | intitulés lus | plus long, en points de code |
 * | ------------------------------------------------------------- | ------------- | ---------------------------- |
 * | export Résultats, 29 colonnes · accepté                       |            29 | 117 (hypothèse), puis 18     |
 * | export Résultats, 19 colonnes · accepté                       |            19 | 117 (hypothèse), puis 18     |
 * | modèle TrueFords, et réenregistré `;` ou tabulation · accepté |            19 | 117 (hypothèse), puis 18     |
 * | en-tête minimal · accepté                                     |             4 | 17                           |
 * | export Résultats réenregistré à la barre verticale · refusé   |             1 | 439 (ligne entière)          |
 * | modèle TrueFords réenregistré à la barre verticale · refusé   |             1 | 74 (ligne des blocs entière) |
 * | export Résultats, lignes entre guillemets · refusé            |             1 | 439 (ligne entière)          |
 * | export Textes du studio · refusé                              |             4 | 7                            |
 * | export Meta Ads (en-tête type) · refusé                       |            12 | 31                           |
 * | export TikTok Ads (en-tête type) · refusé                     |            10 | 13                           |
 *
 * Le plus long en-tête refusé compte 12 intitulés · `INTITULES_MONTRES = 15`
 * les montre tous, avec de la marge, et un en-tête plus large (un export de
 * 29 colonnes renommé) dit « et k autres » au lieu d'un mur. Hors des cellules
 * qui portent une ligne entière (fichier mal découpé) et de la phrase
 * d'hypothèse du tableau, aucun intitulé réel ne dépasse 31 caractères ·
 * `LONGUEUR_INTITULE = 40` les garde entiers et ne coupe que ces deux cas.
 */
export const INTITULES_MONTRES = 15;
export const LONGUEUR_INTITULE = 40;

/**
 * Les colonnes sans lesquelles l'import refuse le fichier · « Ad Concept »,
 * exigée à part par `refusColonnes` (sans elle, aucune ligne n'a de concept).
 * Toutes les autres sont optionnelles une à une · il en faut seulement assez
 * (`SEUIL_COLONNES_RECONNUES`).
 */
export const COLONNES_OBLIGATOIRES: ReadonlyArray<keyof typeof SHEET_HEADERS> = ['concept'];

/**
 * Ce que l'écran d'import montre pour qu'on sache QUOI corriger.
 *
 * Les intitulés sont du texte saisi par l'utilisateur · rendus tels quels (un
 * `=SOMME(…)` reste `=SOMME(…)`), seulement coupés. L'écran les affiche comme
 * texte, jamais comme balisage.
 */
export interface GuideColonnes {
  /** Intitulés non vides de l'en-tête, dans l'ordre de lecture, coupés à `LONGUEUR_INTITULE` · au plus `INTITULES_MONTRES`. */
  lus: string[];
  /** Intitulés lus au-delà de `INTITULES_MONTRES`, non montrés. */
  lusMasques: number;
  /** Colonnes obligatoires absentes, sous l'intitulé à écrire (`SHEET_HEADERS`). */
  obligatoiresAbsentes: string[];
  /** Les autres colonnes du tableau absentes, dans l'ordre du tableau (celui du modèle). */
  optionnellesAbsentes: string[];
}

/**
 * La ligne d'en-tête du fichier, telle que l'import la retient · même lecture
 * que `buildImportPlan` (séparateur détecté, `findHeaderRow`).
 */
export function enteteDuFichier(csvText: string): string[] {
  const rows = parseCsv(csvText, detecterSeparateur(csvText).separateur);
  return rows[findHeaderRow(rows)] ?? [];
}

/**
 * Le guide d'un en-tête.
 *
 * Une colonne est « absente » au sens de ce que l'import fera d'elle · pour un
 * fichier REFUSÉ, au sens strict de `refusColonnes` (ce qui l'a fait refuser) ;
 * pour un fichier ACCEPTÉ, au sens de `mapColumns`, qui choisit ce qui sera
 * réellement lu · une colonne trouvée par la correspondance tolérante sera
 * importée, la dire « non importée » serait faux.
 *
 * Ordre · obligatoires d'abord, puis l'ordre du tableau (`SHEET_HEADERS`), le
 * même que celui du modèle à télécharger.
 */
export function guideColonnes(header: readonly string[]): GuideColonnes {
  const nonVides = header.filter((h) => h.trim());
  const refuse = refusColonnes(header) !== null;
  const strictes = new Set(header.map(colonneNommee).filter((k): k is keyof typeof SHEET_HEADERS => k !== null));
  const lues = mapColumns([...header]);
  const absente = (k: keyof typeof SHEET_HEADERS) => (refuse ? !strictes.has(k) : lues[k] === -1);
  const cles = Object.keys(SHEET_HEADERS) as Array<keyof typeof SHEET_HEADERS>;
  return {
    lus: nonVides.slice(0, INTITULES_MONTRES).map((h) => extrait(h, LONGUEUR_INTITULE)),
    lusMasques: Math.max(0, nonVides.length - INTITULES_MONTRES),
    obligatoiresAbsentes: COLONNES_OBLIGATOIRES.filter(absente).map((k) => SHEET_HEADERS[k]),
    optionnellesAbsentes: cles.filter((k) => !COLONNES_OBLIGATOIRES.includes(k) && absente(k)).map((k) => SHEET_HEADERS[k]),
  };
}

/**
 * Sur un aperçu ACCEPTÉ · les colonnes du tableau absentes, dont rien ne sera
 * importé, en une phrase · `null` quand il n'en manque aucune. Ne bloque rien.
 */
export function mentionColonnesAbsentes(g: GuideColonnes): string | null {
  const absentes = [...g.obligatoiresAbsentes, ...g.optionnellesAbsentes];
  if (!absentes.length) return null;
  const n = absentes.length;
  return `${n} colonne${n > 1 ? 's' : ''} du tableau absente${n > 1 ? 's' : ''} du fichier · rien n'en sera importé : ${absentes.map((a) => `« ${a} »`).join(', ')}.`;
}

/**
 * Le modèle d'import · l'en-tête exact de l'export Résultats (`toCsv`, les 19
 * colonnes du Sheet, au point-virgule, BOM compris), sans aucune ligne. C'est
 * le format que l'import lit en entier (19 colonnes reconnues sur 19) · aucun
 * format nouveau n'est inventé.
 */
export function modeleImport(): string {
  return toCsv([], {});
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

  // Une date de feuille est un jour civil, pas un instant UTC. Convertir
  // minuit local en ISO décale la veille dans les fuseaux à l'est de UTC.
  return { date: `${annee}-${mois}-${jj}`, repaired, rejected: false };
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
  /** Colonnes du tableau retrouvées dans l'en-tête (`lireColonnes`, au sens strict). */
  colonnesReconnues: number;
  /** Liens de l'application réimportés · remplacés par l'adresse en base de l'ad d'origine, ou écartés (`resoudreLiensApp`). */
  liensAppResolus: number;
  liensAppEcartes: number;
  warnings: string[];
}

export interface ImportPlan {
  desires: PlanDesire[];
  angles: PlanAngle[];
  concepts: PlanConcept[];
  batches: PlanBatch[];
  ads: PlanAd[];
  report: ImportReport;
  /**
   * Le fichier est refusé avant tout aperçu (`refusColonnes`) · la phrase à
   * montrer, sinon `null`. Refusé, le plan est vide · rien ne s'écrit.
   */
  refus: string | null;
}

const cle = (title: string, angle: string) => `${title.trim()}||${angle.trim()}`;

/**
 * Construit le plan d'import à partir du CSV.
 * Rien n'est écrit : le plan est destiné à être relu avant application.
 */
export function buildImportPlan(csvText: string, opts: { today?: Date } = {}): ImportPlan {
  const today = opts.today ?? new Date();
  const sep = detecterSeparateur(csvText);
  const rows = parseCsv(csvText, sep.separateur);
  const hIdx = findHeaderRow(rows);
  const entete = rows[hIdx] ?? [];
  const cols = mapColumns(entete);
  const data = rows.slice(hIdx + 1);
  // Le séparateur n'entre pas dans le plan · un même tableau réenregistré autrement rend le même plan
  // (`adsmap-csv-separateur.test.ts`). L'aperçu le dit à part (`lectureSeparateur`).
  const lecture = { colonnesReconnues: lireColonnes(entete).reconnues, liensAppResolus: 0, liensAppEcartes: 0 };
  const refus = refusColonnes(entete);

  const cell = (r: string[], k: keyof typeof SHEET_HEADERS) => {
    const i = cols[k];
    return i >= 0 && i < r.length ? (r[i] ?? '').trim() : '';
  };

  if (refus) {
    // Mal découpé ou étranger au tableau · aucune ligne n'est lue, aucun plan n'est proposé.
    return {
      desires: [], angles: [], concepts: [], batches: [], ads: [], refus,
      report: {
        rowsRead: 0, rowsSkipped: 0, personas: 0, desires: 0, desiresSplit: 0, angles: 0, anglesWithoutMechanism: 0,
        concepts: 0, conceptsMerged: 0, batches: 0, ads: 0, verdicts: 0, learnings: 0, datesRepaired: 0,
        datesRejected: 0, demotedToDraft: 0, iterationsUnlinked: 0, ...lecture, warnings: [],
      },
    };
  }

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
    demotedToDraft: 0, iterationsUnlinked: 0, ...lecture, warnings: [],
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
  if (sep.raison === 'majorite' || sep.raison === 'defaut-egalite') {
    // L'en-tête porte plusieurs séparateurs et aucune ligne ne départage · on a choisi, on le dit.
    report.warnings.push(`Séparateur de colonnes ambigu dans l'en-tête · fichier lu ${LIBELLE_SEPARATEUR[sep.separateur]}. Si les colonnes ont glissé dans l'aperçu, réenregistre le fichier depuis ton tableur.`);
  }
  if (report.demotedToDraft > 0) {
    report.warnings.push(`${report.demotedToDraft} ad(s) marquées « Prête » ou « Test en cours » n'ont pas d'hypothèse : elles repassent en brouillon. Écris-la avant de les relancer.`);
  }
  if (report.datesRejected > 0) {
    // La règle de `parseSheetDate`, pas la cause d'UN fichier · l'ancienne phrase
    // expliquait toute date écartée par « l'année qui s'incrémente jusqu'en 2032 »,
    // y compris un 31/02 (recette lot 8).
    report.warnings.push(`${report.datesRejected} date(s) écartée(s) · illisible, impossible (ex. 31/02) ou hors de la fenêtre retenue (ni dans le futur, ni avant le 01/01/${today.getFullYear() - 1}) : laissées vides.`);
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
    refus: null,
  };
}
