import type { TestedVariable } from '../../adsmap/types';
import { PARTIES_VIDES, LONGUEUR_PARTIE_MAX, VARIABLES_HYPOTHESE, type DepartHypothese } from '../resultats/hypotheses-libres';
import { cleTag, type TagVeille } from './tags-veille';

/**
 * Spatial · Veille · une HYPOTHÈSE depuis un tag RÉCURRENT (VB TG02, SV · lot 6
 * bis V5). Règles PURES · ni base, ni réseau, ni modèle · la page (`/tags`,
 * `/saved`) et l'action (`creerHypotheseAction`, source « tag ») appliquent
 * la MÊME décision.
 *
 * Un tag posé à la main sur plusieurs sauvegardes de la marque dit « ce trait
 * revient dans ce que je garde ». Quand il revient assez, on PROPOSE d'en
 * faire une hypothèse · le formulaire existant s'ouvre pré-rempli (le trait
 * dans le « Si… », le constat dans le « parce que… », la variable quand le tag
 * la nomme), les sauvegardes sont citées comme preuves · rien n'est écrit
 * avant le clic « Ranger dans « À formuler » ». Sous le seuil, AUCUNE
 * proposition · le silence est la réponse la plus fréquente, et la bonne.
 *
 * ── Le seuil, mesuré ─────────────────────────────────────────────────────────
 *
 * Aucune base réelle de tags n'est lisible depuis la session (0070 est neuve).
 * Le seuil est donc mesuré sur les seuls échantillons étiquetés du dépôt, les
 * fragments de la maquette Spatial (`docs/spatial/reference/`, 09/11/2026),
 * chacun de nature connue · le test `lot6bis-seuil-tag-mesure.test.ts` refait
 * ce comptage sur les fichiers et échoue si le tableau ci-dessous ment.
 *
 * | Échantillon                         | nature                         | étiquettes | à 1 | à 2 | à 3 et + |
 * | ----------------------------------- | ------------------------------ | ---------- | --- | --- | -------- |
 * | Pubs du moment · 24 cartes (`.xt.st`) | variété voulue · aucun motif   | 21         | 18  | 3   | 0        |
 * | Sauvegardes · 4 cartes (`.row .pill`) | un trait partagé (Tourne longtemps) | 5     | 4   | 0   | 1        |
 * | Tous les formats · 28 (`.pill`)      | familles · motifs voulus        | 6          | 0   | 0   | 6        |
 *
 * Ce que chaque seuil aurait proposé · « fausses » = une étiquette de
 * l'échantillon SANS motif ; « motifs gardés » = sur les 7 motifs voulus
 * (1 des Sauvegardes, 6 familles de formats) :
 *
 * | N | fausses (sur 21) | motifs gardés (sur 7) |
 * | - | ---------------- | --------------------- |
 * | 2 | 3                | 7                     |
 * | 3 | 0                | 7                     |
 * | 4 | 0                | 5                     |
 * | 5 | 0                | 3                     |
 *
 * Retenu · N = 3, la seule valeur sans fausse proposition qui garde tous les
 * motifs. La marge est prise sur l'autre axe · il faut AUSSI au moins deux
 * annonceurs distincts (`ANNONCEURS_MIN_TAG_RECURRENT`) · trois variantes d'une
 * même pub ne font pas un trait récurrent (même raison que `MIN_ADVERTISERS`
 * des tendances de marché, `adsmap/market-stats.ts`). Les trois paires de
 * l'échantillon sans motif sont toutes à deux annonceurs · c'est le seuil
 * d'effectif, pas celui des annonceurs, qui les écarte.
 *
 * À refaire dès qu'une vraie distribution existe · compter, par marque, les
 * sauvegardes de chaque tag (`lireVocabulaireCompte`, `/tags`), puis réécrire
 * ce tableau · ne jamais déplacer N de tête.
 */

/** Sauvegardes minimales de la marque portant le tag (mesuré · tableau ci-dessus). */
export const SEUIL_TAG_RECURRENT = 3;
/** Annonceurs distincts minimaux parmi ces sauvegardes (marge · une seule pub déclinée n'est pas un motif). */
export const ANNONCEURS_MIN_TAG_RECURRENT = 2;
/**
 * Preuves citées sur l'hypothèse · au plus 50 identifiants gardés (les plus
 * récentes d'abord), le total à côté · une borne de STOCKAGE de
 * `source_ref_json`, pas un seuil · elle ne décide d'aucune proposition.
 */
export const PREUVES_MAX_HYPOTHESE_TAG = 50;

/** Le tableau mesuré, tel qu'écrit plus haut · relu par le test qui le refait sur les fichiers. */
export const MESURE_SEUIL_TAG = {
  sansMotif: { etiquettes: 21, a1: 18, a2: 3, a3: 0 },
  sauvegardes: { etiquettes: 5, a1: 4, a2: 0, a3: 1 },
  formats: { etiquettes: 6, a1: 0, a2: 0, a3: 6 },
  parSeuil: [
    { n: 2, fausses: 3, motifs: 7 },
    { n: 3, fausses: 0, motifs: 7 },
    { n: 4, fausses: 0, motifs: 5 },
    { n: 5, fausses: 0, motifs: 3 },
  ],
} as const;

/** Une sauvegarde qui porte le tag · ce que la règle regarde (rien d'autre). */
export interface SauvegardeTaguee { id: string; annonceur: string | null | undefined }

const annonceurPropre = (a: string | null | undefined): string => (a ?? '').replace(/\s+/g, ' ').trim();

/** Le tag revient-il assez (effectif ET annonceurs distincts) ? */
export function tagRecurrent(sauvegardes: ReadonlyArray<SauvegardeTaguee>): boolean {
  const ids = new Set(sauvegardes.map((s) => s.id));
  const annonceurs = new Set(sauvegardes.map((s) => cleTag(annonceurPropre(s.annonceur) || '·')).filter((a) => a !== '·'));
  return ids.size >= SEUIL_TAG_RECURRENT && annonceurs.size >= ANNONCEURS_MIN_TAG_RECURRENT;
}

/**
 * Les mots qui NOMMENT une variable d'hypothèse dans un tag · le libellé
 * français de la carte (`CATEGORIE_VARIABLE`) et la clé anglaise. Un tag qui
 * en nomme exactement UNE la propose · zéro ou plusieurs · « À choisir »,
 * jamais une devinette. « Son » (libellé d'`audio`) est écarté · c'est aussi
 * le possessif (« Montre son produit ») · seul « audio » nomme le son.
 */
const AMBIGUS = new Set(['son']);
const motsPropres = (s: string): string => cleTag(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const MOTS_VARIABLE: ReadonlyArray<{ cle: TestedVariable; mots: string[] }> = VARIABLES_HYPOTHESE.map((v) => ({
  cle: v.cle,
  mots: [...new Set([motsPropres(v.libelle), motsPropres(v.cle.replace(/_/g, ' '))])].filter((m) => m && !AMBIGUS.has(m)),
}));

/** La variable que le tag NOMME, ou `null` (aucune, ou plusieurs). */
export function variableDepuisTag(nom: string): TestedVariable | null {
  const cle = ` ${motsPropres(nom)} `;
  const trouvees = MOTS_VARIABLE.filter((v) => v.mots.some((m) => cle.includes(` ${m} `)));
  return trouvees.length === 1 ? trouvees[0]!.cle : null;
}

export interface PropositionHypotheseTag {
  tag: TagVeille;
  /** Le départ du formulaire existant · trait et constat, variable si le tag la nomme. */
  depart: DepartHypothese;
  /** Les sauvegardes citées (au plus `PREUVES_MAX_HYPOTHESE_TAG`), dans l'ordre reçu. */
  preuves: Array<{ id: string; annonceur: string }>;
  total: number;
  annonceurs: number;
  /** La ligne sous le titre du formulaire. */
  note: string;
}

const listeAnnonceurs = (noms: readonly string[]): string => {
  if (noms.length <= 3) return noms.join(', ');
  return `${noms.slice(0, 3).join(', ')} et ${noms.length - 3} autre${noms.length - 3 > 1 ? 's' : ''}`;
};

/**
 * La proposition « Formuler une hypothèse » d'un tag, ou `null` sous le seuil.
 * Les sauvegardes passées sont CELLES de la marque qui portent le tag (la page
 * et l'action les lisent dans la portée) · la règle ne les refiltre pas.
 *
 * Ce qui est pré-rempli ne dit que ce qui est SU · le trait (« Si nos pubs
 * reprennent « Hook UGC » »), le constat (« parce que « Hook UGC » revient sur
 * 4 pubs gardées de la Veille, chez 3 annonceurs (…) ») · le résultat attendu
 * (« alors… ») reste à écrire.
 */
export function propositionHypotheseTag(tag: TagVeille, sauvegardes: ReadonlyArray<SauvegardeTaguee>): PropositionHypotheseTag | null {
  const uniques = [...new Map(sauvegardes.map((s) => [s.id, s])).values()];
  if (!tagRecurrent(uniques)) return null;
  const noms: string[] = [];
  const vus = new Set<string>();
  for (const s of uniques) {
    const a = annonceurPropre(s.annonceur);
    const k = cleTag(a);
    if (a && !vus.has(k)) { vus.add(k); noms.push(a.slice(0, 60)); }
  }
  const nom = tag.nom.slice(0, 40);
  const total = uniques.length;
  const constat = `« ${nom} » revient sur ${total} pubs gardées de la Veille, chez ${noms.length} annonceurs (${listeAnnonceurs(noms)})`;
  return {
    tag,
    depart: {
      parties: { ...PARTIES_VIDES, si: `nos pubs reprennent « ${nom} »`, parceQue: constat.slice(0, LONGUEUR_PARTIE_MAX) },
      variable: variableDepuisTag(tag.nom),
    },
    preuves: uniques.slice(0, PREUVES_MAX_HYPOTHESE_TAG).map((s) => ({ id: s.id, annonceur: annonceurPropre(s.annonceur).slice(0, 80) || 'Annonceur' })),
    total,
    annonceurs: noms.length,
    note: `Source · le tag « ${nom} », sur ${total} sauvegardes de la marque · elles sont citées comme preuves. Rien n’est enregistré avant « Ranger dans « À formuler » ».`,
  };
}

/** Le refus de l'action quand le tag ne revient plus assez (retiré entre-temps, autre marque) · même phrase partout. */
export const REFUS_TAG_NON_RECURRENT = `Ce tag ne revient pas sur assez de sauvegardes de la marque active (${SEUIL_TAG_RECURRENT} au moins, chez ${ANNONCEURS_MIN_TAG_RECURRENT} annonceurs) · rien n’a été enregistré.`;
