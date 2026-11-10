import { wilsonInterval, type Interval } from '../../adsmap/stats';
import { lienSauvegardesTag } from '../veille/tags-veille';
import { lienIterationVariable } from '../studios/iterer-variable';
import type { LectureConclusion } from './conclusion-lot';
import {
  entreesLecturePersonas, lecturePersonas, MAX_PERSONAS_LECTURE, MIN_REFERENCE_PERSONA, MIN_VERDICTS_PERSONA, NIVEAU_LECTURE_PERSONA_NOMBREUX, ERREUR_TOLEREE_PERSONA,
  type EntreeLecturePersona, type LecturePersona, type PersonaRef,
} from './lecture-personas';
import { libelleOrigine, PARTIES_VIDES, type DepartHypothese, type OrigineHypotheseLibre } from './hypotheses-libres';
import { lienLotSpatial, type EtatLotSpatial, type FaitsLotSpatial } from './lots';

/**
 * Résultats · BOUCLER LA PREUVE · de l'inspiration au résultat, et retour.
 *
 * Pur · ni base, ni réseau, ni modèle, ni horloge. Trois règles :
 *
 *  1. le RÉSULTAT d'une hypothèse · une fois le lot qui la teste conclu, la
 *     carte dit « Confirmée », « Infirmée » ou « Sans conclusion », avec son
 *     chiffre clé et le lien vers le lot. Le statut est CALCULÉ depuis la
 *     conclusion du lot (`conclusionLot`, lot 3) · jamais saisi ni recopié ;
 *  2. le BILAN PAR PROVENANCE · d'où viennent les hypothèses qui gagnent
 *     (tag de Veille, apprentissage, à la main…) · chaque provenance contre le
 *     RESTE de la marque, effectif minimum, intervalles disjoints · le silence
 *     est la conclusion par défaut ;
 *  3. les GESTES depuis la lecture par persona (VB P06) · quand un persona se
 *     détache, « Itérer sur ce persona » et « Créer une hypothèse » ouvrent les
 *     écrans EXISTANTS pré-remplis · rien n'est écrit sans le clic · la même
 *     règle pour une offre (`gestesLectureGroupe`), sur la fiche persona et la
 *     fiche offre (« Dans les tests »).
 *
 * Et la provenance « Jarvis » d'un test créé depuis un geste de Jarvis
 * (`provenanceJarvisAdmise`), lue à part dans le bilan · et la provenance
 * « Offre » d'une hypothèse créée depuis une offre qui se détache
 * (`provenanceOffreAdmise`), posée seulement après relecture de l'offre dans la
 * marque active · et la provenance « Commentaire » d'une itération créée depuis
 * un commentaire posé sur une création testée (`provenanceCommentaireAdmise`),
 * posée seulement après relecture du commentaire dans la portée (espace, marque
 * active, projet) et quand la pub de départ est celle de la création commentée.
 */

/* ───────────────────────── 1 · le résultat d'une hypothèse ───────────────────────── */

export type StatutResultatHypothese = 'confirmee' | 'infirmee' | 'sans_conclusion';

export const LIBELLE_RESULTAT_HYPOTHESE: Record<StatutResultatHypothese, string> = {
  confirmee: 'Confirmée', infirmee: 'Infirmée', sans_conclusion: 'Sans conclusion',
};

export interface ResultatHypotheseCarte {
  statut: StatutResultatHypothese;
  libelle: string;
  classe: '' | 'g' | 'r';
  icone: 'check' | 'x' | 'q';
  /** Le chiffre clé · un compte de verdicts et ses bornes, ou la raison du silence (effectif, référence, historique). */
  chiffre: string;
  lot: { numero: number; href: string };
}

/**
 * Les états où le lot est CONCLU · toutes ses variantes arbitrées (`conclu`),
 * ou un historique repris du tableau (`importe`, qui ne peut rien confirmer).
 * Avant (en diffusion, à conclure), la carte garde son avancement.
 */
const CONCLUS: ReadonlySet<EtatLotSpatial> = new Set<EtatLotSpatial>(['conclu', 'importe']);

const pc = (x: number) => `${Math.round(x * 100)} %`;
const plage = (i: Interval) => `${pc(i.lo)} à ${pc(i.hi)}`;
const pl = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
const niveauFr = (n: number) => String(n).replace('.', ',');

/**
 * Le résultat d'une hypothèse portée par une variante du lot · `null` tant que
 * le lot n'est pas conclu (la carte reste « En test »). Le statut est celui de
 * la conclusion du lot · confirmée et infirmée seulement quand l'intervalle du
 * lot exclut celui de la marque, tout le reste est « Sans conclusion ».
 */
export function resultatHypothese(lot: { id: string; numero: number; etat: EtatLotSpatial } | null, conclusion: LectureConclusion | null | undefined): ResultatHypotheseCarte | null {
  if (!lot || !conclusion || !CONCLUS.has(lot.etat) || conclusion.conclusion === 'en_attente') return null;
  const statut: StatutResultatHypothese = conclusion.conclusion === 'confirmee' ? 'confirmee' : conclusion.conclusion === 'infirmee' ? 'infirmee' : 'sans_conclusion';
  const chiffre = conclusion.lot && conclusion.reference
    ? `${pl(conclusion.lot.k, 'gagnante', 'gagnantes')} sur ${pl(conclusion.lot.n, 'variante tranchée', 'variantes tranchées')} (${plage(conclusion.lot.intervalle)}) · la marque, ${conclusion.reference.k} sur ${conclusion.reference.n} dans ses autres lots (${plage(conclusion.reference.intervalle)})`
    : conclusion.phrase.replace(/[\s.]+$/u, '');
  return {
    statut, libelle: LIBELLE_RESULTAT_HYPOTHESE[statut],
    classe: statut === 'confirmee' ? 'g' : statut === 'infirmee' ? 'r' : '',
    icone: statut === 'confirmee' ? 'check' : statut === 'infirmee' ? 'x' : 'q',
    chiffre,
    lot: { numero: lot.numero, href: lienLotSpatial(lot.id) },
  };
}

/* ───────────────────────── la provenance, rappelée sur la carte ───────────────────────── */

export interface ProvenanceCarte { libelle: string; href: string | null; lien: string | null }

/**
 * Ce que la carte rappelle de la provenance d'une hypothèse libre, avec le lien
 * vers sa source quand elle en a une · le tag (les Sauvegardes filtrées sur sa
 * clé), l'apprentissage (la page des apprentissages), le persona (la fiche de
 * la marque active). Une pub de la Veille et une idée d'équipe n'ont pas de
 * page à elles · le libellé seul.
 */
export function provenanceCarte(o: OrigineHypotheseLibre, opts: { marqueId?: string | null } = {}): ProvenanceCarte {
  const libelle = libelleOrigine(o);
  if (o.type === 'tag' && o.cle) return { libelle, href: lienSauvegardesTag(o.cle), lien: `Voir les sauvegardes du tag « ${o.tag} »` };
  if (o.type === 'apprentissage') return { libelle, href: '/adsmap/apprentissages', lien: 'Voir les apprentissages' };
  if (o.type === 'persona' && opts.marqueId && /^[0-9a-f-]{36}$/i.test(opts.marqueId)) return { libelle, href: `/brands/${opts.marqueId}/personas`, lien: 'Voir les personas' };
  if (o.type === 'offre' && opts.marqueId && /^[0-9a-f-]{36}$/i.test(opts.marqueId)) return { libelle, href: `/brands/${opts.marqueId}/offre`, lien: 'Voir les offres' };
  return { libelle, href: null, lien: null };
}

/* ───────────────────────── 2 · le bilan par provenance ───────────────────────── */

/**
 * D'où vient un test · la provenance de l'hypothèse libre gardée sur l'ad
 * (`source_ref_json.hypotheseLibre`), sinon un GESTE DE JARVIS (la provenance
 * Jarvis gardée sur l'ad, `source_ref_json.jarvis`, posée par le serveur
 * seulement après avoir relu la réponse dans la portée · `provenanceJarvisAdmise`),
 * sinon une ITÉRATION d'une gagnante (`ad_type = iteration` · moteur, écran
 * Itérer), sinon rien · un test sans provenance lue reste dans la référence, il
 * ne forme pas de groupe. Entre Jarvis et l'itération ordinaire · un COMMENTAIRE
 * relu (`source_ref_json.commentaire`, `provenanceCommentaireAdmise`).
 */
export type ProvenanceTest = 'tag' | 'veille' | 'apprentissage' | 'persona' | 'offre' | 'libre' | 'jarvis' | 'commentaire' | 'iteration';

/**
 * L'ordre et les mots du bilan · neuf provenances. La règle mesurée en lit au
 * plus six à la fois (`MAX_PERSONAS_LECTURE`) · si sept, huit ou neuf ont assez
 * de verdicts pour parler, le bilan se tait et le dit (non mesuré au-delà). Une
 * provenance sous l'effectif ne parle pas · ses verdicts restent dans le reste
 * de la marque, exactement comme un test sans provenance (le U de la mesure) ·
 * passer de huit à neuf provenances (« Commentaire ») ne change donc ni K (au
 * plus six) ni la borne de U · aucun seuil à remesurer (voir le tableau plus bas).
 */
export const PROVENANCES_TEST: ReadonlyArray<{ cle: ProvenanceTest; libelle: string }> = [
  { cle: 'tag', libelle: 'Tag de Veille récurrent' },
  { cle: 'veille', libelle: 'Pub de la Veille' },
  { cle: 'apprentissage', libelle: 'Apprentissage' },
  { cle: 'persona', libelle: 'Persona' },
  { cle: 'offre', libelle: 'Offre' },
  { cle: 'libre', libelle: 'À la main' },
  { cle: 'jarvis', libelle: 'Geste de Jarvis' },
  { cle: 'commentaire', libelle: 'Commentaire' },
  { cle: 'iteration', libelle: 'Itération d’une gagnante' },
];

export const NOTE_JARVIS_PROVENANCE = 'Une itération créée depuis une réponse de Jarvis compte dans « Geste de Jarvis » · seulement quand la réponse a été relue dans ta marque au moment de la créer · les autres comptent dans « Itération d’une gagnante ».';
export const NOTE_COMMENTAIRE_PROVENANCE = 'Une itération créée depuis un commentaire compte dans « Commentaire » · seulement quand le commentaire a été relu dans ta marque, sur une création du projet testée par la pub de départ, au moment de la créer · sinon elle compte dans « Itération d’une gagnante ».';
export const NOTE_OFFRE_PROVENANCE = 'Une hypothèse créée depuis une offre qui se détache compte dans « Offre » · seulement quand l’offre a été relue dans ta marque au moment de la créer · sinon elle compte « À la main ».';

export function provenanceDuTest(t: { origine: OrigineHypotheseLibre | null | undefined; typeAd?: string | null; jarvis?: ProvenanceJarvis | null; commentaire?: ProvenanceCommentaire | null }): ProvenanceTest | null {
  if (t.origine) return t.origine.type;
  if (t.jarvis) return 'jarvis';
  if (t.commentaire) return 'commentaire';
  return t.typeAd === 'iteration' ? 'iteration' : null;
}

/* ───────────────────────── la provenance « Jarvis » ───────────────────────── */

/**
 * Un test créé depuis un geste de Jarvis (« Créer l'itération » sous une
 * réponse, lot 5 bis et 5 ter) · la réponse et le contexte de ce geste. Gardée
 * dans le JSON de source de l'ad (`source_ref_json.jarvis`, aucune colonne) ·
 * jamais crue depuis l'adresse · le serveur ne la pose qu'après avoir relu la
 * réponse dans la portée de la session ET retrouvé la pub de départ dans le
 * contexte relu (`provenanceJarvisAdmise`).
 */
export interface ProvenanceJarvis { reponseId: string; contexte: { type: 'lot' | 'hypothese' | 'projet'; id: string } }

export const CLE_PROVENANCE_JARVIS = 'jarvis';

const UUID_PROVENANCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES_CONTEXTE_JARVIS: ReadonlySet<string> = new Set(['lot', 'hypothese', 'projet']);

/** Ce que l'écran envoie (ou ce que le JSON garde), relu · `null` dès qu'un champ est mal formé · rien n'est deviné. */
export function lireDemandeProvenanceJarvis(x: unknown): ProvenanceJarvis | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const c = o.contexte as Record<string, unknown> | null | undefined;
  if (typeof o.reponseId !== 'string' || !UUID_PROVENANCE.test(o.reponseId) || !c || typeof c !== 'object') return null;
  if (typeof c.type !== 'string' || !TYPES_CONTEXTE_JARVIS.has(c.type) || typeof c.id !== 'string' || !UUID_PROVENANCE.test(c.id)) return null;
  return { reponseId: o.reponseId.toLowerCase(), contexte: { type: c.type as ProvenanceJarvis['contexte']['type'], id: c.id.toLowerCase() } };
}

/** La valeur à fusionner dans `source_ref_json` de l'ad créée. */
export function refProvenanceJarvis(p: ProvenanceJarvis): Record<string, unknown> {
  return { [CLE_PROVENANCE_JARVIS]: { reponseId: p.reponseId, contexte: { type: p.contexte.type, id: p.contexte.id } } };
}

/** Relit la provenance Jarvis d'une ad · `null` sans elle (ou JSON abîmé). */
export function lireProvenanceJarvis(sourceRef: unknown): ProvenanceJarvis | null {
  if (!sourceRef || typeof sourceRef !== 'object') return null;
  return lireDemandeProvenanceJarvis((sourceRef as Record<string, unknown>)[CLE_PROVENANCE_JARVIS]);
}

/**
 * La provenance Jarvis est-elle posée sur l'itération créée ? Seulement si la
 * réponse a été RELUE dans la portée (espace, marque active, personne · le fil
 * du projet pour un projet) et si la pub de départ est l'une des pubs du
 * contexte RELU dans la marque (lot, hypothèse, gagnantes du projet). Sinon
 * `null` · l'itération naît comme une itération ordinaire, sans rien dire de
 * ce que l'adresse prétendait.
 */
export function provenanceJarvisAdmise(demande: ProvenanceJarvis | null, lu: { reponseLue: boolean; parentAdId: string; adsDuContexte: readonly string[] | null }): ProvenanceJarvis | null {
  if (!demande || !lu.reponseLue || !lu.adsDuContexte) return null;
  const parent = lu.parentAdId.toLowerCase();
  return lu.adsDuContexte.some((id) => id.toLowerCase() === parent) ? demande : null;
}

/* ───────────────────────── la provenance « Commentaire » ───────────────────────── */

/**
 * Une itération créée depuis « Itérer depuis ce commentaire » (onglet Activité
 * d'un projet) · le commentaire et son projet. Gardée dans le JSON de source de
 * l'ad (`source_ref_json.commentaire`, aucune colonne, aucune migration) ·
 * jamais crue depuis l'adresse · le serveur ne la pose qu'après avoir RELU le
 * commentaire dans la portée (espace, marque active, projet de la portée
 * Studios, création du projet) ET retrouvé, sur la création commentée, le
 * lien de test vers la pub de départ (`provenanceCommentaireAdmise`). Le texte
 * du commentaire n'est jamais recopié ici · l'identifiant suffit.
 */
export interface ProvenanceCommentaire { commentaireId: string; projetId: string }

export const CLE_PROVENANCE_COMMENTAIRE = 'commentaire';

/** Ce que l'écran envoie (ou ce que le JSON garde), relu · `null` dès qu'un champ est mal formé · rien n'est deviné. */
export function lireDemandeProvenanceCommentaire(x: unknown): ProvenanceCommentaire | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.commentaireId !== 'string' || !UUID_PROVENANCE.test(o.commentaireId)) return null;
  if (typeof o.projetId !== 'string' || !UUID_PROVENANCE.test(o.projetId)) return null;
  return { commentaireId: o.commentaireId.toLowerCase(), projetId: o.projetId.toLowerCase() };
}

/** La valeur à fusionner dans `source_ref_json` de l'ad créée. */
export function refProvenanceCommentaire(p: ProvenanceCommentaire): Record<string, unknown> {
  return { [CLE_PROVENANCE_COMMENTAIRE]: { commentaireId: p.commentaireId, projetId: p.projetId } };
}

/** Relit la provenance « Commentaire » d'une ad · `null` sans elle (ou JSON abîmé). */
export function lireProvenanceCommentaire(sourceRef: unknown): ProvenanceCommentaire | null {
  if (!sourceRef || typeof sourceRef !== 'object') return null;
  return lireDemandeProvenanceCommentaire((sourceRef as Record<string, unknown>)[CLE_PROVENANCE_COMMENTAIRE]);
}

/**
 * La provenance « Commentaire » est-elle posée sur l'itération créée ?
 * Seulement si le commentaire a été RELU dans la portée (`adDuCommentaire` ·
 * la pub de test de la création commentée, `null` hors portée, autre projet,
 * autre marque, commentaire sur une version, création non testée) et si la pub
 * de départ est CETTE pub. Sinon `null` · l'itération naît ordinaire, sans
 * rien dire de ce que l'adresse prétendait.
 */
export function provenanceCommentaireAdmise(demande: ProvenanceCommentaire | null, lu: { adDuCommentaire: string | null; parentAdId: string }): ProvenanceCommentaire | null {
  if (!demande || !lu.adDuCommentaire) return null;
  return lu.adDuCommentaire.toLowerCase() === lu.parentAdId.toLowerCase() ? demande : null;
}

/* ───────────────────────── la provenance « Offre » ───────────────────────── */

const UUID_OFFRE = UUID_PROVENANCE;

/**
 * Ce que l'écran envoie pour une hypothèse née d'une offre, relu · l'identifiant
 * seul (jamais l'intitulé, relu en base) · `null` dès qu'il est mal formé.
 */
export function lireDemandeProvenanceOffre(x: unknown): string | null {
  if (!x || typeof x !== 'object') return null;
  const id = (x as Record<string, unknown>).offreId;
  return typeof id === 'string' && UUID_OFFRE.test(id) ? id.toLowerCase() : null;
}

/**
 * La provenance d'une hypothèse née d'une offre · « Offre » SEULEMENT si l'offre
 * demandée a été RELUE dans la marque active (espace ET marque, archivée
 * comprise · elle a été diffusée) et que c'est bien elle · sinon l'hypothèse naît
 * « À la main », sans rien dire de ce que l'adresse prétendait (une offre d'une
 * autre marque n'existe pas ici).
 */
export function provenanceOffreAdmise(demande: string | null, lue: { id: string; intitule: string } | null): OrigineHypotheseLibre {
  if (!demande || !lue || lue.id.toLowerCase() !== demande.toLowerCase()) return { type: 'libre' };
  return { type: 'offre', offre: lue.intitule.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Offre', offreId: lue.id };
}

const REF_PROVENANCE = new Map<ProvenanceTest, PersonaRef>(PROVENANCES_TEST.map((p) => [p.cle, { id: p.cle, nom: p.libelle }]));

/** Les entrées du bilan · les variantes des lots SUIVIS (la même lecture que celle des personas), chacune avec sa provenance. */
export function entreesBilanProvenances(lots: readonly FaitsLotSpatial[], provenanceDe: (adId: string) => ProvenanceTest | null): EntreeLecturePersona[] {
  return entreesLecturePersonas(lots, (adId) => { const p = provenanceDe(adId); return p ? REF_PROVENANCE.get(p)! : null; });
}

/**
 * ── Les seuils, MESURÉS (jamais posés d'instinct) ───────────────────────────
 *
 * La règle est celle de la lecture par persona (`lecturePersonas` · chaque
 * groupe contre le RESTE de la marque, 4 verdicts tranchés au moins de chaque
 * côté, intervalles de Wilson disjoints, 6 groupes au plus) · elle est RÉUTILISÉE
 * telle quelle. Mais son niveau a été mesuré avec au plus 4 verdicts hors
 * personas (U 0 ou 4) · ici, le reste est le gros des tests (tout ce qui n'est
 * ni une hypothèse libre ni une itération) · U peut valoir des dizaines.
 * Mesure exacte (loi binomiale, programmation dynamique sur le total, aucun
 * tirage · script et sorties dans la PR), K provenances de n verdicts (4 à 12),
 * U verdicts hors provenances, tous au même taux p0 (0,1 à 0,7) · erreur de
 * FAMILLE (au moins une provenance détachée à tort), pire cas :
 *
 *   niveau  K   U=0    U=4    U=10   U=20   U=40   U=80   U=160
 *   0,95    2   0,031  0,045  0,058  0,067  0,080  0,130  0,190
 *   0,95    3   0,079  0,098  0,093  0,109  0,153  0,186  0,268
 *   0,95    4   0,110  0,111  0,125  0,156  0,198  0,268  0,352   (le niveau des personas à K ≤ 4)
 *   0,975   4   0,031  0,031  0,039  0,040  0,055  0,075  0,105
 *   0,975   6   0,059  0,059  0,060  0,065  0,082  0,120  0,152   ← retenu jusqu'à U = 80
 *   0,99    6   0,010  0,011  0,012  0,014  0,021  0,028  0,044   ← retenu de 81 à 160
 *
 *   tailles inégales (niveau 0,975, U 0 · 20 · 80) · 30,4,4 · 0,020 0,025 0,043 ·
 *   30,10,6,4 · 0,027 0,035 0,050 · 20,20,4,4,4,4 · 0,055 0,070 0,096 ·
 *   16 ×6 · 0,051 0,060 0,074 · 4 ×6 · 0,024 0,054 0,110 ·
 *   (niveau 0,99, U 160) · pire 0,042.
 *
 *   puissance médiane (une provenance deux fois meilleure, K=3, U=20, n 6 à 12)
 *   0,95 · 0,227    0,975 · 0,115    0,99 · 0,040
 *
 * Choix, avec marge · erreur tolérée 15 % au plus (`ERREUR_TOLEREE_PERSONA`,
 * la même que les personas et la conclusion d'un lot) · le niveau des personas
 * à 4 groupes (0,95) dépasse dès U = 20 (15,6 %) · retenu 0,975 (la constante
 * des personas nombreux, `NIVEAU_LECTURE_PERSONA_NOMBREUX`) tant que le reste
 * hors provenances lues compte au plus 80 verdicts (pire 12,0 %), 0,99 de 81 à
 * 160 (pire 4,4 %), silence au-delà (U infini · 0,975 monte à 55 %, non mesuré
 * entre 160 et l'infini). Le niveau n'est jamais plus bas que celui de
 * `lecturePersonas` · une provenance ne parle que si `lecturePersonas` la
 * détache ET que ses intervalles restent disjoints au niveau mesuré ici.
 * Puissance faible (≈ 11 %) · attendu, le bilan se tait le plus souvent et le dit.
 *
 * ── Huit puis neuf provenances (« Offre », « Dans les tests », « Commentaire ») ─
 *
 * La mesure porte sur K provenances QUI ONT LE DROIT DE PARLER (au plus six) et
 * sur U verdicts hors d'elles. Une provenance sous l'effectif n'est pas lue ·
 * ses verdicts sont dans le reste de la marque, au même titre qu'un test sans
 * provenance (sous l'hypothèse nulle, tous au même taux) · ils comptent dans U,
 * borné ici à 160. Ajouter une provenance au catalogue ne change donc ni K ni
 * la borne de U · aucune nouvelle mesure n'est nécessaire, aucun seuil ne
 * change · au-delà de six provenances qui parlent, le bilan se tait et le dit.
 * Le test du noyau le vérifie · un bilan à huit provenances dont deux sous
 * l'effectif rend exactement les mêmes intervalles qu'un bilan où ces deux-là
 * n'auraient aucune provenance.
 */
export const NIVEAU_BILAN_PROVENANCE = NIVEAU_LECTURE_PERSONA_NOMBREUX;
/** Le niveau quand le reste hors provenances est gros · mesuré. */
export const NIVEAU_BILAN_PROVENANCE_VOLUME = 0.99;
/** Verdicts hors provenances lues jusqu'où `NIVEAU_BILAN_PROVENANCE` tient l'erreur sous 15 % · mesuré. */
export const RESTE_MAX_NIVEAU_BILAN = 80;
/** Au-delà, l'erreur n'est pas mesurée · le bilan se tait. */
export const RESTE_MAX_BILAN = 160;
export const ERREUR_TOLEREE_BILAN = ERREUR_TOLEREE_PERSONA;

/** Le niveau selon le reste hors provenances qui ont le droit de parler · `null` au-delà du mesuré. */
export function niveauBilanProvenances(reste: number): number | null {
  if (reste <= RESTE_MAX_NIVEAU_BILAN) return NIVEAU_BILAN_PROVENANCE;
  if (reste <= RESTE_MAX_BILAN) return NIVEAU_BILAN_PROVENANCE_VOLUME;
  return null;
}

export type LectureProvenance = LecturePersona | 'non_mesure';

export interface GroupeProvenance {
  cle: ProvenanceTest;
  libelle: string;
  lecture: LectureProvenance;
  k: number;
  n: number;
  intervalle: Interval | null;
  reference: { k: number; n: number; intervalle: Interval } | null;
  phrase: string;
}

export interface BilanProvenances {
  parle: boolean;
  niveau: number | null;
  /** Variantes tranchées au protocole (le taux général) · `k` gagnantes. */
  general: { k: number; n: number };
  /** Variantes tranchées hors des provenances qui ont le droit de parler. */
  reste: number;
  groupes: GroupeProvenance[];
  phrase: string;
  regle: string;
}

/** La règle, dite à l'écran sous le bilan · les seuils des modules, jamais recopiés. */
export function regleBilanProvenances(): string {
  return `Règle · une hypothèse gagne quand sa variante est tranchée gagnante au protocole · au moins ${MIN_VERDICTS_PERSONA} variantes tranchées pour une provenance et ${MIN_REFERENCE_PERSONA} dans le reste de la marque · l’intervalle de la provenance doit exclure celui du reste (niveau ${niveauFr(NIVEAU_BILAN_PROVENANCE)}, ${niveauFr(NIVEAU_BILAN_PROVENANCE_VOLUME)} au-delà de ${RESTE_MAX_NIVEAU_BILAN} variantes hors provenances, silence au-delà de ${RESTE_MAX_BILAN}) · ${PROVENANCES_TEST.length} provenances, ${MAX_PERSONAS_LECTURE} lues au plus à la fois, silence au-delà.`;
}

/**
 * Le bilan par provenance · `lecturePersonas` lit les groupes (effectifs,
 * référence, détachement à son niveau) · une provenance qu'elle détache ne
 * parle ici que si ses intervalles restent disjoints au niveau MESURÉ pour ce
 * bilan (`niveauBilanProvenances`). Chaque nombre est un compte de verdicts ou
 * une borne d'intervalle.
 */
export function bilanProvenances(entrees: readonly EntreeLecturePersona[]): BilanProvenances {
  const refs = PROVENANCES_TEST.map((p) => REF_PROVENANCE.get(p.cle)!);
  const l = lecturePersonas(entrees, refs);
  const general = { k: entrees.filter((e) => e.issue === 'gagne').length, n: l.tranchees };
  const eligibles = l.groupes.filter((g) => g.lecture !== 'effectif' && g.lecture !== 'reference');
  const reste = general.n - eligibles.reduce((s, g) => s + g.n, 0);
  const tropDeProvenances = eligibles.length > MAX_PERSONAS_LECTURE;
  const niveau = eligibles.length && !tropDeProvenances ? niveauBilanProvenances(reste) : null;

  const groupes: GroupeProvenance[] = l.groupes.map((g) => {
    const cle = g.persona.id as ProvenanceTest;
    const base = { cle, libelle: g.persona.nom, k: g.k, n: g.n };
    if (g.lecture === 'effectif') {
      return { ...base, lecture: 'effectif', intervalle: null, reference: null, phrase: `${pl(g.n, 'variante tranchée', 'variantes tranchées')} · il en faut ${MIN_VERDICTS_PERSONA} pour qu’une provenance ait le droit de parler.` };
    }
    if (g.lecture === 'reference') {
      return { ...base, lecture: 'reference', intervalle: null, reference: null, phrase: `Le reste de la marque n’a que ${pl(general.n - g.n, 'variante tranchée', 'variantes tranchées')} · il en faut ${MIN_REFERENCE_PERSONA} pour servir de référence.` };
    }
    if (niveau === null) {
      return { ...base, lecture: 'non_mesure', intervalle: null, reference: null, phrase: `${pl(g.k, 'gagnante', 'gagnantes')} sur ${pl(g.n, 'variante tranchée', 'variantes tranchées')} · ${tropDeProvenances ? `plus de ${MAX_PERSONAS_LECTURE} provenances parlent` : 'à ce volume'}, la règle n’est pas mesurée et se tait.` };
    }
    const ref = { k: general.k - g.k, n: general.n - g.n };
    const ip = wilsonInterval(g.k, g.n, niveau);
    const ir = wilsonInterval(ref.k, ref.n, niveau);
    const reference = { ...ref, intervalle: ir };
    const faits = `${pl(g.k, 'gagnante', 'gagnantes')} sur ${pl(g.n, 'variante tranchée', 'variantes tranchées')} (${plage(ip)})`;
    const autre = `reste de la marque, ${ref.k} sur ${ref.n} (${plage(ir)})`;
    // Détachée par la règle des personas ET disjointe au niveau mesuré ici · sinon dans le bruit.
    if (g.lecture === 'au_dessus' && ip.lo > ir.hi) return { ...base, lecture: 'au_dessus', intervalle: ip, reference, phrase: `${faits} · nettement au-dessus du ${autre}.` };
    if (g.lecture === 'en_dessous' && ip.hi < ir.lo) return { ...base, lecture: 'en_dessous', intervalle: ip, reference, phrase: `${faits} · nettement en dessous du ${autre}.` };
    return { ...base, lecture: 'dans_le_bruit', intervalle: ip, reference, phrase: `${faits} · l’écart avec le ${autre} reste dans le bruit.` };
  });

  const parle = groupes.some((g) => g.lecture === 'au_dessus' || g.lecture === 'en_dessous');
  let phrase: string;
  if (!general.n) phrase = 'Aucune variante tranchée au protocole · rien à lire par provenance pour l’instant.';
  else if (!eligibles.length) phrase = `Aucune provenance n’a encore ${MIN_VERDICTS_PERSONA} variantes tranchées · le bilan se tait, faute d’effectif.`;
  else if (tropDeProvenances) phrase = `${eligibles.length} provenances ont assez de verdicts · au-delà de ${MAX_PERSONAS_LECTURE}, la règle n’est pas mesurée · le bilan se tait.`;
  else if (niveau === null) phrase = `${pl(reste, 'variante tranchée', 'variantes tranchées')} hors des provenances lues · au-delà de ${RESTE_MAX_BILAN}, la règle n’est pas mesurée · le bilan se tait.`;
  else if (!parle) phrase = 'Aucune provenance ne se détache du reste de la marque · le silence est la conclusion par défaut, il ne dit pas que les provenances se valent.';
  else {
    const d = groupes.filter((g) => g.lecture === 'au_dessus' || g.lecture === 'en_dessous').map((g) => `${g.libelle} ${g.lecture === 'au_dessus' ? 'au-dessus' : 'en dessous'}`);
    phrase = `${d.join(' · ')} du reste de la marque, intervalles disjoints au niveau ${niveauFr(niveau)}.`;
  }
  return { parle, niveau, general, reste, groupes, phrase, regle: regleBilanProvenances() };
}

/* ───────────────────────── 3 · les gestes depuis la lecture par persona (P06) ───────────────────────── */

export const RAISON_ITERER_SANS_GAGNANTE = 'Aucune gagnante arbitrée de ce persona dans le plan d’itération · Itérer part d’une pub gagnante.';
export const NOTE_GESTES_SILENCE = 'Aucun persona de ce lot ne se détache · ni itération ni hypothèse à proposer depuis cette lecture.';

const prenom = (n: string) => n.split(',')[0]!.trim();

/**
 * Le départ du formulaire d'hypothèse existant, depuis un persona qui se
 * détache · ce que la lecture DIT (le persona, ses verdicts contre le reste) ·
 * ni résultat attendu ni variable inventés, ils restent à écrire.
 */
export function departDepuisLecturePersona(g: { nom: string; lecture: 'au_dessus' | 'en_dessous'; k: number; n: number; reference: { k: number; n: number } }): DepartHypothese {
  const p = prenom(g.nom);
  const chiffres = `${g.k} sur ${g.n} contre ${g.reference.k} sur ${g.reference.n}`;
  return g.lecture === 'au_dessus'
    ? { parties: { ...PARTIES_VIDES, si: `on décline nos prochaines créas pour ${p}`, parceQue: `ses variantes gagnent nettement plus souvent que le reste de la marque (${chiffres})` }, variable: null }
    : { parties: { ...PARTIES_VIDES, si: `on change d’approche pour ${p}`, parceQue: `ses variantes gagnent nettement moins souvent que le reste de la marque (${chiffres})` }, variable: null };
}

export const noteDepartLecturePersona = (numero: number) => `Source · la lecture par persona du lot #${numero}. Le « parce que » cite ses verdicts · le reste s’écrit, l’hypothèse entre dans « À formuler ».`;

export type GesteIterer = { href: string; adId: string; raison: null } | { href: null; adId: null; raison: string };

export interface GestesPersona {
  personaId: string;
  nom: string;
  iterer: GesteIterer;
  hypothese: { depart: DepartHypothese; note: string };
}

/* ── généralisé · persona ou offre (fiche persona, fiche offre, fiche d'un lot) ── */

export type GroupeGestes = 'persona' | 'offre';

/**
 * D'où part l'hypothèse du geste · un persona et une offre sont des provenances,
 * relues dans la marque active par `creerHypotheseAction` (un persona d'ailleurs
 * est refusé · une offre d'ailleurs ne pose aucune provenance, `provenanceOffreAdmise`).
 */
export type SourceGesteHypothese = { type: 'persona'; personaId: string } | { type: 'offre'; offreId: string } | { type: 'libre' };

export interface GestesLecture {
  groupe: GroupeGestes;
  id: string;
  nom: string;
  libelles: { iterer: string; hypothese: string; titre: string };
  iterer: GesteIterer;
  hypothese: { depart: DepartHypothese; note: string; source: SourceGesteHypothese };
}

export const RAISON_ITERER_OFFRE_SANS_GAGNANTE = 'Aucune gagnante arbitrée de cette offre dans le plan d’itération · Itérer part d’une pub gagnante.';
export const NOTE_GESTES_FICHE_PERSONA = 'Source · la lecture par persona de la marque. Le « parce que » cite ses verdicts · le reste s’écrit, l’hypothèse entre dans « À formuler ».';
export const NOTE_GESTES_FICHE_OFFRE = 'Source · la lecture par offre de la marque. Le « parce que » cite ses verdicts · le reste s’écrit, l’hypothèse entre dans « À formuler », provenance « Offre ».';
export const noteDepartLectureOffre = (numero: number) => `Source · la lecture par offre du lot #${numero}. Le « parce que » cite ses verdicts · le reste s’écrit, l’hypothèse entre dans « À formuler », provenance « Offre ».`;
export const NOTE_GESTES_OFFRE_SILENCE = 'Aucune offre de ce lot ne se détache · ni itération ni hypothèse à proposer depuis cette lecture.';
export const noteGestesSilenceFiche = (ce: string) => `${ce} ne se détache pas du reste de la marque · ni itération ni hypothèse à proposer depuis cette lecture.`;

/**
 * Le départ du formulaire d'hypothèse existant, depuis une offre qui se
 * détache · l'offre citée, ses verdicts contre le reste · la variable testée
 * est l'offre (c'est elle que la lecture sépare) · le résultat attendu reste à écrire.
 */
export function departDepuisLectureOffre(g: { nom: string; lecture: 'au_dessus' | 'en_dessous'; k: number; n: number; reference: { k: number; n: number } }): DepartHypothese {
  const o = g.nom.replace(/\s+/g, ' ').trim();
  const chiffres = `${g.k} sur ${g.n} contre ${g.reference.k} sur ${g.reference.n}`;
  return g.lecture === 'au_dessus'
    ? { parties: { ...PARTIES_VIDES, si: `on met l’offre « ${o} » dans nos prochaines créas`, parceQue: `ses variantes gagnent nettement plus souvent que le reste de la marque (${chiffres})` }, variable: 'offer' }
    : { parties: { ...PARTIES_VIDES, si: `on remplace l’offre « ${o} » dans nos prochaines créas`, parceQue: `ses variantes gagnent nettement moins souvent que le reste de la marque (${chiffres})` }, variable: 'offer' };
}

/**
 * Les gestes d'un groupe de la lecture (persona, offre) · SEULEMENT s'il se
 * détache (au-dessus ou en dessous, intervalles disjoints · `lectureParGroupe`)
 * · `null` sinon, et l'écran dit pourquoi.
 *
 * « Itérer » part d'une gagnante ARBITRÉE de ce groupe QUI EST dans le plan
 * d'itération de la marque (`planIds` · le plan ne porte que des gagnantes
 * arbitrées) · les tests `prioritaires` d'abord (ceux du lot affiché), sinon le
 * premier de la marque (ordre passé) · aucun, le geste est fermé avec sa raison.
 */
export function gestesLectureGroupe(
  g: { ref: PersonaRef; lecture: LecturePersona; k: number; n: number; reference: { k: number; n: number } | null },
  o: { groupe: GroupeGestes; note: string; prioritaires: readonly string[]; testsDeLaMarque: readonly string[]; planIds: ReadonlySet<string> },
): GestesLecture | null {
  if ((g.lecture !== 'au_dessus' && g.lecture !== 'en_dessous') || !g.reference) return null;
  const adId = [...o.prioritaires, ...o.testsDeLaMarque].find((id) => o.planIds.has(id)) ?? null;
  const persona = o.groupe === 'persona';
  const court = persona ? prenom(g.ref.nom) : g.ref.nom.replace(/\s+/g, ' ').trim();
  const faits = { nom: g.ref.nom, lecture: g.lecture, k: g.k, n: g.n, reference: g.reference };
  return {
    groupe: o.groupe, id: g.ref.id, nom: g.ref.nom,
    libelles: { iterer: persona ? 'Itérer sur ce persona' : 'Itérer sur cette offre', hypothese: 'Créer une hypothèse', titre: `Créer une hypothèse · ${court}` },
    iterer: adId ? { href: lienIterationVariable({ adId }), adId, raison: null } : { href: null, adId: null, raison: persona ? RAISON_ITERER_SANS_GAGNANTE : RAISON_ITERER_OFFRE_SANS_GAGNANTE },
    hypothese: {
      depart: persona ? departDepuisLecturePersona(faits) : departDepuisLectureOffre(faits),
      note: o.note,
      source: persona ? { type: 'persona', personaId: g.ref.id } : { type: 'offre', offreId: g.ref.id },
    },
  };
}

/** Les gestes d'un persona, sous la forme généralisée · ce que `GestesPersona` (client) rend. */
export function versGestesLecture(g: GestesPersona): GestesLecture {
  const court = prenom(g.nom);
  return {
    groupe: 'persona', id: g.personaId, nom: g.nom,
    libelles: { iterer: 'Itérer sur ce persona', hypothese: 'Créer une hypothèse', titre: `Créer une hypothèse · ${court}` },
    iterer: g.iterer, hypothese: { ...g.hypothese, source: { type: 'persona', personaId: g.personaId } },
  };
}

/**
 * Les gestes d'un persona du lot · SEULEMENT s'il se détache (au-dessus ou en
 * dessous, intervalles disjoints · `lecturePersonas`) · `null` sinon, et
 * l'écran dit pourquoi (`NOTE_GESTES_SILENCE`).
 *
 * « Itérer » part d'une gagnante ARBITRÉE de ce persona QUI EST dans le plan
 * d'itération de la marque (`planIds` · le plan ne porte que des gagnantes
 * arbitrées) · un test du lot d'abord, sinon le premier de la marque (ordre
 * passé) · aucun, le geste est fermé avec sa raison.
 */
export function gestesPersonaLot(
  g: { persona: PersonaRef; lecture: LecturePersona; k: number; n: number; reference: { k: number; n: number } | null },
  o: { numeroLot: number; testsDuLot: readonly string[]; testsDeLaMarque: readonly string[]; planIds: ReadonlySet<string> },
): GestesPersona | null {
  // Le plan d'itération ne porte que des gagnantes arbitrées · un test du persona qui y figure en est une.
  const l = gestesLectureGroupe({ ref: g.persona, lecture: g.lecture, k: g.k, n: g.n, reference: g.reference },
    { groupe: 'persona', note: noteDepartLecturePersona(o.numeroLot), prioritaires: o.testsDuLot, testsDeLaMarque: o.testsDeLaMarque, planIds: o.planIds });
  return l ? { personaId: l.id, nom: l.nom, iterer: l.iterer, hypothese: { depart: l.hypothese.depart, note: l.hypothese.note } } : null;
}
