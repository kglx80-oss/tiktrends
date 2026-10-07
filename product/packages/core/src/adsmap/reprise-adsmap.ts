/**
 * Lot 17 · trois ruptures de reprise et d'itération Adsmap, mesurées en local
 * (build `96a7d700`, fixtures synthétiques, 1280×720).
 *
 * | Parcours                                        | Mesuré avant                                                        |
 * | ----------------------------------------------- | ------------------------------------------------------------------- |
 * | Studio Image › « Suivre dans Adsmap »           | 3/3 en échec · id composite `génération:url` refusé (uuid) · message en infobulle seulement, focus sur <body> |
 * | Fiche d'une ad incomplète › « Préparer un test » | renvoie aux Lots, qui la disent « incomplète » (détail en infobulle) · boucle · offre et page ne se saisissent nulle part |
 * | Brief d'itération › onglet Image › Pubs IA      | `?iter` perdu · panneau disparu, saisie rangée sous la clé de l'itération devenue invisible |
 *
 * Frontières (documentées, NON modifiées ici) · rattacher la créa générée à son
 * test parent (filiation) exige d'écrire le parent dans la génération et une
 * arête d'itération · suivre chaque image d'un même lot exige un lien par image
 * (modèle de données).
 *
 * Lot 21 · « Compléter le test » ferme la frontière de complétude · voir la
 * section du même nom plus bas (règles pures de saisie, l'action serveur ne
 * fait qu'écrire ce qu'elles rendent).
 */

import { checkAdReady, type AdShape } from './invariants';
import type { AdType, TestedVariable } from './types';
import { LIBELLE_VARIABLE_TEST } from '../brief-iteration';

// ── Identifiant de génération (Studio Image) ────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * L'identifiant de la GÉNÉRATION derrière une carte du Studio · la galerie Image
 * compose `génération:url` (une carte par image) · la passerelle Adsmap attend
 * la génération seule. `null` quand la carte n'a pas encore d'identifiant de
 * génération (repli `new-…` d'une image fraîche, `tmp-…` d'une vidéo en cours) ·
 * il n'y a alors rien à suivre.
 */
export function idGenerationSuivable(idCarte: string | null | undefined): string | null {
  const brut = (idCarte ?? '').trim();
  const i = brut.indexOf(':');
  const id = i === -1 ? brut : brut.slice(0, i);
  return UUID.test(id) ? id.toLowerCase() : null;
}

/**
 * Deuxième image d'une même génération · la passerelle suit une GÉNÉRATION
 * (une fiche), pas chaque image · elle renvoie la fiche existante. L'écran
 * disait « Ajoutée à la carte » (mesuré, lot 17) · on dit ce qui se passe.
 */
export const DEJA_SUIVIE = 'Déjà suivie · cette génération n’a qu’une fiche dans Adsmap, partagée par ses images.';

// ── Complétude d'une ad avant test ──────────────────────────────────────────

const LIBELLE_MANQUE: Record<string, string> = {
  'ad.hypothesis': 'l’hypothèse testée',
  'ad.tested_variable': 'la variable testée',
  'ad.offer': 'l’offre',
  'ad.landing_page': 'la page de destination',
};

/** Ce qui manque à une ad pour partir en test (même règle que la préparation d'un lot). */
export function manquesAvantTest(ad: Omit<AdShape, 'status'>): string[] {
  return checkAdReady({ ...ad, status: 'ready' }).map((v) => LIBELLE_MANQUE[v.rule] ?? v.message);
}

export function listeManques(manques: string[]): string {
  if (manques.length <= 1) return manques[0] ?? '';
  return `${manques.slice(0, -1).join(', ')} et ${manques[manques.length - 1]}`;
}

/**
 * Lot 17 · ces champs ne s'écrivaient sur une ad existante par AUCUN écran, et
 * la fiche le disait. Lot 21 · le formulaire « Compléter le test » du tiroir
 * les écrit · la phrase mène désormais à lui (même place, juste en dessous).
 */
export const COMPLETUDE_DANS_L_OUTIL = 'Le formulaire « Compléter le test », juste en dessous, les enregistre · tant qu’ils manquent, cette ad ne peut pas partir en test.';
/** Nom historique (lot 17) · même valeur que `COMPLETUDE_DANS_L_OUTIL`. */
export const COMPLETUDE_HORS_OUTIL = COMPLETUDE_DANS_L_OUTIL;

export function texteAdIncomplete(manques: string[]): string {
  return `À compléter avant tout test · ${listeManques(manques)}. ${COMPLETUDE_DANS_L_OUTIL}`;
}

// ── Compléter le test (lot 21 · rupture R1) ─────────────────────────────────
//
// Mesuré avant (bc33cec8) · aucune ad née dans l'outil ne pouvait partir en
// test · aucune action n'écrivait hypothèse, variable, offre ni page sur une ad
// existante, et `adsmap_offers` / `adsmap_landing_pages` n'étaient lues ni
// écrites hors du schéma. « Préparer » laissait l'ad en brouillon, « Lancer »
// refusait, la mesure ne venait jamais.
//
// Le contrat est celui de la préparation d'un lot · `checkAdReady` (hypothèse,
// variable ≠ témoin, offre, page) · rien d'ajouté, rien de retiré. L'offre est
// celle du PRODUIT vendu dans la pub (table `adsmap_offers`), jamais une offre
// d'abonnement · elle et la page se PRÉREMPLISSENT depuis un produit de la
// marque, mais ne s'écrivent qu'une fois leurs valeurs CONFIRMÉES à l'écran.
// L'hypothèse n'est jamais préremplie · c'est le maillon humain du test.
//
// Identité · une offre ne garde qu'un LIBELLÉ (le nom du produit) et un PRIX ·
// aucun identifiant de produit (schéma inchangé). Deux produits homonymes à
// prix différents donnent deux offres · à nom ET prix égaux, ils partagent la
// même ligne d'offre (rien ne les distingue en base). Une page de destination
// est identifiée par son adresse seule.

/** Seuls un brouillon ou une proposition se complètent · « prête » et au-delà passent par les Lots. */
export const STATUTS_COMPLETABLES: readonly string[] = ['draft', 'proposed'];
export function adCompletable(status: string | null | undefined): boolean {
  return STATUTS_COMPLETABLES.includes(status ?? '');
}

/** Le titre du formulaire et son ancre dans le tiroir. */
export const COMPLETER_LE_TEST = { titre: 'Compléter le test', ancre: 'completer-test' } as const;

/** Bornes de saisie · les mêmes que l'itération (`createIterationAction`). */
export const BORNES_COMPLETUDE = { hypotheseMin: 10, hypotheseMax: 900, valeurMax: 300, urlMax: 2048, libelleMax: 200 } as const;

/**
 * Les variables qu'on peut tester · le témoin (`none_control`) n'en est pas
 * une (`checkAdReady` le refuse). « Offre » et « Landing » disent leur contexte ·
 * l'offre du produit vendu, jamais l'abonnement.
 */
export const VARIABLES_A_TESTER: ReadonlyArray<{ valeur: TestedVariable; libelle: string }> = (
  Object.keys(LIBELLE_VARIABLE_TEST) as TestedVariable[]
)
  .filter((v) => v !== 'none_control')
  .map((v) => ({
    valeur: v,
    libelle: v === 'offer' ? 'Offre du produit (prix, remise, garantie)' : v === 'landing' ? 'Page de destination' : LIBELLE_VARIABLE_TEST[v]!,
  }));

/** Un produit de la marque, tel que le formulaire le lit (aucune écriture sur lui). */
export interface ProduitMarque { id: string; nom: string; prix: number | null; url: string | null }

/**
 * Le libellé d'un produit dans le choix du formulaire · un homonyme dans la
 * marque est départagé par son prix et son adresse (sans quoi deux lignes
 * identiques se confondent à l'écran). Ce n'est qu'un libellé d'affichage.
 */
export function libelleOptionProduit(p: ProduitMarque, produits: readonly ProduitMarque[]): string {
  const nom = p.nom.trim();
  const homonymes = produits.filter((q) => q.nom.trim().toLowerCase() === nom.toLowerCase()).length > 1;
  if (!homonymes) return nom;
  const prix = typeof p.prix === 'number' && Number.isFinite(p.prix) ? `${preremplissageProduit(p).prix} €` : 'sans prix';
  let adresse = 'sans adresse';
  if (p.url) { try { const u = new URL(p.url); adresse = `${u.host}${u.pathname === '/' ? '' : u.pathname}`; } catch { adresse = p.url; } }
  return `${nom} · ${prix} · ${adresse}`;
}

/** Les champs que le formulaire montre · exactement ce qui manque, rien d'autre. */
export function champsACompleter(manques: readonly string[]): { hypothese: boolean; variable: boolean; offre: boolean; page: boolean } {
  return {
    hypothese: manques.includes(LIBELLE_MANQUE['ad.hypothesis']!),
    variable: manques.includes(LIBELLE_MANQUE['ad.tested_variable']!),
    offre: manques.includes(LIBELLE_MANQUE['ad.offer']!),
    page: manques.includes(LIBELLE_MANQUE['ad.landing_page']!),
  };
}

const prixLisible = (p: number) => p.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(p) ? 0 : 2, maximumFractionDigits: 2 });

/**
 * Le préremplissage depuis un produit · le prix et l'URL du produit, À
 * CONFIRMER. Jamais d'hypothèse, jamais l'URL de la marque en repli · sans URL
 * produit, le champ reste vide et la page reste un manque.
 */
export function preremplissageProduit(p: ProduitMarque | null | undefined): { prix: string; url: string } {
  if (!p) return { prix: '', url: '' };
  const prix = typeof p.prix === 'number' && Number.isFinite(p.prix) && p.prix >= 0 ? prixLisible(p.prix).replace(/\u202f|\u00a0/g, ' ') : '';
  return { prix, url: (p.url ?? '').trim() };
}

/** Le prix saisi · vide = non renseigné (`null`), jamais deviné. */
export function lirePrix(brut: string | null | undefined): { ok: true; prix: number | null } | { ok: false; erreur: string } {
  const t = (brut ?? '').replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  if (!t) return { ok: true, prix: null };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, erreur: 'Le prix doit être un nombre positif · par exemple 29,90.' };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { ok: false, erreur: 'Le prix doit être un nombre positif · par exemple 29,90.' };
  return { ok: true, prix: n };
}

/** L'URL de la page · http(s) seulement, vide = pas de page (le manque reste). */
export function lireUrlPage(brut: string | null | undefined): { ok: true; url: string | null } | { ok: false; erreur: string } {
  const t = (brut ?? '').trim();
  if (!t) return { ok: true, url: null };
  if (t.length > BORNES_COMPLETUDE.urlMax) return { ok: false, erreur: 'L’adresse de la page est trop longue.' };
  let u: URL;
  try { u = new URL(t); } catch { return { ok: false, erreur: 'L’adresse de la page doit commencer par https:// (ou http://).' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, erreur: 'L’adresse de la page doit commencer par https:// (ou http://).' };
  return { ok: true, url: u.toString() };
}

/** L'ad telle que le serveur la relit avant d'écrire. */
export interface AdACompleter {
  status: string;
  adType: AdType;
  hypothesis: string | null;
  testedVariable: TestedVariable | string | null;
  offerId: string | null;
  landingPageId: string | null;
}

/** Ce que l'utilisateur a saisi · l'offre et la page n'existent que confirmées. */
export interface SaisieCompletude {
  hypothesis?: string | null;
  testedVariable?: string | null;
  variableValue?: string | null;
  produitId?: string | null;
  offre?: { prix: string; confirmee: boolean } | null;
  page?: { url: string; confirmee: boolean } | null;
}

export type ResultatCompletude =
  | { ok: false; erreur: string }
  | {
      ok: true;
      /** Les champs de l'ad à écrire · jamais `status` (Préparer reste la seule porte vers « prête »). */
      maj: { hypothesis?: string; testedVariable?: TestedVariable; variableValue?: string };
      /** L'offre du produit à rattacher (recherche-ou-création côté serveur) · `null` = rien à écrire. */
      offre: { label: string; price: number | null } | null;
      /** La page à rattacher · `null` = rien à écrire. */
      page: { url: string; label: string; pageType: 'pdp' } | null;
      /** Ce qui manquera encore APRÈS l'écriture (même règle que la préparation). */
      manquesApres: string[];
      /** Rien de neuf · la saisie était déjà en base (nouvel essai après une réponse perdue). */
      dejaEnregistre: boolean;
    };

export const STATUT_NON_COMPLETABLE = 'Cette ad n’est plus un brouillon · elle se complète avant d’entrer en préparation, pas après. Rien n’a été enregistré.';

/**
 * La saisie « Compléter le test », validée et réduite à ce qu'il faut écrire.
 * `produits` = les produits de la MARQUE ACTIVE (le serveur les lit) · un
 * produit hors de cette liste est refusé.
 */
export function saisieCompletude(ad: AdACompleter, s: SaisieCompletude, produits: readonly ProduitMarque[]): ResultatCompletude {
  if (!adCompletable(ad.status)) return { ok: false, erreur: STATUT_NON_COMPLETABLE };
  const manques = manquesAvantTest({ adType: ad.adType, hypothesis: ad.hypothesis, testedVariable: ad.testedVariable as TestedVariable | null, offerId: ad.offerId, landingPageId: ad.landingPageId });
  const champs = champsACompleter(manques);
  const maj: { hypothesis?: string; testedVariable?: TestedVariable; variableValue?: string } = {};
  let dejaSaisi = 0;

  const hyp = (s.hypothesis ?? '').trim();
  if (hyp) {
    if (!champs.hypothese) dejaSaisi++;
    else if (hyp.length < BORNES_COMPLETUDE.hypotheseMin) return { ok: false, erreur: 'Écris l’hypothèse en une phrase · quel KPI, quelle étape du funnel, quelle valeur cible.' };
    else if (hyp.length > BORNES_COMPLETUDE.hypotheseMax) return { ok: false, erreur: `Resserre l’hypothèse à ${BORNES_COMPLETUDE.hypotheseMax} caractères.` };
    else maj.hypothesis = hyp;
  }

  const variable = (s.testedVariable ?? '').trim();
  if (variable) {
    if (variable === 'none_control') return { ok: false, erreur: 'Le témoin n’est pas une variable testée · choisis ce que cette ad change.' };
    if (!VARIABLES_A_TESTER.some((v) => v.valeur === variable)) return { ok: false, erreur: 'Variable testée inconnue.' };
    if (!champs.variable) dejaSaisi++;
    else {
      maj.testedVariable = variable as TestedVariable;
      const valeur = (s.variableValue ?? '').trim();
      if (valeur.length > BORNES_COMPLETUDE.valeurMax) return { ok: false, erreur: `Resserre la valeur testée à ${BORNES_COMPLETUDE.valeurMax} caractères.` };
      if (valeur) maj.variableValue = valeur;
    }
  }

  const veutOffre = !!s.offre?.confirmee;
  const veutPage = !!s.page?.confirmee;
  let produit: ProduitMarque | null = null;
  if (veutOffre || veutPage) {
    produit = produits.find((p) => p.id === s.produitId) ?? null;
    if (!produit) return { ok: false, erreur: 'Choisis le produit vendu dans la pub · il doit appartenir à la marque active.' };
  }
  const libelle = (produit?.nom ?? '').trim().slice(0, BORNES_COMPLETUDE.libelleMax) || 'Produit';

  let offre: { label: string; price: number | null } | null = null;
  if (veutOffre) {
    if (!champs.offre) dejaSaisi++;
    else {
      const prix = lirePrix(s.offre!.prix);
      if (!prix.ok) return { ok: false, erreur: prix.erreur };
      offre = { label: libelle, price: prix.prix };
    }
  }

  let page: { url: string; label: string; pageType: 'pdp' } | null = null;
  if (veutPage) {
    if (!champs.page) dejaSaisi++;
    else {
      const url = lireUrlPage(s.page!.url);
      if (!url.ok) return { ok: false, erreur: url.erreur };
      // Confirmer une page sans adresse n'est pas un succès · le manque reste dit.
      if (!url.url) return { ok: false, erreur: 'Aucune adresse à confirmer · la page de destination reste à compléter.' };
      page = { url: url.url, label: libelle, pageType: 'pdp' };
    }
  }

  const rienDeNeuf = !maj.hypothesis && !maj.testedVariable && !offre && !page;
  if (rienDeNeuf && dejaSaisi === 0) {
    return { ok: false, erreur: 'Rien à enregistrer · écris l’hypothèse, choisis la variable, ou confirme le prix et l’adresse du produit.' };
  }

  const manquesApres = manquesAvantTest({
    adType: ad.adType,
    hypothesis: maj.hypothesis ?? ad.hypothesis,
    testedVariable: (maj.testedVariable ?? ad.testedVariable) as TestedVariable | null,
    offerId: offre ? 'à-rattacher' : ad.offerId,
    landingPageId: page ? 'à-rattacher' : ad.landingPageId,
  });
  return { ok: true, maj, offre, page, manquesApres, dejaEnregistre: rienDeNeuf };
}

/** Ce que dit le formulaire après une écriture réussie. */
export function texteApresCompletude(manquesApres: readonly string[]): string {
  return manquesApres.length
    ? `Enregistré · reste à compléter ${listeManques([...manquesApres])}.`
    : 'Enregistré · le test est complet · « Préparer » dans les Lots le fera passer en prête.';
}

// ── Lots (lot 21 · recette du pilotage) ─────────────────────────────────────

/** Statuts d'un lot qui disent qu'il est parti (même règle que `etatLancementLot`). */
const LOT_PARTI = new Set(['testing', 'analyzed']);

/**
 * Le bilan de « Préparer le lot » · il ne vaut que tant que le lot n'est pas
 * parti. Mesuré (d9613eee) · « Le lot est prêt à partir. » restait affiché à
 * côté de « Ce lot est déjà lancé. » · `null` = ne rien afficher.
 */
export function texteBilanPreparation(
  prep: { named?: number; ready?: number; skipped?: ReadonlyArray<unknown> } | null | undefined,
  statutLot: string | null | undefined,
): string | null {
  if (!prep || LOT_PARTI.has(statutLot ?? '')) return null;
  const reste = prep.skipped?.length ?? 0;
  return `${prep.named ?? 0} nom(s) généré(s), ${prep.ready ?? 0} ad(s) passée(s) en prêt.${reste ? ` ${reste} ad(s) restent en brouillon · le détail est sur chaque ligne.` : ' Le lot est prêt à partir.'}`;
}

/** Ce que dit une carte du vivier d'une ad incomplète · la raison EN ENTIER. */
export function raisonVivier(c: { blocking: string | null; manques?: readonly string[] | null }): string | null {
  if (!c.blocking) return null;
  return c.manques?.length ? `incomplète · manque ${listeManques([...c.manques])}` : 'incomplète';
}

/** Le nom accessible du bouton d'une carte du vivier · le geste, puis tout le texte visible. */
export function nomBoutonVivier(c: { variantCode: string; concept: string; blocking: string | null; manques?: readonly string[] | null }): string {
  const raison = raisonVivier(c);
  return `Ajouter au lot · ${c.variantCode} · ${c.concept}${raison ? ` · ${raison}` : ''}`;
}

/**
 * Ligne 437 du tiroir (audit lot 20 · R1) · « avec l'offre et la page héritées »
 * était promis alors qu'elles étaient toujours nulles. L'itération reprend
 * l'offre et la page de CETTE ad (`createIterationAction`) · on dit ce qu'elle
 * a réellement, d'après ses manques.
 */
export function texteHeritageIteration(manquesParent: readonly string[]): string {
  const sansOffre = manquesParent.includes(LIBELLE_MANQUE['ad.offer']!);
  const sansPage = manquesParent.includes(LIBELLE_MANQUE['ad.landing_page']!);
  if (!sansOffre && !sansPage) return 'L’itération naît en brouillon, avec l’offre et la page de destination de cette ad · il ne restera que ce qui change à produire.';
  if (sansOffre && sansPage) return 'L’itération naît en brouillon, sans offre ni page de destination · cette ad n’en a pas, il faudra les compléter avant de la tester.';
  if (sansOffre) return 'L’itération naît en brouillon, avec la page de destination de cette ad · l’offre du produit restera à compléter avant de la tester.';
  return 'L’itération naît en brouillon, avec l’offre du produit de cette ad · la page de destination restera à compléter avant de la tester.';
}

// ── Reprise du brief d'itération (Studio Pubs IA) ───────────────────────────

/** Mémoire de l'onglet · le brief d'itération ouvert en dernier, par marque. */
export const CLE_ITERATION_EN_COURS = 'tt_iteration_en_cours';

export interface IterationEnCours { brandId: string; adId: string; titre: string }

/**
 * Faut-il proposer de reprendre le brief ? Seulement quand l'URL n'en porte
 * aucun (on est revenu sur Pubs IA par la navigation), dans la MÊME marque, et
 * que la mémoire est bien formée. Le lien rétablit `?iter` · le Studio retrouve
 * alors le brief et la saisie rangée sous la clé de cette itération.
 */
export function repriseIteration(
  memo: unknown,
  ctx: { brandId: string | null; iterDansUrl: boolean },
): { href: string; titre: string } | null {
  if (ctx.iterDansUrl || !ctx.brandId || !memo || typeof memo !== 'object') return null;
  const m = memo as Partial<IterationEnCours>;
  if (m.brandId !== ctx.brandId || typeof m.adId !== 'string' || !UUID.test(m.adId) || typeof m.titre !== 'string') return null;
  return { href: `/studio/ads?iter=${encodeURIComponent(m.adId)}`, titre: m.titre.slice(0, 120) };
}

/** Ce que le brief dit de la créa produite · elle n'est pas rattachée au test source. */
export const FILIATION_NON_ENREGISTREE = 'La pub créée ici n’est pas rattachée à ce test dans Adsmap · sa fiche n’affichera pas « Vient de ».';
