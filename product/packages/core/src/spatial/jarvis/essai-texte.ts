import type { TestedVariable } from '../../adsmap/types';
import { LIBELLES_TYPE_TEXTE, type TypeTexte } from '../../studios/textes/textes';
import type { ChoixVariablesIteration } from '../studios/iterer-variable';
import { vueVariantes, type DonneesVariantes } from '../../studios/variantes/vue';
import { demandeContexteJarvis, nettoyerContexteJarvis, type DemandeContexteJarvis, type TypeContexteJarvis } from './contexte';
import { PARAM_REPONSE_JARVIS, REFUS_GESTE_JARVIS, mentionNiee, motifEnTete, phrasesJarvis, pubDepuisReponse, verbeEnTete, type PhraseJarvis } from './gestes';
import { variableDesignee } from './suite';

/**
 * Spatial · Jarvis, les deux derniers gestes de G07 (lot 5 quater V5).
 * RÈGLES PURES · ni base, ni réseau, ni modèle.
 *
 * Sous une réponse qui porte un contexte (un lot, une hypothèse, un projet) :
 *  · « Tester » · OUVRE l'écran existant du projet de la variante désignée ·
 *    « Rattacher au test » de CETTE variante quand elle n'a pas encore de test,
 *    sinon « Préparer un lot d'essai » avec elle présélectionnée ;
 *  · « Corriger le texte » · OUVRE l'atelier Textes du projet de la variante
 *    désignée, la consigne de Jarvis affichée et, quand Jarvis cite le texte
 *    corrigé entre guillemets, ce texte dans le champ « Écrire à la main ».
 * Jamais envoyé, jamais généré, jamais enregistré · tout part du clic sur
 * l'écran d'arrivée, qui annonce lui-même son coût (l'écriture IA de l'atelier
 * reste derrière son prix annoncé et la barrière de dépense ; le champ manuel est gratuit).
 *
 * Les MÊMES bornes que « Créer l'itération » (`gestes.ts`) · la variante parmi
 * une liste FERMÉE lue au serveur (les variantes Studio du contexte), nommée
 * seule ou seule du contexte avec un conseil · une autre pub du contexte nommée
 * seule ne désigne rien · l'adresse ne porte que des identifiants, l'écran
 * d'arrivée relit la réponse dans la portée et rejoue CES règles · rien de sûr,
 * aucun geste, et on le dit.
 */

/* ───────────────────────── la liste fermée ───────────────────────── */

/** Une variante Studio du contexte, ce que les deux gestes en lisent (relue au serveur). */
export interface VarianteEssaiJarvis {
  varianteId: string;
  projectId: string;
  /** Le nom FERMÉ de la pub · son code Adsmap (« V1 ») dans un lot, son libellé d'écran dans un projet. */
  nom: string;
  alias?: readonly string[];
  /** Déjà rattachée à un test Adsmap. */
  enTest: boolean;
  /** « Rattacher au test » est ouvert pour elle (droit de proposer, accès Adsmap, aucun test ouvert). */
  rattachable: boolean;
  /** « Préparer un lot d'essai » est ouvert dans son projet (droit de proposer). */
  essai: boolean;
}

/**
 * Les variantes d'un PROJET, depuis ses données DÉJÀ lues dans la portée
 * (`listerVariantes`) · leur libellé d'écran (`vueVariantes`, le nom fermé),
 * leur test, « Rattacher au test » (`gestes.rattacher`) et le lot d'essai
 * (droit de proposer, au moins un lot · la condition de l'écran).
 */
export function variantesEssaiProjet(projectId: string, donnees: DonneesVariantes): VarianteEssaiJarvis[] {
  const essai = donnees.droits.proposer && donnees.lots.length > 0;
  return vueVariantes(donnees).variantes.map((v) => ({
    varianteId: v.id.toLowerCase(), projectId: projectId.toLowerCase(), nom: v.libelle,
    enTest: v.test !== null, rattachable: v.gestes.rattacher, essai,
  }));
}

const VIDES: ChoixVariablesIteration = { adId: '', ferme: null, options: [], defaut: null };

/* ───────────────────────── ce que la réponse conseille ───────────────────────── */

/** Un conseil de TEST · « teste », « mets en test », « lance un test », « rattache », « prépare un lot d'essai ». Le participe (« testé ») est marqué par la lecture et ne compte pas. */
const VERBES_TEST = 'teste[rsz]?|testons|mets?\\s+(?:\\S+\\s+){0,2}en\\s+test|lance[rsz]?\\s+(?:un|le|ce|ton)\\s+(?:test|essai)|rattache[rsz]?|prepare[rsz]?\\s+(?:un|le|ton)\\s+(?:lot d\'essai|essai)';
const TEST = new RegExp(`(?<![a-z])(?:${VERBES_TEST})(?![a-z])`);
const TETE_TEST = motifEnTete(VERBES_TEST);
/** Un conseil de CORRECTION d'un texte · un verbe de reprise du texte, jamais « change » ou « teste » (une itération). */
const VERBES_CORRECTION = 'corrige[rsz]?|corrigeons|reecri(?:s|re|vez|vons|t)|reformule[rsz]?|retravaille[rsz]?|retouche[rsz]?|simplifie[rsz]?|raccourci[rsz]?|clarifie[rsz]?|ajuste[rsz]?';
const CORRECTION = new RegExp(`(?<![a-z])(?:${VERBES_CORRECTION})(?![a-z])`);
const TETE_CORRECTION = motifEnTete(VERBES_CORRECTION);
/** Une phrase porte un verbe de la famille ET c'est un conseil · une phrase de conseil, ou le verbe en tête de proposition (l'impératif, jamais « la V2 corrige… »). */
const conseilDe = (p: PhraseJarvis, verbe: RegExp, tete: RegExp) => verbe.test(p.lue) && (p.conseil || verbeEnTete(p.lue, tete));

/**
 * Les mots qui désignent un TYPE de texte de l'atelier (liste fermée,
 * `TYPES_TEXTE`) · lus sur le texte normalisé. « texte » seul ne dit pas lequel.
 */
export const VOCABULAIRE_TEXTES: Readonly<Record<TypeTexte, readonly string[]>> = {
  hook: ['accroche', 'accroches', 'hook', 'hooks', 'premiere phrase', 'titre'],
  ad_copy: ['texte principal', 'texte de la pub', 'texte de l\'annonce', 'texte de la publicite', 'corps du texte', 'legende', 'description'],
  cta: ['appel a l\'action', 'cta', 'call to action', 'bouton'],
  script: ['script', 'scripts'],
};
const ech = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motif = (termes: readonly string[]) => new RegExp(`(?<![a-z0-9])(?:${termes.map(ech).join('|')})(?![a-z0-9])`, 'g');
const MOTIFS_TEXTES = (Object.keys(VOCABULAIRE_TEXTES) as TypeTexte[]).map((t) => [t, motif(VOCABULAIRE_TEXTES[t])] as const);
const GENERIQUE = /(?<![a-z0-9])(?:le texte|ce texte|ton texte|les textes|tes textes|le wording|la copy|le message ecrit)(?![a-z0-9])/;

/** Les types de texte mentionnés POSITIVEMENT dans une phrase (lue) · une mention niée (« garde l'accroche ») ne compte pas. */
function typesPositifs(p: PhraseJarvis): Set<TypeTexte> {
  const vus = new Set<TypeTexte>();
  for (const prop of p.propositions) {
    for (const [t, re] of MOTIFS_TEXTES) {
      re.lastIndex = 0;
      for (let m = re.exec(prop); m; m = re.exec(prop)) {
        if (!mentionNiee(prop, m.index)) { vus.add(t); break; }
      }
    }
  }
  return vus;
}

export interface CorrectionLue {
  /** Le type de texte que la réponse fait corriger · `null` · « le texte » sans dire lequel. */
  type: TypeTexte | null;
  /** La consigne · les phrases de correction telles qu'écrites, nettoyées, bornées (`BORNE_CONSIGNE_JARVIS`). */
  consigne: string;
  /** Le texte corrigé que Jarvis CITE entre guillemets, s'il en cite exactement un · sinon `null`. */
  proposition: string | null;
}
export type LectureCorrection = { etat: 'aucune' } | { etat: 'plusieurs'; types: TypeTexte[] } | ({ etat: 'sure' } & CorrectionLue);

/** La borne de la consigne affichée · deux phrases courtes, jamais un texte entier du modèle. */
export const BORNE_CONSIGNE_JARVIS = 280;
/** La borne d'un texte corrigé cité · celle d'un script (`LIMITE_CARACTERES`), largement au-dessus d'une accroche. */
export const BORNE_PROPOSITION_JARVIS = 600;
const CITATION = /«\s*([^«»]{2,600}?)\s*»|“([^“”]{2,600}?)”|"([^"]{2,600}?)"/g;

/**
 * La correction de texte que la réponse CONSEILLE · une phrase de conseil avec
 * un verbe de reprise (« corrige », « reformule », « réécris »…) ET un texte
 * (un type de l'atelier, ou « le texte ») mentionné positivement · deux types
 * différents, aucune (une itération se corrige ailleurs).
 */
export function correctionDepuisReponse(texte: string): LectureCorrection {
  const lues = phrasesJarvis(texte).filter((p) => conseilDe(p, CORRECTION, TETE_CORRECTION));
  const retenues: PhraseJarvis[] = [];
  const types = new Set<TypeTexte>();
  for (const p of lues) {
    const t = typesPositifs(p);
    if (t.size === 0 && !GENERIQUE.test(p.lue)) continue;
    t.forEach((x) => types.add(x));
    retenues.push(p);
  }
  if (!retenues.length) return { etat: 'aucune' };
  if (types.size > 1) return { etat: 'plusieurs', types: [...types] };
  const deux = retenues.slice(0, 2).map((p) => p.brute);
  const citations = deux.flatMap((b) => [...b.matchAll(CITATION)].map((m) => (m[1] ?? m[2] ?? m[3] ?? '').trim()).filter((c) => c.length >= 2));
  const proposition = citations.length === 1 ? nettoyerContexteJarvis(citations[0]!, BORNE_PROPOSITION_JARVIS) : null;
  return { etat: 'sure', type: types.size ? [...types][0]! : null, consigne: nettoyerContexteJarvis(deux.join(' '), BORNE_CONSIGNE_JARVIS), proposition: proposition && proposition.length >= 2 ? proposition : null };
}

/** La réponse conseille-t-elle de TESTER (une phrase de conseil avec un verbe de test) ? */
export function reponseConseilleTest(texte: string): boolean {
  return phrasesJarvis(texte).some((p) => conseilDe(p, TEST, TETE_TEST));
}

/**
 * La variante désignée, parmi la liste FERMÉE · la même règle que la pub de départ
 * (`pubDepuisReponse`) · nommée seule, ou la seule du contexte · le conseil (de test,
 * de correction) est exigé par chaque geste AVANT la désignation.
 */
export function varianteDepuisReponse(texte: string, variantes: readonly VarianteEssaiJarvis[], exclus: readonly string[] = []): { variante: VarianteEssaiJarvis | null; phrase: string } {
  const p = pubDepuisReponse(texte, variantes.map((v) => ({ adId: v.varianteId, variante: v.nom, variables: VIDES, ...(v.alias ? { alias: v.alias } : {}) })), { exclus });
  return { variante: p.candidat ? variantes.find((v) => v.varianteId === p.candidat!.adId) ?? null : null, phrase: p.phrase };
}

/* ───────────────────────── adresses ───────────────────────── */

export const PARAM_GESTE_ESSAI = 'geste';
export type GesteEssaiJarvis = 'tester' | 'corriger';
/** Les contextes d'où les deux gestes s'ouvrent · un lot, une hypothèse, un projet. */
export const TYPES_ESSAI_JARVIS: readonly TypeContexteJarvis[] = ['lot', 'hypothese', 'projet'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
const premiere = (v: string | readonly string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) as string | undefined;

function requete(geste: GesteEssaiJarvis, contexte: DemandeContexteJarvis, reponse: string): string | null {
  const r = uuid(reponse);
  const c = demandeContexteJarvis(contexte.type, contexte.id);
  if (!r || !c || !TYPES_ESSAI_JARVIS.includes(c.type)) return null;
  return new URLSearchParams({ [PARAM_GESTE_ESSAI]: geste, [PARAM_REPONSE_JARVIS]: r, contexte: c.type, id: c.id }).toString();
}
/** « Tester » · la fiche du projet, onglet Créations · `?geste=tester&reponse=<uuid>&contexte=…&id=…#variantes`. */
export function lienTesterJarvis(projectId: string, contexte: DemandeContexteJarvis, reponse: string): string | null {
  const p = uuid(projectId);
  const q = requete('tester', contexte, reponse);
  return p && q ? `/studio/projets/${p}?${q}#variantes` : null;
}
/** « Corriger le texte » · l'atelier Textes du projet · `?geste=corriger&reponse=<uuid>&contexte=…&id=…`. */
export function lienCorrigerJarvis(projectId: string, contexte: DemandeContexteJarvis, reponse: string): string | null {
  const p = uuid(projectId);
  const q = requete('corriger', contexte, reponse);
  return p && q ? `/studio/projets/${p}/textes?${q}` : null;
}

type Params = Readonly<Record<string, string | readonly string[] | undefined>>;
export type DemandeGesteEssai = { etat: 'absente' } | { etat: 'refus' } | { etat: 'ok'; reponse: string; contexte: DemandeContexteJarvis };
/** L'adresse d'arrivée · absente sans `geste`, refusée si quoi que ce soit est forgé (autre geste, identifiant illisible, contexte inconnu). */
export function lireGesteEssaiJarvis(sp: Params, attendu: GesteEssaiJarvis): DemandeGesteEssai {
  const g = premiere(sp[PARAM_GESTE_ESSAI]);
  if (g === undefined) return { etat: 'absente' };
  if (g !== attendu) return { etat: 'refus' };
  const reponse = uuid(premiere(sp[PARAM_REPONSE_JARVIS]));
  const contexte = demandeContexteJarvis(premiere(sp.contexte), premiere(sp.id));
  if (!reponse || !contexte || !TYPES_ESSAI_JARVIS.includes(contexte.type)) return { etat: 'refus' };
  return { etat: 'ok', reponse, contexte };
}

/* ───────────────────────── sous la réponse ───────────────────────── */

export const LIBELLE_TESTER = 'Tester';
export const LIBELLE_CORRIGER = 'Corriger le texte';
export const EFFET_TESTER = 'Ouvre le rattachement au test ou le lot d’essai du projet, pré-rempli · rien n’est rattaché ni préparé sans ton clic là-bas.';
export const EFFET_CORRIGER = 'Ouvre l’atelier Textes du projet avec la consigne · rien n’est écrit, généré ni enregistré sans ton clic là-bas.';
export const RAISON_TESTER_FERME = 'Ton rôle ou ton offre ne permet ni de rattacher cette variante à un test, ni de préparer un lot d’essai.';
export const RAISON_SANS_VARIANTE_STUDIO = 'aucune pub de ce contexte ne vient d’un projet Studio · le rattachement, l’essai et les textes vivent dans un projet';
export const raisonCorrigerPlusieurs = (types: readonly TypeTexte[]) => `Jarvis fait corriger plusieurs textes à la fois (${types.map((t) => LIBELLES_TYPE_TEXTE[t]).join(', ')}) · rien n’est pré-rempli, corrige-les un par un dans l’atelier.`;

export type GesteSousReponse = { libelle: string; href: string; varianteId: string; detail: string } | { raison: string };
export interface GestesEssaiTexte {
  /** `null` · la réponse ne conseille aucun test (rien à proposer, rien à dire). */
  tester: GesteSousReponse | null;
  /** `null` · la réponse ne conseille aucune correction de texte. */
  corriger: GesteSousReponse | null;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * « Tester » et « Corriger le texte » sous UNE réponse (son identifiant, son
 * texte lisible) · la liste FERMÉE des variantes Studio du contexte. Chaque
 * geste est `null` quand la réponse n'en parle pas, un lien quand tout est
 * sûr, sinon la raison (écrite à côté, aucun lien). `null` · réponse sans
 * identifiant lisible ou contexte sans ces gestes.
 */
export function gestesEssaiTexteJarvis(o: { texte: string; reponse: string; contexte: DemandeContexteJarvis; variantes: readonly VarianteEssaiJarvis[]; exclus?: readonly string[] }): GestesEssaiTexte | null {
  if (!uuid(o.reponse) || !requete('tester', o.contexte, o.reponse)) return null;
  const exclus = o.exclus ?? [];
  const designer = () => (o.variantes.length ? varianteDepuisReponse(o.texte, o.variantes, exclus) : { variante: null, phrase: RAISON_SANS_VARIANTE_STUDIO });
  let tester: GesteSousReponse | null = null;
  if (reponseConseilleTest(o.texte)) {
    const d = designer();
    const v = d.variante;
    if (!v) tester = { raison: `${majuscule(d.phrase)}.` };
    else if (!v.rattachable && !v.essai) tester = { raison: RAISON_TESTER_FERME };
    else {
      tester = {
        libelle: LIBELLE_TESTER, href: lienTesterJarvis(v.projectId, o.contexte, o.reponse)!, varianteId: v.varianteId,
        detail: v.rattachable ? `Rattacher ${nettoyerContexteJarvis(v.nom, 40)} au test` : `Lot d’essai avec ${nettoyerContexteJarvis(v.nom, 40)}`,
      };
    }
  }
  let corriger: GesteSousReponse | null = null;
  const c = correctionDepuisReponse(o.texte);
  if (c.etat === 'plusieurs') corriger = { raison: raisonCorrigerPlusieurs(c.types) };
  else if (c.etat === 'sure') {
    const d = designer();
    corriger = d.variante
      ? { libelle: LIBELLE_CORRIGER, href: lienCorrigerJarvis(d.variante.projectId, o.contexte, o.reponse)!, varianteId: d.variante.varianteId, detail: `${c.type ? LIBELLES_TYPE_TEXTE[c.type] : 'Texte'} de ${nettoyerContexteJarvis(d.variante.nom, 40)}` }
      : { raison: `${majuscule(d.phrase)}.` };
  }
  return { tester, corriger };
}

/* ───────────────────────── l'écran d'arrivée ───────────────────────── */

export const FIN_TESTER = 'Rien n’est rattaché ni préparé sans ton clic.';
export const FIN_CORRIGER = 'Rien n’est écrit, généré ni enregistré sans ton clic · l’écriture par l’IA garde son prix annoncé avant le clic.';

export interface PreparationTesterJarvis {
  varianteId: string | null;
  mode: 'rattacher' | 'essai' | null;
  /** La variable du rattachement · celle que Jarvis désigne, si le formulaire l'admet. */
  variable: TestedVariable | null;
  /** Ce que le lot d'essai fait varier · « accroche » quand Jarvis désigne l'accroche, sinon rien. */
  essaiVariable: 'accroche' | null;
  note: string;
}

/**
 * La fiche du projet ouverte par « Tester » · la MÊME désignation, relue sur la
 * liste fermée, et la variante doit appartenir à CE projet (une adresse forgée
 * vers un autre projet est refusée). La variable n'est posée que si le
 * formulaire de rattachement l'admet (`admises`).
 */
export function preparationTesterJarvis(texte: string, o: { projectId: string; variantes: readonly VarianteEssaiJarvis[]; exclus?: readonly string[]; admises: (v: VarianteEssaiJarvis) => readonly string[] }): PreparationTesterJarvis {
  const rien = (note: string): PreparationTesterJarvis => ({ varianteId: null, mode: null, variable: null, essaiVariable: null, note });
  if (!reponseConseilleTest(texte)) return rien(`Préparé depuis Jarvis · la réponse ne conseille aucun test · rien n’est présélectionné. ${FIN_TESTER}`);
  if (!o.variantes.length) return rien(`Préparé depuis Jarvis · ${RAISON_SANS_VARIANTE_STUDIO} · rien n’est présélectionné. ${FIN_TESTER}`);
  const d = varianteDepuisReponse(texte, o.variantes, o.exclus ?? []);
  const v = d.variante;
  if (!v) return rien(`Préparé depuis Jarvis · ${d.phrase}. ${FIN_TESTER}`);
  if (v.projectId !== o.projectId.toLowerCase()) return rien(REFUS_GESTE_JARVIS);
  if (!v.rattachable && !v.essai) return rien(`Préparé depuis Jarvis · ${RAISON_TESTER_FERME} ${FIN_TESTER}`);
  const nom = nettoyerContexteJarvis(v.nom, 40);
  const designee = variableDesignee(texte);
  if (v.rattachable) {
    const variable = designee && o.admises(v).includes(designee) ? designee : null;
    return { varianteId: v.varianteId, mode: 'rattacher', variable, essaiVariable: null, note: `Préparé depuis Jarvis · ${nom}, prête à être rattachée à un test${variable ? ' · la variable que Jarvis désigne est cochée' : ''} · relis chaque champ. ${FIN_TESTER}` };
  }
  return {
    varianteId: v.varianteId, mode: 'essai', variable: null, essaiVariable: designee === 'hook' ? 'accroche' : null,
    note: `Préparé depuis Jarvis · ${nom} a déjà son test · elle est présélectionnée dans le lot d’essai, choisis les variantes à comparer. ${FIN_TESTER}`,
  };
}

export interface PreparationCorrigerJarvis {
  varianteId: string | null;
  type: TypeTexte | null;
  consigne: string | null;
  /** Le texte corrigé cité par Jarvis · posé dans le champ « Écrire à la main », jamais enregistré seul. */
  proposition: string | null;
  note: string;
}

/** L'atelier Textes ouvert par « Corriger le texte » · la même désignation, la variante dans CE projet, la consigne lue. */
export function preparationCorrigerJarvis(texte: string, o: { projectId: string; variantes: readonly VarianteEssaiJarvis[]; exclus?: readonly string[] }): PreparationCorrigerJarvis {
  const rien = (note: string): PreparationCorrigerJarvis => ({ varianteId: null, type: null, consigne: null, proposition: null, note });
  const c = correctionDepuisReponse(texte);
  if (c.etat === 'aucune') return rien(`Préparé depuis Jarvis · la réponse ne demande de corriger aucun texte · rien n’est pré-rempli. ${FIN_CORRIGER}`);
  if (c.etat === 'plusieurs') return rien(`Préparé depuis Jarvis · ${raisonCorrigerPlusieurs(c.types)} ${FIN_CORRIGER}`);
  if (!o.variantes.length) return rien(`Préparé depuis Jarvis · ${RAISON_SANS_VARIANTE_STUDIO} · rien n’est pré-rempli. ${FIN_CORRIGER}`);
  const d = varianteDepuisReponse(texte, o.variantes, o.exclus ?? []);
  if (!d.variante) return rien(`Préparé depuis Jarvis · ${d.phrase}. ${FIN_CORRIGER}`);
  if (d.variante.projectId !== o.projectId.toLowerCase()) return rien(REFUS_GESTE_JARVIS);
  const nom = nettoyerContexteJarvis(d.variante.nom, 40);
  return {
    varianteId: d.variante.varianteId, type: c.type, consigne: c.consigne, proposition: c.proposition,
    note: `Préparé depuis Jarvis pour ${nom} · ${c.proposition ? 'le texte que Jarvis propose est dans le champ « Écrire à la main », relis-le' : 'Jarvis ne cite aucun texte corrigé · écris-le d’après la consigne'}. ${FIN_CORRIGER}`,
  };
}
