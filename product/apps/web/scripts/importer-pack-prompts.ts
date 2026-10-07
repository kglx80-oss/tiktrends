/**
 * Commande explicite · importer le pack de prompts Studios en BROUILLON.
 *
 * ── Ce qu'elle fait ──────────────────────────────────────────────────────────
 *
 * · Mode « importer » (défaut) · lit le pack EMBARQUÉ (`lib/studios/prompts/
 *   pack-embarque.ts`, copie octet pour octet de `docs/studios-v2/`), le valide
 *   (noyau `packages/core/src/prompts/pack.ts`), puis calcule le plan d'import
 *   face au registre (`studio_prompt_versions`). Sans confirmation, il AFFICHE
 *   le plan et n'écrit RIEN. Avec la confirmation exacte, il écrit les
 *   brouillons dans UNE transaction, avec un événement d'audit. Rejouable : un
 *   second passage ne crée rien. Même clé et même version avec une autre
 *   empreinte : conflit, et RIEN n'est écrit (jamais d'écrasement).
 * · Mode « embarquer » · régénère `pack-embarque.ts` depuis `docs/studios-v2/`.
 *   C'est le seul moyen de faire entrer une correction du pack source dans
 *   l'application : l'image Docker est construite depuis `product/`, qui ne
 *   contient pas `docs/`. Aucune base n'est lue ni écrite dans ce mode.
 *
 * Aucun appel de modèle, aucune dépense, aucune activation : un import ne
 * publie jamais une release.
 *
 * ── Usage (depuis `product/apps/web`, tsx fourni par `@tiktrends/workers`) ──
 *
 *   # plan seul, rien d'écrit
 *   DATABASE_URL='postgres://…' npx tsx scripts/importer-pack-prompts.ts
 *
 *   # import confirmé
 *   DATABASE_URL='postgres://…' IMPORTER_PACK_CONFIRM=oui-importer-le-pack-en-brouillon \
 *     npx tsx scripts/importer-pack-prompts.ts
 *
 *   # régénérer la copie embarquée après une correction de docs/studios-v2
 *   IMPORTER_PACK_MODE=embarquer npx tsx scripts/importer-pack-prompts.ts
 *
 * Le garde (`decider`) est pur et éprouvé par `test/l2-importer-script.test.ts`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La phrase à poser pour autoriser l'écriture · rien d'autre ne passe. */
export const CONFIRMATION = 'oui-importer-le-pack-en-brouillon';

export interface EnvImport {
  DATABASE_URL?: string;
  IMPORTER_PACK_CONFIRM?: string;
  IMPORTER_PACK_MODE?: string;
}

export type Decision =
  | { ok: false; raison: string }
  | { ok: true; mode: 'embarquer' }
  | { ok: true; mode: 'importer'; ecrire: boolean };

/**
 * Le garde · pur. Refuse un mode inconnu et, pour l'import, l'absence de
 * `DATABASE_URL`. Sans la confirmation EXACTE, l'import se limite au plan.
 */
export function decider(env: EnvImport): Decision {
  const mode = (env.IMPORTER_PACK_MODE ?? 'importer').trim() || 'importer';
  if (mode === 'embarquer') return { ok: true, mode: 'embarquer' };
  if (mode !== 'importer') return { ok: false, raison: `Mode inconnu « ${mode} » · attendu « importer » ou « embarquer ».` };
  if (!env.DATABASE_URL?.trim()) return { ok: false, raison: 'DATABASE_URL absente · aucun registre à lire ni à écrire.' };
  return { ok: true, mode: 'importer', ecrire: env.IMPORTER_PACK_CONFIRM === CONFIRMATION };
}

/* -------------------------------------------------------------------------- */
/*  Mode « embarquer »                                                        */
/* -------------------------------------------------------------------------- */

const ICI = dirname(fileURLToPath(import.meta.url));
/** `product/apps/web/scripts` → `docs/studios-v2` du dépôt. */
export const DOSSIER_SOURCE = join(ICI, '..', '..', '..', '..', 'docs', 'studios-v2');
export const CIBLE_EMBARQUE = join(ICI, '..', 'lib', 'studios', 'prompts', 'pack-embarque.ts');
export const FICHIERS_EMBARQUES = {
  prompts: '02-PROMPTS.json',
  contrats: '03-CONTRATS.schema.json',
  exemples: '08-EXEMPLES-CONTRATS.json',
  benchmark: '09-BENCHMARK.json',
} as const;

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

/** Identifiants d'exigences de `04-RECETTE.csv` · la première colonne, sans l'en-tête. */
export function idsRecette(csv: string): string[] {
  return csv.split('\n').slice(1).map((l) => l.split(',')[0]!.trim()).filter(Boolean);
}

/** Le texte du module généré · déterministe (même entrée, même sortie). */
export function moduleEmbarque(dossier: string): string {
  const morceaux: string[] = [];
  for (const [nom, fichier] of Object.entries(FICHIERS_EMBARQUES)) {
    const texte = readFileSync(join(dossier, fichier), 'utf8');
    morceaux.push(`  ${nom}: { fichier: ${JSON.stringify(fichier)}, sha256: ${JSON.stringify(sha256(texte))}, texte: ${JSON.stringify(texte)} },`);
  }
  const recette = readFileSync(join(dossier, '04-RECETTE.csv'), 'utf8');
  return [
    '/**',
    ' * GÉNÉRÉ par `scripts/importer-pack-prompts.ts` (IMPORTER_PACK_MODE=embarquer) · ne pas éditer à la main.',
    ' *',
    ' * Copie octet pour octet de `docs/studios-v2/` : l’image Docker est construite depuis `product/`, qui',
    ' * ne contient pas `docs/`. Le serveur et le script d’import lisent CETTE copie ; la garde',
    ' * `test/l2-pack-embarque.test.ts` échoue dès qu’elle diffère du dossier source.',
    ' */',
    'export interface FichierEmbarque { readonly fichier: string; readonly sha256: string; readonly texte: string }',
    '',
    'export const PACK_EMBARQUE: {',
    `  readonly ${Object.keys(FICHIERS_EMBARQUES).join(': FichierEmbarque; readonly ')}: FichierEmbarque;`,
    '  readonly recetteIds: readonly string[];',
    '} = {',
    ...morceaux,
    `  recetteIds: ${JSON.stringify(idsRecette(recette))},`,
    '};',
    '',
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/*  Exécution                                                                 */
/* -------------------------------------------------------------------------- */

async function main(): Promise<number> {
  const d = decider(process.env as EnvImport);
  if (!d.ok) {
    console.error(`✗ Import refusé · ${d.raison}`);
    return 1;
  }
  if (d.mode === 'embarquer') {
    writeFileSync(CIBLE_EMBARQUE, moduleEmbarque(DOSSIER_SOURCE), 'utf8');
    console.log(`✓ Copie embarquée régénérée · ${CIBLE_EMBARQUE}`);
    return 0;
  }
  // Import paresseux · `@tiktrends/db` ouvre la connexion à l'import, le garde refuse avant.
  const { planImportPack, importerPack, ACTEUR_SCRIPT } = await import('../lib/studios/prompts/depot-prompts');
  const plan = await planImportPack();
  if (!plan.ok) {
    console.error('✗ Pack ou registre en conflit · rien n’est écrit.');
    for (const c of plan.constats) console.error(`  ${c.code} · ${c.cible} · ${c.message}`);
    return 1;
  }
  console.log(`Plan · ${plan.aCreer.length} brouillon(s) à créer, ${plan.dejaPresentes.length} déjà présent(s) à l’identique.`);
  if (!d.ecrire) {
    console.log(`Rien écrit · pose IMPORTER_PACK_CONFIRM=${CONFIRMATION} pour importer.`);
    return 0;
  }
  const r = await importerPack(ACTEUR_SCRIPT());
  if (!r.ok) {
    console.error('✗ Import refusé · rien n’est écrit.');
    for (const c of r.constats) console.error(`  ${c.code} · ${c.cible} · ${c.message}`);
    return 1;
  }
  console.log(`✓ Import terminé · ${r.crees} brouillon(s) créé(s), ${r.dejaPresentes} déjà présent(s). Aucune release n’est activée.`);
  return 0;
}

// N'exécute rien à l'import (le test ne charge que le garde).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code), (e) => { console.error('✗', (e as Error).message); process.exit(1); });
}
