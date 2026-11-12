import type { TestedVariable } from '../../adsmap/types';
import { validerTexteCommentaire } from '../../studios/activite/commentaires';
import { gesteIterationFil, type GesteIterationCommentaire, type TestPourGeste } from '../../studios/activite/iterer-commentaire';
import { variablesConseillees } from '../jarvis/gestes';
import {
  LONGUEUR_PARTIE_MAX, PARTIES_VIDES, VARIABLES_HYPOTHESE, accesHypothese, estVariableHypothese, lireHypothese, partiesPropres,
  type AccesHypothese, type DepartHypothese, type PartiesHypothese,
} from '../resultats/hypotheses-libres';

/**
 * Spatial · canvas de lignée · lot 11 V5 · des NOTES de la lignée aux gestes
 * qui font avancer le projet · pur · ni base, ni réseau, ni modèle, ni horloge.
 *
 * ── Quel nœud propose quoi ───────────────────────────────────────────────────
 *
 * Une note est attachée à UN nœud par sa clé stable (`creation:<variante>`,
 * `brief:<version>`…, `C/spatial/projet/notes-lignee.ts`). Le TYPE du nœud
 * dit le geste, et seulement lui :
 *
 *  · CRÉATION ou RÉSULTAT dont la variante a une pub TESTÉE · « Itérer depuis
 *    cette note » · exactement la règle de « Itérer depuis ce commentaire »
 *    (lot 10 · `gesteIterationFil`, écrite une fois pour les deux fils) ·
 *    ouvre l'écran Itérer EXISTANT, la pub présélectionnée, le texte proposé
 *    comme hypothèse, la variable cochée seulement si le texte la désigne
 *    SÛREMENT (règle bornée de Jarvis) · fermé avec sa raison (Résultats fermé,
 *    autre marque active, pub non gagnante) ;
 *  · BRIEF ou HYPOTHÈSE · « Formuler une hypothèse » · ouvre le formulaire
 *    d'hypothèse EXISTANT (Résultats · Hypothèses), pré-rempli, la note citée ·
 *    fermé avec la raison de `accesHypothese` (formule, rôle, marque active) ;
 *  · tout autre nœud (marque, référence, lot, direction, apprentissage,
 *    itération, projets frères), une création SANS pub testée · aucun geste.
 *
 * Ce qui part dans l'adresse · l'identifiant de la note et celui de son projet ·
 * JAMAIS son texte. L'écran d'arrivée relit la note dans la portée · rien n'est
 * créé ni enregistré sans le clic là-bas.
 */

export type NoeudDeGeste =
  | { geste: 'iterer'; type: 'creation' | 'resultat'; varianteId: string }
  | { geste: 'hypothese'; type: 'brief' | 'hypothese'; versionId: string };

const CLE_GESTE = /^(creation|resultat|brief|hypothese):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Le geste qu'un nœud porte, lu sur sa clé · `null` pour tout autre nœud (ou une clé mal formée). */
export function noeudDeGeste(cle: unknown): NoeudDeGeste | null {
  if (typeof cle !== 'string') return null;
  const m = CLE_GESTE.exec(cle);
  if (!m) return null;
  const type = m[1]!.toLowerCase(); const id = m[2]!.toLowerCase();
  if (type === 'creation' || type === 'resultat') return { geste: 'iterer', type, varianteId: id };
  return { geste: 'hypothese', type: type as 'brief' | 'hypothese', versionId: id };
}

/* ───────────────────────── « Itérer depuis cette note » ───────────────────────── */

/** Ce qu'une note lue dans le projet porte · son nœud et, pour une création ou un résultat, la pub de test de sa variante. */
export interface NotePourGeste {
  id: string;
  projetId: string;
  noeud: string;
  /** Le test de la variante du nœud · `null` sans lien de test (ou un autre nœud). */
  test: TestPourGeste | null;
}

/**
 * Le geste « Itérer depuis cette note » · `null` hors d'un nœud création /
 * résultat ou sans pub testée · sinon la règle du commentaire, telle quelle ·
 * ouverte ou résolue, même règle.
 */
export function gesteIterationNote(n: NotePourGeste, o: { resultats: boolean; marqueActive: boolean }): GesteIterationCommentaire | null {
  if (noeudDeGeste(n.noeud)?.geste !== 'iterer' || !n.test) return null;
  return gesteIterationFil('note', { id: n.id, projetId: n.projetId, test: n.test }, o);
}

/* ───────────────────────── « Formuler une hypothèse » ───────────────────────── */

export const PARAM_NOTE_HYPOTHESE = 'note';
export const PARAM_PROJET_NOTE_HYPOTHESE = 'projet';
export const LIBELLE_HYPOTHESE_NOTE = 'Formuler une hypothèse';
/** Le titre du formulaire ouvert depuis une note. */
export const TITRE_HYPOTHESE_NOTE = 'Hypothèse depuis une note de la lignée';

/** La phrase de tout refus (autre projet, autre marque, autre espace, inconnue, mal formée, autre nœud) · rien ne dit si la note existe ailleurs. */
export const REFUS_HYPOTHESE_NOTE = 'Cette note n’est pas lisible avec ta marque active et tes droits · rien n’est pré-rempli.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : null);
const premiere = (v: string | readonly string[] | null | undefined) => (Array.isArray(v) ? v[0] : v) as string | undefined;

/** L'adresse du formulaire d'hypothèse ouvert depuis une note · `/adsmap/hypotheses?note=<uuid>&projet=<uuid>` · `null` si un identifiant est mal formé. */
export function lienHypotheseNote(o: { noteId: string; projetId: string }): string | null {
  const n = uuid(o.noteId); const p = uuid(o.projetId);
  if (!n || !p) return null;
  return `/adsmap/hypotheses?${new URLSearchParams({ [PARAM_NOTE_HYPOTHESE]: n, [PARAM_PROJET_NOTE_HYPOTHESE]: p }).toString()}`;
}

export type DemandeHypotheseNote = { etat: 'absente' } | { etat: 'refus' } | { etat: 'ok'; noteId: string; projetId: string };

/** L'adresse lue · absente sans `note`, refusée dès qu'un identifiant manque ou est mal formé · rien n'est deviné. */
export function lireGesteHypotheseNote(sp: Readonly<Record<string, string | readonly string[] | undefined>>): DemandeHypotheseNote {
  const n = premiere(sp[PARAM_NOTE_HYPOTHESE]);
  if (n === undefined) return { etat: 'absente' };
  const noteId = uuid(n); const projetId = uuid(premiere(sp[PARAM_PROJET_NOTE_HYPOTHESE]));
  return noteId && projetId ? { etat: 'ok', noteId, projetId } : { etat: 'refus' };
}

export type GesteHypotheseNote = { libelle: string; href: string; raison: null } | { libelle: string; href: null; raison: string };

/**
 * Le geste « Formuler une hypothèse » · `null` hors d'un nœud brief /
 * hypothèse · fermé avec la raison de `accesHypothese` (la porte des hypothèses
 * hors de Résultats · formule, rôle, marque active) · ouverte ou résolue, même règle.
 */
export function gesteHypotheseNote(n: { id: string; projetId: string; noeud: string }, o: { adsmap: 'ok' | 'plan' | 'role'; marqueActive: boolean }): GesteHypotheseNote | null {
  if (noeudDeGeste(n.noeud)?.geste !== 'hypothese') return null;
  const libelle = LIBELLE_HYPOTHESE_NOTE;
  const a: AccesHypothese = accesHypothese(o);
  if (!a.ouvert) return { libelle, href: null, raison: `${a.raison}.` };
  const href = lienHypotheseNote({ noteId: n.id, projetId: n.projetId });
  return href ? { libelle, href, raison: null } : null;
}

/** La longueur de la note citée sous le titre du formulaire · au-delà, le début et « … ». */
export const LONGUEUR_CITATION_NOTE = 280;

export interface DepartHypotheseNote {
  depart: DepartHypothese;
  /** La ligne sous le titre du formulaire · la note citée, ce qui est pré-rempli, et que rien n'est enregistré sans le clic. */
  note: string;
}

const borne = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n).join('').trimEnd() : s);

/**
 * Le départ du formulaire d'hypothèse depuis une note RELUE · l'énoncé
 * proposé · la phrase de la note si elle est déjà écrite « Si…, alors…,
 * parce que… » (`lireHypothese`), sinon le texte de la note dans le « Si… »
 * (ce qu'on change, modifiable) · chaque partie bornée au champ du formulaire ·
 * la variable SEULEMENT si le texte la désigne sûrement (une seule variable
 * conseillée, `variablesConseillees`, la règle bornée de Jarvis) · la note est
 * CITÉE dans la ligne sous le titre · rien n'est enregistré sans le clic.
 */
/** `auteur` · le nom de qui l'a écrite, `null` quand c'est la session (« ta note »). */
export function departHypotheseDepuisNote(texte: string, o: { auteur: string | null; noeud: string }): DepartHypotheseNote {
  const v = validerTexteCommentaire(texte);
  const plein = v.ok ? v.texte : '';
  const plat = plein.replace(/\s+/g, ' ').trim();
  const lue = lireHypothese(plat);
  let coupe = false;
  let parties: PartiesHypothese;
  if (lue) {
    const p = { si: borne(lue.si, LONGUEUR_PARTIE_MAX), alors: borne(lue.alors, LONGUEUR_PARTIE_MAX), parceQue: borne(lue.parceQue, LONGUEUR_PARTIE_MAX) };
    coupe = p.si !== lue.si || p.alors !== lue.alors || p.parceQue !== lue.parceQue;
    parties = p;
  } else {
    // Le texte tel que le « Si… » le porte (un « si » de tête et la ponctuation de fin retirés, la phrase les remet).
    const propre = partiesPropres({ si: plat }).si;
    const si = borne(propre, LONGUEUR_PARTIE_MAX);
    coupe = si !== propre;
    parties = { ...PARTIES_VIDES, si };
  }
  const vues = variablesConseillees(plein);
  const variable: TestedVariable | null = vues.length === 1 && estVariableHypothese(vues[0]) ? vues[0]! : null;
  const nom = (x: TestedVariable) => VARIABLES_HYPOTHESE.find((y) => y.cle === x)?.libelle ?? x;
  const citation = [...plat].length > LONGUEUR_CITATION_NOTE ? `${[...plat].slice(0, LONGUEUR_CITATION_NOTE - 1).join('').trimEnd()}…` : plat;
  const reprise = lue ? 'Sa phrase « Si…, alors…, parce que… » est reprise' : 'Son texte est proposé dans le « Si… »';
  const suite = coupe ? `, seul le début de chaque partie (${LONGUEUR_PARTIE_MAX} caractères) est repris, relis-le` : ', modifiable';
  const variablePhrase = variable
    ? `Variable désignée par la note · ${nom(variable)}.`
    : vues.length > 1
      ? `La note évoque plusieurs variables (${vues.map(nom).join(', ')}) · aucune n’est choisie, une hypothèse n’en teste qu’une.`
      : 'La note ne désigne aucune variable sûrement · choisis-la.';
  return {
    depart: { parties, variable },
    note: `Source · ${o.auteur === null ? 'ta note' : `la note de ${o.auteur}`} sur « ${o.noeud} » · « ${citation} ». ${reprise}${suite}. ${variablePhrase} Rien n’est enregistré sans ton clic sur « Ranger dans « À formuler » ».`,
  };
}
