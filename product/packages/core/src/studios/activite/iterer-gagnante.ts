import type { VerdictValue } from '../../adsmap/types';
import { estGagnanteValidee } from '../../adsmap/verdict-libelle';
import { RAISON_ROLE_ITERATION } from '../../spatial/studios/iterer';
import type { ChoixVariablesIteration } from '../../spatial/studios/iterer-variable';
import { CLE_PROVENANCE_COMMENTAIRE, CLE_PROVENANCE_NOTE, type ProvenanceCommentaire, type ProvenanceNote } from '../../spatial/resultats/boucle-preuve';
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
  o: { id: string; projetId: string; marqueActive: boolean; peutIterer: boolean; verdict: VerdictGagnante },
): GesteIterationCommentaire | null {
  if (r.etat !== 'conclue' || r.statut !== 'confirmee') return null;
  const libelle = LIBELLE_ITERER_GAGNANTE;
  if (!o.marqueActive) return { libelle, href: null, raison: RAISON_GAGNANTE_AUTRE_MARQUE };
  if (!o.peutIterer) return { libelle, href: null, raison: RAISON_ROLE_ITERATION };
  if (!estGagnanteValidee(o.verdict?.validated ?? null, !!o.verdict?.comparable)) return { libelle, href: null, raison: RAISON_GAGNANTE_NON_ARBITREE };
  const href = lienIterationGagnante(fil, { id: o.id, projetId: o.projetId, adId: r.adId });
  return href ? { libelle, href, raison: null } : null;
}

/**
 * Les gestes des résultats d'UN fil, par ad · seulement les résultats
 * confirmés en ont un · `{}` sinon (rien n'est ajouté à l'écran).
 */
export function gestesGagnantesFil(
  fil: FilIteration, resultats: readonly ResultatFil[], iterations: readonly IterationDuFil[],
  o: { id: string; projetId: string; marqueActive: boolean; peutIterer: boolean },
): Record<string, GesteIterationCommentaire> {
  const verdicts = new Map(iterations.map((i) => [i.adId.toLowerCase(), i.verdict ?? null]));
  const out: Record<string, GesteIterationCommentaire> = {};
  for (const r of resultats) {
    const g = gesteIterationGagnante(fil, r, { ...o, verdict: verdicts.get(r.adId.toLowerCase()) ?? null });
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

/** Le départ de l'écran Itérer depuis la gagnante d'un fil · la gagnante présélectionnée, la phrase qui le dit. */
export function departDepuisGagnante(fil: FilIteration, g: GagnanteDuFil, choix: ChoixVariablesIteration | null): DepartIterationGagnante {
  const de = fil === 'commentaire' ? 'de ce commentaire' : 'de cette note';
  const variable = choix && !choix.ferme ? choix.defaut : null;
  const suite = variable ? 'la variable proposée est celle du plan, modifiable' : 'choisis la variable à l’étape « Ce qu’on change »';
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

