/**
 * Commande du benchmark Studios F01-F24 · `pnpm --filter @tiktrends/web bench:studios -- <options>`.
 *
 * Placée dans `apps/web/scripts/` (comme `importer-pack-prompts.ts`) parce
 * qu'elle exécute le registre RÉEL de l'application (`executerTache`, dépôt
 * des releases, barrière de dépense) : un outil hors de `apps/web` devrait
 * recopier ou réexporter ces modules serveur.
 *
 * ── Modes ────────────────────────────────────────────────────────────────────
 *
 *   --plan                 devis agrégé, par cas et total · aucun appel, aucune écriture
 *   (défaut)               campagne SIMULÉE de bout en bout · recette locale seulement
 *                          (STUDIOS_PROMPTS_RECETTE_LOCALE=1 et base 127.0.0.1/localhost)
 *   --reel --budget-usd X  campagne RÉELLE · refusée tant que budget ≥ devis, budget ≤ reste
 *                          du plafond AI_SPEND_CAP_USD et approbation ADMIN ne sont pas réunis
 *   --jeu                  régénère le jeu synthétique et son manifeste (aucune base)
 *
 *   --cas F04,F17          sélection de cas (une campagne partielle n'approuve jamais une release)
 *   --release <uuid>       release à évaluer : publiée, ou en attente (staged) en mode évaluation (défaut : le pointeur)
 *   --sortie <dossier>     racine des preuves (défaut : docs/studios-v2/benchmark)
 *
 * Lancement : `tsx` (fourni par `@tiktrends/workers`) avec `bench-studios-chargeur.mjs`,
 * qui neutralise la garde de bundle `server-only` hors de Next (voir le script du
 * package.json). Codes de sortie : 0 succès, 1 erreur, 2 refus, 3 devis non chiffrable.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_BENCHMARK = join(ICI, '..', '..', '..', '..', 'docs', 'studios-v2', 'benchmark');
export const DOSSIER_JEU = join(DOSSIER_BENCHMARK, 'jeu-synthetique');

export type Decision =
  | { ok: false; raison: string }
  | { ok: true; mode: 'jeu' }
  | { ok: true; mode: 'plan'; cas: string[] | null }
  | { ok: true; mode: 'simule'; cas: string[] | null; sortie: string }
  | { ok: true; mode: 'reel'; cas: string[] | null; sortie: string; budgetBrut: string | null; releaseId: string | null };

const OPTIONS_VALEUR = new Set(['--cas', '--budget-usd', '--release', '--sortie']);
const DRAPEAUX = new Set(['--plan', '--reel', '--jeu']);

/**
 * Le garde · PUR. Reçoit les arguments et l'environnement, ne lit rien.
 * Refuse une option inconnue, deux modes à la fois, un budget hors mode
 * réel, et le simulé hors recette locale.
 */
export function decider(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, environnement: 'test' | 'production'): Decision {
  const vals: Record<string, string> = {};
  const drapeaux = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (DRAPEAUX.has(a)) { drapeaux.add(a); continue; }
    if (OPTIONS_VALEUR.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { ok: false, raison: `Valeur attendue après ${a}.` };
      vals[a] = v; i++; continue;
    }
    return { ok: false, raison: `Option inconnue « ${a} ».` };
  }
  if (drapeaux.size > 1) return { ok: false, raison: `Un seul mode à la fois : ${[...drapeaux].join(', ')}.` };
  const mode = drapeaux.has('--plan') ? 'plan' : drapeaux.has('--reel') ? 'reel' : drapeaux.has('--jeu') ? 'jeu' : 'simule';
  if (vals['--budget-usd'] !== undefined && mode !== 'reel') return { ok: false, raison: '--budget-usd ne vaut qu’avec --reel : rien ne se dépense hors du mode réel.' };
  if (vals['--release'] !== undefined && mode !== 'reel') return { ok: false, raison: '--release ne vaut qu’avec --reel (le simulé publie sa release de recette locale).' };
  const cas = vals['--cas'] ? vals['--cas'].split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) : null;
  const sortie = resolve(vals['--sortie'] ?? DOSSIER_BENCHMARK);
  if (mode === 'jeu') return { ok: true, mode };
  if (mode === 'plan') return { ok: true, mode, cas };
  if (!env.DATABASE_URL?.trim()) return { ok: false, raison: 'DATABASE_URL absente · le registre se lit en base.' };
  if (mode === 'simule') {
    if (environnement !== 'test') return { ok: false, raison: 'La campagne simulée ne tourne qu’en recette locale : STUDIOS_PROMPTS_RECETTE_LOCALE=1 et une base 127.0.0.1 ou localhost. Un fournisseur simulé ne sert jamais ailleurs.' };
    return { ok: true, mode, cas, sortie };
  }
  return { ok: true, mode: 'reel', cas, sortie, budgetBrut: vals['--budget-usd'] ?? null, releaseId: vals['--release'] ?? null };
}

/**
 * L'exécuteur média réel, ou `null` · PUR (reçoit l'environnement et la
 * fabrique). Sans clé, ou avec la clé de simulation locale, rien n'est branché
 * et tout plan qui génère reste refusé (`EXECUTEUR_NON_BRANCHE`).
 */
export function executeurDepuisEnv<T>(env: Readonly<Record<string, string | undefined>>, fabrique: (apiKey: string) => T): T | null {
  const cle = env.FAL_KEY?.trim();
  if (!cle || /^simule/i.test(cle) || /\s/.test(cle)) return null;
  return fabrique(cle);
}

/* -------------------------------------------------------------------------- */

async function main(): Promise<number> {
  const { environnementPrompts } = await import('../lib/studios/prompts/environnement');
  const d = decider(process.argv.slice(2), process.env, environnementPrompts(process.env));
  if (!d.ok) { console.error(`✗ ${d.raison}`); return 2; }
  const { usdLisible } = await import('@tiktrends/core');

  if (d.mode === 'jeu') {
    const { genererJeu, manifeste, DROITS_SYNTHETIQUES } = await import('../lib/studios/benchmark/jeu-synthetique');
    const jeu = await genererJeu();
    mkdirSync(DOSSIER_JEU, { recursive: true });
    for (const m of jeu.values()) writeFileSync(join(DOSSIER_JEU, m.fichier), m.octets);
    writeFileSync(join(DOSSIER_JEU, 'manifeste.json'), `${JSON.stringify({ format: 'jeu-synthetique-benchmark-studios/1', droits: DROITS_SYNTHETIQUES, medias: manifeste(jeu) }, null, 2)}\n`);
    console.log(`✓ ${jeu.size} médias synthétiques et manifeste écrits dans ${DOSSIER_JEU}`);
    return 0;
  }

  const programme = await import('../lib/studios/benchmark/programme');
  if (d.mode === 'plan') {
    const pd = programme.planEtDevis(d.cas);
    if (!pd.ok) { console.error(`✗ ${pd.refus.map((c) => `${c.code} ${c.message}`).join('\n')}`); return 2; }
    console.log('Devis agrégé du benchmark Studios · aucun appel, aucune écriture');
    for (const c of pd.devis.cas) {
      console.log(`\n${c.cas} · ${c.appels} appel(s) texte, ${c.medias} média(s) · ${usdLisible(c.totalUsdMicros)}`);
      for (const l of c.lignes) console.log(`   ${l.nature.padEnd(6)} ${`${l.etapeId}#${l.sortie + 1}`.padEnd(18)} ${l.cle.padEnd(22)} ${usdLisible(l.usdMicros).padStart(16)}${l.motif ? `  · ${l.motif}` : ''}`);
    }
    if (pd.devis.ok) { console.log(`\nTOTAL · ${usdLisible(pd.devis.totalUsdMicros)} · empreinte ${pd.devis.empreinte}`); return 0; }
    console.log(`\nDevis agrégé REFUSÉ · non chiffrable : ${pd.devis.nonChiffrables.join(', ')}. Chiffrage partiel des autres cas : ${usdLisible(pd.devis.totalPartielUsdMicros)} (ce n’est pas un total).`);
    return 3;
  }

  if (d.mode === 'simule') {
    const r = await programme.lancerCampagneSimulee({ cas: d.cas, racine: d.sortie });
    if (!r.ok) { console.error(`✗ ${r.refus.map((c) => `${c.code} · ${c.message}`).join('\n')}`); return 2; }
    const v = r.resultat.rapport.verdict;
    console.log(`SIMULÉ · ${r.resultat.rapport.cas.length} dossiers dans ${r.resultat.dossier}`);
    console.log(`SIMULÉ · verdict ${v.statut} · invariants ${v.invariants.passes}/${v.invariants.total} · évaluation réelle : non · joint à la release ${r.release.id} (évaluation ${r.evaluationId}, passed=false)`);
    return 0;
  }

  const { adaptateurAnthropicGarde } = await import('../lib/studios/prompts/adaptateur');
  const { genererJeu } = await import('../lib/studios/benchmark/jeu-synthetique');
  const { executeurMediasFal } = await import('../lib/studios/benchmark/executeur-fal');
  const jeu = await genererJeu();
  // Exécuteur image RÉEL (F-A) · seulement avec une vraie clé fal. Le construire n'appelle rien :
  // `lancerCampagneReelle` revérifie budget, devis, plafond et approbation AVANT le premier appel.
  const medias = executeurDepuisEnv(process.env, (apiKey) => executeurMediasFal({ apiKey, fetch: globalThis.fetch, jeu }));
  const r = await programme.lancerCampagneReelle({ budgetBrut: d.budgetBrut, releaseId: d.releaseId, cas: d.cas, adaptateur: adaptateurAnthropicGarde(), medias, racine: d.sortie, jeu });
  if (!r.ok) { console.error(`✗ Campagne réelle REFUSÉE · rien n’a été appelé ni écrit\n${r.refus.map((c) => `  - ${c.code} · ${c.message}`).join('\n')}`); return 2; }
  console.log(`RÉEL · ${r.resultat.dossier} · dépense ${usdLisible(r.resultat.rapport.depenseUsdMicros)} · évaluation réelle : ${r.evaluationReelle ? 'oui' : 'non'}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error('✗', (e as Error).message); process.exit(1); });
}
