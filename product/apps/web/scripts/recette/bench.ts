/**
 * Recette Studios · E2 · `recette:bench` · le benchmark (pas 2) sous le
 * budget d'essai CUMULATIF (15 $ au total, registre `registre.ts`).
 *
 *   pnpm --filter @tiktrends/web recette:bench -- --reel --budget-usd <X> --sortie /sorties/benchmark
 *   pnpm --filter @tiktrends/web recette:bench -- --plan     (aucun appel, transmis tel quel)
 *
 * Enveloppe de `scripts/bench-studios.ts` : en mode `--reel`, AVANT de le
 * lancer,
 *  · interrupteur `benchmark_reel` ouvert (F1, R6 · `refusBenchmarkReel`),
 *    sinon refus sans engagement ni appel ;
 *  · cohérence registre/base (`lireEtatEssai`) ;
 *  · `antérieur + réglé + incertain + budget X ≤ 15 $`, sinon refus sans appel ;
 *  · un ENGAGEMENT de X est écrit au registre sous verrou (relecture,
 *    décision, écriture indivisibles · E3), puis `AI_SPEND_CAP_USD` du
 *    processus enfant est posé à « ce que la base compte + X » (le benchmark
 *    revérifie lui-même « budget ≤ reste du plafond » et s'arrête avant
 *    chaque appel qui ne tient pas) ;
 *  · après coup, l'engagement est RÉGLÉ (lignes nées rattachées), ou
 *    INCERTAIN au maximum si la campagne a été tuée ; un engagement jamais
 *    clos (enveloppe tuée elle-même) reste compté au maximum.
 */

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionDepenseEssai, type BilanBudgetEssai, type IssueEngagement } from '@tiktrends/core';
import { lireMontantUsd, masquerSecrets, usdAffiche, verifierCibleRecette, type Env } from './regles';
import { cloreEssai, engagerEssai, lireEtatEssai, plafondProcessusUsd, resoudreDossier, texteBilan, type LectureBase } from './registre';
import { refusBenchmarkReel } from '../bench-studios';

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

export interface DependancesBench {
  env: Env;
  argv: readonly string[];
  /** Lance la campagne (processus enfant `bench-studios.ts`) · simulé dans les tests. */
  lancer: (env: NodeJS.ProcessEnv) => Promise<{ code: number | null; signal: NodeJS.Signals | null; erreur?: string }>;
  lecteur?: () => Promise<LectureBase>;
  dire?: (l: string) => void;
}

/**
 * La campagne réelle sous la séquence E3 · engagement DURABLE au registre
 * (sous verrou, AVANT tout appel) → campagne → règlement des lignes nées, ou
 * INCERTAIN au maximum si la campagne a été tuée (signal) ou n'a pas pu être
 * suivie. Rend le code de sortie.
 */
export async function executerBench(d: DependancesBench): Promise<number> {
  const dire = d.dire ?? ((l: string) => console.log(l));
  const cible = verifierCibleRecette(d.env);
  if (!cible.ok) { dire(`✗ Benchmark REFUSÉ · rien n’a été appelé\n${cible.raisons.map((r) => `  - ${r}`).join('\n')}`); return 2; }
  // R6 · interrupteur coupé ⇒ refus AVANT tout engagement au registre (rien n'est réservé ni appelé).
  const coupe = d.argv.includes('--reel') ? refusBenchmarkReel(d.env) : null;
  if (coupe) { dire(`✗ Benchmark REFUSÉ · rien n’a été appelé ni engagé\n  - ${coupe}`); return 2; }
  const dossier = resoudreDossier(d.env);
  const etat = await lireEtatEssai(dossier, new Date(), d.lecteur);
  if (!etat.ok) { dire(`✗ Benchmark REFUSÉ · ${etat.raison}`); return 2; }
  const dec = deciderBench(d.argv, etat.bilan, etat.depenseFenetreUsd);
  if (!dec.ok) { dire(`✗ Benchmark REFUSÉ · rien n’a été appelé\n  - ${dec.raison}`); return 2; }
  const enfantEnv = { ...d.env } as NodeJS.ProcessEnv;
  let engagementId: string | null = null;
  if (dec.reel) {
    // Décision REPRISE sous verrou, sur le registre relu : une autre commande a pu engager entre-temps.
    const r = await engagerEssai(dossier, { commande: 'recette:bench', reservationMicros: dec.budgetMicros, lu: etat.lu });
    if (!r.ok) { dire(`✗ Benchmark REFUSÉ · rien n’a été appelé\n  - ${r.raison}`); return 2; }
    engagementId = r.engagement.id;
    const cap = plafondProcessusUsd(r.depenseFenetreUsd, dec.budgetMicros);
    enfantEnv.AI_SPEND_CAP_USD = String(cap);
    dire(`Budget de la campagne · ${usdAffiche(dec.budgetMicros)} au plus, ENGAGÉ au registre (${engagementId}) · plafond du processus ${cap} $ (déjà compté en base ${r.depenseFenetreUsd} $).`);
  }
  const fin = await d.lancer(enfantEnv).catch((e: unknown) => ({ code: null, signal: null, erreur: (e as Error).message }));
  if (engagementId) {
    const issue: IssueEngagement = fin.signal || fin.erreur || fin.code === null
      ? { etat: 'incertain', cause: `campagne interrompue (${fin.signal ?? fin.erreur ?? 'issue inconnue'}) · lignes à rapprocher de la facture` }
      : { etat: 'regle' };
    const c = await cloreEssai(dossier, engagementId, issue, d.lecteur ? { lecteur: d.lecteur } : {}).catch((e: unknown) => ({ ok: false as const, raison: (e as Error).message }));
    if (!c.ok) dire(`Registre NON réglé après la campagne · ${c.raison} · l’engagement reste compté au maximum.`);
    const e = await lireEtatEssai(dossier, new Date(), d.lecteur).catch(() => null);
    dire(e && e.ok ? texteBilan(e.registre, e.bilan) : 'Registre NON relu après la campagne · lance recette:budget.');
  }
  return fin.code ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bench = join(dirname(fileURLToPath(import.meta.url)), '..', 'bench-studios.ts');
  const argv = process.argv.slice(2);
  executerBench({
    env: process.env, argv,
    lancer: (env) => new Promise((ok) => {
      const p = spawn(process.execPath, [...process.execArgv, bench, ...argv.filter((a) => a !== '--')], { env, stdio: 'inherit' });
      p.on('exit', (code, signal) => ok({ code, signal }));
      p.on('error', (e) => ok({ code: null, signal: null, erreur: e.message }));
    }),
    dire: (l) => (l.startsWith('✗') ? console.error : console.log)(masquerSecrets(l, process.env)),
  }).then((c) => process.exit(c), (e) => { console.error('✗', masquerSecrets((e as Error).message, process.env)); process.exit(1); });
}
