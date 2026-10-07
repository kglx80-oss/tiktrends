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
import { FIXED_COSTS } from '../../spend-guard';
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

export interface LigneDevis {
  /** Identifiant du nœud du plan d'impact (`keyframe:s_ouverture`, `composition`…). */
  operation: string;
  nature: NatureNoeud;
  profil: ProfilOperation;
  unites: number;
  credits: number;
  usdMicros: number;
  /** Ligne à 0 crédit · incluse, mais toujours soumise à approbation. */
  inclus: boolean;
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
    lignes.push({ operation: id, nature, profil, unites: 1, credits: tarif.credits, usdMicros: tarif.usdMicros, inclus: tarif.credits === 0 });
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
