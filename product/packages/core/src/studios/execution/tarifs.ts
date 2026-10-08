/**
 * Studios · L3 · grille de prix des opérations d'un devis (cahier 01 §9.3).
 *
 * Pur. AUCUN prix n'est inventé ici : chaque tarif est DÉRIVÉ du barème
 * existant du produit, qui reste la seule source.
 *
 *  · crédits utilisateur : `CREDIT_COSTS` (`credits.ts`) · une image clé ou une
 *    fiche d'identité coûte ce que coûte « Génération image » aujourd'hui, un
 *    clip animé ce que coûte « Vidéo IA » ;
 *  · coût fournisseur plafond : `FIXED_COSTS` (`spend-guard.ts`), en
 *    micro-dollars entiers (jamais de flottant dans un registre).
 *
 * Un profil SANS tarif existant (la voix : aucun débit de voix n'existe dans
 * l'offre) n'est pas deviné : le devis le refuse avec `UNSUPPORTED_CAPABILITY`
 * (cahier 01 §6.3 · « marquer le lot bloqué pour preuve réelle »).
 *
 * Les nœuds `calcul` (composition, montage, mix, sous-titres, export) sont
 * déterministes et sans fournisseur payant : 0 crédit, 0 dollar, marqués
 * « inclus ». Un devis nul reste un devis À APPROUVER : gratuit ne veut pas
 * dire automatique.
 *
 * `PRICING_VERSION` est l'empreinte de la grille dérivée : si le barème change,
 * la version change d'elle-même, sans qu'on pense à l'incrémenter.
 */

import { CREDIT_COSTS } from '../../credits';
import { FIXED_COSTS, costOfTokens } from '../../spend-guard';
import {
  JETONS_CADRE_BLOC, JETONS_CADRE_REQUETE, qualifierTotal, type NatureCout, type QualificationTotal,
} from '../../depense-prudente';
import { VISION_JETONS_IMAGE_MAX } from '../../prompts/vision';
import { JETONS_SORTIE_MAX_PROPOSITION } from '../bornes-taches';
import type { NatureNoeud, PlanImpact } from '../impact';
import { empreinteContenu } from '../version';

export type ProfilOperation = 'image_generation' | 'animation' | 'speech' | 'calcul';

export interface TarifProfil {
  /** Crédits par unité · `null` = aucun tarif dans l'offre, opération refusée au devis. */
  credits: number | null;
  /** Plafond fournisseur par unité, micro-dollars entiers. */
  usdMicros: number | null;
  /** D'où vient le chiffre · lisible dans le devis. */
  source: string;
}

/**
 * R3 · nature du montant de chaque profil (`NatureCout`, `depense-prudente.ts`).
 * Une BORNE se prouve ; une ESTIMATION dit pourquoi elle n'en est pas une.
 *  · image · prix fixe connu par image (`FIXED_COSTS.fal_image`, la même
 *    somme que le worker réserve par soumission) ⇒ borne ;
 *  · calcul · déterministe, local, aucun fournisseur payant ⇒ borne (0 $) ;
 *  · animation · forfait (`FIXED_COSTS.fal_video`), le prix réel dépend de la
 *    durée et du modèle ⇒ estimation ;
 *  · voix · aucun tarif (refusée au devis), nature sans objet.
 * Hors grille (`PRICING_VERSION` inchangée) : la nature ne change aucun prix.
 */
export const NATURE_PROFIL: Readonly<Record<ProfilOperation, { nature: NatureCout; motif: string | null }>> = {
  image_generation: { nature: 'borne', motif: null },
  calcul: { nature: 'borne', motif: null },
  animation: { nature: 'estimation', motif: 'forfait vidéo · le prix réel dépend de la durée et du modèle' },
  speech: { nature: 'estimation', motif: 'aucun tarif de voix' },
};

const micros = (usd: number): number => Math.round(usd * 1_000_000);

export const GRILLE_STUDIO: Readonly<Record<ProfilOperation, TarifProfil>> = {
  image_generation: { credits: CREDIT_COSTS.image, usdMicros: micros(FIXED_COSTS.fal_image), source: 'CREDIT_COSTS.image · FIXED_COSTS.fal_image' },
  animation: { credits: CREDIT_COSTS.video, usdMicros: micros(FIXED_COSTS.fal_video), source: 'CREDIT_COSTS.video · FIXED_COSTS.fal_video' },
  speech: { credits: null, usdMicros: null, source: 'aucun tarif de voix dans l’offre' },
  calcul: { credits: 0, usdMicros: 0, source: 'rendu déterministe · inclus' },
};

export const PRICING_VERSION = `studio-v1-${empreinteContenu(GRILLE_STUDIO).slice(0, 12)}`;

/** Le profil d'un nœud du plan d'impact · `null` si le nœud n'est pas connu. */
export function profilDuNoeud(id: string, nature: NatureNoeud): ProfilOperation | null {
  if (nature === 'calcul') return 'calcul';
  const prefixe = id.split(':')[0];
  if (prefixe === 'identite' || prefixe === 'keyframe') return 'image_generation';
  if (prefixe === 'clip') return 'animation';
  if (prefixe === 'voix') return 'speech';
  return null;
}

/** Profil d'une ligne · une opération de production, ou le contrôle visuel (R3). */
export type ProfilLigne = ProfilOperation | 'controle_visuel';

export interface LigneDevis {
  /** Identifiant du nœud du plan d'impact (`keyframe:s_ouverture`, `composition`…), ou `controle:vision`. */
  operation: string;
  nature: NatureNoeud;
  profil: ProfilLigne;
  unites: number;
  credits: number;
  usdMicros: number;
  /** Ligne à 0 crédit · incluse, mais toujours soumise à approbation. */
  inclus: boolean;
  /**
   * R3 · le montant est-il une BORNE prouvée ou une ESTIMATION ? Absent sur
   * les devis écrits avant R3 : lu comme une estimation (`qualifierDevis`).
   * Hors empreinte du devis (`empreinteEntreesDevis` ne lit que les montants).
   */
  natureCout?: NatureCout;
  /** Pourquoi ce montant n'est qu'une estimation · `null` pour une borne. */
  motifEstimation?: string | null;
}

export type ResultatLignes =
  | { ok: true; lignes: LigneDevis[]; totalCredits: number; totalUsdMicros: number }
  | { ok: false; code: 'UNSUPPORTED_CAPABILITY' | 'INVALID_SCHEMA'; cibles: string[]; motif: string };

/**
 * Les lignes d'un devis à partir d'un plan d'impact.
 *
 * `selection` (facultative) restreint aux opérations voulues ; elle doit être
 * contenue dans ce que le plan dit « à refaire » : on ne devise pas une sortie
 * que le plan réutilise, ni une opération inventée par le client.
 */
export function lignesDuDevis(plan: Pick<PlanImpact, 'aRefaire'>, selection?: readonly string[] | null, grille: Readonly<Record<ProfilOperation, TarifProfil>> = GRILLE_STUDIO): ResultatLignes {
  const aRefaire = new Map(plan.aRefaire.map((n) => [n.id, n.nature] as const));
  let ids: string[];
  if (selection && selection.length > 0) {
    const inconnues = selection.filter((s) => !aRefaire.has(s));
    if (inconnues.length) return { ok: false, code: 'INVALID_SCHEMA', cibles: [...new Set(inconnues)], motif: 'opérations absentes du plan d’impact' };
    ids = [...new Set(selection)];
  } else {
    ids = [...aRefaire.keys()];
  }
  if (ids.length === 0) return { ok: false, code: 'INVALID_SCHEMA', cibles: [], motif: 'rien à produire · aucun devis nécessaire' };

  const lignes: LigneDevis[] = [];
  const nonTarifees: string[] = [];
  for (const id of ids) {
    const nature = aRefaire.get(id)!;
    const profil = profilDuNoeud(id, nature);
    const tarif = profil ? grille[profil] : null;
    if (!profil || !tarif || tarif.credits === null || tarif.usdMicros === null) { nonTarifees.push(id); continue; }
    const n = NATURE_PROFIL[profil];
    lignes.push({ operation: id, nature, profil, unites: 1, credits: tarif.credits, usdMicros: tarif.usdMicros, inclus: tarif.credits === 0, natureCout: n.nature, motifEstimation: n.motif });
  }
  if (nonTarifees.length) return { ok: false, code: 'UNSUPPORTED_CAPABILITY', cibles: nonTarifees, motif: 'opération sans tarif ni fournisseur branché' };
  lignes.sort((a, b) => (a.operation < b.operation ? -1 : a.operation > b.operation ? 1 : 0));
  return {
    ok: true,
    lignes,
    totalCredits: lignes.reduce((s, l) => s + l.credits * l.unites, 0),
    totalUsdMicros: lignes.reduce((s, l) => s + l.usdMicros * l.unites, 0),
  };
}

/**
 * Plafond DOLLARS global (barrière de dépense existante). Pur : le serveur
 * fournit la dépense et le plafond lus par `spendStatus`. Un devis dont le
 * plafond fournisseur dépasse ce qui reste ne part pas.
 */
export function refusPlafondDollars(a: { capUsd: number; depenseUsd: number; bloque: boolean; devisUsdMicros: number }): string | null {
  if (a.devisUsdMicros <= 0) return null;
  if (a.bloque) return 'plafond de dépense atteint';
  const resteMicros = Math.floor((a.capUsd - a.depenseUsd) * 1_000_000);
  if (!(resteMicros >= a.devisUsdMicros)) return 'le plafond de dépense restant ne couvre pas ce devis';
  return null;
}

/* ═══════════════════ R3 · contrôle visuel, ligne du devis ═══════════════════ */

/**
 * Le contrôle visuel d'une sortie (`quality.visual`, vision Anthropic) coûte
 * de l'argent réel. Décision du propriétaire (8 octobre) : il est ACTIVÉ PAR
 * DÉFAUT, mais c'est une ligne VISIBLE et CHIFFRÉE du devis, acceptée avec lui
 * avant génération ; on peut la décocher avant d'accepter. Jamais de débit
 * ajouté après coup : sans cette ligne approuvée, le contrôle est refusé
 * (`controleVisionApprouve`), 0 appel, 0 ligne `ai_spend`.
 *
 * ── Une BORNE par image, appliquée à l'exécution ─────────────────────────────
 *
 * Par image contrôlée : cadre de requête, 5 blocs (2 blocs système, le
 * message, l'image, le texte), le texte compilé à `OCTETS_TEXTE_CONTROLE_VISION_MAX`
 * octets UTF-8 au plus (un jeton couvre au moins un octet), l'image à
 * `VISION_JETONS_IMAGE_MAX`, la sortie à `JETONS_SORTIE_MAX_PROPOSITION` (le
 * plafond du résolveur). Le contrôle REFUSE avant tout appel une requête dont
 * la borne (`borneMaxAppel`) dépasse le montant approuvé : la ligne est donc
 * une borne prouvée, pas une estimation.
 *
 * `OCTETS_TEXTE_CONTROLE_VISION_MAX` est MESURÉ sur le vrai chemin
 * (`apps/web/test/r3-controle-vision-db.test.ts`, registre publié, produit
 * épinglé à un composant, une sortie) :
 *
 *   requête quality.visual envoyée (pack 02-PROMPTS)   octets texte  blocs  borne
 *   1 sortie, 1 composant (recette L6-B)                4 860         5      0,089604 $
 *
 * Choisi avec une marge ×4,9 · 24 000 octets (le même nombre que le budget de
 * contexte du résolveur, désormais en OCTETS donc en borne stricte) : ligne de
 * 0,147024 $ par image au tarif `claude-sonnet-5`. Une requête plus lourde est
 * refusée avant l'envoi et la sortie part en revue humaine. Le test échoue si
 * la mesure dépasse la moitié de la marge (×2).
 */
export const OPERATION_CONTROLE_VISION = 'controle:vision';
export const PROFIL_CONTROLE_VISION = 'controle_visuel' as const;
export const OCTETS_TEXTE_CONTROLE_VISION_MAX = 24_000;
/** 2 blocs système (politique, consignes), le message, l'image, le texte. */
export const BLOCS_CONTROLE_VISION_PAR_IMAGE = 5;
export const JETONS_SORTIE_CONTROLE_VISION = JETONS_SORTIE_MAX_PROPOSITION;

/** Borne d'un contrôle visuel PAR IMAGE contrôlée, micro-dollars entiers, au tarif de `modele`. */
export function borneControleVisionParImageMicros(modele: string): number {
  const entree = JETONS_CADRE_REQUETE + BLOCS_CONTROLE_VISION_PAR_IMAGE * JETONS_CADRE_BLOC + OCTETS_TEXTE_CONTROLE_VISION_MAX + VISION_JETONS_IMAGE_MAX;
  return Math.ceil(costOfTokens(modele, entree, JETONS_SORTIE_CONTROLE_VISION) * 1_000_000 - 1e-6);
}

/** Une ligne de production (envoyée au fournisseur média) · tout sauf le contrôle visuel. */
export function estLigneDeProduction(l: { profil: string }): boolean {
  return l.profil !== PROFIL_CONTROLE_VISION;
}

/**
 * Ajoute (ou non) la ligne du contrôle visuel à des lignes de production.
 * `actif` vaut vrai par défaut (décision du propriétaire) ; une ligne par
 * devis, une unité par IMAGE produite. Sans image produite, rien à contrôler.
 * Les totaux rendus incluent la ligne · 0 crédit (le prix en crédits de
 * l'offre ne change pas), son montant en dollars réels.
 */
export function avecControleVision(
  lignes: readonly LigneDevis[],
  o: { actif?: boolean | null; modele: string },
): { lignes: LigneDevis[]; totalCredits: number; totalUsdMicros: number } {
  const production = lignes.filter(estLigneDeProduction);
  const images = production.filter((l) => l.profil === 'image_generation').reduce((s, l) => s + l.unites, 0);
  const out = [...production];
  if (o.actif !== false && images > 0) {
    out.push({
      operation: OPERATION_CONTROLE_VISION, nature: 'generation', profil: PROFIL_CONTROLE_VISION, unites: images, credits: 0,
      usdMicros: borneControleVisionParImageMicros(o.modele), inclus: true, natureCout: 'borne', motifEstimation: null,
    });
  }
  return {
    lignes: out,
    totalCredits: out.reduce((s, l) => s + l.credits * l.unites, 0),
    totalUsdMicros: out.reduce((s, l) => s + l.usdMicros * l.unites, 0),
  };
}

/**
 * La ligne du contrôle visuel va-t-elle au devis ? Activée par défaut
 * (décision du propriétaire), sauf si la personne l'a décochée (`demande`
 * strictement `false`). Jamais annoncée quand elle ne peut pas s'exécuter :
 * sans fournisseur de vision configuré, ou hors du parcours image (seul
 * `controlerMediaPour` déclenche aujourd'hui le contrôle visuel d'une sortie).
 */
export function controleVisionActif(a: { demande: unknown; fournisseurVision: boolean; devisImage: boolean }): boolean {
  return a.demande !== false && a.fournisseurVision && a.devisImage;
}

/** La ligne de contrôle visuel APPROUVÉE d'un devis (ou d'un instantané de job) · `null` si absente ou illisible. */
export function controleVisionApprouve(lignes: unknown): { unites: number; usdMicros: number; totalUsdMicros: number } | null {
  if (!Array.isArray(lignes)) return null;
  const l = (lignes as Array<Partial<LigneDevis> | null>).find((x) => x?.operation === OPERATION_CONTROLE_VISION && x?.profil === PROFIL_CONTROLE_VISION);
  if (!l || !Number.isInteger(l.unites) || !Number.isInteger(l.usdMicros) || l.unites! <= 0 || l.usdMicros! <= 0) return null;
  return { unites: l.unites!, usdMicros: l.usdMicros!, totalUsdMicros: l.unites! * l.usdMicros! };
}

/** Libellé d'une ligne dans un devis · ce que la personne lit. */
export function libelleLigneDevis(l: Pick<LigneDevis, 'operation' | 'profil' | 'unites'>): string {
  if (l.profil === PROFIL_CONTROLE_VISION) return `Contrôle visuel · ${l.unites} image${l.unites > 1 ? 's' : ''}`;
  if (l.profil === 'image_generation') return `Image · ${l.operation}`;
  if (l.profil === 'animation') return `Animation · ${l.operation}`;
  if (l.profil === 'calcul') return `Calcul · ${l.operation}`;
  return l.operation;
}

/**
 * Le total d'un devis dit « maximum » seulement si TOUTES ses lignes sont des
 * bornes ; sinon « estimation · maximum non garanti », avec la raison. Une
 * ligne écrite avant R3 (sans `natureCout`) compte comme estimation.
 */
export function qualifierDevis(lignes: unknown): QualificationTotal {
  const ls = Array.isArray(lignes) ? (lignes as Array<Partial<LigneDevis>>) : [];
  return qualifierTotal(ls.map((l) => ({
    nom: libelleLigneDevis({ operation: String(l.operation ?? '?'), profil: (l.profil ?? 'calcul') as ProfilLigne, unites: Number(l.unites ?? 1) }),
    natureCout: l.natureCout,
    motifEstimation: l.natureCout === 'borne' ? null : (l.motifEstimation ?? 'devis antérieur à la qualification des montants'),
  })));
}

/** Une ligne telle que l'écran la montre · libellé, montant total, nature, motif. */
export interface LigneDevisVue { libelle: string; usdMicros: number; natureCout: NatureCout; motifEstimation: string | null }

/** Les lignes d'un devis stocké, prêtes à afficher (devis antérieurs à R3 compris : « estimation »). */
export function vueLignesDevis(lignes: unknown): LigneDevisVue[] {
  const ls = Array.isArray(lignes) ? (lignes as Array<Partial<LigneDevis>>) : [];
  return ls.map((l) => {
    const unites = Number.isInteger(l.unites) ? l.unites! : 1;
    const borne = l.natureCout === 'borne';
    return {
      libelle: libelleLigneDevis({ operation: String(l.operation ?? '?'), profil: (l.profil ?? 'calcul') as ProfilLigne, unites }),
      usdMicros: (Number.isInteger(l.usdMicros) ? l.usdMicros! : 0) * unites,
      natureCout: borne ? 'borne' : 'estimation',
      motifEstimation: borne ? null : (l.motifEstimation ?? 'devis antérieur à la qualification des montants'),
    };
  });
}

/**
 * La phrase du coût fournisseur d'un devis. « au plus » seulement pour une
 * borne, arrondie au CENTIME SUPÉRIEUR (un maximum affiché ne descend jamais
 * sous le maximum réel) ; sinon « estimation · maximum non garanti » et la
 * raison.
 */
export function phraseCoutDevis(usdMicros: number, q: QualificationTotal): string {
  const m = Math.max(0, Math.trunc(usdMicros));
  if (q.nature === 'borne') return `${(Math.ceil(m / 10_000) / 100).toFixed(2).replace('.', ',')} $ au plus de coût fournisseur`;
  return `${(m / 1_000_000).toFixed(2).replace('.', ',')} $ de coût fournisseur · ${q.libelle}${q.raison ? ` (${q.raison})` : ''}`;
}

/** Le libellé de la case « contrôle visuel » · le prix est dit AVANT le clic. */
export function libelleCaseControleVision(borneParImageUsdMicros: number): string {
  return `Contrôle visuel de l’image livrée · ${(Math.ceil(borneParImageUsdMicros / 10_000) / 100).toFixed(2).replace('.', ',')} $ au plus par image, ajouté au devis · décocher pour s’en passer`;
}
