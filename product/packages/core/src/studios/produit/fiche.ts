/**
 * Studios · la FICHE du produit épinglé · ce que la personne sait de son
 * produit et que ses photos ne disent pas (référence concurrente : « Ce que
 * Flow sait de ce produit », sa taille réelle « au besoin comparée à une main
 * ou à une personne », « ce que ses photos ne montrent pas », « ce qu'un achat
 * contient » ; « l'emballage, la boîte ou l'étui ne comptent pas comme un
 * autre produit »).
 *
 * Pur. Saisie à la main, gratuite : aucun appel modèle ne la remplit.
 *
 * ── Où elle vit ──────────────────────────────────────────────────────────────
 *
 * La table `products` n'a aucune colonne JSON. La fiche est donc portée par la
 * référence épinglée du projet (`productRef`, document JSON de la version,
 * schéma `produit_epingle/1`), à côté des composants obligatoires et des
 * attributs immuables qui y vivent déjà · aucune migration. Conséquence dite à
 * l'écran : la fiche suit le PROJET (et le produit tant qu'il reste épinglé,
 * même si la photo change), pas toutes les créations de la marque.
 *
 * ── Ce qu'elle devient ───────────────────────────────────────────────────────
 *
 * Chaque champ rempli devient UN attribut immuable de la consigne image
 * (`attributsFiche` → invariants de `image.compile`). Une fiche vide n'ajoute
 * rien : le contexte de compilation reste celui d'avant la fiche (garde
 * `produit-prepare.test.ts`, capture de main).
 */

import type { ViolationStudio } from '../document';
import type { ChangementPatch } from '../patch';
import type { FichierCatalogue } from './catalogue';
import type { ReferenceProduitEpinglee } from './epinglage';
import { VUES_SUPPLEMENTAIRES_MAX } from './vues';
import { contientEmplacement } from '../fournisseurs/fal-image';

export const ECHELLES_PRODUIT = ['main', 'personne', 'objet'] as const;
export type EchelleProduit = typeof ECHELLES_PRODUIT[number];

/** Le repère de taille · dit à l'écran et écrit dans l'attribut. */
export const LIBELLES_ECHELLE: Readonly<Record<EchelleProduit, string>> = {
  main: 'une main',
  personne: 'une personne',
  objet: 'un objet courant',
};

/** Exemple affiché sous le repère choisi. */
export const EXEMPLES_ECHELLE: Readonly<Record<EchelleProduit, string>> = {
  main: 'Ex. tient dans la paume, dépasse à peine des doigts',
  personne: 'Ex. arrive au genou d’un adulte',
  objet: 'Ex. de la taille d’une canette de 33 cl',
};

/** Longueur d'un champ de la fiche · une phrase ou deux, pas une page. */
export const FICHE_TEXTE_MAX = 300;

export interface FicheProduit {
  /** Mesures en mots (« 12 cm de haut, 4 cm de diamètre »). Vide = non renseignée. */
  tailleReelle: string;
  /** Le repère de comparaison · obligatoire dès que la taille est écrite. */
  echelle: EchelleProduit | null;
  /** Ce que donne la comparaison (« tient dans la paume ») · l'objet nommé pour `objet`. */
  echelleDetail: string;
  /** Ce que les photos ne montrent pas (le dos, le dessous, la matière, une couleur réelle). */
  nonMontre: string;
  /** Ce qu'un achat contient (« 1 flacon de 50 ml et sa pipette »). */
  contenuAchat: string;
  /** L'emballage (boîte, étui, sachet) · partie du produit, jamais un autre produit. */
  emballage: string;
}

export const FICHE_VIDE: Readonly<FicheProduit> = { tailleReelle: '', echelle: null, echelleDetail: '', nonMontre: '', contenuAchat: '', emballage: '' };

const CHAMPS_TEXTE = ['tailleReelle', 'echelleDetail', 'nonMontre', 'contenuAchat', 'emballage'] as const;

const propre = (x: string) => x.replace(/\s+/g, ' ').trim();

export const estEchelle = (x: unknown): x is EchelleProduit => typeof x === 'string' && (ECHELLES_PRODUIT as readonly string[]).includes(x);

/** Une fiche où rien n'est écrit · elle n'ajoute aucun attribut. */
export function ficheEstVide(f: FicheProduit | null | undefined): boolean {
  return !f || (CHAMPS_TEXTE.every((k) => f[k] === '') && f.echelle === null);
}

export type ResultatFicheProduit = { ok: true; fiche: FicheProduit | null } | { ok: false; violations: ViolationStudio[] };

/**
 * La fiche reçue du navigateur · textes nettoyés et bornés, repère dans la
 * liste fermée, taille et repère ensemble. `fiche: null` = rien d'écrit.
 */
export function validerFicheProduit(x: unknown): ResultatFicheProduit {
  if (x === undefined || x === null) return { ok: true, fiche: null };
  if (typeof x !== 'object' || Array.isArray(x)) return { ok: false, violations: [{ chemin: 'fiche', raison: 'fiche produit illisible' }] };
  const d = x as Record<string, unknown>;
  const v: ViolationStudio[] = [];
  const f: FicheProduit = { ...FICHE_VIDE };
  for (const k of CHAMPS_TEXTE) {
    const t = d[k];
    if (t === undefined || t === null) continue;
    if (typeof t !== 'string') { v.push({ chemin: `fiche/${k}`, raison: 'texte attendu' }); continue; }
    const p = propre(t);
    if (p.length > FICHE_TEXTE_MAX) { v.push({ chemin: `fiche/${k}`, raison: `${FICHE_TEXTE_MAX} caractères au plus` }); continue; }
    // La fiche entre dans la consigne · un emplacement de gabarit y bloquerait la génération (`contientEmplacement`).
    if (contientEmplacement(p)) { v.push({ chemin: `fiche/${k}`, raison: 'pas d’accolades doubles ni de « ${ » · ce sont des emplacements de gabarit' }); continue; }
    f[k] = p;
  }
  const e = d.echelle;
  if (e !== undefined && e !== null && e !== '') {
    if (!estEchelle(e)) v.push({ chemin: 'fiche/echelle', raison: 'repère de taille inconnu · une main, une personne ou un objet courant' });
    else f.echelle = e;
  }
  if (f.tailleReelle && !f.echelle) v.push({ chemin: 'fiche/echelle', raison: 'choisis à quoi comparer la taille réelle : une main, une personne ou un objet courant' });
  if (f.echelle && !f.tailleReelle) v.push({ chemin: 'fiche/tailleReelle', raison: 'écris la taille réelle à comparer (ex. 12 cm de haut)' });
  if (f.echelle === 'objet' && !f.echelleDetail) v.push({ chemin: 'fiche/echelleDetail', raison: 'nomme l’objet courant (ex. une canette de 33 cl)' });
  if (v.length) return { ok: false, violations: v };
  return { ok: true, fiche: ficheEstVide(f) ? null : f };
}

/** Relecture défensive de la fiche stockée · une forme altérée ne passe pas, elle n'ajoute rien. */
export function lireFicheProduit(x: unknown): FicheProduit | null {
  const r = validerFicheProduit(x);
  return r.ok ? r.fiche : null;
}

/**
 * Les attributs immuables que la fiche ajoute à la consigne image, un par
 * champ rempli, dans un ordre fixe. L'emballage est écrit comme PARTIE du
 * produit : jamais un second article.
 */
export function attributsFiche(f: FicheProduit | null | undefined): string[] {
  if (!f || ficheEstVide(f)) return [];
  const out: string[] = [];
  if (f.tailleReelle && f.echelle) {
    const detail = f.echelleDetail ? ` : ${f.echelleDetail}` : '';
    out.push(`Taille réelle du produit : ${f.tailleReelle} · comparée à ${LIBELLES_ECHELLE[f.echelle]}${detail}. Garder cette échelle face à toute main, personne ou objet de la scène · ni agrandi, ni rapetissé.`);
  }
  if (f.nonMontre) out.push(`Ce que les photos du produit ne montrent pas : ${f.nonMontre}. Si cette partie paraît, elle suit cette description · rien d’autre n’est inventé.`);
  if (f.contenuAchat) out.push(`Ce qu’un achat contient : ${f.contenuAchat}. Montrer au plus ce contenu · jamais un article en plus.`);
  if (f.emballage) out.push(`Emballage : ${f.emballage}. Il fait partie du produit, ce n’est pas un autre produit · jamais présenté comme un second article ni dédoublé.`);
  return out;
}

/* ─────────────────────── Écriture sur la référence ───────────────────────── */

export interface DemandeFiche {
  fiche: unknown;
  /** `null` ou absent = vues par défaut ; liste (vide permise) = vues choisies. */
  vues?: unknown;
}

export type ResultatDefinitionFiche = { ok: true; reference: ReferenceProduitEpinglee } | { ok: false; violations: ViolationStudio[] };

/**
 * La référence épinglée avec sa fiche et ses vues · les vues viennent du
 * catalogue SERVEUR et sont des photos de CE produit, autres que l'épinglée,
 * deux au plus. Une fiche vide retire la clé (la référence redevient celle de
 * l'épinglage) ; des vues `null` reviennent au défaut.
 */
export function definirFicheProduit(ref: ReferenceProduitEpinglee, d: DemandeFiche, photos: readonly FichierCatalogue[]): ResultatDefinitionFiche {
  const v: ViolationStudio[] = [];
  const f = validerFicheProduit(d.fiche);
  if (!f.ok) v.push(...f.violations);
  let vues: string[] | null = null;
  if (d.vues !== undefined && d.vues !== null) {
    if (!Array.isArray(d.vues)) v.push({ chemin: 'vues', raison: 'liste de photos attendue' });
    else {
      const duProduit = new Set(photos.filter((p) => p.provenance === 'produit' && p.productId === ref.productId && p.assetId !== ref.photo.assetId).map((p) => p.assetId));
      vues = [];
      for (const id of d.vues) {
        if (typeof id !== 'string' || !duProduit.has(id)) { v.push({ chemin: 'vues', raison: 'une vue est une autre photo de CE produit · jamais celle d’un autre produit' }); continue; }
        if (!vues.includes(id)) vues.push(id);
      }
      if (vues.length > VUES_SUPPLEMENTAIRES_MAX) v.push({ chemin: 'vues', raison: `${VUES_SUPPLEMENTAIRES_MAX} vues au plus en plus de la photo épinglée` });
    }
  }
  if (v.length || !f.ok) return { ok: false, violations: v };
  const { fiche: _f, vuesChoisies: _v, ...reste } = ref;
  void _f; void _v;
  return { ok: true, reference: { ...reste, ...(f.fiche ? { fiche: f.fiche } : {}), ...(vues ? { vuesChoisies: vues } : {}) } };
}

/** Le changement de version · `/productRef` seul (le brief ne bouge pas). */
export function changementsFiche(ref: ReferenceProduitEpinglee): ChangementPatch[] {
  return [{ op: 'replace', path: '/productRef', newValue: ref, reason: `Fiche produit : ${ref.nom}` }];
}

/* ───────────────────────────── Ce que l'écran dit ────────────────────────── */

/** Pourquoi « Enregistrer la fiche » est fermé · `null` quand le geste est permis. */
export function raisonFiche(e: { peutModifier: boolean; fiche: unknown }): string | null {
  if (!e.peutModifier) return 'Ton rôle permet de consulter, pas de modifier la fiche.';
  const r = validerFicheProduit(e.fiche);
  return r.ok ? null : [...new Set(r.violations.map((v) => v.raison))].join(' · ');
}

/** Pourquoi une vue ne peut pas être ajoutée · `null` quand elle peut l'être (ou être retirée). */
export function raisonVue(e: { peutModifier: boolean; choisie: boolean; nombreChoisies: number }): string | null {
  if (!e.peutModifier) return 'Ton rôle permet de consulter, pas de choisir les vues.';
  if (!e.choisie && e.nombreChoisies >= VUES_SUPPLEMENTAIRES_MAX) return `${VUES_SUPPLEMENTAIRES_MAX} vues au plus en plus de la photo épinglée · retires-en une pour en choisir une autre.`;
  return null;
}

/**
 * Changer de produit épinglé repart d'une référence neuve · la fiche de
 * l'ancien produit quitte le projet. Dit AVANT le geste, quand il y a une
 * fiche à perdre. `null` = rien à dire.
 */
export function raisonFicheRetiree(e: { epingle: Pick<ReferenceProduitEpinglee, 'productId' | 'nom' | 'fiche'> | null; produitChoisi: string }): string | null {
  if (!e.epingle || e.epingle.productId === e.produitChoisi) return null;
  if (ficheEstVide(lireFicheProduit(e.epingle.fiche))) return null;
  return `La fiche de « ${e.epingle.nom} » sera retirée de ce projet.`;
}

/** Les vues réglées à l'écran diffèrent-elles de celles enregistrées ? (`null` enregistré = l'épinglée seule, par défaut.) */
export function vuesModifiees(enregistrees: readonly string[] | null | undefined, brouillon: { choix: boolean; vues: readonly string[] }): boolean {
  if (!enregistrees) return brouillon.choix;
  if (!brouillon.choix) return true;
  return enregistrees.length !== brouillon.vues.length || enregistrees.some((id, i) => id !== brouillon.vues[i]);
}
