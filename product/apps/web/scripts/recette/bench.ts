/**
 * Recette Studios · E2 · `recette:bench` · le benchmark (pas 2) sous le
 * budget d'essai CUMULATIF (15 $ au total, registre `registre.ts`).
 *
 *   pnpm --filter @tiktrends/web recette:bench -- --reel --budget-usd <X> --sortie /sorties/benchmark
 *   pnpm --filter @tiktrends/web recette:bench -- --plan     (aucun appel, transmis tel quel)
 *
 * Enveloppe de `scripts/bench-studios.ts`, qui n'est pas modifié : en mode
 * `--reel`, AVANT de le lancer,
 *  · cohérence registre/base (`lireEtatEssai`) ;
 *  · `antérieur + réglé + incertain + budget X ≤ 15 $`, sinon refus sans appel ;
 *  · le registre est écrit, puis `AI_SPEND_CAP_USD` du processus enfant est
 *    posé à « ce que la base compte + X » (le benchmark revérifie lui-même
 *    « budget ≤ reste du plafond » et s'arrête avant chaque appel qui ne tient
 *    pas) ;
 *  · après coup (y compris en échec), le registre absorbe les lignes nées.
 */

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionDepenseEssai, type BilanBudgetEssai } from '@tiktrends/core';
import { lireMontantUsd, masquerSecrets, usdAffiche, verifierCibleRecette, type Env } from './regles';
import { cloreEssai, engagerEssai, lireEtatEssai, plafondProcessusUsd, resoudreDossier, texteBilan } from './registre';

export type DecisionBench =
  | { ok: true; reel: false }
  | { ok: true; reel: true; budgetMicros: number; capProcessusUsd: number }
  | { ok: false; raison: string };

/** Pur · la campagne réelle peut-elle partir, et sous quel plafond de processus ? */
export function deciderBench(argv: readonly string[], b: BilanBudgetEssai, depenseFenetreUsd: number): DecisionBench {
  if (!argv.includes('--reel')) return { ok: true, reel: false };
  const i = argv.indexOf('--budget-usd');
  const brut = i >= 0 ? argv[i + 1] : undefined;
  const m = lireMontantUsd(brut);
  if (m === null || m <= 0) return { ok: false, raison: `--budget-usd attendu en mode réel (le restant affiché par recette:budget est ${usdAffiche(b.restantMicros)}).` };
  const d = decisionDepenseEssai(b, m);
  if (!d.ok) return { ok: false, raison: d.message };
  return { ok: true, reel: true, budgetMicros: m, capProcessusUsd: plafondProcessusUsd(depenseFenetreUsd, m) };
}

async function main(env: Env, argv: readonly string[]): Promise<number> {
  const cible = verifierCibleRecette(env);
  if (!cible.ok) { console.error(`✗ Benchmark REFUSÉ · rien n’a été appelé\n${cible.raisons.map((r) => `  - ${r}`).join('\n')}`); return 2; }
  const dossier = resoudreDossier(env);
  const etat = await lireEtatEssai(dossier);
  if (!etat.ok) { console.error(`✗ Benchmark REFUSÉ · ${etat.raison}`); return 2; }
  const d = deciderBench(argv, etat.bilan, etat.depenseFenetreUsd);
  if (!d.ok) { console.error(`✗ Benchmark REFUSÉ · rien n’a été appelé\n  - ${d.raison}`); return 2; }
  const enfantEnv: NodeJS.ProcessEnv = { ...process.env };
  if (d.reel) {
    engagerEssai(dossier, etat, 'recette:bench', d.budgetMicros);
    enfantEnv.AI_SPEND_CAP_USD = String(d.capProcessusUsd);
    console.log(`Budget de la campagne · ${usdAffiche(d.budgetMicros)} au plus · plafond du processus ${d.capProcessusUsd} $ (déjà compté en base ${etat.depenseFenetreUsd} $).`);
  }
  const bench = join(dirname(fileURLToPath(import.meta.url)), '..', 'bench-studios.ts');
  const code = await new Promise<number>((ok) => {
    const p = spawn(process.execPath, [...process.execArgv, bench, ...argv.filter((a) => a !== '--')], { env: enfantEnv, stdio: 'inherit' });
    p.on('exit', (c) => ok(c ?? 1));
    p.on('error', () => ok(1));
  });
  if (d.reel) {
    const b = await cloreEssai(dossier, 'recette:bench').catch(() => null);
    const e = b ? await lireEtatEssai(dossier) : null;
    console.log(e && e.ok ? texteBilan(e.registre, e.bilan) : 'Registre NON relu après la campagne · lance recette:budget.');
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.env, process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('✗', masquerSecrets((e as Error).message, process.env)); process.exit(1); });
}
