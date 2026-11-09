import type { TestedVariable } from '../../adsmap/types';
import { listeManques } from '../../adsmap/reprise-adsmap';
import { CATEGORIE_VARIABLE } from './lots';

/**
 * Spatial · Résultats · les hypothèses LIBRES (lot 1 V5) · une hypothèse écrite
 * à partir de rien, d'une pub de la Veille, d'une accroche de persona ou d'un
 * apprentissage, qui entre dans « À formuler » du tableau des hypothèses.
 *
 * Pur · ni base, ni réseau, ni horloge, ni modèle. Dans l'outil, une hypothèse
 * reste le texte porté par une ad (`adsmap_ads.hypothesis`) · une hypothèse
 * libre est une ad en BROUILLON de son concept, rien de plus. Ce module dit :
 *
 *  · la phrase « Si…, alors…, parce que… » (composée, relue) ;
 *  · sa complétude, en mots (ce qui manque) ;
 *  · la validation de la saisie (serveur ET écran, même règle) ;
 *  · la priorité tirée de l'estimation d'équipe (impact, confiance, effort) ;
 *  · d'où vient l'hypothèse (provenance gardée sur l'ad) et ce que la carte en dit.
 */

/* ───────────────────────── la phrase ───────────────────────── */

export interface PartiesHypothese { si: string; alors: string; parceQue: string }
export const PARTIES_VIDES: PartiesHypothese = { si: '', alors: '', parceQue: '' };

/**
 * Longueur maximale d'une partie de la phrase. Mesuré sur les six hypothèses de
 * la maquette (`docs/spatial/reference/hypotheses.html`, 08/11/2026) :
 *
 * | Partie         | min | max |
 * | -------------- | --- | --- |
 * | Si…            | 30  | 49  |
 * | alors…         | 24  | 51  |
 * | parce que…     | 17  | 45  |
 * | Phrase entière | 109 | 140 |
 *
 * 280 ≈ 5 fois la plus longue partie mesurée · assez pour une phrase précise,
 * borné pour que la carte (colonne étroite du tableau) reste lisible.
 */
export const LONGUEUR_PARTIE_MAX = 280;

/** Une partie nettoyée · espaces repliés, mot-clé et ponctuation de fin retirés (la phrase les remet). */
function nettoyer(s: unknown, motCle: RegExp): string {
  if (typeof s !== 'string') return '';
  return s.replace(/\s+/g, ' ').trim().replace(motCle, '').replace(/[\s.,;:!?…]+$/u, '').trim();
}
const MOT_SI = /^si(?:\s+|$)/iu;
const MOT_ALORS = /^alors(?:\s+|$)/iu;
const MOT_PARCE_QUE = /^parce\s+qu(?:e(?:\s+|$)|['’]\s*)/iu;

/** Les trois parties telles que la phrase les porte · mots-clés en double et points retirés. */
export function partiesPropres(p: Partial<Record<keyof PartiesHypothese, unknown>>): PartiesHypothese {
  return { si: nettoyer(p.si, MOT_SI), alors: nettoyer(p.alors, MOT_ALORS), parceQue: nettoyer(p.parceQue, MOT_PARCE_QUE) };
}

/**
 * La phrase · « Si X, alors Y, parce que Z. ». Une partie absente se lit « … »,
 * comme dans la maquette (« Si le prix barré apparaît dans l’image, alors… ? ») ·
 * la phrase reste vraie sur ce qu'elle ne sait pas encore. Vide si rien n'est écrit.
 */
export function composerHypothese(p: Partial<Record<keyof PartiesHypothese, unknown>>): string {
  const { si, alors, parceQue } = partiesPropres(p);
  if (!si && !alors && !parceQue) return '';
  // L'élision du français · « S’il », « parce qu’on » (jamais « Si il », « parce que on »).
  const tete = `${!si ? 'Si…' : /^ils?\s/iu.test(si) ? `S’${si}` : `Si ${si}`}, alors${alors ? ` ${alors}` : '…'}`;
  if (parceQue) return `${tete}, ${/^[aeiouyàâéèêëîïôûù]/iu.test(parceQue) ? 'parce qu’' : 'parce que '}${parceQue}.`;
  return alors ? `${tete}.` : `${tete} ?`;
}

/**
 * Relit une phrase composée par `composerHypothese` · `null` pour un texte libre
 * qui ne suit pas la forme (une hypothèse saisie ailleurs, une suite du moteur) ·
 * on ne force pas un texte dans des cases qu'il n'a jamais eues.
 */
export function lireHypothese(texte: string | null | undefined): PartiesHypothese | null {
  const t = (texte ?? '').replace(/\s+/g, ' ').trim();
  const m = /^S(?:i…|i\s+(.+?)|['’](ils?\s.+?)),\s*alors(?:…|\s+(.+?))(?:,\s*parce qu(?:e\s+|['’]\s*)(.+?))?\s*[.?]?$/u.exec(t);
  if (!m) return null;
  return partiesPropres({ si: m[1] ?? m[2] ?? '', alors: m[3] ?? '', parceQue: m[4] ?? '' });
}

/* ───────────────────────── la variable ───────────────────────── */

/**
 * Les variables qu'une hypothèse peut changer, dans les mots de la carte
 * (`CATEGORIE_VARIABLE`) · le témoin (`none_control`) n'en est pas une : il ne
 * change rien, c'est la référence du lot.
 */
export const VARIABLES_HYPOTHESE: ReadonlyArray<{ cle: TestedVariable; libelle: string }> =
  (Object.keys(CATEGORIE_VARIABLE) as TestedVariable[]).filter((v) => v !== 'none_control').map((cle) => ({ cle, libelle: CATEGORIE_VARIABLE[cle]! }));

const VARIABLES = new Set<string>(VARIABLES_HYPOTHESE.map((v) => v.cle));
export const estVariableHypothese = (v: unknown): v is TestedVariable => typeof v === 'string' && VARIABLES.has(v);

/* ───────────────────────── complétude ───────────────────────── */

export const MANQUES_HYPOTHESE = {
  si: 'ce qu’on change (Si…)',
  alors: 'le résultat attendu (alors…)',
  parceQue: 'la raison (parce que…)',
  variable: 'la variable testée',
} as const;

export interface CompletudeHypothese {
  complete: boolean;
  /** Ce qui manque, en mots, dans l'ordre de la phrase. */
  manques: string[];
  /** « Phrase complète » ou « Il manque … ». */
  resume: string;
}

/** Ce qui manque à la phrase et à sa variable pour être une hypothèse vérifiable. */
export function completudeHypothese(p: Partial<Record<keyof PartiesHypothese, unknown>>, variable: unknown): CompletudeHypothese {
  const x = partiesPropres(p);
  const manques: string[] = [];
  if (!x.si) manques.push(MANQUES_HYPOTHESE.si);
  if (!x.alors) manques.push(MANQUES_HYPOTHESE.alors);
  if (!x.parceQue) manques.push(MANQUES_HYPOTHESE.parceQue);
  if (!estVariableHypothese(variable)) manques.push(MANQUES_HYPOTHESE.variable);
  return { complete: manques.length === 0, manques, resume: manques.length ? `Il manque ${listeManques(manques)}` : 'Phrase complète' };
}

/* ───────────────────────── priorité (impact, confiance, effort) ───────────────────────── */

/** L'estimation d'équipe · chaque note de 1 à 3 (`adsmap_ads.ice_*`, migration 0068). */
export interface EstimationHypothese { impact: number | null; confiance: number | null; effort: number | null }
export const ESTIMATION_VIDE: EstimationHypothese = { impact: null, confiance: null, effort: null };

export const NOTES_ESTIMATION = {
  impact: ['faible', 'moyen', 'fort'],
  confiance: ['faible', 'moyenne', 'forte'],
  effort: ['léger', 'moyen', 'lourd'],
} as const;

const note = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 3 ? n : null;
};

/**
 * La priorité d'une hypothèse estimée · la moyenne des trois notes, l'effort
 * inversé (un effort lourd fait baisser la priorité), arrondie · 1 à 3 barres.
 * `null` tant qu'une des trois manque · la carte retombe alors sur le pré-score
 * du concept (ou « à évaluer »), jamais sur une note devinée.
 */
export function prioriteEstimee(e: EstimationHypothese | null | undefined): 1 | 2 | 3 | null {
  if (!e) return null;
  const i = note(e.impact), c = note(e.confiance), f = note(e.effort);
  if (i === null || c === null || f === null) return null;
  return Math.round((i + c + (4 - f)) / 3) as 1 | 2 | 3;
}

/* ───────────────────────── validation de la saisie ───────────────────────── */

/** Ce que l'écran envoie · tout arrive en `unknown` côté serveur. */
export interface SaisieHypotheseLibre {
  si?: unknown; alors?: unknown; parceQue?: unknown; variable?: unknown;
  impact?: unknown; confiance?: unknown; effort?: unknown;
}

export type HypotheseValidee =
  | { ok: true; parties: PartiesHypothese; texte: string; variable: TestedVariable | null; estimation: EstimationHypothese; completude: CompletudeHypothese }
  | { ok: false; erreur: string };

export const REFUS_HYPOTHESE_VIDE = 'Écris au moins une partie de la phrase · le reste se complète ensuite, dans « À formuler ».';

/**
 * La saisie d'une hypothèse, relue · même règle à l'écran et au serveur. Une
 * hypothèse INCOMPLÈTE est acceptée (« À formuler » est fait pour elle) · une
 * hypothèse VIDE ne l'est pas. Une variable ou une note hors liste est refusée
 * en le disant, jamais remplacée en silence.
 */
export function validerSaisieHypothese(s: SaisieHypotheseLibre): HypotheseValidee {
  const parties = partiesPropres(s);
  for (const [k, v] of Object.entries(parties) as Array<[keyof PartiesHypothese, string]>) {
    if (v.length > LONGUEUR_PARTIE_MAX) {
      return { ok: false, erreur: `${MANQUES_HYPOTHESE[k].replace(/^./u, (c) => c.toUpperCase())} dépasse ${LONGUEUR_PARTIE_MAX} caractères · resserre la phrase.` };
    }
  }
  const texte = composerHypothese(parties);
  if (!texte) return { ok: false, erreur: REFUS_HYPOTHESE_VIDE };
  const vide = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  if (!vide(s.variable) && !estVariableHypothese(s.variable)) return { ok: false, erreur: 'Variable inconnue · choisis-la dans la liste.' };
  const estimation: EstimationHypothese = { impact: note(s.impact), confiance: note(s.confiance), effort: note(s.effort) };
  for (const k of ['impact', 'confiance', 'effort'] as const) {
    if (!vide(s[k]) && estimation[k] === null) return { ok: false, erreur: `Note « ${k} » hors échelle · de 1 à 3.` };
  }
  const variable = estVariableHypothese(s.variable) ? s.variable : null;
  return { ok: true, parties, texte, variable, estimation, completude: completudeHypothese(parties, variable) };
}

/* ───────────────────────── provenance ───────────────────────── */

/**
 * D'où vient une hypothèse libre · gardé sur l'ad (`adsmap_ads.source_ref_json`,
 * clé `hypotheseLibre`), à côté des clés que d'autres écrans y lisent
 * (`generationId`, `studioVariantId`) et sans les toucher. Le libellé est celui
 * du moment de la création (nom de l'annonceur, du persona).
 */
export type OrigineHypotheseLibre =
  | { type: 'libre' }
  | { type: 'veille'; annonceur: string; savedAdId: string | null }
  | { type: 'persona'; persona: string; personaId: string | null; accroche: string | null }
  | { type: 'apprentissage'; enonce: string; learningId: string | null }
  /** Lot 6 bis · un tag de Veille récurrent · ses sauvegardes sont les preuves citées (`total` · toutes, `savedAdIds` · au plus 50). */
  | { type: 'tag'; tag: string; cle: string; savedAdIds: string[]; total: number };

export const CLE_ORIGINE_HYPOTHESE = 'hypotheseLibre';

const court = (s: unknown, n: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const idOuNul = (s: unknown): string | null => (typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s) ? s : null);

/** La valeur à poser dans `source_ref_json` d'une ad neuve. */
export function refOrigineHypothese(o: OrigineHypotheseLibre): Record<string, unknown> {
  return { [CLE_ORIGINE_HYPOTHESE]: o };
}

/** Relit la provenance · `null` pour une ad qui n'est pas une hypothèse libre (ou un JSON abîmé). */
export function lireOrigineHypothese(sourceRef: unknown): OrigineHypotheseLibre | null {
  if (!sourceRef || typeof sourceRef !== 'object') return null;
  const o = (sourceRef as Record<string, unknown>)[CLE_ORIGINE_HYPOTHESE];
  if (!o || typeof o !== 'object') return null;
  const x = o as Record<string, unknown>;
  if (x.type === 'libre') return { type: 'libre' };
  if (x.type === 'veille') return { type: 'veille', annonceur: court(x.annonceur, 80) || 'Annonceur', savedAdId: idOuNul(x.savedAdId) };
  if (x.type === 'persona') return { type: 'persona', persona: court(x.persona, 80) || 'Persona', personaId: idOuNul(x.personaId), accroche: court(x.accroche, LONGUEUR_PARTIE_MAX) || null };
  if (x.type === 'apprentissage') return { type: 'apprentissage', enonce: court(x.enonce, 200) || 'Apprentissage', learningId: idOuNul(x.learningId) };
  if (x.type === 'tag') {
    const ids = Array.isArray(x.savedAdIds) ? x.savedAdIds.map(idOuNul).filter((i): i is string => !!i).slice(0, 50) : [];
    const total = typeof x.total === 'number' && Number.isInteger(x.total) && x.total >= ids.length ? x.total : ids.length;
    return { type: 'tag', tag: court(x.tag, 40) || 'Tag', cle: court(x.cle, 40), savedAdIds: ids, total };
  }
  return null;
}

/** Ce que la carte dit de la provenance · « Idée d’équipe » comme la maquette. */
export function libelleOrigine(o: OrigineHypotheseLibre): string {
  if (o.type === 'veille') return `Veille · ${o.annonceur}`;
  if (o.type === 'persona') return `Persona · ${o.persona.split(',')[0]!.trim()}`;
  if (o.type === 'tag') return `Veille · tag « ${o.tag} » · ${o.total} sauvegarde${o.total > 1 ? 's' : ''}`;
  if (o.type === 'apprentissage') return `Apprentissage · ${o.enonce.length > 60 ? `${o.enonce.slice(0, 59).trim()}…` : o.enonce}`;
  return 'Idée d’équipe';
}

/* ───────────────────────── points de départ ───────────────────────── */

/**
 * Le début de phrase proposé selon le geste · seulement ce que le geste dit
 * lui-même (on reprend cette pub, on teste ces mots, on part de cet
 * apprentissage) · ni résultat attendu, ni raison inventés.
 */
export interface DepartHypothese { parties: PartiesHypothese; variable: TestedVariable | null }

export function departDepuisVeille(o: { annonceur: string | null | undefined }): DepartHypothese {
  const a = court(o.annonceur, 80);
  return { parties: { ...PARTIES_VIDES, si: a ? `on reprend la structure de la pub de ${a}` : 'on reprend la structure de cette pub' }, variable: null };
}

export function departDepuisAccroche(accroche: string | null | undefined): DepartHypothese {
  const a = court(accroche, LONGUEUR_PARTIE_MAX - 40);
  return { parties: { ...PARTIES_VIDES, si: a ? `l’accroche reprend ses mots « ${a} »` : '' }, variable: 'hook' };
}

/**
 * Un apprentissage est une RAISON · il nourrit le « parce que », le reste
 * s'écrit. La variable reprise est celle que portait la variante qui l'a écrit
 * (`tested_variable`), si c'est une variable d'hypothèse · le témoin n'en est pas une.
 *
 * ── Un apprentissage REJETÉ peut-il servir ? Oui, à le retester. ──────────────
 *
 * Les règles existantes le disent déjà · un rejeté est « À retester »
 * (`etatApprentissage`) et son geste mène aux hypothèses (`actionApprentissage`,
 * « Tester ») · ce qu'il ne peut plus être, c'est une règle de la marque
 * (`refusVersRegles`), parce qu'une règle s'applique comme un acquis. Pour la
 * même raison, son énoncé n'entre pas tel quel dans le « parce que » (« ce
 * qu'on sait déjà ») · la phrase dit le FAIT · ce constat a été rejeté et reste
 * à retester.
 */
export function departDepuisApprentissage(enonce: string | null | undefined, o: { variable?: unknown; rejete?: boolean } = {}): DepartHypothese {
  const variable = estVariableHypothese(o.variable) ? o.variable : null;
  if (o.rejete) {
    const e = court(enonce, LONGUEUR_PARTIE_MAX - 60).replace(/[\s.,;:!?…]+$/u, '');
    return { parties: { ...PARTIES_VIDES, parceQue: e ? `le constat « ${e} » a été rejeté et reste à retester` : '' }, variable };
  }
  return { parties: { ...PARTIES_VIDES, parceQue: court(enonce, LONGUEUR_PARTIE_MAX) }, variable };
}

/** La ligne sous le titre du formulaire « En tirer une hypothèse ». */
export const NOTE_DEPART_APPRENTISSAGE = 'Source · cet apprentissage. Il nourrit le « parce que » · le reste s’écrit, l’hypothèse entre dans « À formuler ».';
export const NOTE_DEPART_APPRENTISSAGE_REJETE = 'Source · cet apprentissage, rejeté · il n’est plus une raison acquise, l’hypothèse sert à le retester. Elle entre dans « À formuler ».';
export const noteDepartApprentissage = (o: { rejete?: boolean }) => (o.rejete ? NOTE_DEPART_APPRENTISSAGE_REJETE : NOTE_DEPART_APPRENTISSAGE);

/* ───────────────────────── sur la carte ───────────────────────── */

/** Ce qui manque à l'ad AU-DELÀ de la phrase (offre, page) · la phrase a sa propre ligne. */
const DE_LA_PHRASE = new Set(['l’hypothèse testée', 'la variable testée']);

/**
 * La ligne d'une hypothèse libre sous sa phrase · complétude, ce qu'il reste
 * avant le test (offre, page de destination), provenance. Ex. « Il manque la
 * raison (parce que…) · Idée d’équipe ». `complete` dit si la PHRASE (et sa
 * variable) l'est · l'offre et la page se posent hors de ce formulaire.
 */
export function ligneHypotheseLibre(o: { texte: string | null; variable: string | null; manques: readonly string[]; origine: OrigineHypotheseLibre }): { meta: string; complete: boolean } {
  const parties = lireHypothese(o.texte);
  const c = parties ? completudeHypothese(parties, o.variable) : { complete: false, resume: 'Phrase à reprendre' };
  const reste = o.manques.filter((m) => !DE_LA_PHRASE.has(m));
  const avant = c.complete && reste.length ? ` · avant le test : ${listeManques(reste)}` : '';
  return { meta: `${c.resume}${avant} · ${libelleOrigine(o.origine)}`, complete: c.complete };
}

/* ───────────────────────── qui peut l'écrire, depuis ailleurs ───────────────────────── */

/**
 * Le geste « en faire une hypothèse » hors de Résultats (Veille, persona) · ouvert
 * seulement si la personne écrit dans Adsmap (`adsmap`, mêmes rôle et formule que
 * la garde serveur) ET que la marque visée est la marque ACTIVE (une hypothèse
 * est de la marque active). Fermé, il dit pourquoi · le serveur refuse de toute
 * façon (`adsmapGuard`).
 */
export type AccesHypothese = { ouvert: true; raison: null } | { ouvert: false; raison: string };

export function accesHypothese(o: { adsmap: 'ok' | 'plan' | 'role'; marqueActive: boolean }): AccesHypothese {
  if (o.adsmap === 'plan') return { ouvert: false, raison: 'Les hypothèses vivent dans Adsmap, ouvert à partir de l’offre Plus' };
  if (o.adsmap === 'role') return { ouvert: false, raison: 'Ton rôle ne permet pas d’écrire dans Adsmap' };
  if (!o.marqueActive) return { ouvert: false, raison: 'Une hypothèse se range dans la marque active · ouvre d’abord cette marque' };
  return { ouvert: true, raison: null };
}
