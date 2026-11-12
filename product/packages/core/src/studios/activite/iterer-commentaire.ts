import type { TestedVariable, VerdictValue } from '../../adsmap/types';
import { estGagnanteValidee } from '../../adsmap/verdict-libelle';
import { LIBELLE_CHOIX_VARIABLE, VIDE_ITERATION_SANS_ADSMAP, type ChoixVariablesIteration } from '../../spatial/studios/iterer-variable';
import { variableDepuisReponse, variablesConseillees } from '../../spatial/jarvis/gestes';
import { validerTexteCommentaire } from './commentaires';

/**
 * Studios · « Itérer depuis ce commentaire » (V5 · suite du lot 10, vers le
 * lot 2). Pur · ni base, ni réseau, ni modèle.
 *
 * Un commentaire posé sur une CRÉATION du projet dont la variante a une pub
 * TESTÉE (lien de test Adsmap) propose d'itérer · le geste OUVRE l'écran
 * Itérer existant (lot 2), la pub de la création présélectionnée et le texte
 * du commentaire proposé comme énoncé d'hypothèse (modifiable). Rien n'est
 * généré ni créé sans le clic « Créer l'itération » là-bas.
 *
 *  · ouvert OU résolu · les deux proposent le geste (choix du lot). Résoudre
 *    est le seul geste qui range un commentaire (il n'est jamais supprimé, il
 *    reste lu sous « Résolus ») · une remarque réglée sur la création reste une
 *    idée de déclinaison, et la rouvrir pour itérer écrirait sur le commentaire
 *    (et préviendrait le propriétaire) pour rien · le geste, lui, n'écrit rien ;
 *  · un commentaire sur une VERSION, ou sur une création sans pub testée · aucun
 *    geste (il n'y a pas de pub dont partir) ;
 *  · Résultats fermé à la personne, marque du projet qui n'est pas la marque
 *    active, pub testée qui n'est pas une gagnante arbitrée · le geste est
 *    FERMÉ, sa raison écrite à côté (Itérer part d'une gagnante de la marque
 *    active · `noeudsIterationProjet` dit la même chose dans le couloir).
 *
 * Ce qui part dans l'adresse · l'identifiant du commentaire et celui de son
 * projet · JAMAIS son texte. L'écran d'arrivée relit le commentaire dans la
 * portée (espace, marque active, projet de la portée Studios, création du
 * projet) · la variable n'est pré-cochée que si le texte la désigne SÛREMENT,
 * par la règle bornée de Jarvis (`variableDepuisReponse` · une seule variable
 * conseillée, admise pour CETTE pub · `variablesIteration`) · réutilisée telle
 * quelle, seules les phrases changent.
 *
 * Lot 11 · une NOTE de la lignée posée sur un nœud création ou résultat testé
 * propose « Itérer depuis cette note » · la même règle (`gesteIterationFil`),
 * la même lecture d'adresse (`lireGesteFil`, `?note=<uuid>&projet=<uuid>`), le
 * même départ (`departDepuisFil`) · seules les phrases du fil changent
 * (`TEXTES_FIL_ITERATION`). Les exports du commentaire restent, inchangés.
 */

export const PARAM_COMMENTAIRE_ITERATION = 'commentaire';
export const PARAM_PROJET_COMMENTAIRE = 'projet';
/** Lot 11 · « Itérer depuis cette note » · `?note=<uuid>&projet=<uuid>` · le même écran, la même règle. */
export const PARAM_NOTE_ITERATION = 'note';

export const LIBELLE_ITERER_COMMENTAIRE = 'Itérer depuis ce commentaire';
export const LIBELLE_ITERER_NOTE = 'Itérer depuis cette note';

/** La phrase de tout refus (autre projet, autre marque, autre espace, inconnu, mal formé, version) · rien ne dit s'il existe ailleurs. */
export const REFUS_GESTE_COMMENTAIRE = 'Ce commentaire n’est pas lisible avec ta marque active et tes droits · rien n’est présélectionné.';
/** La même, pour une note de la lignée (autre projet, autre marque, nœud sans pub testée, inconnue, mal formée). */
export const REFUS_GESTE_NOTE = 'Cette note n’est pas lisible avec ta marque active et tes droits · rien n’est présélectionné.';

export const RAISON_COMMENTAIRE_NON_GAGNANTE = 'La pub testée de cette création n’est pas une gagnante arbitrée au protocole · une itération part d’une gagnante.';
export const RAISON_COMMENTAIRE_AUTRE_MARQUE = 'Ce projet n’est pas dans ta marque active · ouvre sa marque pour itérer depuis ce commentaire.';
export const RAISON_NOTE_NON_GAGNANTE = 'La pub testée de ce nœud n’est pas une gagnante arbitrée au protocole · une itération part d’une gagnante.';
export const RAISON_NOTE_AUTRE_MARQUE = 'Ce projet n’est pas dans ta marque active · ouvre sa marque pour itérer depuis cette note.';

/** La borne de l'hypothèse de l'écran Itérer (son champ, et `depuisVeille`) · un commentaire peut en faire 2 000. */
export const LONGUEUR_MAX_HYPOTHESE_ITERATION = 900;

/**
 * D'où part l'itération · un commentaire du projet (lot 10) ou une note de la
 * lignée (lot 11) · deux FILS de texte qui suivent les mêmes règles
 * (`validerTexteCommentaire`) · seuls le paramètre d'adresse et les phrases
 * changent. La règle du geste, la lecture de l'adresse et le départ de l'écran
 * sont écrits UNE fois, pour les deux.
 */
export type FilIteration = 'commentaire' | 'note';

interface TextesFilIteration {
  param: string;
  libelle: string;
  refus: string;
  nonGagnante: string;
  autreMarque: string;
  /** « Le texte du commentaire » · « Le texte de la note ». */
  leTexte: string;
  /** « Le commentaire » · « La note » · sujet des phrases sur la variable. */
  sujet: string;
  /** « par le commentaire » · « par la note ». */
  par: string;
}

export const TEXTES_FIL_ITERATION: Readonly<Record<FilIteration, TextesFilIteration>> = {
  commentaire: {
    param: PARAM_COMMENTAIRE_ITERATION, libelle: LIBELLE_ITERER_COMMENTAIRE, refus: REFUS_GESTE_COMMENTAIRE,
    nonGagnante: RAISON_COMMENTAIRE_NON_GAGNANTE, autreMarque: RAISON_COMMENTAIRE_AUTRE_MARQUE,
    leTexte: 'Le texte du commentaire', sujet: 'Le commentaire', par: 'par le commentaire',
  },
  note: {
    param: PARAM_NOTE_ITERATION, libelle: LIBELLE_ITERER_NOTE, refus: REFUS_GESTE_NOTE,
    nonGagnante: RAISON_NOTE_NON_GAGNANTE, autreMarque: RAISON_NOTE_AUTRE_MARQUE,
    leTexte: 'Le texte de la note', sujet: 'La note', par: 'par la note',
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
const premiere = (v: string | readonly string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) as string | undefined;

/** L'adresse de l'écran Itérer ouvert depuis un fil · `?commentaire=<uuid>&projet=<uuid>` ou `?note=<uuid>&projet=<uuid>` · `null` si un identifiant est mal formé. */
export function lienIterationFil(fil: FilIteration, o: { id: string; projetId: string }): string | null {
  const c = uuid(o.id); const p = uuid(o.projetId);
  if (!c || !p) return null;
  return `/studio/iterer?${new URLSearchParams({ [TEXTES_FIL_ITERATION[fil].param]: c, [PARAM_PROJET_COMMENTAIRE]: p }).toString()}`;
}

/** L'adresse de l'écran Itérer ouvert depuis un commentaire · `?commentaire=<uuid>&projet=<uuid>` · `null` si un identifiant est mal formé. */
export function lienIterationCommentaire(o: { commentaireId: string; projetId: string }): string | null {
  return lienIterationFil('commentaire', { id: o.commentaireId, projetId: o.projetId });
}

export type DemandeIterationFil = { etat: 'absente' } | { etat: 'refus'; fil: FilIteration } | { etat: 'ok'; fil: FilIteration; id: string; projetId: string };

/**
 * L'adresse lue · le commentaire d'abord (le geste du lot 10), sinon la note ·
 * absente sans l'un ni l'autre, refusée dès qu'un identifiant manque ou est
 * mal formé · rien n'est deviné. Les deux à la fois · refus (une seule source).
 */
export function lireGesteFil(sp: Readonly<Record<string, string | readonly string[] | undefined>>): DemandeIterationFil {
  const c = premiere(sp[PARAM_COMMENTAIRE_ITERATION]);
  const n = premiere(sp[PARAM_NOTE_ITERATION]);
  if (c === undefined && n === undefined) return { etat: 'absente' };
  const fil: FilIteration = c !== undefined ? 'commentaire' : 'note';
  if (c !== undefined && n !== undefined) return { etat: 'refus', fil };
  const id = uuid(c ?? n); const projetId = uuid(premiere(sp[PARAM_PROJET_COMMENTAIRE]));
  return id && projetId ? { etat: 'ok', fil, id, projetId } : { etat: 'refus', fil };
}

export type DemandeIterationCommentaire = { etat: 'absente' } | { etat: 'refus' } | { etat: 'ok'; commentaireId: string; projetId: string };

/** L'adresse lue · absente sans `commentaire`, refusée dès qu'un identifiant manque ou est mal formé · rien n'est deviné. */
export function lireGesteCommentaire(sp: Readonly<Record<string, string | readonly string[] | undefined>>): DemandeIterationCommentaire {
  if (premiere(sp[PARAM_COMMENTAIRE_ITERATION]) === undefined) return { etat: 'absente' };
  const d = lireGesteFil({ [PARAM_COMMENTAIRE_ITERATION]: sp[PARAM_COMMENTAIRE_ITERATION], [PARAM_PROJET_COMMENTAIRE]: sp[PARAM_PROJET_COMMENTAIRE] });
  return d.etat === 'ok' ? { etat: 'ok', commentaireId: d.id, projetId: d.projetId } : { etat: 'refus' };
}

export type GesteIterationCommentaire = { libelle: string; href: string; raison: null } | { libelle: string; href: null; raison: string };

/** La pub testée d'où partirait l'itération · le lien de test de la variante (création commentée ou nœud annoté). */
export type TestPourGeste = { adsmapAdId: string; verdict: { validated: VerdictValue | null; comparable: boolean } | null };

/** Ce qu'un commentaire lu dans le projet porte · sa cible et, pour une création, la pub de test de sa variante. */
export interface CommentairePourGeste {
  id: string;
  projetId: string;
  cible: 'version' | 'creation';
  /** Le test de la variante de la création commentée · `null` sans lien de test (ou une version). */
  test: TestPourGeste | null;
}

/**
 * Le geste d'un fil (commentaire ou note) qui a une pub testée dont partir ·
 * fermé avec sa raison quand Résultats est fermé, que le projet n'est pas dans
 * la marque active ou que la pub n'est pas une gagnante arbitrée · `null` si
 * l'adresse ne peut pas s'écrire. L'appelant dit d'abord s'il y a une pub
 * (`gesteIterationCommentaire`, `gesteIterationNote`).
 */
export function gesteIterationFil(fil: FilIteration, c: { id: string; projetId: string; test: TestPourGeste }, o: { resultats: boolean; marqueActive: boolean }): GesteIterationCommentaire | null {
  const t = TEXTES_FIL_ITERATION[fil];
  const libelle = t.libelle;
  if (!o.resultats) return { libelle, href: null, raison: VIDE_ITERATION_SANS_ADSMAP };
  if (!o.marqueActive) return { libelle, href: null, raison: t.autreMarque };
  if (!estGagnanteValidee(c.test.verdict?.validated ?? null, !!c.test.verdict?.comparable)) return { libelle, href: null, raison: t.nonGagnante };
  const href = lienIterationFil(fil, { id: c.id, projetId: c.projetId });
  return href ? { libelle, href, raison: null } : null;
}

/**
 * Le geste d'un commentaire · `null` sans pub dont partir (version, création
 * non testée) · fermé avec sa raison quand Résultats est fermé, que le projet
 * n'est pas dans la marque active ou que la pub n'est pas une gagnante
 * arbitrée · ouvert ou résolu, même règle.
 */
export function gesteIterationCommentaire(c: CommentairePourGeste, o: { resultats: boolean; marqueActive: boolean }): GesteIterationCommentaire | null {
  if (c.cible !== 'creation' || !c.test) return null;
  return gesteIterationFil('commentaire', { id: c.id, projetId: c.projetId, test: c.test }, o);
}

export interface DepartIterationCommentaire {
  /** La pub de la création commentée (ou du nœud annoté) · présélectionnée sur l'écran Itérer. */
  adId: string;
  /** Le texte du fil, proposé comme énoncé d'hypothèse (modifiable) · borné au champ de l'écran. */
  hypothese: string;
  /** Pré-cochée seulement si le texte la désigne SÛREMENT et qu'elle est admise pour cette pub. */
  variable: TestedVariable | null;
  /** Ce que l'écran dit, en une phrase · toujours posée. */
  note: string;
}

const FIN = 'Rien n’est créé sans ton clic sur « Créer l’itération ».';
const noms = (l: readonly TestedVariable[]) => l.map((v) => LIBELLE_CHOIX_VARIABLE[v]).join(', ');

/**
 * Le départ de l'écran Itérer depuis un fil relu (commentaire ou note) · le
 * texte proposé comme hypothèse, la variable par la règle bornée de Jarvis
 * (`variableDepuisReponse`) sur les variables ADMISES de la pub · `choix`
 * absent (la pub n'est pas dans le plan d'itération), aucune variable, l'écran
 * dit pourquoi la pub ne peut pas être reprise.
 */
export function departDepuisFil(fil: FilIteration, texte: string, adId: string, choix: ChoixVariablesIteration | null): DepartIterationCommentaire {
  const t = TEXTES_FIL_ITERATION[fil];
  const v = validerTexteCommentaire(texte);
  const plein = v.ok ? v.texte : '';
  const coupe = [...plein].length > LONGUEUR_MAX_HYPOTHESE_ITERATION;
  const hypothese = coupe ? [...plein].slice(0, LONGUEUR_MAX_HYPOTHESE_ITERATION).join('').trimEnd() : plein;
  const suite = `${t.leTexte} est proposé comme hypothèse${coupe ? ` · il dépasse ${LONGUEUR_MAX_HYPOTHESE_ITERATION} caractères, seul le début est repris, relis-le` : ', modifiable'}.`;
  if (!choix || choix.ferme) return { adId, hypothese, variable: null, note: `${suite} ${FIN}` };
  const r = variableDepuisReponse(plein, choix);
  if (r.motif === 'sure' && r.variable) return { adId, hypothese, variable: r.variable, note: `${suite} Variable désignée ${t.par} · ${LIBELLE_CHOIX_VARIABLE[r.variable]}. ${FIN}` };
  const vues = variablesConseillees(plein);
  const pourquoi = r.motif === 'ambigue'
    ? `${t.sujet} évoque plusieurs variables (${noms(vues)}) · rien n’est présélectionné, une itération n’en change qu’une.`
    : r.motif === 'fermee' && vues[0]
      ? `${t.sujet} désigne ${LIBELLE_CHOIX_VARIABLE[vues[0]].toLowerCase()}, qui n’est pas admise pour cette pub · rien n’est présélectionné.`
      : `${t.sujet} ne désigne aucune variable sûrement · rien n’est présélectionné, choisis-la à l’étape « Ce qu’on change ».`;
  return { adId, hypothese, variable: null, note: `${suite} ${pourquoi} ${FIN}` };
}

/** Le départ depuis un commentaire relu · `departDepuisFil('commentaire', …)`. */
export function departDepuisCommentaire(texte: string, adId: string, choix: ChoixVariablesIteration | null): DepartIterationCommentaire {
  return departDepuisFil('commentaire', texte, adId, choix);
}
