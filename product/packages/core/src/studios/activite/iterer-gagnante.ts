import type { VerdictValue } from '../../adsmap/types';
import { estGagnanteValidee } from '../../adsmap/verdict-libelle';
import { RAISON_ROLE_ITERATION, choixIterationSpatial, type LignePlanSpatial } from '../../spatial/studios/iterer';
import { RAISON_HORS_PLAN, type ChoixVariablesIteration } from '../../spatial/studios/iterer-variable';
import { CLE_PROVENANCE_COMMENTAIRE, CLE_PROVENANCE_NOTE, resultatHypothese, type ProvenanceCommentaire, type ProvenanceNote } from '../../spatial/resultats/boucle-preuve';
import { gagnanteArbitree } from '../../spatial/jarvis/gestes';
import type { EtatLotSpatial, FaitsAdSpatial } from '../../spatial/resultats/lots';
import type { LectureConclusion } from '../../spatial/resultats/conclusion-lot';
import type { FaitsHypotheseAd } from '../../spatial/resultats/ecrans';
import { lienIterationFil, type FilIteration, type GesteIterationCommentaire } from './iterer-commentaire';
import { resultatsFil, type IterationDuFil, type ResultatFil } from './resultat-fil';

/**
 * Studios · « Itérer depuis la gagnante » · enchaîner l'itération suivante
 * depuis une itération CONFIRMÉE, sous le fil d'où elle est née (un
 * commentaire de l'onglet Activité ou une note de la lignée · #1079).
 * Pur · ni base, ni réseau, ni modèle, ni horloge.
 *
 * Quand proposer · sous un résultat CONFIRMÉ seulement (`resultatsFil` ·
 * `etat: 'conclue'`, `statut: 'confirmee'`, la conclusion du lot calculée à
 * chaque lecture) · infirmée, sans conclusion, en test · aucun geste. Résultats
 * fermé · `resultatsFil` ne dit rien, il n'y a pas de résultat sous lequel le
 * poser. Fermé, la raison écrite à côté :
 *  · la marque du projet n'est pas la marque active (l'écran Itérer se lit
 *    dans la marque active, comme « Voir le lot ») ;
 *  · le rôle ne permet pas de créer l'itération (`studio.propose`, la porte de
 *    l'écran Itérer · `RAISON_ROLE_ITERATION`, la phrase de l'écran) ;
 *  · la variante de l'itération n'est pas une gagnante ARBITRÉE au protocole
 *    (un lot peut confirmer son hypothèse sans que CETTE variante gagne · une
 *    itération part d'une gagnante, `estGagnanteValidee`).
 *
 * Le geste est une NAVIGATION · il ouvre l'écran Itérer EXISTANT sur
 * `?commentaire=<uuid>&projet=<uuid>&gagnante=<uuid>` (ou `?note=…`) · rien
 * n'est créé avant le clic « Créer l'itération » là-bas. L'écran relit le fil
 * dans la portée, puis la gagnante parmi les itérations CONFIRMÉES nées de ce
 * fil (même lecture que sous le fil) · refus muet sinon.
 *
 * Provenance · l'itération créée porte la provenance du fil d'origine (même
 * forme que #1066 / #1078 · `source_ref_json.commentaire` ou `.note`,
 * identifiants seuls) et, en plus, l'identifiant de la gagnante dont elle part
 * (`gagnanteAdId`, dans le même objet · JSON existant, aucune migration) ·
 * posée par le serveur seulement si la pub de départ est la pub du fil ou une
 * gagnante confirmée relue de ce fil (`provenanceFilDepuisGagnanteAdmise`).
 * Sous le fil, l'itération qui en naît dit « née de la gagnante V7 ».
 */

export const PARAM_GAGNANTE_ITERATION = 'gagnante';
export const LIBELLE_ITERER_GAGNANTE = 'Itérer depuis la gagnante';
/** La clé ajoutée dans l'objet de provenance du fil · l'ad gagnante dont l'itération part. */
export const CLE_GAGNANTE_FIL = 'gagnanteAdId';

export const RAISON_GAGNANTE_AUTRE_MARQUE = 'Ce projet n’est pas dans ta marque active · ouvre sa marque pour itérer depuis la gagnante.';
export const RAISON_GAGNANTE_NON_ARBITREE = 'Le lot confirme l’hypothèse, mais cette variante n’est pas une gagnante arbitrée au protocole · une itération part d’une gagnante.';

export const REFUS_GAGNANTE: Readonly<Record<FilIteration, string>> = {
  commentaire: 'Cette pub n’est pas une itération confirmée née de ce commentaire · rien n’est présélectionné.',
  note: 'Cette pub n’est pas une itération confirmée née de cette note · rien n’est présélectionné.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
const premiere = (v: string | readonly string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) as string | undefined;

/** Le verdict de l'itération confirmée · `null` sans verdict lu. */
export type VerdictGagnante = { validated: VerdictValue | null; comparable: boolean } | null;

/** L'adresse de l'écran Itérer parti de la gagnante d'un fil · `null` si un identifiant est mal formé. */
export function lienIterationGagnante(fil: FilIteration, o: { id: string; projetId: string; adId: string }): string | null {
  const base = lienIterationFil(fil, { id: o.id, projetId: o.projetId });
  const a = uuid(o.adId);
  if (!base || !a) return null;
  return `${base}&${new URLSearchParams({ [PARAM_GAGNANTE_ITERATION]: a }).toString()}`;
}

/**
 * Le geste sous UN résultat · `null` sauf sous un résultat CONFIRMÉ (ou
 * l'adresse ne peut pas s'écrire) · fermé avec sa raison hors de la marque
 * active, sans le rôle, ou quand la variante n'est pas une gagnante arbitrée.
 */
export function gesteIterationGagnante(
  fil: FilIteration, r: ResultatFil,
  o: { id: string; projetId: string; marqueActive: boolean; peutIterer: boolean; verdict: VerdictGagnante; plan?: EtatPlanGagnante | null },
): GesteGagnante | null {
  if (r.etat !== 'conclue' || r.statut !== 'confirmee') return null;
  return gesteDepuisGagnante(() => lienIterationGagnante(fil, { id: o.id, projetId: o.projetId, adId: r.adId }), o);
}

/**
 * Les gestes des résultats d'UN fil, par ad · seulement les résultats
 * confirmés en ont un · `{}` sinon (rien n'est ajouté à l'écran). `plan` · ce
 * que le plan d'itération et la lignée disent de chaque gagnante (lu sans
 * écriture · `etatPlanGagnante`) · absent, rien n'est signalé.
 */
export function gestesGagnantesFil(
  fil: FilIteration, resultats: readonly ResultatFil[], iterations: readonly IterationDuFil[],
  o: { id: string; projetId: string; marqueActive: boolean; peutIterer: boolean; plan?: PlanDesGagnantes | null },
): Record<string, GesteGagnante> {
  const verdicts = new Map(iterations.map((i) => [i.adId.toLowerCase(), i.verdict ?? null]));
  const out: Record<string, GesteGagnante> = {};
  for (const r of resultats) {
    const g = gesteIterationGagnante(fil, r, { ...o, verdict: verdicts.get(r.adId.toLowerCase()) ?? null, plan: o.plan?.(r.adId) ?? null });
    if (g) out[r.adId] = g;
  }
  return out;
}

/** Une gagnante confirmée née d'un fil · son ad et son code de variante. */
export interface GagnanteDuFil { adId: string; variante: string }

/**
 * Les itérations CONFIRMÉES nées d'un fil · la règle de l'écran (`resultatsFil`,
 * la conclusion du lot) · relue par l'écran Itérer et par l'action avant de
 * poser la provenance · rien d'autre ne compte.
 */
export function gagnantesConfirmees(iterations: readonly IterationDuFil[]): GagnanteDuFil[] {
  return resultatsFil(iterations, { resultats: true, marqueActive: true })
    .filter((r) => r.etat === 'conclue' && r.statut === 'confirmee')
    .map((r) => ({ adId: r.adId.toLowerCase(), variante: r.variante }));
}

export type DemandeGagnante = { etat: 'absente' } | { etat: 'refus' } | { etat: 'ok'; adId: string };

/** `?gagnante=<uuid>` lu · absente sans lui, refusée s'il est mal formé ou donné deux fois · rien n'est deviné. */
export function lireGagnanteDemandee(sp: Readonly<Record<string, string | readonly string[] | undefined>>): DemandeGagnante {
  const brut = sp[PARAM_GAGNANTE_ITERATION];
  if (brut === undefined) return { etat: 'absente' };
  if (Array.isArray(brut) && brut.length !== 1) return { etat: 'refus' };
  const a = uuid(premiere(brut));
  return a ? { etat: 'ok', adId: a } : { etat: 'refus' };
}

export interface DepartIterationGagnante {
  adId: string;
  /** Pas de texte repris · le fil a déjà été testé, sa phrase est confirmée · l'écran propose son hypothèse par défaut. */
  hypothese: null;
  /** La variable cochée par défaut par le plan de la gagnante · `null` hors plan ou tout fermé. */
  variable: ChoixVariablesIteration['defaut'];
  note: string;
}

/** La variable cochée par défaut (celle du plan de la gagnante) et la phrase qui le dit · partagées par chaque départ depuis une gagnante. */
function variableDuPlan(choix: ChoixVariablesIteration | null): { variable: ChoixVariablesIteration['defaut']; suite: string } {
  const variable = choix && !choix.ferme ? choix.defaut : null;
  return { variable, suite: variable ? 'la variable proposée est celle du plan, modifiable' : 'choisis la variable à l’étape « Ce qu’on change »' };
}

/** Le départ de l'écran Itérer depuis la gagnante d'un fil · la gagnante présélectionnée, la phrase qui le dit. */
export function departDepuisGagnante(fil: FilIteration, g: GagnanteDuFil, choix: ChoixVariablesIteration | null): DepartIterationGagnante {
  const de = fil === 'commentaire' ? 'de ce commentaire' : 'de cette note';
  const { variable, suite } = variableDuPlan(choix);
  return {
    adId: g.adId, hypothese: null, variable,
    note: `Itération depuis la gagnante ${g.variante}, confirmée et née ${de} · ${suite} · la nouvelle itération gardera la provenance ${de}. Rien n’est créé sans ton clic sur « Créer l’itération ».`,
  };
}

/**
 * La provenance d'un fil, admise pour une pub de départ · la pub du fil
 * (la règle de #1063 / #1078, `gagnante: null`) ou une gagnante CONFIRMÉE
 * relue de ce fil (`gagnante` · son ad) · `null` sinon · l'itération naît
 * ordinaire. Le fil doit avoir été RELU (`adDuFil` non nul).
 */
export function provenanceFilDepuisGagnanteAdmise<T>(
  demande: T | null, lu: { adDuFil: string | null; gagnantes: readonly string[]; parentAdId: string },
): { provenance: T; gagnante: string | null } | null {
  if (!demande || !lu.adDuFil) return null;
  const p = lu.parentAdId.toLowerCase();
  if (lu.adDuFil.toLowerCase() === p) return { provenance: demande, gagnante: null };
  return lu.gagnantes.some((g) => g.toLowerCase() === p) ? { provenance: demande, gagnante: p } : null;
}

/** La valeur à fusionner dans `source_ref_json` · la même forme que le fil, plus la gagnante quand il y en a une. */
export function refProvenanceFilGagnante(p: { fil: 'commentaire'; provenance: ProvenanceCommentaire } | { fil: 'note'; provenance: ProvenanceNote }, gagnante: string | null): Record<string, unknown> {
  const g = uuid(gagnante);
  const plus = g ? { [CLE_GAGNANTE_FIL]: g } : {};
  return p.fil === 'commentaire'
    ? { [CLE_PROVENANCE_COMMENTAIRE]: { commentaireId: p.provenance.commentaireId, projetId: p.provenance.projetId, ...plus } }
    : { [CLE_PROVENANCE_NOTE]: { noteId: p.provenance.noteId, projetId: p.provenance.projetId, ...plus } };
}

/** La gagnante dont une itération du fil est partie · `null` sans elle (ou JSON abîmé). */
export function lireGagnanteDuFil(sourceRef: unknown, fil: FilIteration): string | null {
  if (!sourceRef || typeof sourceRef !== 'object') return null;
  const o = (sourceRef as Record<string, unknown>)[fil === 'commentaire' ? CLE_PROVENANCE_COMMENTAIRE : CLE_PROVENANCE_NOTE];
  if (!o || typeof o !== 'object') return null;
  return uuid((o as Record<string, unknown>)[CLE_GAGNANTE_FIL]);
}

/** « née de la gagnante V7 » · sous le fil, l'itération partie d'une gagnante. */
export const phraseNeeDeGagnante = (variante: string) => `née de la gagnante ${variante}`;


/* ───────────────────────── la règle, une fois pour tous les départs ───────────────────────── */

/** Le geste, avec ce que le plan en dit à l'avance (`signal` · « Déjà une suite en test · V12 ») · absent sans rien à dire. */
export type GesteGagnante = GesteIterationCommentaire & { signal?: string };

/**
 * Ce que le plan d'itération de la marque et la lignée disent d'UNE gagnante,
 * lus sans écriture · `exclue` · la raison du plan quand il ne la propose pas
 * (la phrase de l'écran Itérer pour une piste fermée, ou celle de « Créer
 * l'itération » pour une pub hors plan) · `suiteEnTest` · le code de la
 * première itération née d'elle encore sans verdict arbitré.
 */
export interface EtatPlanGagnante { exclue: string | null; suiteEnTest: string | null }
export type PlanDesGagnantes = (adId: string) => EtatPlanGagnante | null;

/** Une itération née d'une ad (arête de filiation existante) · son code et si son verdict est ARBITRÉ. */
export interface SuiteNee { parentAdId: string; variante: string; arbitree: boolean }

export const phraseSuiteEnTest = (variante: string) => `Déjà une suite en test · ${variante}`;

/**
 * L'état d'une gagnante dans le plan · la ligne du plan relue par la règle de
 * l'écran (`choixIterationSpatial` · sa raison quand la piste est fermée), hors
 * plan · `RAISON_HORS_PLAN` (la phrase de « Créer l'itération ») · la suite en
 * test · la plus petite variante née d'elle sans verdict arbitré. Le rôle n'est
 * pas lu ici (le geste le dit avant).
 */
export function etatPlanGagnante(adId: string, f: { plan: readonly LignePlanSpatial[]; suites: readonly SuiteNee[] }): EtatPlanGagnante {
  const a = adId.toLowerCase();
  const ligne = f.plan.find((r) => r.adId.toLowerCase() === a);
  const choix = ligne ? choixIterationSpatial([ligne], () => undefined, { peutIterer: true })[0] : undefined;
  const enTest = f.suites.filter((x) => x.parentAdId.toLowerCase() === a && !x.arbitree).map((x) => x.variante)
    .sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));
  return { exclue: !choix ? RAISON_HORS_PLAN : choix.selectionnable ? null : choix.raison, suiteEnTest: enTest[0] ?? null };
}

/**
 * LA règle du geste, quel que soit son départ (le fil d'un commentaire ou
 * d'une note, la fiche d'un lot conclu, la carte d'une hypothèse confirmée) ·
 * fermé, dans cet ordre · autre marque active, rôle sans `studio.propose`,
 * variante qui n'est pas une gagnante arbitrée, puis la raison du plan quand il
 * l'exclut · une suite déjà en test est SIGNALÉE (ouvert ou fermé) · `null`
 * quand l'adresse ne s'écrit pas.
 */
function gesteDepuisGagnante(
  href: () => string | null,
  o: { marqueActive: boolean; peutIterer: boolean; verdict: VerdictGagnante; plan?: EtatPlanGagnante | null },
): GesteGagnante | null {
  const libelle = LIBELLE_ITERER_GAGNANTE;
  if (!o.marqueActive) return { libelle, href: null, raison: RAISON_GAGNANTE_AUTRE_MARQUE };
  if (!o.peutIterer) return { libelle, href: null, raison: RAISON_ROLE_ITERATION };
  if (!estGagnanteValidee(o.verdict?.validated ?? null, !!o.verdict?.comparable)) return { libelle, href: null, raison: RAISON_GAGNANTE_NON_ARBITREE };
  const h = href();
  if (!h) return null;
  const signal = o.plan?.suiteEnTest ? { signal: phraseSuiteEnTest(o.plan.suiteEnTest) } : {};
  if (o.plan?.exclue) return { libelle, href: null, raison: o.plan.exclue, ...signal };
  return { libelle, href: h, raison: null, ...signal };
}

/* ───────────────────────── depuis la fiche d'un lot conclu, la carte d'une hypothèse confirmée ───────────────────────── */

/**
 * Hors d'un fil · le même geste part de la FICHE d'un lot conclu (chaque
 * variante arbitrée gagnante) et de la CARTE d'une hypothèse confirmée (la
 * gagnante du lot qui l'a confirmée) · `?lot=<uuid>&gagnante=<uuid>` ou
 * `?hypothese=<uuid>&gagnante=<uuid>` · l'écran Itérer EXISTANT relit le lot
 * (ou la carte) dans la marque active, puis la gagnante par CETTE règle · rien
 * n'est cru de l'adresse.
 *
 * Provenance · aucune provenance « Lot » ni « Hypothèse » n'existe au bilan ·
 * l'itération y compte, comme toute itération, dans « Itération d'une
 * gagnante » (`ad_type = iteration`, la plus juste) · le serveur pose EN PLUS,
 * après relecture, d'où elle part (`source_ref_json.depuisGagnante` · source,
 * lot, carte, `gagnanteAdId` · JSON existant, aucune migration).
 */
export type SourceGagnante = 'lot' | 'hypothese';
export const SOURCES_GAGNANTE: readonly SourceGagnante[] = ['lot', 'hypothese'];
export const CLE_DEPUIS_GAGNANTE = 'depuisGagnante';

export const REFUS_GAGNANTE_DEPUIS: Readonly<Record<SourceGagnante, string>> = {
  lot: 'Cette pub n’est pas une gagnante arbitrée de ce lot conclu, dans ta marque active · rien n’est présélectionné.',
  hypothese: 'Cette pub n’est pas la gagnante du lot qui a confirmé cette hypothèse, dans ta marque active · rien n’est présélectionné.',
};

/** Un lot tel que le geste le lit · son état présenté, la conclusion du lot entier, ses variantes. */
export interface LotPourGagnante { id: string; numero: number; etat: EtatLotSpatial; conclusion: LectureConclusion | null; ads: readonly FaitsAdSpatial[] }

/** L'adresse de l'écran Itérer partie d'une gagnante d'un lot ou d'une carte · `null` si un identifiant est mal formé. */
export function lienIterationDepuis(source: SourceGagnante, o: { id: string; adId: string }): string | null {
  const i = uuid(o.id); const a = uuid(o.adId);
  if (!i || !a) return null;
  return `/studio/iterer?${new URLSearchParams({ [source]: i, [PARAM_GAGNANTE_ITERATION]: a }).toString()}`;
}

/**
 * Les gagnantes d'un lot CONCLU · ses variantes arbitrées gagnantes au
 * protocole, dans l'ordre du lot · `[]` tant que le lot n'est pas conclu (la
 * règle de la carte · `resultatHypothese`, la conclusion du lot entier).
 */
export function gagnantesDuLot(l: LotPourGagnante): GagnanteDuFil[] {
  if (!resultatHypothese(l, l.conclusion)) return [];
  return l.ads.filter(gagnanteArbitree).map((a) => ({ adId: a.id.toLowerCase(), variante: a.variante }));
}

const verdictDe = (a: FaitsAdSpatial | undefined): VerdictGagnante => (a?.verdict && a.verdict.statut === 'validated' ? { validated: a.verdict.retenu, comparable: a.verdict.comparable } : null);

/** La fiche d'un lot conclu · un geste par variante arbitrée gagnante, par ad · `{}` sinon (rien n'est ajouté à la fiche). */
export function gestesGagnantesLot(l: LotPourGagnante, o: { marqueActive: boolean; peutIterer: boolean; plan?: PlanDesGagnantes | null }): Record<string, GesteGagnante> {
  const out: Record<string, GesteGagnante> = {};
  for (const g of gagnantesDuLot(l)) {
    const a = l.ads.find((x) => x.id.toLowerCase() === g.adId);
    const geste = gesteDepuisGagnante(() => lienIterationDepuis('lot', { id: l.id, adId: g.adId }), { ...o, verdict: verdictDe(a), plan: o.plan?.(g.adId) ?? null });
    if (geste) out[a!.id] = geste;
  }
  return out;
}

/**
 * La gagnante d'où part le geste d'une carte · seulement quand la conclusion
 * du lot qui la teste est CONFIRMÉE · la variante de la carte si elle est
 * elle-même gagnante arbitrée, sinon la première gagnante du lot (ordre du
 * lot) · `null` sinon.
 */
export function gagnanteDeLHypothese(adId: string, l: LotPourGagnante | null): GagnanteDuFil | null {
  if (!l || resultatHypothese(l, l.conclusion)?.statut !== 'confirmee') return null;
  const gs = gagnantesDuLot(l);
  return gs.find((g) => g.adId === adId.toLowerCase()) ?? gs[0] ?? null;
}

/**
 * Le geste de la carte d'UNE hypothèse · `null` sauf quand la conclusion de son
 * lot est CONFIRMÉE (infirmée, sans conclusion, en test · rien) · fermé, sa
 * raison, par la même règle · un lot confirmé sans aucune gagnante arbitrée ·
 * fermé (une itération part d'une gagnante).
 */
export function gesteGagnanteHypothese(adId: string, l: LotPourGagnante | null, o: { marqueActive: boolean; peutIterer: boolean; plan?: PlanDesGagnantes | null }): GesteGagnante | null {
  if (!l || resultatHypothese(l, l.conclusion)?.statut !== 'confirmee') return null;
  const g = gagnanteDeLHypothese(adId, l);
  const a = g ? l.ads.find((x) => x.id.toLowerCase() === g.adId) : undefined;
  return gesteDepuisGagnante(() => (g ? lienIterationDepuis('hypothese', { id: adId, adId: g.adId }) : null), { ...o, verdict: verdictDe(a), plan: g ? o.plan?.(g.adId) ?? null : null });
}

/** Le lot d'une carte (`FaitsHypotheseAd`) rendu lisible par le geste, avec ses variantes · `null` hors lot. */
export function lotDeLaCarte(f: Pick<FaitsHypotheseAd, 'lot'>, adsDuLot: (lotId: string) => readonly FaitsAdSpatial[]): LotPourGagnante | null {
  return f.lot ? { id: f.lot.id, numero: f.lot.numero, etat: f.lot.etat, conclusion: f.lot.conclusion ?? null, ads: adsDuLot(f.lot.id) } : null;
}

/** Les gestes des cartes de la page Hypothèses, par carte (`cle` = l'ad de la carte) · `{}` sans hypothèse confirmée. */
export function gestesGagnantesHypotheses(
  faits: readonly FaitsHypotheseAd[], adsDuLot: (lotId: string) => readonly FaitsAdSpatial[],
  o: { marqueActive: boolean; peutIterer: boolean; plan?: PlanDesGagnantes | null },
): Record<string, GesteGagnante> {
  const out: Record<string, GesteGagnante> = {};
  for (const f of faits) {
    const g = gesteGagnanteHypothese(f.ad.id, lotDeLaCarte(f, adsDuLot), o);
    if (g) out[f.ad.id] = g;
  }
  return out;
}

/** Les gagnantes que les cartes CONFIRMÉES désignent · celles dont le plan est lu (une fois) avant de rendre la page. */
export function gagnantesDesHypotheses(faits: readonly FaitsHypotheseAd[], adsDuLot: (lotId: string) => readonly FaitsAdSpatial[]): string[] {
  return [...new Set(faits.map((f) => gagnanteDeLHypothese(f.ad.id, lotDeLaCarte(f, adsDuLot))?.adId).filter((x): x is string => !!x))];
}

export type DemandeDepartGagnante = { etat: 'absente' } | { etat: 'refus'; source: SourceGagnante } | { etat: 'ok'; source: SourceGagnante; id: string; gagnante: string };

/** `?lot=<uuid>&gagnante=<uuid>` ou `?hypothese=<uuid>&gagnante=<uuid>` lu · absente sans les deux · refusée si mal formée, donnée deux fois, ou les deux sources à la fois. */
export function lireDepartGagnante(sp: Readonly<Record<string, string | readonly string[] | undefined>>): DemandeDepartGagnante {
  const presentes = SOURCES_GAGNANTE.filter((x) => sp[x] !== undefined);
  if (!presentes.length) return { etat: 'absente' };
  const source = presentes[0]!;
  const brut = sp[source];
  if (presentes.length > 1 || (Array.isArray(brut) && brut.length !== 1)) return { etat: 'refus', source };
  const id = uuid(premiere(brut));
  const g = lireGagnanteDemandee(sp);
  return id && g.etat === 'ok' ? { etat: 'ok', source, id, gagnante: g.adId } : { etat: 'refus', source };
}

/** Le départ de l'écran Itérer depuis la gagnante d'un lot (ou de la carte qu'il a confirmée) · présélectionnée, la phrase qui le dit, aucun texte repris. */
export function departDepuisGagnanteDe(source: SourceGagnante, g: GagnanteDuFil, lot: { numero: number }, choix: ChoixVariablesIteration | null): DepartIterationGagnante {
  const { variable, suite } = variableDuPlan(choix);
  const de = source === 'lot' ? `gagnante arbitrée du lot #${lot.numero}` : `gagnante du lot #${lot.numero}, qui a confirmé l’hypothèse`;
  return {
    adId: g.adId, hypothese: null, variable,
    note: `Itération depuis la gagnante ${g.variante}, ${de} · ${suite} · la nouvelle itération gardera la gagnante d’où elle part. Rien n’est créé sans ton clic sur « Créer l’itération ».`,
  };
}

/** Ce que « Créer l'itération » reçoit · la source et son identifiant SEULS · tout le reste (une gagnante, un lot) est ignoré, le serveur relit. */
export interface DemandeProvenanceGagnante { source: SourceGagnante; id: string }

export function lireDemandeProvenanceGagnante(x: unknown): DemandeProvenanceGagnante | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const source = SOURCES_GAGNANTE.find((s) => s === o.source);
  const id = uuid(o.id);
  return source && id ? { source, id } : null;
}

/** Admise · la pub de départ est une gagnante RELUE de ce lot (ou celle de la carte) · `null` sinon · l'itération naît ordinaire. */
export function provenanceGagnanteAdmise(demande: DemandeProvenanceGagnante | null, lu: { lotId: string | null; gagnantes: readonly string[]; parentAdId: string }): { demande: DemandeProvenanceGagnante; lotId: string; gagnante: string } | null {
  if (!demande || !lu.lotId) return null;
  const p = lu.parentAdId.toLowerCase();
  return lu.gagnantes.some((g) => g.toLowerCase() === p) ? { demande, lotId: lu.lotId.toLowerCase(), gagnante: p } : null;
}

/** La valeur fusionnée dans `source_ref_json` · identifiants seuls. */
export function refProvenanceGagnante(p: { demande: DemandeProvenanceGagnante; lotId: string; gagnante: string }): Record<string, unknown> {
  const carte = p.demande.source === 'hypothese' ? { hypotheseAdId: p.demande.id } : {};
  return { [CLE_DEPUIS_GAGNANTE]: { source: p.demande.source, lotId: p.lotId, ...carte, [CLE_GAGNANTE_FIL]: p.gagnante } };
}

/** D'où part une itération née d'un lot ou d'une carte · `null` sans (ou JSON abîmé). */
export function lireDepuisGagnante(sourceRef: unknown): { source: SourceGagnante; lotId: string; hypotheseAdId: string | null; gagnanteAdId: string } | null {
  if (!sourceRef || typeof sourceRef !== 'object') return null;
  const o = (sourceRef as Record<string, unknown>)[CLE_DEPUIS_GAGNANTE];
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const source = SOURCES_GAGNANTE.find((s) => s === r.source);
  const lotId = uuid(r.lotId); const g = uuid(r[CLE_GAGNANTE_FIL]);
  if (!source || !lotId || !g) return null;
  return { source, lotId, hypotheseAdId: source === 'hypothese' ? uuid(r.hypotheseAdId) : null, gagnanteAdId: g };
}
