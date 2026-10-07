/**
 * Commande explicite · mesurer la clarté des scènes des publicités composées
 * AVANT la mesure, et la ranger dans leur recette.
 *
 * ── Pourquoi un script ───────────────────────────────────────────────────────
 *
 * Ce rattrapage se faisait au premier affichage (`GET /api/ad/<id>`), qui
 * réécrivait la recette de la pub · une consultation qui écrit (#125). Il
 * n'est plus fait au GET (chantier L0, BASE-03) · une pub non mesurée se rend
 * avec les voiles d'avant. Ce script est le GESTE qui le remplace.
 *
 * ── Ce qu'il fait, et ne fera jamais ─────────────────────────────────────────
 *
 * · Annonce d'abord combien de publicités attendent leur mesure
 *   (`compterMesuresManquantes`) · sans confirmation, il s'arrête là et
 *   n'écrit RIEN.
 * · Avec confirmation, traite UN lot borné (défaut 100, au plus 500) via
 *   `rattraperMesures` (lib/scene-light.ts) · télécharge chaque scène
 *   (`safeFetch`, adresses internes refusées), lit ses pixels (`sharp`), et
 *   fusionne `{ light }` dans la recette, côté SQL.
 * · Idempotent et rejouable · ne vise que les recettes SANS clé `light`, et
 *   la condition est reposée dans l'UPDATE. Une mesure ratée est rangée
 *   `null` (comptée comme faite, comme à la génération). Relancer traite le
 *   lot suivant, jusqu'à « 0 restante ».
 * · Aucun appel de modèle, aucune dépense IA, rien de facturé · une lecture de
 *   pixels par scène. Aucun secret en dur · l'URL vient de l'environnement.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 * Depuis `product/apps/web` (tsx est fourni par `@tiktrends/workers`, présent
 * dans l'image workers avec tout le dépôt) :
 *
 *   # 1 · compter, sans rien écrire
 *   DATABASE_URL='postgres://…' npx tsx scripts/rattraper-mesures.ts
 *
 *   # 2 · lancer un lot, confirmé
 *   DATABASE_URL='postgres://…' \
 *   RATTRAPER_MESURES_CONFIRM=oui-rattraper-les-mesures \
 *   RATTRAPER_MESURES_LOT=200 \
 *   npx tsx scripts/rattraper-mesures.ts
 *
 * Le garde (`decider`) est pur et éprouvé par `test/l0-rattraper-mesures.test.ts`.
 */

import { fileURLToPath } from 'node:url';

/** La phrase à poser pour autoriser l'écriture · rien d'autre ne passe. */
export const CONFIRMATION = 'oui-rattraper-les-mesures';
/** Taille d'un lot sans précision. */
export const LOT_DEFAUT = 100;
/** Au-delà, on découpe · une scène se télécharge en quelques secondes au plus. */
export const LOT_MAX = 500;

export interface EnvRattrapage {
  DATABASE_URL?: string;
  RATTRAPER_MESURES_CONFIRM?: string;
  RATTRAPER_MESURES_LOT?: string;
}

export type Decision =
  | { ok: false; raison: string }
  | { ok: true; ecrire: boolean; lot: number };

/**
 * Le garde · pur, sans base ni réseau.
 *
 * Refuse sans `DATABASE_URL` et sur un lot illisible ou hors borne. Sans la
 * confirmation EXACTE, autorise seulement le comptage (`ecrire: false`).
 */
export function decider(env: EnvRattrapage): Decision {
  if (!env.DATABASE_URL?.trim()) return { ok: false, raison: 'DATABASE_URL absente · rien à mesurer.' };
  let lot = LOT_DEFAUT;
  const brut = env.RATTRAPER_MESURES_LOT?.trim();
  if (brut) {
    if (!/^\d+$/.test(brut)) return { ok: false, raison: `Lot illisible « ${brut} » · attendu un entier entre 1 et ${LOT_MAX}.` };
    lot = Number(brut);
    if (lot < 1 || lot > LOT_MAX) return { ok: false, raison: `Lot hors borne (${lot}) · attendu entre 1 et ${LOT_MAX}.` };
  }
  return { ok: true, ecrire: env.RATTRAPER_MESURES_CONFIRM === CONFIRMATION, lot };
}

async function main(): Promise<number> {
  const d = decider(process.env as EnvRattrapage);
  if (!d.ok) {
    console.error(`✗ Rattrapage refusé · ${d.raison}`);
    return 1;
  }
  // Import paresseux · `@tiktrends/db` ouvre la connexion à l'import, et le
  // garde doit pouvoir refuser avant.
  const { compterMesuresManquantes, rattraperMesures } = await import('../lib/scene-light');
  const restantes = await compterMesuresManquantes();
  console.log(`${restantes} publicité(s) composée(s) avant la mesure attendent leur relevé.`);
  if (!restantes) return 0;
  if (!d.ecrire) {
    console.log(`Rien écrit · pose RATTRAPER_MESURES_CONFIRM=${CONFIRMATION} pour traiter un lot de ${Math.min(d.lot, restantes)}.`);
    return 0;
  }
  const r = await rattraperMesures({ limite: d.lot });
  const apres = await compterMesuresManquantes();
  console.log(`✓ Lot traité · ${r.candidates} candidate(s), ${r.mesurees} mesurée(s), ${r.echecs} sans mesure (rangée null) · ${apres} restante(s).`);
  return 0;
}

// N'exécute rien à l'import (le test ne charge que le garde).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code), (e) => { console.error('✗', (e as Error).message); process.exit(1); });
}
