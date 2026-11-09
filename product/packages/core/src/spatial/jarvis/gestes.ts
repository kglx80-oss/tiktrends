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

/** Les contextes qui portent des gestes · un lot, une hypothèse. Une page de Résultats ou un projet n'en portent pas. */
export const TYPES_GESTES_JARVIS: readonly TypeContexteJarvis[] = ['lot', 'hypothese'];

export type DemandeGesteIteration =
  | { etat: 'absente' }
  | { etat: 'refus' }
  | { etat: 'ok'; reponse: string; contexte: DemandeContexteJarvis };

/** L'adresse de l'écran Itérer ouvert depuis une réponse · `?reponse=<uuid>&contexte=lot|hypothese&id=<uuid>`. */
export function lireGesteIteration(sp: Params): DemandeGesteIteration {
  const r = premiere(sp[PARAM_REPONSE_JARVIS]);
  if (r === undefined) return { etat: 'absente' };
  const reponse = uuid(r);
  const contexte = demandeContexteJarvis(premiere(sp.contexte), premiere(sp.id));
  if (!reponse || !contexte || !TYPES_GESTES_JARVIS.includes(contexte.type)) return { etat: 'refus' };
  return { etat: 'ok', reponse, contexte };
}

/** L'adresse de la fiche d'un lot ouverte depuis une réponse · `?conclure=jarvis&reponse=<uuid>`. */
export function lireGesteConclusion(sp: Params): { etat: 'absente' } | { etat: 'refus' } | { etat: 'ok'; reponse: string } {
  if (premiere(sp[PARAM_CONCLURE_JARVIS]) !== VALEUR_CONCLURE_JARVIS) return { etat: 'absente' };
  const reponse = uuid(premiere(sp[PARAM_REPONSE_JARVIS]));
  return reponse ? { etat: 'ok', reponse } : { etat: 'refus' };
}

export function lienIterationJarvis(contexte: DemandeContexteJarvis, reponse: string): string | null {
  const r = uuid(reponse);
  const c = demandeContexteJarvis(contexte.type, contexte.id);
  if (!r || !c || !TYPES_GESTES_JARVIS.includes(c.type)) return null;
  return `/studio/iterer?${new URLSearchParams({ [PARAM_REPONSE_JARVIS]: r, contexte: c.type, id: c.id }).toString()}`;
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
 * Le texte tel que les règles le lisent · minuscules, sans accent, apostrophes
 * droites, sans adresse ni marqueur (`nettoyerContexteJarvis`) · « variante 2 »
 * s'écrit « v2 » (le code d'une variante).
 */
function normaliser(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`ʼ]/g, '\'')
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
  opening_visual: ['visuel d\'ouverture', 'visuels d\'ouverture', 'premiere image', 'plan d\'ouverture', 'image d\'ouverture'],
  format: ['format', 'formats', 'carrousel', 'carrousels'],
  body: ['corps de la pub', 'corps de la video', 'corps du message', 'corps de l\'annonce', 'deroule'],
  length: ['duree', 'durees', 'longueur', 'plus courte', 'plus court', 'plus longue', 'plus long'],
  audio: ['le son', 'du son', 'bande son', 'musique', 'voix off', 'audio'],
  avatar_on_screen: ['personne a l\'ecran', 'personnes a l\'ecran', 'avatar', 'avatars'],
  proof: ['preuve', 'preuves', 'temoignage', 'temoignages', 'avis clients'],
  cta: ['appel a l\'action', 'appels a l\'action', 'cta', 'call to action'],
  offer: ['l\'offre', 'une offre', 'nouvelle offre', 'ton offre', 'cette offre', 'autre offre', 'promotion', 'remise', 'reduction'],
  landing: ['page de destination', 'pages de destination', 'landing', 'page produit'],
  angle: ['angle', 'angles'],
  desire: ['desir', 'desirs'],
  none_control: ['temoin'],
};

const ech = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motif = (termes: readonly string[]) => new RegExp(`(?<![a-z0-9])(?:${termes.map(ech).join('|')})(?![a-z0-9])`, 'g');
const MOTIFS_VARIABLES = (Object.keys(VOCABULAIRE_VARIABLES) as TestedVariable[]).map((v) => [v, motif(VOCABULAIRE_VARIABLES[v])] as const);

/** Une phrase de CONSEIL · elle propose un geste (tester, changer, itérer…) · une mention ailleurs n'est qu'une analyse. */
const CONSEIL = /(?<![a-z])(teste[rsz]?|testons|change[rsz]?|changeons|modifie[rsz]?|remplace[rsz]?|itere[rsz]?|iteration|decline[rsz]?|essaie[rsz]?|essaye[rsz]?|varie[rsz]?|joue[rsz]? sur|mise[rsz]? sur|je (?:te )?(?:conseille|recommande|propose)|recommandation|prochain test|prochaine variante)(?![a-z])/;
/** Ce qui NIE une mention dans sa proposition · « garde l'accroche », « ne change pas l'offre », « plutôt que le format ». */
const NEGATION = /(?<![a-z])(ne|n'|pas|jamais|sans|garde[rsz]?|conserve[rsz]?|laisse[rsz]?|evite[rsz]?|plutot que|au lieu de|sauf)(?![a-z])/;
/** Les bornes d'une proposition dans une phrase. */
const PROPOSITION = /[,;:·]|(?<![a-z])(?:mais|et|puis|alors)(?![a-z])/g;

/** Les variables mentionnées POSITIVEMENT dans les phrases de conseil · une mention niée ne compte pas. */
function variablesConseillees(texte: string): TestedVariable[] {
  const vues = new Set<TestedVariable>();
  for (const p of phrases(normaliser(propre(texte)))) {
    if (!CONSEIL.test(p)) continue;
    for (const prop of p.split(PROPOSITION)) {
      if (!prop) continue;
      for (const [v, re] of MOTIFS_VARIABLES) {
        re.lastIndex = 0;
        for (let m = re.exec(prop); m; m = re.exec(prop)) {
          if (!NEGATION.test(prop.slice(0, m.index))) { vues.add(v); break; }
        }
      }
    }
  }
  return [...vues];
}

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

/** Les codes de variante d'une liste fermée que le texte nomme · un code porté par deux pubs n'en désigne aucune. */
function codesNommes(texte: string, variantes: ReadonlyArray<{ adId: string; variante: string }>): string[] {
  const parCode = new Map<string, string[]>();
  for (const v of variantes) {
    const c = normaliser(v.variante.trim());
    if (!c) continue;
    parCode.set(c, [...(parCode.get(c) ?? []), v.adId]);
  }
  const t = normaliser(propre(texte));
  const ids: string[] = [];
  for (const [c, adIds] of parCode) {
    if (adIds.length !== 1) continue;
    if (new RegExp(`(?<![a-z0-9-])${ech(c)}(?![a-z0-9-])`).test(t)) ids.push(adIds[0]!);
  }
  return ids;
}

export interface CandidatIteration { adId: string; variante: string; variables: ChoixVariablesIteration }
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
export function iterationDepuisReponse(texte: string, candidats: readonly CandidatIteration[]): PreparationIterationJarvis {
  if (candidats.length === 0) {
    return { adId: null, variable: null, note: `Préparé depuis Jarvis · aucune pub de ce contexte n’est dans le plan d’itération de la marque · rien n’est présélectionné. ${FIN_ITERATION}` };
  }
  let c: CandidatIteration | null = null;
  let pub: string;
  if (candidats.length === 1) {
    c = candidats[0]!;
    pub = `pub de départ · ${nettoyerContexteJarvis(c.variante, 12)}, la seule gagnante du contexte`;
  } else {
    const conseils = phrases(propre(texte)).filter((p) => CONSEIL.test(normaliser(p))).join(' ');
    const dansConseil = codesNommes(conseils, candidats);
    const nommes = dansConseil.length === 1 ? dansConseil : codesNommes(texte, candidats);
    if (nommes.length === 1) {
      c = candidats.find((x) => x.adId === nommes[0])!;
      pub = `pub de départ · ${nettoyerContexteJarvis(c.variante, 12)}, nommée par Jarvis`;
    } else {
      const liste = candidats.map((x) => nettoyerContexteJarvis(x.variante, 12)).join(', ');
      pub = nommes.length > 1
        ? `Jarvis nomme plusieurs pubs de départ (${liste}) · rien n’est présélectionné, choisis la pub puis la variable`
        : `Jarvis ne nomme aucune des pubs de départ (${liste}) · rien n’est présélectionné, choisis la pub puis la variable`;
      return { adId: null, variable: null, note: `Préparé depuis Jarvis · ${pub}. ${FIN_ITERATION}` };
    }
  }
  const v = variableDepuisReponse(texte, c.variables);
  return { adId: c.adId, variable: v.variable, note: `Préparé depuis Jarvis · ${pub} · ${v.note} ${FIN_ITERATION}` };
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
