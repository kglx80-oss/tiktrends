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
 *     écrans EXISTANTS pré-remplis · rien n'est écrit sans le clic.
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
  return { libelle, href: null, lien: null };
}

/* ───────────────────────── 2 · le bilan par provenance ───────────────────────── */

/**
 * D'où vient un test · la provenance de l'hypothèse libre gardée sur l'ad
 * (`source_ref_json.hypotheseLibre`), sinon une ITÉRATION d'une gagnante
 * (`ad_type = iteration` · moteur, écran Itérer, geste de Jarvis), sinon rien ·
 * un test sans provenance lue reste dans la référence, il ne forme pas de groupe.
 *
 * Jarvis ne garde pas de provenance propre sur l'ad · ses itérations comptent
 * avec les autres itérations, et l'écran le dit (`NOTE_JARVIS_PROVENANCE`).
 */
export type ProvenanceTest = 'tag' | 'veille' | 'apprentissage' | 'persona' | 'libre' | 'iteration';

/** L'ordre et les mots du bilan · six provenances, autant que la règle mesurée en admet (`MAX_PERSONAS_LECTURE`). */
export const PROVENANCES_TEST: ReadonlyArray<{ cle: ProvenanceTest; libelle: string }> = [
  { cle: 'tag', libelle: 'Tag de Veille récurrent' },
  { cle: 'veille', libelle: 'Pub de la Veille' },
  { cle: 'apprentissage', libelle: 'Apprentissage' },
  { cle: 'persona', libelle: 'Persona' },
  { cle: 'libre', libelle: 'À la main' },
  { cle: 'iteration', libelle: 'Itération d’une gagnante' },
];

export const NOTE_JARVIS_PROVENANCE = 'Jarvis ne garde pas encore de provenance à lui · les itérations qu’il fait créer comptent dans « Itération d’une gagnante ».';

export function provenanceDuTest(t: { origine: OrigineHypotheseLibre | null | undefined; typeAd?: string | null }): ProvenanceTest | null {
  if (t.origine) return t.origine.type;
  return t.typeAd === 'iteration' ? 'iteration' : null;
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
  return `Règle · une hypothèse gagne quand sa variante est tranchée gagnante au protocole · au moins ${MIN_VERDICTS_PERSONA} variantes tranchées pour une provenance et ${MIN_REFERENCE_PERSONA} dans le reste de la marque · l’intervalle de la provenance doit exclure celui du reste (niveau ${niveauFr(NIVEAU_BILAN_PROVENANCE)}, ${niveauFr(NIVEAU_BILAN_PROVENANCE_VOLUME)} au-delà de ${RESTE_MAX_NIVEAU_BILAN} variantes hors provenances, silence au-delà de ${RESTE_MAX_BILAN}).`;
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
  const niveau = eligibles.length && eligibles.length <= MAX_PERSONAS_LECTURE ? niveauBilanProvenances(reste) : null;

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
      return { ...base, lecture: 'non_mesure', intervalle: null, reference: null, phrase: `${pl(g.k, 'gagnante', 'gagnantes')} sur ${pl(g.n, 'variante tranchée', 'variantes tranchées')} · à ce volume, la règle n’est pas mesurée et se tait.` };
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
  if ((g.lecture !== 'au_dessus' && g.lecture !== 'en_dessous') || !g.reference) return null;
  // Le plan d'itération ne porte que des gagnantes arbitrées · un test du persona qui y figure en est une.
  const adId = [...o.testsDuLot, ...o.testsDeLaMarque].find((id) => o.planIds.has(id)) ?? null;
  return {
    personaId: g.persona.id, nom: g.persona.nom,
    iterer: adId ? { href: lienIterationVariable({ adId }), adId, raison: null } : { href: null, adId: null, raison: RAISON_ITERER_SANS_GAGNANTE },
    hypothese: { depart: departDepuisLecturePersona({ nom: g.persona.nom, lecture: g.lecture, k: g.k, n: g.n, reference: g.reference }), note: noteDepartLecturePersona(o.numeroLot) },
  };
}
