import type { TestedVariable } from '../../adsmap/types';
import { estGagnanteValidee } from '../../adsmap/verdict-libelle';
import { LIBELLE_CHOIX_VARIABLE, type ChoixVariablesIteration } from '../studios/iterer-variable';
import { attendArbitrage, lienLotSpatial, lotArbitrable, type EtatLotSpatial, type FaitsAdSpatial } from '../resultats/lots';
import { demandeContexteJarvis, lienJarvisContexte, nettoyerContexteJarvis, type DemandeContexteJarvis, type TypeContexteJarvis } from './contexte';

/**
 * Spatial · Jarvis qui AGIT, sans rien appliquer seul (lot 5 bis V5 · G07, E35,
 * R03, G03). RÈGLES PURES · ni base, ni réseau, ni modèle.
 *
 * Sous une réponse de Jarvis, quand la conversation porte un lot ou une
 * hypothèse joints, deux gestes OUVRENT un écran existant, pré-rempli :
 *  · « Créer l'itération » · l'écran Itérer (lot 2), la pub de départ et la
 *    variable présélectionnées quand la réponse les désigne SÛREMENT ;
 *  · « Conclure le lot » · la conclusion du lot (lot 3), l'apprentissage de
 *    chaque variante pré-rempli par ce que la réponse dit d'ELLE seule.
 * Rien n'est créé ni conclu sur l'écran d'arrivée sans le clic de la personne.
 *
 * Ce qui part dans l'adresse · un identifiant de réponse (UUID) et le contexte
 * (type + UUID) · JAMAIS un texte du modèle. L'écran d'arrivée relit la réponse
 * dans la portée (espace, marque active, personne) et le contexte dans la
 * marque, puis applique les règles ci-dessous · la variable proposée est
 * BORNÉE à la liste fermée des variables ADMISES de la pub (`variablesIteration`),
 * la pub à la liste fermée des gagnantes du contexte · une réponse ne peut donc
 * jamais désigner une pub d'une autre marque, ni injecter une variable libre.
 * Si rien n'est sûr, aucun pré-choix, et l'écran le dit.
 */

/* ───────────────────────── adresses ───────────────────────── */

export const PARAM_REPONSE_JARVIS = 'reponse';
export const PARAM_CONCLURE_JARVIS = 'conclure';
export const VALEUR_CONCLURE_JARVIS = 'jarvis';
/** L'ancre de la section « Conclure le lot » de la fiche d'un lot. */
export const ANCRE_CONCLURE_LOT = 'conclure';

/** La phrase de tout refus d'une réponse (autre marque, autre personne, inconnue, mal formée) · rien ne dit si elle existe ailleurs. */
export const REFUS_GESTE_JARVIS = 'Cette réponse de Jarvis n’est pas lisible avec ta marque active et tes droits · rien n’est présélectionné.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
const premiere = (v: string | readonly string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) as string | undefined;
type Params = Readonly<Record<string, string | readonly string[] | undefined>>;

/** Les contextes qui portent des gestes sur `/jarvis` · un lot, une hypothèse. Une page de Résultats ou un projet n'en portent pas. */
export const TYPES_GESTES_JARVIS: readonly TypeContexteJarvis[] = ['lot', 'hypothese'];
/**
 * Les contextes d'où Itérer peut s'ouvrir depuis une réponse · ceux de `/jarvis`,
 * plus un PROJET Studios (son panneau Jarvis, PC E35 · sa réponse est relue
 * dans le fil LIÉ au projet, ses variantes dans la portée du projet).
 */
export const TYPES_ITERATION_JARVIS: readonly TypeContexteJarvis[] = [...TYPES_GESTES_JARVIS, 'projet'];
/** `?autre=1` · « Autre variable » (G07) · Itérer coche la variable SUIVANTE admise, pas celle de la réponse. */
export const PARAM_AUTRE_VARIABLE = 'autre';
export const VALEUR_AUTRE_VARIABLE = '1';

export type DemandeGesteIteration =
  | { etat: 'absente' }
  | { etat: 'refus' }
  | { etat: 'ok'; reponse: string; contexte: DemandeContexteJarvis; autre?: true };

/** L'adresse de l'écran Itérer ouvert depuis une réponse · `?reponse=<uuid>&contexte=lot|hypothese|projet&id=<uuid>[&autre=1]`. */
export function lireGesteIteration(sp: Params): DemandeGesteIteration {
  const r = premiere(sp[PARAM_REPONSE_JARVIS]);
  if (r === undefined) return { etat: 'absente' };
  const reponse = uuid(r);
  const contexte = demandeContexteJarvis(premiere(sp.contexte), premiere(sp.id));
  if (!reponse || !contexte || !TYPES_ITERATION_JARVIS.includes(contexte.type)) return { etat: 'refus' };
  const a = premiere(sp[PARAM_AUTRE_VARIABLE]);
  // Une valeur forgée pour `autre` ne devine rien · l'adresse entière est refusée.
  if (a !== undefined && a !== VALEUR_AUTRE_VARIABLE) return { etat: 'refus' };
  return { etat: 'ok', reponse, contexte, ...(a === VALEUR_AUTRE_VARIABLE ? { autre: true as const } : {}) };
}

/** L'adresse de la fiche d'un lot ouverte depuis une réponse · `?conclure=jarvis&reponse=<uuid>`. */
export function lireGesteConclusion(sp: Params): { etat: 'absente' } | { etat: 'refus' } | { etat: 'ok'; reponse: string } {
  if (premiere(sp[PARAM_CONCLURE_JARVIS]) !== VALEUR_CONCLURE_JARVIS) return { etat: 'absente' };
  const reponse = uuid(premiere(sp[PARAM_REPONSE_JARVIS]));
  return reponse ? { etat: 'ok', reponse } : { etat: 'refus' };
}

export function lienIterationJarvis(contexte: DemandeContexteJarvis, reponse: string, o: { autre?: boolean } = {}): string | null {
  const r = uuid(reponse);
  const c = demandeContexteJarvis(contexte.type, contexte.id);
  if (!r || !c || !TYPES_ITERATION_JARVIS.includes(c.type)) return null;
  const q = new URLSearchParams({ [PARAM_REPONSE_JARVIS]: r, contexte: c.type, id: c.id });
  if (o.autre) q.set(PARAM_AUTRE_VARIABLE, VALEUR_AUTRE_VARIABLE);
  return `/studio/iterer?${q.toString()}`;
}

export function lienConclusionJarvis(lotId: string, reponse: string): string | null {
  const r = uuid(reponse);
  const l = uuid(lotId);
  if (!r || !l) return null;
  return `${lienLotSpatial(l)}?${new URLSearchParams({ [PARAM_CONCLURE_JARVIS]: VALEUR_CONCLURE_JARVIS, [PARAM_REPONSE_JARVIS]: r }).toString()}#${ANCRE_CONCLURE_LOT}`;
}

/* ───────────────────────── les gestes d'un contexte ───────────────────────── */

export const RAISON_GESTE_SANS_GAGNANTE_LOT = 'Aucune variante de ce lot n’est une gagnante arbitrée · une itération part d’une gagnante.';
export const RAISON_GESTE_SANS_GAGNANTE_HYPOTHESE = 'Cette hypothèse n’a pas de verdict gagnant arbitré · une itération part d’une gagnante.';
export const RAISON_GESTE_HORS_LOT = 'Cette hypothèse n’est rangée dans aucun lot · il n’y a pas de lot à conclure.';
export const RAISON_GESTE_RIEN_A_CONCLURE = 'Aucun verdict du moteur n’attend d’être arbitré dans ce lot · il se conclut quand le moteur a tranché ses variantes.';
export const EFFET_GESTES_JARVIS = 'Ouvre l’écran, pré-rempli · rien n’est créé ni conclu sans ton clic là-bas.';

export interface GesteJarvis {
  cle: 'iterer' | 'conclure';
  libelle: string;
  /** Ce que le geste ouvre, sans la réponse (ajoutée au rendu, `lienGesteJarvis`) · `null` · geste fermé. */
  cible: { type: 'iterer'; contexte: DemandeContexteJarvis } | { type: 'conclure'; lotId: string } | null;
  /** Pourquoi le geste est fermé, écrit à côté · `null` ouvert. */
  raison: string | null;
}

export interface FaitsGestesJarvis {
  type: TypeContexteJarvis;
  id: string;
  /** Les variantes du contexte · celles du lot, ou la seule ad de l'hypothèse. */
  ads: readonly FaitsAdSpatial[];
  /** Le lot à conclure · le lot joint, ou celui de l'hypothèse · `null` hors lot. */
  lot: { id: string; etat: EtatLotSpatial; ads: readonly FaitsAdSpatial[] } | null;
}

const gagnante = (a: FaitsAdSpatial) => !!a.verdict && a.verdict.statut === 'validated' && estGagnanteValidee(a.verdict.retenu, a.verdict.comparable);

/** Les deux gestes d'un contexte lot ou hypothèse · `null` pour un autre contexte (aucun geste). */
export function gestesContexteJarvis(f: FaitsGestesJarvis): { iterer: GesteJarvis; conclure: GesteJarvis } | null {
  const d = demandeContexteJarvis(f.type, f.id);
  if (!d || !TYPES_GESTES_JARVIS.includes(d.type)) return null;
  const iterable = f.ads.some(gagnante);
  const iterer: GesteJarvis = {
    cle: 'iterer', libelle: 'Créer l’itération',
    cible: iterable ? { type: 'iterer', contexte: d } : null,
    raison: iterable ? null : d.type === 'lot' ? RAISON_GESTE_SANS_GAGNANTE_LOT : RAISON_GESTE_SANS_GAGNANTE_HYPOTHESE,
  };
  const l = f.lot;
  const concluable = !!l && lotArbitrable(l.etat) && l.ads.some(attendArbitrage);
  const conclure: GesteJarvis = {
    cle: 'conclure', libelle: 'Conclure le lot',
    cible: concluable ? { type: 'conclure', lotId: l!.id } : null,
    raison: concluable ? null : !l ? RAISON_GESTE_HORS_LOT : RAISON_GESTE_RIEN_A_CONCLURE,
  };
  return { iterer, conclure };
}

/** Le lien d'un geste sous UNE réponse (son identifiant) · `null` geste fermé ou réponse sans identifiant lisible (en cours d'écriture). */
export function lienGesteJarvis(g: GesteJarvis, reponse: string): string | null {
  if (!g.cible) return null;
  return g.cible.type === 'iterer' ? lienIterationJarvis(g.cible.contexte, reponse) : lienConclusionJarvis(g.cible.lotId, reponse);
}

/* ───────────────────────── lecture de la réponse ───────────────────────── */

/**
 * Les participes passés des verbes de conseil (« n'a rien changé », « la V1 a
 * testé ») · une ANALYSE au passé, jamais un conseil · marqués AVANT que
 * l'accent tombe (« changé » et « change » s'écriraient pareil). Mesuré · le
 * banc (`MESURE_EXTRACTION_JARVIS`) avait un pré-choix faux sur ce seul motif.
 */
const PARTICIPES_CONSEIL = /(?<![\p{L}])(test|chang|modifi|remplac|itér|déclin|essay|vari|jou|mis)(é|ée|és|ées)(?![\p{L}])/giu;

/**
 * Le texte tel que les règles le lisent · minuscules, sans accent, apostrophes
 * droites, sans adresse ni marqueur (`nettoyerContexteJarvis`) · « variante 2 »
 * s'écrit « v2 » (le code d'une variante).
 */
function normaliser(t: string): string {
  return t.replace(PARTICIPES_CONSEIL, '$1$2pp').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`ʼ]/g, '\'')
    .replace(/\bvariante\s+(\d{1,3})\b/g, 'v$1');
}

/**
 * Le texte d'une réponse, nettoyé AVANT la coupe en phrases · une adresse part
 * sans emporter la ponctuation qui la suit (son point final couperait sinon deux
 * phrases en une), puis le nettoyage du contexte (marqueurs, tiret cadratin).
 */
function propre(t: string): string {
  return nettoyerContexteJarvis(t.replace(/(?:\b(?:https?|ftp|s3|data|blob):|\bwww\.)\S*?([.,;:!?)]*)(?=\s|$)/gi, ' $1'), 20_000);
}

/** Les phrases d'un texte · coupées sur . ! ? et les retours à la ligne. */
function phrases(t: string): string[] {
  return (t.match(/[^.!?\n]+[.!?]*/g) ?? []).map((p) => p.trim()).filter(Boolean);
}

/**
 * Le vocabulaire qui désigne chaque variable dans une réponse · des NOMS
 * explicites (jamais un mot courant ambigu · « son » possessif, « offre » verbe,
 * « corps » d'une marque de soins). Lu sur le texte normalisé.
 */
export const VOCABULAIRE_VARIABLES: Readonly<Record<TestedVariable, readonly string[]>> = {
  hook: ['accroche', 'accroches', 'hook', 'hooks', 'premieres secondes', 'premiere phrase'],
  // + « vignette » (banc · « teste une vignette différente » restait sans variable).
  opening_visual: ['visuel d\'ouverture', 'visuels d\'ouverture', 'premiere image', 'plan d\'ouverture', 'image d\'ouverture', 'vignette', 'vignettes'],
  format: ['format', 'formats', 'carrousel', 'carrousels'],
  body: ['corps de la pub', 'corps de la video', 'corps du message', 'corps de l\'annonce', 'deroule'],
  // + « raccourcir » (banc · « raccourcir la vidéo et changer la musique » passait pour un conseil de son seul).
  length: ['duree', 'durees', 'longueur', 'plus courte', 'plus court', 'plus longue', 'plus long', 'raccourcir', 'raccourcis', 'rallonger'],
  audio: ['le son', 'du son', 'bande son', 'musique', 'voix off', 'audio'],
  // + des noms de PERSONNE précis (banc · « une cliente à l'écran », « une créatrice UGC » restaient sans variable) · jamais « à l'écran » seul (un texte affiché).
  avatar_on_screen: ['personne a l\'ecran', 'personnes a l\'ecran', 'avatar', 'avatars', 'cliente a l\'ecran', 'client a l\'ecran', 'creatrice ugc', 'createur ugc', 'creatrices ugc', 'createurs ugc', 'influenceuse', 'influenceur'],
  proof: ['preuve', 'preuves', 'temoignage', 'temoignages', 'avis clients'],
  // + « bouton » (banc · « change le bouton » restait sans variable).
  cta: ['appel a l\'action', 'appels a l\'action', 'cta', 'call to action', 'bouton', 'boutons'],
  // + « code promo », « prix barré », « prix réduit » (banc · trois conseils d'offre restaient sans variable) · jamais « prix » seul.
  offer: ['l\'offre', 'une offre', 'nouvelle offre', 'ton offre', 'cette offre', 'autre offre', 'promotion', 'remise', 'reduction', 'code promo', 'codes promo', 'prix barre', 'prix reduit'],
  landing: ['page de destination', 'pages de destination', 'landing', 'page produit'],
  angle: ['angle', 'angles'],
  desire: ['desir', 'desirs'],
  none_control: ['temoin'],
};

const ech = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motif = (termes: readonly string[]) => new RegExp(`(?<![a-z0-9])(?:${termes.map(ech).join('|')})(?![a-z0-9])`, 'g');
type MotifsVariables = ReadonlyArray<readonly [TestedVariable, RegExp]>;
/** Les motifs d'un vocabulaire · celui du module par défaut, un autre pour le banc de mesure (`mesurerExtractionJarvis`). */
export const motifsVocabulaire = (vocabulaire: Readonly<Record<TestedVariable, readonly string[]>>): MotifsVariables =>
  (Object.keys(vocabulaire) as TestedVariable[]).filter((v) => vocabulaire[v].length).map((v) => [v, motif(vocabulaire[v])] as const);
const MOTIFS_VARIABLES = motifsVocabulaire(VOCABULAIRE_VARIABLES);

/** Une phrase de CONSEIL · elle propose un geste (tester, changer, itérer…) · une mention ailleurs n'est qu'une analyse. */
const CONSEIL = /(?<![a-z])(teste[rsz]?|testons|change[rsz]?|changeons|modifie[rsz]?|remplace[rsz]?|itere[rsz]?|iteration|decline[rsz]?|essaie[rsz]?|essaye[rsz]?|varie[rsz]?|joue[rsz]? sur|mise[rsz]? sur|je (?:te )?(?:conseille|recommande|propose)|recommandation|prochain test|prochaine variante)(?![a-z])/;
/** Ce qui NIE une mention dans sa proposition · « garde l'accroche », « ne change pas l'offre », « plutôt que le format ». */
const NEGATION = /(?<![a-z])(ne|n'|pas|jamais|sans|garde[rsz]?|conserve[rsz]?|laisse[rsz]?|evite[rsz]?|plutot que|au lieu de|sauf)(?![a-z])/;
/** Les bornes d'une proposition dans une phrase. */
const PROPOSITION = /[,;:·]|(?<![a-z])(?:mais|et|puis|alors)(?![a-z])/g;

/** Une phrase de la réponse conseille-t-elle un geste (tester, changer, itérer…) ? */
export function reponseConseille(texte: string): boolean {
  return phrases(normaliser(propre(texte))).some((p) => CONSEIL.test(p));
}

/** Les variables mentionnées POSITIVEMENT dans les phrases de conseil · une mention niée ne compte pas. */
export function variablesConseillees(texte: string, motifs: MotifsVariables = MOTIFS_VARIABLES): TestedVariable[] {
  const vues = new Set<TestedVariable>();
  for (const p of phrases(normaliser(propre(texte)))) {
    if (!CONSEIL.test(p)) continue;
    for (const prop of p.split(PROPOSITION)) {
      if (!prop) continue;
      for (const [v, re] of motifs) {
        re.lastIndex = 0;
        for (let m = re.exec(prop); m; m = re.exec(prop)) {
          if (!NEGATION.test(prop.slice(0, m.index))) { vues.add(v); break; }
        }
      }
    }
  }
  return [...vues];
}

/* ───────────────────────── le banc de mesure de l'extraction ───────────────────────── */

export interface LigneMesureExtraction {
  genre: string;
  n: number;
  /** Aucune variable extraite (zéro ou plusieurs) · rien n'est présélectionné. */
  rienDeSur: number;
  /** La variable extraite est celle qu'une personne lit (ou rien, quand rien n'est conseillé). */
  juste: number;
  /** Une variable extraite, mais pas la bonne · le défaut qui coûte (un pré-choix faux). */
  fausse: number;
}

/**
 * Le banc · fait passer l'extraction (`variablesConseillees`, une seule
 * variable sinon rien) sur un corpus de réponses-types étiquetées, par genre.
 * Pur · le corpus vit dans les fixtures de test, le tableau mesuré ci-dessous.
 */
export function mesurerExtractionJarvis(
  corpus: ReadonlyArray<{ texte: string; attendu: TestedVariable | null; genre: string }>,
  vocabulaire: Readonly<Record<TestedVariable, readonly string[]>> = VOCABULAIRE_VARIABLES,
): { lignes: LigneMesureExtraction[]; total: LigneMesureExtraction } {
  const motifs = motifsVocabulaire(vocabulaire);
  const par = new Map<string, LigneMesureExtraction>();
  const total: LigneMesureExtraction = { genre: 'total', n: 0, rienDeSur: 0, juste: 0, fausse: 0 };
  for (const r of corpus) {
    const vues = variablesConseillees(r.texte, motifs);
    const v = vues.length === 1 ? vues[0]! : null;
    const l = par.get(r.genre) ?? { genre: r.genre, n: 0, rienDeSur: 0, juste: 0, fausse: 0 };
    for (const x of [l, total]) {
      x.n += 1;
      if (v === null) x.rienDeSur += 1;
      if (v === r.attendu) x.juste += 1;
      else if (v !== null) x.fausse += 1;
    }
    par.set(r.genre, l);
  }
  return { lignes: [...par.values()], total };
}

/**
 * La MESURE, refaite par `test/lot5t-jarvis-suite.test.ts` sur les deux corpus de
 * `test/fixtures/jarvis-reponses.ts` (sans modèle) · n réponses, « rien de sûr »
 * (aucune variable extraite), justes, FAUSSES (un pré-choix faux, le défaut qui coûte).
 *
 * | Corpus                       | n  | règle      | rien de sûr  | justes | fausses |
 * | ---------------------------- | -- | ---------- | ------------ | ------ | ------- |
 * | réglage · tout               | 64 | #1052      | 29 (45 %)    | 52     | 2       |
 * | réglage · tout               | 64 | actuelle   | 24 (38 %)    | 61     | 0       |
 * | réglage · UNE variable dite  | 43 | #1052      | 10 (23 %)    | 33     | 0       |
 * | réglage · UNE variable dite  | 43 | actuelle   | 3 (7 %)      | 40     | 0       |
 * | réglage · aucune / plusieurs | 21 | #1052      | 19           | 19     | 2       |
 * | réglage · aucune / plusieurs | 21 | actuelle   | 21           | 21     | 0       |
 * | contrôle · tout              | 24 | #1052      | 10 (42 %)    | 18     | 2       |
 * | contrôle · tout              | 24 | actuelle   | 9 (38 %)     | 23     | 0       |
 * | contrôle · UNE variable dite | 16 | #1052      | 4 (25 %)     | 12     | 0       |
 * | contrôle · UNE variable dite | 16 | actuelle   | 1 (6 %)      | 15     | 0       |
 *
 * Lecture · le « rien de sûr » GLOBAL reste haut (38 %) et c'est voulu · il
 * compte les silences JUSTES (analyse sans conseil, plusieurs variables · une
 * itération n'en change qu'une). Ce qui a bougé · les conseils d'UNE variable
 * manqués (23 % → 7 %, 25 % → 6 % sur le contrôle, qui n'a pas servi au réglage)
 * et les pré-choix FAUX (2 → 0 sur chaque corpus · tous venaient d'un participe
 * passé lu comme un conseil, « n'a rien changé », « a été testé »). Restent
 * manqués, en silence et jamais faux · un qualificatif pris pour une durée
 * (« une démonstration plus courte »), un nom de variable dans une relative
 * (« qui reprend l'accroche »), « ajoute » (verbe aussi descriptif, laissé hors
 * des conseils). « #1052 » · la règle et le vocabulaire de `main` à 121e6553.
 */
export const MESURE_EXTRACTION_JARVIS: Readonly<Record<'reglage' | 'controle', Readonly<Record<string, Readonly<{ n: number; rienDeSur: number; juste: number; fausse: number }>>>>> = {
  reglage: {
    une: { n: 34, rienDeSur: 3, juste: 31, fausse: 0 },
    niee: { n: 6, rienDeSur: 0, juste: 6, fausse: 0 },
    structurelle: { n: 3, rienDeSur: 0, juste: 3, fausse: 0 },
    analyse: { n: 12, rienDeSur: 12, juste: 12, fausse: 0 },
    plusieurs: { n: 9, rienDeSur: 9, juste: 9, fausse: 0 },
    total: { n: 64, rienDeSur: 24, juste: 61, fausse: 0 },
  },
  controle: {
    une: { n: 14, rienDeSur: 1, juste: 13, fausse: 0 },
    niee: { n: 2, rienDeSur: 0, juste: 2, fausse: 0 },
    analyse: { n: 5, rienDeSur: 5, juste: 5, fausse: 0 },
    plusieurs: { n: 3, rienDeSur: 3, juste: 3, fausse: 0 },
    total: { n: 24, rienDeSur: 9, juste: 23, fausse: 0 },
  },
};

export type MotifVariableReponse = 'sure' | 'aucune' | 'ambigue' | 'fermee';
export interface VariableReponse { variable: TestedVariable | null; motif: MotifVariableReponse; note: string }

/**
 * La variable que la réponse CONSEILLE, bornée aux variables ADMISES de la pub ·
 * exactement une mention positive dans une phrase de conseil, et admise. Sinon
 * aucune · zéro, plusieurs, ou une variable fermée pour cette pub.
 */
export function variableDepuisReponse(texte: string, choix: ChoixVariablesIteration): VariableReponse {
  const vues = variablesConseillees(texte);
  if (vues.length === 0) return { variable: null, motif: 'aucune', note: 'Jarvis ne conseille aucune variable précise · rien n’est présélectionné, choisis-la à l’étape « Ce qu’on change ».' };
  if (vues.length > 1) return { variable: null, motif: 'ambigue', note: `Jarvis évoque plusieurs variables (${vues.map((v) => LIBELLE_CHOIX_VARIABLE[v]).join(', ')}) · rien n’est présélectionné, une itération n’en change qu’une.` };
  const v = vues[0]!;
  const o = choix.options.find((x) => x.variable === v);
  if (!o?.admise) return { variable: null, motif: 'fermee', note: `Jarvis propose ${LIBELLE_CHOIX_VARIABLE[v].toLowerCase()}, qui n’est pas admise pour cette pub${o?.raison ? ` · ${o.raison}` : ''} · rien n’est présélectionné.` };
  return { variable: v, motif: 'sure', note: `Variable proposée par Jarvis · ${LIBELLE_CHOIX_VARIABLE[v]}.` };
}

/**
 * Les pubs d'une liste fermée que le texte nomme, par leur code (ou un autre
 * nom FERMÉ · le libellé d'une variante de projet) · un nom porté par deux pubs
 * n'en désigne aucune · une pub nommée deux fois (code et libellé) compte une fois.
 */
function codesNommes(texte: string, variantes: ReadonlyArray<{ adId: string; variante: string; alias?: readonly string[] }>): string[] {
  const parCode = new Map<string, Set<string>>();
  for (const v of variantes) {
    for (const nom of [v.variante, ...(v.alias ?? [])]) {
      const c = normaliser(nom.trim());
      if (!c) continue;
      parCode.set(c, (parCode.get(c) ?? new Set()).add(v.adId));
    }
  }
  const t = normaliser(propre(texte));
  const ids = new Set<string>();
  for (const [c, adIds] of parCode) {
    if (adIds.size !== 1) continue;
    if (new RegExp(`(?<![a-z0-9-])${ech(c)}(?![a-z0-9-])`).test(t)) ids.add([...adIds][0]!);
  }
  return [...ids];
}

export interface CandidatIteration {
  adId: string;
  /** Le code de la variante (« V1 ») · ou, pour un projet, le libellé de la variante (« Image 1 du lot 2 »). */
  variante: string;
  variables: ChoixVariablesIteration;
  /** D'autres noms FERMÉS de la même pub (aucun texte du modèle). */
  alias?: readonly string[];
  /** Ce qui a déjà été testé sur cette pub · sa variable testée et celles que sa lignée a changées (`ordreVariablesSuivantes`). */
  dejaTestees?: readonly TestedVariable[];
}
export interface PreparationIterationJarvis {
  adId: string | null;
  variable: TestedVariable | null;
  /** Ce que l'écran dit, en une phrase · toujours posée (le pré-choix ou son absence). */
  note: string;
}

const FIN_ITERATION = 'Rien n’est créé sans ton clic sur « Créer l’itération ».';

/**
 * La pub de départ et la variable, depuis une réponse · la pub parmi les
 * gagnantes ITÉRABLES du contexte (liste fermée, lue dans la marque), la
 * variable parmi SES variables admises. La seule gagnante du contexte est
 * prise d'office · plusieurs, il faut que la réponse en nomme exactement une
 * (dans un conseil d'abord, sinon dans tout le texte).
 */
/** La borne d'un nom de pub dans une phrase de l'écran · un code (« V1 ») ou le libellé d'une variante de projet. */
const BORNE_NOM_PUB = 40;
export const nomPubJarvis = (c: { variante: string }) => nettoyerContexteJarvis(c.variante, BORNE_NOM_PUB);

/** Les options de la désignation de la pub de départ. */
export interface OptionsPubJarvis {
  /**
   * La seule gagnante n'est prise d'office que si la réponse CONSEILLE un geste
   * (un projet · son fil parle aussi du brief, d'une direction, d'un texte ·
   * une réponse qui n'en dit rien ne désigne aucune variante). Défaut · d'office
   * (un lot ou une hypothèse joints sont déjà le sujet de la question).
   */
  seuleSiConseil?: boolean;
  /**
   * Les noms des AUTRES variantes du contexte (perdantes, hors du plan) · liste
   * FERMÉE lue au serveur · une réponse qui en nomme une seule parle d'elle, pas
   * de la gagnante · aucun pré-choix (jamais la gagnante prise d'office à sa place).
   */
  exclus?: readonly string[];
}
const EXCLU = 'exclu:';

export interface PubReponse {
  candidat: CandidatIteration | null;
  motif: 'seule' | 'nommee' | 'aucune' | 'plusieurs' | 'vide' | 'sans_conseil' | 'autre';
  /** La phrase de l'écran, sans la fin. */
  phrase: string;
}

/**
 * La pub de départ qu'une réponse désigne, dans la liste FERMÉE des
 * candidates · la seule (d'office, ou si la réponse conseille un geste), sinon
 * celle que la réponse nomme SEULE (dans un conseil d'abord, sinon dans tout le texte).
 */
export function pubDepuisReponse(texte: string, candidats: readonly CandidatIteration[], o: OptionsPubJarvis = {}): PubReponse {
  if (candidats.length === 0) return { candidat: null, motif: 'vide', phrase: 'aucune pub de ce contexte n’est dans le plan d’itération de la marque · rien n’est présélectionné' };
  // Les AUTRES variantes du contexte (perdantes, hors plan) sont nommables aussi · nommée seule, l'une d'elles ne désigne aucune gagnante.
  const exclus = (o.exclus ?? []).map((variante, i) => ({ adId: `${EXCLU}${i}`, variante }));
  const liste = [...candidats, ...exclus];
  const conseils = phrases(propre(texte)).filter((p) => CONSEIL.test(normaliser(p))).join(' ');
  const dansConseil = codesNommes(conseils, liste);
  const nommes = dansConseil.length === 1 ? dansConseil : codesNommes(texte, liste);
  const fin = 'rien n’est présélectionné, choisis la pub puis la variable';
  if (nommes.length === 1 && nommes[0]!.startsWith(EXCLU)) {
    const autre = nettoyerContexteJarvis(exclus[Number(nommes[0]!.slice(EXCLU.length))]!.variante, BORNE_NOM_PUB);
    return { candidat: null, motif: 'autre', phrase: `Jarvis parle de ${autre}, qui n’est pas une gagnante arbitrée de ce contexte · ${fin}` };
  }
  const liste2 = candidats.map(nomPubJarvis).join(', ');
  if (nommes.length > 1) return { candidat: null, motif: 'plusieurs', phrase: `Jarvis nomme plusieurs pubs de départ (${liste2}) · ${fin}` };
  if (candidats.length === 1) {
    const c = candidats[0]!;
    if (!o.seuleSiConseil || conseils) return { candidat: c, motif: 'seule', phrase: `pub de départ · ${nomPubJarvis(c)}, la seule gagnante du contexte` };
    if (nommes.length === 1) return { candidat: c, motif: 'nommee', phrase: `pub de départ · ${nomPubJarvis(c)}, nommée par Jarvis` };
    return { candidat: null, motif: 'sans_conseil', phrase: `Jarvis ne conseille aucune itération de ${nomPubJarvis(c)} · ${fin}` };
  }
  if (nommes.length === 1) {
    const c = candidats.find((x) => x.adId === nommes[0])!;
    return { candidat: c, motif: 'nommee', phrase: `pub de départ · ${nomPubJarvis(c)}, nommée par Jarvis` };
  }
  return { candidat: null, motif: 'aucune', phrase: `Jarvis ne nomme aucune des pubs de départ (${liste2}) · ${fin}` };
}

export function iterationDepuisReponse(texte: string, candidats: readonly CandidatIteration[], o: OptionsPubJarvis = {}): PreparationIterationJarvis {
  const p = pubDepuisReponse(texte, candidats, o);
  if (!p.candidat) return { adId: null, variable: null, note: `Préparé depuis Jarvis · ${p.phrase}. ${FIN_ITERATION}` };
  const v = variableDepuisReponse(texte, p.candidat.variables);
  return { adId: p.candidat.adId, variable: v.variable, note: `Préparé depuis Jarvis · ${p.phrase} · ${v.note} ${FIN_ITERATION}` };
}

/* ───────────────────────── l'apprentissage, pour conclure ───────────────────────── */

/** La borne d'un apprentissage pré-rempli · celle du champ de la conclusion (600 signes). */
export const BORNE_APPRENTISSAGE_JARVIS = 600;
const PHRASES_PAR_VARIANTE = 2;

export interface ConclusionJarvis {
  /** L'apprentissage pré-rempli par variante · seulement celles que la réponse nomme seules. */
  textes: Record<string, string>;
  note: string;
}

/**
 * Ce que la réponse dit de CHAQUE variante à conclure · les phrases (pas une
 * question) qui nomment cette variante et AUCUNE autre de la liste, deux au
 * plus, nettoyées (ni adresse, ni marqueur, ni tiret cadratin) et bornées au
 * champ. Une variante que la réponse ne nomme pas seule reste vide · on le dit.
 */
export function apprentissagesDepuisReponse(texte: string, variantes: ReadonlyArray<{ adId: string; variante: string }>): ConclusionJarvis {
  const parAd = new Map<string, string[]>();
  for (const p of phrases(propre(texte))) {
    if (p.endsWith('?')) continue;
    const nommes = codesNommes(p, variantes);
    if (nommes.length !== 1) continue;
    const l = parAd.get(nommes[0]!) ?? [];
    if (l.length < PHRASES_PAR_VARIANTE) l.push(p);
    parAd.set(nommes[0]!, l);
  }
  const textes: Record<string, string> = {};
  for (const [id, l] of parAd) {
    const t = nettoyerContexteJarvis(l.join(' '), BORNE_APPRENTISSAGE_JARVIS);
    if (t.length >= 2) textes[id] = t;
  }
  const code = (id: string) => nettoyerContexteJarvis(variantes.find((v) => v.adId === id)?.variante ?? '', 12);
  const remplies = variantes.filter((v) => textes[v.adId]).map((v) => code(v.adId));
  const vides = variantes.filter((v) => !textes[v.adId]).map((v) => code(v.adId));
  const fin = 'Rien n’est validé sans ton clic sur « Valider le verdict ».';
  if (!remplies.length) return { textes, note: `La réponse de Jarvis ne dit rien de sûr sur une variante précise · rien n’est pré-rempli, écris chaque apprentissage. ${fin}` };
  return {
    textes,
    note: `Pré-rempli depuis la réponse de Jarvis pour ${remplies.join(', ')} · relis et corrige chaque apprentissage${vides.length ? ` · rien de sûr pour ${vides.join(', ')}, à écrire` : ''}. ${fin}`,
  };
}

/* ───────────────────────── la page affichée (tiroir de la coquille, G03) ───────────────────────── */

/**
 * Le contexte que désigne la page affichée · la MÊME liste fermée que
 * l'adresse de `/jarvis` (`demandeContexteJarvis`), relue par le serveur
 * comme elle. `null` hors des pages qui ont un contexte.
 */
export function contexteDePage(chemin: string): DemandeContexteJarvis | null {
  const c = chemin.split(/[?#]/)[0]!.replace(/^\/sp(?=\/)/, '').replace(/\/+$/, '') || '/';
  if (c === '/adsmap') return demandeContexteJarvis('resultats', 'ensemble');
  if (c === '/adsmap/lots') return demandeContexteJarvis('resultats', 'lots');
  if (c === '/adsmap/hypotheses') return demandeContexteJarvis('resultats', 'hypotheses');
  const m = /^\/(?:adsmap\/(lots|tests)|studio\/projets)\/([^/]+)$/.exec(c);
  if (!m) return null;
  let id: string;
  try { id = decodeURIComponent(m[2]!); } catch { return null; }
  return demandeContexteJarvis(m[1] === 'lots' ? 'lot' : m[1] === 'tests' ? 'hypothese' : 'projet', id);
}

/**
 * Ce que le tiroir JOINT · la page, sauf un projet · le projet a son panneau
 * Jarvis et son fil lié (le tiroir les mélangerait) · pour lui, seul le lien
 * plein écran porte le contexte.
 */
export function contexteTiroirJarvis(chemin: string): DemandeContexteJarvis | null {
  const d = contexteDePage(chemin);
  return d && d.type !== 'projet' ? d : null;
}

/** Le lien « plein écran » du tiroir · le contexte joint (ou le projet de la page), sinon `/jarvis`. */
export function lienPleinEcranTiroir(chemin: string, joint: DemandeContexteJarvis | null): string {
  const d = joint ?? (contexteDePage(chemin)?.type === 'projet' ? contexteDePage(chemin) : null);
  return (d && lienJarvisContexte(d.type, d.id)) || '/jarvis';
}

/* ───────────────────────── « Analyser avec Jarvis » (vue d'ensemble, R03) ───────────────────────── */

export interface AnalyseJarvisEnsemble {
  href: string;
  /** Les puces de la maquette · chacune PRÉPARE sa question, aucune n'envoie. */
  puces: Array<{ libelle: string; href: string }>;
}

/**
 * « Analyser avec Jarvis » de la vue d'ensemble · la page `resultats:ensemble`
 * jointe, et les puces de la maquette. « Pourquoi la V… fait mieux ? » ne se
 * pose que sur une gagnante RÉELLE (celle du lot vedette) · sinon la puce est
 * absente, jamais une « V2 » inventée.
 */
export function analyseJarvisEnsemble(vedette: { gagnante: string | null; numero: number } | null): AnalyseJarvisEnsemble {
  const lien = (q?: string) => lienJarvisContexte('resultats', 'ensemble', q)!;
  const g = vedette?.gagnante ? nettoyerContexteJarvis(vedette.gagnante, 12) : '';
  return {
    href: lien(),
    puces: [
      ...(g ? [{ libelle: `Pourquoi la ${g} fait mieux ?`, href: lien(`Pourquoi la ${g} du lot #${vedette!.numero} fait-elle mieux que les autres variantes ?`) }] : []),
      { libelle: 'Quelle variante tester ensuite ?', href: lien('Quelle variante tester ensuite ?') },
      { libelle: 'Résumé pour le client', href: lien('Écris un résumé de mes résultats pour le client, en trois phrases, sans chiffre inventé.') },
      { libelle: 'Ce qui manque pour conclure', href: lien('Qu’est-ce qui manque pour conclure mes lots en cours ?') },
    ],
  };
}
