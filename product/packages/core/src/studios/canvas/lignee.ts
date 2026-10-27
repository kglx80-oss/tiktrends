/**
 * Studios · PROJECTION DE LIGNÉE MARKETING (V5, lecture seule).
 *
 * Pur · ni base, ni réseau, ni modèle. Distinct de `deriverCanvas`
 * (`modele.ts`), qui est le graphe de PRODUCTION d'UNE version (ses sorties et
 * leurs dépendances d'impact). Ici, la LIGNÉE : comment une marque a donné un
 * brief, une hypothèse, une direction, des créations groupées en lots, un
 * résultat mesuré, un apprentissage, puis une itération.
 *
 * ── Rien n'est saisi, rien n'est nouveau ─────────────────────────────────────
 *
 * La lignée est PROJETÉE depuis des données qui existent déjà, lues par les
 * services existants (portée marque) :
 *  · `studio_project_versions.parentId` → les itérations (version enfant) ;
 *  · `studio_variants` + rang de lot → les créations et leurs groupes (lots) ;
 *  · `studio_test_links` + verdict Adsmap → le résultat et le gagnant ;
 *  · `relireApprentissage` / `lireApprentissage` → l'apprentissage ;
 *  · `sourceRefs` → les références Veille ;
 *  · `brief.hypothesisId` / `styleIntent` → l'hypothèse et la direction.
 *
 * Aucune donnée fabriquée. Les seules vraies données NOUVELLES de la lignée V5
 * (note libre, fiche marque détaillée) ne sont pas projetées ici : elles
 * demandent une migration et sont classées « à venir » (lot ultérieur).
 *
 * ── Le graphe est un DAG, posé en couches ────────────────────────────────────
 *
 * Chaque lien va de ce qui PRÉCÈDE vers ce qui en DÉCOULE (« Vient de » / « A
 * donné »). Les colonnes sont les COUCHES du plus long chemin : un lien va donc
 * toujours STRICTEMENT vers la droite (colonne de la source < colonne de la
 * cible), ce qui prouve l'absence de cycle. Déterministe : mêmes données ⇒ même
 * modèle, même empreinte.
 */

import { empreinteContenu } from '../version';
import { libelleVariante, natureDuMime } from '../variantes/variante';
import { libelleVariable } from '../variantes/test';
import { LIBELLE_VERDICT } from '../../adsmap/verdict-libelle';
import type { VerdictValue } from '../../adsmap/types';
import type { DonneesVariantes, VarianteLue } from '../variantes/vue';
import type { ModeleCanvas, CarteCanvas, NatureCarteCanvas } from './modele';

/* ─────────────────────────────── Types ───────────────────────────────────── */

export type TypeNoeudLignee =
  | 'marque' | 'reference' | 'brief' | 'hypothese' | 'direction'
  | 'groupe' | 'creation' | 'resultat' | 'apprentissage' | 'iteration';

/** Catégorie d'un lien · DÉDUITE de la relation, jamais saisie (cf. inventaire §1). */
export type CategorieLien = 'contexte' | 'visuel' | 'mesure' | 'iteration';

export interface NoeudLignee {
  id: string;
  type: TypeNoeudLignee;
  titre: string;
  /** Une phrase · la vraie donnée que le nœud porte. */
  resume: string;
  /** Lien de CONSULTATION vers la donnée réelle (lecture), ou `null`. */
  destination: string | null;
  /** Pastille « Gagnant » pour un résultat gagnant, sinon `null`. */
  badge: string | null;
}

export interface LienLignee {
  de: string;
  vers: string;
  categorie: CategorieLien;
  /** Libellé lu sur le lien · « Contexte », « Référence », « Mesure », « Itération »… */
  libelle: string;
}

export interface AbsentLignee {
  element: string;
  raison: string;
}

export interface ModeleLignee {
  /** Nœuds dans l'ordre du canvas (colonne, puis rangée) · le même pour la liste. */
  noeuds: NoeudLignee[];
  /** Liens typés, triés, dédupliqués · chacun va strictement vers la droite. */
  liens: LienLignee[];
  /** Colonne (couche) et rangée de chaque nœud. */
  grille: Record<string, { colonne: number; rangee: number }>;
  /** Nombre de colonnes présentes. */
  colonnes: number;
  /** Ce que la lignée V5 montre mais qui n'existe pas sans écrire/migrer (lot ultérieur). */
  aVenir: AbsentLignee[];
  /** Empreinte de la STRUCTURE (nœuds, types, liens) · indépendante de l'affichage. */
  empreinte: string;
}

/* ─────────────────────────────── Entrée ──────────────────────────────────── */

export interface SourceLignee { sourceId: string; titre: string; presentation: string; lien: string | null }

export interface BriefLignee {
  objectif: string | null;
  hypothese: string | null;
  hypotheseId: string | null;
  variable: string | null;
  /** Intention de style (`brief.styleIntent`) · la direction artistique saisie. */
  direction: string | null;
}

export interface EntreeLignee {
  projet: { id: string; titre: string; marque: string };
  /** Références Veille du projet (`sourceRefs`), déjà présentées par le serveur. */
  sources: SourceLignee[];
  /** Trace du brief par version (`versionId` → brief lu). */
  briefs: Record<string, BriefLignee>;
  /** Versions, variantes, lots, tests et apprentissages, déjà lus (`listerVariantes`). */
  donnees: DonneesVariantes;
}

/** Les vraies données NOUVELLES de la lignée V5 · classées pour le lot ultérieur. */
export const LIGNEE_A_VENIR: readonly AbsentLignee[] = [
  { element: 'Note', raison: 'Note libre sur le canvas · donnée nouvelle (table/colonne), lot ultérieur.' },
  { element: 'Fiche marque', raison: 'Fiche marque détaillée (règles créatives, palette) · données nouvelles, lot ultérieur.' },
];

/* ─────────────────────────── Aides de lecture ────────────────────────────── */

const court = (s: string, n = 90): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const idBrief = (vid: string) => `brief:${vid}`;
const idHypothese = (vid: string) => `hypothese:${vid}`;
const idDirection = (vid: string) => `direction:${vid}`;
const idIteration = (vid: string) => `iteration:${vid}`;
const idGroupe = (jobId: string) => `groupe:${jobId}`;
const idCreation = (variantId: string) => `creation:${variantId}`;
const idResultat = (variantId: string) => `resultat:${variantId}`;
const idApprentissage = (variantId: string) => `apprentissage:${variantId}`;

const GAGNANTS: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner']);

/** Verdict effectif d'un résultat, s'il y en a un (validé sinon calculé). */
function verdictDeVariante(v: VarianteLue): VerdictValue | null {
  if (v.lecture?.verdictEffectif) return v.lecture.verdictEffectif;
  const t = v.test?.verdict;
  return (t?.validated ?? t?.computed) ?? null;
}

/* ─────────────────────────────── Projection ──────────────────────────────── */

/**
 * Projette la lignée marketing d'un projet depuis ses données existantes.
 * Lecture seule, déterministe, sans cycle.
 */
export function projeterLignee(e: EntreeLignee): ModeleLignee {
  const { projet, sources, briefs, donnees } = e;

  const noeuds: NoeudLignee[] = [];
  const liens: LienLignee[] = [];
  const ajoute = new Set<string>();
  /** Clé de tri d'un nœud · [versionN, lot, position, rang de type]. Rangées alignées. */
  const cle = new Map<string, number[]>();

  const pose = (n: NoeudLignee, tri: number[]) => {
    if (ajoute.has(n.id)) return;
    ajoute.add(n.id);
    noeuds.push(n);
    cle.set(n.id, tri);
  };
  const relie = (de: string, vers: string, categorie: CategorieLien, libelle: string) => {
    if (ajoute.has(de) && ajoute.has(vers)) liens.push({ de, vers, categorie, libelle });
  };

  // ── Versions · ordre déterministe par n (le parent a toujours un n inférieur).
  const versions = [...donnees.versions].sort((a, b) => a.n - b.n);
  const nDe = new Map(versions.map((v) => [v.id, v.n]));
  const racine = versions.find((v) => v.parentId === null) ?? versions[0] ?? null;

  // ── Marque (contexte racine) ──────────────────────────────────────────────
  pose({
    id: 'marque', type: 'marque', titre: `Marque · ${projet.marque || 'sans nom'}`,
    resume: 'Marque du projet · toute la lignée reste dans sa portée.', destination: null, badge: null,
  }, [-2, 0, 0, 0]);

  // ── Références Veille (contexte) ──────────────────────────────────────────
  sources.forEach((s, i) => {
    pose({
      id: `reference:${s.sourceId}`, type: 'reference', titre: court(`Référence · ${s.titre}`, 60),
      resume: court(s.presentation, 120), destination: s.lien, badge: null,
    }, [-1, 0, i, 1]);
  });

  // ── Un brief (spine) par version, plus hypothèse et direction ─────────────
  for (const v of versions) {
    const b = briefs[v.id] ?? null;
    const resumeBrief = b?.objectif
      ? court(b.objectif, 120)
      : b
        ? 'Brief de cette version · objectif à préciser.'
        : `Version ${v.n} · pas encore de brief rédigé.`;
    pose({
      id: idBrief(v.id), type: 'brief', titre: `Brief · version ${v.n}`,
      resume: resumeBrief, destination: `/studio/projets/${projet.id}?version=${v.id}`, badge: null,
    }, [v.n, 0, 0, 2]);

    if (b && (b.hypothese || b.hypotheseId)) {
      const variable = b.variable ? ` · variable testée : ${court(libelleVariable(b.variable), 40)}` : '';
      pose({
        id: idHypothese(v.id), type: 'hypothese', titre: `Hypothèse · version ${v.n}`,
        resume: court(`${b.hypothese ?? 'Hypothèse citée au brief.'}${variable}`, 140),
        destination: `/studio/projets/${projet.id}?version=${v.id}`, badge: null,
      }, [v.n, 0, 0, 3]);
      relie(idBrief(v.id), idHypothese(v.id), 'contexte', 'Hypothèse');
    }
    if (b && b.direction) {
      pose({
        id: idDirection(v.id), type: 'direction', titre: `Direction · version ${v.n}`,
        resume: court(b.direction, 140), destination: `/studio/projets/${projet.id}?version=${v.id}`, badge: null,
      }, [v.n, 0, 0, 4]);
      relie(idBrief(v.id), idDirection(v.id), 'contexte', 'Direction');
    }
  }

  // Marque et références alimentent le brief racine (le point de départ de la lignée).
  if (racine) {
    relie('marque', idBrief(racine.id), 'contexte', 'Contexte');
    for (const s of sources) relie(`reference:${s.sourceId}`, idBrief(racine.id), 'contexte', 'Référence');
  }

  // ── Itérations (parentId) · version enfant « vient de » version parente ───
  for (const v of versions) {
    if (v.parentId === null || !nDe.has(v.parentId)) continue;
    pose({
      id: idIteration(v.id), type: 'iteration', titre: `Itération · version ${v.n}`,
      resume: `Version ${v.n} · itérée de la version ${nDe.get(v.parentId)}.`,
      destination: `/studio/projets/${projet.id}?version=${v.id}`, badge: null,
    }, [v.n, 0, 0, 1]);
    relie(idBrief(v.parentId), idIteration(v.id), 'iteration', 'Itération');
    relie(idIteration(v.id), idBrief(v.id), 'iteration', 'Itération');
  }

  // ── Lots (groupes) qui portent au moins une création ──────────────────────
  const varsParJob = new Map<string, VarianteLue[]>();
  for (const v of donnees.variantes) {
    const l = varsParJob.get(v.jobId) ?? [];
    l.push(v);
    varsParJob.set(v.jobId, l);
  }
  for (const lot of donnees.lots) {
    const vars = varsParJob.get(lot.jobId) ?? [];
    if (vars.length === 0) continue; // un lot sans création choisie n'est pas (encore) dans la lignée
    const nV = nDe.get(lot.versionId) ?? 0;
    pose({
      id: idGroupe(lot.jobId), type: 'groupe', titre: `Lot ${lot.lot} · version ${nV}`,
      resume: `${vars.length} création${vars.length > 1 ? 's' : ''} retenue${vars.length > 1 ? 's' : ''} de ce lot.`,
      destination: null, badge: null,
    }, [nV, lot.lot, 0, 5]);
    // Le lot découle du brief de SA version (la production part du brief).
    if (ajoute.has(idBrief(lot.versionId))) relie(idBrief(lot.versionId), idGroupe(lot.jobId), 'visuel', 'Visuel');
  }

  // ── Créations (variantes), résultats, apprentissages ──────────────────────
  for (const v of donnees.variantes) {
    const nV = nDe.get(v.versionId) ?? 0;
    const libelle = libelleVariante({ position: v.position, lot: v.lot, nature: natureDuMime(v.mime) });
    pose({
      id: idCreation(v.id), type: 'creation', titre: `Création · ${libelle}`,
      resume: v.hypothese ? court(`Hypothèse : ${v.hypothese}`, 120) : 'Média retenu comme variante.',
      destination: `/studio/projets/${projet.id}`, badge: null,
    }, [nV, v.lot, v.position, 6]);
    // Rattachée à son lot si le lot est dans la lignée, sinon directement au brief de sa version.
    if (ajoute.has(idGroupe(v.jobId))) relie(idGroupe(v.jobId), idCreation(v.id), 'visuel', 'Création');
    else if (ajoute.has(idBrief(v.versionId))) relie(idBrief(v.versionId), idCreation(v.id), 'visuel', 'Création');

    if (v.test) {
      const verdict = verdictDeVariante(v);
      const gagnant = verdict !== null && GAGNANTS.has(verdict);
      pose({
        id: idResultat(v.id), type: 'resultat', titre: `Résultat · ${libelle}`,
        resume: verdict ? `Verdict Adsmap · ${LIBELLE_VERDICT[verdict].court.toLowerCase()}.` : 'Test rattaché · pas encore de verdict mesuré.',
        destination: `/adsmap?ad=${encodeURIComponent(v.test.adsmapAdId)}&depuis=studio`,
        badge: gagnant ? 'Gagnant' : null,
      }, [nV, v.lot, v.position, 7]);
      relie(idCreation(v.id), idResultat(v.id), 'mesure', 'Mesure');

      if (v.lecture || v.relecture) {
        const phrase = v.relecture?.apprentissage?.trim() || v.lecture?.phrase || 'Apprentissage tiré de ce test.';
        pose({
          id: idApprentissage(v.id), type: 'apprentissage', titre: `Apprentissage · ${libelle}`,
          resume: court(phrase, 160), destination: null, badge: null,
        }, [nV, v.lot, v.position, 8]);
        relie(idResultat(v.id), idApprentissage(v.id), 'mesure', 'Apprentissage');
      }
    }
  }

  // ── Mise en couches (plus long chemin) · chaque lien va vers la droite ─────
  const colonne = couches(noeuds, liens);
  const nbCol = noeuds.reduce((m, n) => Math.max(m, colonne.get(n.id)! + 1), 0);

  // ── Rangées · par colonne, ordre déterministe (clé de lignée puis id) ──────
  const grille: ModeleLignee['grille'] = {};
  for (let c = 0; c < nbCol; c++) {
    const colIds = noeuds.filter((n) => colonne.get(n.id) === c).map((n) => n.id)
      .sort((a, b) => comparerCle(cle.get(a)!, cle.get(b)!) || (a < b ? -1 : a > b ? 1 : 0));
    colIds.forEach((id, r) => { grille[id] = { colonne: c, rangee: r }; });
  }

  // ── Liens triés et dédupliqués ────────────────────────────────────────────
  const vus = new Set<string>();
  const liensTries = liens
    .filter((l) => { const k = `${l.de}>${l.vers}`; if (vus.has(k)) return false; vus.add(k); return true; })
    .sort((a, b) => (a.de < b.de ? -1 : a.de > b.de ? 1 : a.vers < b.vers ? -1 : a.vers > b.vers ? 1 : 0));

  // ── Nœuds dans l'ordre du canvas (colonne, puis rangée) ───────────────────
  const noeudsTries = [...noeuds].sort((a, b) =>
    grille[a.id]!.colonne - grille[b.id]!.colonne || grille[a.id]!.rangee - grille[b.id]!.rangee);

  const empreinte = empreinteContenu({
    noeuds: noeudsTries.map((n) => [n.id, n.type]),
    liens: liensTries.map((l) => [l.de, l.vers, l.categorie]),
  });

  return { noeuds: noeudsTries, liens: liensTries, grille, colonnes: nbCol, aVenir: [...LIGNEE_A_VENIR], empreinte };
}

/* ─────────────────────────── Couches (plus long chemin) ───────────────────── */

function comparerCle(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Colonne = plus long chemin depuis une racine (nœud sans entrée). Garde contre
 * un cycle accidentel (renvoie 0) · le graphe projeté est un DAG par construction.
 */
function couches(noeuds: NoeudLignee[], liens: LienLignee[]): Map<string, number> {
  const preds = new Map<string, string[]>();
  for (const n of noeuds) preds.set(n.id, []);
  for (const l of liens) preds.get(l.vers)?.push(l.de);

  const col = new Map<string, number>();
  const profondeur = (id: string, pile: Set<string>): number => {
    const vu = col.get(id);
    if (vu !== undefined) return vu;
    if (pile.has(id)) return 0; // cycle · ne devrait pas arriver
    pile.add(id);
    let d = 0;
    for (const p of preds.get(id) ?? []) d = Math.max(d, profondeur(p, pile) + 1);
    pile.delete(id);
    col.set(id, d);
    return d;
  };
  for (const n of noeuds) profondeur(n.id, new Set());
  return col;
}

/** Libellés lisibles des types de nœuds · le MOT porte l'information, jamais la seule couleur. */
export const LIBELLES_TYPE_LIGNEE: Readonly<Record<TypeNoeudLignee, string>> = {
  marque: 'Marque',
  reference: 'Référence',
  brief: 'Brief',
  hypothese: 'Hypothèse',
  direction: 'Direction',
  groupe: 'Lot',
  creation: 'Création',
  resultat: 'Résultat',
  apprentissage: 'Apprentissage',
  iteration: 'Itération',
};

/** Libellés des catégories de lien. */
export const LIBELLES_CATEGORIE_LIGNEE: Readonly<Record<CategorieLien, string>> = {
  contexte: 'Contexte',
  visuel: 'Visuel',
  mesure: 'Mesure',
  iteration: 'Itération',
};

/**
 * Nature (au sens du canvas de production) d'un type de lignée · porte la
 * couleur d'appui, mais le MOT du type reste l'information. Amont = entrée,
 * production = génération, aval mesuré = calcul.
 */
export const NATURE_LIGNEE: Readonly<Record<TypeNoeudLignee, NatureCarteCanvas>> = {
  marque: 'entree', reference: 'entree', brief: 'entree', hypothese: 'entree', direction: 'entree',
  groupe: 'generation', creation: 'generation',
  resultat: 'calcul', apprentissage: 'calcul', iteration: 'calcul',
};

/**
 * Adapte la lignée à la forme `ModeleCanvas` pour RÉUTILISER le réducteur et la
 * composition du canvas (vue, zoom, panoramique, routage · `vue.ts`,
 * `disposition.ts`) sans second moteur (`@xyflow` serait un second moteur).
 * Seuls `grille`, `liens` et les ids servent à poser les cartes ; la vraie
 * donnée et les libellés restent portés par `ModeleLignee`. L'étape est fixe :
 * les colonnes de la lignée viennent de `grille`, pas d'`etape`.
 */
export function ligneeVersCanvas(m: ModeleLignee): ModeleCanvas {
  const cartes: CarteCanvas[] = m.noeuds.map((n) => ({
    id: n.id, nature: NATURE_LIGNEE[n.type], etape: 'contexte', titre: n.titre, resume: n.resume,
    media: 'sans_objet', shotId: null, cibleJarvis: null, libelleCibleJarvis: null,
  }));
  return {
    cartes,
    liens: m.liens.map((l) => ({ de: l.de, vers: l.vers })),
    grille: m.grille,
    etapes: ['contexte'],
    empreinte: m.empreinte,
  };
}
