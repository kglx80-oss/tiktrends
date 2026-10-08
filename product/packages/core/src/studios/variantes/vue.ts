/**
 * Studios · L4-C · ce que l'écran « Variantes et tests » dit (lecture pure).
 *
 * Pur. Les données arrivent déjà lues et sérialisables (`DonneesVariantes`) ;
 * ce module décide QUOI afficher : l'état de l'écran (cahier 01 §5), les
 * versions et leurs lots, le nom exact de chaque sortie, le statut technique
 * SÉPARÉ du statut qualité, la comparaison à la parente, et les gestes
 * possibles. Aucun JSX ici : le composant ne fait que lire cette vue.
 */

import type { EtatJob, StatutQualite } from '../machines';
import type { VerdictValue } from '../../adsmap/types';
import { LIBELLE_VERDICT } from '../../adsmap/verdict-libelle';
import { libelleVariante, natureDuMime, rangementVersion } from './variante';
import { libelleVariable, libelleChamp, LIBELLE_METRIQUE, LIBELLE_PROTOCOLE, type MetriqueTest, type ProtocoleTest, type StatutIsolation } from './test';
import type { Lecture, VerdictLu, Conclusion } from './apprentissage';

/* ───────────────────────────── Données lues ──────────────────────────────── */

export interface SortieLue {
  operation: string;
  position: number;
  assetId: string;
  mime: string;
  largeur: number | null;
  hauteur: number | null;
  sha256: string;
  varianteId: string | null;
}

export interface LotLu {
  jobId: string;
  lot: number;
  versionId: string;
  etat: EtatJob;
  qualite: StatutQualite;
  creeLe: string;
  /** Nombre de sorties prévues au devis (lignes payantes). */
  attendues: number;
  sorties: SortieLue[];
}

export interface TestLu {
  linkId: string;
  adsmapAdId: string;
  adStatus: string;
  hypothese: string;
  variable: string;
  valeurVariable: string | null;
  objectif: string | null;
  protocole: ProtocoleTest | null;
  periode: { debut: string; fin: string } | null;
  metrique: MetriqueTest | null;
  isolation: { statut: StatutIsolation; champs: string[] } | null;
  verdict: VerdictLu | null;
}

export interface RelectureApprentissage {
  conclusion: Conclusion;
  apprentissage: string;
  variableSuivante: string;
  ecart: string | null;
  le: string;
}

export interface VarianteLue {
  id: string;
  assetId: string;
  versionId: string;
  parentVariantId: string | null;
  jobId: string;
  lot: number;
  position: number;
  mime: string;
  largeur: number | null;
  hauteur: number | null;
  sha256: string;
  hypothese: string | null;
  variable: string | null;
  qualite: StatutQualite;
  etatTechnique: EtatJob;
  creeLe: string;
  test: TestLu | null;
  lecture: Lecture | null;
  relecture: RelectureApprentissage | null;
}

export interface DonneesVariantes {
  projet: { id: string; titre: string; versionCouranteId: string | null };
  versions: Array<{ id: string; n: number; parentId: string | null; creeLe: string }>;
  lots: LotLu[];
  variantes: VarianteLue[];
  adsmap: { acces: boolean; protocoleMarque: ProtocoleTest | null; offres: Array<{ id: string; libelle: string }>; pages: Array<{ id: string; libelle: string }> };
  droits: { proposer: boolean };
  relecture: { disponible: boolean; raison: string | null; coutMaxUsd: number | null };
}

/* ─────────────────────────────── Libellés ────────────────────────────────── */

export const LIBELLE_ETAT_TECHNIQUE: Record<EtatJob, string> = {
  queued: 'En file', claimed: 'Pris en charge', running: 'En cours', persisting: 'Enregistrement',
  completed: 'Fichier enregistré', failed: 'Échec technique', cancel_requested: 'Annulation demandée',
  cancelled: 'Annulé', reconciliation_required: 'Vérification en cours',
};

export const LIBELLE_QUALITE: Record<StatutQualite, string> = {
  pending: 'À relire', passed: 'Accepté', requires_review: 'À revoir', rejected: 'Écarté',
};

export const LIBELLE_CONCLUSION: Record<Conclusion, string> = {
  inconclusif: 'Inconclusif', soutenue: 'Hypothèse soutenue', non_soutenue: 'Hypothèse non soutenue',
};

const ACTIFS: ReadonlySet<EtatJob> = new Set<EtatJob>(['queued', 'claimed', 'running', 'persisting', 'cancel_requested', 'reconciliation_required']);

/* ──────────────────────────────── La vue ─────────────────────────────────── */

export type EtatEcran = 'vide' | 'premier_usage' | 'partiel' | 'rempli';

export interface CarteSortie {
  assetId: string;
  libelle: string;
  ratio: string;
  empreinte: string;
  dimensions: string;
  varianteId: string | null;
  /** « Choisir comme variante » possible ? Sinon la raison, dite. */
  choisir: boolean;
  raison: string | null;
}

export interface CarteLot {
  jobId: string;
  titre: string;
  etatTechnique: string;
  /** Statut qualité · seulement pour un lot dont le fichier est enregistré (sinon rien à relire). */
  qualite: string | null;
  actif: boolean;
  sorties: CarteSortie[];
  message: string | null;
}

export interface BlocVersion {
  id: string;
  titre: string;
  courante: boolean;
  note: string | null;
  lots: CarteLot[];
}

export interface CarteVariante {
  id: string;
  libelle: string;
  versionTitre: string;
  rangement: 'courante' | 'anterieure';
  noteRangement: string | null;
  parentLibelle: string | null;
  statutTechnique: string;
  statutQualite: string;
  aRelire: boolean;
  hypothese: string;
  variable: string;
  comparaison: string;
  test: null | {
    adsmapHref: string;
    resume: string;
    details: Array<{ libelle: string; valeur: string }>;
    isolation: string | null;
    verdict: string;
  };
  lecture: null | { conclusion: string; phrase: string; prudence: string; variableSuivante: string; inconclusif: boolean };
  relecture: RelectureApprentissage | null;
  gestes: { rattacher: boolean; iterer: boolean; relire: boolean };
  ratio: string;
  empreinte: string;
  dimensions: string;
}

export interface VueVariantes {
  etat: EtatEcran;
  titreProjet: string;
  enCours: number;
  versions: BlocVersion[];
  variantes: CarteVariante[];
  message: string;
}

const ratio = (l: number | null, h: number | null) => (l && h ? `${l} / ${h}` : '1 / 1');
const dims = (l: number | null, h: number | null, mime: string) => `${l && h ? `${l} × ${h} px · ` : ''}${mime}`;
const empreinte = (sha: string) => `sha256 ${sha.slice(0, 12)}…`;

function libelleTest(adStatus: string): string {
  switch (adStatus) {
    case 'draft': return 'Fiche Adsmap en brouillon · offre et page à compléter avant le lancement.';
    case 'proposed': return 'Fiche Adsmap proposée.';
    case 'ready': return 'Prête à lancer.';
    case 'live': return 'En diffusion.';
    case 'paused': return 'En pause.';
    case 'done': return 'Test terminé.';
    default: return 'Fiche Adsmap.';
  }
}

function verdictTexte(v: VerdictLu | null): string {
  if (!v) return 'Pas encore de résultat mesuré.';
  const val: VerdictValue | null = v.validated ?? v.computed;
  if (!val) return 'Pas encore de résultat mesuré.';
  const l = LIBELLE_VERDICT[val];
  const fraicheur = v.computedAt ? ` · calculé le ${v.computedAt.slice(0, 10)}` : '';
  return `${l.court}${v.comparable ? '' : ' · hors protocole'}${l.note ? ` (${l.note})` : ''}${fraicheur}`;
}

export function vueVariantes(d: DonneesVariantes): VueVariantes {
  const courante = d.projet.versionCouranteId;
  const nVersion = new Map(d.versions.map((v) => [v.id, v.n]));
  const titreVersion = (id: string) => `Version ${nVersion.get(id) ?? '?'}`;
  const parId = new Map(d.variantes.map((v) => [v.id, v]));
  const nomVariante = (v: { position: number; lot: number; mime: string }) => libelleVariante({ position: v.position, lot: v.lot, nature: natureDuMime(v.mime) });

  // Versions qui portent au moins un lot, la plus récente d'abord.
  const idsVersions = [...new Set(d.lots.map((l) => l.versionId))].sort((a, b) => (nVersion.get(b) ?? 0) - (nVersion.get(a) ?? 0));
  const versions: BlocVersion[] = idsVersions.map((vid) => {
    const estCourante = vid === courante;
    const lots = d.lots.filter((l) => l.versionId === vid).sort((a, b) => b.lot - a.lot).map((l): CarteLot => {
      const actif = ACTIFS.has(l.etat);
      const sorties = l.sorties.map((s): CarteSortie => {
        const libelle = libelleVariante({ position: s.position, lot: l.lot, nature: natureDuMime(s.mime) });
        let raison: string | null = null;
        if (s.varianteId) raison = 'Déjà choisie comme variante.';
        else if (l.qualite === 'rejected') raison = 'Écartée à la relecture.';
        else if (!d.droits.proposer) raison = 'Ton rôle permet de consulter, pas de choisir.';
        return { assetId: s.assetId, libelle, ratio: ratio(s.largeur, s.hauteur), empreinte: empreinte(s.sha256), dimensions: dims(s.largeur, s.hauteur, s.mime), varianteId: s.varianteId, choisir: raison === null, raison };
      });
      let message: string | null = null;
      if (actif) message = `${l.attendues} sortie${l.attendues > 1 ? 's' : ''} en préparation · elles apparaîtront ici, tu peux fermer la page.`;
      else if (l.etat === 'failed' || l.etat === 'cancelled') message = 'Aucune sortie livrée par ce lot.';
      return { jobId: l.jobId, titre: `Lot ${l.lot}`, etatTechnique: LIBELLE_ETAT_TECHNIQUE[l.etat], qualite: l.etat === 'completed' ? LIBELLE_QUALITE[l.qualite] : null, actif, sorties, message };
    });
    return {
      id: vid,
      titre: `${titreVersion(vid)}${estCourante ? ' · courante' : ''}`,
      courante: estCourante,
      note: estCourante ? null : 'Branche antérieure · ses résultats restent rangés ici et ne remplacent jamais la version courante.',
      lots,
    };
  });

  const variantes: CarteVariante[] = [...d.variantes].sort((a, b) => (b.creeLe < a.creeLe ? -1 : b.creeLe > a.creeLe ? 1 : 0)).map((v): CarteVariante => {
    const parent = v.parentVariantId ? parId.get(v.parentVariantId) ?? null : null;
    const rang = rangementVersion(v.versionId, courante);
    const t = v.test;
    const variableNom = libelleVariable(t?.variable ?? v.variable);
    let comparaison: string;
    if (!v.parentVariantId) comparaison = 'Sans variante parente · elle sera comparée aux repères de la marque.';
    else if (!parent) comparaison = 'Variante parente hors de cette vue.';
    else if (t?.isolation?.statut === 'plusieurs') comparaison = `Face à ${nomVariante(parent)} · ${t.isolation.champs.length} champs ont changé (${t.isolation.champs.map(libelleChamp).join(', ')}) : ${variableNom} n’est pas isolée.`;
    else if (t?.isolation?.statut === 'aucun') comparaison = `Face à ${nomVariante(parent)} · aucun champ créatif n’a changé.`;
    else if (t?.isolation?.statut === 'isole') comparaison = `Face à ${nomVariante(parent)} · seul ${libelleChamp(t.isolation.champs[0]!)} a changé.`;
    else comparaison = `Face à ${nomVariante(parent)} · ${parent.versionId === v.versionId ? 'même version, autre tirage' : `${titreVersion(parent.versionId)} → ${titreVersion(v.versionId)}`}.`;

    const ouvert = t !== null && t.adStatus !== 'done';
    return {
      id: v.id,
      libelle: nomVariante(v),
      versionTitre: titreVersion(v.versionId),
      rangement: rang,
      noteRangement: rang === 'anterieure' ? `Rangée dans ${titreVersion(v.versionId)} · la version courante n’est pas modifiée.` : null,
      parentLibelle: parent ? nomVariante(parent) : null,
      statutTechnique: LIBELLE_ETAT_TECHNIQUE[v.etatTechnique],
      statutQualite: LIBELLE_QUALITE[v.qualite],
      aRelire: v.qualite !== 'passed',
      hypothese: t?.hypothese ?? v.hypothese ?? 'Hypothèse à écrire au rattachement.',
      variable: variableNom,
      comparaison,
      test: t ? {
        adsmapHref: `/adsmap?ad=${encodeURIComponent(t.adsmapAdId)}&depuis=studio`,
        resume: libelleTest(t.adStatus),
        details: [
          ...(t.objectif ? [{ libelle: 'Objectif', valeur: t.objectif }] : []),
          { libelle: 'Variable', valeur: `${libelleVariable(t.variable)}${t.valeurVariable ? ` · ${t.valeurVariable}` : ''}` },
          ...(t.protocole ? [{ libelle: 'Protocole', valeur: LIBELLE_PROTOCOLE[t.protocole] }] : []),
          ...(t.periode ? [{ libelle: 'Période', valeur: `du ${t.periode.debut} au ${t.periode.fin}` }] : []),
          ...(t.metrique ? [{ libelle: 'Métrique', valeur: LIBELLE_METRIQUE[t.metrique] }] : []),
        ],
        isolation: t.isolation?.statut === 'plusieurs' ? 'Ce test ne prétend pas isoler la variable : plusieurs champs ont changé.' : null,
        verdict: verdictTexte(t.verdict),
      } : null,
      lecture: v.lecture ? {
        conclusion: LIBELLE_CONCLUSION[v.lecture.conclusion],
        phrase: v.lecture.phrase,
        prudence: v.lecture.prudence,
        variableSuivante: libelleVariable(v.lecture.variableSuivante),
        inconclusif: v.lecture.conclusion === 'inconclusif',
      } : null,
      relecture: v.relecture,
      gestes: {
        rattacher: d.droits.proposer && d.adsmap.acces && !ouvert,
        iterer: d.droits.proposer,
        relire: d.droits.proposer && t !== null,
      },
      ratio: ratio(v.largeur, v.hauteur),
      empreinte: empreinte(v.sha256),
      dimensions: dims(v.largeur, v.hauteur, v.mime),
    };
  });

  const enCours = d.lots.filter((l) => ACTIFS.has(l.etat)).length;
  let etat: EtatEcran;
  if (d.lots.length === 0) etat = 'vide';
  else if (d.variantes.length === 0) etat = 'premier_usage';
  else if (d.variantes.some((v) => v.test === null)) etat = 'partiel';
  else etat = 'rempli';

  const message = {
    vide: 'Aucun lot n’a encore été lancé sur ce projet · les sorties apparaîtront ici, version par version.',
    premier_usage: 'Choisis une sortie précise pour en faire une variante · c’est elle, et elle seule, qui sera rattachée au test.',
    partiel: 'Certaines variantes ne sont pas encore rattachées à un test.',
    rempli: 'Chaque variante est rattachée à son test.',
  }[etat];

  return { etat, titreProjet: d.projet.titre, enCours, versions, variantes, message };
}
