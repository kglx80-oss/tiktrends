import { MAX_ESSAIS_MEME_VARIABLE, STAGE_LABEL, STRUCTURAL, VARIABLE_LABEL, VARIABLE_STAGE } from '../../adsmap/iterate';
import type { FunnelStage, TestedVariable, VerdictValue } from '../../adsmap/types';
import { estGagnanteValidee } from '../../adsmap/verdict-libelle';
import { lienNouveauProjet } from '../../studios/anciennes-adresses';
import { composerHypothese } from '../resultats/hypotheses-libres';
import type { NoeudSpatial } from '../projet/noeuds';
import { RAISON_NON_GAGNANTE } from './iterer';

/**
 * Spatial · « Nouvelle itération », étape 2 « Ce qu’on change ». Pur.
 *
 * Le plan d’itération (`iterationPlanAction`, moteur `iterate.ts`) propose UNE
 * variable par gagnante. Ce module laisse CHOISIR, sans trahir la méthode :
 *
 *  · une itération ne change qu’UNE variable · le choix est un seul identifiant,
 *    deux à la fois sont refusés en toutes lettres (`lireVariableChoisie`) ;
 *  · on ne repart que d’une gagnante PROUVÉE (verdict arbitré, comparable, arête
 *    légale) · sinon tout est fermé, avec la raison du plan ;
 *  · une variable est FERMÉE, avec sa raison écrite, quand elle est :
 *      - le témoin (rien ne change, ce n’est pas une itération) ;
 *      - structurelle (angle, désir · en changer ouvre un nouveau concept) ;
 *      - usée (la lignée l’a déjà changée `MAX_ESSAIS_MEME_VARIABLE` fois) ;
 *      - gelée (toutes les lectures du plan la tiennent fixe · c’est ce qui a
 *        gagné, et aucune ne la propose) ;
 *  · la variable proposée par défaut est celle du plan quand elle est admise,
 *    sinon la première admise dans l’ordre du tunnel.
 *
 * Le serveur rejoue cette règle avant d’écrire (`creerIterationChoisieAction`) ·
 * une variable fermée à l’écran l’est aussi pour un appel forgé.
 */

/** Les variables montrées à l’écran · l’ordre du tunnel (accroche → conversion), puis les structurelles. Le témoin n’est pas un choix. */
export const VARIABLES_ECRAN: readonly TestedVariable[] = [
  'hook', 'opening_visual', 'format', 'body', 'length', 'audio', 'avatar_on_screen', 'proof', 'cta', 'offer', 'landing', 'angle', 'desire',
];

/** Le nom d’une variable sur sa carte · sans article (les phrases prennent `VARIABLE_LABEL`). */
export const LIBELLE_CHOIX_VARIABLE: Readonly<Record<TestedVariable, string>> = {
  hook: 'Accroche', opening_visual: 'Visuel d’ouverture', format: 'Format', body: 'Corps', length: 'Durée', audio: 'Son',
  avatar_on_screen: 'Personne à l’écran', proof: 'Preuve', cta: 'Appel à l’action', offer: 'Offre', landing: 'Page de destination',
  angle: 'Angle', desire: 'Désir', none_control: 'Témoin',
};

/** Un exemple de valeur, montré en indication dans le champ · jamais enregistré. */
export const EXEMPLE_VALEUR_VARIABLE: Readonly<Record<TestedVariable, string>> = {
  hook: 'ex. la question qui nomme le problème', opening_visual: 'ex. le produit en main dès la première seconde', format: 'ex. vidéo face caméra 9:16',
  body: 'ex. démonstration en trois gestes', length: 'ex. 15 secondes', audio: 'ex. voix off au lieu de la musique', avatar_on_screen: 'ex. une cliente plutôt que la fondatrice',
  proof: 'ex. avant et après sur 14 jours', cta: 'ex. « Essaie-le 30 jours »', offer: 'ex. livraison offerte', landing: 'ex. la page produit au lieu de l’accueil',
  angle: '', desire: '', none_control: '',
};

export type MotifFermetureVariable = 'non_gagnante' | 'temoin' | 'structurelle' | 'usee' | 'gelee' | 'imposee';

export const RAISON_TEMOIN = 'Le témoin ne change rien · une itération change exactement une variable.';
export const RAISON_UNE_SEULE = 'Une itération ne change qu’une variable à la fois · choisis-en une seule.';
export const RAISON_VARIABLE_INCONNUE = 'Variable inconnue · choisis-en une dans la liste.';
export const RAISON_VALEUR_MANQUANTE = 'Écris la nouvelle valeur de cette variable · sans elle, l’itération ne dit pas ce qui change.';
export const RAISON_AUCUNE_ADMISE = 'Toutes les variables de cette lignée sont acquises ou déjà essayées · repars d’un nouveau concept, depuis Résultats.';
export const RAISON_AUTRE_MARQUE = 'Cette pub n’appartient pas à la marque active · l’itération se crée depuis sa marque.';
export const RAISON_HORS_PLAN = 'Cette pub n’est pas dans le plan d’itération de la marque · elle a déjà une suite, ou son verdict n’est pas encore arbitré.';

export const raisonStructurelle = (v: TestedVariable) => `Changer ${VARIABLE_LABEL[v]} ouvre un nouveau concept, pas une itération · la filiation ne vaut que si le terrain reste le même.`;
export const raisonUsee = (v: TestedVariable, n: number) => `Cette lignée a déjà changé ${VARIABLE_LABEL[v]} ${n} fois · un essai de plus paierait la même réponse.`;
export const raisonGelee = (v: TestedVariable) => `C’est ce qui a gagné · changer ${VARIABLE_LABEL[v]} testerait une autre pub, pas une déclinaison.`;

/** Les bornes de la valeur (colonne `variable_value`, même borne que la création d’itération d’Adsmap). */
export const VALEUR_MIN = 2;
export const VALEUR_MAX = 300;

/** Une proposition du plan pour la gagnante · ce que le moteur a lu de son verdict. */
export interface PropositionPlanVariable {
  variable: TestedVariable;
  mode: 'more' | 'better' | 'new';
  freeze: readonly TestedVariable[];
  stage: FunnelStage | null;
  edgeLegal: boolean;
}

/** La gagnante dont on part, telle que le plan la lit. */
export interface ParentIteration {
  adId: string;
  /** `null` · une pub d'inspiration (Veille), qui n'a pas de verdict dans la marque. */
  verdict: VerdictValue | null;
  comparable: boolean;
  /** Dans l’ordre du plan · la première fait foi pour le conseil. */
  propositions: readonly PropositionPlanVariable[];
  /** Les variables déjà changées par la lignée, de la plus récente à l’origine. */
  lignee: readonly TestedVariable[];
  /**
   * Une pub de la Veille prise comme source d'INSPIRATION (VB F26) · pas une
   * gagnante de la marque · voir `variablesInspiration`.
   */
  inspiration?: true;
}

export interface OptionVariable {
  variable: TestedVariable;
  libelle: string;
  /** L’étape du tunnel que la variable gouverne, en clair · `null` pour une structurelle. */
  etape: string | null;
  admise: boolean;
  /** La variable que le plan conseille (admise). */
  conseillee: boolean;
  /** Pourquoi elle est fermée · `null` quand elle est admise. */
  raison: string | null;
  motif: MotifFermetureVariable | null;
}

export interface ChoixVariablesIteration {
  adId: string;
  /** Tout est fermé · la phrase qui le dit (non gagnante, rien d’admis). */
  ferme: string | null;
  options: OptionVariable[];
  /** La variable cochée par défaut · `null` quand tout est fermé. */
  defaut: TestedVariable | null;
}

const etapeDe = (v: TestedVariable): string | null => {
  const s = VARIABLE_STAGE[v];
  if (!s) return null;
  const l = STAGE_LABEL[s].replace(/^l’|^la |^le /, '');
  return l.charAt(0).toUpperCase() + l.slice(1);
};

/** Les variables admises pour une gagnante, et pourquoi chacune des autres ne l’est pas. */
export function variablesIteration(p: ParentIteration): ChoixVariablesIteration {
  // Une pub d'inspiration n'a pas de verdict dans la marque · elle n'a rien à
  // prouver, puisqu'on n'en DÉCLINE pas une gagnante (aucune filiation) · on en
  // reprend la structure en remplaçant une variable.
  const gagnante = p.inspiration === true || (estGagnanteValidee(p.verdict, p.comparable) && p.propositions.some((x) => x.edgeLegal));
  const usage = (v: TestedVariable) => p.lignee.filter((x) => x === v).length;
  const proposee = new Set(p.propositions.map((x) => x.variable));
  const conseil = p.propositions[0]?.variable ?? null;

  const options: OptionVariable[] = VARIABLES_ECRAN.map((v) => {
    const base = { variable: v, libelle: LIBELLE_CHOIX_VARIABLE[v], etape: etapeDe(v) };
    const ferme = (motif: MotifFermetureVariable, raison: string): OptionVariable => ({ ...base, admise: false, conseillee: false, raison, motif });
    if (!gagnante) return ferme('non_gagnante', RAISON_NON_GAGNANTE);
    if (v === 'none_control') return ferme('temoin', RAISON_TEMOIN);
    if (STRUCTURAL.includes(v)) return ferme('structurelle', p.inspiration ? raisonStructurelleInspiration(v) : raisonStructurelle(v));
    if (p.inspiration && v === 'landing') return ferme('imposee', RAISON_DESTINATION_INSPIRATION);
    const n = usage(v);
    if (n >= MAX_ESSAIS_MEME_VARIABLE) return ferme('usee', raisonUsee(v, n));
    if (!proposee.has(v) && p.propositions.length > 0 && p.propositions.every((x) => x.freeze.includes(v))) return ferme('gelee', raisonGelee(v));
    return { ...base, admise: true, conseillee: false, raison: null, motif: null };
  });

  const admises = options.filter((o) => o.admise);
  // Le défaut · la première proposition du plan qui reste admise, sinon la première admise dans l'ordre du tunnel.
  const defaut = p.propositions.map((x) => x.variable).find((v) => admises.some((o) => o.variable === v))
    ?? admises[0]?.variable
    ?? null;
  for (const o of options) o.conseillee = o.admise && o.variable === defaut && defaut === conseil;
  return {
    adId: p.adId,
    ferme: !gagnante ? RAISON_NON_GAGNANTE : admises.length === 0 ? RAISON_AUCUNE_ADMISE : null,
    options,
    defaut,
  };
}

const TOUTES = new Set<string>([...VARIABLES_ECRAN, 'none_control']);

/** Le choix reçu (formulaire, appel serveur) · UNE variable connue, sinon la raison. */
export function lireVariableChoisie(x: unknown): { ok: true; variable: TestedVariable } | { ok: false; raison: string } {
  if (Array.isArray(x)) return { ok: false, raison: x.length > 1 ? RAISON_UNE_SEULE : RAISON_VARIABLE_INCONNUE };
  if (typeof x !== 'string') return { ok: false, raison: RAISON_VARIABLE_INCONNUE };
  const t = x.trim();
  const morceaux = t.split(/[\s,;+&|/]+/).filter(Boolean);
  if (morceaux.length > 1) return { ok: false, raison: morceaux.filter((m) => TOUTES.has(m)).length > 1 ? RAISON_UNE_SEULE : RAISON_VARIABLE_INCONNUE };
  return TOUTES.has(t) ? { ok: true, variable: t as TestedVariable } : { ok: false, raison: RAISON_VARIABLE_INCONNUE };
}

/** La nouvelle valeur de la variable · obligatoire, bornée. */
export function lireValeurVariable(x: unknown): { ok: true; valeur: string } | { ok: false; raison: string } {
  const t = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
  if (t.length < VALEUR_MIN) return { ok: false, raison: RAISON_VALEUR_MANQUANTE };
  return { ok: true, valeur: t.slice(0, VALEUR_MAX) };
}

/** Ce que le serveur écrit pour un choix · ou la raison du refus (la même qu’à l’écran). */
export function verifierChoixVariable(choix: ChoixVariablesIteration, p: ParentIteration, variable: TestedVariable):
  { ok: true; mode: 'more' | 'better' | 'new'; etape: FunnelStage | null } | { ok: false; raison: string } {
  if (choix.ferme && choix.ferme !== RAISON_AUCUNE_ADMISE) return { ok: false, raison: choix.ferme };
  if (variable === 'none_control') return { ok: false, raison: RAISON_TEMOIN };
  const o = choix.options.find((x) => x.variable === variable);
  if (!o) return { ok: false, raison: RAISON_VARIABLE_INCONNUE };
  if (!o.admise) return { ok: false, raison: o.raison ?? RAISON_VARIABLE_INCONNUE };
  const prop = p.propositions.find((x) => x.variable === variable);
  // Hors proposition, on DÉCLINE la gagnante (on ne corrige rien) · l’étape visée est celle que la variable gouverne.
  return { ok: true, mode: prop?.mode ?? 'more', etape: prop?.stage ?? VARIABLE_STAGE[variable] ?? null };
}

/** L’hypothèse proposée par défaut · « si… alors… parce que », modifiable. */
export function hypotheseParDefaut(e: { titre: string; variable: TestedVariable; valeur: string }): string {
  const v = e.valeur.replace(/\s+/g, ' ').trim();
  return `Si on change seulement ${VARIABLE_LABEL[e.variable]} de ${e.titre}${v ? ` (${v})` : ''}, alors elle fera au moins aussi bien, parce que tout ce qui a gagné reste intact.`;
}

/** Une ligne du plan d’itération (`IterationRow`), ce que la règle en lit. */
export interface LignePlanVariable {
  adId: string;
  changedVariable: TestedVariable;
  mode: 'more' | 'better' | 'new';
  freeze: readonly TestedVariable[];
  stageTargeted: FunnelStage | null;
  edgeLegal: boolean;
  parentVerdict: VerdictValue;
  parentComparable: boolean;
  lineageChanged?: readonly TestedVariable[];
}

/** La gagnante telle que le plan la lit (toutes ses propositions) · `null` quand elle n’y est pas. */
export function parentDepuisPlan(rows: readonly LignePlanVariable[], adId: string): ParentIteration | null {
  const lignes = rows.filter((r) => r.adId === adId);
  const r0 = lignes[0];
  if (!r0) return null;
  return {
    adId,
    verdict: r0.parentVerdict,
    comparable: r0.parentComparable,
    propositions: lignes.map((r) => ({ variable: r.changedVariable, mode: r.mode, freeze: r.freeze, stage: r.stageTargeted, edgeLegal: r.edgeLegal })),
    lignee: r0.lineageChanged ?? [],
  };
}

/** Les choix de variables de chaque pub du plan · une entrée par pub. */
export function variablesDuPlan(rows: readonly LignePlanVariable[]): Record<string, ChoixVariablesIteration> {
  const out: Record<string, ChoixVariablesIteration> = {};
  for (const r of rows) {
    if (out[r.adId]) continue;
    out[r.adId] = variablesIteration(parentDepuisPlan(rows, r.adId)!);
  }
  return out;
}

export const PARAM_VARIABLE_ITERATION = 'variable';

/** L’adresse de l’écran Itérer, pub et variable présélectionnées (chacune facultative). */
export function lienIterationVariable(o: { adId?: string | null; variable?: TestedVariable | null } = {}): string {
  const p = new URLSearchParams();
  if (o.adId && /^[0-9a-f-]{36}$/i.test(o.adId)) p.set('iter', o.adId.toLowerCase());
  if (o.variable && VARIABLES_ECRAN.includes(o.variable)) p.set(PARAM_VARIABLE_ITERATION, o.variable);
  const q = p.toString();
  return q ? `/studio/iterer?${q}` : '/studio/iterer';
}

/** La variable demandée par l’adresse · retenue seulement si c’est une variable de l’écran. */
export function lireVariableDemandee(sp: Record<string, string | string[] | undefined>): TestedVariable | null {
  const v = sp[PARAM_VARIABLE_ITERATION];
  const t = (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
  return (VARIABLES_ECRAN as readonly string[]).includes(t) ? (t as TestedVariable) : null;
}

/** La variable cochée à l’ouverture · celle demandée si elle est admise, sinon le défaut, avec la phrase qui dit pourquoi. */
export function variableInitiale(c: ChoixVariablesIteration, demande: TestedVariable | null): { variable: TestedVariable | null; note: string | null } {
  if (!demande) return { variable: c.defaut, note: null };
  const o = c.options.find((x) => x.variable === demande);
  if (o?.admise) return { variable: demande, note: null };
  return { variable: c.defaut, note: `${LIBELLE_CHOIX_VARIABLE[demande]} n’est pas admise pour cette pub · ${o?.raison ?? RAISON_VARIABLE_INCONNUE}` };
}

/**
 * La préparation du projet de l’itération créée · la reprise RÉELLE du brief
 * (`lienIterationStudio`, test parent), avec la variable choisie et sa valeur
 * en objectif. Le devis vient dans le projet, calculé par le serveur.
 */
export function lienPreparationIteration(e: { parentAdId: string; code: string; variable: TestedVariable; valeur: string }): string {
  return lienNouveauProjet({ type: 'ads', iter: e.parentAdId, angle: `Itération ${e.code} · on change ${VARIABLE_LABEL[e.variable]} : ${e.valeur}` });
}

/** Ce que dit l’écran une fois l’itération créée · rien n’est généré ni débité. */
export const APRES_CREATION_ITERATION = 'Rien n’a été généré ni débité. Le devis de génération est calculé par le serveur dans le projet, avant tout lancement.';

/* ───────────── Les autres départs · un prompt conseillé, le couloir Itération, la boucle des lots ───────────── */

/** « Lancer comme itération » depuis un prompt conseillé · seulement s’il vise une variable. */
export function iterationDepuisPrompt(variable: TestedVariable | null | undefined): { href: string; raison: null } | { href: null; raison: string } {
  if (variable && VARIABLES_ECRAN.includes(variable) && !STRUCTURAL.includes(variable)) return { href: lienIterationVariable({ variable }), raison: null };
  return { href: null, raison: 'Ce prompt ne vise aucune variable · une itération en change exactement une.' };
}

/** Une variante du projet et son test Adsmap, ce que le couloir Itération en lit. */
export interface VarianteTestee {
  id: string;
  libelle: string;
  test: { adsmapAdId: string; verdict: { validated: VerdictValue | null; comparable: boolean } | null } | null;
}

export const VIDE_ITERATION_SANS_GAGNANTE = 'Aucune gagnante arbitrée au protocole dans ce projet · l’itération part d’une gagnante.';
export const VIDE_ITERATION_SANS_ADSMAP = 'Résultats n’est pas ouvert à ton offre ou à ton rôle · l’itération part d’un verdict de Résultats.';

/**
 * Le couloir « Itération » de la fiche projet · un nœud par variante testée
 * GAGNANTE (verdict arbitré, comparable), dont le geste ouvre l’écran Itérer,
 * pub présélectionnée, où l’on choisit la variable. Sinon la phrase qui dit
 * pourquoi le couloir n’offre rien.
 */
export function noeudsIterationProjet(variantes: readonly VarianteTestee[], o: { adsmap: boolean }): { noeuds: NoeudSpatial[]; vide: string | null } {
  const testees = variantes.filter((v) => v.test);
  if (!testees.length) return { noeuds: [], vide: null };
  if (!o.adsmap) return { noeuds: [], vide: VIDE_ITERATION_SANS_ADSMAP };
  const vus = new Set<string>();
  const noeuds: NoeudSpatial[] = [];
  for (const v of testees) {
    const t = v.test!;
    if (vus.has(t.adsmapAdId) || !estGagnanteValidee(t.verdict?.validated, !!t.verdict?.comparable)) continue;
    vus.add(t.adsmapAdId);
    noeuds.push({
      id: `iterer:${t.adsmapAdId}`, etiquette: 'ITÉRATION', classe: '', apercu: null,
      titre: `À décliner · ${v.libelle}`,
      texte: 'Gagnante arbitrée au protocole · choisis la variable à changer, une seule à la fois.',
      phrase: null, barres: [], pied: null,
      pastille: { classe: 'g', libelle: 'Gagnante' },
      lien: { href: lienIterationVariable({ adId: t.adsmapAdId }), libelle: 'Itérer · choisir la variable', forme: 'bouton' },
      perdant: false,
    });
  }
  return { noeuds, vide: noeuds.length ? null : VIDE_ITERATION_SANS_GAGNANTE };
}

/** Le bouton de boucle des lots · « Itérer · N itérations conseillées », compté sur les gagnantes PROUVÉES du plan réel. */
export function boucleIterationLots(rows: readonly Pick<LignePlanVariable, 'adId' | 'edgeLegal' | 'parentVerdict' | 'parentComparable'>[]):
  { libelle: string; href: string; raison: null } | { libelle: string; href: null; raison: string } {
  const n = new Set(rows.filter((r) => r.edgeLegal && estGagnanteValidee(r.parentVerdict, r.parentComparable)).map((r) => r.adId)).size;
  if (!n) return { libelle: 'Itérer', href: null, raison: 'Aucune gagnante arbitrée à décliner pour l’instant · le plan se remplit au premier verdict validé.' };
  return { libelle: `Itérer · ${n} itération${n > 1 ? 's' : ''} conseillée${n > 1 ? 's' : ''}`, href: lienIterationVariable(), raison: null };
}

/** La pub demandée par l’adresse (couloir Itération, lien partagé) qui ne peut pas être reprise · la phrase qui le dit, sinon `null`. */
export function noteDemandeIteration(choix: ReadonlyArray<{ adId: string; selectionnable: boolean; raison: string }>, demande: string | null | undefined): string | null {
  if (!demande) return null;
  const c = choix.find((x) => x.adId === demande.toLowerCase());
  if (c?.selectionnable) return null;
  return `La pub demandée ne peut pas être itérée ici · ${c ? c.raison : RAISON_HORS_PLAN}`;
}

/* ───────────── Une pub de la Veille comme source d’inspiration (VB F26) ───────────── */

/**
 * Itérer « à partir » d’une pub de la Veille · je GARDE sa structure, je
 * REMPLACE une seule variable. La règle est la MÊME (`variablesIteration`) ·
 * ce qui change pour une pub concurrente, qui n’a pas de verdict dans la marque :
 *
 *  · rien n’est fermé faute de verdict · on n’en décline pas une gagnante (pas
 *    d’arête de filiation), on en reprend la structure ;
 *  · ni lignée ni plan · « usée » et « gelée » ne s’appliquent pas, aucune
 *    variable n’est « conseillée » · le défaut est la première admise dans
 *    l’ordre du tunnel (l’accroche) ;
 *  · le témoin reste fermé (rien ne change), angle et désir restent fermés
 *    (en changer ne garde plus rien de la pub) ;
 *  · la page de destination est fermée · elle sera de toute façon celle de la
 *    marque, c’est un prérequis du test, pas la variable qu’on remplace.
 *
 * Le serveur rejoue cette règle (`creerIterationChoisieAction`, source Veille).
 */
export const RAISON_DESTINATION_INSPIRATION = 'La page de destination sera de toute façon la tienne · elle se pose avant le test, ce n’est pas la variable qu’on remplace.';
export const raisonStructurelleInspiration = (v: TestedVariable) => `Remplacer ${VARIABLE_LABEL[v]} ne garderait plus rien de cette pub · on garde sa structure et on remplace une seule variable.`;
export const RAISON_DEUX_SOURCES = 'Une itération part d’une seule source · une pub de ta marque ou une pub de la Veille, pas les deux.';
export const RAISON_VEILLE_ILLISIBLE = 'Pub de la Veille illisible · rouvre-la depuis la Veille puis réessaie.';
export const RAISON_VEILLE_NON_GARDEE = 'Garde d’abord la pub dans tes sauvegardes · l’itération en garde la source.';
export const RAISON_VEILLE_AUTRE_MARQUE = 'Cette pub est sauvegardée pour une autre marque de l’espace · ouvre cette marque pour itérer à partir d’elle.';

/** Les plateformes de la Veille (mêmes que la sauvegarde et le pont Adsmap). */
const PLATEFORMES_VEILLE = new Set(['meta', 'tiktok', 'google']);
const ID_EXTERNE_MAX = 300;

export interface RefInspiration { platform: 'meta' | 'tiktok' | 'google'; externalId: string }

/** La pub de la Veille désignée (écran, appel serveur) · plateforme connue, identifiant borné. */
export function lireInspiration(x: unknown): { ok: true; ref: RefInspiration } | { ok: false; raison: string } {
  const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
  const platform = typeof o?.platform === 'string' ? o.platform : '';
  const externalId = typeof o?.externalId === 'string' ? o.externalId.trim() : '';
  if (!PLATEFORMES_VEILLE.has(platform) || !externalId || externalId.length > ID_EXTERNE_MAX) return { ok: false, raison: RAISON_VEILLE_ILLISIBLE };
  return { ok: true, ref: { platform: platform as RefInspiration['platform'], externalId } };
}

/** La source telle que la règle la lit · sans verdict, sans plan, sans lignée. */
export function parentInspiration(cle: string): ParentIteration {
  return { adId: cle, verdict: null, comparable: false, propositions: [], lignee: [], inspiration: true };
}

/** Les variables admises quand on part d’une pub de la Veille (la même règle, adaptée · voir plus haut). */
export function variablesInspiration(cle: string): ChoixVariablesIteration {
  return variablesIteration(parentInspiration(cle));
}

/** « Je garde · … / Je remplace · … » · ce que la pub garde et la SEULE variable remplacée (admises seulement). */
export function gardeRemplace(c: ChoixVariablesIteration, variable: TestedVariable | null): { garde: string[]; remplace: string | null } {
  const o = variable ? c.options.find((x) => x.variable === variable && x.admise) : undefined;
  return {
    garde: c.options.filter((x) => x.admise && x.variable !== o?.variable).map((x) => x.libelle),
    remplace: o?.libelle ?? null,
  };
}

/**
 * L’hypothèse proposée pour une pub de la Veille · seulement ce que le geste
 * dit (on reprend CETTE pub, on remplace CETTE variable) · ni résultat attendu
 * ni raison inventés, la pub concurrente n’a rien prouvé dans la marque.
 */
export function hypotheseInspirationParDefaut(e: { annonceur: string | null | undefined; variable: TestedVariable; valeur: string }): string {
  const a = (e.annonceur ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const v = e.valeur.replace(/\s+/g, ' ').trim();
  // Une valeur déjà entre guillemets (« Essaie-le 30 jours ») n'en reçoit pas une deuxième paire.
  const cite = /^[«"“].*[»"”]$/u.test(v) ? v : `« ${v} »`;
  return composerHypothese({ si: `on reprend la pub de ${a || 'cet annonceur'} en remplaçant seulement ${VARIABLE_LABEL[e.variable]}${v ? ` par ${cite}` : ''}` });
}

export const PARAM_VEILLE_PLATEFORME = 'veille';
export const PARAM_VEILLE_PUB = 'pub';

/** L’adresse de l’écran Itérer, une pub de la Veille en source. */
export function lienIterationVeille(r: { platform: string; externalId: string }): string {
  const l = lireInspiration(r);
  if (!l.ok) return '/studio/iterer';
  const p = new URLSearchParams({ [PARAM_VEILLE_PLATEFORME]: l.ref.platform, [PARAM_VEILLE_PUB]: l.ref.externalId });
  return `/studio/iterer?${p.toString()}`;
}

/** La pub de la Veille demandée par l’adresse · `null` sans demande ou si elle est illisible. */
export function lireInspirationDemandee(sp: Record<string, string | string[] | undefined>): RefInspiration | null {
  const un = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ''; };
  if (!un(PARAM_VEILLE_PLATEFORME) && !un(PARAM_VEILLE_PUB)) return null;
  const l = lireInspiration({ platform: un(PARAM_VEILLE_PLATEFORME), externalId: un(PARAM_VEILLE_PUB) });
  return l.ok ? l.ref : null;
}

/**
 * La préparation du projet après création · la reprise RÉELLE d’une pub de la
 * Veille (mode clone de la préparation · `ref` = la sauvegarde, la structure est
 * gardée), avec la variable remplacée en consigne.
 */
export function lienPreparationInspiration(e: { savedAdId: string; source: { cle: string; nom: string } | null; video: boolean; code: string; variable: TestedVariable; valeur: string }): string {
  return lienNouveauProjet({
    type: e.video ? 'video' : 'ads', ref: e.savedAdId, src: e.source?.cle ?? null, srcnom: e.source?.nom ?? null,
    angle: `Itération ${e.code} · je garde la structure de la pub, je remplace ${VARIABLE_LABEL[e.variable]} : ${e.valeur}`,
  });
}
