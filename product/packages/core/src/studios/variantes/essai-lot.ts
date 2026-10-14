/**
 * Studios · lot 3b · un LOT D'ESSAI préparé depuis les variantes d'un projet.
 *
 * Pur · ni base, ni réseau, ni modèle. Le serveur lit les variantes (contenu de
 * leur version, plan qui les a livrées, empreinte du média, test éventuel) ;
 * ce module DÉCIDE si la sélection mérite le nom d'essai, avec la règle déjà
 * écrite pour les anciens studios (`essai.ts` · `verifieEssai`), et dit la
 * suite vers Adsmap. Il ne génère rien, ne coûte rien, n'écrit rien.
 *
 * ── Ce que « préparer » veut dire ici ────────────────────────────────────────
 *
 * Choisir des variantes EXISTANTES et la variable unique qu'on teste
 * (accroche, mise en page ou ambiance). Le plan rend :
 *
 *  · l'hypothèse écrite (`hypotheseEssai`) et ce qui est TENU (`tenuDansEssai`) ;
 *  · le constat : essai réel ou non (`verifieEssai`, puis les autres champs
 *    créatifs du projet que l'ancien contrôle ne connaissait pas · produit,
 *    personnages, sujet du plan, audience, références, exclusions) ;
 *  · pour chaque variante, l'état de son test et, si l'essai tient, la saisie
 *    à reprendre dans le rattachement existant (`rattacherVarianteAuTest`) ;
 *  · ce qui exigerait une génération, DIT, jamais lancé : le devis du studio
 *    annonce le prix avant le clic.
 *
 * Un lot imparfait reste consultable, il ne se présente simplement pas comme
 * un essai (même principe que `verifieEssai`) : aucune saisie préremplie.
 *
 * ── Les facettes d'une variante ──────────────────────────────────────────────
 *
 * Une variante est UNE image (son empreinte `sha256`), issue d'UN plan
 * (`keyframe:<plan>`) d'UNE version. Les textes sont posés par des calques,
 * jamais dans les pixels (`produit/compilation.ts`) : l'accroche vit dans
 * `brief.texts`, le texte écran du plan et les calques texte du document.
 *
 *  · accroche     · textes hors CTA (brief, texte écran du plan, calques texte) ;
 *  · CTA          · lignes « CTA » de `brief.texts` ;
 *  · mise en page · `brief.composition`, `brief.formats`, cadrage du plan, le
 *                   document hors texte des calques (géométrie, typographie) ;
 *  · ambiance     · `brief.styleIntent`, `styleRef`, lumière et décor du plan ;
 *  · scène        · l'empreinte de l'image ;
 *  · le reste     · tenu dans TOUT essai (voir `AUTRES`).
 */

import {
  ESSAI_VARIABLES, ESSAI_LABEL, hypotheseEssai, tenuDansEssai, verifieEssai, imagesPourEssai,
  type EssaiVariable,
} from '../../essai';
import type { DeclinaisonSnapshot } from '../../studio-iterate';
import type { AdLayout } from '../../ad-layouts';
import type { TestedVariable } from '../../adsmap/types';
import { jsonCanonique } from '../version';
import { lireLigneTexte } from '../textes/textes';
import { STATUTS_AD_CLOS } from './test';

/* ───────────────────────────── Vocabulaire ───────────────────────────────── */

/**
 * La variable Adsmap qui porte chaque essai, au rattachement. Adsmap n'a pas de
 * « mise en page » ni d'« ambiance » : `format` (la forme de la publicité) et
 * `opening_visual` (ce qu'on voit d'abord) sont les plus proches. Choix écrit
 * ici une fois, modifiable dans le formulaire avant l'envoi.
 */
export const VARIABLE_ADSMAP_ESSAI: Readonly<Record<EssaiVariable, TestedVariable>> = {
  accroche: 'hook',
  mise_en_page: 'format',
  univers: 'opening_visual',
};

/** Ce que l'essai compare, pour la personne · « Les ambiances » → choix de la radio. */
export const AIDE_ESSAI: Readonly<Record<EssaiVariable, string>> = {
  accroche: 'Même image, mêmes calques · seuls les textes d’accroche changent.',
  mise_en_page: 'Même image, mêmes textes · seule la composition change.',
  univers: 'Mêmes textes, même composition · seule l’ambiance de l’image change.',
};

/**
 * Borne de SAISIE (charge utile), pas un seuil métier : la vraie borne est le
 * nombre de variantes du projet, que le serveur revérifie une à une.
 */
export const ESSAI_VARIANTES_MAX_SAISIE = 50;

/* ─────────────────────────────── Saisie ──────────────────────────────────── */

export interface SelectionEssai { variable: EssaiVariable; variantIds: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validerSelectionEssai(x: unknown): { ok: true; selection: SelectionEssai } | { ok: false; raison: string } {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  const variable = typeof o.variable === 'string' ? o.variable : '';
  if (!(ESSAI_VARIABLES as readonly string[]).includes(variable)) return { ok: false, raison: 'Choisis ce que l’essai fait varier · l’accroche, la mise en page ou l’ambiance.' };
  if (!Array.isArray(o.variantIds)) return { ok: false, raison: 'Choisis les variantes du lot.' };
  if (o.variantIds.length > ESSAI_VARIANTES_MAX_SAISIE) return { ok: false, raison: `${ESSAI_VARIANTES_MAX_SAISIE} variantes au plus par lot d’essai.` };
  const ids: string[] = [];
  for (const id of o.variantIds) {
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, raison: 'Variante inconnue.' };
    const n = id.toLowerCase();
    if (!ids.includes(n)) ids.push(n);
  }
  if (ids.length < 2) return { ok: false, raison: 'Un essai a besoin d’au moins deux variantes à comparer.' };
  return { ok: true, selection: { variable: variable as EssaiVariable, variantIds: ids } };
}

/* ─────────────────────────────── Facettes ────────────────────────────────── */

const objet = (x: unknown): Record<string, unknown> => (typeof x === 'object' && x !== null && !Array.isArray(x) ? x as Record<string, unknown> : {});
const liste = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const chaine = (x: unknown): string => (typeof x === 'string' ? x : '');
const norme = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function canon(x: unknown): string {
  try { return jsonCanonique(x ?? null); } catch { return JSON.stringify(x ?? null) ?? 'null'; }
}

/** Le plan qui a livré le média · `keyframe:<plan>` ou `clip:<plan>`. */
export function planDeLOperation(contenu: unknown, operation: string | null): Record<string, unknown> | null {
  if (!operation) return null;
  const i = operation.indexOf(':');
  if (i < 0) return null;
  const id = operation.slice(i + 1);
  const byId = objet(objet(objet(contenu).shots).byId);
  return Object.prototype.hasOwnProperty.call(byId, id) ? objet(byId[id]) : null;
}

/** Les champs tenus dans TOUT essai, avec leur nom lisible. */
const AUTRES: ReadonlyArray<readonly [string, (c: Record<string, unknown>, b: Record<string, unknown>, p: Record<string, unknown>) => unknown]> = [
  ['le produit', (c) => c.productRef],
  ['les personnages', (c) => c.characterRefs],
  ['le sujet du plan', (_c, _b, p) => [p.subject, p.action, p.camera, p.referenceIds, p.purpose]],
  ['l’audience', (_c, b) => b.audience],
  ['les références', (_c, b) => b.references],
  ['les exclusions', (_c, b) => b.exclusions],
  ['le montage', (c) => c.timeline],
];

export interface FacettesEssai {
  accroche: { cle: string; lisible: string };
  cta: string;
  miseEnPage: { cle: string; lisible: string };
  univers: { cle: string; lisible: string };
  scene: string;
  autres: Record<string, string>;
}

export function facettesEssai(contenu: unknown, operation: string | null, sha256: string): FacettesEssai {
  const c = objet(contenu);
  const b = objet(c.brief);
  const p = planDeLOperation(contenu, operation) ?? {};
  const doc = c.document === null || c.document === undefined ? null : objet(c.document);

  const lignes = liste(b.texts).filter((t): t is string => typeof t === 'string').map(lireLigneTexte);
  const ctas = lignes.filter((t) => t.type === 'cta').map((t) => norme(t.texte));
  const textes = lignes.filter((t) => t.type !== 'cta');
  const ecran = liste(p.onScreenText).filter((t): t is string => typeof t === 'string');
  const calques = Object.values(objet(doc?.layers)).map(objet);
  const calquesTexte = calques.filter((l) => l.kind === 'text').map((l) => chaine(l.text));
  const accroche = [...textes.map((t) => t.texte), ...ecran, ...calquesTexte].map(norme).filter(Boolean);
  const lisibleAccroche = (textes.find((t) => t.type === 'hook') ?? textes[0])?.texte ?? ecran[0] ?? calquesTexte[0] ?? '';

  // Le document hors TEXTE des calques · géométrie, ordre, typographie : la mise en page.
  const sansTexte = (l: Record<string, unknown>) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'text'));
  const docSansTexte = doc ? { ...doc, layers: Object.fromEntries(calques.map((l) => [chaine(l.id), sansTexte(l)])) } : null;
  const composition = chaine(b.composition);

  const style = chaine(b.styleIntent);
  const lumiere = [chaine(p.lighting), chaine(p.environment)].filter(Boolean).join(', ');

  const autres: Record<string, string> = {};
  for (const [nom, lire] of AUTRES) autres[nom] = canon(lire(c, b, p));

  return {
    accroche: { cle: canon(accroche), lisible: lisibleAccroche.trim() },
    cta: canon(ctas),
    miseEnPage: { cle: canon([norme(composition), b.formats ?? null, chaine(p.framing), docSansTexte]), lisible: composition.trim() || chaine(p.framing).trim() },
    univers: { cle: canon([norme(style), c.styleRef ?? null, norme(lumiere)]), lisible: style.trim() || lumiere },
    scene: sha256,
    autres,
  };
}

/** L'instantané que `verifieEssai` sait lire · la règle des anciens studios, telle quelle. */
function instantane(f: FacettesEssai): DeclinaisonSnapshot {
  return { headline: f.accroche.cle, cta: f.cta, layout: f.miseEnPage.cle as AdLayout, sceneUrl: f.scene, universe: f.univers.cle };
}

/* ───────────────────────────────── Plan ──────────────────────────────────── */

export interface VariantePourEssai {
  variantId: string;
  libelle: string;
  /** Contenu de la version de la variante, tel que lu. */
  contenu: unknown;
  /** Opération qui a livré le média (« keyframe:s3 ») · désigne le plan. */
  operation: string | null;
  sha256: string;
  /** Test le plus récent de la variante, s'il existe. */
  test: { adsmapAdId: string; adStatus: string } | null;
}

export type EtatLigneLotEssai = 'a_rattacher' | 'en_test' | 'test_clos';

export interface LigneEssai {
  variantId: string;
  libelle: string;
  /** La valeur testée, lisible · « aucune » si la version n'en porte pas. */
  valeur: string;
  etat: EtatLigneLotEssai;
  etatTexte: string;
  adsmapHref: string | null;
  /** Saisie à reprendre dans le rattachement · seulement si l'essai tient ET la variante n'est pas déjà en test. */
  saisie: { hypothese: string; variable: TestedVariable; valeurVariable: string } | null;
}

export interface PlanLotEssai {
  variable: EssaiVariable;
  titre: string;
  hypothese: string;
  tenu: string[];
  constat: { ok: true; phrase: string } | { ok: false; probleme: string; conseil: string | null };
  variableAdsmap: TestedVariable;
  /** Images qu'un tel essai demande (une seule si la scène est tenue) · information, rien n'est lancé. */
  images: number;
  generation: string;
  lignes: LigneEssai[];
  suite: string[];
  /** Écran de composition des lots Adsmap · seulement quand il y a quelque chose à y regrouper. */
  lienLots: string | null;
}

const href = (adId: string) => `/adsmap?ad=${encodeURIComponent(adId)}&depuis=studio`;

function valeurLisible(f: FacettesEssai, v: EssaiVariable): string {
  const brut = v === 'accroche' ? f.accroche.lisible : v === 'mise_en_page' ? f.miseEnPage.lisible : f.univers.lisible;
  return brut.slice(0, 500) || 'aucune';
}

/** Le constat sur la sélection · `verifieEssai`, puis les champs que l'ancien contrôle ne connaissait pas. */
function constater(fs: FacettesEssai[], v: EssaiVariable): PlanLotEssai['constat'] {
  const r = verifieEssai(fs.map(instantane), v);
  if (!r.ok) {
    let conseil: string | null = null;
    if (v !== 'univers' && fs.some((f) => f.scene !== fs[0]!.scene)) {
      conseil = `${ESSAI_LABEL[v]} se comparent sur la MÊME image · ces variantes sont des images distinctes. Choisis des variantes qui partagent leur image, ou essaie les ambiances.`;
    } else if (/partagent/.test(r.probleme)) {
      conseil = v === 'univers'
        ? 'Il faut une image par ambiance · change l’ambiance du brief (nouvelle version), puis lance le lot depuis le studio du projet · son devis annonce le prix avant le clic. Rien n’est lancé ici.'
        : `Il faut une valeur différente par variante · change ${v === 'accroche' ? 'les textes' : 'la composition'} du brief (nouvelle version) · aucune nouvelle image n’est nécessaire pour ${ESSAI_LABEL[v].toLowerCase()}.`;
    }
    return { ok: false, probleme: r.probleme, conseil };
  }
  const ref = fs[0]!;
  for (const f of fs.slice(1)) {
    const casse = Object.keys(ref.autres).find((k) => ref.autres[k] !== f.autres[k]);
    if (casse) return { ok: false, probleme: `${casse} varie aussi dans ce lot · l’écart ne serait attribuable à rien.`, conseil: null };
  }
  return { ok: true, phrase: `Essai réel · seule ${v === 'accroche' ? 'l’accroche' : v === 'mise_en_page' ? 'la mise en page' : 'l’ambiance'} change d’une variante à l’autre.` };
}

export function planLotEssai(variantes: ReadonlyArray<VariantePourEssai>, v: EssaiVariable, o: { adsmapAcces: boolean }): PlanLotEssai {
  const n = variantes.length;
  const fs = variantes.map((x) => facettesEssai(x.contenu, x.operation, x.sha256));
  const constat = constater(fs, v);
  const hypothese = hypotheseEssai(v, n);
  const variableAdsmap = VARIABLE_ADSMAP_ESSAI[v];
  const images = imagesPourEssai(v, n);

  const lignes: LigneEssai[] = variantes.map((x, i) => {
    const valeur = valeurLisible(fs[i]!, v);
    const etat: EtatLigneLotEssai = !x.test ? 'a_rattacher' : STATUTS_AD_CLOS.includes(x.test.adStatus) ? 'test_clos' : 'en_test';
    const etatTexte = {
      a_rattacher: 'Pas encore rattachée à un test.',
      en_test: 'Déjà en test · sa fiche reste celle-ci, une variante n’a qu’un test ouvert à la fois.',
      test_clos: 'Son test précédent est terminé · elle peut ouvrir celui-ci.',
    }[etat];
    const saisie = constat.ok && etat !== 'en_test' && o.adsmapAcces
      ? { hypothese, variable: variableAdsmap, valeurVariable: valeur === 'aucune' ? '' : valeur }
      : null;
    return { variantId: x.variantId, libelle: x.libelle, valeur, etat, etatTexte, adsmapHref: x.test ? href(x.test.adsmapAdId) : null, saisie };
  });

  // Un lot qui n'est pas un essai ne se décrit pas comme tel, même au coût.
  const generation = !constat.ok
    ? 'Aucune génération ici · rien n’est lancé, rien n’est débité.'
    : images === 1
    ? 'Aucune génération · cet essai se joue sur une seule image, déjà produite.'
    : `Aucune génération ici · cet essai compare ${images} images déjà produites. Une ambiance de plus demanderait une image de plus, par le devis du studio (prix annoncé avant le clic).`;

  const suite: string[] = [];
  if (!constat.ok) suite.push('Ce lot ne se présente pas comme un essai · aucune saisie n’est préremplie.');
  else if (!o.adsmapAcces) suite.push('Le rattachement à un test passe par Adsmap, disponible à partir de l’offre Plus.');
  else {
    suite.push('Rattache chaque variante avec la saisie du plan · la fiche Adsmap naît en brouillon, rien n’est lancé.');
    suite.push('Regroupe ensuite les fiches dans un même lot de test · Résultats › Lots de test (administrateurs).');
  }

  return {
    variable: v, titre: `Essai · ${ESSAI_LABEL[v]}`, hypothese, tenu: tenuDansEssai(v), constat, variableAdsmap, images, generation, lignes, suite,
    lienLots: constat.ok && o.adsmapAcces ? '/adsmap/lots' : null,
  };
}
