import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decider } from '../scripts/bench-studios';
import { executerBench } from '../scripts/recette/bench';
import { FICHIER_REGISTRE, ecrireRegistre, lireRegistre, registreVierge } from '../scripts/recette/registre';
import { sousVerrou } from '../scripts/recette/verrou';

/**
 * R6 · la campagne RÉELLE du benchmark (`bench:studios --reel`, et son
 * enveloppe `recette:bench`) lit l'interrupteur de plateforme `benchmark_reel`
 * (F1, coupé par défaut). Le défaut réparé : seule l'approbation ADMIN le
 * lisait ; la commande, elle, partait sans lui dès que le budget était
 * approuvé.
 *
 * On lit des RÉSULTATS : décision du garde, code de sortie et phrase de la
 * VRAIE commande lancée en processus enfant (tsx, aucune base joignable, aucun
 * appel), registre sur disque (aucun engagement écrit), lanceur jamais appelé.
 */

const LOCAL = { DATABASE_URL: 'postgres://recette:x@127.0.0.1:1/tiktrends_recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1' };
const OUVERT = { STUDIOS_CAPACITES_GENERALES: 'benchmark_reel' };
const PHRASE = '« Benchmark réel » · non activé sur cette plateforme.';
const dossiers: string[] = [];
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });

describe('bench:studios --reel · garde de l’interrupteur benchmark_reel', () => {
  it('coupé par défaut ⇒ refus nommé ; ouvert par STUDIOS_CAPACITES_GENERALES ⇒ la suite des gardes décide', () => {
    const coupe = decider(['--reel', '--budget-usd', '3'], LOCAL, 'production');
    expect(coupe, 'la campagne réelle part sans l’interrupteur benchmark_reel').toMatchObject({ ok: false });
    if (!coupe.ok) {
      expect(coupe.raison).toContain(PHRASE);
      expect(coupe.raison).toContain('STUDIOS_CAPACITES_GENERALES=benchmark_reel');
    }
    expect(decider(['--reel', '--budget-usd', '3'], { ...LOCAL, ...OUVERT }, 'production')).toMatchObject({ ok: true, mode: 'reel' });
    // Coupure globale : l'emporte sur la généralisation.
    expect(decider(['--reel', '--budget-usd', '3'], { ...LOCAL, ...OUVERT, STUDIOS_CAPACITES_COUPEES: 'benchmark_reel' }, 'production')).toMatchObject({ ok: false });
    // Un espace pilote n'ouvre pas une capacité de plateforme.
    expect(decider(['--reel', '--budget-usd', '3'], { ...LOCAL, STUDIOS_ESPACES_PILOTES: 'e5ec0000-0000-4000-8000-00000000e001', STUDIOS_CAPACITES_PILOTES: 'benchmark_reel' }, 'production')).toMatchObject({ ok: false });
    // Les modes sans dépense ne lisent pas l'interrupteur.
    expect(decider(['--plan'], {}, 'production')).toMatchObject({ ok: true, mode: 'plan' });
  });

  it('la VRAIE commande, interrupteur coupé ⇒ code 2, la phrase, rien d’appelé', () => {
    const WEB = process.cwd();
    const CHARGEUR = pathToFileURL(join(WEB, 'scripts', 'bench-studios-chargeur.mjs')).href;
    const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...LOCAL } as unknown as NodeJS.ProcessEnv;
    const r = spawnSync(process.execPath, ['--import', 'tsx', '--import', CHARGEUR, join(WEB, 'scripts', 'bench-studios.ts'), '--reel', '--budget-usd', '1'], {
      cwd: join(WEB, '..', 'workers'), env, encoding: 'utf8', timeout: 120_000,
    });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(2);
    expect(r.stderr).toContain(PHRASE);
  }, 150_000);
});

describe('recette:bench --reel · refus AVANT tout engagement au registre', () => {
  const ENV = { TIKTRENDS_ENV: 'recette', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', AI_SPEND_CAP_USD: '15', DATABASE_URL: 'postgres://recette:x@127.0.0.1:5432/tiktrends_recette' };
  const preparer = async () => {
    const d = mkdtempSync(join(tmpdir(), 'r6-bench-'));
    dossiers.push(d);
    await sousVerrou(d, (v) => ecrireRegistre(d, registreVierge(new Date('2026-10-09T09:00:00Z')), v));
    return d;
  };

  it('coupé ⇒ code 2, aucun engagement écrit, campagne jamais lancée ; ouvert ⇒ engagée puis lancée', async () => {
    const d = await preparer();
    const dit: string[] = [];
    let lancee = 0;
    const lecteur = async () => ({ lignes: [], base: 'recette@1', depenseFenetreUsd: 0 });
    const code = await executerBench({ env: { ...ENV, RECETTE_REGISTRE: d }, argv: ['--reel', '--budget-usd', '2'], lecteur, dire: (l) => dit.push(l), lancer: async () => { lancee++; return { code: 0, signal: null }; } });
    expect(code, 'recette:bench --reel n’a pas refusé sans l’interrupteur benchmark_reel').toBe(2);
    expect(lancee, 'la campagne réelle a été lancée sans l’interrupteur').toBe(0);
    expect(Object.keys(lireRegistre(readFileSync(join(d, FICHIER_REGISTRE), 'utf8'))!.engagements), 'un engagement a été écrit pour une campagne refusée').toEqual([]);
    expect(dit.join('\n')).toContain(PHRASE);

    const ouvert = await executerBench({ env: { ...ENV, ...OUVERT, RECETTE_REGISTRE: d }, argv: ['--reel', '--budget-usd', '2'], lecteur, dire: () => {}, lancer: async () => { lancee++; return { code: 0, signal: null }; } });
    expect(ouvert).toBe(0);
    expect(lancee).toBe(1);
    expect(existsSync(join(d, FICHIER_REGISTRE))).toBe(true);
    expect(Object.values(lireRegistre(readFileSync(join(d, FICHIER_REGISTRE), 'utf8'))!.engagements).map((g) => g.commande)).toEqual(['recette:bench']);
  });
});
